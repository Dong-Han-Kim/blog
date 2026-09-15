---
# 📌 기본 메타데이터
title: '분산 쓰기의 정합성 — Saga, Transactional Outbox, Idempotent Receiver'
date: '2026-09-15'
category: 'backend'
tags: ['Saga', 'Transactional Outbox', 'Idempotency', 'Eventual Consistency', 'Drizzle']
description: '원자성 대신 보상을 사는 Saga의 Orchestration과 Choreography 비교, 상태 머신으로 쓴 조정자, Outbox 폴링·정리 비용과 멱등성 키의 보관 기간.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 11

# 📚 SEO용
keywords: ['Saga', 'Transactional Outbox', 'Idempotency', 'Eventual Consistency', 'Drizzle', '백엔드 디자인 패턴']
---

# 분산 쓰기의 정합성 — Saga, Transactional Outbox, Idempotent Receiver

## 네 번의 커밋, 하나의 주문

주문 확정은 네 가지 일을 한다. 주문을 만들고, 결제를 승인하고, 재고를 차감하고, 배송을 예약한다. [10편](/posts/backend-design-patterns-10-service-decomposition)에서 그은 경계대로라면 이 넷은 서로 다른 서비스이고 서로 다른 데이터베이스다.

```ts
// modules/order/confirm.ts — Before: 네 번의 원격 호출을 직선으로 이었다
export async function confirmOrder(cmd: ConfirmOrder) {
  const order = await orderApi.create(cmd)          // (1) 커밋됨
  const payment = await paymentApi.authorize(order) // (2) 커밋됨
  await inventoryApi.reserve(order)                 // (3) 여기서 재고 부족
  await shippingApi.schedule(order)                 // (4) 실행 안 됨
  return order
}
```

(3)에서 예외가 나면 (1)과 (2)는 이미 각자의 DB에 커밋되어 있다. 호출부가 던지는 500은 사용자에게 "실패"로 보이지만, 결제는 승인된 상태다. 두 저장소에 순차로 쓰는 한 어떤 순서로도 원자성이 만들어지지 않는다는 증명은 [안티패턴 11편](/posts/backend-antipatterns-11-dual-write-and-2pc)에 있다. 여기서는 그것을 전제로 놓고, 무엇을 고르고 무엇을 지불하는지만 본다.

## Saga — 원자성 대신 보상

Saga는 긴 트랜잭션을 로컬 트랜잭션 T₁…Tₙ의 연쇄로 나누고, Tᵢ에서 실패하면 보상 트랜잭션 Cᵢ₋₁…C₁을 역순으로 실행한다(Garcia-Molina & Salem, SIGMOD 1987). 이 구조가 사는 것은 **락 보유 구간**이다. 락은 각 Tᵢ 안에서만 잡히고 단계 사이에는 잡히지 않으므로, 어떤 서비스도 다른 서비스의 응답을 락을 쥔 채 기다리지 않는다. 4단계 흐름의 총 소요가 3초여도 각 DB가 행을 잠그는 시간은 수십 밀리초에 머문다.

진행 방식은 둘로 갈리고, 이 선택이 이 편에서 가장 실질적인 분기다.

**Orchestration**은 중앙 조정자가 다음 단계를 지시한다. 흐름이 한 파일에 적혀 있고 조정자의 상태 테이블이 그대로 감사 로그이자 운영 화면이 되지만, 조정자가 모든 참여 서비스의 API를 알아야 해서 결합 지점이 된다. **Choreography**는 각 서비스가 남의 이벤트를 구독해 스스로 움직인다. 서비스 추가가 구독 하나를 붙이는 일로 끝나지만, 전체 흐름이 어디에도 적혀 있지 않다.

이 차이는 셀 수 있다. 단계가 N개면 Choreography는 정방향 이벤트 N개와 보상 이벤트 N개, 합쳐 2N개의 이벤트 타입을 만든다. 구독 제약을 두지 않으면 잠재 구독 간선은 N(N−1)개다. N=4면 8개 타입에 12개 간선, N=6이면 12개 타입에 30개 간선이다.

