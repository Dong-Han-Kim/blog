---
# 📌 기본 메타데이터
title: '요청 한 건의 일생 2편 — Node.js는 요청을 받아 어떤 계층으로 흘려보내는가'
date: '2026-09-17'
category: 'backend'
tags: ['Backend', 'Node.js', 'Express', 'Architecture']
description: '요청이 애플리케이션 서버 안으로 들어온 뒤의 이야기. 소켓에서 req 객체가 만들어지는 과정과 싱글 스레드가 동시 요청을 처리하는 원리, 미들웨어 파이프라인, 그리고 Controller에서 Service를 거쳐 Repository까지 내려가는 계층 구조를 본다.'

# 💬 옵션 필드
draft: false
series: '요청 한 건의 일생'
seriesOrder: 2

# 📚 SEO용
keywords: ['Node.js', '이벤트 루프', 'Express 미들웨어', '라우팅', 'Controller Service Repository', '계층 구조', 'DTO', '이벤트 루프 블로킹']
---

# 요청 한 건의 일생 2편 — Node.js는 요청을 받아 어떤 계층으로 흘려보내는가

1편에서 요청은 브라우저를 떠나 로드밸런서와 Nginx를 지나 애플리케이션 서버 바로 앞까지 왔다. 이번 편에서는 그 요청이 Node.js 프로세스 안으로 들어와 어떤 경로를 지나 DB 호출 직전까지 내려가는지 따라간다.

## 3. 애플리케이션 서버의 입구: Node.js는 요청을 어떻게 받는가

### 3-1. 소켓에서 req 객체까지

```
커널 TCP 스택 ─(accept)─▶ libuv 이벤트 루프 ─▶ llhttp 파서 ─▶ http.IncomingMessage(req)
                                                            └▶ http.ServerResponse(res)
```

1. 커널이 TCP 연결을 받아 대기열(backlog)에 넣는다.
2. libuv가 epoll(리눅스) 같은 OS 이벤트 알림으로 "읽을 데이터가 있다"는 신호를 받는다.
3. Node의 HTTP 파서(llhttp)가 바이트를 읽어 요청 라인과 헤더를 해석한다.
4. `req`, `res` 객체가 만들어지고 `request` 이벤트가 발생한다.
5. 바디는 **아직 다 읽지 않은 상태**일 수 있다. 바디는 스트림으로 흘러 들어오며, `express.json()` 같은 미들웨어가 이를 다 모아 파싱한다.

### 3-2. 싱글 스레드인데 어떻게 동시에 처리하나

Node.js는 **JavaScript 실행이 한 스레드**에서 일어난다. 그런데도 수천 개의 요청을 동시에 다루는 이유는, 네트워크 I/O(클라이언트 소켓, DB 소켓)를 **기다리는 동안 스레드를 붙잡지 않기** 때문이다.

```
요청 A: 파싱 → DB 쿼리 전송 → (대기: 스레드 반납) ........ 결과 도착 → 응답
요청 B:        파싱 → DB 쿼리 전송 → (대기) ..... 결과 도착 → 응답
요청 C:               파싱 → 캐시 조회 → 응답
```

반대로 말하면, **CPU를 오래 쓰는 코드는 모든 요청을 멈춘다.** 대표적인 범인은 다음과 같다.

- 거대한 배열에 대한 동기 루프/정렬
- 수 MB짜리 `JSON.parse` / `JSON.stringify`
- 동기 암호화(`bcrypt.hashSync` 등), `fs.readFileSync`

> 참고: libuv의 스레드 풀(기본 4개)은 파일 시스템, `dns.lookup`, 일부 crypto, zlib에 쓰인다. DB 드라이버의 소켓 통신은 스레드 풀이 아니라 이벤트 루프에서 처리된다. 단, DB 호스트를 이름으로 지정하면 연결 시점의 DNS 조회는 스레드 풀을 쓴다.

---

## 4. 라우팅과 미들웨어 파이프라인

Express에서 요청은 **등록된 순서대로** 미들웨어를 통과한다. 이것이 애플리케이션 내부의 첫 번째 "파이프라인"이다.

