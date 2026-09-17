---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 11강 — 식별/비식별 관계, 슈퍼타입/서브타입'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'Inheritance', 'PostgreSQL']
description: '식별 관계와 비식별 관계의 장단점과 선택 기준, 슈퍼타입·서브타입을 단일 테이블·서브타입별 테이블·슈퍼+서브 테이블 세 가지로 변환하는 전략과 비교표를 다룬다. 시리즈 Part 2 "논리 설계"의 마지막 강이다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 11

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '데이터 모델링', '식별 관계', '비식별 관계', '슈퍼타입', '서브타입', 'Single Table', 'JOINED', '배타적 서브타입']
---

# DB 설계 A to Z 11강 — 식별/비식별 관계, 슈퍼타입/서브타입

Part 2의 마지막 강입니다. 관계와 상속 구조를 테이블로 옮길 때의 선택지를 정리합니다.

## 1. 식별 관계 vs 비식별 관계

| 구분 | 식별 관계 | 비식별 관계 |
|---|---|---|
| 정의 | 부모 PK가 자식 **PK의 일부** | 부모 PK가 자식의 **일반 컬럼(FK)** |
| 자식의 존재 | 부모에 강하게 종속 | 상대적으로 독립 |
| IDEF1X 표기 | 실선 | 점선 |
| 예시 | 블록공정(block_id, process_code) | 블록(block_id PK, ship_no FK) |

## 2. 식별 관계의 장단점

**장점**
- 부모 키로 자식을 조회할 때 PK 인덱스를 그대로 사용 (InnoDB에서는 물리적으로 인접 저장)
- 조부모 키가 손자까지 전파되므로 **중간 조인 없이** 필터 가능
- "부모 없이 존재할 수 없다"는 의미가 구조로 드러남

**단점**
- [5강](/posts/db-design-05-keys)에서 본 **PK 크기 전파**
- 부모 PK가 바뀌면 모든 자손의 PK가 바뀜
- 관계가 나중에 1:N에서 N:M으로 바뀌면 PK 재설계 필요

## 3. 선택 기준

| 질문 | 식별 쪽 | 비식별 쪽 |
|---|---|---|
| 자식이 부모 없이 의미가 있는가? | 없음 | 있음 |
| 자식이 다른 부모로 옮겨갈 수 있는가? | 없음 | 있음 (블록의 호선 변경) |
| 계층 깊이가 3단계 이상인가? | 아니오 | 예 → 중간부터 대리키 |
| 부모 키로 범위 조회가 핵심인가? | 예 | 아니오 |
| ORM을 주로 사용하는가? | — | 예 (복합키 매핑 비용) |

**실무 패턴:** 약한 엔티티와 교차 테이블은 식별 관계, 독립적인 업무 엔티티는 대리키 + 비식별 관계. 계층이 깊어지면 **2단계까지만 식별**하고 그 아래는 대리키로 끊습니다.

## 4. 슈퍼타입/서브타입

예제: 검사(inspection)는 **초음파(UT)**, **방사선(RT)**, **육안(VT)** 으로 나뉩니다. 공통 속성(검사일, 감독관, 판정)과 유형별 속성이 있습니다.

| 유형 | 고유 속성 |
|---|---|
| UT | 탐촉자 주파수, 감도 |
| RT | 필름 번호, 선원 종류, 노출 시간 |
| VT | 사진 수 |

개념 모델에서 두 가지 성질을 먼저 정합니다.
- **배타(Exclusive) vs 중복(Overlapping):** 하나의 검사가 두 유형일 수 있는가?
- **완전(Total) vs 부분(Partial):** 세 유형 외의 검사가 있는가?

## 5. 세 가지 변환 전략