| 항목 | Orchestration | Choreography (N=4) |
|---|---|---|
| 흐름을 읽으려고 여는 저장소 | 1개 | 4개 |
| 중간에 단계 하나 추가 | 조정자 1곳 | 앞뒤 서비스 2곳 |
| 이벤트 타입 수 | 0~N | 2N = 8 |
| 잠재 구독 간선 | 0 | N(N−1) = 12 |
| 단일 장애점 | 조정자 | 없음 |

**간선 수는 N에 선형이 아니라 제곱으로 늘어난다.** 단계가 넷일 때는 둘 다 관리 가능하지만, 여섯을 넘어가면 Choreography에서 "이 이벤트를 누가 듣는가"를 아는 사람이 없어진다. 흐름을 복원하려면 분산 추적이 필수가 된다([안티패턴 15편](/posts/backend-antipatterns-15-unobservable-system)).

## 상태 머신으로 쓴 Orchestration

조정자를 만든다는 것은 진행 상태를 DB에 남긴다는 뜻이다. 상태가 메모리에만 있으면 프로세스가 죽는 순간 진행 중인 Saga가 사라진다.

```ts
// modules/order/saga-schema.ts — After: 진행 상태를 테이블로 소유한다
export const orderSaga = pgTable('order_saga', {
  id: text('id').primaryKey(),
  step: integer('step').notNull().default(0),   // 완료한 단계 수
  phase: text('phase').$type<'forward' | 'compensating' | 'done' | 'stuck'>()
    .notNull().default('forward'),
  payload: jsonb('payload').notNull(),          // 단계 간 전달값 누적
  lastError: text('last_error'),
})
```

실행기는 단계 배열을 순회하며 각 단계의 결과를 커밋한다. 실패하면 방향을 뒤집는다.

```ts
// modules/order/saga-runner.ts — After: 정방향 N개, 보상 N개
type Step<P> = {
  run: (p: P) => Promise<Partial<P>>
  compensate?: (p: P) => Promise<void>   // 없으면 되돌릴 수 없는 단계
}

export async function advance<P>(id: string, steps: Step<P>[]) {
  const s = await load(id)
  if (s.phase === 'forward') {
    const step = steps[s.step]
    if (!step) return save(id, { phase: 'done' })
    try {
      const patch = await step.run(s.payload)   // 결과를 받은 뒤 진행 위치를 커밋 — 사이에 죽으면 재실행되므로 step.run은 멱등이어야 한다
      await save(id, { step: s.step + 1, payload: { ...s.payload, ...patch } })
    } catch (e) { await save(id, { phase: 'compensating', lastError: String(e) }) }
  } else if (s.phase === 'compensating') {
    const step = steps[s.step - 1]
    if (!step) return save(id, { phase: 'done' })
    // 보상 실패는 삼키지 않는다. stuck으로 두고 사람이 보게 한다.
    try { await step.compensate?.(s.payload); await save(id, { step: s.step - 1 }) }
    catch (e) { await save(id, { phase: 'stuck', lastError: String(e) }) }
  }
}
```

`stuck`이 이 골격의 핵심이다. 보상도 실패할 수 있고, 그때 자동 복구를 계속 시도하면 같은 실패를 반복한다. **사람이 개입하는 경로를 상태로 명시하지 않으면 그 경로는 장애 중에 즉흥적으로 만들어진다.**

## Outbox를 운영한다는 것

각 단계의 결과를 이벤트로 알려야 한다면 Transactional Outbox가 필요하다. 업무 데이터와 발행 의도를 한 트랜잭션에 커밋하고 별도 릴레이가 내보내는 구조이며, 왜 그래야 하는지는 [안티패턴 11편](/posts/backend-antipatterns-11-dual-write-and-2pc)에 있다. 여기서 더할 것은 도입 이후의 운영 항목들이다.

