---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 8강 — 정규화 1NF ~ BCNF'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'Normalization', 'PostgreSQL']
description: '1NF부터 BCNF까지 각 정규형이 제거하는 대상, 종속성 보존을 기준으로 한 3NF와 BCNF의 선택, 3NF 합성과 BCNF 분해 알고리즘, 무손실 조인 검사를 예제와 DDL로 정리한다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 8

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '데이터 모델링', '정규화', '1NF', '2NF', '3NF', 'BCNF', '종속성 보존', '무손실 조인']
---

# DB 설계 A to Z 8강 — 정규화 1NF ~ BCNF

[7강의 함수 종속성](/posts/db-design-07-anomalies-and-fd)을 이용해 테이블을 단계별로 분해합니다.

## 1. 정규화의 목표

- 이상현상 제거
- 분해 후에도 **정보 손실이 없을 것** (무손실 조인)
- 분해 후에도 **FD를 검사할 수 있을 것** (종속성 보존)

## 2. 제1정규형 (1NF)

> 모든 속성값이 원자값(atomic)이다. 반복 그룹이 없다.

**위반 예**
| worker_id | name | certificates |
|---|---|---|
| 1 | 김철수 | 용접기능사, 도장기능사 |

**위반 예 (반복 컬럼)**
| worker_id | cert1 | cert2 | cert3 |
|---|---|---|---|

**해결** → [6강](/posts/db-design-06-er-to-relational)의 `worker_certificate` 테이블

"원자값"의 판단은 **업무가 그 값을 쪼개서 쓰는가**에 달려 있습니다. 전화번호를 통째로만 쓰면 원자값이고, 지역번호별 통계를 낸다면 원자값이 아닙니다. PostgreSQL 배열·JSON 컬럼은 이 판단을 흐리게 만드는데, **그 내부 값으로 검색·조인·제약을 걸어야 한다면 분리**하는 것이 원칙입니다 ([19강](/posts/db-design-19-flexible-structures)).

## 3. 제2정규형 (2NF)

> 1NF이고, 키가 아닌 속성이 **후보키 전체**에 완전 함수 종속한다. (부분 종속 없음)

7강의 테이블에서 부분 종속:
```
{block_no, process_code} → ship_no      (block_no만으로 결정)
{block_no, process_code} → process_name (process_code만으로 결정)
```

**분해**
| 테이블 | 속성 |
|---|---|
| R1 | block_no, ship_no, ship_owner |
| R2 | process_code, process_name |
| R3 | block_no, process_code, plan_date |

**참고:** 후보키가 단일 속성이면 부분 종속이 존재할 수 없으므로 자동으로 2NF입니다. 대리키만 PK로 둔 테이블도 **다른 후보키(복합 자연키)에 대한 부분 종속**은 여전히 검사해야 합니다.

## 4. 제3정규형 (3NF)

> 2NF이고, 키가 아닌 속성이 후보키에 이행적으로 종속하지 않는다.

형식적 정의: 모든 FD X → A에 대해 다음 중 하나가 성립한다.
- X → A가 자명하다
- X가 슈퍼키다
- A가 어떤 후보키의 일부(주요 속성)다

R1에서: `block_no → ship_no → ship_owner` (이행적 종속)

**분해**
| 테이블 | 속성 |
|---|---|
| R1a | block_no, ship_no |
| R1b | ship_no, ship_owner |

**최종 3NF 결과**
```
ship(ship_no, ship_owner)
block(block_no, ship_no)
process(process_code, process_name)
block_process(block_no, process_code, plan_date)
```
[1강](/posts/db-design-01-what-is-design)의 설계와 같은 구조입니다. 좋은 개념 모델링은 대부분 3NF를 자연스럽게 만듭니다.

## 5. BCNF (Boyce-Codd 정규형)

> 모든 비자명 FD X → A에서 X가 슈퍼키다.

3NF의 세 번째 예외(A가 주요 속성)를 없앤 것입니다. 3NF이지만 BCNF가 아닌 경우는 **후보키가 여러 개이고 서로 겹칠 때** 생깁니다.

**예제:** 용접 검사 배정
- 업무 규칙 1: 감독관은 한 가지 검사 종류만 담당한다 → `inspector → inspect_type`
- 업무 규칙 2: 한 블록의 한 검사 종류는 한 감독관이 맡는다 → `{block_no, inspect_type} → inspector`

