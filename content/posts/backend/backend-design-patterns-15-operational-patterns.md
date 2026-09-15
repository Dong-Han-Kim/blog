---
# 📌 기본 메타데이터
title: '운영을 패턴으로 — Health Check, Correlation ID, Leader Election'
date: '2026-09-15'
category: 'backend'
tags: ['Operations', 'Health Check', 'Graceful Shutdown', 'Leader Election']
description: 'Health Check, Graceful Shutdown, Correlation ID, Leader Election을 시스템이 자기 상태를 선언하는 장치로 본다. 프로브 설정이 정하는 시간, 로그 저장 비용, 펜싱 토큰 없는 락의 한계.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 15

# 📚 SEO용
keywords: ['Operations', 'Health Check', 'Graceful Shutdown', 'Leader Election', '백엔드 디자인 패턴']
---

# 운영을 패턴으로 — Health Check, Correlation ID, Leader Election

## 배포할 때마다 에러 그래프에 같은 봉우리가 선다

배포 버튼을 누르면 5xx 카운터가 올라갔다가 3분 뒤 내려온다. 매번 같은 모양이고 코드와 무관하다. 파드를 내리는 코드는 이렇다.

```ts
// server.ts — Before: SIGTERM을 받고 바로 닫는다
process.on('SIGTERM', async () => {
  await pool.end()
  process.exit(0)
})
```

초당 1,000 요청을 파드 20개가 나눠 받으면 파드당 50 rps다. 하나를 즉시 죽이면 처리 중이던 요청이 p95 응답 200ms 기준 50 × 0.2 = **10건** 날아간다. 더 큰 쪽은 로드밸런서다. 엔드포인트 목록에서 이 파드가 빠지기까지 5초가 걸리면 50 × 5 = **250건**이 죽은 파드로 가고, 파드 20개면 250 × 20 = **5,000건**이다.

이 편의 패턴들은 없어도 평소에는 돌아가고, 배포나 장애 때만 부재가 드러난다.

## 시스템이 자기 상태를 말하게 하는 장치들

### Health Check API

프로브가 셋으로 갈린 이유는 답하는 질문이 달라서이기도 하지만, 패턴으로 볼 때 더 중요한 것은 **세 프로브의 설정값이 서로 다른 시간을 결정한다**는 점이다. 주기 × 실패 임계가 곧 초 단위 예산이다.

| 프로브 | 대표 설정 | 이 값이 정하는 시간 | 잘못 잡으면 |
|---|---|---|---|
| startup | 10초 × 30회 | 부팅 예산 300초 | 짧으면 부팅 중 재시작 |
| liveness | 10초 × 3회 | 멈춘 프로세스 감지 30초 | 의존성을 넣으면 멀쩡한 것까지 재시작 |
| readiness | 10초 × 3회 | 트래픽 제외 30초 | 드레이닝 대기의 하한이 여기서 정해짐 |

세 값이 독립적이지 않다는 것이 핵심이다. readiness의 30초는 드레이닝 대기의 하한이 되고, liveness의 30초는 장애 감지 지연의 하한이 된다. 둘을 같이 줄이면 배포는 빨라지지만 일시적 지연을 장애로 오판하는 빈도가 오른다. liveness에 의존성을 넣었을 때의 증폭은 [안티패턴 15편](/posts/backend-antipatterns-15-unobservable-system)에 있다.

### Graceful Shutdown

SIGTERM 이후의 순서가 고정이다. **readiness를 내리고 → 라우팅에서 빠지기를 기다리고 → 새 요청 수락을 멈추고 → 진행 중 요청을 마치고 → 커넥션을 정리한다.** 바뀌면 앞의 5,000건이 난다.

### Correlation ID, Structured Logging, Distributed Tracing

요청 하나에 식별자를 붙여 경계 너머로 전파하고, 로그를 필드를 가진 JSON으로 남긴다. 왜 필요한지는 [안티패턴 15편](/posts/backend-antipatterns-15-unobservable-system)에서 다뤘으니 전파 방식만 본다. W3C Trace Context가 `traceparent` 헤더로 표준화했다.

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

`버전(2)-trace-id(32)-parent-id(16)-flags(2)`에 하이픈 3개, 총 55바이트다. OpenTelemetry는 이 헤더를 읽고 쓰는 전파자와 프로세스 안에서 컨텍스트를 나르는 저장소를 제공하며, 후자의 실체가 `AsyncLocalStorage`다.

