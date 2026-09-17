---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 13강 — 제약조건 설계'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Constraint', 'PostgreSQL']
description: 'NOT NULL·CHECK·UNIQUE·FOREIGN KEY부터 지연 제약과 배타 제약까지, 앱 검증이 우회되는 경로를 DB가 막는 방법을 정리한다. UNIQUE의 NULL 처리가 DBMS마다 다른 지점과 소프트 삭제를 부분 인덱스로 푸는 방법도 다룬다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 13

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '제약조건', 'NOT NULL', 'CHECK', 'UNIQUE', 'FOREIGN KEY', '지연 제약', '배타 제약']
---

# DB 설계 A to Z 13강 — 제약조건 설계

앞 강에서 타입으로 표현할 수 있는 도메인을 정했다면, 이번에는 타입만으로는 표현되지 않는 업무 규칙을 제약조건으로 옮깁니다.

## 1. 제약조건은 마지막 방어선

애플리케이션 검증은 **우회될 수 있습니다.** 배치, 운영자 직접 수정, 다른 서비스, 마이그레이션 스크립트는 앱 검증을 거치지 않습니다. [2강](/posts/db-design-02-requirements)에서 분류한 업무 규칙 중 DB로 표현 가능한 것은 DB에 둡니다.

| 규칙 유형 | DB 수단 |
|---|---|
| 필수값 | NOT NULL |
| 값 범위 | CHECK, 도메인 타입 |
| 유일성 | PRIMARY KEY, UNIQUE |
| 참조 | FOREIGN KEY |
| 행 간 비중첩 | EXCLUDE (PostgreSQL) |
| 기본값 | DEFAULT |

## 2. NOT NULL

NULL은 "모름", "해당 없음", "아직 없음" 등 여러 의미가 섞이기 쉽습니다.
- 가능한 한 NOT NULL을 기본으로 하고, NULL 허용에는 **의미를 문서화**합니다. (예: `actual_date IS NULL` = 미완료)
- NULL은 `=` 비교, `NOT IN`, 집계에서 예상과 다르게 동작합니다.

```sql
-- sub-query 결과에 NULL이 하나라도 있으면 결과가 0건
SELECT * FROM block WHERE block_id NOT IN (SELECT block_id FROM work_record);
-- 안전한 형태
SELECT * FROM block b WHERE NOT EXISTS (SELECT 1 FROM work_record w WHERE w.block_id = b.block_id);
```

## 3. CHECK

```sql
ALTER TABLE block_process ADD CONSTRAINT ck_dates
  CHECK (actual_date IS NULL OR actual_date >= plan_date - INTERVAL '30 day');

ALTER TABLE work_record ADD CONSTRAINT ck_mh
  CHECK (man_hours > 0 AND man_hours <= 24);
```
- MySQL은 **8.0.16부터** CHECK를 실제로 검사합니다. 이전 버전은 문법만 허용하고 무시했습니다.
- CHECK는 같은 행의 컬럼만 참조할 수 있습니다. 다른 테이블 조회가 필요하면 FK나 트리거로 설계합니다.
- `CURRENT_DATE` 같은 비결정적 함수는 대부분의 DBMS에서 CHECK에 쓸 수 없습니다.

## 4. UNIQUE와 NULL

| DBMS | UNIQUE 컬럼에 NULL 여러 개 |
|---|---|
| PostgreSQL | 허용 (15+에서 `NULLS NOT DISTINCT`로 금지 가능) |
| MySQL | 허용 |
| Oracle | 허용 (모든 키 컬럼이 NULL인 행은 인덱스에 들어가지 않음) |
| SQL Server | **NULL 1개만 허용** → 필터 인덱스로 우회 |

```sql
-- SQL Server: NULL이 아닌 값만 유일
CREATE UNIQUE INDEX ux_worker_email ON worker(email) WHERE email IS NOT NULL;
```

**소프트 삭제와 UNIQUE**
`deleted_at`으로 논리 삭제하면, 삭제된 블록명과 같은 이름으로 재등록할 수 없는 문제가 생깁니다.
```sql
-- PostgreSQL / SQL Server: 부분(필터) 인덱스
CREATE UNIQUE INDEX ux_block_name_active
  ON block (ship_no, block_name) WHERE deleted_at IS NULL;

-- MySQL: 부분 인덱스 미지원 → 생성 컬럼 트릭
ALTER TABLE block
  ADD COLUMN active_flag TINYINT
  GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) STORED,
  ADD UNIQUE KEY ux_block_name_active (ship_no, block_name, active_flag);
```
MySQL 방식은 삭제된 행의 `active_flag`가 NULL이 되어 UNIQUE 검사에서 빠지는 성질을 이용합니다.

