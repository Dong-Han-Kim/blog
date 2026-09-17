---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 25강 — 종합 실습'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Case Study', 'PostgreSQL']
description: '조선소 선행 의장 관리 시스템 하나를 요구사항 분석부터 개념·논리·물리 설계, 보안, 분석 모델, 진화 시나리오, 리뷰까지 관통한다. 25강 전체 요약과 설계자가 기억할 원칙, 참고 자료로 시리즈를 마친다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 25

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '종합 실습', '요구사항 분석', '스타 스키마', '파티셔닝', 'Expand-Contract', '설계 리뷰']
---

# DB 설계 A to Z 25강 — 종합 실습

지금까지의 과정을 하나의 요구사항에 처음부터 끝까지 적용합니다.

## 1. 요구사항

> 조선소의 **선행 의장(Outfitting) 작업**을 관리하는 시스템을 만든다.
>
> - 호선마다 여러 **블록**이 있고, 블록마다 **의장품**(배관, 전장, 철의장)이 설치된다.
> - 의장품은 **도면 번호**로 식별되며, 같은 도면의 의장품이 **시리즈선(동형선)의 여러 호선**에서 사용된다.
> - 의장품 설치는 **계획일, 설치일, 설치 협력사**를 관리한다. 설치 후 **검사에 불합격하면 재설치**한다.
> - 의장품 유형별로 관리 속성이 다르다 (배관: 관경·재질·압력등급 / 전장: 케이블 규격·길이 / 철의장: 중량).
> - 협력사는 **자기 회사의 설치 건만** 조회할 수 있다.
> - 경영진은 **호선·블록·유형별 설치율**과 **월별 투입 시수**를 대시보드로 본다. 과거 월 보고서는 당시 기준으로 재현되어야 한다.
> - 설치 실적은 **일 2만 건**, **5년 보관**.

## 2. 요구사항 분석 (2강)

**모호성 질문과 가정된 답변**
| 질문 | 가정 답변 | 설계 영향 |
|---|---|---|
| 한 의장품이 한 호선에 여러 개 설치될 수 있나? | 예, 도면당 수량이 있음 | 설치 단위 = 도면 × 호선 × 일련번호 |
| 설치 블록이 바뀔 수 있나? | 예, 설계 변경 시 | 블록은 설치의 비식별 속성 |
| 재설치 시 이전 설치 기록을 보존하나? | 예, 품질 이력 | 설치 차수 |
| 협력사가 중간에 바뀌나? | 드물지만 있음 | 차수별로 협력사 기록 |
| 과거 보고서 재현의 기준은? | 월말 마감 시점의 상태 | 주기적 스냅샷 |

**업무 규칙**
| 규칙 | 유형 | 구현 |
|---|---|---|
| 설치일은 계획일 이후 180일 이내 | 행 간 (다른 테이블 참조) | 트리거 또는 서비스 계층 |
| 같은 설치 대상의 차수는 유일 | 유일성 | PK (단, 파티션 키 포함 → 아래 한계 참고) |
| 진행 중인 차수는 대상당 하나 | 행 간 | 서비스 계층 행 락 (파티셔닝 제약) |
| 배관은 관경 필수 | 값 (서브타입) | 서브타입 NOT NULL |
| 협력사는 자기 데이터만 | 보안 | RLS |

**볼륨**
| 엔티티 | 규모 | 결정 |
|---|---|---|
| 설치 차수 | 일 2만 × 5년 ≈ 3,650만 | 월 파티셔닝 |
| 의장품 도면 | 수십만 | 일반 테이블 |

## 3. 개념 모델 (3~4강)

```
[호선] ┼┼───○< [블록]
[의장품도면] ┼┼───○< [설치대상] >○───┼┼ [호선]
                         │
                    >○───┼┼ [블록]  (현재 설치 블록)
[설치대상] ┼┼───┼< [설치차수] >○───┼┼ [협력사]
[설치차수] ┼┼───○< [검사]
[의장품도면] ── 슈퍼타입 {배관, 전장, 철의장} (배타, 완전)
```
- **의장품도면**: 호선과 무관한 설계 정보 (시리즈선 공유) → 호선과 분리한 것이 핵심 판단
- **설치대상**: 특정 호선에 설치될 개별 의장품 (도면 × 호선 × 일련번호)
- **설치차수**: 약한 엔티티, 재설치 이력

## 4. 논리·물리 설계 (6~16강, PostgreSQL 기준)

