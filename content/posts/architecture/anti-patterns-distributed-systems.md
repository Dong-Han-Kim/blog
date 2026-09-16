---
# 📌 기본 메타데이터
title: '디자인 패턴 전에 알아야 할 안티패턴 — 4편: 분산 시스템'
date: '2026-09-16'
category: 'architecture'
tags: ['Anti-Pattern', 'Architecture', 'Microservices', 'Distributed Systems', 'TypeScript']
description: 'Distributed Monolith, Shared Database, Chatty Services, Nanoservices, Entity Service, Death Star — 경계가 네트워크가 되면서 증폭되는 안티패턴'

# 💬 옵션 필드
draft: false
series: '디자인 패턴 전에 알아야 할 안티패턴'
seriesOrder: 4

# 📚 SEO용
keywords: ['Anti-Pattern', 'Architecture', 'Microservices', 'Distributed Systems', 'TypeScript', '안티패턴', '분산 모놀리스', '마이크로서비스', '공유 데이터베이스', '분산 컴퓨팅의 오류']
---

# 디자인 패턴 전에 알아야 할 안티패턴 — 4편: 분산 시스템

## 시작하며

[3편](/posts/anti-patterns-layers-and-modules)에서는 한 애플리케이션 안에서 계층과 모듈의 경계가 무너지는 모습을 봤다. 이번 편은 그 경계가 **네트워크**가 된 상황이다.

함수 호출은 실패하지 않고, 즉시 끝나고, 공짜다. 네트워크 호출은 셋 다 아니다. L. Peter Deutsch 등이 정리한 "**분산 컴퓨팅의 오류(Fallacies of Distributed Computing)**"는 개발자들이 "네트워크는 신뢰할 수 있다", "지연 시간은 0이다" 같은 잘못된 가정을 무의식중에 한다고 경고한다. 이번 편의 안티패턴은 대부분 이 가정 위에서 자라난다.

20. **Distributed Monolith** — 나눴지만 따로 배포할 수 없는 서비스
21. **Shared Database** — 서비스들이 같은 테이블을 직접 공유
22. **Chatty Services** — 요청 하나에 수십 번의 내부 호출
23. **Nanoservices** — 가치보다 운영 비용이 큰 초소형 서비스
24. **Entity Service** — 명사 단위로 쪼갠 원격 CRUD
25. **Death Star** — 모든 방향으로 얽힌 서비스 의존 그래프

---

## 20. Distributed Monolith

### 정의

**서비스를 물리적으로 나눴지만, 독립적으로 변경하거나 배포할 수 없는 상태**다. 모놀리스의 단점(강한 결합)과 분산 시스템의 단점(네트워크 비용, 장애 전파, 디버깅 난이도)을 동시에 갖는다. 마이크로서비스 전환에서 가장 흔하고, 가장 비싼 실패다.

### 증상

- 배포할 때 **서비스 배포 순서표**가 필요하다
- 기능 하나를 만들면 여러 서비스 저장소에 **동시에** PR이 올라간다
- 도메인 모델이 담긴 **공유 라이브러리**가 있고, 그 버전을 올리면 모든 서비스가 재배포된다
- 한 서비스가 내려가면 나머지도 줄줄이 실패한다

### 냄새나는 코드

```ts
// @company/shared-models — 모든 서비스가 의존하는 패키지
export interface Order {
  id: string;
  userId: string;
  status: "PENDING" | "PAID" | "SHIPPED";
  items: OrderItem[];
  shippingAddress: Address;
}
```

주문 팀이 `status`에 `"REFUNDED"`를 추가한다. 이 타입으로 `switch`를 돌며 모든 경우를 처리하던 배송·정산·알림 서비스가 동시에 영향을 받는다. 서비스는 넷인데 **배포 단위는 사실상 하나**다.

### 처방

**계약은 소비자가 필요한 만큼만 정의한다.** 공유 도메인 모델 대신, 각 서비스가 자기가 읽는 필드만 선언하고 나머지는 무시하는 **Tolerant Reader** 방식을 쓴다.

```ts
// 정산 서비스 — 자기가 필요한 필드만 검증한다
import { z } from "zod";

const OrderPaidEvent = z.object({
  orderId: z.string(),
  amount: z.number(),
  paidAt: z.string().datetime(),
});
// 모르는 필드는 버려진다. 주문 서비스가 필드를 추가해도 정산 서비스는 영향받지 않는다.

export function handleOrderPaid(raw: unknown) {
  const event = OrderPaidEvent.parse(raw);
  return settlementService.record(event);
}
```