### Leader Election과 Scheduled Job

인스턴스 20대가 각자 cron을 돌리면 정산 배치가 **20번** 실행된다. 방법은 둘이다. 전용 스케줄러가 큐에 넣고 워커 하나가 집게 하거나(8편 Competing Consumers), 락을 두고 경쟁해 이긴 쪽만 실행하게 하거나.

락에는 반드시 **임대(lease)** 개념이 붙는다. 소유자가 죽으면 락이 영원히 남으므로 만료가 필요하고, 만료가 있으면 소유권 판단이 시계에 의존한다. Kubernetes의 리더 선출도 Lease를 갱신하는 구조다.

### Configuration 외부화

12 Factor(Adam Wiggins, 2011)의 config 원칙에서 중요한 것은 **재배포 없이 바꿀 수 있는 것과 없는 것**의 구분이다. 시작 시 읽는 환경변수는 재배포가 필요하고, 매 요청 조회하는 값은 즉시 바뀌는 대신 조회 비용과 새 의존성이 붙는다. Ops Toggle(14편)이 후자를 쓰는 이유다.

## 추측 대신 신호로 판단하게 만드는 것

공통점은 기능 추가가 아니라 **시스템이 자기 상태를 바깥에 선언하게 만드는 것**이다. readiness가 없으면 로드밸런서는 TCP 연결 여부만 보고 추측한다. 신호가 생기면 판단이 기계로 넘어간다.

> 관측과 헬스체크는 "장애를 줄이는 장치"가 아니라 <strong>"장애 판단을 자동화하는 장치"</strong>다. 신호가 틀리면 자동화가 장애를 만든다.

시간에 의존하는 신호는 시간이 왜곡되면 거짓말을 한다. 임대 10초짜리 락을 쥔 프로세스가 15초 GC 정지에 빠지면, 깨어난 시점에 락은 넘어갔는데 본인은 5초 동안 자기가 리더라고 믿는다. 시계 드리프트도 같은 결과를 만든다.

> 그래서 락만으로는 안전해지지 않는다. **리소스 쪽에서 펜싱 토큰(fencing token)을 검증해야 한다.** 락을 줄 때마다 단조 증가하는 번호를 함께 주고, 쓰기 대상이 자기가 본 최대 번호보다 작은 요청을 거부하면 옛 리더의 뒤늦은 쓰기가 막힌다.

Redlock의 안전성은 결론이 갈린다. Martin Kleppmann(2016)은 GC 정지와 시계 점프를 들어 정합성이 걸린 용도에는 부적합하며 펜싱 토큰이 필요하다고 했고, 저자 Salvatore Sanfilippo는 같은 해 반박문에서 그 가정과 시계 모델을 문제 삼았다. **중복 실행이 효율 문제면 락으로 충분하고 정합성 문제면 부족하다.**

## 청구서 — 저장 비용, 계측, 드레이닝

**관측은 트래픽에 정비례해 요금이 붙는다.** 초당 1,000 요청에 요청당 로그 3줄, JSON 한 줄 400바이트면 하루 1,000 × 3 × 400 × 86,400 = **103.7GB**다. 평문 80바이트면 20.7GB이므로 구조화의 대가는 저장량 5배다. 검색 가능성을 사고 저장 비용을 판다.

그래서 샘플링이 필수가 되고, **샘플링하면 희귀 케이스를 놓친다.** 1% 샘플링에서 하루 1,000건짜리는 기대 10건이 잡히지만, 하루 10건짜리는 기대 0.1건이라 하루 안에 한 건이라도 잡힐 확률이 1 − 0.99¹⁰ = **9.6%**, 열흘에 하루꼴로만 보인다. 오류와 느린 요청만 100% 수집하면 손실이 일부 메워진다.

**계측을 도메인 코드 밖으로 밀어내면 실패가 조용해진다.** `AsyncLocalStorage`로 전파를 자동화하면 호출부는 깨끗해지지만 **컨텍스트 유실이 예외를 던지지 않는다.** `getStore()`는 `undefined`를 돌려줄 뿐이라, 전파가 끊긴 자리는 `correlationId`가 빠진 로그 한 줄로만 나타난다. 끊기는 자리는 정해져 있다. `AsyncResource.bind` 없이 호출되는 이벤트 리스너, 모듈 로드 시점의 `setInterval`, 네이티브 콜백을 쓰는 라이브러리, 워커 스레드 경계다. 넷 다 단위 테스트는 통과하고 프로덕션에서만 빈다. **누락률을 메트릭으로 올려두지 않으면 추적이 끊긴 것을 장애 조사 중에 처음 안다.**