```sql
-- 협력사 (코드 마스터, 자연키)
CREATE TABLE vendor (
    vendor_code VARCHAR(10) PRIMARY KEY,
    vendor_name VARCHAR(100) NOT NULL
);

CREATE TABLE ship (
    ship_no    VARCHAR(10) PRIMARY KEY,
    ship_type  VARCHAR(20) NOT NULL,
    series_code VARCHAR(10)
);

CREATE TABLE block (
    block_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ship_no    VARCHAR(10) NOT NULL REFERENCES ship,
    block_name VARCHAR(20) NOT NULL,
    UNIQUE (ship_no, block_name),
    UNIQUE (block_id, ship_no)                          -- 복합 FK 대상
);

-- 슈퍼타입 + 서브타입 (11강 전략 C)
CREATE TABLE outfit_drawing (
    drawing_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    drawing_no   VARCHAR(30) NOT NULL UNIQUE,           -- 자연키 보호
    outfit_type  CHAR(2) NOT NULL CHECK (outfit_type IN ('PI','EL','HO')),
    description  VARCHAR(200),
    UNIQUE (drawing_id, outfit_type)
);

CREATE TABLE outfit_drawing_pipe (
    drawing_id     BIGINT PRIMARY KEY,
    outfit_type    CHAR(2) NOT NULL DEFAULT 'PI' CHECK (outfit_type = 'PI'),
    nominal_dia_mm NUMERIC(6,1) NOT NULL,
    material       VARCHAR(20) NOT NULL,
    pressure_class VARCHAR(10) NOT NULL,
    FOREIGN KEY (drawing_id, outfit_type) REFERENCES outfit_drawing (drawing_id, outfit_type)
);

CREATE TABLE outfit_drawing_elec (
    drawing_id   BIGINT PRIMARY KEY,
    outfit_type  CHAR(2) NOT NULL DEFAULT 'EL' CHECK (outfit_type = 'EL'),
    cable_spec   VARCHAR(30) NOT NULL,
    length_m     NUMERIC(8,2) NOT NULL,
    FOREIGN KEY (drawing_id, outfit_type) REFERENCES outfit_drawing (drawing_id, outfit_type)
);

CREATE TABLE outfit_drawing_hull (
    drawing_id   BIGINT PRIMARY KEY,
    outfit_type  CHAR(2) NOT NULL DEFAULT 'HO' CHECK (outfit_type = 'HO'),
    weight_kg    NUMERIC(10,2) NOT NULL CHECK (weight_kg > 0),
    FOREIGN KEY (drawing_id, outfit_type) REFERENCES outfit_drawing (drawing_id, outfit_type)
);

-- 설치 대상
CREATE TABLE install_target (
    target_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    drawing_id   BIGINT NOT NULL REFERENCES outfit_drawing,
    ship_no      VARCHAR(10) NOT NULL,
    serial_no    SMALLINT NOT NULL,
    block_id     BIGINT NOT NULL,
    plan_date    DATE NOT NULL,
    UNIQUE (drawing_id, ship_no, serial_no),            -- 자연키
    FOREIGN KEY (block_id, ship_no) REFERENCES block (block_id, ship_no)  -- 블록이 같은 호선 소속임을 보장
);
CREATE INDEX ix_target_block ON install_target (block_id);
CREATE INDEX ix_target_ship  ON install_target (ship_no);

-- 설치 차수 (약한 엔티티, 월 파티셔닝)
CREATE TABLE install_round (
    target_id    BIGINT NOT NULL,
    round_no     SMALLINT NOT NULL,
    vendor_code  VARCHAR(10) NOT NULL REFERENCES vendor,
    status       VARCHAR(10) NOT NULL
                 CHECK (status IN ('ASSIGNED','INSTALLED','PASSED','FAILED')),
    installed_on DATE,
    man_hours    NUMERIC(6,2) CHECK (man_hours >= 0),
    work_month   DATE NOT NULL,                          -- 파티션 키 (배정 월 1일)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (target_id, round_no, work_month),
    CHECK (EXTRACT(DAY FROM work_month) = 1),
    CHECK (status = 'ASSIGNED' OR installed_on IS NOT NULL)
) PARTITION BY RANGE (work_month);

CREATE INDEX ix_round_vendor ON install_round (vendor_code, work_month);
CREATE INDEX ix_round_target ON install_round (target_id);
```

**설계 판단 기록**
| 판단 | 근거 | 관련 강의 |
|---|---|---|
| 도면과 설치대상 분리 | 시리즈선 공유 → 도면 속성이 호선마다 반복되는 갱신 이상 방지 | 7, 8강 |
| 슈퍼+서브타입 | 설치대상이 도면을 참조해야 하므로 서브타입별 테이블 불가 | 11강 |
| `(block_id, ship_no)` 복합 FK | 다른 호선의 블록을 지정하는 오류를 DB가 차단 | 10강 |
| 설치차수 PK에 work_month | 파티셔닝 제약, 월 단위 보관 관리 | 16강 |
| 상태 단일 컬럼 | 불리언 조합의 모순 방지 | 12강 |
| 설치일 범위 규칙 | 계획일은 다른 테이블 → CHECK 불가, 앱 또는 트리거로 검증 | 13강 |

