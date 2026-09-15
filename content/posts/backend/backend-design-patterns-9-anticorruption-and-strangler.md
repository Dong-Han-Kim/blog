---
# 📌 기본 메타데이터
title: '이질적인 것을 막아내는 벽 — Anticorruption Layer와 Strangler Fig'
date: '2026-09-15'
category: 'backend'
tags: ['Anticorruption Layer', 'Strangler Fig', 'Branch by Abstraction', 'Migration', 'DDD']
description: '외부 모델을 한 곳에 가두는 Anticorruption Layer와 레거시를 조각내 대체하는 Strangler Fig. 번역 비용을 측정 가능하게 모으는 법과 전면 재작성이 더 싼 규모의 계산.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 9

# 📚 SEO용
keywords: ['Anticorruption Layer', 'Strangler Fig', 'Branch by Abstraction', 'Migration', 'DDD', '백엔드 디자인 패턴']
---

# 이질적인 것을 막아내는 벽 — Anticorruption Layer와 Strangler Fig

## 외부 SDK의 타입이 도메인 함수 시그니처에 있다

2막의 앞 두 편은 내가 설계할 수 있는 경계를 다뤘다. 마지막 문제는 설계 권한이 없는 경계다. 15년 된 정산 시스템, 계약이 안 끝난 벤더 API, 다른 회사가 만든 SDK — 이들의 모델은 협상 대상이 아니다. 결제 벤더 SDK를 붙인 코드를 보면 과정이 분명하다.

```ts
// domain/order/refund.ts — Before: 외부 타입이 도메인으로 새어 들어왔다
import type { VendorTxn } from 'vendor-pay-sdk'

export async function refund(order: Order, txn: VendorTxn) {
  if (txn.tx_status !== 'CAPTURED' && txn.tx_status !== 'PART_CAPTURED') return
  const amount = Number(txn.amt_krw ?? txn.amount ?? 0) // 벤더가 두 필드를 섞어 쓴다
  if (txn.rsp_cd === '0000' || txn.rsp_cd === 'NORMAL')
    await vendorClient.cancel({ tid: txn.tid, cancel_amt: String(amount) })
}
```

새어 들어온 것을 세어 보면 다섯 개다. 벤더의 필드명(`tx_status`, `amt_krw`, `rsp_cd`), 벤더의 상태 어휘(`CAPTURED`, `PART_CAPTURED`), 벤더의 널 처리 관례(두 필드 중 살아 있는 쪽), 금액을 문자열로 주고받는 표현, 성공 코드가 두 가지라는 벤더의 역사적 사정.

문제는 이 다섯이 한 파일에 머물지 않는다는 것이다. `VendorTxn`을 인자로 받는 함수가 생기면 호출하는 쪽도 `VendorTxn`을 갖고 있어야 하므로, 타입은 호출 그래프를 따라 위로 번진다. 테스트 픽스처에도 벤더 스키마가 들어가고, 벤더가 `rsp_cd`를 `resultCode`로 바꾸는 날 수정 대상이 몇 개인지 아무도 모르게 된다.

## 벽과 나무

**Anticorruption Layer**는 Eric Evans가 『Domain-Driven Design』(2003)에서 정리한 패턴이다. 두 모델 사이에 번역 계층을 두어 외부 모델이 내 모델의 형태를 바꾸지 못하게 막는다.

6편의 Adapter와 혼동되기 쉬운데 차이가 둘이다. Adapter는 인터페이스 하나의 시그니처를 맞추는 국소적 변환이고, ACL은 **모델 전체**를 번역한다 — 타입, 어휘, 오류 표현, 식별자 체계까지. 그리고 ACL에는 **방향성**이 있다. 외부에서 안으로 들어오는 것을 막고 안쪽 모델이 바깥으로 흘러나가는 것도 같이 막는다. Adapter에는 "지키려는 쪽"이라는 개념이 없다.

앞의 Before를 이 형태로 막으면 이렇게 된다. 핵심은 벤더 타입이 `infra/` 밖으로 나가지 않게 하는 것이다.

