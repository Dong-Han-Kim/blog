---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 18강 — 이력·시간 모델링'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'Temporal', 'SCD']
description: '유효 시간과 거래 시간이라는 두 축을 구분하고 감사 로그·선분 이력·SCD Type 2·시스템 버전 테이블·이중 시간 모델을 비교한다. 반개구간과 기간 중첩 방지 제약까지 다룬다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 18

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '이력 모델링', '선분 이력', '유효 시간', '거래 시간', 'SCD Type 2', '시스템 버전 테이블', '이중 시간']
---

# DB 설계 A to Z 18강 — 이력·시간 모델링

계층이 공간 축의 구조라면, 이력은 시간 축의 구조입니다.

## 1. 이력의 두 가지 질문

| 질문 | 예시 |
|---|---|
| "그때 **사실**은 무엇이었나?" | 3월 1일 기준 B101 블록의 담당 협력사는? |
| "그때 **시스템이 알고 있던 것**은 무엇이었나?" | 3월 1일에 발행한 보고서에는 어느 협력사로 찍혀 있었나? |

두 질문이 다를 수 있습니다. 담당 협력사 변경을 3월 5일에 **소급 입력**했다면, 사실은 2월 25일부터 바뀌었지만 시스템은 3월 5일에야 알게 됩니다.

| 시간 축 | 의미 | 다른 이름 |
|---|---|---|
| 유효 시간 (Valid Time) | 현실에서 사실이 참인 기간 | 업무 시간, application time |
| 거래 시간 (Transaction Time) | DB에 그 사실이 기록되어 있던 기간 | 시스템 시간, system time |
| 이중 시간 (Bitemporal) | 두 축을 모두 관리 | |

## 2. 이력 패턴

**패턴 1: 스냅샷 없음 (덮어쓰기)** — 현재값만 필요
**패턴 2: 변경 로그 테이블**
```sql
CREATE TABLE block_vendor_log (
    log_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    block_id   BIGINT NOT NULL,
    old_vendor VARCHAR(10),
    new_vendor VARCHAR(10),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by VARCHAR(30) NOT NULL
);
```
감사(audit) 목적으로는 충분하지만, "3월 1일 기준 값"을 구하려면 로그를 재생해야 합니다.

**패턴 3: 선분 이력 (유효 기간)**
```sql
CREATE TABLE block_vendor_hist (
    block_id    BIGINT      NOT NULL,
    vendor_code VARCHAR(10) NOT NULL,
    valid_from  DATE        NOT NULL,
    valid_to    DATE        NOT NULL DEFAULT DATE '9999-12-31',
    PRIMARY KEY (block_id, valid_from),
    CHECK (valid_from < valid_to)
);

-- 3월 1일 기준 담당 협력사
SELECT vendor_code FROM block_vendor_hist
WHERE block_id = :id
  AND valid_from <= DATE '2026-03-01'
  AND valid_to   >  DATE '2026-03-01';
```
**반개구간 `[from, to)`** 을 사용하면 연속된 기간의 경계가 겹치지도 비지도 않습니다. `valid_to`를 NULL로 두면 모든 조회에 `OR valid_to IS NULL`이 붙으므로 **최대 날짜(9999-12-31)** 를 쓰는 것이 일반적입니다.

**기간 중첩 방지**
```sql
-- PostgreSQL: 배타 제약
ALTER TABLE block_vendor_hist ADD CONSTRAINT ex_no_overlap
  EXCLUDE USING gist (block_id WITH =, daterange(valid_from, valid_to) WITH &&);
```
다른 DBMS에서는 트리거나 "이전 행의 valid_to = 새 행의 valid_from"을 한 트랜잭션에서 처리하는 규약으로 보장합니다.

## 3. 이력과 현재값의 분리

| 방식 | 구조 | 장점 | 단점 |
|---|---|---|---|
| 이력 테이블만 | 현재값 = `valid_to = 9999-12-31` 행 | 단일 원천 | 현재값 조회에 조건 필요 |
| 현재 + 이력 | 현재 테이블 + 이력 테이블 | 현재값 조회 단순, FK 참조 쉬움 | 두 테이블 동기화 |

대부분의 쿼리가 현재값이라면 **현재 테이블 + 이력 테이블** 구조가 실용적입니다.

## 4. SCD (Slowly Changing Dimension)

데이터 웨어하우스에서 차원([20강](/posts/db-design-20-dimensional-modeling))의 변경을 다루는 분류입니다.