**폴링 주기는 지연과 DB 부하의 교환이다.** 주기 T면 발행 지연은 평균 T/2, 최대 T가 더해진다. 릴레이 인스턴스 4대가 각각 폴링하면 쿼리 부하는 4000/T QPS다.

| 주기 | 평균 지연 | 최대 지연 | 릴레이 쿼리(4대) |
|---|---|---|---|
| 50ms | 25ms | 50ms | 80 QPS |
| 200ms | 100ms | 200ms | 20 QPS |
| 1000ms | 500ms | 1000ms | 4 QPS |

**정리 작업의 크기를 먼저 계산한다.** 일 100만 건에 payload 1KB면 하루 1.02GB가 쌓인다. 발행된 행을 지우지 않으면 일주일에 7GB이고, `published_at IS NULL` 조건의 부분 인덱스를 쓰더라도 테이블 자체의 VACUUM 부담이 커진다. 보관이 필요하면 일 단위 파티션으로 두고 파티션을 통째로 떼어내는 편이 행 단위 DELETE보다 싸다.

**순서 보장의 단위를 먼저 좁힌다.** `ORDER BY id`로 읽어도 소비 순서가 보장되지 않는다는 것은 알려진 사실이므로, 설계 판단은 "어느 범위에서 순서가 필요한가"에서 갈린다. 같은 주문의 이벤트만 순서를 지키면 되는 경우가 대부분이고, 그때는 주문 ID로 파티션을 고정하고 소비자를 그 키 단위로 직렬화하면 병렬도가 주문 수만큼 남는다. 전역 순서를 요구하면 병렬도가 1이 되어 소비자를 몇 대 띄우든 처리량이 한 대분으로 고정된다. **범위를 좁히는 것이 처리량을 사는 유일한 수단이다.**

**CDC와의 비교는 인프라 소유권의 문제다.** 트랜잭션 로그를 직접 읽는 방식은 폴링 지연이 없고 애플리케이션 코드도 거의 건드리지 않지만, 복제 슬롯이 밀리면 원본 DB의 WAL이 쌓여 디스크가 찬다. Outbox는 애플리케이션 팀이 감당할 수 있는 실패이고, CDC는 DB 운영 주체가 감당해야 하는 실패다. 그 주체가 같은 팀이 아니라면 이 차이가 선택을 결정한다.

## Idempotent Receiver — 키의 수명이 진짜 문제

at-least-once 전제에서 소비자의 중복 방어는 필수다([안티패턴 11편](/posts/backend-antipatterns-11-dual-write-and-2pc)). 설계에서 남는 질문은 중복을 어떻게 막느냐가 아니라 **그 방어를 언제까지 유지하느냐**다.

```ts
// modules/inventory/consume.ts — 결과를 저장해 재전달에 같은 응답을 돌려준다
export async function reserveOnce(key: string, cmd: Reserve): Promise<ReserveResult> {
  return db.transaction(async (tx) => {
    const [claim] = await tx.insert(idempotency)
      .values({ key, state: 'running', expiresAt: addDays(new Date(), 14) })
      .onConflictDoNothing().returning()

    if (!claim) {
      const prev = await tx.query.idempotency.findFirst({ where: eq(idempotency.key, key) })
      if (prev!.state === 'running') throw new RetryLater()  // 동시 중복은 나중에
      return prev!.result as ReserveResult                   // 같은 결과를 그대로
    }

    const result = await applyReservation(tx, cmd)
    await tx.update(idempotency).set({ state: 'done', result })
      .where(eq(idempotency.key, key))
    return result
  })
}
```

처리 완료만 기록하고 결과를 버리면, 재전달된 요청에 "이미 처리했다"는 사실은 알려도 예약 번호를 돌려줄 수 없다. 동기 응답이 필요한 경로에서는 결과까지 저장해야 한다.

