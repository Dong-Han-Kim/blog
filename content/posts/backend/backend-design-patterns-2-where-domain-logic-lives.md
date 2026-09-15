---
# 📌 기본 메타데이터
title: '도메인 로직은 어디에 사는가 — Transaction Script, Domain Model, Table Module'
date: '2026-09-15'
category: 'backend'
tags: ['Transaction Script', 'Domain Model', 'Table Module', 'PoEAA', 'TypeScript']
description: '같은 규칙을 쓰는 유스케이스 수 K로 Transaction Script와 Domain Model의 전환점을 계산하고, Node/TypeScript에서 Table Module이 성립하지 않는 이유를 따진다.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 2

# 📚 SEO용
keywords: ['Transaction Script', 'Domain Model', 'Table Module', 'PoEAA', 'TypeScript', '백엔드 디자인 패턴']
---

# 도메인 로직은 어디에 사는가 — Transaction Script, Domain Model, Table Module

## 취소 로직이 네 곳에 있고, 하나만 고쳤다

주문 취소 요구사항은 대개 셋으로 온다. 취소 가능 기간인지 검사하고, 이미 배송이 시작됐으면 부분 환불액을 계산하고, 주문 상태를 전이시킨다.

문제는 이 요구사항이 한 군데서만 쓰이지 않는다는 점이다. 고객이 직접 취소하는 경로, 상담원이 관리자 화면에서 취소하는 경로, 결제가 최종 실패해 자동 취소되는 경로, 미결제 주문을 만료시키는 배치. 네 개의 진입점이 같은 규칙을 필요로 한다.

각 진입점의 핸들러에 규칙을 그대로 옮겨 적으면 동작은 한다. 그리고 "배송 시작 후에도 24시간 내면 전액 환불"이라는 정책이 추가되는 날, 네 곳 중 세 곳만 고쳐진다. 한 지점당 누락 확률을 10%로 잡으면 한 번의 변경이 네 곳 모두에 정확히 반영될 확률은 0.9⁴ = 65.6%다. 규칙이 분기당 두 번 바뀌면 분기마다 여덟 개의 편집 지점이 생긴다.

**이 편이 답하려는 질문은 "어디에 두는 게 옳은가"가 아니라 "K가 몇일 때 옮겨야 하는가"다.** K는 같은 규칙을 필요로 하는 유스케이스의 수다.

## Fowler가 제시한 세 선택지

Martin Fowler는 *Patterns of Enterprise Application Architecture*(2002)의 Domain Logic Patterns 장에서 세 가지를 나란히 놓았다. 셋은 우열이 아니라 서로 다른 구간의 선택지다.

**Transaction Script** — 요청 하나에 절차 하나를 대응시킨다. 입력을 받고, 검사하고, 계산하고, 저장하고, 응답한다. 위에서 아래로 읽히며 중간에 다른 객체로 넘어가지 않는다. 로직의 단위는 유스케이스다.

**Domain Model** — 데이터와 그 데이터를 다루는 행위를 같은 객체에 둔다. `Order`가 `cancel()`을 갖고, 취소 가능 여부 판단은 `Order` 자신이 한다. 로직의 단위는 개념이고, 유스케이스는 그 개념들을 조립하는 얇은 층이 된다.

**Table Module** — 테이블 하나당 인스턴스 하나가 그 테이블의 **행 집합 전체**를 다룬다. `OrderModule.calculateRefund(orderId)`처럼 식별자를 인자로 받는 메서드들의 모음이다. Domain Model이 행 하나당 객체 하나라면 Table Module은 테이블당 객체 하나다.

Table Module은 .NET의 `DataSet`처럼 **타입이 붙은 레코드셋 추상**이 런타임에 존재하는 환경에서 성립한다. 쿼리 결과가 그 자체로 필터와 변경 추적이 가능한 인메모리 테이블로 돌아오고, 모듈은 거기에 메서드를 붙인다. Node/TypeScript에는 그 자리에 해당하는 표준 자료구조가 없다. Drizzle이나 `pg`가 돌려주는 것은 평범한 객체 배열이고, 변경 추적도 관계 탐색도 딸려 오지 않는다. 그 층을 직접 만들지 않는 한 Table Module은 "식별자를 인자로 받는 함수 모음", 즉 Transaction Script와 구별되지 않는 것으로 수렴한다.

