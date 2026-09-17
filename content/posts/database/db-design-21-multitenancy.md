---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 21강 — 멀티테넌시 설계'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Multitenancy', 'SaaS', 'PostgreSQL']
description: '공유 테이블·스키마 분리·DB 분리를 확장성, 격리, 운영 비용으로 비교하고 tenant_id를 PK·UNIQUE·FK에 모두 포함하는 이유를 설명한다. RLS로 격리를 DB에서 강제할 때 커넥션 풀에서 생기는 함정도 다룬다. 시리즈 Part 4 "심화 모델링"의 마지막 강이다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 21

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '멀티테넌시', '공유 테이블', '스키마 분리', 'RLS', 'tenant_id', 'SaaS']
---

# DB 설계 A to Z 21강 — 멀티테넌시 설계

Part 4의 마지막 주제는 하나의 스키마를 여러 고객이 나눠 쓰는 구조입니다.

## 1. 테넌트란

하나의 시스템을 여러 고객(조직)이 **데이터가 격리된 상태로** 함께 쓰는 구조입니다. 예: 여러 조선소·협력사에 같은 공정관리 SaaS를 제공.

## 2. 세 가지 모델

| 모델 | 구조 | 격리 수준 |
|---|---|---|
| A. 공유 테이블 | 모든 테이블에 `tenant_id` | 논리적 (행 단위) |
| B. 스키마 분리 | 테넌트마다 스키마 | 네임스페이스 |
| C. DB 분리 | 테넌트마다 데이터베이스(또는 인스턴스) | 물리적 |

## 3. 비교

| 항목 | A. 공유 테이블 | B. 스키마 분리 | C. DB 분리 |
|---|---|---|---|
| 테넌트 수 확장 | 수만 이상 | 수백~수천 (카탈로그 비대) | 수십~수백 |
| 데이터 유출 위험 | 조건 누락 시 **높음** | 중간 (search_path 실수) | 낮음 |
| 스키마 변경 | 1회 | 테넌트 수만큼 | 테넌트 수만큼 |
| 테넌트별 백업·복구 | 어려움 | 보통 | 쉬움 |
| 테넌트별 성능 격리 | 어려움 (시끄러운 이웃) | 어려움 | 쉬움 |
| 테넌트 간 집계 | 쉬움 | UNION 필요 | 어려움 |
| 테넌트별 커스터마이징 | 어려움 | 가능 | 가능 |
| 운영 비용 | 낮음 | 중간 | 높음 |
| 규제·계약상 물리 분리 요구 | 충족 어려움 | 부분 충족 | 충족 |

앞서 정리한 원칙대로 **스키마 분리는 네임스페이스와 권한의 경계이지 성능이나 장애 격리 수단이 아닙니다.** 성능 격리가 필요하면 C를 검토해야 합니다.

## 4. 공유 테이블 모델 설계

**① 모든 키에 tenant_id를 선두로**
```sql
CREATE TABLE block (
    tenant_id  BIGINT NOT NULL,
    block_id   BIGINT NOT NULL,
    ship_no    VARCHAR(10) NOT NULL,
    block_name VARCHAR(20) NOT NULL,
    PRIMARY KEY (tenant_id, block_id),
    UNIQUE (tenant_id, ship_no, block_name),
    FOREIGN KEY (tenant_id, ship_no) REFERENCES ship (tenant_id, ship_no)
);
```
- UNIQUE를 `tenant_id` 없이 걸면, **다른 테넌트의 블록명과 충돌**합니다.
- FK에 `tenant_id`를 포함하면 **다른 테넌트의 호선을 참조하는 것**을 DB가 막습니다.
- InnoDB에서는 `tenant_id` 선두 PK가 테넌트 데이터를 물리적으로 모아 캐시 효율을 높입니다.

**② 행 수준 보안 (PostgreSQL RLS)**
```sql
ALTER TABLE block ENABLE ROW LEVEL SECURITY;
ALTER TABLE block FORCE ROW LEVEL SECURITY;   -- 테이블 소유자에게도 적용

CREATE POLICY tenant_isolation ON block
  USING (tenant_id = current_setting('app.tenant_id')::bigint)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::bigint);

-- 애플리케이션: 트랜잭션마다 설정
BEGIN;
SET LOCAL app.tenant_id = '42';
SELECT * FROM block;   -- 자동으로 tenant 42만
COMMIT;
```
- 커넥션 풀을 쓸 때는 `SET`이 아니라 **`SET LOCAL`** (트랜잭션 범위)을 사용해야 다른 요청에 설정이 남지 않습니다.
- 애플리케이션 DB 사용자는 `BYPASSRLS` 권한이 없어야 합니다.
- Oracle은 VPD(Virtual Private Database), SQL Server는 Row-Level Security로 같은 기능을 제공합니다. MySQL에는 기본 기능이 없어 뷰나 애플리케이션 계층에서 강제합니다.

**③ 시끄러운 이웃 대응**
- 대형 테넌트를 별도 DB로 분리할 수 있게 **처음부터 tenant_id를 모든 키에** 둡니다 (분리 시 키 충돌 없음, UUIDv7이나 전역 ID가 유리)
- 테넌트별 쿼리 타임아웃, 리소스 그룹

## 5. 스키마 분리 모델 주의점

```sql
SET search_path TO tenant_42, public;
```
- 커넥션 풀에서 `search_path`가 남아 **다른 테넌트 스키마를 조회**하는 사고가 대표적입니다.
- 테넌트가 늘면 마이그레이션을 수백 번 실행해야 하고, 일부 실패 시 **스키마 버전이 테넌트마다 달라지는** 상태를 관리해야 합니다.
- PostgreSQL 카탈로그(pg_class 등)가 커져 계획 수립과 백업이 느려집니다.
- Oracle에서는 스키마 = 사용자이므로, 테넌트별 사용자 + 시노님 설계와 결합됩니다.

## 6. 하이브리드

실무에서는 **기본은 공유 테이블, 대형·규제 테넌트는 DB 분리**로 운영하는 경우가 많습니다. 이를 위해 필요한 것:
- 테넌트 → DB 위치 매핑 테이블 (카탈로그 DB)
- 라우팅 계층 (애플리케이션 또는 프록시)
- 모든 모델에서 동일한 스키마 (tenant_id 컬럼은 DB 분리 모델에서도 유지)

## 21강 정리

1. 공유 테이블·스키마 분리·DB 분리는 확장성, 격리, 운영 비용의 트레이드오프다.
2. 공유 테이블에서는 tenant_id를 PK·UNIQUE·FK에 모두 포함한다.
3. RLS로 격리를 DB에서 강제하고, 커넥션 풀에서는 트랜잭션 범위 설정을 쓴다.
4. 처음부터 테넌트 분리 이전이 가능하도록 키를 설계한다.
