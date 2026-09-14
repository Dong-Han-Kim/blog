---
# 📌 기본 메타데이터
title: 'Anemic Domain Model과 비대해진 Transaction Script'
date: '2026-09-14'
category: 'backend'
tags: ['Anti-Pattern', 'Domain Model', 'Transaction Script', 'TypeScript', 'Parse, Don''t Validate']
description: '같은 검증이 세 곳에 흩어지는 Transaction Script의 한계와, 불변식을 타입으로 밀어 넣는 Parse, don''t validate 접근.'

# 💬 옵션 필드
draft: false
series: '백엔드 안티패턴'
seriesOrder: 3

# 📚 SEO용
keywords: ['Anti-Pattern', 'Domain Model', 'Transaction Script', 'TypeScript', 'Parse, Don''t Validate', '백엔드 안티패턴']
---

# Anemic Domain Model과 비대해진 Transaction Script

## 같은 검증이 세 곳에 있고, 그중 하나만 빠졌다

주문 취소가 마감 시각을 넘겨서 통과됐다. 원인을 찾으면 코드가 이렇게 생겨 있다.

```ts
// types/order.ts
export interface Order {
  id: string
  status: 'pending' | 'paid' | 'shipped' | 'cancelled'
  cancelDeadline: Date
  totalAmount: number   // 원 단위 정수 — 라고 팀에서 말로 합의했다
}
```

데이터에는 필드만 있고 규칙이 없다. 규칙은 이것을 쓰는 쪽에 흩어져 있다.

```ts
// services/order.ts
export async function cancelOrder(id: string, at: Date) {
  const o = await repo.find(id)
  if (o.status === 'shipped') throw new Error('이미 배송됨')
  if (at > o.cancelDeadline) throw new Error('취소 마감 초과')
  await repo.update(id, { status: 'cancelled' })
}

// services/admin-order.ts — 어드민 강제 취소. 마감 검사가 없다.
export async function forceCancel(id: string) {
  const o = await repo.find(id)
  if (o.status === 'shipped') throw new Error('이미 배송됨')
  await repo.update(id, { status: 'cancelled' })
}

// jobs/bulk-cancel.ts — 배치. 여기도 마감 검사가 빠져 있다.
```

취소 규칙을 아는 지점이 셋이고, 그중 둘에는 마감 검사가 없다. 각 지점을 작성한 사람은 서로 다르고, 셋 다 코드 리뷰를 통과했다. `interface` + `service.ts` 조합에는 **규칙을 강제할 자리가 구조적으로 존재하지 않기 때문**이다.

Martin Fowler는 2003년 "AnemicDomainModel" 글에서 이 구조를 지목했다. 도메인 객체가 게터·세터만 갖고 행위는 전부 서비스 계층에 있는 구조가 객체지향의 기본 전제를 거스른다는 주장이다. 그의 *Patterns of Enterprise Application Architecture*(2002)는 이보다 앞서 Transaction Script와 Domain Model을 두 가지 도메인 로직 구성 방식으로 나눠 두었다.

## 이 구조가 옳았던 맥락

Transaction Script는 요청 하나를 절차 하나로 처리하는 방식이다. PoEAA는 이것을 안티패턴으로 적지 않았다. **단순한 도메인 로직에는 Transaction Script가 정답**이라는 게 그 책의 서술이다.

그리고 지금의 백엔드에는 이 방식을 밀어붙이는 힘이 여러 개 있다.

첫째, **직렬화 경계**다. HTTP 요청, DB 행, 메시지 큐 페이로드는 전부 순수 데이터다. 메서드를 가진 객체는 `JSON.stringify`를 지나는 순간 메서드를 잃는다. 경계에서 매번 재구성해야 한다면 그 재구성 비용을 감수할 이유가 필요하다.

둘째, **TypeScript의 구조적 타이핑**이다. 클래스를 만들어도 같은 모양의 객체 리터럴이 그 자리에 들어간다. 명목적 타이핑 언어에서 `Order` 클래스가 주는 보증을 TypeScript의 `class Order`는 기본적으로 주지 않는다.

