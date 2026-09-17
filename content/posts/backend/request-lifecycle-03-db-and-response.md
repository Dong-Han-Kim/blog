---
# 📌 기본 메타데이터
title: '요청 한 건의 일생 3편 — 커넥션 풀을 지나 DB에 닿았다가 JSON으로 돌아오기까지'
date: '2026-09-17'
category: 'backend'
tags: ['Backend', 'PostgreSQL', 'Database', 'HTTP']
description: '커넥션 풀에서 연결을 빌리는 순간부터 DB 안에서 파서와 플래너와 실행기가 움직이는 과정, 그리고 결과 행이 DTO와 JSON을 거쳐 상태 코드와 헤더를 달고 클라이언트로 나가기까지를 따라간다.'

# 💬 옵션 필드
draft: false
series: '요청 한 건의 일생'
seriesOrder: 3

# 📚 SEO용
keywords: ['커넥션 풀', 'PostgreSQL', '와이어 프로토콜', 'Prepared Statement', 'B-Tree 인덱스', 'MVCC', 'DTO 매핑', 'JSON 직렬화', 'HTTP 상태 코드', 'keep-alive']
---

# 요청 한 건의 일생 3편 — 커넥션 풀을 지나 DB에 닿았다가 JSON으로 돌아오기까지

2편에서 요청은 Repository까지 내려와 `db.query()` 앞에 섰다. 이번 편은 그 호출이 DB에 닿아 결과를 얻고, 그 결과가 다시 JSON 응답이 되어 클라이언트로 나가기까지의 구간이다.

## 6. DB 연결: 드라이버와 커넥션 풀

### 6-1. DB 연결 한 개의 비용

`db.query()`를 호출하려면 DB와의 연결이 있어야 한다. PostgreSQL 연결을 새로 맺으면 다음이 일어난다.

```
TCP 핸드셰이크 → (TLS) → 시작 메시지 → 인증(SCRAM 등) → 세션 파라미터 설정
→ PostgreSQL이 이 연결 전용 백엔드 프로세스를 fork
```

PostgreSQL은 **연결 하나당 OS 프로세스 하나**를 쓴다(MySQL은 스레드). 그래서 요청마다 연결을 새로 맺으면 수 ms~수십 ms가 추가되고, DB 서버는 프로세스 생성/소멸로 지친다.

### 6-2. 커넥션 풀

해결책은 연결을 미리 만들어 두고 빌려 쓰는 것이다.

```ts
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST,
  database: 'app',
  user: 'app',
  password: process.env.DB_PASSWORD,
  max: 10,                        // 이 프로세스가 가질 최대 연결 수 (기본 10)
  idleTimeoutMillis: 30_000,      // 유휴 연결 정리 (기본 10초)
  connectionTimeoutMillis: 2_000, // 풀에서 연결을 기다리는 최대 시간 (기본 0 = 무한 대기!)
  statement_timeout: 5_000,       // DB 측 쿼리 실행 제한
  application_name: 'user-api',   // pg_stat_activity에서 식별용
});

pool.on('error', (err) => {
  // 유휴 연결이 DB 재시작 등으로 끊겼을 때 발생. 처리 안 하면 프로세스가 죽을 수 있다.
  logger.error({ err }, 'idle pg client error');
});
```

`pool.query()`는 내부적으로 이렇게 동작한다.

```
pool.query(sql)
  ├─ 유휴 연결 있음 → 즉시 획득
  ├─ 없음 + 현재 연결 수 < max → 새 연결 생성
  └─ 없음 + max 도달 → 대기열에서 대기 (connectionTimeoutMillis까지)
  → 쿼리 실행 → 결과 수신 → 연결을 풀에 자동 반납
```

여기서 **"풀 대기열"이라는 두 번째 줄**이 생겼다. [4편](/posts/request-lifecycle-04-transaction-and-pool)에서 이 줄이 어떻게 장애로 번지는지 본다.

### 6-3. 와이어 프로토콜: 쿼리가 실제로 어떻게 전송되나

`pg`는 값을 함께 넘기면 PostgreSQL의 **확장 쿼리 프로토콜**을 쓴다.

```
Client → Parse    (SQL 텍스트: "SELECT ... WHERE id = $1")
Client → Bind     (파라미터 값: 42)
Client → Describe / Execute
Client → Sync
Server → ParseComplete, BindComplete, RowDescription, DataRow..., CommandComplete, ReadyForQuery
```

SQL과 값이 **다른 메시지로** 전달되기 때문에 인젝션이 원천적으로 막힌다. 쿼리에 `name`을 주면 이름 있는 prepared statement로 등록되어 같은 연결에서 파싱/계획 비용을 재사용할 수 있다.

