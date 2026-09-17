---
# 📌 기본 메타데이터
title: 'DB 설계 A to Z 17강 — 계층 구조 모델링'
date: '2026-09-17'
category: 'database'
tags: ['Database', 'DB Design', 'Data Modeling', 'Hierarchy', 'SQL']
description: '인접 리스트·경로 열거·중첩 집합·클로저 테이블 네 가지 트리 모델을 재귀 CTE가 보편화된 기준으로 비교하고, 원본과 조회용 구조를 나누는 실무 조합을 정리한다. 시리즈 Part 4 "심화 모델링"의 첫 강이다.'

# 💬 옵션 필드
draft: false
series: 'DB 설계 A to Z'
seriesOrder: 17

# 📚 SEO용
keywords: ['DB 설계', '데이터베이스 설계', '계층 구조', '인접 리스트', '경로 열거', '중첩 집합', '클로저 테이블', '재귀 CTE']
---

# DB 설계 A to Z 17강 — 계층 구조 모델링

여기서부터 Part 4 심화 모델링입니다. Part 3이 저장 방식의 문제였다면, 이번 Part는 계층·시간·유연성·분석·테넌트처럼 모델링 자체가 까다로운 주제를 다룹니다.

## 1. 조선소의 계층 데이터

- 선체 분할: 호선 → 메가블록 → 대조립 → 중조립 → 소조립 → 부재
- 조직: 사업부 → 부서 → 팀 → 반
- 자재 BOM: 상위 부품 → 하위 부품 (한 부품이 여러 상위에 사용될 수 있음)

트리(부모 1개)와 DAG(부모 여러 개)를 먼저 구분합니다. 아래 네 가지 모델은 기본적으로 트리용이며, DAG는 클로저 테이블이나 교차 테이블([6강 BOM](/posts/db-design-06-er-to-relational))을 씁니다.

## 2. 인접 리스트 (Adjacency List)

```sql
CREATE TABLE assembly (
    assembly_id BIGINT PRIMARY KEY,
    parent_id   BIGINT REFERENCES assembly(assembly_id),
    name        VARCHAR(50) NOT NULL
);
```
- 가장 단순하고, 이동(부모 변경)이 한 행 수정으로 끝납니다.
- 하위 전체 조회에 **재귀 쿼리**가 필요합니다.

```sql
-- PostgreSQL, MySQL 8.0+ (SQL Server는 RECURSIVE 키워드 없이 동일 구조)
WITH RECURSIVE subtree AS (
    SELECT assembly_id, parent_id, name, 1 AS depth
    FROM assembly WHERE assembly_id = :root
    UNION ALL
    SELECT a.assembly_id, a.parent_id, a.name, s.depth + 1
    FROM assembly a JOIN subtree s ON a.parent_id = s.assembly_id
)
SELECT * FROM subtree;

-- Oracle 전통 문법
SELECT assembly_id, name, LEVEL
FROM assembly
START WITH assembly_id = :root
CONNECT BY PRIOR assembly_id = parent_id;
```
재귀 CTE가 모든 주요 DBMS에서 지원되면서, "인접 리스트는 조회가 어렵다"는 과거의 안티패턴 논리는 상당 부분 약해졌습니다. **깊이가 수십 단계 이내이고 트리 크기가 적당하면 인접 리스트가 기본값**입니다. `parent_id` 인덱스는 필수입니다.

## 3. 경로 열거 (Path Enumeration / Materialized Path)

```sql
CREATE TABLE assembly (
    assembly_id BIGINT PRIMARY KEY,
    path        VARCHAR(500) NOT NULL,   -- '/1/4/17/'
    name        VARCHAR(50) NOT NULL
);
CREATE INDEX ix_assembly_path ON assembly (path);   -- PG는 text_pattern_ops 필요할 수 있음

-- 하위 전체
SELECT * FROM assembly WHERE path LIKE '/1/4/%';
-- 조상 전체
SELECT * FROM assembly WHERE '/1/4/17/' LIKE path || '%';
```
- 하위 조회가 접두사 검색 한 번으로 끝납니다.
- 부모 변경 시 **하위 전체의 path를 갱신**해야 합니다.
- 참조 무결성을 DB가 보장하지 못합니다 (path 안의 ID가 실제로 존재하는지 모름).
- PostgreSQL `ltree` 확장은 이 모델을 타입과 GiST 인덱스로 지원합니다.

