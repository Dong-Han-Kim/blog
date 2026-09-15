---
# 📌 기본 메타데이터
title: '메시지로 말하기 — Enterprise Integration Patterns'
date: '2026-09-15'
category: 'backend'
tags: ['Messaging', 'Enterprise Integration Patterns', 'Dead Letter Channel', 'Idempotency', 'Node.js']
description: 'Enterprise Integration Patterns 중 현역인 것들과 비동기 메시징이 파는 즉시성·순서·디버깅 가능성. 멱등 소비자와 DLQ 골격, 큐 대신 PostgreSQL 작업 테이블로 충분한 경우.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 8

# 📚 SEO용
keywords: ['Messaging', 'Enterprise Integration Patterns', 'Dead Letter Channel', 'Idempotency', 'Node.js', '백엔드 디자인 패턴']
---

# 메시지로 말하기 — Enterprise Integration Patterns

## 결제가 끝났는데 주문이 실패한다

주문 생성 핸들러가 이렇다고 하자.

```ts
// app/api/orders/route.ts — Before: 후속 작업을 전부 동기로 호출한다
export async function POST(req: Request) {
  const order = await createOrder(await req.json())
  await inventoryApi.reserve(order)   // 재고 서비스
  await mailApi.sendConfirmation(order) // 메일 서비스
  await analyticsApi.track(order)     // 분석 서비스
  return Response.json({ id: order.id })
}
```

메일 서비스가 30초 응답하지 않으면 주문 API도 30초 응답하지 않고, 분석 서비스가 죽어 있으면 주문이 실패한다. **호출자의 가용성이 수신자 전원의 가용성 곱으로 내려앉는다.** 각각 99.9%면 이 핸들러는 0.999⁴ = 99.6%, 월 다운타임 30 × 24 × 60 × 0.004 = 약 173분이다. 결합의 방향도 문제다 — 주문 도메인이 무관한 소비자 목록을 알고 있어서 소비자가 늘 때마다 주문 코드가 바뀐다.

## 비동기로 무엇을 팔 수 있는가

"비동기로 바꾸자"로 가기 전에 거래 조건을 세워야 한다. 비동기 메시징은 결합도를 낮추는 대신 셋을 판다.

> **즉시성** — 호출 직후 결과를 알 수 없다. **순서** — 발행 순서대로 처리된다는 보장이 기본값이 아니다. **디버깅 가능성** — 요청 하나의 전체 경로를 보여주는 스택 트레이스가 사라진다.

"비동기가 더 낫다"가 아니라 이 셋을 팔 수 있는 상황인가가 질문이다.

## 65개 중 지금도 쓰이는 것들

Gregor Hohpe와 Bobby Woolf의 『Enterprise Integration Patterns』(2003)는 메시징 통합 패턴 65개를 정리했다. 당시의 EAI 제품군은 사라졌지만 패턴의 이름과 구분은 남아, Kafka와 SQS의 문서가 지금도 이 어휘를 쓴다.

**Message Channel / Point-to-Point vs Publish-Subscribe.** 메시지 하나를 소비자 하나가 가져가는가, 구독자 전원이 각자 받는가. 나중에 바꾸기 어려운 것은 의미론이 다르기 때문이다. Point-to-Point는 "작업 지시", Publish-Subscribe는 "사실 통보"다. 작업 큐를 구독 채널로 바꾸면 같은 일이 N번 실행되고, 반대로 바꾸면 소비자 하나가 남의 이벤트를 먹어치운다. 채널 이름을 `order.reserve-inventory`로 할지 `order.created`로 할지가 이 결정이다.

**Competing Consumers.** 같은 채널을 여러 소비자가 나눠 처리해 처리량을 늘린다. 메시지당 20ms면 소비자 하나는 1000 ÷ 20 = 초당 50건, 파티션 12개에 소비자 12개면 600건/s다. 대가는 순서다.

**Message Router / Content-Based Router.** 메시지 내용을 보고 목적지를 정한다. 문제는 판단 규칙의 위치다. 라우팅 규칙이 중앙 브로커 설정으로 올라가면 비즈니스 규칙이 인프라 설정 파일에 살게 되고, 배포와 무관하게 동작이 바뀐다([안티패턴 6편](/posts/backend-antipatterns-6-smart-pipes-dumb-endpoints)).

**Message Translator.** 다른 스키마 사이를 변환한다. 외부 메시지를 도메인 이벤트로 바꾸는 번역기는 Anticorruption Layer의 메시징판이다(9편).

