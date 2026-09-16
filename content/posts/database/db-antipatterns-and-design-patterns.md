---
# 📌 기본 메타데이터
title: '데이터베이스 안티패턴과 디자인 패턴 — 쇼핑몰 예제로 정리하기'
date: '2026-09-16'
category: 'database'
tags: ['Database', 'SQL', 'Anti-Pattern', 'Design Pattern', 'PostgreSQL', 'MySQL']
description: 'EAV·다중 컬럼 속성부터 인덱스·쿼리·운영까지 SQL 안티패턴을 훑고, 서브타입·계층·이력 모델링과 키셋 페이지네이션·큐 테이블·멱등성 키 같은 검증된 패턴을 쇼핑몰 예제로 정리한다.'

# 💬 옵션 필드
draft: false

# 📚 SEO용
keywords: ['Database', 'SQL', 'Anti-Pattern', 'Design Pattern', 'PostgreSQL', 'MySQL', '데이터베이스 안티패턴', 'SQL 안티패턴', 'EAV', '인덱스', '정규화', '키셋 페이지네이션', '멱등성 키']
---

# 데이터베이스 안티패턴과 디자인 패턴 — 쇼핑몰 예제로 정리하기

> 이 글의 모든 예제는 가상의 온라인 쇼핑몰(상품, 카테고리, 주문, 회원, 리뷰)을 기준으로 작성했습니다.
> PostgreSQL, MySQL, Oracle, SQL Server의 차이가 있는 부분은 함께 표시했습니다.

---

## 0. 들어가며: 안티패턴이란

안티패턴은 **처음에는 합리적으로 보이지만, 시간이 지나면 비용이 커지는 해법**입니다. "틀린 코드"와는 다릅니다. 대부분 작은 규모에서는 잘 동작하고, 데이터·트래픽·팀 규모가 커질 때 문제가 드러납니다. 그래서 안티패턴을 공부할 때는 "왜 사람들이 이걸 선택하는가"와 "어느 지점에서 무너지는가"를 함께 봐야 합니다.

이 분야의 대표 교재는 Bill Karwin의 *SQL Antipatterns*입니다(한국어판 『SQL 안티패턴』, 인사이트). 이 글은 그 분류(논리 설계, 물리 설계, 쿼리, 애플리케이션)를 뼈대로 삼고, 실무에서 자주 보는 항목을 더했습니다.

---

## Part A. 안티패턴

### 1. 논리 설계 안티패턴

#### 1-1. Jaywalking: 콤마로 구분한 목록 컬럼

하나의 상품이 여러 카테고리에 속할 수 있다는 요구사항을 가장 빠르게 구현하는 방법은 이렇습니다.

```sql
-- 안티패턴
CREATE TABLE product (
  product_id   BIGINT PRIMARY KEY,
  name         VARCHAR(200),
  category_ids VARCHAR(100)   -- '12,34,56'
);

-- 12번 카테고리의 상품 찾기: 인덱스를 쓸 수 없고, 패턴 매칭이 깨지기 쉬움
SELECT * FROM product WHERE FIND_IN_SET('12', category_ids) > 0;   -- MySQL
```

교차 테이블을 만들기 귀찮아서 선택하지만, 대가는 다음과 같습니다.

| 문제 | 설명 |
|---|---|
| 참조 무결성 없음 | FK를 걸 수 없어서 삭제된 카테고리 ID도 남음 |
| 인덱스 무력화 | 카테고리별 상품 조회가 항상 풀스캔 |
| 집계 불가 | "카테고리별 상품 수" 같은 질의가 문자열 파싱으로 바뀜 |
| 길이 제한 | VARCHAR 한계에 걸리면 목록이 조용히 잘림 |

**해법**은 교차(intersection) 테이블입니다.

```sql
CREATE TABLE product_category (
  product_id  BIGINT REFERENCES product(product_id),
  category_id BIGINT REFERENCES category(category_id),
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX ix_pc_category ON product_category(category_id);  -- 카테고리 → 상품 방향 탐색용
```

PostgreSQL의 배열 타입(`BIGINT[]` + GIN 인덱스)은 검색 성능 문제는 해결합니다. 하지만 FK는 여전히 걸 수 없으므로, 참조 무결성이 필요 없는 데이터에만 제한적으로 쓰는 것이 좋습니다.

#### 1-2. Multi-column Attributes: tag1, tag2, tag3

```sql
CREATE TABLE product (
  product_id BIGINT PRIMARY KEY,
  name       VARCHAR(200),
  tag1       VARCHAR(20),
  tag2       VARCHAR(20),
  tag3       VARCHAR(20)
);

SELECT * FROM product WHERE '무료배송' IN (tag1, tag2, tag3);
-- 태그가 4개가 필요해지는 순간 스키마 변경 + 모든 쿼리 수정
```

Jaywalking과 뿌리가 같습니다. 일대다 관계를 컬럼으로 펼친 것입니다. 해법도 같습니다. 종속 테이블로 분리합니다.

```sql
CREATE TABLE product_tag (
  product_id BIGINT REFERENCES product(product_id),
  tag        VARCHAR(20),
  PRIMARY KEY (product_id, tag)
);
```

#### 1-3. Naive Trees: 인접 목록의 한계

쇼핑몰 카테고리는 대표적인 트리 구조입니다(가전 > TV > OLED TV).

```sql
CREATE TABLE category (
  category_id BIGINT PRIMARY KEY,
  parent_id   BIGINT REFERENCES category(category_id),
  name        VARCHAR(100)
);
```

인접 목록(Adjacency List) 자체는 나쁜 설계가 아닙니다. 문제는 **"가전 하위의 모든 카테고리"를 애플리케이션에서 깊이만큼 반복 쿼리로 구현하는 것**입니다. 예전에는 이것이 대표적인 안티패턴이었지만, 지금은 재귀 CTE가 모든 주요 DBMS에 들어오면서 인접 목록이 상당 부분 복권되었습니다.

```sql
-- PostgreSQL / MySQL 8.0+ (SQL Server는 RECURSIVE 키워드 없이 WITH)
WITH RECURSIVE tree AS (
  SELECT category_id, parent_id, name, 1 AS depth
  FROM category WHERE category_id = :root
  UNION ALL
  SELECT c.category_id, c.parent_id, c.name, t.depth + 1
  FROM category c JOIN tree t ON c.parent_id = t.category_id
)
SELECT * FROM tree;

-- Oracle: 전통적인 CONNECT BY (11gR2+는 재귀 WITH도 지원)
SELECT category_id, name, LEVEL
FROM category
START WITH category_id = :root
CONNECT BY PRIOR category_id = parent_id;
```

