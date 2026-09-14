---
# 📌 기본 메타데이터
title: 'Dual Write와 2PC의 유혹 — 분산 트랜잭션 안티패턴'
date: '2026-09-14'
category: 'backend'
tags: ['Anti-Pattern', 'Distributed Transaction', 'Transactional Outbox', 'Saga']
description: 'DB 저장과 이벤트 발행을 나란히 쓰는 다섯 줄이 깨지는 방식, 2PC가 후퇴한 이유, Saga의 전제, Transactional Outbox와 멱등 소비자.'

# 💬 옵션 필드
draft: false
series: '백엔드 안티패턴'
seriesOrder: 11

# 📚 SEO용
keywords: ['Anti-Pattern', 'Distributed Transaction', 'Transactional Outbox', 'Saga', '백엔드 안티패턴']
---

# Dual Write와 2PC의 유혹 — 분산 트랜잭션 안티패턴

## 다섯 줄짜리 코드

10편에서 "이벤트로 전파한다"고 적었다. 그 이벤트를 발행하는 코드는 보통 이렇게 생겼다.

```ts
// Before — services/order/src/pay.ts
export async function payOrder(orderId: string) {
  const paidAt = new Date()
  await db.update(orders).set({ status: 'PAID', paidAt })
    .where(eq(orders.id, orderId))                         // (1) DB 커밋
  await broker.publish('order.paid', { orderId, paidAt })  // (2) 발행
}
```

코드 리뷰도 테스트도 통과하고 스테이징에서도 잘 돈다. 그런데 이 두 줄 사이에서 프로세스가 죽으면 주문은 결제됐는데 정산도, 재고도, 알림도 그 사실을 영원히 모른다. **이 상태는 스스로 복구되지 않는다.** 아무도 오류를 보지 못했기 때문이다.

## 순서를 바꿔도 반대 방향으로 깨진다

Dual Write는 서로 다른 두 저장소에 한 번의 논리적 변경을 쓰는 것이다. 실패 모드를 끝까지 따라가면 빠져나갈 순서가 없다는 게 드러난다.

**DB 먼저, 메시지 나중.** (1) 커밋 성공 → 프로세스 종료 → (2) 미실행. 결과는 **이벤트 유실**이다. DB는 `PAID`인데 어떤 하류 서비스도 모른다. (2)에서 브로커가 타임아웃을 내도 같고, 재시도를 걸어도 그 재시도 중에 죽으면 같다.

**메시지 먼저, DB 나중.** (2) 발행 성공 → (1) 커밋 실패. 결과는 **팬텀 이벤트**다. 존재하지 않는 결제에 대해 정산이 기록되고 알림이 나간다. 유실은 조용하지만 팬텀은 잘못된 데이터를 만든다.

> **두 저장소에 순차로 쓰는 한, 어떤 순서로도 원자성은 만들어지지 않는다.**

"그 창이 얼마나 되겠냐"는 반론은 계산으로 답할 수 있다. 두 쓰기 사이의 창을 10ms, 전체 처리량을 초당 100건이라 하자. 리틀의 법칙으로 임의 시점에 그 창 안에 있는 요청은 100 × 0.01 = **1건**이다. 인스턴스 8대에 고르게 분산되면 대당 0.125건이고, 롤링 배포로 8대를 순차 강제 종료하면 8 × 0.125 = **배포 1회당 1건**이 유실된다. 월 20회 배포면 20건, 처리량이 초당 1,000건이면 200건이다.

창이 10ms라는 가정은 낙관적이다. 브로커가 응답하지 않으면 창은 클라이언트 타임아웃(수 초)까지 늘어나고, 그 구간은 장애 중이라 종료 확률이 가장 높다. **유실은 평상시가 아니라 장애 때 집중된다.**

## 2PC는 왜 후퇴했는가

교과서적 해법은 2단계 커밋(2PC)이다. 코디네이터가 참여자 전원에게 준비(prepare)를 묻고, 전원이 동의하면 커밋을 지시한다. X/Open의 XA 규격이 이 인터페이스를 표준화했다. 밀려난 이유는 셋이다.

**코디네이터 장애 시 블로킹.** 참여자가 prepare에 동의한 뒤 코디네이터가 죽으면 그 참여자는 커밋할지 롤백할지 알 수 없다. 락을 쥔 채 기다린다. in-doubt 트랜잭션이라 부르고, 사람이 개입해 수동으로 풀어야 하는 경우가 생긴다.

**가용성을 일관성과 맞바꾼다.** 참여자 중 하나라도 응답하지 않으면 전체가 실패한다. 참여자 3개가 각각 99.9%면 성공률은 0.999³ = 99.7%다. 락 보유 시간이 네트워크 왕복 2회만큼 늘어나 같은 행의 처리량도 떨어진다.

**지원하는 곳이 적다.** 널리 쓰이는 메시지 브로커와 클라우드 관리형 서비스 상당수가 XA를 지원하지 않는다. 지원하지 않는 참여자가 하나만 있어도 2PC는 성립하지 않는다.