**Dead Letter Channel.** 재시도해도 처리되지 않은 메시지의 종착지. **DLQ가 없는 시스템은 실패를 삼킨다.** 무한 재시도는 그 메시지가 파티션 선두를 막아 뒤를 전부 세우고, 버리면 데이터가 조용히 사라진다. 중요한 것은 DLQ가 아니라 **재처리 절차까지 설계에 넣는 것**이다 — 누가 보는가, 어떤 알람이 울리는가, 고친 뒤 어떻게 다시 넣는가.

**Idempotent Receiver.** 메시징 시스템 대부분은 at-least-once 전달을 보장한다. 같은 메시지가 두 번 와도 결과가 같아야 한다는 뜻이고, 구현은 11편에서 다룬다.

**Guaranteed Delivery / Message Store.** 브로커가 메시지를 디스크에 쓰고 전달을 보장한다. 다만 "DB에 쓰고 브로커에 보낸다" 사이의 실패는 브로커가 책임지지 않고, 그 틈을 메우는 것이 11편의 Transactional Outbox다.

**Claim Check.** 큰 페이로드를 저장소에 두고 참조만 보낸다. 브로커에는 크기 상한이 있고(Kafka 기본 1MB, SQS 1MiB — 2025년 8월 이전에는 256KiB), 상한 아래여도 큰 메시지는 처리량과 보존 비용을 잡아먹는다.

이들이 코드에서 합쳐지는 형태를 보자. 앞의 핸들러를 이벤트 발행으로 바꾸되, 필수 작업(재고 확보)과 부수 작업(메일·분석)을 가르는 판단이 먼저다.

```ts
// app/api/orders/route.ts — After: 부수 작업만 이벤트로 내보낸다
export async function POST(req: Request) {
  const order = await createOrder(await req.json())
  await inventoryApi.reserve(order) // 결과가 응답에 필요하므로 동기 유지

  await publish('order.created', {
    eventId: crypto.randomUUID(),      // 멱등 처리의 키
    correlationId: getCorrelationId(), // 추적용, 소비자가 그대로 전파한다
    occurredAt: new Date().toISOString(),
    payload: { orderId: order.id, totalAmount: order.totalAmount },
  })
  return Response.json({ id: order.id })
}
```

메일과 분석은 `order.created` 구독자로 옮겼고, 소비자를 더 붙여도 이 파일은 변하지 않는다. 다만 아직 결함이 있다 — `createOrder` 커밋과 `publish` 사이에 프로세스가 죽으면 이벤트가 유실된다. 그 구멍을 메우는 것이 11편이다. 소비자 쪽 골격은 멱등성과 DLQ를 함께 담는다.

```ts
// workers/order-created.ts — After: 멱등 소비 + 재시도 + DLQ
const MAX_ATTEMPTS = 5

export async function handle(msg: Message<OrderCreatedPayload>) {
  // 1) 멱등: 처리 기록을 먼저 선점한다. 중복이면 유니크 제약으로 걸린다.
  const claimed = await db
    .insert(processedEvents)
    .values({ eventId: msg.eventId, consumer: 'order-created/mailer' })
    .onConflictDoNothing()
    .returning({ id: processedEvents.eventId })
  if (claimed.length === 0) return ack(msg) // 이미 처리됨 — 조용히 종료

  try {
    await sendConfirmationMail(msg.payload)
    return ack(msg)
  } catch (err) {
    // 선점을 풀어야 재시도·수동 재처리가 "이미 처리됨"으로 걸러지지 않는다
    await db.delete(processedEvents).where(eq(processedEvents.eventId, msg.eventId))
    // 2) 재처리 가능 여부로 분기한다. 4xx는 재시도해도 같다.
    if (!isRetryable(err) || msg.attempt >= MAX_ATTEMPTS) {
      return toDeadLetter(msg, { reason: String(err), attempts: msg.attempt })
    }
    // 3) 지수 백오프 + 지터. 전부 같은 시각에 재시도하면 같은 부하가 반복된다.
    const delay = Math.min(2 ** msg.attempt * 1000, 60_000) * (0.5 + Math.random() / 2)
    return retryAfter(msg, delay)
  }
}
```

