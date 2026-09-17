---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 22강 — 스키마 진화'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Migration', 'Schema Evolution', 'DevOps']
description: '롤링 배포에서 구·신 앱이 같은 스키마를 동시에 쓴다는 전제로 변경의 위험도를 분류하고, Expand–Contract 분해, 대용량 Backfill, DBMS별 온라인 DDL의 락 위험을 정리한다. 시리즈 Part 5 "시니어 레벨"의 첫 강이다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 22

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '스키마 진화', 'Expand-Contract', '온라인 DDL', 'Backfill', '마이그레이션', 'lock_timeout']
---

# DB 설계 A to Z 22강 — 스키마 진화

여기서부터 Part 5 시니어 레벨입니다. 완성된 설계를 그리는 일보다, 이미 돌아가는 설계를 안전하게 바꾸고 나누고 검증하는 일을 다룹니다.

## 1. 스키마는 반드시 바뀐다

설계가 아무리 좋아도 요구사항은 바뀝니다. 시니어 설계자의 역량은 처음부터 완벽한 스키마가 아니라, **운영 중인 스키마를 서비스 중단 없이, 데이터 손실 없이 바꾸는 능력**에 있습니다.

## 2. 변경의 위험도 분류

| 변경 | 호환성 | 위험 |
|---|---|---|
| NULL 허용 컬럼 추가 | 하위 호환 | 낮음 |
| 테이블 추가 | 하위 호환 | 낮음 |
| 인덱스 추가 | 하위 호환 | 중간 (생성 중 락·부하) |
| NOT NULL 제약 추가 | 기존 데이터 검증 필요 | 중간 |
| 컬럼 이름 변경 | **호환 깨짐** | 높음 |
| 컬럼 타입 변경 | 대부분 테이블 재작성 | 높음 |
| 컬럼·테이블 삭제 | **호환 깨짐** | 높음 |
| 테이블 분리·병합 | **호환 깨짐** | 매우 높음 |

**배포 순서의 원칙:** 애플리케이션과 DB는 동시에 바뀌지 않습니다. 롤링 배포 중에는 **구버전 앱과 신버전 앱이 같은 스키마를 동시에** 사용합니다. 따라서 모든 스키마 변경은 두 버전 모두와 호환되어야 합니다.

## 3. Expand–Contract 패턴

호환이 깨지는 변경을 호환되는 단계들로 쪼갭니다. 예: `block.weight`(kg, INT) → `block.weight_ton`(톤, NUMERIC)으로 변경

| 단계 | DB | 애플리케이션 |
|---|---|---|
| 1. Expand | `weight_ton` 컬럼 추가 (NULL 허용) | 변경 없음 |
| 2. 이중 쓰기 | — | 쓰기 시 두 컬럼 모두 기록 |
| 3. Backfill | 기존 행의 `weight_ton`을 배치로 채움 | — |
| 4. 읽기 전환 | — | `weight_ton`에서 읽기 |
| 5. 검증 | 두 컬럼 불일치 건수 확인, NOT NULL 추가 | — |
| 6. 쓰기 중단 | — | `weight` 쓰기 제거 |
| 7. Contract | `weight` 컬럼 삭제 | — |

각 단계 사이에서 **롤백이 가능**하다는 것이 핵심입니다. 4단계에서 문제가 생기면 읽기를 되돌리면 됩니다. 7단계만 되돌릴 수 없으므로, 충분한 관찰 기간 후에 실행합니다.

이중 쓰기는 앞서 학습한 것처럼 구조적 위험이 있지만, **같은 DB·같은 트랜잭션 안의 두 컬럼**이므로 원자성이 보장됩니다. 서로 다른 시스템 간 이중 쓰기와는 다릅니다. 앱 수정 대신 트리거로 동기화하는 방법도 있습니다.

## 4. 대용량 Backfill

```sql
-- 나쁜 예: 수천만 행을 한 트랜잭션으로
UPDATE block SET weight_ton = weight / 1000.0;

-- 좋은 예: 키 범위로 나눠 짧은 트랜잭션 반복
UPDATE block SET weight_ton = weight / 1000.0
WHERE block_id > :last_id AND block_id <= :last_id + 10000
  AND weight_ton IS NULL;
```
- 긴 트랜잭션은 **PostgreSQL에서 VACUUM을 막아 bloat**를 만들고, **InnoDB에서 undo 로그를 키우며**, 복제 지연을 유발합니다.
- 배치 사이에 짧은 대기를 두고 복제 지연을 모니터링합니다.
- 중단 후 재시작할 수 있도록 **멱등하게**(`AND weight_ton IS NULL`) 작성합니다.

## 5. DBMS별 온라인 DDL

