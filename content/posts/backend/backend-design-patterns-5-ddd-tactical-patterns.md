---
# 📌 기본 메타데이터
title: '도메인을 말하는 어휘 — 값 객체, 엔티티, 애그리게이트, 도메인 이벤트'
date: '2026-09-15'
category: 'backend'
tags: ['DDD', 'Aggregate', 'Value Object', 'Domain Event', 'TypeScript', 'Trade-Off']
description: '값 객체·엔티티·애그리게이트·도메인 이벤트가 검증 지점을 줄이는 방식. 애그리게이트 크기와 동시성 충돌의 교환, 판별 유니온 대안, 경계 없이 전술 패턴만 사면 손해인 이유.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 5

# 📚 SEO용
keywords: ['DDD', 'Aggregate', 'Value Object', 'Domain Event', 'TypeScript', 'Trade-Off', '백엔드 디자인 패턴']
---

# 도메인을 말하는 어휘 — 값 객체, 엔티티, 애그리게이트, 도메인 이벤트

이 편은 DDD의 **전술 패턴(tactical patterns)만** 다룬다. 즉 하나의 프로세스, 하나의 모듈 안에서 도메인을 표현하는 어휘다. 경계를 어디에 긋는가 하는 전략 패턴 — Bounded Context와 Context Mapping — 은 3막의 10편에서 따로 다룬다. 이 순서의 이유는 5절에서 이 편의 가장 큰 경고로 돌아온다.

## 이 타입은 존재할 수 없는 주문을 표현할 수 있다

주문 도메인은 대개 이렇게 시작한다.

```ts
// types/order.ts — Before: 원시 타입 덩어리
export interface Order {
  id: string
  status: string
  items: { sku: string; qty: number; price: number }[]
  currency: string
  discount: number
  paidAt: Date | null
}
```

짧고 읽기 쉽다. 문제는 이 타입이 **실제로는 불가능한 주문을 얼마든지 표현할 수 있다**는 것이다.

`status: 'shipped'`인데 `paidAt: null`인 값이 타입 검사를 통과한다. `qty: -3`도, `items: []`인 주문도, `price` 합보다 큰 `discount`도 통과한다. `currency`가 항목마다 달라도 컴파일러는 아무 말을 하지 않는다.

이런 조합을 막는 코드는 어딘가에 있어야 하므로 검증이 생성 지점마다 복제된다. 결제 콜백 핸들러에 한 벌, 어드민 수정 API에 한 벌, 배치 정정 스크립트에 한 벌. 세 벌이 되는 순간 그중 하나는 반드시 뒤처진다. 규칙을 데이터 바깥에 두는 구조가 어떻게 무너지는지는 [안티패턴 3편](/posts/backend-antipatterns-3-anemic-domain-model)(Anemic Domain Model)에서 다뤘다.

> 타입이 표현할 수 있는 값의 집합이 도메인이 허용하는 값의 집합보다 크면, 그 차집합을 막는 일이 런타임 코드의 몫으로 영원히 남는다.

## 네 개의 어휘, 그리고 그것들을 묶는 경계

Eric Evans가 『Domain-Driven Design』(2003)에서 정리한 전술 패턴은 이 차집합을 줄이는 어휘다. 네 개만 있으면 대부분이 설명된다.

**값 객체(Value Object)** 는 동일성이 값으로 결정되는 것이다. 5,000원과 5,000원은 같다. ID가 없고, 불변이며, 자기 유효성을 스스로 책임진다. `Money`, `Email`, `DateRange`, `Quantity`가 전형이다. 실질적 효과는 하나다. **생성자를 통과한 값은 이미 유효하다**는 보장을 타입에 새기는 것.