세 지점이 핵심이다. 멱등 키를 **작업보다 먼저** 선점해 중복 실행을 막고, 영구 실패를 DLQ로 보내 파티션 선두를 막지 않게 하고, 지터로 동시 재시도가 스파이크를 만들지 않게 한다([안티패턴 12편](/posts/backend-antipatterns-12-retry-storm-thundering-herd)). 실패했을 때 처리 기록을 지우지 않으면 재시도와 DLQ 수동 재처리가 "이미 처리됨"으로 걸러진다.

## 시간적 결합을 끊는다

동기 호출의 본질은 **시간적 결합**(temporal coupling)이다. 호출자와 수신자가 같은 순간에 살아 있어야 한다. 큐를 사이에 두면 이 조건이 사라져, 수신자가 죽어 있어도 발신자는 메시지를 넣고 진행한다.

두 번째는 버퍼다. 유입이 초당 500건으로 60초 튀고 처리 용량이 300건/s면 동기 구조에서는 초과분 200건/s가 에러가 된다. 큐가 있으면 (500 − 300) × 60 = 12,000건이 쌓이고, 유입이 100건/s로 돌아오면 12,000 ÷ (300 − 100) = 60초에 소진된다. **큐 길이는 초과 부하를 시간으로 환산해 흡수한다.**

세 번째는 소비자 추가 비용이다. Publish-Subscribe에서는 새 소비자가 생겨도 발행자 코드가 변하지 않는다.

## 큐가 청구하는 것

**브로커가 인프라로 추가된다.** 관리형이어도 셋은 팀이 알아야 한다 — 파티션 수(늘리기는 쉽고 줄이기는 어렵다), 보존 기간(짧으면 장애 복구 중 메시지를 잃는다), 컨슈머 랙(안 보면 처리가 밀리는 것을 민원으로 알게 된다). 대시보드와 알람 3종, 온콜 대상 하나가 는다.

**순서 보장은 기본값이 아니고, 사면 처리량을 잃는다.** 같은 주문의 `created`와 `cancelled`가 순서 바뀌어 처리되면 취소된 주문이 되살아난다. 파티션 키로 `orderId`를 쓰면 같은 주문의 메시지가 같은 파티션에 들어가 순서가 보장되지만, 그 순간 **그 키의 처리량은 파티션 하나로 고정된다.** 파티션 12개 전체는 600건/s지만 단일 주문은 50건/s다. 키 분포가 고르지 않으면(대형 판매자 하나가 트래픽의 40%) 그 파티션만 랙이 쌓이는 hot partition이 된다.

**스택 트레이스가 없다.** 요청 하나가 API → 큐 A → 소비자 → 큐 B를 거치면 실패 지점을 추적할 단서가 로그 조각들뿐이다. 발행 시점에 상관관계 ID를 헤더에 넣고 모든 소비자가 그것을 로그와 다음 메시지로 전파해야 한다 — 비동기와 함께 도입할 필수 항목이다([안티패턴 15편](/posts/backend-antipatterns-15-unobservable-system)).

**최종 일관성을 제품이 받아들여야 한다.** 주문 직후 이동한 마이페이지에 그 주문이 아직 없을 수 있다. 기술로 지울 수 없고 "처리 중" 상태를 화면에 만드는 제품 차원의 대응이 필요하다. 제품 담당자가 동의하지 않으면 거래는 성립하지 않는다.

**DLQ 운영에는 사람 시간이 든다.** 일 100만 건에 실패율 0.1%면 1,000건/일이 쌓이고, 건당 30초만 봐도 1000 × 30 ÷ 3600 = 8.3시간으로 한 명의 하루다. 자동 분류와 일괄 재처리 경로가 처음부터 설계에 들어가야 한다.

**메시지 스키마도 계약이다.** API와 똑같은 버전 관리 문제가 더 어려운 형태로 생긴다. HTTP API는 접근 로그로 소비자를 셀 수 있지만 Publish-Subscribe에서는 누가 구독 중인지 발행자가 모른다. 필드를 지웠을 때 깨지는 쪽을 알 수 없어 실질적으로 **추가만 허용하는 규칙**으로 운영하게 되고, 죽은 필드가 누적된다.

## 쓰지 말아야 할 때

**호출자가 결과를 즉시 필요로 할 때.** 결제 승인 여부처럼 응답에 결과가 실려야 하는 흐름을 비동기로 바꾸면 "요청 보내고 폴링으로 결과 확인"을 직접 구현하게 된다. 동기 호출에 큐와 상태 테이블과 폴링 루프를 더한 것이지 더 단순하지 않다.

