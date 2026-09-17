---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 5강 — 키의 종류'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'Primary Key', 'PostgreSQL']
description: '슈퍼키·후보키·기본키·대체키·외래키의 계층, 대체키에 UNIQUE를 빠뜨리는 흔한 실수, 자연키와 대리키의 선택 기준, 복합키의 크기 전파 문제와 복합 FK의 NULL 처리(MATCH FULL)를 다룬다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 5

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '데이터 모델링', '후보키', '기본키', '대체키', '슈퍼키', '자연키', '대리키', '복합키', 'MATCH FULL']
---

# DB 설계 A to Z 5강 — 키의 종류

Part 1의 마지막 강입니다. 논리 설계로 넘어가기 전에 키 개념을 정리합니다.

## 1. 키 계층

```
슈퍼키 ⊇ 후보키 ⊇ 기본키
              └── 대체키 (후보키 − 기본키)
```

| 키 | 정의 | 성질 |
|---|---|---|
| 슈퍼키 | 행을 유일하게 식별하는 속성 집합 | 유일성 |
| 후보키 | 최소한의 슈퍼키 | 유일성 + **최소성** |
| 기본키 | 후보키 중 대표로 선택한 것 | 유일성 + 최소성 + NOT NULL |
| 대체키 | 선택되지 않은 후보키 | UNIQUE 제약으로 구현 |
| 외래키 | 다른 릴레이션의 키를 참조 | 참조 무결성 |

## 2. 예제로 구분하기

작업자 테이블: `(사번, 주민번호해시, 이름, 협력사코드, 협력사내사번)`

| 속성 집합 | 슈퍼키? | 후보키? | 이유 |
|---|---|---|---|
| `{사번}` | O | O | 단독으로 유일 |
| `{주민번호해시}` | O | O | 단독으로 유일 |
| `{협력사코드, 협력사내사번}` | O | O | 조합으로 유일, 하나만으로는 불가 |
| `{사번, 이름}` | O | X | 이름을 빼도 유일 → 최소성 위반 |
| `{이름}` | X | X | 동명이인 |

→ 후보키 3개 중 **사번을 PK**로 선택하면 나머지 둘은 대체키이며 반드시 UNIQUE 제약을 걸어야 합니다.

```sql
CREATE TABLE worker (
    worker_id        BIGINT PRIMARY KEY,
    ssn_hash         CHAR(64) NOT NULL UNIQUE,
    vendor_code      VARCHAR(10) NOT NULL,
    vendor_emp_no    VARCHAR(20) NOT NULL,
    name             VARCHAR(50) NOT NULL,
    UNIQUE (vendor_code, vendor_emp_no)
);
```
**대체키에 UNIQUE를 빠뜨리는 것**이 대리키 도입 후 가장 흔한 실수입니다. 대리키는 유일하지만, 같은 작업자가 두 번 등록되는 것은 막지 못합니다.

## 3. 기본키 선택 기준

| 기준 | 설명 |
|---|---|
| 불변성 | 값이 바뀌지 않아야 한다 (PK 변경은 모든 FK로 전파) |
| 최소 길이 | 짧을수록 인덱스와 FK가 작아진다 |
| NOT NULL | 모든 행에 값이 있어야 한다 |
| 의미 없음(선택) | 업무 의미가 있으면 업무 변경 시 바뀔 위험 |

## 4. 자연키 vs 대리키

| 항목 | 자연키 (Natural Key) | 대리키 (Surrogate Key) |
|---|---|---|
| 예시 | 블록번호 `S2401-B101` | `block_id BIGINT` |
| 업무 의미 | 있음 | 없음 |
| 조인 없이 의미 파악 | 가능 | 불가 |
| 값 변경 위험 | 있음 (체계 개편) | 없음 |
| 크기 | 대체로 큼 (문자열, 복합) | 작음 (8바이트) |
| 중복 방지 | PK가 직접 보장 | **별도 UNIQUE 필요** |
| 외부 시스템 연동 | 공통 식별자로 유리 | 매핑 필요 |

**실무 결론**
- 코드성 마스터(공정코드, 통화코드 `KRW`): 자연키가 적합. 짧고 거의 안 바뀜
- 업무 엔티티(블록, 작업자, 주문): **대리키 + 자연키 UNIQUE** 조합이 기본값
- 연관 엔티티(블록공정): 부모 키 조합(복합키) 또는 대리키 → [11강](/posts/db-design-11-identifying-and-subtypes)에서 판단 기준 설명

## 5. 복합키의 크기 전파 문제

```
호선(ship_no)
 └ 블록(ship_no, block_seq)
    └ 블록공정(ship_no, block_seq, process_code)
       └ 작업실적(ship_no, block_seq, process_code, work_seq)
          └ 투입자재(ship_no, block_seq, process_code, work_seq, mat_seq)
```
식별 관계가 계속 이어지면 PK가 계속 길어집니다. InnoDB에서는 **모든 세컨더리 인덱스가 PK를 포함**하므로 이 비용이 인덱스마다 곱해집니다.

## 6. 외래키와 NULL

| FK 컬럼 | 의미 |
|---|---|
| NOT NULL | 필수 관계 (1,1) |
| NULL 허용 | 선택 관계 (0,1) |

복합 FK에서 일부만 NULL이면 대부분의 DBMS는 **참조 검사를 건너뜁니다** (SQL 표준의 MATCH SIMPLE 기본 동작). PostgreSQL은 `MATCH FULL`로 "전부 NULL이거나 전부 값"을 강제할 수 있습니다.

```sql
FOREIGN KEY (ship_no, block_seq) REFERENCES block (ship_no, block_seq) MATCH FULL
```

## 5강 정리

1. 후보키는 유일성과 최소성을 만족하며, PK로 선택되지 않은 후보키는 UNIQUE로 보호한다.
2. PK는 불변·짧음·NOT NULL이 핵심이다.
3. 업무 엔티티는 대리키 + 자연키 UNIQUE가 기본값이다.
4. 식별 관계가 깊어지면 복합키가 전파되어 인덱스 비용이 커진다.