**엔티티(Entity)** 는 동일성이 ID로 결정되는 것이다. 배송지 주소가 바뀌어도 같은 주문이고, 상태 변화의 궤적 자체가 의미를 갖는다. 구분이 흐려지는 지점은 `Address`에 DB 기본키가 붙는 순간이다. 저장 편의로 생긴 ID를 동일성으로 착각하면, 주소를 수정하는 경로와 교체하는 경로가 둘 다 열려 공유 참조 버그가 들어온다. **판단 기준은 ID의 유무가 아니라 "바뀌었을 때 같은 것으로 취급해야 하는가"다.**

**애그리게이트(Aggregate)** 가 이 편의 중심이다. 정의를 좁게 잡는다.

> 애그리게이트는 **하나의 트랜잭션 안에서 불변식을 강제할 수 있는 최소 경계**다.

경계 안에는 루트 엔티티 하나와 그것이 소유한 엔티티·값 객체가 있고, 바깥은 루트를 통해서만 안을 건드린다. Vaughn Vernon이 『Implementing Domain-Driven Design』(2013)에서 정리한 애그리게이트 규칙 가운데 세 가지가 그대로 쓰인다.

1. 애그리게이트 밖의 것은 객체 참조가 아니라 **ID로만** 참조한다.
2. 하나의 트랜잭션은 **하나의 애그리게이트만** 수정한다.
3. 애그리게이트 사이의 정합성은 즉시가 아니라 **최종 일관성**으로 맞춘다.

**도메인 이벤트**는 3번 규칙의 운반 수단이다. 주문 애그리게이트가 결제 완료를 커밋하면서 `OrderPaid`를 남기고, 재고 애그리게이트는 그것을 받아 자기 트랜잭션에서 차감한다. 2003년 원전 목록에는 없던 어휘가 지금은 전술 패턴의 일부로 다뤄진다. 이 이벤트를 DB 커밋과 함께 신뢰성 있게 내보내는 방법 — Transactional Outbox — 은 11편이다.

나머지 둘은 보조다. **도메인 서비스**는 어느 엔티티에도 자연스럽게 속하지 않는 규칙 — 환율 변환처럼 두 애그리게이트에 걸친 계산 — 을 담는 자리다. 남용하면 규칙이 전부 서비스로 빠져나가 Anemic Domain Model로 되돌아간다. **Specification**은 "취소 가능한 주문" 같은 조건을 객체로 만들어 검증과 조회가 같은 규칙을 쓰게 한다. GoF가 아니라 Evans 계열의 패턴이다.

## 경계를 좁힐수록 불변식이 싸진다

값 객체와 애그리게이트가 실제로 하는 일은 **검증 지점의 개수를 줄이는 것**이다. 통화 일치 규칙이 값을 만드는 모든 경로에 있어야 했다면, 아래에서는 한 곳에 있다.

```ts
// domain/order/money.ts — After: 값 객체는 생성 시점에 유효성을 닫는다
export class Money {
  private constructor(readonly amount: number, readonly currency: 'KRW' | 'USD') {}

  static of(amount: number, currency: 'KRW' | 'USD'): Money {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('invalid amount')
    return new Money(amount, currency)
  }
  add(other: Money): Money {
    if (other.currency !== this.currency) throw new Error('currency mismatch')
    return new Money(this.amount + other.amount, this.currency)
  }
}

// domain/order/order.ts — After: 애그리게이트 루트가 상태 전이를 독점한다
export class Order {
  private events: DomainEvent[] = []
  private constructor(readonly id: OrderId, private status: OrderStatus, private items: OrderItem[]) {}

  total(): Money {
    return this.items.reduce((acc, i) => acc.add(i.subtotal()), Money.of(0, 'KRW'))
  }
  markPaid(at: Date): void {
    if (this.status !== 'pending') throw new Error(`cannot pay in ${this.status}`)
    if (this.items.length === 0) throw new Error('empty order')
    this.status = 'paid'
    this.events.push({ type: 'OrderPaid', orderId: this.id, at })
  }
  pullEvents(): DomainEvent[] {
    const e = this.events
    this.events = []
    return e
  }
}
```

