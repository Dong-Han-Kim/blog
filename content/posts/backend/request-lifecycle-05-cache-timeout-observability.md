---
# 📌 기본 메타데이터
title: '요청 한 건의 일생 5편 — 캐시와 타임아웃, 에러와 추적으로 파이프라인을 지키는 법'
date: '2026-09-17'
category: 'backend'
tags: ['Backend', 'Cache', 'Observability', 'Node.js']
description: 'DB 조회를 아예 하지 않는 캐싱 계층부터 Cache Stampede, 바깥이 길고 안쪽이 짧아야 하는 타임아웃 체인과 쿼리 취소, 에러를 계층 경계에서 번역하는 법, 그리고 요청 하나를 끝까지 추적하는 관측성까지.'

# 💬 옵션 필드
draft: false
series: '요청 한 건의 일생'
seriesOrder: 5

# 📚 SEO용
keywords: ['Cache-Aside', 'Cache Stampede', 'Redis 캐싱', '타임아웃 체인', 'statement_timeout', 'AbortSignal', '에러 처리', 'Request ID', 'AsyncLocalStorage', '분산 트레이싱']
---

# 요청 한 건의 일생 5편 — 캐시와 타임아웃, 에러와 추적으로 파이프라인을 지키는 법

4편이 파이프라인이 무너지는 지점을 봤다면, 이번 편은 그 앞에 방어선을 세우는 방법이다. 부하를 덜어내는 캐시, 장애를 격리하는 타임아웃, 경계에서 번역되는 에러, 그리고 이 모든 것을 볼 수 있게 하는 관측성 순서로 간다.

## 13. 캐싱 계층

DB 조회를 아예 하지 않는 것이 가장 빠른 조회다. 캐시는 파이프라인의 여러 지점에 둘 수 있다.

```
[브라우저 캐시] → [CDN] → [Nginx 캐시] → [앱 메모리 캐시] → [Redis] → [DB 버퍼 풀]
   가장 빠름, 무효화 어려움  ◀────────────────────────────▶  가장 느림, 가장 정확
```

### 13-1. Cache-Aside 패턴

```ts
async function getUserCached(id: number): Promise<UserDto> {
  const key = `user:v1:${id}`;

  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);                  // 히트: DB 안 감

  const user = await userService.getById(id);             // 미스: DB 조회
  const ttl = 300 + Math.floor(Math.random() * 60);       // TTL 지터
  await redis.set(key, JSON.stringify(user), 'EX', ttl);
  return user;
}

// 쓰기 시에는 DB 커밋 후 캐시 삭제
async function updateUser(id: number, input: UpdateUserInput) {
  await userRepo.update(id, input);
  await redis.del(`user:v1:${id}`);
}
```

- 키에 **버전**(`v1`)을 넣어 두면 DTO 형태가 바뀔 때 전체 무효화가 쉽다.
- **TTL 지터**: 같은 시각에 대량으로 생성된 캐시가 동시에 만료되면 DB에 한꺼번에 몰린다. 무작위 편차로 분산시킨다.
- 쓰기 후 "갱신"보다 "삭제"가 안전하다. 동시 쓰기 상황에서 오래된 값으로 덮어쓰는 경쟁 조건을 줄여준다.

### 13-2. Cache Stampede (Thundering Herd)

인기 키가 만료되는 순간 수백 개의 요청이 동시에 미스를 겪고 **모두 DB로 달려간다.** 방어책은 다음과 같다.

```ts
// 프로세스 내 single-flight: 같은 키에 대한 동시 조회를 하나로 합친다
const inflight = new Map<string, Promise<unknown>>();

function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
```

인스턴스가 여러 개라면 Redis 기반 분산 락이나, 만료 전에 백그라운드에서 미리 갱신하는 방식(stale-while-revalidate)을 함께 쓴다.

### 13-3. 캐시를 넣기 전에 물어볼 것

- 이 데이터는 **얼마나 오래된 값까지 허용**되는가?
- 캐시가 죽었을 때 DB가 **전체 트래픽을 감당**할 수 있는가? (캐시에 기대어 DB를 줄여 놓으면, 캐시 장애가 곧 DB 장애다)
- 권한별로 다른 데이터를 **같은 키에 넣고 있지 않은가?** (다른 사용자에게 데이터 노출 사고)

---

## 14. 타임아웃 체인과 쿼리 취소

