---
# 📌 기본 메타데이터
title: '영속성을 도메인에서 떼어내기 — Repository, Data Mapper, Unit of Work'
date: '2026-09-15'
category: 'backend'
tags: ['Repository', 'Unit of Work', 'Identity Map', 'Drizzle', 'TypeScript']
description: 'Repository만 넣고 Unit of Work를 빠뜨리면 트랜잭션 경계가 사라지는 이유. AsyncLocalStorage로 만든 최소 Unit of Work, Identity Map과 Lazy Load의 대가, 쓰기와 조회 경로의 분리.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 3

# 📚 SEO용
keywords: ['Repository', 'Unit of Work', 'Identity Map', 'Drizzle', 'TypeScript', '백엔드 디자인 패턴']
---

# 영속성을 도메인에서 떼어내기 — Repository, Data Mapper, Unit of Work

## 주문은 취소됐는데 환불 레코드가 없다

Repository를 도입한 코드에서 주문 취소 유스케이스는 보통 이렇게 생긴다.

```ts
// application/cancel-order.ts — Before: 리포지토리마다 자기 트랜잭션을 연다
export async function cancelOrder(id: string) {
  const order = await orderRepo.findById(id)          // 쿼리 1
  const { refund, next } = order.cancel()
  await orderRepo.save(next)                          // 커밋 1
  await refundRepo.insert({ orderId: id, amount: refund })  // 커밋 2
  await inventoryRepo.restock(order.items)            // 커밋 3
}
```

세 줄이 세 개의 독립 트랜잭션이다. 두 번째 줄에서 커넥션이 끊기면 주문은 CANCELED인데 환불 레코드는 없다. 세 번째에서 끊기면 환불은 잡혔는데 재고는 그대로다.

확률로 보면 규모가 잡힌다. 쓰기 단계가 3개이고 단계당 실패율이 0.1%라면, **부분 커밋**은 첫 커밋 이후의 단계에서 실패할 때 발생하므로 2 × 0.001 = 0.2%다. 일 10,000건이면 하루 20건이 불완전한 상태로 남는다. 이건 재시도로 줄지 않는다. 재시도는 실패한 단계만 다시 하거나 전체를 다시 하는데, 전체를 다시 하면 이미 커밋된 단계가 두 번 적용된다.

**Repository를 넣었는데 Unit of Work를 넣지 않으면 트랜잭션 경계가 사라진다.** ORM을 직접 쓸 때는 보이던 경계가, 저장을 리포지토리 뒤로 숨기는 순간 아무도 소유하지 않는 것이 된다.

## 네 개의 패턴이 한 세트로 온다

Fowler의 PoEAA(2002)는 이 영역의 패턴들을 따로 기술하지만, 실제로는 서로를 전제한다.

**Data Mapper** — 도메인 객체와 DB 행 사이를 오가는 변환을 전담하는 층. 핵심은 도메인 객체가 자기가 저장된다는 사실을 모른다는 것이다. 대비되는 것이 **Active Record**로, 여기서는 객체 자신이 `order.save()`를 갖는다. 둘의 차이는 한 문장으로 정리된다. **객체가 자기 저장을 아는가.**

**Repository** — 저장된 객체 집합을 메모리상의 컬렉션처럼 다루게 하는 인터페이스. Data Mapper 위에 얹혀 도메인 쪽 어휘(`findActiveByCustomer`)로 접근을 제공한다.

**Unit of Work** — 하나의 비즈니스 트랜잭션 동안 바뀐 객체들을 추적했다가 한 번에 커밋한다. 여러 Repository의 쓰기를 하나의 DB 트랜잭션으로 묶는 자리다.

**Identity Map** — 같은 요청 안에서 같은 식별자를 두 번 조회하면 **같은 인스턴스**를 돌려준다.