| 유형 | 방법 | 과거 보고서 재현 |
|---|---|---|
| Type 0 | 변경하지 않음 (최초 값 유지) | — |
| Type 1 | 덮어쓰기 | 불가 |
| Type 2 | 새 행 추가 (대리키 + 유효 기간 + 현재 여부) | 가능 |
| Type 3 | 이전 값 컬럼 추가 (`prev_vendor`) | 직전 1회만 |
| Type 4 | 현재 테이블 + 별도 이력 테이블 | 가능 |
| Type 6 | 1 + 2 + 3 혼합 (Type 2 행에 현재값 컬럼도 유지) | 가능, 현재 기준 분석도 쉬움 |

**Type 2 예시**
| block_sk | block_id | vendor_code | valid_from | valid_to | is_current |
|---|---|---|---|---|---|
| 1001 | 7 | V01 | 2026-01-01 | 2026-02-25 | N |
| 1002 | 7 | V02 | 2026-02-25 | 9999-12-31 | Y |

팩트 테이블은 `block_sk`를 참조하므로, 2월 이전 실적은 자동으로 V01에 귀속됩니다.

## 5. 시스템 버전 테이블 (Transaction Time)

SQL:2011 표준의 system-versioned table은 DBMS가 거래 시간을 자동 관리합니다.

```sql
-- SQL Server 2016+
CREATE TABLE block_vendor (
    block_id    BIGINT PRIMARY KEY,
    vendor_code VARCHAR(10) NOT NULL,
    sys_start   DATETIME2 GENERATED ALWAYS AS ROW START,
    sys_end     DATETIME2 GENERATED ALWAYS AS ROW END,
    PERIOD FOR SYSTEM_TIME (sys_start, sys_end)
) WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.block_vendor_history));

SELECT * FROM block_vendor FOR SYSTEM_TIME AS OF '2026-03-01';
```

| DBMS | 거래 시간 지원 |
|---|---|
| SQL Server | 시스템 버전 임시 테이블 |
| MariaDB | 시스템 버전 테이블 |
| Oracle | Flashback Data Archive, Flashback Query(undo 보관 범위 내) |
| PostgreSQL | 기본 기능 없음 → 트리거 기반 이력 또는 확장 |
| MySQL | 없음 → 트리거 또는 CDC |

CDC(Debezium)로 변경 이벤트를 수집해 이력 저장소에 쌓는 방식도 거래 시간 이력의 한 형태입니다.

## 6. 이중 시간 모델

```sql
CREATE TABLE block_vendor_bt (
    block_id    BIGINT      NOT NULL,
    vendor_code VARCHAR(10) NOT NULL,
    valid_from  DATE        NOT NULL,
    valid_to    DATE        NOT NULL,
    recorded_from TIMESTAMPTZ NOT NULL,
    recorded_to   TIMESTAMPTZ NOT NULL DEFAULT 'infinity',
    PRIMARY KEY (block_id, valid_from, recorded_from)
);
```
- 수정은 **행을 갱신하지 않고**, 기존 행의 `recorded_to`를 닫고 새 행을 추가합니다.
- "3월 3일에 시스템이 알던, 2월 28일의 사실": `valid` 축과 `recorded` 축 조건을 모두 겁니다.

금융, 보험, 급여 소급 정산, 규제 보고처럼 **과거 보고의 재현이 법적으로 필요**한 도메인에서 사용합니다. 일반 업무 시스템에서는 유효 시간 이력 + 감사 로그로 충분한 경우가 많습니다.

## 7. 설계 판단

| 요구 | 권장 |
|---|---|
| 누가 언제 바꿨는지만 알면 됨 | 감사 로그 (또는 CDC) |
| 특정 시점 기준 값으로 조회·집계 | 유효 시간 선분 이력 |
| 과거에 발행한 보고서를 그대로 재현 | 거래 시간 이력 |
| 소급 정정 + 과거 보고 재현 모두 | 이중 시간 |
| 분석용 차원의 변경 | SCD Type 2 (필요 시 6) |

## 18강 정리

1. 유효 시간(사실)과 거래 시간(기록)은 다른 축이다.
2. 선분 이력은 반개구간과 최대 날짜를 사용하고, 기간 중첩을 방지한다.
3. SCD는 차원 변경 처리의 분류이며, Type 2가 과거 재현의 기본이다.
4. 요구되는 질문에 따라 감사 로그, 선분 이력, 이중 시간 중 선택한다.