그 밖의 처방은 다음과 같다.

- 스키마 변경은 **하위 호환**을 기본 원칙으로 한다. 필드는 추가만 하고, 제거는 사용처가 사라진 뒤에 한다.
- 동기 호출 체인은 가능한 한 **비동기 이벤트**로 바꾼다.
- 경계 자체가 잘못됐다면 **다시 합치는 것**도 정답이다. 모듈 경계를 엄격히 지키는 **모듈러 모놀리스**는 대부분의 팀에게 분산 모놀리스보다 낫다.

### 판단 기준

> "이 서비스 하나만, 다른 서비스와 상의 없이, 오늘 배포할 수 있는가?"

답이 "아니오"라면 이름만 마이크로서비스다.

---

## 21. Shared Database

### 정의

**여러 서비스가 같은 데이터베이스의 같은 테이블을 직접 읽고 쓰는 구조**다. Gregor Hohpe와 Bobby Woolf의 『Enterprise Integration Patterns』는 공유 데이터베이스를 여러 통합 스타일 중 하나로 소개하고, Martin Fowler는 이를 **Integration Database**라 부르며 각 애플리케이션이 자기 데이터베이스를 갖는 **Application Database**와 구분한다. 서비스의 자율성을 목표로 하는 아키텍처에서는 안티패턴이 된다.

### 냄새나는 코드

```ts
// billing-service — 주문 서비스의 테이블을 직접 조회한다
const paidOrders = await db.execute(sql`
  SELECT id, total, status
  FROM order_service.orders
  WHERE status = 'PAID'
    AND paid_at >= ${startOfMonth}
`);
```

주문 팀이 성능 개선을 위해 `status`를 문자열에서 숫자 코드로 바꾸면, 정산 서비스는 **아무 에러 없이 빈 결과**를 반환한다. 테이블 스키마가 **문서화되지 않은 공개 API**가 된 것이다. 주문 팀은 자기 테이블인데도 마음대로 바꿀 수 없다.

### 처방

- **데이터 소유자를 한 서비스로 정한다.** 다른 서비스는 API나 이벤트로만 접근한다.
- 조회 성능이 중요하다면 **읽기 모델을 복제**한다. 소유 서비스가 이벤트를 발행하고, 소비 서비스가 필요한 형태로 자기 DB에 저장한다. 변경 데이터 캡처(CDC) 도구를 쓰는 방법도 있다.
- DB 쓰기와 이벤트 발행의 원자성은 **Transactional Outbox 패턴**으로 보장한다.

```ts
// order-service — 주문 저장과 이벤트 기록을 같은 트랜잭션에서
await db.transaction(async (tx) => {
  await tx.update(orders).set({ status: "PAID", paidAt: now }).where(eq(orders.id, orderId));
  await tx.insert(outbox).values({
    type: "OrderPaid",
    payload: { orderId, amount, paidAt: now.toISOString() },
  });
});
// 별도 워커가 outbox 테이블을 읽어 메시지 브로커로 발행한다
```

- 당장 분리할 수 없다면, 전환기에는 **DB 뷰를 계약으로** 삼아 원본 테이블 변경으로부터 소비자를 보호한다.

### 판단 기준

> "이 테이블의 컬럼 이름을 우리 팀 혼자 결정해서 바꿀 수 있는가?"

---

## 22. Chatty Services

### 정의

**사용자 요청 하나를 처리하기 위해 서비스 간에 잘게 쪼개진 호출이 과도하게 오가는 상태**다. 데이터베이스의 N+1 쿼리 문제가 네트워크 위로 올라간 형태라고 보면 된다.

### 냄새나는 코드

```ts
export async function getOrderHistory(userId: string) {
  const orders = await orderApi.list(userId); // 20건

  for (const order of orders) {
    order.product = await productApi.get(order.productId); // 20번
    order.shipping = await shippingApi.get(order.id);      // 20번
  }
  return orders;
}
```

호출 하나에 30ms가 걸린다면 직렬로 약 1.2초가 추가된다. 가용성도 곱셈으로 떨어진다. 가용성 99.9%인 서비스 세 개를 직렬로 모두 거쳐야 성공하는 요청의 가용성은 0.999³ ≈ **99.7**%다. 호출 경로가 길어질수록 시스템 전체는 가장 약한 고리보다도 약해진다.

### 처방

**1. 배치 API를 제공한다.**