셋째, **데이터와 행위를 분리하는 함수형 스타일**의 설득력이다. 불변 데이터와 순수 함수의 조합은 테스트와 병렬 처리에서 이점이 분명하고, "빈혈"이라는 단어는 이 스타일에 대한 정확한 비판이 아니다. 데이터 타입과 그 타입을 다루는 함수 모듈을 나란히 두는 구성은 결함이 아니라 다른 언어 전통의 기본형이다.

반대편 논거도 같은 무게로 놓아야 한다. Fowler의 지목은 "객체지향의 규범에 어긋난다"는 취향 주장이 아니라, 행위가 없는 데이터 구조는 자기 상태의 유효성을 스스로 보증할 수 없다는 구조적 지적이다. Eric Evans가 *Domain-Driven Design*(2003)에서 세운 집합체(aggregate) 개념도 같은 곳을 겨눈다. 불변식이 걸쳐 있는 데이터 묶음에는 그 묶음을 통과해야만 상태를 바꿀 수 있는 관문이 하나 있어야 한다는 것이다.

두 진영이 실제로 다투는 지점은 "행위를 클래스 메서드로 붙일 것인가"가 아니라 <strong>"유효하지 않은 상태를 표현 가능하게 둘 것인가"</strong>다. 이 질문으로 옮겨 놓으면 함수형 스타일도 같은 답을 낸다. 관문을 메서드로 만들든 생성자 함수로 만들든, 관문이 하나여야 한다는 요구는 동일하다.

> Anemic Domain Model은 1편의 판별 4조건 중 "검증된 대안"에서 합의가 깨져 있는 드문 사례다. 그래서 이 편은 "이건 안티패턴이다"가 아니라 "언제 안티패턴이 되는가"를 다룬다.

## 호출 지점이 늘어날 때 규칙이 새는 계산

문제는 데이터와 행위가 분리된 것 자체가 아니라, **불변식(invariant, 항상 참이어야 하는 조건)을 강제할 단일 지점이 없다**는 것이다.

규칙 하나를 지켜야 하는 호출 지점이 N개이고, 한 지점에서 그 규칙을 빠뜨릴 확률이 p라고 하자. 규칙이 모든 지점에서 지켜질 확률은 (1−p)^N이다. p = 0.05, N = 3이면 0.857, N = 8이면 0.663이다. **호출 지점 8개짜리 규칙은 셋 중 하나꼴로 어딘가 구멍이 난다.** 여기에 규칙 수 M을 곱하면 시스템 전체가 모든 규칙을 지킬 확률은 0.663^M로 떨어진다. M = 10이면 1.6%다.

이 계산의 핵심은 p를 낮추는 방향(리뷰 강화, 체크리스트)이 효과가 제한적이라는 점이다. p를 0.05에서 0.02로 절반 이상 낮춰도 N = 8에서 0.851에 그친다. **효과가 큰 쪽은 N을 줄이는 것이다.** N = 1이면 p와 무관하게 규칙은 한 곳에만 있다.

여기서 Transaction Script가 비대해지는 두 번째 경로가 열린다. 누락이 발견되면 대응은 대개 "그 검사를 여기에도 추가"이고, 이는 N을 그대로 둔 채 코드만 늘린다. 세 함수에 흩어진 검사를 `assertCancellable(o, at)` 같은 헬퍼로 묶어도 N은 줄지 않는다. 헬퍼를 **호출하지 않는** 네 번째 지점이 언제든 생길 수 있기 때문이다. 공유 헬퍼는 p를 낮추지만 N을 1로 만들지는 못한다. 절차로 강제되는 규칙과 타입으로 강제되는 규칙의 차이가 정확히 여기다.

그래서 Transaction Script가 한계에 닿는 기준선은 "코드가 길어서"가 아니다. 세 가지 수치로 판단한다.

| 기준 | 계속 Transaction Script | 도메인 모델 도입 검토 |
|---|---|---|
| 한 규칙의 호출 지점 수 | 1~2개 | 3개 이상 |
| 한 유스케이스의 분기 수 | 5개 이하 | 10개 이상 (특히 상태 전이 분기) |
| 규칙 변경 빈도 | 분기당 1회 미만 | 월 1회 이상 |