**PostgreSQL**
```sql
-- 잠금 대기가 길어지면 뒤따르는 모든 쿼리가 막힌다 → 반드시 타임아웃
SET lock_timeout = '3s';

-- 컬럼 추가: 11+에서 비휘발성 DEFAULT도 메타데이터만 변경 (즉시)
ALTER TABLE block ADD COLUMN weight_ton NUMERIC(8,2);

-- 인덱스: 쓰기를 막지 않음 (트랜잭션 블록 안에서 실행 불가, 실패 시 INVALID 인덱스 정리 필요)
CREATE INDEX CONCURRENTLY ix_block_weight ON block (weight_ton);

-- NOT NULL: CHECK를 NOT VALID로 추가 → 별도로 검증 → NOT NULL 전환
ALTER TABLE block ADD CONSTRAINT ck_weight_nn CHECK (weight_ton IS NOT NULL) NOT VALID;
ALTER TABLE block VALIDATE CONSTRAINT ck_weight_nn;     -- 쓰기를 막지 않음
ALTER TABLE block ALTER COLUMN weight_ton SET NOT NULL;  -- 12+: 유효한 CHECK가 있으면 스캔 생략
ALTER TABLE block DROP CONSTRAINT ck_weight_nn;

-- FK도 같은 방식
ALTER TABLE work_record ADD CONSTRAINT fk_work_block
  FOREIGN KEY (block_id) REFERENCES block (block_id) NOT VALID;
ALTER TABLE work_record VALIDATE CONSTRAINT fk_work_block;
```

**MySQL 8.0**
```sql
-- INSTANT: 메타데이터만 변경 (8.0.29+ 임의 위치 컬럼 추가/삭제 지원)
ALTER TABLE block ADD COLUMN weight_ton DECIMAL(8,2), ALGORITHM=INSTANT;

-- INPLACE + LOCK=NONE: 테이블을 복사하지 않고 동시 DML 허용
ALTER TABLE block ADD INDEX ix_block_weight (weight_ton), ALGORITHM=INPLACE, LOCK=NONE;
```
알고리즘을 **명시**하면, 해당 방식이 불가능할 때 조용히 테이블 복사로 넘어가지 않고 오류를 냅니다. 타입 변경처럼 복사가 필요한 작업은 **gh-ost**나 **pt-online-schema-change** 같은 도구로 섀도 테이블을 만들어 전환합니다.

**Oracle**
- `CREATE INDEX ... ONLINE`, `ALTER TABLE ... MOVE ONLINE`(12.2+)
- `DBMS_REDEFINITION`으로 온라인 테이블 재정의
- Edition-Based Redefinition으로 구버전·신버전 코드가 서로 다른 뷰(에디셔닝 뷰)를 보게 할 수 있습니다

## 6. 이름 변경과 테이블 분리

**컬럼 이름 변경**은 "새 컬럼 추가 + 이중 쓰기 + 이관 + 구 컬럼 삭제"(Expand–Contract)로 처리하거나, 뷰를 호환 계층으로 둡니다.

**테이블 분리** (block에서 도장 사양을 block_coating으로 분리)
1. `block_coating` 생성
2. 이중 쓰기 또는 트리거 동기화
3. Backfill
4. 읽기를 새 테이블로 전환
5. 구 컬럼 쓰기 중단 → 삭제

[1강](/posts/db-design-01-what-is-design)에서 본 **논리적 독립성**을 여기서 활용합니다. 애플리케이션이 뷰를 통해 접근하고 있었다면, 테이블을 분리한 뒤 뷰 정의만 바꿔 호환을 유지할 수 있습니다.

## 7. 마이그레이션 관리

| 원칙 | 설명 |
|---|---|
| 버전 관리 | 모든 DDL은 Flyway, Liquibase, Prisma Migrate 등으로 저장소에 기록 |
| 불변 | 이미 적용된 마이그레이션 파일은 수정하지 않고 새 파일로 보정 |
| 전진 우선 | 롤백 스크립트보다 **다음 단계로 고치는 것**을 기본으로 (데이터 삭제는 되돌릴 수 없음) |
| 분리 | 스키마 변경과 대량 데이터 변경을 한 마이그레이션에 넣지 않음 |
| 검증 | 운영과 같은 규모의 데이터로 소요 시간과 락을 측정 |
| 환경 일치 | 개발·검증·운영 스키마 차이를 자동 비교 |

폐쇄망 환경처럼 배포 창구가 제한된 곳에서는, 마이그레이션 스크립트와 **예상 소요 시간, 잠금 여부, 중단 시 복구 방법**을 한 문서로 묶어 전달하는 것이 안전합니다.

## 22강 정리

1. 롤링 배포에서는 구·신 앱이 같은 스키마를 동시에 쓰므로 모든 변경은 양쪽과 호환되어야 한다.
2. 호환이 깨지는 변경은 Expand–Contract로 되돌릴 수 있는 단계로 나눈다.
3. Backfill은 짧은 트랜잭션, 멱등성, 복제 지연 감시가 핵심이다.
4. lock_timeout, CONCURRENTLY, NOT VALID, ALGORITHM 명시로 온라인 DDL의 위험을 줄인다.

## 더 깊이

- 여기서 다룬 스키마 변경을 배포 파이프라인에 어떻게 얹는지는 [풀스택 개발자를 위한 CI/CD 8강 — 배포 전략, 롤백, DB 마이그레이션](/posts/cicd-08-deployment-strategies-db-migration)에서 이어집니다.