```ts
// infra/payment/vendor-acl.ts — After: 번역을 한 곳에 가둔다
import type { VendorTxn } from 'vendor-pay-sdk'

// 도메인이 아는 유일한 결제 모델. 벤더 어휘가 하나도 없다.
export type Payment = {
  id: PaymentId
  state: 'authorized' | 'captured' | 'partially_captured' | 'cancelled'
  amount: Money
}

const STATE: Record<string, Payment['state']> = {
  CAPTURED: 'captured', PART_CAPTURED: 'partially_captured', AUTH: 'authorized',
}

export function toPayment(txn: VendorTxn): Payment {
  const state = STATE[txn.tx_status]
  if (!state) throw new UnmappedVendorState(txn.tx_status) // 모르는 값은 삼키지 않는다
  // 널 관례를 여기서 흡수한다
  const amount = money(Number(txn.amt_krw ?? txn.amount ?? 0), 'KRW')
  return { id: paymentId(txn.tid), state, amount }
}
```

```ts
// domain/order/refund.ts — After: 도메인은 벤더를 모른다
export async function refund(p: Payment, gateway: PaymentGateway) {
  if (p.state !== 'captured' && p.state !== 'partially_captured') return
  await gateway.cancel(p.id, p.amount)
}
```

도메인 함수에서 `vendor-pay-sdk` import가 사라졌고, 상태 어휘가 내 언어가 됐고, 매핑되지 않은 벤더 상태가 `UnmappedVendorState`로 즉시 드러난다. 마지막이 중요하다 — 벤더가 새 상태값을 추가했을 때 Before는 조용히 `return`했지만 After는 예외를 던진다. **번역을 한 곳에 모으면 번역 실패를 관측할 지점도 한 곳이 된다.**

**Strangler Fig**는 Martin Fowler가 2004년 글에서 이름 붙인 전략이다. 교살무화과는 숙주 나무를 감싸고 자라 숙주가 죽고 나면 자기 형태만 남는다. 레거시를 한 번에 대체하는 대신 기능 단위로 요청을 가로채 새 구현으로 옮기고 레거시를 비워간다. 실질적인 설계 결정은 하나다. **가로채는 지점(interception point)을 어디에 두는가.**

| 가로채기 지점 | 조건 | 주된 제약 |
|---|---|---|
| HTTP 라우팅 (리버스 프록시) | 경계가 URL로 나뉠 때 | 세션·인증이 양쪽에서 통해야 한다 |
| 이벤트 구독 | 레거시가 이벤트를 발행할 때 | 최종 일관성, 이중 처리 방지 필요 |
| 애플리케이션 내부 추상 | 같은 프로세스 안일 때 | 레거시 코드 수정 권한이 필요하다 |
| DB 트리거/CDC | 레거시 코드를 못 건드릴 때 | 데이터만 보이고 의도는 안 보인다 |

첫 번째 지점은 경로 기반 분기 하나로 시작할 수 있다.

```ts
// gateway/strangler.ts — After: 경로별로 레거시/신규를 분기한다
type Route = { pattern: RegExp; target: 'legacy' | 'next' }

// 이 배열이 이행 진행도 그 자체다.
const MIGRATED: Route[] = [
  { pattern: /^\/api\/orders\/[^/]+\/refunds/, target: 'next' },
  { pattern: /^\/api\/orders/, target: 'next' },
]

export async function handle(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname
  const target = MIGRATED.find(r => r.pattern.test(path))?.target ?? 'legacy'
  logRouting(path, target) // 라우팅 결정을 남긴다. 이행 감사에 쓰인다.
  return target === 'next' ? proxyTo(NEXT_ORIGIN, req) : proxyTo(LEGACY_ORIGIN, req)
}
```

규칙 순서가 함정이다. 더 좁은 경로를 앞에 둬야 하고, 순서가 틀리면 아직 안 옮긴 기능이 신규로 흘러간다. 기본값이 `legacy`인 것도 의도적이다 — 규칙에 없는 새 경로가 생기면 미완성 신규가 아니라 검증된 레거시로 간다.

**Branch by Abstraction**은 세 번째 지점을 위한 기법으로, 장기 브랜치 없이 내부 구현을 교체한다. 순서가 정해져 있다 — 추상을 먼저 세우고, 기존 구현을 그 뒤로 밀어 넣고, 새 구현을 같은 추상 뒤에 공존시키고, 트래픽을 옮기고, 옛 구현을 제거한다. 트래픽을 옮기는 단계가 Feature Toggle과 짝을 이룬다(14편).