세 칸 중 둘 이상이 오른쪽이면 규칙의 소재지를 옮길 때다. 하나만 오른쪽이면 그냥 함수를 추출하는 것으로 충분하다.

## 불변식을 타입으로 밀어 넣기

탈출의 형태가 반드시 "메서드를 가진 클래스"일 필요는 없다. TypeScript에서 효과가 큰 순서는 branded type → 값 객체 → 파싱 경계다.

Before는 Primitive Obsession이다. 모든 것이 `string`과 `number`라서 컴파일러가 아무것도 막지 못한다.

```ts
// Before — 타입이 규칙을 모른다
function refund(orderId: string, userId: string, amount: number) { /* ... */ }

refund(user.id, order.id, -5000)  // 인자 순서가 뒤바뀌고 금액이 음수인데 컴파일된다
```

branded type은 구조적 타이핑을 우회해 명목적 구별을 만든다. 생성 경로를 하나로 좁히는 게 목적이다.

```ts
// domain/brand.ts — After
declare const brand: unique symbol
type Brand<T, B> = T & { readonly [brand]: B }

export type OrderId = Brand<string, 'OrderId'>
export type Won = Brand<number, 'Won'>

// 생성자는 여기뿐이다. N = 1이 된다.
export function won(v: number): Won {
  if (!Number.isInteger(v) || v < 0) throw new RangeError(`금액 위반: ${v}`)
  return v as Won
}
export function orderId(v: string): OrderId {
  if (!/^ord_[0-9a-z]{16}$/.test(v)) throw new TypeError(`주문 ID 위반: ${v}`)
  return v as OrderId
}

function refund(orderId: OrderId, userId: UserId, amount: Won) { /* ... */ }
// refund(user.id, order.id, -5000) → 컴파일 에러 3개
```

여기서 얻는 건 런타임 검사 하나가 아니라 **검사 지점의 개수를 1로 고정**하는 것이다. `Won` 타입의 값이 존재한다는 사실 자체가 "0 이상의 정수"라는 증명이 된다. Alexis King이 2019년 "Parse, don't validate"에서 정리한 논지가 이것이다. 검증은 통과 여부만 남기고 버려지지만, 파싱은 결과를 타입에 새긴다.

상태 전이 규칙은 판별 유니온으로 옮긴다. 취소 가능 여부를 타입이 표현하면, 배송 완료 주문에 취소를 호출하는 코드는 컴파일되지 않는다.

```ts
// domain/order.ts
type Cancellable = { status: 'pending' | 'paid'; cancelDeadline: Date; id: OrderId }
type Shipped    = { status: 'shipped'; id: OrderId }
export type Order = Cancellable | Shipped

export function cancel(o: Cancellable, at: Date): Order {
  if (at > o.cancelDeadline) throw new DeadlinePassed(o.id)
  return { ...o, status: 'cancelled' } as Order
}
```

앞의 `forceCancel`과 배치 작업은 이제 `Order`를 받아 `Cancellable`로 좁히는 과정을 거치지 않고는 `cancel`을 호출할 수 없다. 마감 검사를 빠뜨릴 자리가 사라진 게 아니라, **빠뜨리려면 명시적으로 타입을 우회해야 하도록** 바뀐 것이다. 이 차이가 리뷰에서 발견 가능한 차이다. 누락은 눈에 띄지 않지만 `as unknown as Cancellable`은 눈에 띈다.

경계에서는 파싱이 필요하다. Zod로 HTTP 입력과 DB 행을 한 번에 도메인 타입으로 바꾼다.

```ts
// app/api/orders/route.ts
const Body = z.object({
  orderId: z.string().regex(/^ord_[0-9a-z]{16}$/).transform(v => v as OrderId),
  amount:  z.number().int().nonnegative().transform(won),
})

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 })
  return Response.json(await refundUseCase(parsed.data))  // 이 안쪽엔 원시 타입이 없다
}
```