## 5. FOREIGN KEY

**참조 동작**
| 동작 | 부모 삭제/변경 시 | 사용처 |
|---|---|---|
| NO ACTION / RESTRICT | 자식이 있으면 거부 | 기본값, 대부분의 경우 |
| CASCADE | 자식도 삭제/변경 | 약한 엔티티, 부분-전체 관계 |
| SET NULL | 자식 FK를 NULL로 | 선택 관계 (반장 퇴사 → 반장 없음) |
| SET DEFAULT | 자식 FK를 기본값으로 | 드묾 |

CASCADE는 **삭제 범위가 눈에 보이지 않는다**는 위험이 있습니다. 호선 삭제 → 블록 → 블록공정 → 작업실적 수백만 건이 한 트랜잭션에서 삭제되어 락과 로그가 폭증할 수 있습니다. 업무 핵심 데이터는 RESTRICT로 두고 삭제를 명시적인 절차로 만드는 것이 안전합니다.

**FK 컬럼 인덱스**
| DBMS | FK 인덱스 자동 생성 |
|---|---|
| MySQL InnoDB | 자동 생성 (없으면 만듦) |
| PostgreSQL | **생성 안 함** |
| Oracle | **생성 안 함** — 부모 PK 변경·삭제 시 자식 테이블에 락 경합 발생 가능 |
| SQL Server | 생성 안 함 |

부모 행을 삭제하면 DB는 자식 테이블에서 참조 행을 찾아야 합니다. FK 컬럼에 인덱스가 없으면 **자식 테이블 전체 스캔**이 일어납니다. PostgreSQL·Oracle·SQL Server에서는 FK 컬럼 인덱스를 직접 만드는 것을 기본 규칙으로 합니다.

**FK를 쓰지 않는 조직에 대해**
대규모 서비스에서 FK를 생략하는 경우가 있습니다 (샤딩, 온라인 스키마 변경 도구 제약, 쓰기 성능). 이때 잃는 것은 **참조 무결성의 보장**이며, 대신 다음이 필요합니다.
- 고아 레코드 탐지 배치 (anti-join 쿼리)
- 삭제 순서를 강제하는 애플리케이션 계층
- 논리적 FK를 문서/ERD에 명시

일반적인 업무 시스템에서는 **FK를 두는 것이 기본값**입니다.

## 6. 지연 제약 (Deferrable)

순환 참조나 일괄 교체 시 제약 검사를 커밋 시점으로 미룹니다.
```sql
-- PostgreSQL, Oracle
ALTER TABLE worker ADD CONSTRAINT fk_leader
  FOREIGN KEY (leader_id) REFERENCES worker(worker_id)
  DEFERRABLE INITIALLY IMMEDIATE;

BEGIN;
SET CONSTRAINTS fk_leader DEFERRED;
-- 서로를 참조하는 행 삽입
COMMIT;  -- 이 시점에 검사
```
MySQL과 SQL Server는 지연 제약을 지원하지 않습니다.

## 7. 배타 제약 (PostgreSQL)

"같은 작업자의 작업 시간대가 겹치면 안 된다" 같은 행 간 규칙입니다.
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE work_shift (
    worker_id BIGINT NOT NULL,
    period    TSTZRANGE NOT NULL,
    EXCLUDE USING gist (worker_id WITH =, period WITH &&)
);
```
다른 DBMS에서는 트리거 또는 직렬화 가능 격리 수준 + 애플리케이션 검사로 구현합니다. 트리거로 구현할 때는 **동시성**(두 트랜잭션이 동시에 검사를 통과)을 반드시 고려해야 합니다.

## 8. 제약조건 명명 규칙

```
pk_<table>
fk_<child>_<parent>
uq_<table>_<columns>
ck_<table>_<meaning>
ix_<table>_<columns>
```
이름이 있으면 오류 메시지에서 원인을 바로 알 수 있고, 마이그레이션에서 제약을 정확히 지정할 수 있습니다.

## 13강 정리

1. 앱 검증은 우회되므로 DB 제약이 마지막 방어선이다.
2. UNIQUE의 NULL 처리는 DBMS마다 다르며, 소프트 삭제는 부분 인덱스로 해결한다.
3. CASCADE는 삭제 범위를 숨기므로 핵심 데이터에는 신중히 쓴다.
4. PostgreSQL·Oracle·SQL Server는 FK 인덱스를 직접 만든다.
5. 행 간 규칙은 동시성까지 고려해 구현한다.