여기서 Eric Evans의 DDD(2003)가 말하는 Repository는 강조점이 다르다. Fowler에게 Repository는 쿼리를 감싸는 층이지만, Evans에게는 **애그리게이트(aggregate, 함께 변경되어야 하는 객체 묶음) 루트 단위로만 접근을 허용하는 장치**다. 애그리게이트마다 리포지토리 하나, 그 안의 자식 객체에는 리포지토리를 두지 않는다는 규칙이 붙는다. 같은 이름이 다른 규칙을 가리키는 셈이라, "Repository 쓰자"는 합의가 실제로는 합의가 아닐 수 있다(1편).

TypeScript 생태계의 배치는 이렇다. TypeORM은 `ActiveRecord`와 `DataMapper` 두 방식을 모두 제공한다. Prisma와 Drizzle은 Active Record가 아니다. 반환값이 평범한 객체라 스스로 저장할 방법이 없고, 저장은 항상 클라이언트나 쿼리 빌더를 통과한다. 다만 둘 다 Data Mapper라고 부르기도 애매한데, 도메인 객체로의 변환은 제공하지 않고 행 모양 그대로 돌려주기 때문이다. 그 변환을 쓰려면 직접 써야 한다.

## Unit of Work를 트랜잭션 컨텍스트로 구현하기

Drizzle에서 트랜잭션은 콜백에 트랜잭션 핸들 `tx`를 넘기는 형태다. 문제는 그 `tx`를 어떻게 세 개의 리포지토리에 전달하느냐다. 명시적으로 넘기면 모든 함수 시그니처에 인자가 하나씩 붙는다. `AsyncLocalStorage`를 쓰면 시그니처는 그대로 둔 채 호출 문맥으로 전파된다.

```ts
// infra/uow.ts — After: AsyncLocalStorage로 트랜잭션 컨텍스트 전파
import { AsyncLocalStorage } from 'node:async_hooks'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
const store = new AsyncLocalStorage<Tx>()

/** 리포지토리는 이 함수만 호출한다. 트랜잭션 밖이면 기본 커넥션으로 떨어진다. */
export function conn(): Tx | typeof db {
  return store.getStore() ?? db
}

/** 유스케이스 하나를 하나의 트랜잭션으로 묶는다. */
export function withUnitOfWork<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction((tx) => store.run(tx, fn))
}
```

리포지토리는 `db` 대신 `conn()`을 쓰도록 한 줄만 바꾼다. 유스케이스는 감싸기만 하면 된다.

```ts
// application/cancel-order.ts — After: 세 쓰기가 하나의 트랜잭션
export function cancelOrder(id: string) {
  return withUnitOfWork(async () => {
    const order = await orderRepo.findById(id)
    const { refund, next } = order.cancel()
    await orderRepo.save(next)
    await refundRepo.insert({ orderId: id, amount: refund })
    await inventoryRepo.restock(order.items)
  })
}

// infra/order-repository.ts — After: db가 아니라 conn()을 쓴다
export const orderRepo = {
  findById: (id: string) => conn().query.orders.findFirst({ where: eq(orders.id, id) }).then(toDomain),
  save: (o: Order) => conn().update(orders).set(toRow(o)).where(eq(orders.id, o.id)),
}
```

부분 커밋 확률은 0.2%에서 0으로 간다. 하루 20건의 불완전 상태가 사라지는 대신, 다음 절의 비용이 붙는다.

## Identity Map과 Lazy Load가 파는 것

Identity Map이 없으면 같은 요청 안에서 `findById('o1')`을 두 번 부를 때 **서로 다른 두 개의 객체**가 생긴다. 한쪽에서 상태를 CANCELED로 바꾸고 다른 쪽에서 배송지를 바꾼 뒤 둘 다 저장하면, 나중에 저장된 쪽이 앞의 변경을 통째로 덮어쓴다. 두 변경 모두 성공 응답을 받았는데 하나만 남는다. 커밋이 하나의 트랜잭션 안에서 일어나도 이 문제는 그대로다. Unit of Work가 트랜잭션 경계를 고치는 동안 Identity Map은 **객체 동일성**을 고친다. 둘은 서로를 대신하지 않는다.