```ts
export async function getOrderHistory(userId: string) {
  const orders = await orderApi.list(userId);
  const productIds = [...new Set(orders.map((o) => o.productId))];
  const orderIds = orders.map((o) => o.id);

  const [products, shippings] = await Promise.all([
    productApi.getMany(productIds),     // 1번
    shippingApi.getByOrderIds(orderIds), // 1번
  ]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const shippingMap = new Map(shippings.map((s) => [s.orderId, s]));

  return orders.map((o) => ({
    ...o,
    product: productMap.get(o.productId),
    shipping: shippingMap.get(o.id),
  }));
}
```

41번의 호출이 3번으로 줄었다.

**2. 필요한 데이터를 미리 복제한다.** 주문 이력에 상품명만 필요하다면, 주문 시점에 상품명을 주문 데이터에 함께 저장하는 것이 더 단순하다. 주문 당시의 상품명을 보존한다는 비즈니스적 이점도 있다.

**3. 경계를 다시 의심한다.** 두 서비스가 **항상 함께 호출된다면**, 원래 하나의 서비스여야 했을 가능성이 높다.

### 판단 기준

분산 트레이싱(OpenTelemetry 등)으로 **요청당 내부 호출 수**를 측정한다. 측정하지 않으면 채티함은 보이지 않는다.

---

## 23. Nanoservices

### 정의

**서비스를 지나치게 잘게 나눠서, 서비스 하나가 주는 가치보다 운영·통신 비용이 더 큰 상태**다. Arnon Rotem-Gal-Oz가 이런 이름으로 경고했다. Chatty Services와 Distributed Monolith의 원인이 되는 경우가 많다.

### 냄새나는 구조

```
services/
├── email-validator/        # 정규식 하나
├── password-hasher/        # bcrypt 호출 하나
├── user-name-formatter/    # 문자열 가공 하나
├── user-creator/           # 위 세 서비스를 순서대로 호출
└── welcome-mail-sender/
```

회원가입 한 번에 네트워크 호출이 다섯 번 발생한다. 서비스마다 배포 파이프라인, 헬스 체크, 로그 수집, 모니터링 대시보드, 알림 설정이 필요하다. 이메일 검증 로직 하나를 위해 이 모든 운영 비용을 지불한다.

### 처방

- **비즈니스 역량(bounded context) 단위로 합친다.** 위 예시는 하나의 "회원" 서비스로 충분하다.
- 재사용하고 싶은 순수 함수는 **서비스가 아니라 라이브러리**로 만든다. 이메일 검증은 네트워크 너머에 있을 이유가 없다.
- 서비스 경계는 **팀 경계와 맞춘다.** 한 팀이 서비스 열 개를 운영하고 있다면 경계가 너무 잘게 나뉘었다는 신호다.

### 판단 기준

> "이 서비스를 독립적으로 배포·확장해서 얻는 이점이, 이 서비스를 운영하는 비용보다 큰가?"

---

## 24. Entity Service

### 정의

**서비스를 명사(엔티티) 단위로 나누고, 각 서비스는 CRUD만 제공하는 구조**다. `UserService`, `ProductService`, `OrderService`가 각자 테이블 하나를 감싸는 형태다. Michael Nygard가 2017년 글에서 이 구조를 안티패턴으로 지목했다.

3편의 **Anemic Domain Model**이 분산 환경으로 옮겨간 모습이다. 엔티티 서비스는 "원격 테이블"일 뿐이고, 실제 비즈니스 로직은 이들을 조율하는 오케스트레이터에 몰린다.

### 냄새나는 코드

```ts
// checkout-orchestrator
export async function checkout(userId: string, productId: string, qty: number) {
  const product = await productService.get(productId);
  if (product.stock < qty) throw new OutOfStockError(productId);

  // 조회와 수정 사이에 다른 요청이 재고를 가져갈 수 있다
  await productService.update(productId, { stock: product.stock - qty });

  const order = await orderService.create({ userId, productId, qty });
  await paymentService.create({ orderId: order.id, amount: product.price * qty });
}
```

두 가지 문제가 있다. 하나는 **경쟁 조건**이다. "재고 확인 → 재고 차감"이 네트워크를 사이에 두고 분리되어 있어서 동시 주문 시 재고가 음수가 될 수 있다. 다른 하나는 **규칙의 위치**다. "재고보다 많이 팔 수 없다"는 규칙이 재고의 주인이 아닌 오케스트레이터에 있다.

### 처방