계층 모델 4종의 비교는 [B-2](#b-2-계층-구조-모델-4종)에서 다룹니다. "가전 카테고리 전체 상품 수"처럼 **하위 트리 전체를 대상으로 한 조회가 매우 잦다면** Closure Table이 유리합니다.

#### 1-4. ID Required: 모든 테이블에 대리키를 강제

```sql
-- 안티패턴: 교차 테이블에 불필요한 id
CREATE TABLE product_category (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id  BIGINT,
  category_id BIGINT
  -- UNIQUE (product_id, category_id)를 빠뜨리면 같은 매핑이 중복 저장됨
);
```

ORM 관습 때문에 "모든 테이블에는 `id`가 있어야 한다"고 믿게 되는데, 교차 테이블에서는 오히려 해롭습니다.

| 문제 | 설명 |
|---|---|
| 중복 허용 | 비즈니스 키에 UNIQUE를 잊으면 같은 관계가 여러 번 저장됨 |
| 인덱스 낭비 | PK 인덱스와 실제로 쓰는 (product_id, category_id) 인덱스를 둘 다 유지 |
| InnoDB 특수성 | 클러스터드 인덱스가 의미 없는 id 순서로 정렬되어, 관계 탐색 시 세컨더리 인덱스 → PK 룩업이 추가됨 |

**판단 기준**: 엔티티 테이블(상품, 회원, 주문)은 대리키가 좋고(자연키는 바뀝니다), 교차 테이블은 복합 PK가 좋습니다. JPA를 쓰더라도 `@EmbeddedId`나 `@IdClass`로 복합키를 표현할 수 있습니다.

#### 1-5. Keyless Entry: FK 생략

"FK는 성능을 떨어뜨리고 배포를 번거롭게 한다"는 이유로 `order_item.product_id`에 FK를 걸지 않는 패턴입니다.

FK를 빼면 "존재하지 않는 상품을 가리키는 주문 항목"을 찾아 정리하는 배치를 결국 따로 만들게 됩니다. 그 배치는 FK보다 느리고, 늦게 동작하며, 빈틈이 있습니다. 성능 비용도 대개 과장되어 있습니다. FK 검사는 부모 PK 인덱스 조회 한 번입니다.

다만 FK를 의도적으로 빼는 **정당한 경우**도 있습니다.

| 상황 | 이유 |
|---|---|
| 주문 DB와 상품 DB가 서비스별로 분리됨 | 물리적으로 걸 수 없음 |
| 초대용량 적재 테이블(클릭 로그, 이벤트) | 적재 처리량이 무결성보다 우선이고, 원천 시스템이 무결성을 보장 |
| 온라인 스키마 변경 도구 사용 시 | gh-ost 등은 FK가 있는 테이블을 지원하지 않거나 제약이 있음 |
| 스테이징 테이블 | 정합성 검증 전 단계라서 걸면 안 됨 |

핵심은 FK를 뺄 때 **"그럼 무결성은 누가 보장하는가"에 대한 답이 있어야 한다**는 것입니다.

#### 1-6. EAV (Entity-Attribute-Value)

의류는 사이즈·소재, 노트북은 CPU·RAM·화면 크기처럼 상품군마다 속성이 제각각입니다. 그래서 이런 테이블이 등장합니다.

```sql
CREATE TABLE product_attr (
  product_id BIGINT,
  attr_name  VARCHAR(50),    -- 'color', 'size', 'ram_gb', 'screen_inch'
  attr_value VARCHAR(255),   -- 모든 값이 문자열
  PRIMARY KEY (product_id, attr_name)
);
```

"스키마 변경 없이 유연하게"라는 장점 뒤에 큰 비용이 있습니다.

| 문제 | 설명 |
|---|---|
| 타입 없음 | 숫자가 문자열로 저장되어 `'16' < '8'`처럼 사전순 비교가 됨 |
| 필수값 강제 불가 | "노트북은 RAM이 필수" 같은 NOT NULL 제약을 걸 수 없음 |
| 속성명 오타 | `ram_gb`, `RAM`, `ram`이 공존 |
| 행 재구성 비용 | 상품 하나를 속성 N개와 함께 보려면 N번 셀프 조인 또는 피벗 |

Oracle에서는 특히 위험한 함정이 있습니다.

```sql
SELECT product_id FROM product_attr
WHERE attr_name = 'screen_inch' AND attr_value > 50;
```

`attr_value`와 숫자를 비교하면 컬럼에 암묵적 `TO_NUMBER(attr_value)`가 적용됩니다. 옵티마이저가 `attr_name` 필터보다 이 비교를 먼저 평가하면 `'블랙'` 같은 다른 속성 값을 만나 **ORA-01722(invalid number)** 가 터집니다. 실행 계획이 바뀌는 순간 **어제는 되던 쿼리가 오늘 실패**하는 셈입니다.

**대안**:

1. 속성 집합이 몇 가지 상품 유형으로 묶인다면 → 서브타입 모델링 ([B-1](#b-1-서브타입상속-모델링-3종))
2. 정말 속성이 자유롭다면 → 반정형 컬럼

```sql
-- PostgreSQL: JSONB + GIN
CREATE TABLE product (
  product_id   BIGINT PRIMARY KEY,
  product_type VARCHAR(30) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  spec         JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_product_spec ON product USING GIN (spec jsonb_path_ops);

-- 포함 검색: {"color": "black"}인 상품
SELECT * FROM product WHERE spec @> '{"color": "black"}';

-- 자주 범위 조회하는 키는 표현식 인덱스로 승격
CREATE INDEX ix_product_screen ON product (((spec->>'screen_inch')::numeric));

-- MySQL 8.0: 생성 컬럼으로 뽑아서 인덱싱
ALTER TABLE product
  ADD COLUMN screen_inch DECIMAL(5,1)
    GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(spec, '$.screen_inch')) AS DECIMAL(5,1))) STORED,
  ADD INDEX ix_screen_inch (screen_inch);
```

실무 원칙은 이렇습니다. **검색 필터·조인·제약에 쓰이는 속성은 정규 컬럼으로, 상세 페이지 표시용 속성만 JSON으로** 둡니다. JSON 안의 키가 WHERE 절에 자주 나오기 시작하면 컬럼으로 승격할 시점입니다.

#### 1-7. Polymorphic Associations: 다형성 FK

쇼핑몰에 상품 리뷰(review)와 매거진 기사(article)가 있고, 둘 다 댓글을 달 수 있다고 합시다.

```sql
CREATE TABLE comment (
  comment_id  BIGINT PRIMARY KEY,
  target_type VARCHAR(20),   -- 'REVIEW' 또는 'ARTICLE'
  target_id   BIGINT,        -- review.review_id 또는 article.article_id
  body        TEXT
);
```

Rails·Laravel 같은 프레임워크가 기본 지원해서 흔합니다. 문제는 `target_id`에 **FK를 걸 수 없다**는 점입니다. 참조 대상 테이블이 행마다 다르기 때문입니다. 조인도 `CASE`나 `UNION`으로 복잡해집니다.

```sql
-- 댓글과 원글 제목을 함께 조회하려면
SELECT c.*, COALESCE(r.title, a.title) AS target_title
FROM comment c
LEFT JOIN review  r ON c.target_type = 'REVIEW'  AND r.review_id  = c.target_id
LEFT JOIN article a ON c.target_type = 'ARTICLE' AND a.article_id = c.target_id;
```

**해법 두 가지**:

```sql
-- (A) 대상별 교차 테이블: 참조 방향을 뒤집음
CREATE TABLE review_comment (
  review_id  BIGINT REFERENCES review(review_id),
  comment_id BIGINT REFERENCES comment(comment_id) UNIQUE,
  PRIMARY KEY (review_id, comment_id)
);
CREATE TABLE article_comment ( /* 동일 구조 */ );

-- (B) 공통 상위 테이블: review와 article이 content를 상속
CREATE TABLE content (content_id BIGINT PRIMARY KEY, created_at TIMESTAMP NOT NULL);
CREATE TABLE review  (content_id BIGINT PRIMARY KEY REFERENCES content(content_id),
                      product_id BIGINT NOT NULL, rating SMALLINT NOT NULL);
CREATE TABLE article (content_id BIGINT PRIMARY KEY REFERENCES content(content_id),
                      title VARCHAR(200) NOT NULL);
CREATE TABLE comment (comment_id BIGINT PRIMARY KEY,
                      content_id BIGINT NOT NULL REFERENCES content(content_id),
                      body TEXT);
```

(B)가 대개 더 깔끔합니다. 이것이 [B-1](#b-1-서브타입상속-모델링-3종)의 Class Table Inheritance와 같은 구조입니다.

#### 1-8. Metadata Tribbles: 데이터를 테이블명·컬럼명으로 쪼개기

```sql
-- 테이블 분할
orders_2024, orders_2025, orders_2026 ...

-- 컬럼 분할
CREATE TABLE product_monthly_sales (
  product_id BIGINT,
  sales_year INT,
  m01 NUMERIC, m02 NUMERIC, /* ... */ m12 NUMERIC
);
```

해가 바뀔 때마다 DDL이 필요하고, "최근 18개월 매출" 같은 조회는 `UNION ALL` 지옥이 됩니다. 데이터(연도, 월)가 메타데이터(테이블명, 컬럼명)에 섞였기 때문입니다.

**해법**: 테이블 분할은 DBMS 네이티브 **파티셔닝**으로 바꿉니다. 파티션 프루닝이 되면서 논리적으로는 한 테이블로 쓸 수 있고, 오래된 데이터는 파티션 단위로 DROP·아카이브할 수 있습니다.

```sql
-- PostgreSQL 선언적 파티셔닝
CREATE TABLE orders (
  order_id   BIGINT NOT NULL,
  ordered_at TIMESTAMP NOT NULL,
  /* ... */
  PRIMARY KEY (order_id, ordered_at)
) PARTITION BY RANGE (ordered_at);

CREATE TABLE orders_2026 PARTITION OF orders
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

컬럼 분할은 `(product_id, year_month, sales_amount)` 행 구조로 바꾸고, 보고서 형태가 필요하면 조회 시점에 피벗합니다.

---

### 2. 물리 설계 안티패턴

#### 2-1. Rounding Errors: 금액에 부동소수점

```sql
-- 안티패턴
CREATE TABLE product (product_id BIGINT PRIMARY KEY, price FLOAT);

-- 0.1을 10번 더해도 정확히 1.0이 아닐 수 있음
SELECT SUM(price) FROM order_item WHERE order_id = :id;
```

`FLOAT/DOUBLE`은 이진 부동소수점이라 `0.1` 같은 십진 소수를 정확히 표현하지 못합니다. 합계·할인·정산에서 오차가 누적되고, `WHERE price = 19.9` 같은 비교가 실패합니다. 금액은 항상 `DECIMAL/NUMERIC`을 씁니다.

```sql
CREATE TABLE product (product_id BIGINT PRIMARY KEY, price NUMERIC(12, 2) NOT NULL);
```

원화만 다룬다면 정수(`BIGINT`, 원 단위)로 저장하는 것도 좋은 선택입니다.

#### 2-2. 랜덤 UUIDv4를 클러스터드 PK로 사용

```sql
-- MySQL InnoDB
CREATE TABLE orders (
  order_id BINARY(16) PRIMARY KEY,   -- UUIDv4
  /* ... */
);
```

InnoDB와 SQL Server(기본 설정)는 PK 순서로 데이터를 물리 정렬하는 클러스터드 인덱스를 씁니다. 완전 무작위 값이 들어오면 B-Tree의 임의 위치에 삽입되면서 **페이지 분할**이 잦아지고, 최근 주문들이 여러 페이지에 흩어져 **버퍼 풀 캐시 적중률**이 떨어집니다.

**해법**: 시간 순으로 정렬되는 식별자를 씁니다.

| 방식 | 특징 |
|---|---|
| UUIDv7 | 앞부분이 타임스탬프, 표준 UUID 형식 유지 |
| ULID | 타임스탬프 + 난수, 사전순 정렬 가능한 문자열 |
| Snowflake 계열 | 64비트 정수, 타임스탬프 + 노드 + 시퀀스 |
| 내부 BIGINT + 외부 공개용 UUID | PK는 순차 정수, URL에 노출하는 주문번호만 별도 컬럼 |

#### 2-3. 31 Flavors: 값 목록을 ENUM/CHECK에 박기

```sql
CREATE TABLE orders (
  order_id BIGINT PRIMARY KEY,
  status   ENUM('PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED')   -- MySQL
);
```

'반품 요청(RETURN_REQUESTED)' 상태가 추가되는 순간 문제가 드러납니다.

| 문제 | 설명 |
|---|---|
| 값 추가 = DDL | MySQL에서 ENUM 목록 끝에 추가하는 것은 대개 메타데이터 변경이지만, 중간 삽입이나 순서 변경은 테이블 재구성을 유발할 수 있음 |
| 값 폐기 불가 | 기존 주문이 쓰고 있으면 제거할 수 없음 |
| 메타 정보 없음 | 화면 표시명("배송중"), 정렬 순서, 사용 여부를 붙일 곳이 없음 |
| 이식성 | ENUM 문법은 MySQL·PostgreSQL이 서로 다르고, Oracle·SQL Server에는 없음 |

**해법**: 룩업 테이블 + FK.

```sql
CREATE TABLE order_status (
  status_code VARCHAR(20) PRIMARY KEY,
  label_ko    VARCHAR(50) NOT NULL,     -- '결제 완료', '배송중'
  sort_order  INT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_status FOREIGN KEY (status) REFERENCES order_status(status_code);
```

다만 **절대 바뀌지 않는 이진적 값**(예: `Y/N` 플래그)은 CHECK 제약이 더 단순하고 적절합니다.

#### 2-4. Phantom Files, 그리고 그 반대

상품 이미지를 어디에 저장할지의 문제입니다.

Karwin이 말한 원래 안티패턴은 "파일을 DB 밖에 두고 경로만 저장하면, 트랜잭션·백업·권한이 DB와 따로 논다"는 것입니다. 반대로 "모든 상품 이미지를 BLOB으로 DB에 넣으면" 백업 크기, 복제 지연, 버퍼 풀 오염이 생깁니다.

현대적 합의는 **오브젝트 스토리지(S3, MinIO) + DB 메타데이터**이고, 두 시스템 간 정합성은 별도로 설계합니다.

```sql
CREATE TABLE product_image (
  image_id    BIGINT PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES product(product_id),
  object_key  VARCHAR(300) NOT NULL UNIQUE,   -- 'products/2026/09/abc123.webp'
  sort_order  INT NOT NULL,
  deleted_at  TIMESTAMP
);
```

- 업로드 먼저 → 메타데이터 커밋 순서를 지킵니다. 반대로 하면 존재하지 않는 파일을 가리키는 행이 생깁니다.
- 커밋 실패로 남은 고아 객체는 주기적 GC 배치로 정리합니다.
- 삭제는 DB 행을 먼저 논리 삭제하고, 객체는 비동기로 삭제합니다.

본질적으로 **이중 쓰기(dual-write) 문제의 파일 버전**입니다.

#### 2-5. Index Shotgun: 감으로 인덱스 뿌리기

상품 테이블의 컬럼마다 인덱스를 만들거나, 반대로 하나도 만들지 않거나, 실제 쿼리와 맞지 않는 조합으로 만드는 경우를 모두 포함합니다.

인덱스는 쓰기마다 갱신 비용을 냅니다. PostgreSQL에서는 인덱스 컬럼이 하나라도 바뀌면 HOT(Heap-Only Tuple) update가 불가능해져, 재고나 조회수처럼 자주 바뀌는 컬럼에 인덱스를 걸면 bloat가 늘어납니다.

Karwin의 해법은 **MENTOR** 절차입니다.

| 단계 | 내용 | 도구 예시 |
|---|---|---|
| Measure | 느린 쿼리 수집 | `pg_stat_statements`, MySQL slow log, Oracle AWR, SQL Server Query Store |
| Explain | 실행 계획 분석 | `EXPLAIN (ANALYZE, BUFFERS)`, `EXPLAIN ANALYZE`, `DBMS_XPLAN` |
| Nominate | 후보 인덱스 선정 | 선택도, 컬럼 순서, 커버링 여부 검토 |
| Test | 전후 비교 | 운영 유사 데이터로 측정 |
| Optimize | 캐시·통계 확인 | 버퍼 적중률, 통계 갱신 |
| Rebuild | 유지보수 | bloat 점검, 미사용 인덱스 제거 |

```sql
-- PostgreSQL: 한 번도 사용되지 않은 인덱스
SELECT relname, indexrelname, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- MySQL (sys 스키마)
SELECT * FROM sys.schema_unused_indexes;
```

**미사용 인덱스 제거**가 실무에서 가장 과소평가되는 단계입니다.

---

### 3. 쿼리 안티패턴

#### 3-1. Fear of the Unknown: NULL 오해

"한 번도 주문하지 않은 회원"을 찾는 쿼리입니다.

```sql
SELECT * FROM customer
WHERE customer_id NOT IN (SELECT customer_id FROM orders);
```

쇼핑몰이 **비회원 주문**을 지원해서 `orders.customer_id`에 NULL이 하나라도 있으면, 이 쿼리는 **항상 0건**을 반환합니다.

`x NOT IN (1, 2, NULL)`은 `x <> 1 AND x <> 2 AND x <> NULL`로 풀리고, 마지막 항이 UNKNOWN이라서 전체가 절대 TRUE가 되지 않기 때문입니다. 에러도 없이 조용히 틀립니다.

```sql
-- 안전한 형태: NOT EXISTS (안티 조인)
SELECT * FROM customer c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id
);
```

이 밖의 NULL 함정들입니다.

| 표현 | 결과 | 주의 |
|---|---|---|
| `coupon_id = NULL` | 항상 UNKNOWN | `IS NULL` 사용 |
| `COUNT(coupon_id)` | NULL 제외 | `COUNT(*)`와 다름 |
| `AVG(rating)` | NULL 제외하고 평균 | 평점 미입력을 0점으로 간주하지 않음 |
| 문자열과 NULL 연결 | 대부분 NULL | **Oracle은 NULL을 빈 문자열처럼 취급**해서 `'abc' \|\| NULL` = `'abc'` |
| Oracle의 `''` | NULL과 같음 | `WHERE memo = ''`는 항상 거짓 |
| UNIQUE 컬럼의 NULL | 대부분 다중 NULL 허용 | SQL Server는 NULL을 하나만 허용 (필터 인덱스로 우회) |

Oracle의 "빈 문자열 = NULL" 동작은 이기종 DB 간 데이터 이관에서 실제 문제를 일으킵니다. PostgreSQL에서 구분되던 두 값이 Oracle에서는 하나로 합쳐지므로, 원본과 대상을 비교하는 검증 로직이 "변경 없음"을 "변경 있음"으로 오판할 수 있습니다.

#### 3-2. Ambiguous Groups: 그룹화되지 않은 컬럼 선택

"회원별 가장 최근 주문 금액"을 구하려는 쿼리입니다.

```sql
-- 의도와 다름: total_amount는 최신 주문이 아닌 임의의 행에서 올 수 있음
SELECT customer_id, MAX(ordered_at), total_amount
FROM orders
GROUP BY customer_id;
```

MySQL 5.7 이전 기본값(`ONLY_FULL_GROUP_BY` 비활성)에서는 에러 없이 실행됩니다. **해법**은 윈도 함수입니다.

```sql
SELECT * FROM (
  SELECT o.*,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY ordered_at DESC) AS rn
  FROM orders o
) t
WHERE rn = 1;

-- PostgreSQL 전용: 더 간결한 DISTINCT ON
SELECT DISTINCT ON (customer_id) *
FROM orders
ORDER BY customer_id, ordered_at DESC;
```

#### 3-3. Non-sargable 조건: 인덱스 컬럼을 가공

```sql
-- ordered_at 인덱스를 사용할 수 없음
SELECT * FROM orders WHERE YEAR(ordered_at) = 2026;
SELECT * FROM customer WHERE UPPER(email) = 'KIM@EXAMPLE.COM';
SELECT * FROM orders WHERE ordered_at + INTERVAL '7 day' > NOW();

-- 범위 조건으로 재작성
SELECT * FROM orders
WHERE ordered_at >= '2026-01-01' AND ordered_at < '2027-01-01';

SELECT * FROM orders
WHERE ordered_at > NOW() - INTERVAL '7 day';
```

대소문자 무시 검색이 꼭 필요하면 표현식 인덱스(`CREATE INDEX ... ON customer (LOWER(email))`)를 만들거나, PostgreSQL의 `citext` 타입, MySQL의 대소문자 무시 collation을 씁니다.

가장 찾기 어려운 형태는 **암묵적 형변환**입니다.

```sql
-- order_no 컬럼은 VARCHAR인데 숫자로 비교
SELECT * FROM orders WHERE order_no = 20260916001;
```

| DBMS | 동작 |
|---|---|
| MySQL | 문자열 컬럼을 숫자로 변환해 비교 → 인덱스 사용 불가, 풀스캔 |
| Oracle | 컬럼 쪽에 `TO_NUMBER` 적용 → 인덱스 불가, 숫자가 아닌 주문번호가 있으면 ORA-01722 |
| PostgreSQL | 대부분 타입 오류로 거부 (엄격한 편) |
| SQL Server | 데이터 타입 우선순위에 따라 컬럼 쪽이 변환되면 인덱스 스캔으로 퇴화 |

JDBC 바인딩 타입이 컬럼 타입과 어긋나서 생기는 경우가 많습니다. 실행 계획에서 `CONVERT_IMPLICIT`(SQL Server)나 `INTERNAL_FUNCTION`(Oracle)이 보이면 이것을 의심하면 됩니다.

#### 3-4. OFFSET 페이지네이션

```sql
SELECT * FROM product
ORDER BY created_at DESC
LIMIT 20 OFFSET 100000;
```

DB는 100,020행을 읽고 앞의 100,000행을 버립니다. 페이지가 뒤로 갈수록 선형으로 느려지고, 사용자가 페이지를 넘기는 사이 신상품이 등록되면 **같은 상품이 다음 페이지에 또 나오거나 누락**됩니다. 해법은 [B-6](#b-6-키셋seek-페이지네이션)의 키셋 페이지네이션입니다.

#### 3-5. Random Selection: `ORDER BY RAND()`

```sql
-- "오늘의 랜덤 추천 상품"
SELECT * FROM product ORDER BY RAND() LIMIT 1;   -- PostgreSQL은 RANDOM()
```

전체 상품에 난수를 매기고 정렬한 뒤 하나를 고릅니다. 상품 수에 비례해 느려집니다.

```sql
-- 근사 샘플링
SELECT * FROM product TABLESAMPLE SYSTEM (1);   -- PostgreSQL, SQL Server(TABLESAMPLE)
SELECT * FROM product SAMPLE (1);                -- Oracle

-- ID 범위에서 난수를 뽑아 조회
SELECT * FROM product
WHERE product_id >= :random_id
ORDER BY product_id
LIMIT 1;
```

ID에 구멍(삭제된 상품)이 많으면 구멍 바로 뒤의 상품이 더 자주 뽑히는 편향이 생긴다는 점은 감안해야 합니다. 실무에서는 추천 후보 목록을 캐시에 미리 만들어두고 애플리케이션에서 무작위로 고르는 방식이 흔합니다.

#### 3-6. Poor Man's Search Engine: `LIKE '%키워드%'`

```sql
SELECT * FROM product WHERE name LIKE '%무선 이어폰%';
```

앞쪽 와일드카드는 B-Tree 인덱스를 쓸 수 없고, "이어폰 무선"처럼 어순이 바뀐 검색이나 오타에도 대응하지 못합니다.

| DBMS | 수단 |
|---|---|
| PostgreSQL | `pg_trgm` + GIN (부분 문자열), `tsvector` (전문 검색) |
| MySQL | `FULLTEXT` 인덱스 (한국어는 `ngram` 파서 필요) |
| Oracle | Oracle Text (`CONTEXT` 인덱스) |
| SQL Server | Full-Text Search |
| 규모가 크면 | Elasticsearch/OpenSearch로 분리하고 CDC로 동기화 |

```sql
-- PostgreSQL: 트라이그램 인덱스
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ix_product_name_trgm ON product USING GIN (name gin_trgm_ops);

-- MySQL: ngram 파서
CREATE FULLTEXT INDEX ft_product_name ON product(name) WITH PARSER ngram;
SELECT * FROM product WHERE MATCH(name) AGAINST('무선 이어폰' IN BOOLEAN MODE);
```

한국어 상품 검색은 형태소 분석, 동의어("핸드폰"과 "휴대폰"), 랭킹 요구가 금방 생기므로, 검색이 핵심 기능인 쇼핑몰은 전용 검색 엔진으로 가는 것이 현실적입니다.

#### 3-7. Spaghetti Query: 한 쿼리에 모든 것을

상품 목록에 "리뷰 수"와 "판매 수량"을 함께 보여주려는 쿼리입니다.

```sql
SELECT p.product_id,
       COUNT(r.review_id)  AS review_count,
       SUM(oi.quantity)    AS sold_qty
FROM product p
LEFT JOIN review     r  ON r.product_id  = p.product_id
LEFT JOIN order_item oi ON oi.product_id = p.product_id
GROUP BY p.product_id;
```

리뷰 5건 × 주문 항목 10건 = 50행으로 불어나서, 리뷰 수는 50, 판매 수량은 실제의 5배가 됩니다. 서로 독립적인 일대다 관계 두 개를 한 번에 조인했기 때문이며, 이를 **팬 트랩(fan trap)** 이라고 부릅니다.

```sql
-- 해법: 각각 먼저 집계한 뒤 조인
SELECT p.product_id,
       COALESCE(r.cnt, 0) AS review_count,
       COALESCE(s.qty, 0) AS sold_qty
FROM product p
LEFT JOIN (SELECT product_id, COUNT(*) AS cnt
           FROM review GROUP BY product_id) r ON r.product_id = p.product_id
LEFT JOIN (SELECT product_id, SUM(quantity) AS qty
           FROM order_item GROUP BY product_id) s ON s.product_id = p.product_id;
```

`COUNT(DISTINCT r.review_id)`로 덮으면 리뷰 수는 맞아 보이지만 **SUM은 여전히 틀리고** 성능도 나쁩니다. 여러 지표를 한 화면에 모으는 대시보드·관리자 페이지에서 숫자가 부풀려지는 가장 흔한 원인입니다.

#### 3-8. Implicit Columns: `SELECT *`

```sql
-- 목록 화면인데 상세 설명(TEXT), 스펙(JSON)까지 모두 가져옴
SELECT * FROM product WHERE category_id = 12;
```

| 문제 | 설명 |
|---|---|
| 커버링 인덱스 무력화 | `(category_id, product_id, name, price)` 인덱스만으로 끝날 쿼리가 테이블 접근을 하게 됨 |
| 네트워크·메모리 낭비 | 수 KB짜리 상세 설명 HTML까지 전송 |
| 스키마 변경에 취약 | 컬럼 추가·순서 변경 시 `INSERT ... SELECT *`나 위치 기반 매핑이 깨짐 |
| 뷰 정의 고정 | 여러 DBMS에서 뷰 생성 시점에 `*`가 확정되어 이후 추가 컬럼이 반영 안 됨 |

#### 3-9. N+1 쿼리 (ORM)

```java
List<Order> orders = orderRepository.findByCustomerId(customerId);  // 1번
for (Order order : orders) {
    order.getOrderItems().size();   // 주문 수만큼 N번 (LAZY 로딩)
}
```

**해법**은 JPA 기준으로 `JOIN FETCH`, `@EntityGraph`, `hibernate.default_batch_fetch_size`(IN 절 배치 로딩)입니다.

```java
@Query("select o from Order o join fetch o.orderItems where o.customerId = :customerId")
List<Order> findWithItems(@Param("customerId") Long customerId);
```

주문 항목과 결제 내역처럼 **컬렉션 두 개 이상을 동시에 `JOIN FETCH`** 하면 `MultipleBagFetchException`이 나거나, 3-7의 팬 트랩과 같은 카테시안 곱이 생깁니다. 이런 경우에는 배치 페치 크기 설정이 더 안전합니다.

---

### 4. 애플리케이션·운영 안티패턴

#### 4-1. SQL Injection과 Readable Passwords

```java
// 안티패턴
String sql = "SELECT * FROM product WHERE name LIKE '%" + keyword + "%'";

// 바인드 변수 사용
String sql = "SELECT * FROM product WHERE name LIKE ?";
ps.setString(1, "%" + keyword + "%");
```

바인드 변수는 보안뿐 아니라 **실행 계획 캐시 재사용**에도 중요합니다. Oracle에서 리터럴 SQL이 쏟아지면 하드 파싱이 늘고 shared pool 경합이 생깁니다.

주의할 점은 **식별자(테이블명, 컬럼명, 정렬 방향)는 바인드할 수 없다**는 것입니다. 상품 목록의 "가격순/인기순" 정렬처럼 사용자 입력이 ORDER BY에 들어가는 경우는 반드시 화이트리스트로 검증합니다.

```java
Map<String, String> SORT_COLUMNS = Map.of(
    "price", "price",
    "newest", "created_at",
    "popular", "sold_count"
);
String orderBy = SORT_COLUMNS.getOrDefault(sortParam, "created_at");
```

회원 비밀번호는 평문이나 복호화 가능한 암호화가 아니라 **느린 단방향 해시**(bcrypt, Argon2)로 저장합니다.

#### 4-2. Database as a Queue (순진한 구현)

주문 완료 후 알림 메일을 보내는 작업 테이블입니다.

```sql
-- 워커 여러 대가 같은 작업을 집어감
SELECT * FROM notification_job WHERE status = 'READY' ORDER BY job_id LIMIT 1;
UPDATE notification_job SET status = 'SENDING' WHERE job_id = :id;
```

두 워커가 같은 행을 SELECT한 뒤 둘 다 처리하면 **고객이 같은 메일을 두 번** 받습니다. `FOR UPDATE`만 붙이면 두 번째 워커가 첫 번째를 기다리며 사실상 직렬로 처리됩니다. 또 `SENT` 행이 계속 쌓이면서 MVCC bloat와 인덱스 비대가 누적됩니다. 올바른 구현은 [B-7](#b-7-큐-테이블-skip-locked)에서 다룹니다.

#### 4-3. Long-running Transaction

```java
@Transactional
public void placeOrder(OrderRequest req) {
    Order order = orderRepository.save(Order.from(req));
    stockService.decrease(req.getItems());
    paymentClient.approve(order);        // 외부 PG사 API 호출: 수 초 ~ 수십 초
    mailClient.sendOrderConfirmation();  // 외부 메일 서버 호출
}
```

트랜잭션을 연 채로 외부 API를 호출하면, PG사 응답이 느려지는 순간 DB 커넥션과 재고 행 락이 그 시간만큼 붙잡힙니다.

| DBMS | 증상 |
|---|---|
| PostgreSQL | `xmin` horizon이 고정되어 VACUUM이 dead tuple을 회수하지 못함 → bloat |
| MySQL InnoDB | undo log 누적(History list length 증가) → 읽기 성능 저하 |
| Oracle | undo 보존 부담, ORA-01555(snapshot too old) 위험 |
| 공통 | 재고 행 락 대기, 커넥션 풀 고갈 → 전체 장애로 확산 |

**해법**은 트랜잭션 경계를 짧게 자르는 것입니다. 주문을 "결제 대기" 상태로 먼저 커밋하고, 결제 승인은 트랜잭션 밖에서 호출한 뒤 결과를 별도 트랜잭션으로 반영합니다. 메일 발송은 [B-7](#b-7-큐-테이블-skip-locked)의 큐나 Transactional Outbox로 넘깁니다. PostgreSQL은 `idle_in_transaction_session_timeout`으로 방어선을 칠 수 있습니다.

#### 4-4. 무분별한 Soft Delete

```sql
ALTER TABLE customer ADD COLUMN deleted_at TIMESTAMP;
-- 이후 모든 쿼리에 WHERE deleted_at IS NULL
```

"실수로 지워도 복구할 수 있다"는 이유로 모든 테이블에 적용하면 비용이 쌓입니다.

| 문제 | 설명 |
|---|---|
| 조건 누락 | 한 쿼리라도 `deleted_at IS NULL`을 빠뜨리면 탈퇴 회원·삭제 상품이 노출 |
| UNIQUE 충돌 | 탈퇴한 회원이 같은 이메일로 재가입 불가 |
| FK 의미 붕괴 | 상품은 삭제 상태인데 장바구니 항목은 살아 있음 (CASCADE 동작 안 함) |
| 인덱스·테이블 비대 | 죽은 데이터가 활성 데이터와 같은 공간을 차지 |
| 개인정보 규정 | 회원 탈퇴 후 개인정보 파기 의무를 지키지 못한 상태가 될 수 있음 |

재가입 문제는 DBMS별로 "활성 행에만 적용되는 유니크 인덱스"로 해결합니다.

```sql
-- PostgreSQL: 부분 인덱스
CREATE UNIQUE INDEX ux_customer_email_active
  ON customer(email) WHERE deleted_at IS NULL;

-- SQL Server: 필터 인덱스
CREATE UNIQUE INDEX ux_customer_email_active
  ON customer(email) WHERE deleted_at IS NULL;

-- Oracle: 모든 키가 NULL인 행은 인덱싱되지 않는 성질을 이용
CREATE UNIQUE INDEX ux_customer_email_active
  ON customer (CASE WHEN deleted_at IS NULL THEN email END);

-- MySQL: 부분 인덱스가 없으므로 생성 컬럼 + 다중 NULL 허용 성질을 이용
ALTER TABLE customer
  ADD COLUMN active_flag TINYINT
    GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
  ADD UNIQUE INDEX ux_customer_email_active (email, active_flag);
```

더 근본적인 대안은 삭제 시 **아카이브 테이블로 이동**하거나, 변경 추적이 목적이라면 이력 테이블([B-3](#b-3-이력시간-모델링))을 두는 것입니다. 회원 탈퇴처럼 법적 파기 의무가 있는 데이터는 논리 삭제 후 보관 기간이 지나면 실제로 삭제하거나 익명화하는 배치가 필요합니다.

#### 4-5. Shared Database Integration

주문 서비스, 재고 서비스, 정산 서비스가 같은 DB의 `orders` 테이블을 직접 읽고 씁니다.

그러면 테이블 스키마가 사실상 **공개 API**가 됩니다. 주문 테이블의 컬럼 하나를 바꾸는 데 모든 팀의 합의가 필요해지고, 어떤 서비스가 주문 상태를 바꿨는지 추적하기 어려워집니다.

해법은 데이터 소유권을 한 서비스로 정하고, 다른 서비스는 API, 읽기 전용 뷰, CDC 이벤트를 통해서만 접근하게 하는 것입니다. DB 레벨에서는 소유자 계정과 애플리케이션 계정을 분리하고, 다른 서비스 계정에는 **필요한 뷰에 대한 SELECT 권한만** 주는 방식으로 이 원칙을 강제할 수 있습니다.

---

## Part B. 디자인 패턴

### B-1. 서브타입(상속) 모델링 3종

EAV와 다형성 FK의 정석 대안입니다. 쇼핑몰이 의류, 전자제품, 도서를 판다고 가정합니다. 공통 속성(이름, 가격)과 유형별 속성(사이즈, 보증 기간, ISBN)이 섞여 있습니다.

```sql
-- (1) Single Table Inheritance: 한 테이블에 모두
CREATE TABLE product (
  product_id      BIGINT PRIMARY KEY,
  product_type    VARCHAR(20) NOT NULL,   -- APPAREL / ELECTRONICS / BOOK
  name            VARCHAR(200) NOT NULL,
  price           NUMERIC(12,2) NOT NULL,
  size_label      VARCHAR(10),   -- APPAREL 전용
  material        VARCHAR(50),   -- APPAREL 전용
  warranty_months INT,           -- ELECTRONICS 전용
  isbn            VARCHAR(13),   -- BOOK 전용
  CONSTRAINT ck_book_isbn CHECK (product_type <> 'BOOK' OR isbn IS NOT NULL)
);

-- (2) Class Table Inheritance: 공통 테이블 + 유형별 1:1 테이블
CREATE TABLE product (
  product_id   BIGINT PRIMARY KEY,
  product_type VARCHAR(20) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  price        NUMERIC(12,2) NOT NULL
);
CREATE TABLE apparel (
  product_id BIGINT PRIMARY KEY REFERENCES product(product_id),
  size_label VARCHAR(10) NOT NULL,
  material   VARCHAR(50) NOT NULL
);
CREATE TABLE electronics (
  product_id      BIGINT PRIMARY KEY REFERENCES product(product_id),
  warranty_months INT NOT NULL
);
CREATE TABLE book (
  product_id BIGINT PRIMARY KEY REFERENCES product(product_id),
  isbn       VARCHAR(13) NOT NULL UNIQUE,
  author     VARCHAR(100) NOT NULL
);

-- (3) Concrete Table Inheritance: 유형별 완전 독립 테이블
CREATE TABLE apparel (apparel_id BIGINT PRIMARY KEY, name VARCHAR(200), price NUMERIC(12,2),
                      size_label VARCHAR(10) NOT NULL, material VARCHAR(50) NOT NULL);
CREATE TABLE book    (book_id BIGINT PRIMARY KEY, name VARCHAR(200), price NUMERIC(12,2),
                      isbn VARCHAR(13) NOT NULL, author VARCHAR(100) NOT NULL);
```

| 기준 | STI | CTI | Concrete |
|---|---|---|---|
| 전체 상품 목록 조회 | 매우 쉬움 | 공통 테이블만 조회하면 됨 | UNION 필요 |
| 유형별 NOT NULL | CHECK로 우회 | 자연스러움 | 자연스러움 |
| 주문 항목의 FK 대상 | 가능 | 가능 (`product`) | 불가 |
| 새 상품 유형 추가 | 컬럼 추가 | 테이블 추가 | 테이블 추가 |
| 희소성 | NULL 많음 | 없음 | 없음 |
| JPA 매핑 | `SINGLE_TABLE` | `JOINED` | `TABLE_PER_CLASS` |
| 적합한 경우 | 유형이 적고 속성 차이가 작음 | 공통 참조가 필요하고 유형별 속성이 많음 | 유형 간 공통 조회가 거의 없음 |

쇼핑몰에서는 주문 항목, 장바구니, 리뷰가 모두 "상품"을 참조해야 하므로 **CTI**가 기본 선택입니다. 유형 수가 적고 차이가 몇 컬럼뿐이면 STI가 더 실용적이고, 유형이 수십 가지로 늘어나며 속성이 판매자마다 다르다면 CTI의 공통 테이블 + JSON 스펙 컬럼을 조합하는 방식이 현실적입니다.

### B-2. 계층 구조 모델 4종

카테고리 트리를 예로 네 가지 모델을 비교합니다.

```sql
-- Path Enumeration: 경로를 문자열로 저장
CREATE TABLE category (
  category_id BIGINT PRIMARY KEY,
  path        VARCHAR(500) NOT NULL,   -- '/1/4/7/'  (가전 > TV > OLED TV)
  name        VARCHAR(100)
);
SELECT * FROM category WHERE path LIKE '/1/4/%';   -- TV 하위 전체 (앞쪽 고정이라 인덱스 사용 가능)

-- Nested Sets: 트리를 좌우 번호로 인코딩
CREATE TABLE category (
  category_id BIGINT PRIMARY KEY,
  lft INT NOT NULL,
  rgt INT NOT NULL,
  name VARCHAR(100)
);
SELECT c.* FROM category c, category root
WHERE root.category_id = :id AND c.lft BETWEEN root.lft AND root.rgt;

-- Closure Table: 모든 조상-자손 쌍을 저장
CREATE TABLE category_path (
  ancestor_id   BIGINT NOT NULL REFERENCES category(category_id),
  descendant_id BIGINT NOT NULL REFERENCES category(category_id),
  depth         INT NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX ix_cp_desc ON category_path(descendant_id);
```

Closure Table은 "하위 카테고리 전체에 속한 상품 수" 같은 쇼핑몰의 핵심 질의를 단순한 조인으로 해결합니다.

```sql
-- '가전' 하위 모든 카테고리의 상품 수
SELECT COUNT(DISTINCT pc.product_id)
FROM category_path cp
JOIN product_category pc ON pc.category_id = cp.descendant_id
WHERE cp.ancestor_id = :electronics_id;

-- 브레드크럼(가전 > TV > OLED TV): 조상 경로 조회
SELECT c.name
FROM category_path cp
JOIN category c ON c.category_id = cp.ancestor_id
WHERE cp.descendant_id = :oled_tv_id
ORDER BY cp.depth DESC;

-- 새 카테고리 추가: 부모의 모든 조상 경로를 복사 + 자기 자신
INSERT INTO category_path (ancestor_id, descendant_id, depth)
SELECT ancestor_id, :new_id, depth + 1
FROM category_path WHERE descendant_id = :parent_id
UNION ALL
SELECT :new_id, :new_id, 0;
```

| 모델 | 하위 전체 조회 | 조상 경로 조회 | 삽입 | 이동 | 참조 무결성 | 저장 공간 |
|---|---|---|---|---|---|---|
| Adjacency List | 재귀 CTE | 재귀 CTE | 쉬움 | 쉬움 | FK 가능 | 최소 |
| Path Enumeration | `LIKE 'prefix%'` | 문자열 파싱 | 쉬움 | 하위 경로 일괄 갱신 | FK 불가 | 작음 |
| Nested Sets | 범위 조건, 매우 빠름 | 범위 조건 | **매우 비쌈** (대량 재번호) | 매우 비쌈 | FK 불가 | 작음 |
| Closure Table | 단일 조인 | 단일 조인 | 보통 | 비쌈 (서브트리 경로 재구성) | FK 가능 | 최악 O(n²) |

PostgreSQL에는 Path Enumeration 전용 타입인 `ltree` 확장이 있어 GiST 인덱스를 지원합니다. SQL Server에는 `hierarchyid` 타입이 있습니다.

**선택 가이드**: 트리가 얕거나 구조 변경이 잦으면 Adjacency List + 재귀 CTE를 기본으로 씁니다. 깊고 읽기 위주이며 하위 트리 집계가 핵심이라면 Closure Table을 씁니다. Nested Sets는 거의 변하지 않는 분류 체계 외에는 권하지 않습니다. 실무에서는 **Adjacency List를 원본으로 두고 Closure Table을 파생 데이터로 유지**하는 조합도 많이 씁니다.

### B-3. 이력(시간) 모델링

상품 가격은 계속 바뀝니다. "8월 15일 할인 행사 당시 가격이 얼마였나?"에 답하려면 이력이 필요합니다.

```sql
-- 유효 기간 모델 (SCD Type 2)
CREATE TABLE product_price_history (
  product_id BIGINT NOT NULL REFERENCES product(product_id),
  price      NUMERIC(12,2) NOT NULL,
  valid_from TIMESTAMP NOT NULL,
  valid_to   TIMESTAMP NOT NULL DEFAULT '9999-12-31',
  PRIMARY KEY (product_id, valid_from)
);

-- 특정 시점 가격
SELECT price FROM product_price_history
WHERE product_id = :id
  AND :as_of >= valid_from
  AND :as_of <  valid_to;

-- 가격 변경: 기존 구간을 닫고 새 구간 삽입 (한 트랜잭션)
UPDATE product_price_history
SET valid_to = :changed_at
WHERE product_id = :id AND valid_to = '9999-12-31';

INSERT INTO product_price_history (product_id, price, valid_from)
VALUES (:id, :new_price, :changed_at);
```

설계 원칙 두 가지입니다.

- 구간은 **반열린 구간 `[from, to)`** 으로 둡니다. 닫힌 구간을 쓰면 경계 시점에 두 행이 동시에 매칭됩니다.
- 열린 끝은 NULL 대신 먼 미래 날짜로 두면 인덱스 범위 조건이 단순해집니다.

**기간 겹침 방지**가 이 패턴의 난제입니다.

| DBMS | 겹침 방지 수단 |
|---|---|
| PostgreSQL | `EXCLUDE` 제약 (`btree_gist` 확장 필요) |
| SQL Server | 시스템 버전 임시 테이블(2016+)로 변경 이력 자동 관리 |
| MariaDB | 시스템 버전 테이블, 애플리케이션 기간(`PERIOD FOR`) 지원 |
| Oracle | Flashback Data Archive(변경 이력), Temporal Validity(유효 기간 조회 편의) |
| MySQL | 네이티브 지원 없음 → 트리거나 애플리케이션 락으로 보장 |

```sql
-- PostgreSQL: 같은 상품의 가격 구간이 겹치지 않도록 DB가 보장
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE product_price_history
  ADD CONSTRAINT ex_price_no_overlap
  EXCLUDE USING gist (product_id WITH =, tsrange(valid_from, valid_to) WITH &&);
```

참고로 **주문 항목에는 주문 시점의 가격을 스냅샷으로 복사**해 두는 것이 정석입니다. 주문 금액을 이력 테이블 조인으로 재계산하는 구조는 할인·쿠폰·반올림 규칙이 바뀌는 순간 과거 주문 금액이 달라지는 위험이 있습니다. 이것은 "정규화 위반"이 아니라, 주문 시점의 사실을 기록하는 올바른 모델링입니다.

"값이 언제 DB에서 바뀌었나"(트랜잭션 시간)와 "값이 언제부터 유효한가"(유효 시간)는 다른 축입니다. 예약된 가격 변경이나 소급 정정이 잦다면 두 축을 모두 관리하는 **bitemporal** 모델을 검토합니다.

### B-4. 감사 로그(Audit Trail)

"누가 이 상품 가격을 0원으로 바꿨나?"에 답하기 위한 패턴입니다.

```sql
CREATE TABLE audit_log (
  audit_id    BIGINT PRIMARY KEY,
  table_name  VARCHAR(50)  NOT NULL,
  row_pk      VARCHAR(100) NOT NULL,
  operation   CHAR(1)      NOT NULL,   -- I / U / D
  before_data JSONB,
  after_data  JSONB,
  changed_by  VARCHAR(50)  NOT NULL,
  changed_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_audit_row ON audit_log(table_name, row_pk, changed_at);
```

구현 방식은 세 가지이고 트레이드오프가 분명합니다.

| 방식 | 장점 | 단점 |
|---|---|---|
| 트리거 | 누락 없음, 앱을 우회한 수정도 기록 | 쓰기 지연 증가, 앱 사용자 정보를 알기 어려움 |
| 애플리케이션 (JPA Envers 등) | 관리자 ID 등 컨텍스트가 풍부 | 직접 SQL·배치로 수정하면 누락 |
| CDC (Debezium 등) | 원본 DB 부하 거의 없음, 비동기 | 인프라 필요, 사용자 정보 없음 |

트리거 방식에서 "어느 관리자가 바꿨는지"를 남기려면 세션 변수로 전달합니다.

```sql
-- PostgreSQL: 트랜잭션 시작 시 애플리케이션이 설정
SET LOCAL app.user_id = 'admin_kim';
-- 트리거 안에서 읽기
current_setting('app.user_id', true)
```

Oracle은 `DBMS_SESSION.SET_CONTEXT`, SQL Server는 `sp_set_session_context` / `SESSION_CONTEXT()`로 같은 일을 합니다.

### B-5. 낙관적 락과 조건부 갱신

관리자 두 명이 같은 상품 정보를 동시에 수정하는 상황입니다. A가 가격을, B가 설명을 고치고 나중에 저장한 사람이 앞사람의 변경을 덮어씁니다(lost update).

```sql
ALTER TABLE product ADD COLUMN version INT NOT NULL DEFAULT 0;

UPDATE product
SET    price = :price, version = version + 1
WHERE  product_id = :id
  AND  version = :read_version;
-- 영향받은 행 수가 0이면 다른 사람이 먼저 수정한 것 → "최신 내용을 다시 불러오세요"
```

화면을 열어두고 몇 분 뒤에 저장하는 것처럼 **DB 트랜잭션보다 긴 논리적 작업**에서 쓰는 표준 방법입니다. 트랜잭션을 길게 열 필요가 없어 4-3의 문제도 피합니다. JPA에서는 `@Version` 필드 하나로 적용됩니다.

재고 차감처럼 충돌이 잦은 경우에는 버전 비교 대신 **조건부 갱신**이 더 단순하고 강력합니다.

```sql
UPDATE product_stock
SET    quantity = quantity - :qty
WHERE  product_id = :id
  AND  quantity >= :qty;
-- 영향받은 행 수가 0이면 재고 부족
```

"조회 → 애플리케이션에서 계산 → 갱신" 대신 **판단과 변경을 한 문장에서 원자적으로** 처리하므로 초과 판매(overselling)가 생기지 않습니다. 충돌이 잦고 재시도 비용이 크며 여러 행을 함께 검증해야 한다면 비관적 락(`SELECT ... FOR UPDATE`)이 적합합니다.

### B-6. 키셋(Seek) 페이지네이션

3-4의 OFFSET 문제를 해결하는 패턴입니다.

```sql
-- 첫 페이지
SELECT product_id, name, price, created_at
FROM product
ORDER BY created_at DESC, product_id DESC
LIMIT 20;

-- 다음 페이지: 직전 페이지 마지막 행의 (created_at, product_id)를 커서로 전달
SELECT product_id, name, price, created_at
FROM product
WHERE created_at < :last_created_at
   OR (created_at = :last_created_at AND product_id < :last_product_id)
ORDER BY created_at DESC, product_id DESC
LIMIT 20;

-- 필요 인덱스
CREATE INDEX ix_product_cursor ON product(created_at DESC, product_id DESC);
```

- 정렬 키가 유일하지 않으면(같은 시각에 등록된 상품) **타이브레이커 컬럼**(`product_id`)을 반드시 넣어야 누락·중복이 생기지 않습니다.
- PostgreSQL은 행 값 비교 `WHERE (created_at, product_id) < (:c, :p)`를 인덱스로 처리할 수 있어 더 간결합니다.
- Oracle과 SQL Server는 이 행 값 비교 문법을 지원하지 않으므로 위의 OR 형태를 씁니다.
- MySQL은 문법은 지원하지만 버전에 따라 범위 최적화가 기대대로 되지 않을 수 있어, 실행 계획을 확인하고 OR 형태를 쓰는 것이 안전합니다.

API 응답에는 커서 값을 그대로 노출하기보다 Base64 등으로 인코딩한 불투명 토큰(`next_cursor`)으로 전달하면, 나중에 정렬 키가 바뀌어도 클라이언트를 수정하지 않아도 됩니다.

한계는 "37페이지로 바로 이동"이 안 된다는 점입니다. 상품 목록의 무한 스크롤·모바일 앱에 적합하고, 관리자 화면의 페이지 번호 UI에는 OFFSET을 쓰되 최대 페이지를 제한하는 절충을 씁니다.

### B-7. 큐 테이블 (SKIP LOCKED)

4-2의 알림 발송 큐를 올바르게 구현합니다.

```sql
CREATE TABLE notification_job (
  job_id     BIGINT PRIMARY KEY,
  order_id   BIGINT NOT NULL,
  job_type   VARCHAR(30) NOT NULL,   -- ORDER_CONFIRMED, SHIPPED ...
  status     VARCHAR(10) NOT NULL DEFAULT 'READY',
  locked_by  VARCHAR(50),
  locked_at  TIMESTAMP,
  attempts   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PostgreSQL: 처리 대기 작업 10건을 원자적으로 가져오기
UPDATE notification_job
SET status = 'RUNNING', locked_by = :worker, locked_at = NOW(), attempts = attempts + 1
WHERE job_id IN (
  SELECT job_id FROM notification_job
  WHERE status = 'READY'
  ORDER BY job_id
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- SQL Server
UPDATE TOP (10) notification_job WITH (ROWLOCK, READPAST, UPDLOCK)
SET status = 'RUNNING', locked_by = @worker, locked_at = SYSUTCDATETIME()
OUTPUT inserted.*
WHERE status = 'READY';
```

`SKIP LOCKED`(PostgreSQL 9.5+, MySQL 8.0+, Oracle)와 SQL Server의 `READPAST`는 다른 워커가 잠근 행을 기다리지 않고 건너뜁니다. 워커를 늘려도 서로 막지 않습니다. MySQL은 `RETURNING`이 없으므로 `SELECT ... FOR UPDATE SKIP LOCKED` 후 같은 트랜잭션에서 UPDATE하는 두 단계로 구현합니다.

운영에서 함께 챙길 것들입니다.

- **부분 인덱스**: `CREATE INDEX ix_job_ready ON notification_job(job_id) WHERE status = 'READY'`로 처리 대기 행만 인덱싱해 작게 유지합니다.
- **좀비 작업 회수**: 워커가 죽어 `locked_at`이 오래된 `RUNNING` 행을 `READY`로 되돌리는 스위퍼를 둡니다.
- **재시도 한도**: `attempts`가 일정 횟수를 넘으면 `FAILED`로 옮겨 사람이 확인하게 합니다(dead letter).
- **완료 행 정리**: 주기적 삭제나 파티션 DROP으로 bloat를 막습니다.
- **멱등성**: 회수된 작업은 두 번 실행될 수 있으므로 작업 자체가 멱등해야 합니다([B-8](#b-8-멱등성-키-idempotency-key)).

주문 저장과 같은 트랜잭션에서 이 테이블에 작업을 넣으면 **Transactional Outbox 패턴**의 폴링 방식 구현이 됩니다. "주문은 저장됐는데 메시지 발행은 실패"하는 이중 쓰기 문제를 DB 트랜잭션 하나로 해결합니다. 초당 처리량이 수천 건을 넘어가면 Kafka·RabbitMQ 같은 전용 브로커를 검토합니다.

### B-8. 멱등성 키 (Idempotency Key)

사용자가 "결제하기" 버튼을 두 번 누르거나, 네트워크 타임아웃으로 클라이언트가 재시도하면 같은 결제 요청이 두 번 도착합니다.

```sql
CREATE TABLE idempotency_key (
  idem_key     VARCHAR(64) PRIMARY KEY,   -- 클라이언트가 요청마다 생성한 UUID
  request_hash CHAR(64) NOT NULL,          -- 요청 본문의 해시
  response     JSONB,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 결제 처리와 같은 트랜잭션에서 (PostgreSQL)
INSERT INTO idempotency_key (idem_key, request_hash)
VALUES (:key, :hash)
ON CONFLICT (idem_key) DO NOTHING;
-- 영향 행 수가 0이면 이미 처리된 요청 → 저장된 response를 그대로 반환
```

- `request_hash`를 함께 저장해서 **같은 키에 다른 내용**이 오면 오류로 처리해야 합니다. 그렇지 않으면 클라이언트 버그로 키를 재사용했을 때 엉뚱한 응답이 반환됩니다.
- MySQL에서 `INSERT IGNORE`는 중복 키 외의 오류(데이터 잘림 등)까지 경고로 바꿔 삼키므로, `INSERT ... ON DUPLICATE KEY UPDATE idem_key = idem_key`가 더 안전합니다.
- 키는 영구 보관할 필요가 없으므로 보관 기간(예: 24시간~7일)을 정하고 주기적으로 정리합니다.

Kafka의 at-least-once 소비, 배치 재실행, 외부 PG사 웹훅 중복 수신에도 같은 패턴을 씁니다.

### B-9. 읽기 모델 분리 (CQRS, 집계 테이블)

"실시간 인기 상품 순위", "카테고리별 매출" 같은 화면을 매번 주문 테이블 전체에서 계산하면 트래픽이 몰릴 때 DB가 버티지 못합니다. **쓰기는 정규화된 원천 테이블에, 읽기는 미리 집계된 형태에서** 하는 패턴입니다.

```sql
-- 집계 테이블
CREATE TABLE product_sales_daily (
  sales_date  DATE   NOT NULL,
  product_id  BIGINT NOT NULL,
  order_count INT    NOT NULL,
  sold_qty    INT    NOT NULL,
  revenue     NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (sales_date, product_id)
);

-- 배치: 전날 주문을 집계해 UPSERT (PostgreSQL)
INSERT INTO product_sales_daily (sales_date, product_id, order_count, sold_qty, revenue)
SELECT DATE(o.ordered_at), oi.product_id,
       COUNT(DISTINCT o.order_id), SUM(oi.quantity), SUM(oi.quantity * oi.unit_price)
FROM orders o
JOIN order_item oi ON oi.order_id = o.order_id
WHERE o.ordered_at >= :day AND o.ordered_at < :day + INTERVAL '1 day'
  AND o.status <> 'CANCELLED'
GROUP BY DATE(o.ordered_at), oi.product_id
ON CONFLICT (sales_date, product_id) DO UPDATE
SET order_count = EXCLUDED.order_count,
    sold_qty    = EXCLUDED.sold_qty,
    revenue     = EXCLUDED.revenue;
```

이 배치는 같은 날짜로 여러 번 실행해도 결과가 같습니다(멱등). 대량 데이터라면 "스테이징 테이블에 적재 → MERGE/UPSERT → 사라진 행 삭제 → 스테이징 비우기" 순서로 구성하는 것이 표준입니다.

| 수단 | 갱신 방식 | 특징 |
|---|---|---|
| 뷰 | 조회할 때마다 계산 | 항상 최신이지만 느림 |
| Materialized View | 주기적 REFRESH | PostgreSQL `REFRESH ... CONCURRENTLY`(유니크 인덱스 필요), Oracle은 fast refresh·query rewrite 지원 |
| 집계 테이블 + 배치 | 스테이징 → MERGE | 구현 단순, 지연 = 배치 주기 |
| 집계 테이블 + 이벤트 | CDC·메시지로 증분 갱신 | 지연이 짧지만 구현 복잡 |
| 캐시 (Redis Sorted Set 등) | 이벤트마다 증분 | 실시간 순위에 적합, 원천 대비 정합성 관리 필요 |

핵심 설계 결정은 **허용 가능한 지연(staleness)** 입니다. "매출 통계는 매일 새벽 기준", "인기 순위는 10분마다 갱신"처럼 기준 시각을 화면에 표시하는 것이 기술적 해결보다 효과적인 경우가 많습니다.

---

## Part C. 정리: 안티패턴은 문맥적이다

안티패턴 목록을 외우는 것보다 중요한 것은 **"이 안티패턴이 정당화되는 조건"을 말할 수 있는 것**입니다.

| 안티패턴 | 허용될 수 있는 조건 |
|---|---|
| FK 생략 | 서비스별 DB 분리, 샤딩, 초대용량 로그 적재, 원천에서 무결성 보장 |
| EAV / JSON | 속성이 진짜로 판매자 정의이고, 검색·제약 대상이 아님 |
| 콤마 목록 / 배열 | 참조 무결성이 불필요하고, 항상 통째로 읽고 씀 |
| Soft delete | 복구 요구가 명확하고, 부분 유니크 인덱스와 파기 배치로 보완 |
| 비정규화 | 측정된 읽기 병목이 있고, 동기화 책임자가 명확 (주문 가격 스냅샷은 애초에 비정규화가 아님) |
| OFFSET | 페이지 수가 제한된 관리자 화면 |
| DB 큐 | 처리량이 크지 않고, 트랜잭션 일관성이 중요 |

그리고 이 글 전체에서 반복해서 나타나는 원리를 세 가지로 요약할 수 있습니다.

1. **데이터와 메타데이터를 섞지 않는다.**
   Jaywalking, 다중 컬럼, Metadata Tribbles, EAV는 모두 "값이어야 할 것"을 구조(컬럼명, 테이블명, 문자열 포맷)에 넣었거나, 반대로 "구조여야 할 것"을 값에 넣은 경우입니다.

2. **무결성은 가능한 한 DB가 선언적으로 보장한다.**
   FK, CHECK, UNIQUE, EXCLUDE, 조건부 UPDATE로 표현할 수 있는 규칙을 애플리케이션 코드로 옮기면, 그 코드를 거치지 않는 경로(배치, 수동 SQL, 다른 서비스)가 반드시 생깁니다.

3. **"유연성"의 비용은 읽는 쪽이 치른다.**
   EAV, 다형성 FK, 무분별한 JSON은 쓰기를 쉽게 만들고 조회·검증·집계를 어렵게 만듭니다. 데이터는 한 번 쓰이고 수없이 읽힙니다.

---

## 참고 자료

- Bill Karwin, *SQL Antipatterns* (한국어판 『SQL 안티패턴』, 인사이트)
- Martin Kleppmann, *Designing Data-Intensive Applications* (한국어판 『데이터 중심 애플리케이션 설계』, 위키북스)
- Martin Fowler, *Patterns of Enterprise Application Architecture* — Single/Class/Concrete Table Inheritance
- Markus Winand, *Use The Index, Luke* (use-the-index-luke.com) — 인덱스와 키셋 페이지네이션
- 각 DBMS 공식 문서: PostgreSQL, MySQL, Oracle Database, SQL Server