### 14-1. 타임아웃은 바깥이 길고 안쪽이 짧아야 한다

```
클라이언트 30s > 로드밸런서 25s > Nginx proxy_read 20s > 앱 요청 타임아웃 15s
> 풀 대기 2s + DB statement_timeout 5s
```

순서가 뒤집히면 어떤 일이 생길까? 예를 들어 Nginx가 10초에 504를 반환했는데 DB 쿼리는 60초 동안 계속 돈다. 클라이언트는 이미 떠났고, 사용자가 재시도하면 **같은 무거운 쿼리가 또 하나** 쌓인다. 아무도 기다리지 않는 작업이 자원을 잡아먹는 것이다.

### 14-2. 앱에서 포기해도 DB는 계속 돈다

```ts
// 흔한 착각: Promise.race로 타임아웃을 걸면 쿼리가 멈춘다?
await Promise.race([pool.query(heavySql), sleep(3000).then(() => { throw new TimeoutError(); })]);
```

이 코드는 **앱이 기다리는 것만** 멈춘다. DB 백엔드 프로세스는 쿼리를 계속 실행하고, 연결도 결과가 올 때까지 점유된다. 실제로 쿼리를 멈추려면 DB가 알아야 한다.

- **`statement_timeout`**: DB가 스스로 쿼리를 취소한다. 가장 확실한 방법이다. 풀 설정이나 `SET LOCAL statement_timeout = '3s'`로 트랜잭션 단위 지정도 가능하다.
- **취소 요청**: PostgreSQL 프로토콜은 별도 연결로 CancelRequest를 보내는 방식을 지원한다. 운영 중에는 `SELECT pg_cancel_backend(pid)`로 수동 취소할 수 있다.
- **`lock_timeout`**: 락 대기만 따로 제한한다. 마이그레이션에서 `ALTER TABLE`이 긴 락 대기에 걸려 뒤따르는 모든 쿼리를 막는 사고를 예방한다.

### 14-3. 클라이언트가 떠났다면 일을 멈추자

```ts
app.get('/api/reports/heavy', asyncHandler(async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();   // 응답 완료 전에 연결이 닫힘
  });

  const data = await reportService.build({ signal: controller.signal });
  res.json(data);
}));
```

`signal`을 받는 작업(외부 `fetch`, 여러 단계의 루프)은 중간에 `signal.aborted`를 확인해 조기에 멈출 수 있다. 쿼리 자체는 위에서 말한 DB 측 수단과 함께 써야 한다.

---

## 15. 에러 처리와 전파

### 15-1. 에러를 분류하라

파이프라인 곳곳에서 에러가 발생한다. 모두 500으로 뭉개지 않으려면 **에러의 의미를 타입으로** 표현해야 한다.

```ts
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly expose = true,     // 메시지를 클라이언트에 보여도 되는가
  ) {
    super(message);
  }
}
export class NotFoundError extends AppError {
  constructor(msg: string) { super(404, 'NOT_FOUND', msg); }
}
export class ConflictError extends AppError {
  constructor(msg: string) { super(409, 'CONFLICT', msg); }
}
```

### 15-2. DB 에러를 도메인 에러로 번역하라

PostgreSQL은 SQLSTATE 코드로 에러 종류를 알려준다. 이를 Repository 경계에서 번역하면 상위 계층이 DB를 몰라도 된다.

```ts
function translatePgError(err: any): Error {
  switch (err?.code) {
    case '23505': return new ConflictError('이미 존재하는 값입니다');       // unique_violation
    case '23503': return new AppError(400, 'INVALID_REFERENCE', '참조 대상이 없습니다'); // foreign_key_violation
    case '57014': return new AppError(503, 'QUERY_TIMEOUT', '요청 처리 시간이 초과되었습니다'); // query_canceled
    case '40001': return new AppError(503, 'RETRYABLE', '잠시 후 다시 시도해주세요');  // serialization_failure
    case '40P01': return new AppError(503, 'RETRYABLE', '잠시 후 다시 시도해주세요');  // deadlock_detected
    default:      return err;
  }
}
```

`40001`, `40P01`은 **재시도하면 성공할 수 있는** 에러다. 트랜잭션 헬퍼에 짧은 백오프를 둔 재시도(2~3회)를 넣으면 대부분 흡수된다.

### 15-3. 마지막 방어선: 에러 핸들러