검증 경로가 3개에서 1개로 줄면 누락 확률도 그만큼 준다. 생성자를 `private`으로 막고 `static of`만 열어두는 것이 이 효과의 전부다.

애그리게이트 규칙 2번이 통하는 이유는 더 계산적이다. 낙관적 잠금에서 충돌 확률은 대략 **해당 애그리게이트의 초당 수정 요청 수 × 트랜잭션 점유 시간**에 비례한다. 상품 재고를 주문 애그리게이트 안에 넣었다고 하자. 인기 상품 하나에 초당 20건의 주문이 몰리고 트랜잭션이 50ms를 잡으면 20 × 0.05 = 1.0, 즉 평균적으로 한 건이 항상 다른 건과 겹친다. 재고를 별도 애그리게이트로 떼고 주문은 이벤트로 통지하면, 주문 쪽 경합은 개별 주문 단위로 흩어져 사실상 0에 수렴한다.

반대 방향의 대가도 같은 식으로 계산된다. 경계를 크게 잡아 주문·배송이력·정산을 한 애그리게이트에 넣으면, 상태 한 글자를 바꾸는 요청도 전부를 로드해야 한다. 주문 1행 + 품목 8행 + 배송이력 12행 + 정산 6행 = 27행. 주문만 잡으면 9행. **같은 수정에 로드가 3배**다. 크게 잡으면 불변식은 공짜로 지켜지고 동시성과 I/O가 비싸지며, 작게 잡으면 정확히 반대가 된다. 애그리게이트 설계는 이 둘 사이의 선택이지 정답 찾기가 아니다.

## 청구서 — 파일 열한 개와 경계마다의 변환

**파일과 클래스 수.** 엔티티 하나는 혼자 오지 않는다. 주문 하나에 `OrderId`, `Money`, `Quantity`, `Address`, `OrderStatus`까지 값 객체 5개가 따라붙는다. 여기에 루트, 도메인 이벤트 타입, 리포지토리 인터페이스, 영속성 매핑까지 세면 파일 9~11개다. Before는 타입 하나와 핸들러 하나, 2개였다. **엔티티 하나당 파일이 5배 안팎으로 늘어난다.**

**ORM 매핑 비용.** 값 객체는 DB 테이블에 그대로 앉지 않는다. `Money` 하나가 두 컬럼으로 펼쳐지고, 펼치고 접는 코드는 사람이 쓴다.

```ts
// infra/order/mapper.ts — After: 값 객체를 컬럼으로 펼치고 접는다
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
  status: text('status').$type<OrderStatus>().notNull(),
  totalAmount: integer('total_amount').notNull(),   // Money.amount
  totalCurrency: text('total_currency').notNull(),  // Money.currency
})

export function toDomain(row: typeof orders.$inferSelect, items: ItemRow[]): Order {
  return Order.restore(OrderId.of(row.id), row.status, items.map(toItem))
}
export function toRow(o: Order) {
  const t = o.total()
  return { id: o.id.value, status: o.status, totalAmount: t.amount, totalCurrency: t.currency }
}
```

Drizzle에는 값 객체를 컬럼 묶음으로 선언하는 기능이 없으므로 이 매핑은 값 객체 종류마다 양방향 두 함수씩 손으로 쌓인다. 값 객체 5종이면 변환 함수 10개, 그리고 그 10개에 대한 테스트다.

**경계마다의 변환 횟수.** 쓰기 요청 하나가 도는 경로를 세어 보면 변환이 네 번이다. ① HTTP JSON을 Zod로 파싱해 값 객체로, ② 도메인 객체를 DB 행으로, ③ 읽어온 행을 다시 도메인 객체로, ④ 도메인 객체를 응답 DTO로. Before에서는 JSON을 그대로 받아 넣고 돌려줬으므로 0번이었다. 이 네 번은 CPU 비용보다 **유지보수 표면적**으로 청구된다. 필드 하나를 추가하면 고쳐야 할 곳이 네 군데다.

