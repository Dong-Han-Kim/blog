---
# 📌 기본 메타데이터
title: '요청 한 건의 일생 6편 — 스트리밍과 읽기 복제본, 마지막 요청까지 지키는 종료'
date: '2026-09-17'
category: 'backend'
tags: ['Backend', 'Node.js', 'Scaling', 'Checklist']
description: '수십만 행을 메모리에 올리지 않고 내보내는 커서 스트리밍, 읽기 복제본과 복제 지연의 함정, 진행 중인 요청을 지키는 Graceful Shutdown, 그리고 요청 한 건의 타임라인과 운영 전 체크리스트로 시리즈를 닫는다.'

# 💬 옵션 필드
draft: false
series: '요청 한 건의 일생'
seriesOrder: 6

# 📚 SEO용
keywords: ['pg-query-stream', '백프레셔', '읽기 복제본', '복제 지연', 'Read Your Writes', 'Graceful Shutdown', 'SIGTERM', '요청 타임라인', '백엔드 운영 체크리스트']
---

# 요청 한 건의 일생 6편 — 스트리밍과 읽기 복제본, 마지막 요청까지 지키는 종료

마지막 편이다. 요청 한 건이 커지거나(대용량 응답), 서버가 여러 대로 늘어나거나(읽기 복제본), 프로세스가 내려갈 때(종료) 파이프라인이 어떻게 달라지는지를 보고, 전체 타임라인과 체크리스트로 시리즈를 닫는다.

## 17. 대용량 응답: 스트리밍

CSV 내보내기처럼 수십만 행을 반환해야 한다면, [3편](/posts/request-lifecycle-03-db-and-response)에서 본 것처럼 **전체 결과가 Node 메모리에 올라오는 것**이 문제다. 여기에 `JSON.stringify`까지 겹치면 메모리 폭증과 이벤트 루프 정지가 동시에 온다.

해결은 **DB 커서 + 스트림 + 백프레셔**다.

```ts
import QueryStream from 'pg-query-stream';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

app.get('/api/exports/orders.csv', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const query = new QueryStream(
      'SELECT id, amount, created_at FROM orders WHERE created_at >= $1 ORDER BY id',
      [req.query.from],
      { batchSize: 1000 },          // 한 번에 1000행씩 커서에서 가져옴
    );
    const rows = client.query(query);

    let header = false;
    const toCsv = new Transform({
      objectMode: true,
      transform(row, _enc, cb) {
        const head = header ? '' : 'id,amount,created_at\n';
        header = true;
        cb(null, `${head}${row.id},${row.amount},${row.created_at.toISOString()}\n`);
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');

    await pipeline(rows, toCsv, res);   // 클라이언트가 느리면 자동으로 DB 읽기도 늦춘다
  } finally {
    client.release();
  }
}));
```

`pipeline`이 처리해 주는 것:

- **백프레셔**: `res`의 버퍼가 차면 상류(`rows`)의 읽기를 멈춘다. 메모리 사용량이 결과 크기와 무관하게 일정해진다.
- **정리**: 어느 단계든 에러가 나거나 클라이언트가 연결을 끊으면 모든 스트림을 파괴한다.

주의: 스트리밍하는 동안 **연결 하나를 오래 점유**한다. 대용량 내보내기는 별도의 작은 풀이나 읽기 복제본으로 분리하는 것이 좋다. 또 응답 헤더가 이미 나간 뒤에 에러가 나면 상태 코드를 바꿀 수 없으므로, 클라이언트는 파일이 잘렸을 수 있음을 감안해야 한다.

---

## 18. 확장: 읽기 복제본과 그 함정

조회가 대부분인 서비스라면 읽기 부하를 복제본(replica)으로 분산할 수 있다.

```
                ┌──▶ Primary (쓰기 + 일부 읽기)
App ─ 라우팅 ────┤          │ WAL 스트리밍 (비동기)
                └──▶ Replica 1, Replica 2 (읽기 전용)
```

```ts
const primary = new Pool({ host: 'db-primary', max: 10 });
const replica = new Pool({ host: 'db-replica', max: 20 });

class UserRepository {
  findById(id: number) { return replica.query(/* ... */); }
  update(id: number, input: UpdateUserInput) { return primary.query(/* ... */); }
}
```

### 복제 지연(Replication Lag)의 함정

```
1. 사용자가 프로필 수정 → Primary에 커밋
2. 수정 완료 후 화면이 프로필 조회 → Replica로 감
3. Replica는 아직 변경을 받지 못함 → 수정 전 데이터 표시
4. 사용자: "저장이 안 됐어요"
```

대응 방법:

- **Read-your-writes**: 쓰기 직후 일정 시간(예: 몇 초) 동안 그 사용자의 조회는 Primary로 보낸다.
- **트랜잭션 내 조회는 Primary**: 같은 트랜잭션에서 방금 쓴 값을 읽어야 하는 경우.
- 복제 지연을 지표로 모니터링하고, 임계치를 넘으면 해당 복제본을 라우팅에서 뺀다.