**서비스가 둘뿐인 시스템.** 발행자 1 대 소비자 1이면 "소비자 추가 비용 0"이라는 이득이 회수되지 않고, 큐가 주는 시간적 결합 해소는 백그라운드 작업 테이블로도 얻는다.

**브로커를 운영할 여력이 없는 팀.** 파티션·랙·보존 기간을 아무도 보지 않는 브로커는 장애를 숨긴다. 메시지가 쌓여도 API는 200을 반환하므로 지표상 정상이다.

**PostgreSQL 한 대로 충분한 처리량.** 초당 수십 건의 백그라운드 작업이라면 `SELECT ... FOR UPDATE SKIP LOCKED`로 작업 테이블을 큐처럼 쓸 수 있고, 작업 등록과 도메인 변경이 한 트랜잭션에 묶여 11편의 Dual Write 문제도 피한다.

이 권고가 앞 시리즈의 DB-as-IPC 안티패턴([안티패턴 5편](/posts/backend-antipatterns-5-smart-db-as-architecture))과 충돌하는지부터 갈라야 한다. 구별선은 셋이다 — 읽는 주체가 그 서비스 소유의 전용 워커 하나인가 여러 서비스인가, 테이블이 서비스 간 계약인가 한 서비스의 내부 구현 세부인가, 라우팅·변환 규칙이 DB 안(트리거·프로시저)에 있는가 애플리케이션 코드에 있는가. 셋 다 앞쪽이면 큐가 아니라 한 서비스의 작업 목록이고, 하나라도 뒤쪽이면 DB가 브로커 노릇을 하는 것이다. 한계도 수치로 분명하다 — 폴링 간격 1초면 평균 지연 0.5초가 깔리고, 워커 8대가 1초마다 돌면 하루 8 × 86,400 = 69만 쿼리 중 큐가 90% 비어 있을 때 62만이 빈 조회이며, 작업당 UPDATE와 DELETE를 쓰므로 수백 건/s 근처에서 DB write가 먼저 막힌다. 팬아웃은 아예 안 되므로 같은 작업을 소비자 2종이 각자 받아야 하는 순간이 브로커로 넘어갈 시점이다.

마지막 하나. **큐는 결합도를 낮추지만 큐 자체가 결합 지점이다.** 발행자와 소비자는 채널 이름, 메시지 스키마, 파티션 키 규칙, 재시도 정책을 공유한다. 코드상 의존은 사라졌지만 합의 항목은 늘었고, 그 합의는 타입 체커가 검사하지 않는다.

## 요약

| 항목 | 내용 |
|---|---|
| 출처 | Hohpe & Woolf, Enterprise Integration Patterns (2003). 65개 중 일부가 현역 |
| 사는 것 | 시간적 결합 해소. 수신자가 죽어도 발신자는 진행, 큐가 스파이크 흡수 |
| 버퍼 산술 | 유입 500/s·용량 300/s·60초 → 12,000건, 유입 100/s 복귀 시 60초 소진 |
| 파는 것 1 | 순서. 파티션 키로 사면 그 키는 파티션 1개 처리량(600건/s 중 50건/s) |
| 파는 것 2 | 디버깅. 스택 트레이스가 없어 상관관계 ID가 필수가 된다 |
| 파는 것 3 | DLQ 운영 인건비. 실패율 0.1%·일 100만 건이면 1,000건/일, 건당 30초로 8.3시간 |
| 파는 것 4 | 메시지 스키마도 계약. 구독자를 모르므로 삭제 불가 |
| DB-as-IPC 구별 | 전용 워커 1개·내부 구현·라우팅이 앱에 있으면 작업 목록([안티패턴 5편](/posts/backend-antipatterns-5-smart-db-as-architecture)) |
| 쓰지 말 때 | 즉시 결과가 필요한 흐름, 서비스 2개, 브로커 운영 역량 부재 |

---

**다음 편 — [9편. 이질적인 것을 막아내는 벽 — Anticorruption Layer와 Strangler Fig](/posts/backend-design-patterns-9-anticorruption-and-strangler)**

2막의 마지막은 통제할 수 없는 시스템과 사는 법이다. 외부 모델이 내 도메인으로 번지는 경로를 추적하고, 그것을 한 곳에 가두는 Anticorruption Layer와 레거시를 조각내어 대체하는 Strangler Fig를 다룬다. 전면 재작성이 더 싼 구간을 규모로 계산한다.