**Health Check 엔드포인트도 비용이고 공격 표면이다.** readiness에서 의존성 5개를 매번 확인하면 10초 주기 프로브를 20파드가 돌릴 때 6 × 20 × 5 = 분당 **600회**, 초당 10회가 상시로 깔린다. 의존성이 느려지면 헬스체크가 타임아웃하며 부하를 더한다. 응답에 의존성별 상태와 버전을 담으면 인증 없는 엔드포인트로 내부 구조가 새므로, 상세는 인증 뒤에 둔다.

**Graceful Shutdown은 배포 시간을 늘린다.** readiness 판정 30초에 드레이닝 20초를 더하면 파드당 50~60초, 20개를 25%씩 4배치로 교체하면 4 × 60초 = **4분**이다. 롤백도 같은 4분이라 장애 시간에 더해진다.

**Leader Election은 단일 장애점과 스플릿 브레인 가능성을 들여온다.** 락 저장소가 죽으면 배치가 전부 멈추고, 임대 갱신이 늦으면 리더가 불필요하게 교체된다. 짧게 잡으면 교체가 잦고 길게 잡으면 죽은 리더의 공백이 길어져 둘을 동시에 줄일 수 없다. 펜싱 토큰까지 하려면 **락이 아니라 쓰기 대상 쪽을 고쳐야 한다.** 외부 결제 API처럼 고칠 수 없으면 남는 것은 멱등성 키뿐이다.

## 순서를 지키는 종료, 하나만 도는 배치

Node.js 특유의 함정은 `server.close()`다. 새 연결 수락을 멈추고 **기존 연결이 닫히기를 기다리는데**, keep-alive 유휴 연결은 스스로 닫히지 않아 콜백이 안 온다(Node 18 이하 기준. 19부터는 `close()`가 유휴 연결을 함께 닫는다).

```ts
// server.ts — After: readiness를 먼저 내리고, 유휴 연결을 명시적으로 닫는다
let ready = true
app.get('/healthz', (_, res) => res.sendStatus(200))              // liveness: 항상 200
app.get('/readyz', (_, res) => res.sendStatus(ready ? 200 : 503)) // readiness: 스위치

const server = app.listen(3000)

process.on('SIGTERM', async () => {
  ready = false                                    // 1. 라우팅에서 빠진다
  await sleep(DRAIN_DELAY_MS)                      // 2. LB 갱신을 기다린다
  server.closeIdleConnections()                    // 3. keep-alive 유휴 연결 정리
  await new Promise<void>((ok, fail) =>
    server.close(e => (e ? fail(e) : ok())))       // 4. 진행 중 요청 완료 대기
  await pool.end()                                 // 5. DB 커넥션 풀 정리
  process.exit(0)
})
```

2번의 대기가 핵심이자 대가이고, 그 하한이 앞 표의 readiness 30초다. 생략하면 앞의 5,000건이 돌아온다. `terminationGracePeriodSeconds`는 1~5번의 총합보다 길어야 하고, 아니면 중간에 SIGKILL이 온다.

배치 단일 실행은 PostgreSQL advisory lock으로 붙인다. 세션 단위 락이라 **커넥션에 묶인다**는 것이 함정이고, 풀에서 다른 커넥션을 받으면 해제가 엉킨다.

```ts
// jobs/settlement.ts — After: 커넥션 하나를 붙잡고 advisory lock으로 단일 실행을 보장
const LOCK_KEY = 8_812_003n   // 작업마다 고정된 bigint. 문자열 해시여도 된다

export async function runSettlement() {
  const client = await pool.connect()          // 락이 세션에 묶이므로 커넥션을 고정한다
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY])
    if (!rows[0].ok) return { skipped: true }  // 다른 인스턴스가 잡았다. 대기하지 않는다
    await settle(client)
    return { skipped: false }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY])
    client.release()                           // 해제 후 반납. 뒤바뀌면 락이 샌다
  }
}
```

