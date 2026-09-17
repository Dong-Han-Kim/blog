---
# 📌 기본 메타데이터
title: '요청 한 건의 일생 4편 — 트랜잭션과 커넥션 풀, 부하에서 먼저 무너지는 지점'
date: '2026-09-17'
category: 'backend'
tags: ['Backend', 'Transaction', 'PostgreSQL', 'Performance']
description: '트랜잭션이 하나의 연결 위에서만 성립하는 이유와 격리 수준, 커넥션 풀이 고갈되는 장애 시나리오와 사이징 기준, 그리고 EXPLAIN ANALYZE와 N+1과 OFFSET 페이지네이션까지 실무에서 터지는 지점들을 본다.'

# 💬 옵션 필드
draft: false
series: '요청 한 건의 일생'
seriesOrder: 4

# 📚 SEO용
keywords: ['트랜잭션', '격리 수준', 'Repeatable Read', 'Serializable', '커넥션 풀 고갈', '풀 사이징', 'EXPLAIN ANALYZE', 'N+1 문제', 'Keyset 페이지네이션']
---

# 요청 한 건의 일생 4편 — 트랜잭션과 커넥션 풀, 부하에서 먼저 무너지는 지점

여기서부터는 심화편이다. 3편까지 따라온 기본 여정이 부하와 장애 상황에서 어떻게 무너지는지, 가장 먼저 금이 가는 세 곳부터 본다.

## 10. 트랜잭션과 격리 수준

### 10-1. 트랜잭션은 "하나의 연결" 위에서만 성립한다

가장 흔한 실수부터 보자.

```ts
// ❌ 잘못된 코드: 세 쿼리가 서로 다른 연결에서 실행될 수 있다
await pool.query('BEGIN');
await pool.query('UPDATE accounts SET balance = balance - 100 WHERE id = 1');
await pool.query('COMMIT');
```

`pool.query()`는 호출할 때마다 풀에서 **아무 연결이나** 빌려 쓴다. `BEGIN`을 받은 연결과 `UPDATE`를 실행한 연결이 다를 수 있고, 최악의 경우 `BEGIN`만 걸린 연결이 풀에 반납되어 다음 요청이 엉뚱한 트랜잭션 안에서 실행된다.

```ts
// ✅ 올바른 코드: 연결 하나를 명시적으로 잡는다
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();          // 반드시 반납. 누락 = 커넥션 누수
  }
}

// Service에서 트랜잭션 경계를 정한다
await withTransaction(async (tx) => {
  await accountRepo.withdraw(tx, fromId, amount);
  await accountRepo.deposit(tx, toId, amount);
  await ledgerRepo.record(tx, { fromId, toId, amount });
});
```

Repository가 `Pool` 대신 `PoolClient`(또는 공통 인터페이스)를 받도록 설계하면, 같은 메서드를 트랜잭션 안팎에서 재사용할 수 있다.

### 10-2. 트랜잭션 안에서 절대 하지 말 것

```ts
await withTransaction(async (tx) => {
  await orderRepo.create(tx, order);
  await paymentGateway.charge(order);   // ❌ 외부 HTTP 호출 (수 초가 걸릴 수 있음)
  await orderRepo.markPaid(tx, order.id);
});
```

트랜잭션이 열려 있는 동안 **커넥션을 점유하고, 잡은 락을 유지**한다. 외부 API가 3초 걸리면 그 3초 동안 풀의 연결 하나가 사라지고, 같은 행을 수정하려는 다른 요청은 대기한다. 외부 호출은 트랜잭션 밖으로 빼고, 상태 전이(주문 생성 → 결제 → 결제 완료 기록)로 설계하는 것이 원칙이다.

### 10-3. 격리 수준

| 수준 | Dirty Read | Non-Repeatable Read | Phantom | 비고 |
|---|---|---|---|---|
| READ UNCOMMITTED | 가능 | 가능 | 가능 | PostgreSQL은 READ COMMITTED처럼 동작 |
| READ COMMITTED | X | 가능 | 가능 | **PostgreSQL, Oracle 기본값** |
| REPEATABLE READ | X | X | 표준상 가능 | **MySQL InnoDB 기본값**. PostgreSQL은 이 수준에서 팬텀도 막음 |
| SERIALIZABLE | X | X | X | 충돌 시 직렬화 실패 에러 → **재시도 로직 필수** |

READ COMMITTED에서 흔히 터지는 버그가 **Lost Update**다.

```
요청 A: SELECT stock FROM items WHERE id=1   → 10
요청 B: SELECT stock FROM items WHERE id=1   → 10
요청 A: UPDATE items SET stock = 9 WHERE id=1
요청 B: UPDATE items SET stock = 9 WHERE id=1   → 두 개 팔렸는데 재고는 9
```