## 같은 요구사항, 두 가지 배치

Transaction Script로 쓴 취소 절차다.

```ts
// app/api/orders/[id]/cancel/route.ts — Before: Transaction Script
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const row = await db.query.orders.findFirst({ where: eq(orders.id, params.id) })
  if (!row) return Response.json({ error: 'not found' }, { status: 404 })

  // 취소 가능 기간 검사
  if (row.status === 'DELIVERED') return Response.json({ error: 'too late' }, { status: 409 })
  if (row.status === 'CANCELED') return Response.json({ error: 'already' }, { status: 409 })

  // 부분 환불 계산
  const shipped = row.status === 'SHIPPING'
  const refund = shipped ? row.total - row.shippingFee : row.total

  await db.update(orders)
    .set({ status: 'CANCELED', refundAmount: refund })
    .where(eq(orders.id, params.id))
  return Response.json({ refund })
}
```

읽는 데 사전 지식이 필요 없다. 위에서 아래로 한 번에 읽히고, 이 요구사항이 여기서 끝난다는 것도 파일 하나로 확인된다. 대신 상담원 취소·자동 취소·배치에도 같은 여섯 줄이 복제된다.

Domain Model로 옮기면 규칙의 소유자가 바뀐다.

```ts
// domain/order.ts — After: Domain Model, 규칙은 Order가 소유한다
export type CancelResult = { refund: number; next: Order }

export class Order {
  constructor(
    readonly id: string,
    readonly status: 'PAID' | 'SHIPPING' | 'DELIVERED' | 'CANCELED',
    readonly total: number,
    readonly shippingFee: number,
  ) {}

  cancel(): CancelResult {
    if (this.status === 'DELIVERED') throw new DomainError('too late')
    if (this.status === 'CANCELED') throw new DomainError('already')
    const refund = this.status === 'SHIPPING' ? this.total - this.shippingFee : this.total
    return { refund, next: new Order(this.id, 'CANCELED', this.total, this.shippingFee) }
  }
}

// app/api/orders/[id]/cancel/route.ts — After: 핸들러는 HTTP만 번역한다
export async function POST(_: Request, { params }: { params: { id: string } }) {
  const order = await repo.findById(params.id)
  if (!order) return Response.json({ error: 'not found' }, { status: 404 })
  const { refund, next } = order.cancel()
  await repo.save(next)
  return Response.json({ refund })
}
```

네 개의 진입점이 모두 `order.cancel()` 한 줄로 줄어든다. 규칙을 고칠 자리는 한 곳이고, 나머지 세 진입점은 고칠 필요조차 없다.

TypeScript에서는 클래스가 필수가 아니다. `cancel(order: Order): CancelResult`라는 순수 함수와 `Order` 타입만으로 같은 배치가 나온다. Domain Model의 본질은 클래스 문법이 아니라 **규칙이 유스케이스가 아니라 개념에 붙어 있다는 사실**이기 때문이다.

## 전환점을 계산해 보면

K를 같은 규칙을 쓰는 유스케이스 수라고 하자. 규칙 본문이 40줄이고, Domain Model 도입에 드는 고정비(엔티티 정의, 도메인↔행 매핑, 테스트 픽스처)가 120줄, 유스케이스당 호출부가 3줄이라고 놓는다.

- Transaction Script: 40K
- Domain Model: 120 + 40 + 3K

두 식이 만나는 지점은 37K = 160, 즉 **K ≈ 4.3**이다. K=4까지는 Transaction Script가 적게 쓰고(160 대 172), K=5부터 뒤집힌다(200 대 175). 숫자 자체는 가정에 달렸지만 형태는 바뀌지 않는다. **Transaction Script의 비용은 K에 비례해 선형으로 늘고, Domain Model의 비용은 고정비 하나에 완만한 기울기가 붙는다.**

