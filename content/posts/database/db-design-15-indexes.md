---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 15강 — 인덱스 설계'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Index', 'Query Optimization']
description: '인덱스를 테이블이 아니라 쿼리에서 역산하는 절차, 복합 인덱스의 컬럼 순서 규칙, 커버링 인덱스, 인덱스를 타지 못하는 패턴, 그리고 인덱스가 청구하는 쓰기·공간·캐시 비용을 정리한다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 15

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '인덱스', '복합 인덱스', '커버링 인덱스', '부분 인덱스', '실행 계획', '쿼리 프로파일']
---

# DB 설계 A to Z 15강 — 인덱스 설계

여기까지가 무엇을 저장할지에 대한 결정이었다면, 인덱스부터는 저장한 것을 어떻게 찾을지에 대한 결정입니다.

## 1. 인덱스는 쿼리에서 역산한다

인덱스 설계의 입력은 테이블 구조가 아니라 **[2강](/posts/db-design-02-requirements)의 쿼리 프로파일**입니다.

| 쿼리 | 빈도 | 조건 | 정렬 |
|---|---|---|---|
| Q1 호선 블록 목록 | 높음 | ship_no = ? | block_name |
| Q2 기간별 작업실적 | 높음 | work_date BETWEEN ? AND ? | — |
| Q3 작업자별 최근 실적 | 중간 | worker_id = ? | work_date DESC LIMIT 20 |
| Q4 공정·기간별 실적 합계 | 중간 | process_code = ? AND work_date BETWEEN ? AND ? | — |

## 2. 복합 인덱스 컬럼 순서

B-Tree 복합 인덱스는 **앞 컬럼 순으로 정렬**됩니다. 따라서 앞 컬럼 조건 없이 뒤 컬럼만으로는 범위를 좁히지 못합니다.

**순서 원칙: 등치(Equality) → 정렬(Sort) → 범위(Range)**

```sql
-- Q4: 등치(process_code) 먼저, 범위(work_date) 나중
CREATE INDEX ix_work_proc_date ON work_record (process_code, work_date);

-- Q3: 등치(worker_id) + 정렬(work_date) → 정렬 작업 없이 앞에서 20건만 읽음
CREATE INDEX ix_work_worker_date ON work_record (worker_id, work_date DESC);
```

**왜 범위를 뒤에 두는가**
`(work_date, process_code)` 순서라면 날짜 범위의 모든 항목을 스캔하면서 공정코드를 필터링합니다. `(process_code, work_date)`는 해당 공정의 해당 기간만 정확히 읽습니다.

| 인덱스 | Q4 탐색 범위 |
|---|---|
| (work_date, process_code) | 기간 내 **모든 공정** 항목 |
| (process_code, work_date) | 기간 내 **해당 공정** 항목만 |

"선택도가 높은 컬럼을 앞에"라는 통념보다 **등치/범위 구분이 우선**입니다. 선택도는 등치 컬럼들 사이의 순서를 정할 때 참고합니다.

## 3. 커버링 인덱스

쿼리에 필요한 모든 컬럼이 인덱스에 있으면 테이블 접근을 생략합니다.

```sql
-- Q4에서 man_hours 합계까지 인덱스로 해결
-- PostgreSQL 11+, SQL Server: INCLUDE 절 (키가 아닌 부가 컬럼)
CREATE INDEX ix_work_proc_date_cov
  ON work_record (process_code, work_date) INCLUDE (man_hours);

-- MySQL, Oracle: 키 컬럼에 포함
CREATE INDEX ix_work_proc_date_cov ON work_record (process_code, work_date, man_hours);
```
- InnoDB 세컨더리 인덱스는 **PK 컬럼을 자동 포함**하므로, PK를 조회하는 쿼리는 이미 커버됩니다.
- PostgreSQL의 Index Only Scan은 **visibility map**에 의존하므로, VACUUM이 밀린 테이블에서는 효과가 떨어집니다. (MVCC 학습 내용과 연결)

## 4. 인덱스가 사용되지 않는 패턴

| 패턴 | 예시 | 해결 |
|---|---|---|
| 컬럼 가공 | `WHERE TRUNC(work_date) = ...` | 범위 조건으로 변경 또는 함수 인덱스 |
| 암묵적 형변환 | 문자열 컬럼에 숫자 비교 `WHERE block_no = 101` | 타입 일치 |
| 앞 와일드카드 | `LIKE '%B101'` | 역순 인덱스, trigram(pg_trgm), 전문 검색 |
| 선두 컬럼 누락 | (process_code, work_date)에 work_date만 조건 | 별도 인덱스 (일부 DBMS의 Skip Scan은 선두 카디널리티가 낮을 때만 유효) |
| OR 조건 | `WHERE a = ? OR b = ?` | UNION ALL 분리 또는 비트맵 결합 |
| 부정 조건 | `status <> 'DONE'` | 긍정 조건으로 변환, 부분 인덱스 |