보관 기간은 브로커의 최대 재전달 지연으로 정한다. DLQ에 들어간 메시지를 사흘 뒤 재처리하는 운영을 한다면 키를 하루만 보관해서는 막지 못한다. 14일로 잡고 일 100만 건이면 행당 100바이트 기준 1.4GB이고, 30일이면 3GB다. **보관 기간을 줄이면 저장 비용이 줄고 중복 처리 확률이 올라간다. 이건 정책 결정이지 기술 결정이 아니다.**

## 보상할 수 없는 단계가 섞일 때

Saga의 전제는 모든 단계에 보상이 있다는 것이고, 이 전제가 깨지는 연산 목록 — 발송, 외부 승인, 물리적 출고 — 은 [안티패턴 11편](/posts/backend-antipatterns-11-dual-write-and-2pc)에 있다. 여기서는 그 목록을 설계로 옮기는 두 가지를 본다.

**순서 재배치를 타입으로 강제한다.** 되돌릴 수 없는 단계를 맨 끝으로 미루면 앞의 모든 단계가 성공한 뒤에만 실행되므로 보상이 필요한 상황 자체가 줄어든다. 문제는 이 규칙이 코드에 적히지 않으면 단계 하나가 추가될 때 조용히 깨진다는 것이다. `compensate`가 없는 단계는 마지막 인덱스에만 놓이도록 배열 조립 시점에 검사하면, 순서를 바꾼 커밋이 테스트에서 걸린다.

**사후 보정 경로를 상태로 설계한다.** `stuck`을 조회하는 운영 화면, 수동 처리를 기록하는 API, 미처리 건의 최고 나이 알림. 이 셋이 없으면 보상 불가 상황은 고객 문의로만 발견되고, 그때는 이미 며칠이 지나 있다. **보상할 수 없는 단계가 하나라도 있으면 사람이 개입하는 경로가 기능 명세에 들어가야 한다.**

## 무엇을 내주는가

**중간 상태가 사용자에게 보인다.** 이게 가장 크고 가장 자주 빠지는 대가다. 결제는 승인됐는데 재고 예약이 아직인 순간이 실재하고, 그 순간의 주문 상세 화면이 무엇을 보여줄지 정해야 한다. `결제완료`도 `주문확정`도 아닌 `처리중` 상태가 제품에 추가되고, CS 매뉴얼에 "처리중이 5분 이상 유지되면 에스컬레이션" 같은 항목이 생긴다. **코드가 아니라 제품과 운영 조직이 지불하는 비용이다.**

**보상 코드가 정방향만큼 늘어난다.** 단계 4개면 함수 8개이고, 각 보상은 정방향보다 쓰기 어렵다. 부분 성공을 되돌려야 하고, 이미 다른 요청이 같은 자원을 잡았을 수 있다.

**테스트 경로가 제곱으로 늘어난다.** 실패 지점은 단계 수 N개이고, 각 실패에서 실행되는 보상이 i−1개이므로 보상 실패 지점은 N(N−1)/2개다. 합이 N + N(N−1)/2로, N=4면 10개, N=6이면 21개다. 여기에 각 경로의 정상 종료 확인까지 세면 배가 된다.

**운영 대상이 셋 늘어난다.** 릴레이 프로세스, outbox 정리 배치, 멱등성 키 저장소와 그 만료 배치. 각각 멈추면 조용히 멈춘다. 미발행 행의 최고 나이, `stuck` Saga 건수, 멱등성 테이블 크기 세 가지는 알림을 걸어야 한다.

**진행 중 Saga가 배포를 제약한다.** 단계 정의를 바꾸는 배포가 나가는 순간, 구버전 정의로 시작해 진행 중인 Saga가 신버전 실행기를 만난다. 단계 배열에 버전을 붙이고 진행 중인 것은 옛 정의로 끝내는 처리가 필요하다.