**Open Host Service / Published Language**는 반대 방향이다. Evans의 같은 책에 있는 패턴으로, 내가 여러 소비자에게 제공하는 입장일 때 소비자마다 번역기를 만드는 대신 공용 프로토콜과 스키마를 공개한다. 번역기 N개를 내가 만들 것인가, 공개 언어 1개를 만들고 번역을 소비자에게 맡길 것인가다.

## 번역 비용은 사라지지 않고 모인다

ACL이 하는 일은 번역 비용을 없애는 것이 아니다. 앞의 Before에도 번역은 있었다 — `txn.amt_krw ?? txn.amount`와 `Number(...)`가 번역이다. 도메인 로직과 뒤섞여 흩어져 있었을 뿐이다.

> 번역 비용은 사라지지 않는다. 하지만 **한 곳에 모이면 측정 가능해지고 삭제 가능해진다.** 흩어지면 둘 다 불가능하다.

측정 가능하다는 것은 구체적이다. 벤더 의존 코드가 `infra/payment/vendor-acl.ts` 한 파일에 있으면 `git log`로 변경 빈도를 세고 교체 견적을 파일 크기로 낼 수 있다. 흩어져 있으면 견적이 불가능해서 "벤더 바꾸자"는 논의가 매번 무산된다. 삭제도 마찬가지다 — 지울 코드의 경계가 파일 경계와 일치한다.

Strangler Fig가 재작성과 다른 지점은 위험의 분할이다. 재작성은 컷오버 한 번에 전부를 걸고 실패하면 롤백 대상이 시스템 전체다. Strangler Fig는 같은 작업을 N개로 나누므로 조각 하나가 실패해도 롤백 범위가 1/N이다.

## 두 시스템이 동시에 산다

**번역 계층의 유지 비용.** 외부 스키마가 바뀔 때마다 여기가 바뀐다. ACL 하나는 타입 정의, 매핑 함수, 오류 매핑, 계약 테스트, 픽스처 — 파일 3~5개이고, 외부 시스템이 2개면 그 세트가 2벌이다. 테스트 부담도 특유하다. 번역이 맞는지 검증하려면 외부 시스템의 실제 응답 샘플이 필요한데, 그 샘플은 상대가 배포하면 낡는다. 계약 테스트를 벤더 샌드박스에 주기적으로 돌리지 않으면 ACL은 "예전에 맞았던 번역"이 된다.

**성능 오버헤드.** 객체 매핑은 싸다. 건당 0.01ms면 1만 건에 10000 × 0.01 = 100ms로 대개 무시할 수 있다. 비싼 것은 **왕복이 늘어나는 경우**다. 입자 크기가 달라 내 도메인 객체 하나를 채우는 데 외부 호출이 3번 필요하면, RTT 50ms 기준 150ms가 번역 비용으로 붙는다.

**Strangler Fig는 이행 기간 동안 두 시스템을 동시에 운영한다.** 붙는 것이 셋이다. 데이터 정합성 — 같은 주문을 양쪽이 각자 쓰면 어느 쪽이 진실인지 정해야 하고, 보통 한쪽을 원본으로 두고 다른 쪽에 동기화하게 된다. 이중 운영 — 배포 2개, 대시보드 2개, 온콜 2개, 장애 시 "어느 쪽인가"를 먼저 판정하는 시간. 롤백 경로 — 조각을 되돌릴 때 신규 쪽에 쌓인 데이터를 어떻게 할지가 조각마다 정해져 있어야 한다.

**이행이 멈추면 최악이다.** 60%까지 옮기고 남은 40%가 어려워 멈추면 두 시스템을 영구히 운영하면서 동기화 코드까지 유지하게 된다. 하나였던 시스템이 셋(레거시 + 신규 + 동기화 계층)이 되어 시작 전보다 확실히 나쁘다. **종료 조건과 기한이 계획에 있어야 한다.**

**가로채기 계층이 단일 장애점이 된다.** 모든 트래픽이 프록시 한 곳을 지나므로 이 계층의 가용성이 전체 가용성의 상한이 되고, 라우팅 규칙 배포가 전체 장애를 만들 수 있는 배포가 된다. 규칙을 설정으로 빼면 완화되지만, 이번에는 설정 변경 이력이 곧 장애 원인 이력이 된다.

## 쓰지 말아야 할 때