## 4. 중첩 집합 (Nested Set)

```
           1 [호선] 10
          /           \
   2 [메가A] 7     8 [메가B] 9
     /      \
3 [대조1] 4  5 [대조2] 6
```
```sql
-- 하위 전체: 부모의 lft ~ rgt 범위
SELECT c.* FROM assembly p JOIN assembly c ON c.lft BETWEEN p.lft AND p.rgt
WHERE p.assembly_id = :root;
```
- 하위 조회와 하위 개수(`(rgt - lft - 1) / 2`)가 매우 빠릅니다.
- **삽입·이동 시 트리 오른쪽 전체 번호를 재계산** → 쓰기가 잦으면 부적합
- 직계 자식 조회가 오히려 어렵습니다.

## 5. 클로저 테이블 (Closure Table)

```sql
CREATE TABLE assembly_closure (
    ancestor_id   BIGINT NOT NULL REFERENCES assembly(assembly_id),
    descendant_id BIGINT NOT NULL REFERENCES assembly(assembly_id),
    depth         INT NOT NULL,
    PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX ix_closure_desc ON assembly_closure (descendant_id, depth);
```
모든 조상-자손 쌍(자기 자신 포함, depth 0)을 저장합니다.

```sql
-- 하위 전체
SELECT a.* FROM assembly a
JOIN assembly_closure c ON c.descendant_id = a.assembly_id
WHERE c.ancestor_id = :root;

-- 새 노드 :new를 :parent 아래에 추가
INSERT INTO assembly_closure (ancestor_id, descendant_id, depth)
SELECT ancestor_id, :new, depth + 1 FROM assembly_closure WHERE descendant_id = :parent
UNION ALL
SELECT :new, :new, 0;
```
- 조상·자손 조회 모두 인덱스 한 번
- FK로 무결성 보장
- **DAG도 표현 가능**
- 공간: 최악 O(n²), 일반적인 균형 트리에서는 O(n × 깊이)
- 서브트리 이동은 "기존 외부 조상과의 연결 삭제 + 새 조상과의 연결 삽입"으로 여러 행 작업

## 6. 비교

| 항목 | 인접 리스트 | 경로 열거 | 중첩 집합 | 클로저 테이블 |
|---|---|---|---|---|
| 직계 자식 | 쉬움 | 보통 | 어려움 | 쉬움 (depth=1) |
| 하위 전체 | 재귀 CTE | 쉬움 | 쉬움 | 쉬움 |
| 조상 전체 | 재귀 CTE | 쉬움 | 쉬움 | 쉬움 |
| 삽입 | 쉬움 | 쉬움 | **어려움** | 보통 |
| 이동 | **쉬움** | 보통 | 어려움 | 보통 |
| 참조 무결성 | O | X | X | O |
| DAG | X | X | X | O |
| 추가 저장 | 없음 | 경로 문자열 | 두 컬럼 | 별도 테이블 |

## 7. 실무 조합

**인접 리스트 + 파생 구조**가 흔한 선택입니다.
- 원본(진실의 원천)은 `parent_id`
- 조회 성능이 필요하면 클로저 테이블이나 path를 **트리거·배치로 파생** ([10강 반정규화](/posts/db-design-10-denormalization))
- 조직도처럼 변경이 드물고 조회가 많은 경우, 매일 밤 클로저 테이블을 재생성하는 배치도 충분히 실용적입니다.

순환 방지는 인접 리스트에서 DB 제약만으로 막기 어렵습니다. 부모 변경 시 "새 부모가 자신의 자손이 아닌지"를 재귀 쿼리나 클로저 테이블로 검사합니다.

## 17강 정리

1. 재귀 CTE 지원이 보편화되어 인접 리스트가 기본값이 되었다.
2. 조회가 압도적으로 많으면 경로 열거·중첩 집합, 무결성과 DAG가 필요하면 클로저 테이블.
3. 원본은 인접 리스트로 두고 조회용 구조를 파생시키는 조합이 실용적이다.
