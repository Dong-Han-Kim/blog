---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 6강 — ER → 관계형 변환'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'SQL', 'PostgreSQL']
description: 'ER 요소별 관계형 변환 규칙과 1:N·N:M·1:1·다중값 속성·약한 엔티티·삼항 관계·재귀 관계의 DDL을 정리한다. 시리즈 Part 2 "논리 설계"의 첫 강이다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 6

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '데이터 모델링', 'ER 관계형 변환', '교차 테이블', '약한 엔티티', '복합 FK', '재귀 관계', 'DDL']
---

# DB 설계 A to Z 6강 — ER → 관계형 변환

여기서부터 Part 2 "논리 설계"입니다. 1~5강에서 만든 개념 모델을 관계형 테이블로 옮깁니다.

## 1. 변환 규칙 요약

| ER 요소 | 관계형 변환 |
|---|---|
| 강한 엔티티 | 테이블 1개, 식별자 → PK |
| 약한 엔티티 | 테이블 1개, PK = 소유 엔티티 PK + 부분키 |
| 복합 속성 | 하위 속성을 각각 컬럼으로 |
| 다중값 속성 | 별도 테이블 (소유 PK + 값) |
| 1:1 관계 | 한쪽에 FK + UNIQUE, 또는 병합 |
| 1:N 관계 | N 쪽에 FK |
| N:M 관계 | 교차(연관) 테이블 |
| 삼항 이상 관계 | 참여 엔티티 PK를 모두 가진 테이블 |
| 재귀 관계 | 같은 테이블을 참조하는 FK |

## 2. 1:N 관계

```sql
-- 호선(1) : 블록(N) → N 쪽(블록)에 FK
CREATE TABLE ship (
    ship_no VARCHAR(10) PRIMARY KEY,
    ship_type VARCHAR(20) NOT NULL
);

CREATE TABLE block (
    block_id BIGINT PRIMARY KEY,
    ship_no  VARCHAR(10) NOT NULL REFERENCES ship(ship_no),  -- 필수 참여 → NOT NULL
    block_name VARCHAR(20) NOT NULL,
    UNIQUE (ship_no, block_name)
);
```
1 쪽(호선)에 블록 목록을 넣는 것은 다중값이므로 불가능합니다. **FK는 항상 N 쪽에 둡니다.**

## 3. N:M 관계

```sql
CREATE TABLE process (
    process_code VARCHAR(10) PRIMARY KEY,
    process_name VARCHAR(50) NOT NULL
);

CREATE TABLE block_process (
    block_id     BIGINT      NOT NULL REFERENCES block(block_id),
    process_code VARCHAR(10) NOT NULL REFERENCES process(process_code),
    plan_date    DATE NOT NULL,
    actual_date  DATE,
    PRIMARY KEY (block_id, process_code)
);
```
관계의 속성(계획일, 실적일)은 교차 테이블의 컬럼이 됩니다.

**PK 컬럼 순서 결정:** `(block_id, process_code)`는 "블록의 공정 목록" 조회에 유리합니다. "공정별 블록 목록" 조회가 많다면 `(process_code, block_id)` 인덱스를 추가합니다. 둘 다 빈번하면 두 방향 인덱스가 모두 필요합니다.

## 4. 1:1 관계의 세 가지 변환

호선 ─ 계약서가 1:1일 때:

| 방식 | 구조 | 적합한 경우 |
|---|---|---|
| A. 병합 | ship 테이블에 계약 컬럼 추가 | 양쪽 모두 필수, 항상 함께 조회 |
| B. 선택 쪽에 FK | contract.ship_no FK + UNIQUE | 계약이 없는 호선이 존재 (부분 참여) |
| C. PK 공유 | contract.ship_no가 PK이자 FK | B와 유사, 조인 단순, 1:1이 구조적으로 보장 |