마지막 행처럼 **DB 제약으로 표현할 수 없는 규칙을 명시적으로 기록**하는 것도 설계의 일부입니다. 이 규칙은 트리거로 구현하거나, 설치대상에 계획일이 바뀔 때의 처리까지 포함해 앱 서비스 계층에서 검증합니다.

"차수 유일"과 "진행 중인 차수는 대상당 하나" 규칙은, 파티션 테이블의 PK·UNIQUE가 파티션 키(work_month)를 포함해야 하므로 **월이 다른 행끼리는 DB 제약만으로 막을 수 없습니다.** 이 한계는 **파티셔닝과 무결성의 트레이드오프**이며, 서비스 계층의 행 락(`SELECT ... FOR UPDATE` on install_target)으로 보완합니다.

## 5. 보안 (21강)

```sql
ALTER TABLE install_round ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_own_rows ON install_round
  FOR SELECT TO vendor_role
  USING (vendor_code = current_setting('app.vendor_code'));
```
사내 사용자 역할에는 별도 정책(`USING (true)`)을 부여합니다.

## 6. 분석 모델 (20강)

**버스 매트릭스**
| 프로세스 \ 차원 | 월 | 호선 | 블록 | 의장품 유형 | 협력사 |
|---|---|---|---|---|---|
| 설치 실적 (트랜잭션) | O | O | O | O | O |
| 월말 설치 현황 (주기적 스냅샷) | O | O | O | O | |

```sql
CREATE TABLE fact_install_monthly_snapshot (
    month_key     INT NOT NULL,              -- 202609
    block_sk      BIGINT NOT NULL,           -- SCD Type 2 (블록 이관 이력 반영)
    outfit_type   CHAR(2) NOT NULL,
    planned_cnt   INT NOT NULL,              -- 분모
    installed_cnt INT NOT NULL,              -- 분자
    passed_cnt    INT NOT NULL,
    man_hours     NUMERIC(12,2) NOT NULL,
    closed_at     TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (month_key, block_sk, outfit_type)
);
```
- 설치율은 저장하지 않고 `installed_cnt / planned_cnt`로 계산 (비가산 측정값)
- 월말 마감 배치가 스냅샷을 **삽입만** 하므로, 과거 월 보고서가 그대로 재현됨 (18강 요구)
- `man_hours`는 가산이지만, 개수 컬럼들은 월 차원으로 합산하면 안 되는 **준가산** 값

## 7. 진화 시나리오 (22강)

**요구 변경:** "배관 의장품에 **도장 사양**을 추가하고, 향후 유형별 속성이 자주 늘어날 예정"

| 단계 | 작업 |
|---|---|
| 1 | `outfit_drawing`에 `extra_spec JSONB NOT NULL DEFAULT '{}'` 추가 (즉시 적용) |
| 2 | 새 속성은 JSON에 저장 (19강 하이브리드) |
| 3 | 3개월 후 `coating_spec`이 대시보드 필터로 쓰이기 시작 → 컬럼 승격 결정 |
| 4 | `outfit_drawing_pipe.coating_spec` 추가 → 앱 이중 쓰기 → Backfill (JSON에서 추출) |
| 5 | 읽기 전환 → 검증 → JSON 키 쓰기 중단 → JSON에서 키 제거 |

## 8. 리뷰 (24강)

| 항목 | 결과 |
|---|---|
| 대리키 테이블의 자연키 UNIQUE | 모두 있음 |
| FK 인덱스 | `install_target.drawing_id`는 UNIQUE `(drawing_id, ship_no, serial_no)`의 선두 컬럼이라 커버됨, `install_round.vendor_code`는 복합 인덱스 선두로 커버됨 → 문제 없음 |
| 금액·시수 타입 | NUMERIC |
| DB로 표현 못한 규칙 | 3건 (설치일 범위, 월 간 차수 유일, 진행 차수 단일), 기록 및 서비스 계층 구현 확인 |
| 파티션 선 생성 배치 | 운영 계획에 포함 필요 → **높음** |
| 안티패턴 역추적 | 해당 없음 |

## 25강 정리

하나의 요구사항이 25개 강의의 판단을 모두 거쳐 스키마가 됩니다.

1. 요구사항의 모호성 질문이 엔티티 분리(도면 vs 설치대상)를 결정했다.
2. 슈퍼/서브타입과 복합 FK로 업무 규칙을 구조로 강제했다.
3. 파티셔닝은 보관 관리를 얻는 대신 일부 유일성 보장을 포기하게 했고, 그 한계를 기록했다.
4. 분석 모델은 분자·분모 스냅샷으로 과거 재현 요구를 충족했다.
5. 변화 요구는 JSON 하이브리드와 Expand–Contract로 흡수했다.

---

## 마치며