테스트 조합에서 차이가 더 벌어진다. 취소 규칙의 분기가 기간 검사 3가지 × 환불 계산 2가지 × 상태 전이 2가지 = 12조합이라면, Transaction Script는 네 절차마다 12조합을 각각 검증해야 해서 48케이스가 된다. Domain Model은 `cancel()`에 12케이스, 각 진입점에 연결 확인 1케이스씩 4개, 합 16케이스다. **3배 차이가 나고, 이 배수는 절차가 늘수록 커진다.**

변경 빈도도 같은 방향으로 작용한다. 규칙이 분기당 2회 바뀌고 K=4면 Transaction Script는 분기마다 8개 지점을 정확히 맞춰야 하고, Domain Model은 2개다.

메커니즘 자체는 단순하다. Domain Model이 하는 일은 **규칙의 정의 지점과 사용 지점을 분리하는 것**이고, 그 분리가 값을 하는 조건은 사용 지점이 여럿일 때뿐이다. 사용 지점이 하나면 분리는 간접 계층 하나를 더한 것에 지나지 않는다. 1편에서 세운 세 통화 중 간접성을 사는 거래이고, 파는 것은 "이 규칙이 실제로 어떤 코드를 도는지"를 호출부만 보고는 알 수 없게 되는 것이다.

여기서 K를 세는 방법도 정해 둘 필요가 있다. 진입점 수가 아니라 **같은 불변식을 지켜야 하는 코드 경로의 수**다. 하나의 HTTP 핸들러 안에서 조건에 따라 취소 규칙을 두 번 적용한다면 K는 2로 센다. 반대로 진입점이 네 개여도 세 개가 나머지 하나를 그대로 호출하는 구조라면 K는 1이다.

## 세 가지 배치가 각각 청구하는 것

**Transaction Script가 파는 것.** 규칙 복제 K개를 일관되게 유지하는 일이 전적으로 사람 손에 달린다. 컴파일러가 잡아주지 않고, 위 계산대로 K=4에서 한 번의 변경이 전부 반영될 확률은 65.6%다. 절차가 길어지면 테스트 조합이 절차 수만큼 곱해져 48케이스 같은 숫자가 나온다. 그리고 절차 하나가 200줄을 넘어가기 시작하면 분기 안에 분기가 쌓이면서 읽히지 않는 상태가 된다. 그 지점의 증상은 [안티패턴 3편](/posts/backend-antipatterns-3-anemic-domain-model)에서 다룬다. 신호는 명확하다. **같은 `if`가 세 번째 파일에 복사되는 순간, 그리고 절차 하나의 분기 깊이가 3을 넘는 순간이다.**

**Domain Model이 파는 것.** 첫째는 ORM 임피던스 불일치다. `Order`가 값 객체를 품고 상태가 유니온 타입이면 테이블 한 줄로 직렬화되지 않아 `toDomain`/`toRow` 매핑 함수 두 개가 엔티티마다 필요해진다. 엔티티 10개면 매핑 함수 20개와 그 테스트다. 둘째는 객체 그래프 로딩이다. `order.customer.grade`를 쓰려면 `customer`를 어디서 채울지 결정해야 하고, 늦게 채우기로 하면 목록 화면에서 조회가 1 + N번 나간다(3편). 셋째는 학습 비용이다. "규칙은 엔티티에 둔다"는 합의가 팀 전체에서 유지되지 않으면 절반은 엔티티에, 절반은 서비스에 들어가 두 배치의 단점만 합쳐진다. 넷째, **엔티티가 순수 CRUD면 클래스만 늘고 메서드는 게터뿐인 상태로 끝난다.** 다섯째는 덜 언급되는 대가인데, 규칙이 객체 그래프에 분산되기 때문에 "이 유스케이스가 무슨 일을 하는가"를 파일 하나로 읽을 수 없게 된다. Transaction Script에서 위에서 아래로 읽히던 40줄이, Domain Model에서는 유스케이스 3줄 + 엔티티 메서드 2개 + 값 객체 1개로 흩어진다. 신규 입사자가 취소 흐름을 파악하는 데 여는 파일이 1개에서 4개로 늘어난다.