서비스를 **명사가 아닌 비즈니스 역량(동사)** 단위로 설계한다.

```ts
// inventory-service — 재고 규칙과 원자성을 스스로 책임진다
export async function reserve(productId: string, qty: number, orderId: string) {
  const result = await db
    .update(stock)
    .set({ available: sql`${stock.available} - ${qty}` })
    .where(and(eq(stock.productId, productId), gte(stock.available, qty)))
    .returning();

  if (result.length === 0) throw new OutOfStockError(productId);
  await db.insert(reservations).values({ productId, qty, orderId });
}
```

조건부 UPDATE 하나로 확인과 차감이 원자적으로 처리된다. 여러 서비스에 걸친 흐름(재고 예약 → 결제 → 주문 확정)은 실패 시 보상 작업을 정의하는 **Saga 패턴**으로 조율한다.

### 판단 기준

서비스 API가 `get`, `create`, `update`, `delete`뿐인가? API 이름에 비즈니스 동사(`reserve`, `approve`, `settle`)가 하나도 없다면 엔티티 서비스일 가능성이 높다.

---

## 25. Death Star

### 정의

**서비스 간 의존 관계가 모든 방향으로 얽혀서, 의존 그래프를 그리면 거대한 구체처럼 보이는 상태**다. 대형 기업의 마이크로서비스 의존 그래프 시각화가 컨퍼런스 등에서 공유되면서 퍼진 표현이다. 2편의 Spaghetti Code와 Big Ball of Mud가 분산 환경에서 재현된 모습이라고 할 수 있다.

### 증상

- 서비스 A → B → C → A 같은 **순환 호출**이 존재한다
- 서비스 하나의 장애가 어디까지 번질지 아무도 예측하지 못한다
- 재시도 로직이 순환 경로를 타고 증폭되어 **재시도 폭풍**이 발생한다
- 새 서비스를 만들 때 "누구를 호출해야 하는지" 파악하는 데만 며칠이 걸린다

### 냄새나는 구조

```
order ──→ user ──→ point ──→ order     (순환)
  │                  ↑
  └──→ coupon ──→ user
          │
          └──→ notification ──→ order  (또 순환)
```

### 처방

- **의존 방향 규칙을 정한다.** 예를 들어 "사용자 경험 계층 → 비즈니스 프로세스 계층 → 핵심 데이터 계층"처럼 계층을 두고, 역방향 호출을 금지한다. 3편 Cyclic Dependency의 ADP를 서비스 단위로 적용하는 것이다.
- **결과 통지는 이벤트로 바꾼다.** "포인트 적립 후 주문 서비스에 알린다" 같은 역방향 호출은 대부분 이벤트 발행으로 대체할 수 있다.
- **재시도에는 한도와 지수 백오프를 두고, 서킷 브레이커로 장애 전파를 차단한다.**
- **서비스 카탈로그와 서비스 맵을 유지한다.** 분산 트레이싱 도구가 실제 호출 관계를 자동으로 그려준다. 문서상의 의존 관계가 아니라 **관측된** 의존 관계를 기준으로 삼는다.

---

## 마치며

| 안티패턴 | 앞선 편의 대응 개념 | 핵심 질문 |
|---|---|---|
| Distributed Monolith | Cyclic Dependency (배포 수준) | 이 서비스만 혼자 배포할 수 있는가? |
| Shared Database | Leaky Abstraction (저장소 수준) | 스키마를 우리 팀 혼자 바꿀 수 있는가? |
| Chatty Services | N+1 쿼리, Architecture Sinkhole | 요청당 내부 호출이 몇 번인가? |
| Nanoservices | 2편 Premature Optimization (구조 수준) | 운영 비용보다 이점이 큰가? |
| Entity Service | Anemic Domain Model | API에 비즈니스 동사가 있는가? |
| Death Star | Spaghetti Code, Big Ball of Mud | 의존 방향 규칙이 있는가? |

표에서 보듯 분산 시스템의 안티패턴은 대부분 **한 프로세스 안에서 이미 존재하던 문제**가 네트워크를 만나 증폭된 것이다. 모듈 경계를 제대로 지키지 못하는 팀이 서비스를 나누면 문제가 해결되는 것이 아니라 더 비싸진다. 분산은 목표가 아니라 **비용을 치르고 사는 선택지**다.

마지막 5편에서는 시스템 하나를 넘어서, 여러 시스템 간 통합과 아키텍처를 결정하는 조직에서 나타나는 안티패턴을 다룬다.