## Saga와 그 전제

2PC의 대안으로 나오는 것이 Saga다. Hector Garcia-Molina와 Kenneth Salem이 1987년 SIGMOD 논문에서 제시한 개념으로, 긴 트랜잭션을 로컬 트랜잭션의 연쇄로 바꾸고, 중간에 실패하면 이미 수행한 단계를 **보상 트랜잭션**으로 되돌린다.

진행 방식은 둘로 갈린다. 중앙 조정자가 다음 단계를 지시하는 Orchestration은 흐름이 한곳에 보이지만 조정자가 비대해진다. 각 서비스가 이벤트를 보고 스스로 움직이는 Choreography는 결합이 낮지만 전체 흐름이 어디에도 적혀 있지 않아 추적이 어렵다(15편).

어느 쪽이든 Saga의 전제는 하나다. **모든 단계에 보상이 가능해야 한다.** 이 전제는 자주 깨진다.

- 이메일·SMS 발송 — 보낸 것은 취소할 수 없다. "취소 안내"를 한 통 더 보내는 건 되돌림이 아니라 새로운 사실이다.
- 외부 결제 승인 — 부분 환불이 안 되는 수단이 있고, 승인 취소에 수수료가 붙기도 한다.
- 물리적 출고 — 창고에서 나간 상자는 소프트웨어가 되돌릴 수 없다.

보상할 수 없는 연산이 섞여 있으면 해법은 Saga가 아니라 **되돌릴 수 없는 연산을 흐름의 맨 끝으로 미루는 것**이다. 취소 가능한 단계를 모두 통과한 뒤 마지막에 실행한다.

## 탈출: Transactional Outbox

Dual Write의 실제 해법은 **두 번 쓰지 않는 것**이다. 업무 데이터와 "보낼 메시지"를 같은 DB 트랜잭션 안에서 한 번에 커밋한다. Chris Richardson이 마이크로서비스 패턴 카탈로그에 정리한 Transactional Outbox다.

outbox 테이블은 네 컬럼이면 충분하다. `id`(bigserial, 발행 순서), `topic`, `payload`(jsonb), `published_at`(null이면 미발행).

```ts
// After — services/order/src/pay.ts
// 커밋되면 주문과 발행 의도가 함께 남고, 실패하면 둘 다 없다.
export async function payOrder(orderId: string) {
  await db.transaction(async (tx) => {
    const paidAt = new Date()
    await tx.update(orders).set({ status: 'PAID', paidAt }).where(eq(orders.id, orderId))
    await tx.insert(outbox).values({ topic: 'order.paid', payload: { orderId, paidAt } })
  })
}
```

메시지를 내보내는 것은 별도의 릴레이다. `FOR UPDATE SKIP LOCKED`로 여러 인스턴스가 같은 행을 집지 않게 하면서 미발행 행을 발행하고 표시한다.

