---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 19강 — 유연한 구조: 다형 관계, EAV, JSON'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'JSON', 'EAV']
description: '다형 관계에서 FK를 되찾는 세 가지 방법, EAV를 써도 되는 조건, JSON 컬럼의 인덱싱과 부분 갱신 비용, 컬럼으로 승격할 속성을 가르는 기준을 정리한다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 19

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '다형 관계', '배타적 아크', 'EAV', 'JSON 컬럼', 'GIN 인덱스', '유연한 스키마']
---

# DB 설계 A to Z 19강 — 유연한 구조: 다형 관계, EAV, JSON

앞의 두 강이 구조가 정해져 있을 때의 모델링이었다면, 이번에는 구조 자체가 고정되지 않는 경우를 다룹니다.

## 1. 문제 상황

- 첨부파일·코멘트가 블록, 검사, 작업지시 **여러 엔티티에 붙는다**
- 블록 유형(곡블록, 평블록, 상부구조)마다 **관리 속성이 다르고 자주 추가된다**
- 외부 설비에서 오는 측정 데이터의 **형식이 설비마다 다르다**

## 2. 다형 관계 (Polymorphic Association)

```sql
-- 안티패턴 형태
CREATE TABLE attachment (
    attachment_id BIGINT PRIMARY KEY,
    target_type   VARCHAR(20) NOT NULL,   -- 'BLOCK', 'INSPECTION', 'WORK_ORDER'
    target_id     BIGINT NOT NULL,        -- FK를 걸 수 없음
    file_path     VARCHAR(500) NOT NULL
);
```
**문제:** `target_id`가 어느 테이블을 참조하는지 DB가 모르므로 FK를 걸 수 없고, 고아 레코드가 생기며, 조인할 때마다 `CASE`나 UNION이 필요합니다.

**대안 1: 대상별 교차 테이블**
```sql
CREATE TABLE block_attachment      (block_id BIGINT REFERENCES block, attachment_id BIGINT REFERENCES attachment, PRIMARY KEY (block_id, attachment_id));
CREATE TABLE inspection_attachment (inspection_id BIGINT REFERENCES inspection, attachment_id BIGINT REFERENCES attachment, PRIMARY KEY (inspection_id, attachment_id));
```

**대안 2: 배타적 아크 (Exclusive Arc)**
```sql
CREATE TABLE attachment (
    attachment_id  BIGINT PRIMARY KEY,
    block_id       BIGINT REFERENCES block(block_id),
    inspection_id  BIGINT REFERENCES inspection(inspection_id),
    work_order_id  BIGINT REFERENCES work_order(work_order_id),
    file_path      VARCHAR(500) NOT NULL,
    CHECK (num_nonnulls(block_id, inspection_id, work_order_id) = 1)  -- PG
);
```
MySQL·Oracle·SQL Server에서는 `(CASE WHEN block_id IS NOT NULL THEN 1 ELSE 0 END + ...) = 1` 형태로 작성합니다.

**대안 3: 공통 슈퍼타입**
블록, 검사, 작업지시를 "첨부 가능 대상(attachable)" 슈퍼타입의 서브타입으로 두고, attachment는 슈퍼타입을 참조합니다 ([11강 전략 C](/posts/db-design-11-identifying-and-subtypes)).

| 대안 | FK 보장 | 대상 추가 시 | 적합한 경우 |
|---|---|---|---|
| 교차 테이블 | O | 테이블 추가 | 대상이 적당히 많고 N:M |
| 배타적 아크 | O | 컬럼 추가 | 대상이 소수로 고정 |
| 공통 슈퍼타입 | O | 서브타입 연결 | 대상들이 공통 식별 체계를 가질 수 있음 |

## 3. EAV (Entity-Attribute-Value)

```sql
CREATE TABLE block_attr (
    block_id   BIGINT NOT NULL,
    attr_name  VARCHAR(50) NOT NULL,
    attr_value VARCHAR(4000),
    PRIMARY KEY (block_id, attr_name)
);
```
**문제**
| 항목 | 설명 |
|---|---|
| 타입 | 모든 값이 문자열 → 숫자 비교, 날짜 계산 불가 |
| 제약 | NOT NULL, CHECK, FK를 속성별로 걸 수 없음 |
| 조회 | 속성 N개를 한 행으로 만들려면 N번 조인 또는 피벗 |
| 옵티마이저 | 통계가 속성 구분 없이 섞여 계획이 부정확 |