## 5. 부분 인덱스와 함수 인덱스

```sql
-- 미완료 공정만 자주 조회 (전체의 5%)
CREATE INDEX ix_bp_open ON block_process (plan_date) WHERE actual_date IS NULL;   -- PG, SQL Server(필터)

-- 대소문자 무시 검색
CREATE INDEX ix_worker_email_lower ON worker (lower(email));    -- PG, Oracle, MySQL 8.0.13+
```
Oracle에는 부분 인덱스가 없지만, **모든 키가 NULL인 행은 인덱싱되지 않는** 성질을 이용해 `CASE WHEN actual_date IS NULL THEN plan_date END` 함수 인덱스로 같은 효과를 냅니다.

## 6. 인덱스의 비용

| 비용 | 설명 |
|---|---|
| 쓰기 | INSERT/DELETE마다 모든 인덱스 갱신, UPDATE는 인덱스 컬럼 변경 시 |
| 공간 | 테이블보다 인덱스가 큰 경우도 흔함 |
| 캐시 | 인덱스도 버퍼 풀을 차지 |
| PG HOT 업데이트 | 인덱스 컬럼을 갱신하면 HOT가 불가 → bloat 증가 |
| 옵티마이저 | 인덱스가 많으면 계획 선택 비용 증가, 잘못된 선택 가능성 |

**중복 인덱스 제거:** `(a)`와 `(a, b)`가 있으면 `(a)`는 대부분 불필요합니다. (단, `(a)`가 UNIQUE 제약이면 유지)

## 7. 인덱스 종류

| 종류 | 용도 | 지원 |
|---|---|---|
| B-Tree | 등치, 범위, 정렬 | 전부 |
| Hash | 등치만 | PG, MySQL(MEMORY) |
| GIN | 배열, JSONB, 전문 검색 | PG |
| GiST / SP-GiST | 범위, 공간, 근접 | PG |
| BRIN | 물리적으로 정렬된 대용량 (시계열) | PG |
| Bitmap | 낮은 카디널리티, DW | Oracle |
| Columnstore | 분석 쿼리 | SQL Server |

```sql
-- 작업실적이 날짜 순서대로 쌓인다면 BRIN은 B-Tree의 수백분의 1 크기
CREATE INDEX ix_work_date_brin ON work_record USING brin (work_date);
```

## 8. 인덱스 설계 절차

1. 쿼리 프로파일에서 빈도 × 비용이 큰 쿼리를 고른다
2. 각 쿼리에 대해 등치 → 정렬 → 범위 순 후보 인덱스를 만든다
3. 후보들을 합쳐 **공통 접두사를 공유**하도록 통합한다
4. FK 컬럼 인덱스를 추가한다 ([13강](/posts/db-design-13-constraints))
5. 실행 계획으로 검증한다 (`EXPLAIN ANALYZE`, `EXPLAIN FORMAT=TREE`, `DBMS_XPLAN`)
6. 운영 중 **사용되지 않는 인덱스**를 주기적으로 찾는다 (`pg_stat_user_indexes`, `sys.schema_unused_indexes`)

## 15강 정리

1. 인덱스는 테이블이 아니라 쿼리에서 역산한다.
2. 복합 인덱스는 등치 → 정렬 → 범위 순서가 기본이다.
3. 커버링 인덱스는 테이블 접근을 없애지만 PG에서는 VACUUM 상태에 의존한다.
4. 인덱스는 쓰기·공간·캐시 비용이 있으므로 사용 여부를 계속 점검한다.

## 더 깊이

- 인덱스를 잘못 걸었을 때 나타나는 전형적인 증상과 처방은 [데이터베이스 안티패턴과 디자인 패턴 — 쇼핑몰 예제로 정리하기](/posts/db-antipatterns-and-design-patterns)에 사례로 정리되어 있습니다.
- 여기서 설계한 인덱스가 실제 요청 경로에서 어떻게 쓰이는지는 [요청 한 건의 일생 3편 — 커넥션 풀을 지나 DB에 닿았다가 JSON으로 돌아오기까지](/posts/request-lifecycle-03-db-and-response)에서 쿼리 한 건을 따라가며 볼 수 있습니다.
- 그 인덱스가 부하에서 어디부터 무너지는지는 [요청 한 건의 일생 4편 — 트랜잭션과 커넥션 풀, 부하에서 먼저 무너지는 지점](/posts/request-lifecycle-04-transaction-and-pool)에서 트랜잭션과 커넥션 풀 관점으로 이어집니다.