**Table Module이 파는 것.** TypeScript 생태계에 레코드셋 추상이 없으므로 변경 추적·집합 연산·타입 안전한 컬럼 접근을 직접 구현해야 한다. 그 구현물은 팀 외부에 설명 가능한 이름이 없고, 유지보수 담당자가 퇴사하면 대체할 라이브러리도 없다. 얻는 이득(집합 단위 계산이 자연스럽다)에 비해 값이 비싸다.

## 쓰지 말아야 할 때

**Domain Model을 CRUD 어드민에 넣지 않는다.** 화면이 폼이고 규칙이 "필수값 검사"뿐이라면 K는 사실상 1이다. 위 계산에서 K=1일 때 Domain Model은 163줄, Transaction Script는 40줄이다. 4배를 더 쓰고 회수되지 않는다.

**Transaction Script를 규칙 밀도가 높은 도메인에 두지 않는다.** 결제·정산·요금 계산처럼 조건이 계속 붙는 영역은 K가 빠르게 커진다. 정산 규칙 하나가 일 정산·월 정산·정정 처리·세금계산서 발행에서 동시에 쓰이면 K=4에서 시작해 늘기만 한다.

**Table Module은 Node/TypeScript에서 선택지로 올리지 않는다.** 다만 이름은 알아둘 값이 있다. 레거시 .NET 시스템을 인수인계받았을 때 `DataSet` 기반 코드가 무엇을 하려던 것인지 읽히기 때문이다.

**세 패턴을 한 서비스 안에서 섞는 것은 정상이다.** 주문·정산은 Domain Model로, 공지사항 관리와 통계 조회는 Transaction Script로 가는 배치가 K 계산상 가장 값이 싸다. 균일하게 가야 한다는 규칙은 어디에도 없다.

## 요약

| 항목 | 내용 |
|---|---|
| 판단 기준 | 같은 규칙을 쓰는 유스케이스 수 K, 유스케이스당 분기 수, 규칙 변경 빈도 |
| 전환점 | 예시 가정에서 K ≈ 4.3. K≤4면 Transaction Script, K≥5면 Domain Model |
| 비용 형태 | Transaction Script는 K에 선형, Domain Model은 고정비 + 완만한 기울기 |
| Transaction Script의 대가 | 규칙 복제 K개, 변경 누락 확률 34%(K=4, 지점당 10%), 테스트 조합이 절차 수만큼 곱해짐 |
| Domain Model의 대가 | 엔티티당 매핑 함수 2개, 객체 그래프 로딩 결정, 팀 합의 유지 비용 |
| Table Module의 대가 | TS에 레코드셋 추상이 없어 직접 구현. 대체 라이브러리 없음 |
| 오용 | Domain Model을 CRUD 어드민에, Transaction Script를 정산 도메인에 |
| 혼용 | 도메인별로 다른 패턴을 쓰는 것이 K 계산상 최적인 경우가 많다 |

| 패턴 | 유리한 조건 | 핵심 대가 | TS 생태계 적합도 |
|---|---|---|---|
| Transaction Script | K ≤ 4, 분기 깊이 ≤ 2, 규칙 변경이 드묾 | 규칙 복제와 테스트 조합 폭발 | 높음 — 추가 도구 불필요 |
| Domain Model | K ≥ 5, 규칙이 계속 추가됨 | 매핑 비용, 그래프 로딩, 학습 비용 | 중간 — 클래스 또는 순수 함수 모두 가능 |
| Table Module | 집합 단위 계산이 지배적 | 레코드셋 층을 직접 구현 | 낮음 — 표준 추상 부재 |

---

**다음 편 — [3편. 영속성을 도메인에서 떼어내기 — Repository, Data Mapper, Unit of Work](/posts/backend-design-patterns-3-persistence-patterns)**

Domain Model을 고른 순간 매핑과 그래프 로딩이라는 청구서가 따라온다. Repository만 넣고 Unit of Work를 빠뜨렸을 때 유스케이스 하나가 어떻게 부분 커밋되는지를 확률로 계산하고, Drizzle과 `AsyncLocalStorage`로 최소 구현을 만들어 본다.