더 큰 규모에서는 샤딩(데이터를 키 기준으로 여러 DB에 나눔)을 고려하지만, 조인/트랜잭션/재분배 비용이 크게 늘어나므로 **인덱스 튜닝, 캐싱, 복제본, 쿼리 개선을 모두 해본 뒤의 마지막 선택지**다.

---

## 19. Graceful Shutdown: 진행 중인 요청을 지키는 법

배포할 때마다 에러가 조금씩 튄다면, 종료 과정에서 **처리 중이던 요청이 잘리고 있을** 가능성이 크다.

```ts
const server = app.listen(3000);
let shuttingDown = false;

app.get('/healthz', (_req, res) => {
  res.status(shuttingDown ? 503 : 200).end();   // 종료 중이면 로드밸런서가 트래픽을 빼도록
});

process.on('SIGTERM', async () => {
  shuttingDown = true;
  logger.info('SIGTERM received');

  // 1. 로드밸런서가 헬스체크 실패를 감지할 시간을 준다
  await sleep(5_000);

  // 2. 새 연결 수락 중단, 진행 중인 요청은 끝날 때까지 기다림
  server.close(async () => {
    // 3. 요청이 모두 끝난 뒤 DB/Redis 연결 정리
    await pool.end();
    await redis.quit();
    process.exit(0);
  });

  // 유휴 keep-alive 연결 정리 (Node 18.2+)
  server.closeIdleConnections();

  // 4. 안전장치: 너무 오래 걸리면 강제 종료
  setTimeout(() => process.exit(1), 25_000).unref();
});
```

순서가 핵심이다. **트래픽 차단 → 진행 중 요청 완료 → 자원 정리 → 종료.** 이 순서를 거꾸로 하면(`pool.end()`를 먼저 호출하면) 진행 중인 요청이 "풀이 이미 종료됨" 에러로 실패한다. Kubernetes라면 `terminationGracePeriodSeconds`(기본 30초)가 위 전체 시간보다 길어야 한다.

---

## 20. 종합: 요청 한 건의 타임라인

지금까지의 내용을 하나의 요청에 모두 겹쳐 보자. `GET /api/users/42`, 캐시 미스, 기존 keep-alive 연결 재사용 상황이다.

| 시각(ms) | 위치 | 일어나는 일 |
|---:|---|---|
| 0 | 브라우저 | 기존 HTTP/2 연결로 요청 프레임 전송 (DNS/TCP/TLS 생략) |
| 5 | 로드밸런서 | 헬스체크 통과한 인스턴스 선택 |
| 6 | Nginx | `X-Request-Id` 발급, 업스트림 keepalive 연결로 전달 |
| 7 | Node 커널/libuv | 소켓 읽기 이벤트, llhttp가 헤더 파싱 |
| 7 | 미들웨어 | requestContext → logger → helmet → json |
| 8 | authenticate | JWT 서명 검증 (DB 조회 없음) |
| 8 | Controller | 파라미터 검증 (`id=42`) |
| 9 | Service → 캐시 | Redis `GET user:v1:42` → 미스 |
| 10 | Repository | `pool.query` → 유휴 연결 즉시 획득 |
| 10 | 네트워크 | Parse/Bind/Execute 메시지 전송 |
| 11 | PostgreSQL | 파싱 → 계획(PK Index Scan) → 실행, 페이지는 shared_buffers 히트 |
| 12 | 네트워크 | DataRow 1개 + CommandComplete 수신, 연결 풀에 반납 |
| 12 | Service | 행 → DTO 변환 (`int8` 문자열 → number, Date → ISO) |
| 13 | 캐시 | Redis `SET ... EX 300~360` |
| 13 | Controller | `res.status(200).json(dto)` → 직렬화, 헤더 작성 |
| 14 | accessLogger | `finish` 이벤트: 상태/지연시간 기록 |
| 15 | Nginx | gzip 압축 후 전달 |
| 20 | 브라우저 | 응답 수신, JSON 파싱, 렌더링 |

같은 요청이 **느려지는 시나리오**를 대입해 보면 각 장이 왜 필요한지 보인다.

- 연결 재사용이 안 되면 → 0ms 지점에 DNS + TCP + TLS가 추가 ([1편](/posts/request-lifecycle-01-the-map), [3편](/posts/request-lifecycle-03-db-and-response))
- 풀이 고갈되면 → 10ms 지점에서 수백 ms~수 초 대기 ([4편](/posts/request-lifecycle-04-transaction-and-pool))
- 인덱스가 없으면 → 11ms 지점이 Seq Scan으로 폭증 ([4편](/posts/request-lifecycle-04-transaction-and-pool))
- 캐시 히트였다면 → 10~13ms 구간 전체가 사라짐 ([5편](/posts/request-lifecycle-05-cache-timeout-observability))
- 트랜잭션 안에서 외부 API를 호출했다면 → 연결과 락이 수 초간 묶임 ([4편](/posts/request-lifecycle-04-transaction-and-pool))
- 큰 목록을 한 번에 직렬화하면 → 13ms 지점에서 이벤트 루프 정지, **다른 모든 요청도 지연** ([2편](/posts/request-lifecycle-02-app-entry), 그리고 이 편의 스트리밍 절)

