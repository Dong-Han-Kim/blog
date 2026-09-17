---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 16강 — 파티셔닝 설계'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Partitioning', 'PostgreSQL']
description: '파티셔닝의 가장 큰 가치가 성능이 아니라 데이터 수명 관리인 이유, RANGE·LIST·HASH 방식과 DBMS별 구현, PK와 UNIQUE에 파티션 키를 포함해야 하는 제약, 파티셔닝을 하지 말아야 할 때를 정리한다. 시리즈 Part 3 "물리 설계"의 마지막 강이다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 16

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '파티셔닝', 'RANGE 파티션', '파티션 프루닝', '데이터 수명 관리', '로컬 인덱스', '글로벌 인덱스']
---

# DB 설계 A to Z 16강 — 파티셔닝 설계

인덱스로도 감당되지 않는 크기의 테이블에서 다음으로 검토하는 물리 설계 수단이 파티셔닝입니다. Part 3의 마지막 강입니다.

## 1. 파티셔닝의 진짜 목적

| 목적 | 효과 | 우선순위 |
|---|---|---|
| **데이터 수명 관리** | 오래된 파티션을 DROP/DETACH → 대량 DELETE 불필요 | 가장 큼 |
| 파티션 프루닝 | 조건에 맞는 파티션만 스캔 | 큼 |
| 유지보수 단위 축소 | 파티션별 VACUUM, 인덱스 재구성, 백업 | 중간 |
| 저장소 계층화 | 과거 파티션을 저렴한 스토리지로 | 중간 |

파티셔닝이 **모든 쿼리를 빠르게 하지는 않습니다.** 파티션 키 조건이 없는 쿼리는 모든 파티션을 탐색하므로 오히려 느려질 수 있습니다.

## 2. 파티셔닝 방식

| 방식 | 기준 | 적합한 데이터 |
|---|---|---|
| RANGE | 값의 구간 | 날짜 기반 이력, 로그, 실적 |
| LIST | 값의 목록 | 사업장, 지역, 테넌트 |
| HASH | 해시 값 | 균등 분산이 필요한 경우 |
| 복합 (서브파티션) | 두 기준 조합 | 사업장 × 월 |

## 3. 파티션 키 선정 기준

1. **대부분의 주요 쿼리 조건에 포함되는가** (프루닝)
2. **보관 정책의 기준인가** (삭제 단위)
3. 값이 **변경되지 않는가** (변경 시 파티션 간 행 이동)
4. 파티션 크기가 **적절히 균등한가**

[2강](/posts/db-design-02-requirements) 볼륨 프로파일의 작업실적(일 5만 건, 3년 보관)은 `work_date` 월 단위 RANGE가 적합합니다.

## 4. DBMS별 구현

**PostgreSQL (선언적 파티셔닝)**
```sql
CREATE TABLE work_record (
    work_id      BIGINT GENERATED ALWAYS AS IDENTITY,
    work_date    DATE NOT NULL,
    worker_id    BIGINT NOT NULL,
    block_id     BIGINT NOT NULL,
    process_code VARCHAR(10) NOT NULL,
    man_hours    NUMERIC(5,2) NOT NULL,
    PRIMARY KEY (work_id, work_date)          -- 파티션 키 포함 필수
) PARTITION BY RANGE (work_date);

CREATE TABLE work_record_2026_09 PARTITION OF work_record
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE work_record_default PARTITION OF work_record DEFAULT;
```

**MySQL**
```sql
CREATE TABLE work_record (
    work_id   BIGINT NOT NULL AUTO_INCREMENT,
    work_date DATE NOT NULL,
    ...
    PRIMARY KEY (work_id, work_date)
)
PARTITION BY RANGE COLUMNS (work_date) (
    PARTITION p202609 VALUES LESS THAN ('2026-10-01'),
    PARTITION p202610 VALUES LESS THAN ('2026-11-01'),
    PARTITION pmax    VALUES LESS THAN (MAXVALUE)
);
```