**EAV가 정당한 경우**
- 속성 정의를 **최종 사용자가 런타임에 추가**하는 제품 (설정형 폼, 의료 관찰 데이터 같은 도메인)
- 속성이 수천 종이고 행마다 극히 일부만 사용

이때도 **속성 정의 테이블**(타입, 필수 여부, 허용값)을 두고 값 컬럼을 타입별로 나누면 문제를 줄일 수 있습니다.
```sql
CREATE TABLE attr_def (
    attr_id   INT PRIMARY KEY,
    attr_name VARCHAR(50) NOT NULL UNIQUE,
    data_type VARCHAR(10) NOT NULL CHECK (data_type IN ('NUM','TEXT','DATE'))
);
CREATE TABLE block_attr (
    block_id  BIGINT NOT NULL,
    attr_id   INT NOT NULL REFERENCES attr_def,
    num_val   NUMERIC,
    text_val  VARCHAR(4000),
    date_val  DATE,
    PRIMARY KEY (block_id, attr_id),
    CHECK (num_nonnulls(num_val, text_val, date_val) = 1)
);
```

## 4. JSON 컬럼

```sql
-- PostgreSQL
CREATE TABLE block (
    block_id   BIGINT PRIMARY KEY,
    block_type VARCHAR(10) NOT NULL,
    weight_ton NUMERIC(8,2) NOT NULL,
    spec       JSONB NOT NULL DEFAULT '{}'
);

-- 포함 검색 인덱스
CREATE INDEX ix_block_spec ON block USING gin (spec jsonb_path_ops);
SELECT * FROM block WHERE spec @> '{"coating": "EPOXY"}';

-- 특정 키 조회용 표현식 인덱스
CREATE INDEX ix_block_spec_thk ON block (((spec->>'plate_thickness')::numeric));
```

```sql
-- MySQL 8.0: 생성 컬럼 또는 함수 인덱스로 JSON 필드 인덱싱
ALTER TABLE block
  ADD COLUMN coating VARCHAR(20) GENERATED ALWAYS AS (spec->>'$.coating') VIRTUAL,
  ADD INDEX ix_block_coating (coating);
```

**JSON 스키마 검증**
```sql
-- PostgreSQL: 최소 구조 검증
ALTER TABLE block ADD CONSTRAINT ck_spec_type
  CHECK (jsonb_typeof(spec) = 'object'
         AND (NOT spec ? 'plate_thickness' OR jsonb_typeof(spec->'plate_thickness') = 'number'));
```
MySQL 8.0.17+은 `JSON_SCHEMA_VALID()`를 CHECK에 사용할 수 있습니다.

## 5. 컬럼으로 뺄 것 vs JSON에 둘 것

| 기준 | 정규 컬럼 | JSON |
|---|---|---|
| 모든 행에 존재 | O | |
| 조인·FK 대상 | O | |
| 집계·정렬·범위 검색의 주 대상 | O | |
| 업무 규칙(NOT NULL, CHECK) 필요 | O | 제한적 |
| 유형별로 다르고 조회만 함 | | O |
| 외부에서 받은 원본 보관 | | O |
| 스키마 변경이 잦음 | | O |

**하이브리드가 정답인 경우가 많습니다.** 핵심 속성은 컬럼, 유형별·부가 속성은 JSON. 그리고 JSON 속성이 자주 검색되기 시작하면 **컬럼으로 승격**합니다 ([22강 스키마 진화](/posts/db-design-22-schema-evolution)).

## 6. JSON의 물리적 비용

- PostgreSQL JSONB는 큰 문서를 TOAST로 분리 저장합니다. **작은 필드 하나를 갱신해도 문서 전체를 다시 씁니다** → 쓰기 증폭, WAL 증가, MVCC dead tuple 크기 증가
- 통계가 JSON 내부 값에는 기본적으로 없으므로 선택도 추정이 부정확합니다.
- 자주 갱신되는 카운터나 상태를 JSON 안에 두지 않습니다.

## 19강 정리

1. 다형 관계는 교차 테이블, 배타적 아크, 공통 슈퍼타입으로 FK를 되찾는다.
2. EAV는 런타임 속성 정의가 필수인 경우에만, 속성 정의 테이블과 함께 쓴다.
3. JSON은 핵심 속성이 아닌 부가·유형별 속성에 쓰고, 검색이 늘면 컬럼으로 승격한다.
4. JSON 부분 갱신은 문서 전체 재작성이므로 갱신이 잦은 값은 컬럼에 둔다.