Lazy Load는 다른 거래다. `order.customer`를 쓰는 시점에 알아서 쿼리를 날려주므로 코드에서 로딩 계획이 사라진다. 그 편의의 값은 예측 가능성이다. 목록 화면에서 주문 100건을 조회하고 각각의 `customer`에 접근하면 쿼리가 1 + 100 = 101번 나간다. DB 왕복이 0.8ms면 80.8ms, 조인 한 번이면 6ms 정도다. **13배 차이가 코드 어디에도 적혀 있지 않다.** Lazy Load는 편의를 사고 "이 코드가 쿼리를 몇 번 던지는가"에 대한 답을 판다.

## 인터페이스가 새고, 컨텍스트가 유실된다

**Repository.** 엔티티당 파일이 1개에서 3~5개로 늘고 좁은 인터페이스가 N+1을 숨긴다는 계산은 1편에서 이미 했다. 여기서 더 들어갈 것은 **인터페이스가 새는 지점**이다. 처음엔 `findById` 하나로 시작하지만, 화면 요구가 붙으면 정렬(`findRecentByCustomer`), 페이징(`findPaged(offset, limit)`), 부분 선택(`findSummaries`), 조인(`findWithItems`)이 차례로 인터페이스에 올라온다. 조회 요구 8개가 추가되면 인터페이스·구현체·테스트 더블 세 곳에 각각 반영해야 하므로 24개의 편집 지점이 생긴다. 그리고 이 메서드들은 도메인 어휘가 아니다. `findSummaries`는 애그리게이트를 돌려주지 않고 화면용 데이터를 돌려주므로 Evans식 Repository의 규칙을 이미 어긴 것이다.

> 결론은 분리다. **쓰기 경로는 Repository를 통과하고, 조회 전용 경로는 Repository를 우회한다.** 조회는 도메인 객체가 필요 없다. 화면이 원하는 모양으로 SQL을 짜서 바로 돌려주는 편이 짧고 빠르다.

```ts
// application/queries/order-list.ts — After: 조회는 Repository를 우회한다
export function listOrderSummaries(customerId: string, limit: number) {
  return db
    .select({ id: orders.id, total: orders.total, customerName: customers.name })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(eq(orders.customerId, customerId))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
}
```

쿼리 한 번, 파일 한 개, 도메인 객체 0개다. 이 분리를 제도화한 것이 CQRS이고, 그 가격표는 12편에서 계산한다.

**Unit of Work.** TypeScript/Node에서는 트랜잭션 핸들을 어떻게 옮기느냐가 그대로 비용이 된다. 명시적 전달은 리포지토리 메서드 전부에 `tx` 인자가 붙고, 그 리포지토리를 부르는 모든 호출부가 `tx`를 갖고 있어야 한다. 유스케이스 하나에 리포지토리 3개, 메서드 6개면 시그니처 6개와 호출부 6개가 바뀐다. 대신 트랜잭션 참여 여부가 타입으로 강제된다. `AsyncLocalStorage`는 시그니처를 건드리지 않지만 세 가지를 판다. 첫째, `conn()`이 무엇을 돌려주는지가 호출 스택에 달려 있어 코드만 읽고는 알 수 없다. 둘째, 컨텍스트가 유실되는 경계가 있다. 이벤트 에미터 콜백, 워커 스레드, 일부 커넥션 풀 래퍼를 지나면 `getStore()`가 `undefined`가 되고 **조용히 트랜잭션 밖에서 실행된다**. 실패가 아니라 오작동이라 테스트로 잡기 어렵다. 셋째, 트랜잭션 안에서 외부 HTTP 호출을 하면 그 지연만큼 DB 커넥션이 잡혀 있어 커넥션 풀이 마른다.