**Oracle (인터벌 파티셔닝: 파티션 자동 생성)**
```sql
CREATE TABLE work_record (...)
PARTITION BY RANGE (work_date)
INTERVAL (NUMTOYMINTERVAL(1, 'MONTH'))
(PARTITION p_init VALUES LESS THAN (DATE '2026-01-01'));
```

## 5. 파티셔닝이 설계에 주는 제약

| 제약 | PostgreSQL | MySQL | Oracle |
|---|---|---|---|
| PK/UNIQUE에 파티션 키 포함 | 필수 | 필수 (모든 UNIQUE) | 로컬 인덱스는 필수, **글로벌 인덱스는 불필요** |
| 파티션 테이블을 참조하는 FK | 12+ 지원 | **FK 자체 미지원** | 지원 |
| 파티션 자동 생성 | 없음 (pg_partman 등) | 없음 | 인터벌 파티셔닝 |

**PK 설계 영향:** `work_id` 단독으로는 전역 유일성을 DB가 보장하지 못합니다(PG, MySQL). IDENTITY나 UUIDv7로 생성하면 실질적 유일성은 확보되지만, 이것이 설계상 트레이드오프임을 인지해야 합니다.

**FK 영향:** 다른 테이블이 작업실적을 참조해야 한다면 복합 FK `(work_id, work_date)`가 필요하며, 이는 자식 테이블에도 `work_date` 컬럼을 요구합니다.

## 6. 로컬 인덱스 vs 글로벌 인덱스

| 항목 | 로컬 | 글로벌 |
|---|---|---|
| 구조 | 파티션마다 별도 인덱스 | 테이블 전체에 하나 |
| 파티션 DROP | 즉시 | 인덱스 갱신 필요 (Oracle `UPDATE GLOBAL INDEXES`) |
| 파티션 키 없는 조회 | 모든 파티션 인덱스 탐색 | 한 번 탐색 |
| 지원 | PG, MySQL은 로컬만 | Oracle, SQL Server는 둘 다 |

## 7. 수명 관리 자동화

```sql
-- PostgreSQL: 오래된 파티션 분리 후 아카이브
-- CONCURRENTLY는 14+, 단 DEFAULT 파티션이 있으면 사용할 수 없음
ALTER TABLE work_record DETACH PARTITION work_record_2023_08 CONCURRENTLY;
-- 백업 또는 분석 저장소로 이관 후
DROP TABLE work_record_2023_08;
```
월초 배치에서 **다음 달 파티션 미리 생성 + 보관 기간 초과 파티션 분리**를 함께 수행합니다. 파티션을 미리 만들지 않으면 DEFAULT 파티션에 데이터가 쌓여 나중에 분리하기 어려워집니다.

## 8. 파티셔닝을 하지 말아야 할 때

- 테이블이 수천만 건 미만이고 삭제 정책이 없다
- 주요 쿼리에 파티션 키 조건이 없다
- 파티션이 수천 개 이상이 된다 (계획 수립 비용, 파일 핸들 증가)
- 다른 테이블의 FK 참조가 많다 (특히 MySQL)

파티셔닝은 **샤딩과 다릅니다.** 파티셔닝은 한 DB 안의 분할이고, 샤딩은 여러 DB로의 분산입니다. 샤딩이 최후의 수단인 것처럼, 파티셔닝도 수명 관리 요구가 분명할 때 도입합니다.

## 16강 정리

1. 파티셔닝의 가장 큰 가치는 데이터 수명 관리와 프루닝이다.
2. 파티션 키는 주요 쿼리 조건이자 보관 기준이며, 변경되지 않아야 한다.
3. PK/UNIQUE에 파티션 키 포함, MySQL의 FK 미지원 등 논리 설계에 제약을 준다.
4. 파티션 생성과 분리는 자동화한다.