**전략 A: 단일 테이블 (Single Table / Roll-up)**
```sql
CREATE TABLE inspection (
    inspection_id  BIGINT PRIMARY KEY,
    inspect_type   CHAR(2) NOT NULL CHECK (inspect_type IN ('UT','RT','VT')),
    inspect_date   DATE NOT NULL,
    result         CHAR(1) NOT NULL,
    -- UT
    ut_frequency   NUMERIC(5,2),
    ut_gain        NUMERIC(5,2),
    -- RT
    rt_film_no     VARCHAR(20),
    rt_source      VARCHAR(10),
    -- VT
    vt_photo_count INT,
    CHECK (inspect_type <> 'UT' OR ut_frequency IS NOT NULL),
    CHECK (inspect_type <> 'RT' OR rt_film_no  IS NOT NULL)
);
```

**전략 B: 서브타입별 테이블 (Table per Concrete Type / Roll-down)**
```sql
CREATE TABLE inspection_ut (inspection_id BIGINT PRIMARY KEY, inspect_date DATE, result CHAR(1), frequency NUMERIC(5,2), gain NUMERIC(5,2));
CREATE TABLE inspection_rt (inspection_id BIGINT PRIMARY KEY, inspect_date DATE, result CHAR(1), film_no VARCHAR(20), source VARCHAR(10));
CREATE TABLE inspection_vt (inspection_id BIGINT PRIMARY KEY, inspect_date DATE, result CHAR(1), photo_count INT);
```

**전략 C: 슈퍼타입 + 서브타입 테이블 (Table per Type / 1:1)**
```sql
CREATE TABLE inspection (
    inspection_id BIGINT PRIMARY KEY,
    inspect_type  CHAR(2) NOT NULL,
    inspect_date  DATE NOT NULL,
    result        CHAR(1) NOT NULL,
    UNIQUE (inspection_id, inspect_type)
);

CREATE TABLE inspection_ut (
    inspection_id BIGINT PRIMARY KEY,
    inspect_type  CHAR(2) NOT NULL DEFAULT 'UT' CHECK (inspect_type = 'UT'),
    frequency     NUMERIC(5,2) NOT NULL,
    gain          NUMERIC(5,2),
    FOREIGN KEY (inspection_id, inspect_type)
        REFERENCES inspection (inspection_id, inspect_type)
);
```
`inspect_type`을 서브타입에도 두고 복합 FK를 거는 기법으로, **UT 서브타입 행이 RT 슈퍼타입 행을 참조하는 것**을 막습니다 (배타성 보장).

## 6. 전략 비교

| 항목 | A. 단일 테이블 | B. 서브타입별 | C. 슈퍼+서브 |
|---|---|---|---|
| 전체 목록 조회 | 빠름 | UNION 필요 | 슈퍼타입만 조회 |
| 유형별 상세 조회 | 빠름 | 빠름 | 조인 1회 |
| NULL 컬럼 | 많음 | 없음 | 없음 |
| 유형별 NOT NULL 강제 | CHECK로 가능 | 직접 가능 | 직접 가능 |
| 공통 속성 FK 참조 | 쉬움 | **어려움** (참조 대상이 3개) | 쉬움 |
| 유형 추가 | 컬럼 추가 | 테이블 추가 | 테이블 추가 |
| 전역 ID 유일성 | 자동 | 별도 시퀀스 공유 필요 | 자동 |
| JPA 매핑 | SINGLE_TABLE | TABLE_PER_CLASS | JOINED |

**선택 가이드**
- 서브타입 고유 속성이 적고, 전체 조회가 많다 → **A**
- 다른 테이블이 "검사"를 참조한다 (예: 결함 → 검사) → **C** (B는 FK를 걸 수 없음)
- 유형 간 공통 처리가 거의 없고, 각각 독립적으로 쓰인다 → **B**
- 확신이 없으면 → **C**가 가장 무난한 기본값

## 11강 정리

1. 식별 관계는 종속성과 조회 효율을, 비식별 관계는 유연성과 키 크기를 얻는다.
2. 계층이 깊으면 중간에서 대리키로 식별 관계를 끊는다.
3. 슈퍼/서브타입은 단일·서브타입별·슈퍼+서브 세 전략이 있고, 외부 참조 여부가 가장 중요한 기준이다.
4. 복합 FK에 유형 컬럼을 포함하면 배타적 서브타입을 DB로 강제할 수 있다.