해결 방법은 세 가지다.

```sql
-- ① 원자적 연산으로 바꾸기 (가장 좋다)
UPDATE items SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING stock;

-- ② 비관적 락: 조회 시점에 행을 잠근다
SELECT stock FROM items WHERE id = $1 FOR UPDATE;

-- ③ 낙관적 락: 버전 컬럼으로 충돌 감지
UPDATE items SET stock = $2, version = version + 1
WHERE id = $1 AND version = $3;   -- 영향받은 행이 0이면 충돌 → 재시도 또는 409
```

---

## 11. 커넥션 풀 고갈과 사이징

### 11-1. 장애 시나리오

트래픽이 갑자기 늘거나 느린 쿼리 하나가 생겼을 때 일어나는 일을 따라가 보자.

```
1. 특정 쿼리가 평소 20ms → 2초로 느려짐 (인덱스 누락, 락 대기 등)
2. 풀의 연결 10개가 전부 이 쿼리에 묶임
3. 새 요청들은 풀 대기열에서 줄을 섬
4. connectionTimeoutMillis가 0(기본값)이면 → 무한 대기
5. Node 메모리에 대기 중인 요청이 쌓임, 클라이언트는 타임아웃 후 재시도
6. 재시도가 대기열을 더 늘림 (재시도 폭풍)
7. 로드밸런서 헬스체크도 응답 못 함 → 인스턴스가 빠짐 → 남은 인스턴스에 부하 집중
8. 전체 장애
```

느린 쿼리 **하나**가 전체 서비스를 멈추게 하는 전형적인 경로다. 방어선은 이렇다.

- `connectionTimeoutMillis`를 반드시 설정해 **빨리 실패**시키기 (→ 503 반환)
- `statement_timeout`으로 느린 쿼리를 DB가 스스로 끊게 하기
- 헬스체크 엔드포인트는 DB 풀과 분리하거나 가볍게 만들기
- 클라이언트 재시도에는 지수 백오프 + 지터 적용

### 11-2. 풀 크기는 "크게"가 답이 아니다

직관과 반대로, 연결을 늘리면 오히려 느려지는 경우가 많다. DB 서버의 CPU 코어 수는 정해져 있고, 동시에 실행 중인 쿼리가 코어 수를 크게 넘으면 컨텍스트 스위칭과 락 경합만 늘어난다.

PostgreSQL 위키와 HikariCP 문서에서 출발점으로 제시하는 공식:

```
connections = (DB 코어 수 × 2) + 유효 디스크 수
```

8코어 DB라면 대략 17~20개 수준에서 시작해 측정으로 조정한다. 그리고 반드시 **전체 합계**로 생각해야 한다.

```
총 연결 수 = 인스턴스 수 × 인스턴스당 max
예) Node 인스턴스 8개(클러스터 포함) × max 10 = 80개
    + 배치 작업 + 관리 도구 + 마이그레이션 ...
    → PostgreSQL max_connections(기본 100)를 쉽게 넘는다
```

오토스케일링으로 인스턴스가 늘어나면 DB 연결 수도 선형으로 늘어난다는 점을 잊기 쉽다. 인스턴스가 많아지면 **PgBouncer** 같은 외부 풀러를 앞에 두어, 수백 개의 클라이언트 연결을 수십 개의 실제 DB 연결로 모은다.

> PgBouncer의 transaction pooling 모드에서는 트랜잭션이 끝나면 실제 연결이 다른 클라이언트에게 넘어간다. 따라서 세션 단위 기능(`SET`, 세션 레벨 advisory lock, `LISTEN` 등)은 기대대로 동작하지 않는다. 이름 있는 prepared statement 지원 여부도 PgBouncer 버전과 설정에 따라 다르니 확인이 필요하다.

### 11-3. 풀 상태를 관측하라

```ts
setInterval(() => {
  metrics.gauge('db.pool.total', pool.totalCount);     // 생성된 연결 수
  metrics.gauge('db.pool.idle', pool.idleCount);       // 놀고 있는 연결
  metrics.gauge('db.pool.waiting', pool.waitingCount); // 대기 중인 요청 ← 가장 중요한 지표
}, 5_000);
```

`waitingCount`가 0보다 큰 상태가 지속된다면 풀이 병목이다. 이때 풀을 늘리기 전에 **왜 연결이 오래 점유되는지**(느린 쿼리, 긴 트랜잭션, 누수)를 먼저 확인하자.

DB 쪽에서도 볼 수 있다.

```sql
SELECT pid, application_name, state, wait_event_type, wait_event,
       now() - xact_start AS xact_age, left(query, 80) AS query
FROM pg_stat_activity
WHERE datname = 'app'
ORDER BY xact_age DESC NULLS LAST;
```