**외부 모델이 내 도메인과 충분히 가까울 때.** 번역 함수가 항등 함수에 가까우면 ACL은 파일 3~5개와 테스트를 이득 없이 추가한 것이다. 매핑 함수가 필드명만 옮겨 적고 조건 분기가 없으면 아직 ACL이 필요한 시점이 아니다.

**통합 지점이 한 곳이고 수명이 짧을 때.** 일회성 데이터 이관이나 3개월짜리 캠페인 연동에 ACL을 세우면 번역 계층이 통합보다 오래 남는다.

**Strangler Fig는 대상이 작으면 전면 재작성이 싸다.** 재작성 총비용을 (구현 공수 E) + (이행 중 레거시에 들어오는 변경을 양쪽에 구현하는 비용) + (컷오버 실패 기댓값)으로, Strangler Fig를 (E × 1.3 — 조각 분할과 가로채기 오버헤드) + (가로채기 구축 5인일) + (이중 운영비) + (조각별 실패 기댓값)으로 놓으면 이렇게 나온다.

| 재작성 공수 추정 | 재작성 기대비용 | Strangler 기대비용 | 유리한 쪽 |
|---|---|---|---|
| 20인일 (4주) | 30.8인일 | 34.4인일 | 재작성 |
| 40인일 (8주) | 61.6인일 | 63.8인일 | 재작성 |
| 60인일 (12주) | 92.4인일 | 93.2인일 | 거의 같음 |
| 120인일 (24주) | 184.8인일 | 181.4인일 | Strangler |

계수는 가정이므로(변경 유입 주 2건, 컷오버 실패 확률 35%, 조각당 실패 확률 10%, 롤백 비용은 대상 공수의 40%) 팀마다 다르게 넣어야 한다. 그래도 형태는 안정적이다 — **Strangler Fig는 순수 공수로는 항상 더 비싸고, 손익분기는 동결 기간이 약 3개월을 넘는 지점에서 온다.** 재작성이 한두 스프린트에 끝난다면 가로채기 계층을 세우는 것 자체가 낭비다.

표에 안 들어간 항목이 하나 있다. 재작성은 동결 기간 동안 제품이 전진하지 못한다. 그걸 감당할 수 없는 조직이라면 위 표와 무관하게 Strangler Fig가 유일한 선택지다.

**과잉의 종착점**도 적어 둔다. 가로채기 계층에 라우팅 이상의 판단을 넣으면 도메인을 아는 중앙 파이프가 되고([안티패턴 6편](/posts/backend-antipatterns-6-smart-pipes-dumb-endpoints)), ACL을 계층마다 겹쳐 쌓으면 같은 데이터가 네 번 재정의된다([안티패턴 4편](/posts/backend-antipatterns-4-lasagna-architecture-leaky-layer)). 둘 다 벽을 세우려다 층을 세운 경우다.

## 요약

| 항목 | 내용 |
|---|---|
| Anticorruption Layer | Evans, DDD(2003). 모델 전체를 번역하고 방향성이 있다는 점에서 Adapter와 다름 |
| Strangler Fig | Fowler(2004). 핵심 설계 결정은 가로채는 지점 — HTTP/이벤트/내부 추상/CDC |
| 사는 것 | 번역 비용을 한 곳에 모아 측정 가능·삭제 가능하게 만든다 |
| 파는 것 1 | ACL 1세트당 파일 3~5개 + 낡아가는 계약 테스트. 외부 시스템 2개면 2벌 |
| 파는 것 2 | 이행 중 배포 2개·대시보드 2개·온콜 2개 + 동기화 계층. 멈추면 영구 이중 운영 |
| 파는 것 3 | 가로채기 계층이 단일 장애점이자 전체 장애를 만들 배포 지점 |
| 손익분기 | 순수 공수로는 재작성이 항상 싸다. 동결 기간 약 3개월 초과에서 역전 |
| 쓰지 말 때 | 번역이 항등 함수일 때, 수명 짧은 단일 통합, 한두 스프린트짜리 대상 |

---

**다음 편 — [10편. 서비스 경계를 긋는 법 — Bounded Context와 분해 전략](/posts/backend-design-patterns-10-service-decomposition)**

3막이 시작된다. 지금까지 경계가 이미 있다고 가정했다면, 10편은 경계를 어디에 그을 것인가를 다룬다. Bounded Context와 Context Mapping으로 후보 경계를 찾고, Database per Service가 청구하는 비용을 조인 손실과 정합성 비용으로 계산한다.