---

남은 것은 정리다. 지금까지 따라온 길을 원칙과 체크리스트로 압축한다.

## 핵심 원칙 7가지

1. **연결은 비싸다, 재사용하라.** 클라이언트↔서버(keep-alive), 프록시↔앱(upstream keepalive), 앱↔DB(커넥션 풀) 모두 같은 원리다.
2. **모든 대기열에는 상한과 타임아웃이 있어야 한다.** 무한 대기는 장애를 전파하는 통로다.
3. **타임아웃은 바깥이 길고 안쪽이 짧게.** 그리고 앱에서 포기한 작업은 DB에서도 멈추게 하라.
4. **트랜잭션은 짧게, 하나의 연결 위에서.** 트랜잭션 안에서 외부 I/O를 하지 않는다.
5. **왕복 횟수를 줄여라.** N+1을 제거하고, 필요한 컬럼만, 필요한 행만 가져온다.
6. **계층 경계에서 번역하라.** DB 행 → DTO, DB 에러 → 도메인 에러, 도메인 에러 → HTTP 상태 코드.
7. **측정하지 않으면 추측일 뿐이다.** Request ID, 구간별 지연, 풀 대기, 쿼리 통계를 기본으로 수집한다.

## 운영 전 체크리스트

**네트워크 / 프록시**
- [ ] Nginx upstream `keepalive` + `proxy_http_version 1.1` + `Connection ""` 설정
- [ ] `trust proxy`를 실제 프록시 단계 수에 맞게 설정
- [ ] 앱의 `keepAliveTimeout` > 로드밸런서 유휴 타임아웃
- [ ] 요청 ID 발급 및 응답 헤더 포함

**애플리케이션**
- [ ] 바디 크기 제한 (`express.json({ limit })`)
- [ ] 모든 입력 검증 (params, query, body)
- [ ] async 에러가 에러 핸들러로 전달되는지 확인
- [ ] 에러 응답에 내부 정보 미노출, `requestId` 포함
- [ ] 이벤트 루프를 막는 동기 작업 없음

**DB 접근**
- [ ] 파라미터 바인딩만 사용 (문자열 연결 SQL 금지)
- [ ] `SELECT *` 금지, 필요한 컬럼만 조회
- [ ] 풀 `max`, `connectionTimeoutMillis`, `statement_timeout` 설정
- [ ] 전체 연결 수(인스턴스 × max) < DB `max_connections`
- [ ] 트랜잭션은 `pool.connect()`로 잡고 `finally`에서 `release()`
- [ ] `bigint`/`numeric`/`timestamp` 타입 변환 정책 확정
- [ ] 주요 쿼리 `EXPLAIN ANALYZE` 확인, 목록 API는 keyset 페이지네이션 검토
- [ ] N+1 쿼리 없음

**캐시**
- [ ] 키 버전 관리, TTL 지터
- [ ] 캐시 장애 시 DB가 버틸 수 있는지 확인
- [ ] 사용자/권한별 데이터가 키에 반영되었는지 확인

**관측성 / 운영**
- [ ] p95/p99 지연, 에러율, 풀 대기 수, 이벤트 루프 지연 수집
- [ ] `pg_stat_statements`로 상위 비용 쿼리 주기적 확인
- [ ] `idle in transaction` 모니터링 및 `idle_in_transaction_session_timeout` 설정
- [ ] Graceful shutdown 순서 검증 (트래픽 차단 → 요청 완료 → 자원 정리)

## 더 공부할 거리

- PostgreSQL 공식 문서의 *Query Planning*, *Concurrency Control*, *Frontend/Backend Protocol* 챕터
- Node.js 공식 문서의 *Event Loop*, *Stream*, *AsyncLocalStorage*
- HikariCP 위키의 *About Pool Sizing*
- OpenTelemetry의 Node.js 자동 계측(auto-instrumentation)
- 『Designing Data-Intensive Applications』 (Martin Kleppmann) — 복제, 트랜잭션, 일관성 챕터

---

## 마치며

요청 한 건은 생각보다 긴 여정을 거친다. 브라우저에서 출발해 DNS, TCP, TLS를 지나고, 로드밸런서와 프록시를 거쳐, 이벤트 루프와 미들웨어 체인을 통과한 뒤, 커넥션 풀의 줄을 서서 DB에 닿는다. DB 안에서는 파서와 플래너와 실행기가 인덱스와 버퍼 풀을 뒤지고, 결과는 다시 드라이버와 DTO와 직렬화를 거쳐 같은 길을 되돌아간다.

장애는 대부분 이 길의 **이음매**에서 생긴다. 타임아웃이 어긋난 곳, 대기열에 상한이 없는 곳, 연결을 반납하지 않은 곳, 왕복이 불필요하게 많은 곳. 파이프라인 전체를 한 장의 지도로 머릿속에 그릴 수 있다면, "느려요"라는 막연한 제보를 받았을 때 **어느 구간부터 볼지** 바로 정할 수 있다. 그게 이 글의 목표였다.