`pg_try_advisory_lock`은 즉시 참/거짓을 반환하므로 나머지 19대는 대기 없이 빠지고, 프로세스가 죽으면 세션이 끊기며 락도 풀린다. 한계는 분명하다. **락의 수명이 DB 세션의 수명이라 단절 감지가 늦으면 공백이 생기고, 펜싱 토큰이 없다.** 트랜잭션 범위면 `pg_advisory_xact_lock`이 낫다.

## 쓰지 말아야 할 때

**단일 서비스에 트래픽도 적으면 구조화 로그와 기본 헬스체크로 끝난다.** liveness와 readiness를 나누는 비용은 거의 0이라 규모와 무관하게 하는 게 맞다. 분산 추적의 손익분기가 서비스 3개라는 계산은 [안티패턴 15편](/posts/backend-antipatterns-15-unobservable-system)에 있다.

**readiness에 의존성 검사를 넣을지는 "대체 인스턴스가 있는가"로 정한다.** 20대가 같은 DB 하나를 보는 구성에서 DB 확인을 넣으면, DB가 흔들릴 때 20대가 동시에 빠져 로드밸런서에 남는 대상이 0이 된다. 사용자가 받는 것은 느린 응답 대신 즉시 503이고, 어느 쪽이 나은지는 제품이 답할 문제다. 이 검사가 값을 하는 것은 **인스턴스마다 상태가 갈릴 때**다. 워밍업이 끝나지 않은 캐시, 파티션을 못 받은 컨슈머, 특정 샤드만 커넥션이 끊긴 경우가 그렇다. 전 인스턴스가 똑같이 실패할 검사라면 readiness가 아니라 알림에 둔다.

**인스턴스가 하나면 Leader Election은 순수 비용이다.** 락 저장소라는 의존성과 락 획득 실패라는 실패 모드가 추가되는데, 막아야 할 중복 실행이 없다. 최소 인스턴스가 1이고 앞으로도 그렇다면 `setInterval` 하나가 정답이다.

**정합성이 아니라 효율이 문제면 분산 락도 과잉이다.** 배치가 두 번 돌아도 결과가 같다면 펜싱 토큰 없이 advisory lock으로 충분하다. 두 번 돌면 돈이 두 번 나간다면 락의 등급을 올릴 게 아니라 **작업을 멱등하게 만드는 쪽**이 먼저다(11편의 Idempotent Receiver).

**드레이닝이 요청 길이보다 길 필요는 없다.** p99 응답이 500ms인데 30초를 거는 것은 배포 시간만 늘린다. 대기는 앞 표의 readiness 30초에 꼬리 지연을 얹은 값이면 되고, 더 긴 시간이 필요한 쪽은 장시간 커넥션(SSE, WebSocket)을 가진 프로세스다.

## 요약

| 항목 | 내용 |
|---|---|
| 공통 성질 | 시스템이 자기 상태를 선언하게 해 판단을 기계로 넘긴다 |
| 프로브 3종 | 주기 × 실패 임계가 곧 예산. readiness 30초가 드레이닝 하한 |
| 종료 순서 | readiness 내림 → LB 갱신 대기 → 신규 차단 → 진행 완료 → 풀 정리 |
| 위반 비용 | 50 rps × LB 지연 5초 × 20파드 = 배포당 5,000건 |
| 전파 | `traceparent` 55바이트. 컨텍스트 유실은 예외가 아니라 빈 필드로 나타난다 |
| 대가 1 | 로그 103.7GB/일(평문 대비 5배). 1% 샘플링은 일 10건을 9.6%만 본다 |
| 대가 2 | 드레이닝으로 배포·롤백이 4분. 임대는 짧아도 길어도 손해 |
| 락의 한계 | GC 정지 15초 > 임대 10초면 리더가 둘. 펜싱은 리소스가 본다 |

---

**다음 편 — [16편. 패턴을 고르는 법 — 교환 조건의 계산](/posts/backend-design-patterns-16-choosing-patterns)**

열네 개의 패턴군을 지나 종장으로 간다. 1편에서 세운 "패턴은 교환 조건"이라는 명제를 선택 절차로 바꾼다. 어떤 수치를 재야 도입 여부를 판단하는지, 이미 산 패턴을 언제 되팔아야 하는지, 대가를 모른 채 산 패턴이 왜 안티패턴이 되는지를 정리하며 닫는다.
