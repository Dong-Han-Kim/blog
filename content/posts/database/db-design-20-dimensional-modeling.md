---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 20강 — 차원 모델링'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Warehouse', 'Dimensional Modeling', 'OLAP']
description: 'OLTP 모델과 분석 모델의 차이, Kimball 4단계와 스타 스키마, 팩트 테이블 세 유형, 준가산 측정값과 비율을 분자·분모로 저장하는 이유, 적합 차원과 버스 매트릭스를 다룬다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 20

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '차원 모델링', '스타 스키마', '팩트 테이블', '그레인', '적합 차원', '버스 매트릭스', 'Kimball']
---

# DB 설계 A to Z 20강 — 차원 모델링

지금까지의 모델은 정확한 쓰기를 위한 것이었습니다. 이번 강은 같은 데이터를 읽고 집계하기 위한 모델로 전환합니다.

## 1. OLTP 모델과 분석 모델의 차이

| 항목 | OLTP (정규화 모델) | 분석 (차원 모델) |
|---|---|---|
| 목적 | 정확한 쓰기, 무결성 | 빠르고 쉬운 집계 |
| 구조 | 수십~수백 테이블, 깊은 조인 | 팩트 + 차원, 얕은 조인 |
| 쿼리 | 소수 행 조회·변경 | 대량 행 스캔·집계 |
| 중복 | 최소화 | 차원에서 허용 |
| 사용자 | 애플리케이션 | 분석가, BI 도구, 대시보드 |

KPI 대시보드가 OLTP 테이블을 직접 집계하면, 대시보드 쿼리가 운영 트랜잭션과 경합하고 쿼리가 복잡해집니다. 차원 모델은 이 문제를 구조로 해결합니다.

## 2. Kimball 4단계 설계

1. **업무 프로세스 선택:** 공정 작업 실적
2. **그레인(Grain) 선언:** 팩트 한 행이 무엇을 의미하는가 → "작업자 1명이 1일 동안 1개 블록의 1개 공정에 투입한 기록"
3. **차원 식별:** 날짜, 작업자, 블록, 공정, 협력사
4. **팩트(측정값) 식별:** 투입 시수, 작업 인원, 작업량

**그레인 선언이 가장 중요합니다.** 그레인이 모호하면 같은 테이블에 일 단위와 월 단위 행이 섞여 이중 집계가 발생합니다.

## 3. 스타 스키마

```
                 [dim_date]
                     |
[dim_worker] —— [fact_work] —— [dim_block]
                     |              
               [dim_process]    [dim_vendor]
```
```sql
CREATE TABLE dim_date (
    date_key     INT PRIMARY KEY,         -- 20260917
    full_date    DATE NOT NULL,
    year         SMALLINT NOT NULL,
    quarter      SMALLINT NOT NULL,
    month        SMALLINT NOT NULL,
    week_of_year SMALLINT NOT NULL,
    is_holiday   BOOLEAN NOT NULL,
    shift_calendar VARCHAR(10)            -- 조선소 근무 달력
);

CREATE TABLE dim_block (
    block_sk     BIGINT PRIMARY KEY,      -- SCD Type 2 대리키
    block_id     BIGINT NOT NULL,         -- 원천 시스템 키 (자연키)
    block_name   VARCHAR(20) NOT NULL,
    block_type   VARCHAR(10) NOT NULL,
    ship_no      VARCHAR(10) NOT NULL,    -- 호선을 차원에 펼침 (반정규화)
    ship_type    VARCHAR(20) NOT NULL,
    owner_name   VARCHAR(100) NOT NULL,
    valid_from   DATE NOT NULL,
    valid_to     DATE NOT NULL,
    is_current   BOOLEAN NOT NULL
);

CREATE TABLE fact_work (
    date_key     INT    NOT NULL REFERENCES dim_date,
    worker_sk    BIGINT NOT NULL REFERENCES dim_worker,
    block_sk     BIGINT NOT NULL REFERENCES dim_block,
    process_sk   INT    NOT NULL REFERENCES dim_process,
    vendor_sk    INT    NOT NULL REFERENCES dim_vendor,
    work_order_no VARCHAR(20),            -- 퇴화 차원
    man_hours    NUMERIC(6,2) NOT NULL,
    work_qty     NUMERIC(10,2)
);
```
**차원은 넓고 평평하게**: 호선·선종·선주를 블록 차원에 펼쳐서 조인 한 번으로 모든 분류 기준을 쓸 수 있게 합니다.

```sql
-- 선종별·월별 투입 시수
SELECT b.ship_type, d.year, d.month, SUM(f.man_hours)
FROM fact_work f
JOIN dim_block b ON b.block_sk = f.block_sk
JOIN dim_date  d ON d.date_key = f.date_key
WHERE d.year = 2026
GROUP BY b.ship_type, d.year, d.month;
```

## 4. 스노우플레이크 스키마

차원을 다시 정규화한 형태입니다 (`dim_block → dim_ship → dim_owner`).