```ts
import express from 'express';

const app = express();
app.set('trust proxy', 1);

// ① 요청 ID + 로깅 (가장 먼저: 모든 요청을 기록하기 위해)
app.use(requestContext);
app.use(accessLogger);

// ② 보안/공통 처리
app.use(helmet());
app.use(express.json({ limit: '1mb' }));   // 바디 크기 제한은 DoS 방어의 기본

// ③ 인증 (특정 경로만 공개하고 싶다면 라우터 단위로 적용)
app.use('/api', authenticate);

// ④ 라우터
app.use('/api/users', userRouter);

// ⑤ 404
app.use((req, res) => res.status(404).json({ code: 'NOT_FOUND' }));

// ⑥ 에러 핸들러 (인자 4개여야 에러 핸들러로 인식)
app.use(errorHandler);
```

흐름을 그림으로 보면 이렇다.

```
req ─▶ requestContext ─▶ accessLogger ─▶ helmet ─▶ json ─▶ authenticate ─▶ router ─▶ handler
                                                                  │
                                              next(err) 또는 throw ┘──────────────▶ errorHandler
```

미들웨어의 규칙은 단순하다.

- `next()`를 호출하면 다음 단계로 간다.
- 응답을 보내면(`res.json`) 체인이 사실상 끝난다.
- `next(err)`를 호출하면 일반 미들웨어를 건너뛰고 에러 핸들러로 점프한다.
- **둘 다 안 하면 요청이 영원히 매달린다.** 클라이언트는 타임아웃이 날 때까지 기다린다.

> Express 4에서는 `async` 핸들러의 rejected Promise를 자동으로 잡지 못한다. 래퍼를 쓰거나 Express 5로 올려야 한다. Express 5는 async 핸들러에서 던진 에러를 에러 핸들러로 넘겨준다.

```ts
// Express 4용 async 래퍼
export const asyncHandler =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
```

인증 미들웨어 예시:

```ts
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED' });
  }
  try {
    req.user = await verifyJwt(header.slice(7));   // 서명 검증: DB 조회 없이 끝나는 것이 JWT의 장점
    next();
  } catch {
    res.status(401).json({ code: 'INVALID_TOKEN' });
  }
}
```

---

## 5. 계층 구조: Controller → Service → Repository

라우터에 도착한 요청은 보통 세 계층을 지난다. 각 계층의 책임을 분리하면 테스트와 변경이 쉬워진다.

| 계층 | 책임 | 알아야 하는 것 | 몰라야 하는 것 |
|---|---|---|---|
| Controller | HTTP ↔ 애플리케이션 변환, 입력 검증 | req/res, 상태 코드 | SQL |
| Service | 비즈니스 규칙, 트랜잭션 경계 | 도메인 규칙 | HTTP |
| Repository | 데이터 접근 | SQL, 테이블 구조 | HTTP, 비즈니스 규칙 |

```ts
// user.controller.ts
import { z } from 'zod';

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const getUser = asyncHandler(async (req, res) => {
  const { id } = ParamsSchema.parse(req.params);    // 검증 실패 → ZodError → 에러 핸들러에서 400
  const user = await userService.getById(id);
  res.status(200).json(user);                        // Service가 준 DTO를 그대로 직렬화
});
```

```ts
// user.service.ts
export class UserService {
  constructor(private readonly repo: UserRepository) {}

  async getById(id: number): Promise<UserDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError(`user ${id} not found`);
    return toUserDto(row);                           // 내부 컬럼을 외부 응답 형태로 변환
  }
}
```

```ts
// user.repository.ts
export class UserRepository {
  constructor(private readonly db: Pool) {}

  async findById(id: number): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [id],                                          // 파라미터 바인딩: SQL 인젝션 방지
    );
    return rows[0] ?? null;
  }
}
```

두 가지를 강조하고 싶다.

1. **`SELECT *`를 쓰지 않는다.** 필요 없는 컬럼(비밀번호 해시 등)이 응답까지 새어 나갈 수 있고, 네트워크/메모리 비용도 늘어나며, 커버링 인덱스의 이점을 잃는다.
2. **문자열 연결로 SQL을 만들지 않는다.** `$1` 같은 플레이스홀더를 쓰면 값이 SQL 구문과 분리되어 전달된다.