### 강의 전체 요약

| Part | 핵심 질문 | 핵심 도구 |
|---|---|---|
| 1. 기초 | 업무를 어떻게 정확히 이해하고 표현하나? | 요구사항 분석, ER 모델, 키 |
| 2. 논리 설계 | 사실을 어떻게 중복 없이 배치하나? | 변환 규칙, 함수 종속성, 정규화 |
| 3. 물리 설계 | DBMS 위에서 어떻게 효율적으로 저장하나? | 타입, 제약, 키 생성, 인덱스, 파티션 |
| 4. 심화 모델링 | 계층·시간·유연성·분석·테넌트를 어떻게 다루나? | 클로저 테이블, 선분 이력, JSON, 차원 모델, RLS |
| 5. 시니어 레벨 | 운영 중인 설계를 어떻게 바꾸고 나누고 검증하나? | Expand–Contract, 바운디드 컨텍스트, 리뷰, ADR |

### 설계자가 기억할 원칙

1. **업무 규칙이 먼저, 테이블은 나중이다.** FD도, 제약도, 인덱스도 업무 규칙과 쿼리에서 나온다.
2. **"같은 일이 두 번 일어날 수 있는가?"** 이 질문 하나가 키 설계를 바꾼다.
3. **DB가 보장할 수 있는 것은 DB에 맡긴다.** 앱 검증은 우회된다.
4. **중복은 동기화 수단과 함께 설계한다.** 가능하면 DB가 보장하는 수단을 쓴다.
5. **나누기는 쉽고 합치기는 어렵다.** 스키마도, 테이블도, DB도 필요가 확인될 때 나눈다.
6. **표현하지 못한 규칙은 기록한다.** 설계의 한계를 아는 것도 설계다.
7. **스키마는 변한다.** 모든 변경은 되돌릴 수 있는 단계로 나눈다.

### 참고 자료

- Martin Kleppmann, *데이터 중심 애플리케이션 설계* (Designing Data-Intensive Applications)
- Alex Petrov, *Database Internals*
- Bill Karwin, *SQL AntiPatterns*
- Ralph Kimball, Margy Ross, *The Data Warehouse Toolkit*
- Richard T. Snodgrass, *Developing Time-Oriented Database Applications in SQL*
- CMU 15-445/645 Database Systems
- 백은빈·이승현, *Real MySQL 8.0*
- 각 DBMS 공식 문서 (PostgreSQL, MySQL, Oracle, SQL Server)

---

## 시리즈를 마치며 — 25강 전체 목록

| 강 | 주제 |
|---|---|
| 1강 | [설계란 무엇인가](/posts/db-design-01-what-is-design) |
| 2강 | [요구사항 분석](/posts/db-design-02-requirements) |
| 3강 | [개념 모델링 (ER 모델)](/posts/db-design-03-conceptual-modeling) |
| 4강 | [ERD 표기법](/posts/db-design-04-erd-notation) |
| 5강 | [키의 종류](/posts/db-design-05-keys) |
| 6강 | [ER → 관계형 변환](/posts/db-design-06-er-to-relational) |
| 7강 | [이상현상과 함수 종속성](/posts/db-design-07-anomalies-and-fd) |
| 8강 | [정규화 1NF ~ BCNF](/posts/db-design-08-normalization) |
| 9강 | [4NF, 5NF](/posts/db-design-09-4nf-5nf) |
| 10강 | [반정규화](/posts/db-design-10-denormalization) |
| 11강 | [식별/비식별 관계, 슈퍼타입/서브타입](/posts/db-design-11-identifying-and-subtypes) |
| 12강 | [데이터 타입 설계](/posts/db-design-12-data-types) |
| 13강 | [제약조건 설계](/posts/db-design-13-constraints) |
| 14강 | [키 생성 전략](/posts/db-design-14-key-generation) |
| 15강 | [인덱스 설계](/posts/db-design-15-indexes) |
| 16강 | [파티셔닝 설계](/posts/db-design-16-partitioning) |
| 17강 | [계층 구조 모델링](/posts/db-design-17-hierarchies) |
| 18강 | [이력·시간 모델링](/posts/db-design-18-temporal) |
| 19강 | [유연한 구조: 다형 관계, EAV, JSON](/posts/db-design-19-flexible-structures) |
| 20강 | [차원 모델링](/posts/db-design-20-dimensional-modeling) |
| 21강 | [멀티테넌시 설계](/posts/db-design-21-multitenancy) |
| 22강 | [스키마 진화](/posts/db-design-22-schema-evolution) |
| 23강 | [도메인 경계와 DB 분리](/posts/db-design-23-domain-boundaries) |
| 24강 | [설계 리뷰 방법론](/posts/db-design-24-design-review) |
| 25강 | [종합 실습](/posts/db-design-25-capstone) |