**Identity Map.** 요청 동안 조회한 모든 엔티티를 메모리에 들고 있어야 한다. 배치에서 10만 건을 순회하면 10만 개가 맵에 남아 힙이 찬다. 그리고 요청 경계에서 반드시 비워야 한다. Node에서 맵을 모듈 스코프에 두면 프로세스 전체가 공유하게 되어, A 사용자가 읽은 주문을 B 사용자가 받는 사고가 난다. `AsyncLocalStorage` 스코프에 묶거나 요청 미들웨어에서 생성·폐기해야 하고, 이건 또 하나의 생명주기 관리 대상이다.

## 쓰지 말아야 할 때

**읽기 전용 리포팅에 Repository를 넣지 않는다.** 집계 화면·대시보드·엑셀 내보내기는 도메인 객체를 만들 이유가 없다. 위 우회 예제처럼 SQL을 직접 쓰는 쪽이 파일 수도 쿼리 수도 적다.

**엔티티가 소수인 서비스에는 세트 전체가 과하다.** 엔티티 3개에 CRUD뿐이면 Unit of Work가 묶을 대상이 애초에 없다. 쓰기가 항상 한 테이블이면 ORM의 단일 쿼리가 곧 트랜잭션이다.

**ORM이 이미 Unit of Work를 제공하면 그 위에 또 얹지 않는다.** TypeORM의 `EntityManager`나 Prisma의 `$transaction`은 이미 그 역할을 한다. 그 위에 자체 `UnitOfWork` 클래스를 만들면 커밋 주체가 둘이 되어, 바깥 래퍼가 커밋했다고 믿는 시점과 실제 커밋 시점이 어긋난다.

**Identity Map은 필요가 증명된 뒤에 넣는다.** 같은 요청에서 같은 엔티티를 두 번 로드하는 코드가 실제로 있는지부터 확인한다. 유스케이스가 짧으면 그런 경로가 없고, 없으면 메모리 보유와 생명주기 관리만 남는다.

**Active Record를 무조건 배제하지 않는다.** 도메인 규칙이 얕고 테이블 모양이 곧 도메인 모양인 영역에서는 객체가 자기 저장을 아는 것이 파일 수를 크게 줄인다. 2편의 K 계산이 여기서도 적용된다.

## 요약

| 항목 | 내용 |
|---|---|
| 핵심 실패 | Repository만 넣고 Unit of Work를 빠뜨리면 트랜잭션 경계를 아무도 소유하지 않는다 |
| 부분 커밋 | 쓰기 3단계·단계당 실패율 0.1% → 0.2%. 일 1만 건이면 하루 20건 |
| Active Record vs Data Mapper | 객체가 자기 저장을 아는가. TypeORM은 둘 다, Prisma·Drizzle은 Active Record 아님 |
| Repository의 두 정의 | Fowler는 쿼리를 감싸는 층, Evans(2003)는 애그리게이트 단위 접근 제한 |
| Identity Map과 Lazy Load | 전자는 두 인스턴스가 생겨 나중 저장이 앞 변경을 덮어쓰는 문제, 후자는 100건 목록에서 101쿼리 |
| Repository의 대가 | 정렬·페이징·부분 선택·조인이 인터페이스로 샌다. 조회 8개 추가 = 편집 지점 24개 |
| Unit of Work의 대가 | 명시적 전달은 시그니처 오염, `AsyncLocalStorage`는 컨텍스트 유실이 조용한 오작동 |
| 결론 | 쓰기는 Repository, 조회는 우회. 이 분리의 제도화가 CQRS(12편) |

---

**다음 편 — [4편. 같은 말을 네 번 하는 그림들 — Layered, Hexagonal, Onion, Clean](/posts/backend-design-patterns-4-hexagonal-and-friends)**

Repository 인터페이스를 도메인 쪽에 두고 구현을 인프라 쪽에 두는 순간, 의존 방향이 이미 뒤집혀 있었다. 그 뒤집기에 이름을 붙인 그림이 네 개 있고, 대체로 같은 규칙의 다른 그림이다. 네 그림의 실질적 차이를 가려내고, 유스케이스 하나를 추가할 때 만들어야 하는 파일을 실제로 세어 가격표를 붙인다.