## 쓰지 말아야 할 때

**한 서비스 안에서 끝나는 트랜잭션에 Saga를 넣지 않는다.** 같은 DB의 로컬 트랜잭션이면 원자성이 공짜다. 여기에 상태 테이블과 보상 함수를 얹으면 얻는 것 없이 위의 대가만 전부 지불한다. "나중에 쪼갤지도 모른다"는 근거는 10편의 계산대로 회수 확률이 낮다.

**유실이 허용되는 이벤트에 Outbox를 넣지 않는다.** 이벤트를 유실 허용/불가로 먼저 분류하라는 조언은 [안티패턴 11편](/posts/backend-antipatterns-11-dual-write-and-2pc)에 있다. 여기에 더할 것은 그 분류가 용량 계산으로도 정당화된다는 점이다. 분석 로그가 전체 발행량의 80%를 차지하는 것은 드물지 않고, 그것까지 outbox에 넣으면 위의 하루 1.02GB가 5GB가 된다. 정리 배치와 릴레이 처리량이 그만큼 커지고, 정작 유실되면 안 되는 20%의 발행 지연이 나머지 80%에 밀려 늘어난다.

**단계가 둘이고 뒤 단계가 자연 멱등이면 Saga가 아니라 재시도로 충분하다.** 앞 단계를 커밋하고 뒤 단계를 실패 시 무한 재시도하는 구조는, 뒤 단계가 여러 번 실행돼도 결과가 같다면 정합성이 유지된다. 보상 로직도 상태 테이블도 필요 없다.

**Choreography를 단계 6개 이상에 쓰지 않는다.** 위의 표대로 잠재 간선이 30개가 되면 흐름을 아는 사람이 없어진다. 이 구간에서는 조정자의 결합이 추적 불가능성보다 싸다.

## 요약

| 항목 | 내용 |
|---|---|
| Saga | 긴 트랜잭션을 로컬 트랜잭션 연쇄로 분해하고 보상으로 되돌림(Garcia-Molina & Salem, 1987) |
| 얻는 것 | 어떤 서비스도 다른 서비스의 락을 기다리지 않음. 원자성 대신 최종 일관성 |
| 진행 방식 선택 | N=4에서 Choreography는 이벤트 8종·잠재 간선 12개. 간선은 N(N−1)로 증가 |
| Outbox 운영 | 폴링 200ms면 평균 지연 100ms·릴레이 20 QPS. 일 100만 건이면 1.02GB/일 정리 대상 |
| 멱등성 키 | 보관 기간 = 최대 재전달 지연. 14일·일 100만 건이면 1.4GB |
| 대가 1 | 중간 상태가 제품 요구사항이 됨. 상태 하나와 CS 매뉴얼 항목이 추가 |
| 대가 2 | 보상 함수 N개, 테스트 경로 N + N(N−1)/2. N=4면 10, N=6이면 21 |
| 대가 3 | 릴레이·정리 배치·멱등성 저장소 3개의 운영 대상, 진행 중 Saga의 배포 제약 |
| 쓰지 말아야 할 때 | 단일 서비스 트랜잭션, 유실 허용 이벤트, 단계 2개 + 자연 멱등 |

---

**다음 편 — [12편. 읽기와 쓰기를 가르다 — CQRS와 Event Sourcing](/posts/backend-design-patterns-12-cqrs-and-event-sourcing)**

Saga의 상태 테이블은 쓰기 경로의 이야기였다. 12편은 같은 데이터를 읽는 쪽을 다룬다. 불변식을 지키려 좁게 로드해야 하는 쓰기와 화면 단위로 넓게 조인해야 하는 읽기는 요구가 정반대다. CQRS를 세 단계로 나눠 각각의 비용을 따지고, 이벤트 1억 건의 투영 재구축이 몇 시간인지 계산한다. Event Sourcing과 잊힐 권리가 충돌하는 지점도 함께 본다.
