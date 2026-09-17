---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 10강 — 반정규화'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'Denormalization', 'PostgreSQL', 'MySQL']
description: '반정규화를 검토하기 전에 확인할 순서, 컬럼·테이블·관계별 기법, 중복을 동기화하는 수단 비교표, 생성 컬럼·복합 FK·집계 테이블 예제와 결정 기록 양식을 정리한다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 10

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '데이터 모델링', '반정규화', '생성 컬럼', '집계 테이블', '구체화 뷰', '복합 FK', 'ON UPDATE CASCADE']
---

# DB 설계 A to Z 10강 — 반정규화

8~9강에서 정규화를 했다면, 이번 편은 근거를 갖고 되돌리는 방법입니다.

## 1. 반정규화란

정규화된 모델에 **의도적으로 중복이나 구조 변경을 도입**해 성능이나 단순성을 얻는 것입니다. 핵심은 "정규화를 안 한 것"과 "정규화한 뒤 근거를 갖고 되돌린 것"이 다르다는 점입니다.

## 2. 반정규화를 검토하기 전에

순서대로 확인합니다.

1. 인덱스로 해결되는가? ([15강](/posts/db-design-15-indexes))
2. 쿼리 재작성으로 해결되는가?
3. 캐시나 조회 전용 복제본으로 해결되는가?
4. 파티셔닝으로 해결되는가? ([16강](/posts/db-design-16-partitioning))
5. **그래도 안 되면** 반정규화

반정규화는 **모든 쓰기 경로에 비용을 추가**하기 때문에 마지막 수단입니다.

## 3. 반정규화 기법

| 분류 | 기법 | 예시 |
|---|---|---|
| 컬럼 | 중복 컬럼 | work_record에 ship_no 추가 (블록 조인 제거) |
| 컬럼 | 파생 컬럼 | block에 progress_pct 저장 |
| 컬럼 | 이력 최신값 컬럼 | block에 last_process_code 저장 |
| 테이블 | 집계 테이블 | 일별·호선별 진척 집계 |
| 테이블 | 테이블 병합 | 1:1 테이블 합치기 |
| 테이블 | 수직 분할 | 자주 안 쓰는 대형 컬럼 분리 |
| 테이블 | 수평 분할 | 최근 데이터와 과거 데이터 분리 (파티셔닝으로 대체 가능) |
| 관계 | 중복 관계 | 손자 테이블이 조부모 FK를 직접 보유 |

## 4. 정합성 보장 수단 비교

반정규화의 진짜 설계 대상은 **"중복을 어떻게 동기화할 것인가"** 입니다.

| 수단 | 일관성 | 쓰기 비용 | 복잡도 | 적합한 경우 |
|---|---|---|---|---|
| 생성 컬럼 (Generated Column) | 즉시, DB 보장 | 낮음 | 낮음 | 같은 행 내 계산 |
| 복합 FK + ON UPDATE CASCADE | 즉시, DB 보장 | 중간 | 낮음 | 부모 값 복사 ([8강](/posts/db-design-08-normalization) 예제) |
| 트리거 | 즉시, DB 보장 | 높음 | 높음 (숨은 로직) | 다른 테이블 집계 |
| 애플리케이션 | 코드 품질에 의존 | 중간 | 중간 | 트랜잭션 경계가 명확할 때 |
| 구체화 뷰 (Materialized View) | 새로 고침 시점 | 새로 고침 시 | 낮음 | 지연 허용 집계 |
| 배치 | 배치 주기 | 배치 시 | 중간 | 대시보드, 리포트 |
| CDC / 이벤트 | 수 초 지연 | 비동기 | 높음 | 시스템 간 복제 |

## 5. 예제 1: 생성 컬럼

```sql
-- PostgreSQL 12+
ALTER TABLE block_process
  ADD COLUMN delay_days INT
  GENERATED ALWAYS AS (actual_date - plan_date) STORED;

-- MySQL 5.7+
ALTER TABLE block_process
  ADD COLUMN delay_days INT
  GENERATED ALWAYS AS (DATEDIFF(actual_date, plan_date)) STORED;
```
같은 행에서 계산되는 파생값은 생성 컬럼이 가장 안전하며, 인덱스도 걸 수 있습니다.