| 항목 | 스타 | 스노우플레이크 |
|---|---|---|
| 조인 수 | 적음 | 많음 |
| 차원 저장 공간 | 큼 | 작음 |
| BI 도구 친화성 | 높음 | 낮음 |
| 차원 갱신 | 여러 행 | 한 행 |

차원 테이블은 팩트에 비해 매우 작으므로, **대부분 스타 스키마가 권장**됩니다. 컬럼형 저장소에서는 반복값 압축 효율이 높아 공간 단점이 더 줄어듭니다.

## 5. 팩트 테이블의 세 유형

| 유형 | 그레인 | 예시 | 특징 |
|---|---|---|---|
| 트랜잭션 팩트 | 이벤트 1건 | 작업 실적 | 삽입만, 가장 상세 |
| 주기적 스냅샷 | 기간 말 상태 | 일말 호선별 진척률, 월말 재고 | 기간마다 전체 행 삽입 |
| 누적 스냅샷 | 프로세스 1건의 생애 | 블록 1개의 착수~완료 마일스톤 | 여러 날짜 키, 행이 갱신됨 |

**누적 스냅샷 예시**
```sql
CREATE TABLE fact_block_milestone (
    block_sk           BIGINT PRIMARY KEY,
    fitting_date_key   INT,    -- 취부 완료
    welding_date_key   INT,    -- 용접 완료
    painting_date_key  INT,    -- 도장 완료
    erection_date_key  INT,    -- 탑재
    fitting_to_erection_days INT,
    total_man_hours    NUMERIC(10,2)
);
```
리드타임 분석(공정 간 소요일)은 이 형태가 가장 쉽습니다.

## 6. 측정값의 가산성

| 유형 | 모든 차원으로 합산 | 예시 |
|---|---|---|
| 가산 (Additive) | 가능 | 투입 시수, 작업량 |
| 준가산 (Semi-additive) | 시간 차원으로는 불가 | 재고 수량, 인원 현황 (월말 재고를 12개월 합하면 무의미) |
| 비가산 (Non-additive) | 불가 | 진척률, 단가, 비율 |

**비율은 저장하지 말고 분자와 분모를 저장**합니다.
```sql
-- 나쁜 예: 공정별 진척률 평균의 평균 → 가중치 오류
-- 좋은 예
SELECT SUM(done_tasks)::numeric / NULLIF(SUM(total_tasks), 0) FROM fact_progress_snapshot ...;
```

## 7. 기타 핵심 개념

| 개념 | 설명 |
|---|---|
| 적합 차원 (Conformed Dimension) | 여러 팩트가 공유하는 동일한 차원 → 실적과 검사를 같은 블록·날짜 기준으로 비교 가능 |
| 버스 매트릭스 | 업무 프로세스 × 차원 표로 적합 차원 계획 |
| 퇴화 차원 | 속성 없이 키만 있는 차원 → 팩트에 직접 저장 (작업지시번호) |
| 팩트 없는 팩트 | 측정값 없이 사건 발생만 기록 (교육 참석, 검사 대상 지정) |
| 미상 차원 행 | `-1 = 'Unknown'` 행을 두어 팩트 FK의 NULL 방지 |

**버스 매트릭스 예시**
| 프로세스 \ 차원 | 날짜 | 블록 | 공정 | 작업자 | 협력사 | 감독관 |
|---|---|---|---|---|---|---|
| 작업 실적 | O | O | O | O | O | |
| 검사 | O | O | O | | O | O |
| 진척 스냅샷 | O | O | O | | | |
| 자재 출고 | O | O | | | O | |

## 8. 적재 파이프라인

```
원천 OLTP ──(CDC 또는 증분 추출)──▶ 스테이징
                                      │
                   차원 적재 (SCD 처리, 대리키 발급)
                                      │
                   팩트 적재 (자연키 → 대리키 조회)
                                      │
                   집계/스냅샷 생성 ──▶ 대시보드
```
- **차원 먼저, 팩트 나중**: 팩트가 참조할 대리키가 먼저 존재해야 합니다.
- 늦게 도착한 차원(팩트는 왔는데 차원이 없음)은 미상 행이나 추정 행(inferred member)으로 처리합니다.
- 레이크하우스 환경에서는 같은 설계가 Delta Lake/Iceberg 테이블 위에서 MERGE로 구현됩니다.

## 20강 정리

1. 분석 모델은 팩트와 넓고 평평한 차원으로 구성하며, 그레인 선언이 가장 중요하다.
2. 대부분 스타 스키마가 스노우플레이크보다 낫다.
3. 트랜잭션·주기적 스냅샷·누적 스냅샷 세 팩트 유형을 목적에 맞게 쓴다.
4. 비율은 분자·분모로 저장하고, 준가산 측정값의 시간 합산에 주의한다.
5. 적합 차원과 버스 매트릭스로 여러 프로세스를 일관되게 분석한다.