**조인 한 번이 로드 여러 번으로 쪼개진다.** 규칙 1번(밖은 ID로만 참조)을 지키면 주문 화면에 필요한 회원 등급과 쿠폰 정보를 조인으로 한 번에 가져올 수 없다. 주문 로드 → 회원 로드 → 쿠폰 로드로 왕복 3회가 된다. 목록 화면에서 이 규칙을 순진하게 적용하면 N+1이 된다. 해법은 조회 경로를 애그리게이트에서 분리해 읽기 전용 쿼리로 내리는 것이고, 그 끝에 CQRS(12편)가 있다. **전술 패턴을 제대로 지키면 읽기 모델을 따로 만들어야 하는 압력이 반드시 생긴다.** 이게 이 패턴군의 숨은 비용 중 가장 큰 항목이다.

**용어 합의 비용.** "애그리게이트 루트를 통해서만"이라는 규칙은 코드 리뷰에서 매번 강제해야 유지된다. 규칙을 모르는 사람이 쓴 코드가 한 번 머지되면 그것이 다음 사람의 본보기가 된다. 도입 결정에는 리뷰 규약과 신규 합류자 온보딩 비용이 포함돼야 한다.

## 클래스가 아니라 타입으로 사도 된다, 그러나

TypeScript에는 세 번째 선택지가 있다. 클래스 없이 branded type과 판별 유니온(discriminated union)으로 같은 보장을 얻는 방식이다.

```ts
// domain/order/state.ts — After(대안): 클래스 없이 타입으로 상태 전이를 막는다
type Brand<T, B> = T & { readonly __brand: B }
export type Email = Brand<string, 'Email'>

export const Email = {
  parse: (v: string): Email => {
    if (!/^[^@\s]+@[^@\s]+$/.test(v)) throw new Error('invalid email')
    return v as Email
  },
}

export type Order =
  | { status: 'pending'; id: OrderId; items: OrderItem[] }
  | { status: 'paid'; id: OrderId; items: OrderItem[]; paidAt: Date }
  | { status: 'shipped'; id: OrderId; items: OrderItem[]; paidAt: Date; trackingNo: string }

// paid가 아닌 주문에 trackingNo를 붙이는 코드는 컴파일되지 않는다
export function ship(o: Extract<Order, { status: 'paid' }>, trackingNo: string): Order {
  return { ...o, status: 'shipped', trackingNo }
}
```

판별 유니온은 클래스가 런타임에 던지던 예외를 **컴파일 시점으로 옮긴다.** `status: 'shipped'`인데 `paidAt`이 없는 값은 아예 타입으로 만들 수 없어, 서두의 Before가 가졌던 차집합이 사라진다. 직렬화도 얇아진다. 값이 평범한 객체라 `JSON.stringify` 결과가 그대로 쓸 만하고, Zod 파싱 결과에 브랜드만 붙여 도메인으로 승격시킬 수 있다.

대가는 두 가지다. 첫째, 동작이 데이터와 같은 자리에 있지 않다. `ship`은 모듈 함수이고 `Order` 값에는 `.ship()`이 없으므로, IDE의 자동완성이 "이 주문으로 무엇을 할 수 있는가"를 알려주지 않는다. 둘째, branded type의 보장은 **컴파일 시점에만 있다.** `v as Email` 캐스팅 한 줄이면 우회되고, 팀 규약 외에 그것을 막을 장치가 없다. 클래스의 `private constructor`도 컴파일 후에는 사라지므로, 우회가 조금 더 눈에 띌 뿐 같은 한계를 갖는다.

선택 기준은 이렇다. 상태가 3개 이상이고 전이 규칙이 얽혀 있으면 판별 유니온이, 불변식이 필드 사이 산술 관계(합계, 잔액, 한도)에 걸려 있으면 메서드를 가진 클래스가 이긴다.