`state = 'idle in transaction'`이 오래 지속되는 연결은 트랜잭션을 열어 놓고 커밋/롤백을 안 한 코드, 즉 **누수**의 흔적이다. `idle_in_transaction_session_timeout` 설정으로 강제 종료할 수 있다.

---

## 12. 쿼리 성능: 인덱스, 실행 계획, N+1, 페이지네이션

### 12-1. EXPLAIN ANALYZE 읽기

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, title FROM posts WHERE author_id = 42 ORDER BY created_at DESC LIMIT 20;
```

```
Limit  (cost=0.43..8.95 rows=20 width=40) (actual time=0.031..0.090 rows=20 loops=1)
  Buffers: shared hit=24
  ->  Index Scan using posts_author_created_idx on posts
        (actual time=0.030..0.085 rows=20 loops=1)
        Index Cond: (author_id = 42)
Planning Time: 0.120 ms
Execution Time: 0.110 ms
```

보는 순서:

1. **Seq Scan이 큰 테이블에 있는가** → 인덱스 누락 의심
2. **예상 rows vs 실제 rows 차이가 큰가** → 통계가 낡음 (`ANALYZE` 필요)
3. **`Buffers: shared read`가 큰가** → 캐시 미스로 디스크를 많이 읽음
4. **`Sort`에 `external merge`가 보이는가** → `work_mem` 부족으로 디스크 정렬
5. **`loops` 값이 큰 노드** → 중첩 반복이 비용을 곱하고 있음

위 예시는 `(author_id, created_at DESC)` 복합 인덱스 덕분에 정렬 없이 20개만 읽고 멈췄다. 복합 인덱스는 **등호 조건 컬럼을 앞에, 정렬/범위 컬럼을 뒤에** 두는 것이 기본이다.

### 12-2. N+1 문제

게시글 20개와 각 작성자를 보여주는 API를 생각해 보자.

```ts
// ❌ N+1: 쿼리 1번 + 게시글 수만큼 추가 쿼리
const posts = await postRepo.findRecent(20);             // 1번
for (const post of posts) {
  post.author = await userRepo.findById(post.authorId);  // 20번
}
```

쿼리 하나가 1ms여도, 앱↔DB 왕복(RTT)이 21번 발생한다. DB가 다른 데이터센터에 있어 RTT가 5ms라면 이것만으로 100ms가 넘는다. ORM의 지연 로딩(lazy loading)이 이 문제를 **눈에 안 보이게** 만든다.

```ts
// ✅ 해결 1: JOIN
const { rows } = await db.query(`
  SELECT p.id, p.title, u.id AS author_id, u.name AS author_name
  FROM posts p JOIN users u ON u.id = p.author_id
  ORDER BY p.created_at DESC LIMIT 20
`);

// ✅ 해결 2: IN으로 한 번에 (1 + 1 쿼리)
const posts = await postRepo.findRecent(20);
const ids = [...new Set(posts.map((p) => p.authorId))];
const { rows: authors } = await db.query(
  'SELECT id, name FROM users WHERE id = ANY($1::bigint[])',
  [ids],
);
const byId = new Map(authors.map((a) => [a.id, a]));
posts.forEach((p) => (p.author = byId.get(String(p.authorId))));
```

GraphQL처럼 요청 구조를 예측하기 어려운 경우에는 **DataLoader** 패턴으로 한 틱 안의 조회 요청을 모아 배치 처리한다.

### 12-3. 페이지네이션: OFFSET의 함정

```sql
-- OFFSET: 페이지가 뒤로 갈수록 느려진다 (앞의 100000행을 읽고 버림)
SELECT id, title FROM posts ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 100000;

-- Keyset(커서) 페이지네이션: 어느 페이지든 일정한 속도
SELECT id, title, created_at FROM posts
WHERE (created_at, id) < ($1, $2)          -- 이전 페이지 마지막 항목의 값
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Keyset 방식은 "N번째 페이지로 바로 점프"가 어렵다는 단점이 있지만, 무한 스크롤이나 대량 데이터 API에서는 사실상 표준이다. 정렬 키가 유일하지 않으면 `id` 같은 **타이브레이커**를 반드시 섞어야 누락/중복이 생기지 않는다.

## 더 깊이

- [DB 설계 A to Z 15강 — 인덱스 설계](/posts/db-design-15-indexes): 느린 쿼리를 실행 계획이 아니라 인덱스 설계 단계에서 미리 막는 방법입니다.
- [데이터베이스 안티패턴과 디자인 패턴 — 쇼핑몰 예제로 정리하기](/posts/db-antipatterns-and-design-patterns): 트랜잭션과 잠금이 스키마 설계 때문에 길어지는 전형적인 사례들을 모아 둔 글입니다.