## 6. 예제 2: 중복 컬럼과 복합 FK

작업실적을 호선별로 집계하려면 `work_record → block → ship` 조인이 필요합니다. 실적이 수천만 건이면 부담이 큽니다.

```sql
ALTER TABLE block ADD CONSTRAINT uq_block_ship UNIQUE (block_id, ship_no);

ALTER TABLE work_record ADD COLUMN ship_no VARCHAR(10);
-- 기존 데이터 채운 뒤
ALTER TABLE work_record ALTER COLUMN ship_no SET NOT NULL;
ALTER TABLE work_record
  ADD CONSTRAINT fk_work_block_ship
  FOREIGN KEY (block_id, ship_no) REFERENCES block (block_id, ship_no)
  ON UPDATE CASCADE;
```
`ship_no`는 중복이지만, 복합 FK 덕분에 **블록의 호선과 다른 값이 들어갈 수 없습니다.** 트리거 없이 DB가 정합성을 보장하는 중복입니다.

## 7. 예제 3: 집계 테이블

```sql
CREATE TABLE daily_ship_progress (
    base_date     DATE        NOT NULL,
    ship_no       VARCHAR(10) NOT NULL,
    total_tasks   INT         NOT NULL,
    done_tasks    INT         NOT NULL,
    total_man_hours NUMERIC(12,2) NOT NULL,
    refreshed_at  TIMESTAMP   NOT NULL,
    PRIMARY KEY (base_date, ship_no)
);
```
배치로 갱신합니다. 이미 학습한 **스테이징 적재 → MERGE/UPSERT** 패턴이 그대로 적용됩니다.
```sql
INSERT INTO daily_ship_progress AS t
       (base_date, ship_no, total_tasks, done_tasks, total_man_hours, refreshed_at)
SELECT CURRENT_DATE, b.ship_no,
       COUNT(*), COUNT(bp.actual_date),
       COALESCE(SUM(w.mh), 0), now()
FROM block b
JOIN block_process bp ON bp.block_id = b.block_id
LEFT JOIN (SELECT block_id, process_code, SUM(man_hours) AS mh
           FROM work_record GROUP BY block_id, process_code) w
  ON w.block_id = bp.block_id AND w.process_code = bp.process_code
GROUP BY b.ship_no
ON CONFLICT (base_date, ship_no) DO UPDATE
SET total_tasks     = EXCLUDED.total_tasks,
    done_tasks      = EXCLUDED.done_tasks,
    total_man_hours = EXCLUDED.total_man_hours,
    refreshed_at    = EXCLUDED.refreshed_at;
```
`refreshed_at` 컬럼으로 **데이터가 언제 기준인지 사용자에게 노출**하는 것이 집계 테이블 설계의 필수 요소입니다.

## 8. 반정규화 결정 기록

반정규화는 반드시 문서로 남깁니다. 1년 뒤에는 누구도 이유를 기억하지 못합니다.

| 항목 | 내용 |
|---|---|
| 대상 | work_record.ship_no |
| 문제 | 호선별 실적 집계 쿼리 3.2초 (목표 0.5초) |
| 검토한 대안 | 인덱스 추가(효과 미미), 구체화 뷰(실시간성 부족) |
| 선택 | 중복 컬럼 + 복합 FK |
| 정합성 수단 | FK ON UPDATE CASCADE |
| 비용 | 행당 약 11바이트, 블록의 호선 변경 시 연쇄 갱신 |
| 측정 결과 | 0.3초 |

## 10강 정리

1. 반정규화는 인덱스·쿼리·캐시·파티셔닝 다음의 마지막 수단이다.
2. 설계의 핵심은 중복 자체가 아니라 동기화 수단이다.
3. 가능하면 생성 컬럼, 복합 FK처럼 DB가 보장하는 수단을 우선한다.
4. 집계 테이블에는 기준 시각을 함께 저장한다.
5. 결정 근거와 측정 결과를 기록한다.