**대가를 정직하게 적으면 세 가지다.** 첫째, 직렬화 경계마다 변환 코드가 생긴다. DB에서 읽은 행, 큐에서 받은 메시지, 외부 API 응답 — 각각에 파싱 지점이 필요하고, 이건 순수 오버헤드로 보인다. 둘째, ORM과 마찰이 생긴다. Drizzle이 돌려주는 행은 평범한 객체이고, 판별 유니온으로 좁히려면 별도 매핑 함수가 필요하다. Prisma처럼 생성된 타입을 그대로 쓰는 방식과는 특히 충돌한다. 셋째, 학습 비용이다. `unique symbol` 기반 브랜딩은 팀의 절반이 처음 보는 문법일 수 있고, 규칙을 모르는 사람이 `as Won`으로 우회하면 보증이 전부 무너진다. 브랜딩은 린트 규칙(생성자 외부의 `as Brand` 금지)으로 받쳐주지 않으면 유지되지 않는다.

## 이게 오히려 정답인 경우

- **CRUD 중심 어드민.** 규칙이 "필수 필드가 있는가" 수준이면 불변식이 사실상 없다. 스키마 검증 한 겹이면 충분하고, 값 객체를 얹으면 화면 하나 추가에 파일 네 개를 건드리게 된다.
- **규칙이 거의 없는 파이프라인 서비스.** 수집·변환·적재가 전부인 서비스에서 도메인 모델은 통과 데이터를 두 번 복사하는 비용만 만든다.
- **규칙의 소유자가 외부인 경우.** 세율, 배송비 정책처럼 규칙이 외부 시스템이나 설정에서 오면 그 규칙을 코드 타입에 새기는 것은 오히려 변경을 막는다. 이때는 규칙을 데이터로 두고 절차로 적용하는 편이 맞다.
- **수명이 짧거나 호출 지점이 1개인 규칙.** 위 계산에서 N = 1이면 (1−p)^1이므로, 복제로 인한 누락 위험 자체가 없다.

판단 기준을 한 문장으로 줄이면 이렇다. **행위를 데이터에 붙일 것인가가 아니라, 이 규칙을 어기는 코드를 컴파일러가 막아야 할 만큼 그 규칙이 중요한가를 묻는다.** 결제 금액과 상태 전이는 대개 그렇고, 관리자 메모의 길이 제한은 대개 그렇지 않다.

## 요약

| 항목 | 내용 |
|---|---|
| 증상 | 데이터는 `interface`, 행위는 `service.ts`. 같은 규칙이 호출 지점 수만큼 복제되고 일부에서 누락 |
| 출처 | Martin Fowler "AnemicDomainModel"(2003), *PoEAA*(2002)의 Transaction Script / Domain Model |
| 논쟁 상태 | 합의되지 않음. 직렬화 경계·구조적 타이핑·함수형 스타일이 반대편 논거 |
| 발생 기전 | 불변식 강제 지점이 없으면 검증이 복제된다. (1−p)^N, p=0.05·N=8이면 66% |
| 한계 기준선 | 규칙당 호출 지점 3개 이상, 유스케이스 분기 10개 이상, 규칙 변경 월 1회 이상 |
| 탈출 | branded type, 생성자 단일화, 판별 유니온, 경계에서 parse-don't-validate(Alexis King, 2019) |
| 탈출의 대가 | 경계마다 변환 코드, ORM 마찰, 학습 비용과 `as` 우회 위험 |
| 정답인 경우 | CRUD 어드민, 파이프라인 서비스, 규칙 소유자가 외부, 호출 지점 1개 |

---

**다음 편 — 4편. 아무도 일하지 않는 계층 — Lasagna Architecture와 Leaky Layer**

3편은 규칙을 어디에 둘지를 다뤘다. 4편은 그 규칙을 담은 코드를 어떤 층에 배치할지를 다룬다. 아무 일도 하지 않고 DTO만 옮겨 담는 계층과, 계층을 아예 건너뛰고 Route Handler가 SQL을 직접 쓰는 구조는 정반대로 보이지만 같은 원인에서 나온다. "계층은 몇 개여야 하는가"가 왜 처음부터 잘못된 질문인지, 그리고 계층 대신 무엇을 규칙으로 삼아야 하는지를 다룬다.