```ts
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) {
    // 이미 응답을 쓰기 시작했다면 할 수 있는 건 연결을 끊는 것뿐
    req.socket.destroy();
    return;
  }

  if (err instanceof z.ZodError) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', details: err.issues });
  }

  if (err instanceof AppError) {
    if (err.status >= 500) req.log.error({ err }, 'app error');
    return res.status(err.status).json({
      code: err.code,
      message: err.expose ? err.message : 'Internal Server Error',
      requestId: req.id,
    });
  }

  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal Server Error', requestId: req.id });
}
```

원칙:

- **스택 트레이스, SQL, 내부 메시지를 클라이언트에 노출하지 않는다.** 대신 `requestId`를 주고, 로그에서 찾게 한다.
- 4xx는 대개 클라이언트 문제이므로 경고 수준, 5xx는 에러 수준으로 로깅한다.
- `process.on('unhandledRejection')`은 "여기까지 오면 버그"라는 신호다. 로그를 남기고 프로세스를 안전하게 재시작하는 편이 낫다.

---

## 16. 관측성: 요청 하나를 끝까지 추적하기

"어제 오후 3시에 느렸대요"라는 제보를 받았을 때, 그 요청이 **파이프라인의 어느 구간에서** 시간을 썼는지 답할 수 있어야 한다.

### 16-1. Request ID와 AsyncLocalStorage

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type Ctx = { requestId: string; userId?: string };
export const als = new AsyncLocalStorage<Ctx>();

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID(); // Nginx가 준 ID 재사용
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  als.run({ requestId }, next);    // 이후 모든 비동기 호출에서 컨텍스트 접근 가능
}

// 어디서든 인자 전달 없이 현재 요청 ID를 꺼낼 수 있다
export const currentRequestId = () => als.getStore()?.requestId;
```

이 ID를 활용하는 곳:

- 모든 애플리케이션 로그 필드
- 에러 응답 바디
- 외부 서비스 호출 헤더 (다음 서비스로 전파)
- DB 쿼리 주석: `/* request_id=... */ SELECT ...` → DB의 느린 쿼리 로그에서 원 요청을 역추적

### 16-2. 구간별 시간 측정

```ts
export function accessLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      requestId: req.id,
      method: req.method,
      route: req.route?.path,        // /users/:id 형태 (실제 경로보다 집계에 유리)
      status: res.statusCode,
      durationMs: Math.round(ms),
    });
  });
  next();
}
```

### 16-3. 분산 트레이싱

OpenTelemetry를 붙이면 HTTP 서버, `pg`, Redis, 외부 `fetch` 호출이 자동으로 **스팬(span)** 으로 기록되고, 하나의 트레이스로 묶인다.

```
Trace 7f3c9a  GET /api/users/42                           182ms
├─ middleware: authenticate                                 3ms
├─ redis GET user:v1:42 (miss)                              1ms
├─ pg.pool.connect  (대기)                                 140ms   ← 병목!
├─ pg.query SELECT ... FROM users                           4ms
├─ redis SET user:v1:42                                     1ms
└─ serialize + write                                        1ms
```

이 그림 한 장이면 "쿼리가 느린 게 아니라 **풀에서 연결을 기다리느라** 느렸다"는 결론이 바로 나온다. 로그만으로는 알기 어려운 부분이다.

### 16-4. 봐야 할 핵심 지표

| 지표 | 의미 |
|---|---|
| 요청 수, 에러율, 지연 시간(p50/p95/p99) | 서비스 전체 건강 상태 (평균이 아니라 **백분위수**를 본다) |
| 이벤트 루프 지연 | CPU 블로킹 코드 존재 여부 |
| 풀 대기 수 / 대기 시간 | DB 연결 병목 |
| 쿼리별 실행 시간 (`pg_stat_statements`) | 가장 비용이 큰 쿼리 식별 |
| 캐시 히트율 | 캐시가 실제로 일하고 있는가 |

## 더 깊이

- [풀스택 개발자를 위한 인프라 7강 — 관측성](/posts/infra-07-observability): 로그·메트릭·트레이스를 실제로 어떤 도구로 수집하고 대시보드에 올리는지 다룹니다.
- [Sentry는 어떻게 에러를 잡아내는가 — yoyak 관측 설계 노트](/posts/yoyak-sentry-observability): 여기서 정리한 지표와 에러 전파를 실제 서비스에 붙여 본 기록입니다.