> **Oracle을 쓰는 환경이라면**: 바인드 변수를 쓰지 않고 값을 SQL 문자열에 박아 넣으면 매번 다른 SQL로 인식되어 **하드 파싱**이 일어나고, 공유 풀(shared pool)이 오염되어 전체 DB가 느려진다. 바인드 변수는 보안뿐 아니라 성능 요구사항이다.

---

## 7. DB 내부: 쿼리 한 줄이 실행되는 과정

`SELECT id, email, name, created_at FROM users WHERE id = $1` 이 PostgreSQL 안에서 어떻게 처리되는지 보자.

```
┌──────────────────────────────────────────────────────────────┐
│ 백엔드 프로세스 (이 연결 전용)                                 │
│                                                              │
│  ① Parser      SQL 문법 검사 → 파스 트리                        │
│  ② Analyzer    테이블/컬럼 존재, 권한, 타입 확인 → 쿼리 트리       │
│  ③ Rewriter    뷰 전개, 규칙(RULE) 적용                         │
│  ④ Planner     가능한 실행 방법 비교 → 비용이 가장 낮은 계획 선택  │
│  ⑤ Executor    계획대로 페이지를 읽고 행을 만들어 클라이언트로 전송 │
└──────────────────────────────────────────────────────────────┘
          │ 페이지 요청
          ▼
┌─────────────────────┐   miss   ┌──────────────────────┐
│ shared_buffers      │ ───────▶ │ OS 페이지 캐시 / 디스크 │
│ (8KB 페이지 캐시)     │ ◀─────── │                      │
└─────────────────────┘          └──────────────────────┘
```

### 7-1. 플래너가 고르는 방법

`id`가 기본 키라면 B-Tree 인덱스가 있다. 플래너는 통계(`pg_statistic`)를 보고 판단한다.

- **Seq Scan**: 테이블 전체를 처음부터 읽기
- **Index Scan**: 인덱스로 위치를 찾고 테이블(heap)에서 행 읽기
- **Index Only Scan**: 필요한 컬럼이 전부 인덱스에 있으면 테이블을 거의 안 읽음
- **Bitmap Heap Scan**: 여러 행을 인덱스로 모은 뒤 페이지 순서대로 읽기

### 7-2. B-Tree 인덱스가 빠른 이유

```
                [ 루트: 1 | 5000 | 10000 ]
               /          |            \
      [ 1 | 2500 ]   [ 5000 | 7500 ]   [ 10000 | ... ]
        /     \
  [리프: 1..2499 → 행 위치(TID)]
```

수백만 행이어도 트리 높이는 보통 3~4단계다. 즉 **몇 개의 페이지만 읽으면** 원하는 행을 찾는다. 그리고 그 페이지들이 `shared_buffers`에 올라와 있다면 디스크 I/O조차 없다.

### 7-3. MVCC: 읽기가 쓰기를 막지 않는 이유

PostgreSQL은 행을 수정할 때 덮어쓰지 않고 **새 버전을 만든다**. 각 트랜잭션은 자신의 스냅샷 기준으로 "보여야 하는 버전"만 본다. 그래서 조회는 수정 중인 행 때문에 대기하지 않는다. 대가로 죽은 버전이 쌓이고, 이를 **VACUUM**이 정리한다. 조회가 이유 없이 점점 느려진다면 테이블 부풀림(bloat)을 의심해 보자.

### 7-4. 결과 전송

실행기는 행을 만들 때마다 `DataRow` 메시지로 소켓에 쓴다. 드라이버는 이를 받아 메모리에 모았다가 `CommandComplete`가 오면 Promise를 resolve 한다. **결과가 10만 행이면 10만 행이 전부 Node 메모리에 올라온다**는 뜻이다([6편](/posts/request-lifecycle-06-scale-and-shutdown)에서 해결).

---

## 8. 결과를 응답으로: 매핑과 직렬화

DB가 돌려준 것은 "행"이다. 이것이 API 응답이 되려면 두 번의 변환이 필요하다.

### 8-1. 행 → 도메인/DTO

```ts
type UserRow = { id: string; email: string; name: string; created_at: Date };

export type UserDto = { id: number; email: string; name: string; createdAt: string };

export function toUserDto(row: UserRow): UserDto {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}
```

`pg` 드라이버의 타입 변환에서 자주 걸리는 함정:

| PostgreSQL 타입 | `pg` 기본 반환 | 주의 |
|---|---|---|
| `int4` | number | 문제 없음 |
| `int8` (bigint) | **string** | JS number 정밀도(2^53) 초과 가능성 때문. `Number()` 변환 시 범위 확인 |
| `numeric` | **string** | 금액을 number로 바꾸면 부동소수 오차. 문자열이나 decimal 라이브러리로 처리 |
| `timestamptz` | Date | 안전 |
| `timestamp` (tz 없음) | Date | **Node 프로세스의 로컬 타임존으로 해석**됨. 서버 TZ가 다르면 시간이 밀린다 |
| `json/jsonb` | 객체 | 이미 파싱됨 |

DTO 변환 계층을 두는 이유는 **DB 스키마가 API 계약으로 새어 나가지 않게** 하기 위해서다. 컬럼 이름을 바꿔도 응답 형태는 유지할 수 있다.

### 8-2. DTO → JSON 바이트

`res.json(obj)`은 내부적으로 `JSON.stringify`를 호출하고 `Content-Type: application/json; charset=utf-8`을 설정한다.

- `JSON.stringify`는 **동기**다. 수 MB 객체는 이벤트 루프를 수십 ms 막을 수 있다.
- `BigInt`는 기본적으로 직렬화되지 않고 에러를 던진다.
- `Date`는 `toJSON()`으로 ISO 문자열이 된다.
- `undefined` 필드는 사라진다. 클라이언트가 "필드 없음"과 "null"을 구분한다면 명시적으로 `null`을 넣자.

---

## 9. 응답 전송: 상태 코드, 헤더, 압축, 연결 재사용

### 9-1. 응답 메시지

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 87
X-Request-Id: 7f3c9a...
Cache-Control: private, max-age=0
ETag: W/"57-abc..."
Connection: keep-alive

{"id":42,"email":"han@example.com","name":"Han","createdAt":"2026-09-17T01:23:45.000Z"}
```

### 9-2. 상태 코드는 계약이다

| 상황 | 코드 |
|---|---|
| 조회 성공 | 200 |
| 생성 성공 | 201 (+ `Location` 헤더) |
| 바디 없는 성공 | 204 |
| 입력 검증 실패 | 400 |
| 인증 없음/실패 | 401 |
| 권한 없음 | 403 |
| 리소스 없음 | 404 |
| 상태 충돌(중복 등) | 409 |
| 요청 과다 | 429 |
| 서버 버그 | 500 |
| 업스트림(DB 등) 불가 | 503 |
| 업스트림 타임아웃 | 504 (주로 프록시가 반환) |

클라이언트, 모니터링, 로드밸런서, 재시도 로직이 모두 이 코드를 보고 판단한다. 에러인데 200을 주면 이 생태계가 전부 눈이 먼다.

### 9-3. 압축과 캐시 헤더

- **압축**: 요청의 `Accept-Encoding`을 보고 gzip/brotli로 압축한다. JSON은 압축률이 높아 보통 70~90% 줄어든다. CPU를 쓰므로 Node보다는 Nginx에서 처리하는 편이 일반적이다.
- **ETag / 304**: 내용 해시를 `ETag`로 주면, 다음 요청에서 클라이언트가 `If-None-Match`를 보내고 서버는 바디 없이 `304 Not Modified`를 줄 수 있다. 단, 이 경우에도 **서버는 DB 조회와 직렬화를 이미 했다**. 절약되는 것은 전송량뿐이다.

### 9-4. 연결은 닫히지 않는다

응답이 끝나도 `keep-alive`면 TCP 연결은 유지되고, 다음 요청이 [1편](/posts/request-lifecycle-01-the-map)의 DNS/TCP/TLS 비용 없이 곧바로 흘러 들어온다.

> Node의 `server.keepAliveTimeout` 기본값은 5초다. 앞단 로드밸런서의 유휴 타임아웃(예: AWS ALB 60초)보다 **Node가 먼저 연결을 끊으면**, 로드밸런서가 이미 닫힌 연결로 요청을 보내 간헐적 502가 발생한다. 원칙: **안쪽 서버의 keep-alive 타임아웃 > 바깥 프록시의 유휴 타임아웃**.

```ts
const server = app.listen(3000);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;   // keepAliveTimeout보다 커야 한다
```

여기까지가 요청 한 건의 기본 여정이다. 이제 이 파이프라인이 **부하와 장애 상황에서** 어떻게 무너지는지 보자.

## 더 깊이

- [DB 설계 A to Z 15강 — 인덱스 설계](/posts/db-design-15-indexes): 이 편에서 "인덱스가 있으면 빠르다"로 넘어간 부분 — 어떤 인덱스를 어떤 순서로 만들어야 하는지 — 를 설계 관점에서 다룹니다.