```sql
-- 방식 C
CREATE TABLE ship_contract (
    ship_no       VARCHAR(10) PRIMARY KEY REFERENCES ship(ship_no),
    contract_date DATE NOT NULL,
    owner_name    VARCHAR(100) NOT NULL
);
```
**FK만 두고 UNIQUE를 빠뜨리면 1:N이 됩니다.** 방식 B에서는 UNIQUE가 1:1을 보장하는 유일한 장치입니다.

분리를 선택하는 추가 이유:
- 크고 드물게 조회되는 컬럼(첨부 문서, 긴 텍스트) 분리 → 행 크기 감소
- 보안 등급이 다른 컬럼 분리 → 권한을 테이블 단위로 부여

## 5. 다중값 속성

```sql
-- 작업자의 보유 자격증 (다중값)
CREATE TABLE worker_certificate (
    worker_id   BIGINT      NOT NULL REFERENCES worker(worker_id),
    cert_code   VARCHAR(20) NOT NULL,
    acquired_on DATE,
    PRIMARY KEY (worker_id, cert_code)
);
```

## 6. 약한 엔티티

재작업이 허용되는 블록공정 차수:
```sql
CREATE TABLE block_process_round (
    block_id     BIGINT      NOT NULL,
    process_code VARCHAR(10) NOT NULL,
    round_no     SMALLINT    NOT NULL,   -- 부분키
    started_at   TIMESTAMP,
    finished_at  TIMESTAMP,
    PRIMARY KEY (block_id, process_code, round_no),
    FOREIGN KEY (block_id, process_code) REFERENCES block_process (block_id, process_code)
        ON DELETE CASCADE
);
```
약한 엔티티는 소유 엔티티 없이 존재할 수 없으므로 `ON DELETE CASCADE`가 자연스럽습니다.

## 7. 삼항 관계

```sql
-- 작업자가 블록의 공정을 수행 (작업일 단위)
CREATE TABLE work_record (
    work_id      BIGINT PRIMARY KEY,
    worker_id    BIGINT      NOT NULL REFERENCES worker(worker_id),
    block_id     BIGINT      NOT NULL,
    process_code VARCHAR(10) NOT NULL,
    work_date    DATE        NOT NULL,
    man_hours    NUMERIC(5,2) NOT NULL CHECK (man_hours > 0),
    FOREIGN KEY (block_id, process_code) REFERENCES block_process (block_id, process_code),
    UNIQUE (worker_id, block_id, process_code, work_date)
);
```
FK를 `block`과 `process`에 각각 거는 대신 `block_process`에 복합 FK를 걸었습니다. 이렇게 하면 **"계획되지 않은 공정에 실적이 들어가는 것"** 을 DB가 막아줍니다. 이런 선택이 논리 설계에서 업무 규칙을 구조로 표현하는 방법입니다.

## 8. 재귀 관계

```sql
CREATE TABLE worker (
    worker_id  BIGINT PRIMARY KEY,
    name       VARCHAR(50) NOT NULL,
    leader_id  BIGINT REFERENCES worker(worker_id)   -- (0,1) 이므로 NULL 허용
);
```
N:M 재귀(예: 부품 BOM, 자재가 여러 상위 자재에 사용됨)는 교차 테이블로 변환합니다.
```sql
CREATE TABLE bom (
    parent_part_id BIGINT NOT NULL REFERENCES part(part_id),
    child_part_id  BIGINT NOT NULL REFERENCES part(part_id),
    quantity       NUMERIC(10,3) NOT NULL,
    PRIMARY KEY (parent_part_id, child_part_id),
    CHECK (parent_part_id <> child_part_id)
);
```

## 6강 정리

1. FK는 N 쪽에, N:M은 교차 테이블로, 다중값 속성은 별도 테이블로 변환한다.
2. 1:1은 병합·FK+UNIQUE·PK 공유 중 선택하고, UNIQUE 누락에 주의한다.
3. 삼항 관계에서 복합 FK의 참조 대상을 선택하면 업무 규칙을 구조로 강제할 수 있다.