| block_no | inspect_type | inspector |
|---|---|---|
| B101 | UT | 이감독 |
| B101 | RT | 박감독 |
| B102 | UT | 이감독 |

후보키: `{block_no, inspect_type}`, `{block_no, inspector}`
- `inspector → inspect_type`: 결정자 inspector는 슈퍼키가 아님
- 하지만 inspect_type이 후보키의 일부 → **3NF는 만족, BCNF는 위반**

이상현상: 이감독이 담당 종류를 RT로 바꾸면 여러 행을 고쳐야 합니다.

**BCNF 분해**
```
inspector_type(inspector, inspect_type)   -- PK: inspector
block_inspector(block_no, inspector)      -- PK: (block_no, inspector)
```
**대가:** `{block_no, inspect_type} → inspector` 규칙을 어느 한 테이블에서 검사할 수 없게 됩니다. 한 블록에 같은 종류의 감독관 두 명이 배정되는 것을 막으려면 조인이 필요합니다. 즉 **종속성 보존이 깨집니다.**

## 6. 3NF vs BCNF 선택

| 항목 | 3NF | BCNF |
|---|---|---|
| 무손실 조인 | 항상 가능 | 항상 가능 |
| 종속성 보존 | **항상 가능** (합성 알고리즘) | 보장되지 않음 |
| 잔여 중복 | 약간 있을 수 있음 | 없음 (FD 기준) |

실무 선택 기준:
- 깨지는 FD를 **트리거나 앱으로 검증할 수 있고 갱신 빈도가 높다** → BCNF
- 깨지는 FD가 핵심 업무 규칙이고 **DB 제약으로 반드시 강제**해야 한다 → 3NF 유지, 중복은 감수

위 예제는 PostgreSQL이라면 BCNF 분해 후, `block_inspector`에 `inspect_type`을 중복 보관하고 복합 FK + UNIQUE로 규칙을 강제하는 절충도 가능합니다.
```sql
CREATE TABLE inspector_type (
    inspector    VARCHAR(20) PRIMARY KEY,
    inspect_type VARCHAR(10) NOT NULL,
    UNIQUE (inspector, inspect_type)          -- 복합 FK 대상
);

CREATE TABLE block_inspector (
    block_no     VARCHAR(20) NOT NULL,
    inspector    VARCHAR(20) NOT NULL,
    inspect_type VARCHAR(10) NOT NULL,
    PRIMARY KEY (block_no, inspector),
    UNIQUE (block_no, inspect_type),          -- 규칙 2 강제
    FOREIGN KEY (inspector, inspect_type)
        REFERENCES inspector_type (inspector, inspect_type)
        ON UPDATE CASCADE                     -- 규칙 1 정합성 유지
);
```
이 절충은 "중복을 두되 **DB가 일관성을 보장하는 중복**"이라는 점에서 [10강 반정규화](/posts/db-design-10-denormalization)의 좋은 모델이기도 합니다.

## 7. 분해의 두 가지 알고리즘

**3NF 합성 알고리즘**
1. 최소 커버를 구한다
2. 좌변이 같은 FD끼리 묶어 각각 테이블을 만든다
3. 어떤 테이블도 후보키를 포함하지 않으면 후보키로 테이블을 하나 추가한다
4. 다른 테이블에 포함되는 테이블은 제거한다

**BCNF 분해 알고리즘**
1. BCNF 위반 FD X → Y를 찾는다
2. R을 (X ∪ Y)와 (R − Y)로 나눈다
3. 각 결과에 대해 반복한다

## 8. 무손실 조인 검사

R을 R1, R2로 분해했을 때 다음 중 하나가 성립하면 무손실입니다.
```
(R1 ∩ R2) → R1   또는   (R1 ∩ R2) → R2
```
**공통 속성이 한쪽의 키이면 안전**합니다. 공통 속성이 어느 쪽의 키도 아니면, 조인 시 원래 없던 행(가짜 튜플)이 생깁니다.

## 8강 정리

| 정규형 | 제거 대상 |
|---|---|
| 1NF | 반복 그룹, 비원자값 |
| 2NF | 부분 함수 종속 |
| 3NF | 이행적 함수 종속 |
| BCNF | 슈퍼키가 아닌 결정자 |

1. 좋은 개념 모델은 대부분 3NF를 자연스럽게 만든다.
2. BCNF는 종속성 보존을 포기할 수 있으므로 3NF와 비교해 선택한다.
3. 대리키가 있어도 자연 후보키 기준으로 정규형을 검사한다.