```ts
// services/order/src/outbox-relay.ts
async function drainOnce() {
  await db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, topic, payload FROM outbox WHERE published_at IS NULL
      ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`)
    for (const r of rows) {
      await broker.publish(r.topic, r.payload)  // 죽으면 published_at이 안 찍힌다
      await tx.execute(sql`UPDATE outbox SET published_at = now() WHERE id = ${r.id}`)
    }
  })
}
setInterval(() => drainOnce().catch(console.error), 200)  // 주기 = 발행 지연의 하한
```

발행 후 `UPDATE` 전에 죽으면 그 메시지는 다음 주기에 **다시 발행된다.** 버그가 아니라 이 설계의 전제다. 유실을 없애는 대신 중복을 받아들이는 것 — at-least-once다.

## 이 구조는 DB-as-IPC와 무엇이 다른가

5편에서 DB를 큐로 쓰는 구조를 안티패턴으로 다뤘다. 겉모습이 비슷하므로 차이를 분명히 해둔다. DB-as-IPC에서는 여러 소비 서비스가 생산자의 테이블을 각자 폴링해서 그 테이블이 전달 경로 자체가 되고, 임시 큐로 만든 테이블이 결국 상태 테이블로 굳는다.

outbox는 반대다. 읽는 것은 전용 릴레이 하나뿐이고 전달은 브로커가 한다. 테이블은 큐가 아니라 **트랜잭션 로그의 연장**이며 발행된 행은 삭제 대상이다. 소비자는 outbox의 존재를 모르고, 전달 보장은 at-least-once로 명시된다. **outbox는 도착지가 아니라 출발점이다.**

## 중복은 반드시 온다 — 멱등 소비자

at-least-once를 택했으므로 중복은 예외가 아니라 정상 동작이고, 소비자 쪽 설계가 필수가 된다.

```ts
// services/settlement/src/consume.ts
export async function onOrderPaid(m: OrderPaid) {
  await db.transaction(async (tx) => {
    // 처리 완료 테이블에 먼저 기록. 중복이면 0행이 되어 걸러진다.
    const c = await tx.insert(processed)
      .values({ messageId: m.messageId }).onConflictDoNothing().returning()
    if (c.length === 0) return
    await tx.insert(settledOrders).values({ orderId: m.orderId, amount: m.amount })
  })
}
```

중복 제거 수단은 두 가지고 비용이 다르다. **처리 완료 테이블**은 어떤 연산에도 쓸 수 있지만 저장 공간과 정리 작업이 든다. **자연 멱등 연산**은 공짜다 — `UPDATE orders SET status='PAID'`처럼 몇 번 써도 결과가 같은 연산, `onConflictDoNothing`을 붙인 삽입이 여기 해당한다. 반면 `balance = balance + 100` 같은 증분 연산은 자연 멱등이 아니므로 반드시 키로 막아야 한다.

## 탈출의 대가

Outbox는 문제를 없애지 않고 비용을 바꾼다.

**발행 지연.** 폴링 주기가 200ms면 최소 지연이 그만큼 추가된다. 10편의 "허용 지연 합의"에 이 값이 들어가야 한다. 주기를 줄이면 DB 쿼리 부하가 는다.

**정리 작업.** outbox는 계속 자란다. 발행된 행을 삭제하는 배치가 없으면 테이블이 커져 릴레이 쿼리가 느려진다. 보관 기간 정책을 미리 정해두는 편이 낫다.

**순서 보장은 별도 문제.** `ORDER BY id`로 읽어도 브로커 파티션과 소비자 병렬성 때문에 소비 순서는 보장되지 않는다. 순서가 필요하면 같은 키를 같은 파티션에 보내고 소비자를 키 단위로 직렬화해야 하며, 처리량이 깎인다.

**릴레이의 운영.** 프로세스가 하나 늘고, 그것이 멈추면 모든 이벤트가 멈춘다. 미발행 행의 최고 나이를 알림으로 걸지 않으면 조용히 멈춘 것을 알아채지 못한다.

대안인 CDC(변경 데이터 캡처, Debezium 등)는 트랜잭션 로그를 직접 읽으므로 폴링이 없고 코드 변경도 적지만, 별도 인프라와 복제 슬롯 관리가 따라온다.

## 판단 기준 — Dual Write가 합리적인 경우

**유실이 허용되는 부가 이벤트.** 분석 로그, 조회 통계, 추천용 행동 데이터. 월 20건 유실이 지표에 주는 영향이 무의미하다면 outbox와 릴레이를 운영하는 비용이 더 크다. 이때는 다섯 줄짜리 코드가 옳은 답이다.

**소비자가 원본을 다시 읽는 구조.** 이벤트가 "무엇이 바뀌었다"는 신호일 뿐이고 소비자가 곧바로 원본 API를 조회한다면, 하나를 놓쳐도 다음 이벤트에서 복구된다.

그래서 실질적인 첫 작업은 outbox 도입이 아니다. **발행하는 이벤트 목록을 적고 각각이 유실돼도 되는지 분류하는 것**이다. 유실 가능으로 분류되는 것이 대개 절반을 넘고, 나머지에만 outbox를 적용하면 된다. 전부에 적용하면 그것도 과잉 설계다.

## 요약

| 항목 | 내용 |
|---|---|
| 정의 | 한 번의 논리적 변경을 두 저장소에 순차로 쓰는 것. 어떤 순서로도 원자성 없음 |
| 실패 모드 | DB 먼저면 이벤트 유실, 메시지 먼저면 팬텀 이벤트 |
| 규모 | 창 10ms·초당 100건이면 롤링 배포 1회당 1건, 월 20회면 20건 |
| 2PC가 밀린 이유 | in-doubt 블로킹, 가용성 곱셈, 브로커 다수가 XA 미지원 |
| Saga의 전제 | 모든 단계에 보상 가능. 발송·외부 승인·물리 출고는 보상 불가 |
| 탈출 | Transactional Outbox — 업무 데이터와 outbox를 한 트랜잭션에 커밋 |
| 필수 동반 | at-least-once → 멱등 소비자(처리 완료 테이블·자연 멱등 연산) |
| 대가 | 폴링 지연, outbox 정리 배치, 순서 보장 별도 설계, 릴레이 감시 |
| 정답인 경우 | 유실 허용 이벤트(분석·통계), 소비자가 원본을 재조회하는 구조 |

---

**다음 편 — 12편. 동기 호출 사슬과 장애 전파 — Retry Storm, Thundering Herd**

Outbox와 Saga는 쓰기 경로의 이야기였다. 12편은 읽기 경로가 무너지는 방식을 다룬다. 호출 깊이 5에서 가용성이 왜 99.5%로 떨어지는지, 각 계층의 재시도 3회가 어떻게 최하단에서 27배 부하가 되는지, 인기 캐시 키 하나가 만료되는 순간 왜 원본이 쓰러지는지를 계산으로 따라간다. Circuit Breaker와 Bulkhead가 오히려 장애를 만드는 경우도 함께 본다.