## 전술 패턴만 사는 것이 손해인 경우

**CRUD 어드민.** 필드를 그대로 받아 그대로 저장하는 화면에서 값 객체는 순수한 비용이다. 규칙이 없으므로 강제할 불변식도 없고, 남는 것은 변환 네 번과 파일 열한 개다.

**파이프라인·ETL 서비스.** 입력 스키마를 검증하고 형식을 바꿔 다음 단계로 넘기는 일에는 애그리게이트가 필요 없다. 여기서 필요한 건 경계에서의 파싱(Zod)이지 도메인 모델이 아니다. 값 객체 하나 정도가 적정선이다.

**도메인이 아직 불확실한 초기 제품.** 애그리게이트 경계는 **불변식이 확정된 뒤에야 그을 수 있다.** 규칙이 주마다 바뀌는 단계에서 경계를 그으면, 경계를 다시 긋는 리팩터링이 규칙 변경마다 따라붙는다. 이 구간에서는 규칙이 어디에 있는지 한눈에 보이는 얇은 구조가 낫다(2편 Transaction Script).

그리고 이 편의 가장 큰 경고다.

> **전술 패턴만 도입하고 경계를 긋지 않으면 얻는 것이 거의 없다.**

한 모듈 안의 모든 것을 애그리게이트로 감쌌는데 그 모듈이 다른 모듈 열 개와 서로를 자유롭게 부르고 있다면, 규칙을 강제하는 벽은 여전히 없고 파일 수만 5배가 된 것이다. 경계(10편) 없이 도입된 전술 패턴은 **값 객체로 장식한 Anemic Domain Model**로 끝난다.

흔한 오용 하나. 규칙 2번을 어기고 한 트랜잭션에서 두 애그리게이트를 수정하기 시작하면, 경계는 문서상의 선일 뿐이고 실제로는 하나의 큰 트랜잭션 덩어리가 된다. 이 상태로 서비스를 쪼개면 분산 트랜잭션 문제로 직행한다([안티패턴 11편](/posts/backend-antipatterns-11-dual-write-and-2pc)).

## 요약

| 항목 | 내용 |
|---|---|
| 해결하는 문제 | 타입이 표현 가능한 값의 집합이 도메인이 허용하는 집합보다 클 때 생기는 검증 중복 |
| 애그리게이트 정의 | 하나의 트랜잭션 안에서 불변식을 강제할 수 있는 최소 경계 |
| 설계 규칙 | 밖은 ID로 참조 / 한 트랜잭션에 한 애그리게이트 / 사이는 최종 일관성 |
| 크기의 교환 | 크게 잡으면 불변식이 싸지고 경합과 로드가 비싸진다(예: 로드 9행 → 27행) |
| 가격표 | 엔티티당 파일 2개 → 9~11개, 변환 4회, 조인 1회 → 로드 3회 |
| 숨은 비용 | 규칙을 지킬수록 읽기 모델을 분리해야 하는 압력이 생긴다(12편) |
| TS 대안 | branded type + 판별 유니온. 컴파일 시점 보장이 강하고 발견 가능성이 약하다 |
| 쓰지 말 때 | CRUD 어드민, ETL, 규칙이 미확정인 초기 제품, 경계를 긋지 않을 때 |

---

**다음 편 — [6편. 변하는 것을 갈아끼우기 — 백엔드에서 살아남은 GoF](/posts/backend-design-patterns-6-gof-in-the-backend)**

GoF 23개 중 백엔드 서버 코드에서 실제로 값을 하는 것은 소수이고, 나머지가 열등해서가 아니라 1994년의 맥락이 지금과 다르기 때문이다. 살아남은 것들의 서식지를 하나씩 지목하고, TypeScript에서는 그중 몇 개가 클래스 없이 함수 몇 줄로 줄어드는지를 나란히 놓고 센다.
