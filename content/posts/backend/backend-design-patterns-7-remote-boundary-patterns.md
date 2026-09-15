---
# 📌 기본 메타데이터
title: '원격 경계의 문법 — Remote Facade, DTO, API Composition, BFF'
date: '2026-09-15'
category: 'backend'
tags: ['Remote Facade', 'DTO', 'API Composition', 'BFF', 'API Design']
description: '원격 경계에서 왕복 횟수·내부 구조 유출·흩어진 데이터·클라이언트별 요구를 다루는 네 패턴. 가용성 산술로 본 부분 실패 처리와 필드 하나당 늘어나는 매핑 지점.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 7

# 📚 SEO용
keywords: ['Remote Facade', 'DTO', 'API Composition', 'BFF', 'API Design', '백엔드 디자인 패턴']
---

# 원격 경계의 문법 — Remote Facade, DTO, API Composition, BFF

1막(2~6편)의 패턴들은 전부 한 프로세스 안에서 성립했다. 호출은 나노초 단위였고, 실패는 예외 하나였고, 인터페이스를 잘못 설계해도 리팩터링으로 되돌릴 수 있었다. 여기서부터 셋 다 깨진다.

## 도메인 객체를 그대로 내보낸 날

주문 상세 API를 만든다. 도메인 객체가 이미 있으니 그대로 던진다.

```ts
// app/api/orders/[id]/route.ts — Before: 도메인 객체를 그대로 직렬화
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const order = await orderRepo.findById(params.id) // Order 애그리게이트
  return Response.json(order)
}
```

세 가지가 동시에 깨진다.

첫째, 내부 필드가 나간다. `Order`에는 `internalRiskScore`, `settlementBatchId`, 취소된 결제 시도 이력이 들어 있고, 화면에 안 그려도 네트워크 탭에는 전부 찍힌다. 둘째, 스키마 변경이 곧 API 파괴다. `Order.status`를 문자열에서 상태 객체로 리팩터링하는 순간 이유를 모르는 소비자 앱이 깨진다. 내부 리팩터링과 외부 계약 변경이 같은 커밋에 묶인 상태다. 셋째, `Order.customer.orders[0].customer`처럼 양방향 참조가 있으면 `JSON.stringify`가 순환 참조로 던진다.

여기에 하나 더 붙는다. 이 API가 "필요한 것만 주자"는 요구를 받아 잘게 쪼개지기 시작하면 반대 방향으로 무너진다. 목록 50건을 그리는 화면이 건별로 배송 상태·재고·리뷰 수를 따로 조회하면 왕복은 50 × 3 = 150회다. RTT 5ms라면 직렬 기준 150 × 5 = 750ms가 네트워크 대기만으로 소모된다. 브라우저 커넥션 6개로 병렬화해도 150 ÷ 6 × 5 = 125ms이고, 그만큼 서버 커넥션과 인증 검사도 150회 반복된다.

## 네 개의 패턴이 같은 경계를 다룬다

**Remote Facade**는 Fowler가 PoEAA(2002)에서 정리한 패턴이다. 원격 경계에는 굵은 입자(coarse-grained) 인터페이스를 두라는 것. 도메인 객체의 세밀한 getter/setter를 그대로 원격 노출하지 말고, 화면이나 유스케이스 하나가 필요로 하는 만큼을 한 번에 주고받는 큰 연산 하나로 감싼다. 위의 150회를 1회로 줄이면 750ms가 5ms가 된다. Facade 자체에는 로직이 없다 — 오직 입자 크기를 바꾸는 것이 역할이다.

**DTO**(Data Transfer Object)는 그 굵은 호출이 실어 나르는 자료구조다. 도메인 모델과 별도로 정의한 전용 타입이고, 동작이 없다. 도메인 객체를 그대로 쓰지 않는 이유는 취향이 아니라 **수명이 다르기 때문**이다. 이 부분은 다음 절에서 따로 다룬다.

TypeScript에서 DTO는 클래스가 필요 없다. PoEAA 시절 Java의 DTO가 클래스였던 것은 직렬화 프레임워크가 클래스를 요구했기 때문이고, `JSON.stringify`에는 그런 제약이 없다. `type OrderResponse = { ... }` 한 줄과 매핑 함수 하나면 같은 역할을 한다. 런타임 검증이 필요하면 Zod 스키마를 두고 타입을 추론해 쓴다.

**API Composition**은 여러 서비스에 흩어진 데이터를 한 응답으로 합치는 조합자다. 주문 정보는 주문 서비스, 배송 상태는 물류 서비스, 리뷰 수는 리뷰 서비스에 있을 때 누군가는 셋을 불러 합쳐야 한다. 그 "누군가"를 어디에 두느냐가 선택지다. 게이트웨이에 두면 게이트웨이가 도메인을 알게 되고, 전용 조합 서비스를 두면 서비스가 하나 늘고, 클라이언트에 두면 위의 150회 문제로 돌아간다.

**Backend for Frontend**는 클라이언트 종류별로 전용 백엔드를 두는 구조다. SoundCloud에서 나온 것으로 알려졌고 Sam Newman의 글로 퍼졌다. 하나의 범용 API가 모바일과 웹을 동시에 만족시키지 못하는 이유는 셋이다. 페이로드 크기(모바일은 필드 3개면 되는데 웹 관리자 화면은 30개가 필요하다), 왕복 횟수(모바일 네트워크의 RTT는 5ms가 아니라 100ms를 넘는다), 응집 단위(웹은 리소스 단위, 모바일은 화면 단위가 편하다).

| 패턴 | 해결하는 것 | 추가되는 것 |
|---|---|---|
| Remote Facade | 왕복 횟수 | 경계 전용 인터페이스 1벌 |
| DTO | 내부 구조 유출, 계약 고정 | 타입 + 매핑 함수 |
| API Composition | 흩어진 데이터 | 부분 실패 처리 책임 |
| BFF | 클라이언트별 상충 요구 | 배포 단위 1개/클라이언트 |

## 두 개의 시계가 다르게 간다

이 패턴들이 통하는 이유는 하나로 수렴한다. **경계 안쪽과 바깥쪽은 변경 주기가 다르다.**

내부 구조는 리팩터링으로 수시로 바뀐다. 필드 이름을 바꾸고, 타입을 쪼개고, 테이블을 정규화한다. 이 변경의 비용은 내 저장소 안에서 끝난다. 반면 외부 계약은 소비자 수만큼 조율 비용이 든다. 소비자가 3개면 배포 순서를 맞춰야 하고, 소비자가 앱 스토어를 거치는 모바일이면 구버전이 몇 달씩 남는다.

DTO는 이 두 속도 사이에 완충을 넣는 장치다. 내부 타입이 바뀌어도 매핑 함수만 고치면 외부 계약은 그대로다. 반대로 외부 계약에 필드를 더해야 할 때 내부를 건드리지 않고 매핑에서 계산해 채울 수 있다. **두 시계를 물리적으로 분리하는 지점이 매핑 함수 한 줄이다.**

Remote Facade의 효과는 산술로 바로 나온다. 왕복 150회에서 1회로 줄면 네트워크 대기가 750ms에서 5ms가 된다. 페이로드도 같이 준다. 도메인 객체 그대로가 1건당 1.2KB이고 DTO가 0.3KB라면 50건에서 60KB 대 15KB이고, 1.5Mbps 회선에서 전송 시간은 320ms 대 80ms다(60 × 8 ÷ 1500 × 1000 = 320).

API Composition의 가용성 산술도 명시해 둘 필요가 있다. 각 서비스 가용성이 99.9%일 때 셋 모두를 필수로 요구하면 0.999³ = 99.70%이고, 월 다운타임은 30 × 24 × 60 × 0.003 = 약 130분이다. 부분 실패를 허용해 핵심 하나만 필수로 두면 99.9%를 유지하고 월 43분이다. **부분 실패 처리는 선택이 아니라 가용성 계산의 결과다.**

이 산술이 코드에서 어떤 형태가 되는지 보면 차이가 분명하다.

```ts
// app/api/orders/[id]/route.ts — Before: 하나만 죽어도 전체가 실패한다
const [order, shipment, reviews] = await Promise.all([
  orderApi.get(id),
  shipmentApi.getByOrder(id),
  reviewApi.countByOrder(id),
])
return Response.json({ ...order, shipment, reviewCount: reviews.count })
```

`Promise.all`은 하나가 reject하면 즉시 reject한다. 리뷰 수를 못 가져왔다는 이유로 주문 상세 전체가 500이 된다. 가용성은 0.999³ = 99.7%로 떨어진다.

```ts
// app/api/orders/[id]/route.ts — After: 부분 실패를 계약에 반영한다
type OrderDetailResponse = {
  id: string
  totalAmount: number
  shipment: ShipmentDto | null   // 물류 서비스 실패 시 null
  reviewCount: number | null     // 리뷰 서비스 실패 시 null
  degraded: Array<'shipment' | 'reviews'>  // 어느 부분이 비었는지 명시
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const order = await orderApi.get(params.id) // 필수: 실패하면 전체 실패
  const [shipment, reviews] = await Promise.allSettled([
    withTimeout(shipmentApi.getByOrder(params.id), 300),
    withTimeout(reviewApi.countByOrder(params.id), 200),
  ])

  const degraded: OrderDetailResponse['degraded'] = []
  if (shipment.status === 'rejected') degraded.push('shipment')
  if (reviews.status === 'rejected') degraded.push('reviews')

  const body: OrderDetailResponse = {
    id: order.id,
    totalAmount: order.totalAmount,           // 내부 필드는 여기서 걸러진다
    shipment: shipment.status === 'fulfilled' ? toShipmentDto(shipment.value) : null,
    reviewCount: reviews.status === 'fulfilled' ? reviews.value.count : null,
    degraded,
  }
  return Response.json(body, { status: 200 })
}
```

바뀐 것은 세 가지다. 필수 의존과 선택 의존을 분리했고, 선택 의존마다 타임아웃을 따로 걸어 p99가 가장 느린 서비스에 끌려가지 않게 했고, `degraded` 배열로 "왜 null인지"를 클라이언트가 구분할 수 있게 했다. null이 두 가지 의미(데이터 없음 / 조회 실패)를 갖는 것은 계약의 결함이고, 이 필드가 그것을 가른다.

대가도 정확히 적힌다. 응답 타입에 필드가 하나 늘었고, 클라이언트는 `degraded`를 보고 재시도나 안내를 그려야 하며, 모니터링에는 `degraded` 발생률 지표가 새로 필요하다.

## 매핑 코드는 사라지지 않는다

가격표를 항목별로 적는다.

**필드 하나를 추가할 때 고쳐야 하는 지점의 수.** DTO 없이 행(row)을 그대로 내보내던 구조에서 배송 예정일 필드를 추가하면 DB 마이그레이션, ORM 스키마, 행 타입, 클라이언트 타입 — 4곳이다. DTO와 도메인 모델을 분리하면 DB 마이그레이션, ORM 스키마, 행 타입, 도메인 타입, `toDomain`, DTO 타입, `toResponse`, OpenAPI 스키마, 클라이언트 타입 — 9곳이 된다. 5곳이 늘고, 전부 같은 필드 이름을 반복해서 쓰는 코드다. 여기에 BFF가 3종 있으면 각 BFF의 DTO 타입과 매핑이 더해져 15곳이 된다.

코드 생성이나 타입 추론으로 줄일 수 있지만 0이 되지는 않고, 매핑이 기계적일수록 리뷰에서 필드 누락이 통과한다.

**BFF는 서비스가 늘어나는 것이다.** 클라이언트 3종이면 BFF 3개이고, 배포 파이프라인 3개, 대시보드 3개, 온콜 대상 3개다. 장애 시 "어느 BFF인가"가 먼저 나오는 질문이 되고, 공통 변경은 3번 반복된다. 팀이 BFF마다 따로 있지 않으면 이 비용은 그대로 한 팀에 쌓인다.

**BFF는 비대해지는 방향으로 압력을 받는다.** 화면이 필요로 하는 계산이 조금씩 BFF로 들어오고, 어느 시점부터 도메인 규칙이 BFF에 산다. 그러면 BFF는 클라이언트 어댑터가 아니라 중앙 장치가 된다([안티패턴 6편](/posts/backend-antipatterns-6-smart-pipes-dumb-endpoints)). 판단 기준은 단순하다 — BFF의 코드에 `if` 문이 도메인 규칙처럼 읽히기 시작하면 선을 넘은 것이다.

**API Composition은 부분 실패를 계약으로 끌어올린다.** 리뷰 서비스가 죽었을 때 전체를 500으로 실패시킬지, `reviewCount: null`로 내보낼지는 구현 선택이 아니라 API 계약이다. null이 가능하다는 사실이 스키마에 적혀야 하고, 클라이언트는 그 분기를 그려야 하고, 문서에 "언제 null인가"가 들어가야 한다. 이걸 명시하지 않으면 클라이언트는 평소 값이 항상 있는 것을 보고 non-null로 가정한다.

**응답 시간은 가장 느린 서비스에 묶인다.** 병렬 호출이라도 셋 중 가장 느린 것을 기다리므로, 서비스별 타임아웃을 따로 걸지 않으면 조합자의 p99가 세 서비스 p99의 최댓값이 된다.

## 쓰지 말아야 할 때

**소비자가 하나뿐이고 같은 팀이 같은 파이프라인으로 배포하는 내부 API.** 두 시계가 사실 하나의 시계다. 이 경우 DTO는 이득 없이 매핑 5곳만 추가한다. 배포가 원자적이면 계약 변경이 리팩터링과 다르지 않다.

**도메인 모델이 아직 없는 단계.** 도메인 타입과 DTO가 필드 대 필드로 같으면 매핑은 항등 함수다. 응답 타입 하나를 두고 필요해지면 쪼개는 쪽이 싸다. 다만 내부 필드 유출은 예외다 — `passwordHash`가 응답에 실리는 것은 막아야 하므로, 전체 매핑 대신 명시적 필드 선택(pick)만 먼저 도입하는 중간 단계가 있다.

**화면이 하나뿐인 제품에 BFF.** 클라이언트 종류가 늘어날 "예정"만으로 BFF를 세우면, 실제로 늘어나기 전까지 배포 단위 하나를 이득 없이 운영한다. BFF의 손익분기는 클라이언트 종류가 2개가 되고 두 클라이언트의 필드 요구가 실제로 충돌하기 시작할 때다.

**조합 대상이 전부 한 DB 안에 있을 때.** 세 서비스를 병렬 호출해 합치는 코드는 그 셋이 같은 데이터베이스에 있다면 조인 하나로 끝난다. API Composition을 쓰는 이유는 데이터가 물리적으로 분리되어서이지 코드를 나누고 싶어서가 아니다.

**과잉의 종착점 둘**도 적어 둔다. DTO를 과하게 밀면 계층마다 전용 DTO가 생겨 같은 데이터를 네 번 재정의하고([안티패턴 4편](/posts/backend-antipatterns-4-lasagna-architecture-leaky-layer)), Composition 로직을 중앙 게이트웨이에 몰면 도메인을 아는 파이프가 된다([안티패턴 6편](/posts/backend-antipatterns-6-smart-pipes-dumb-endpoints)).

## 요약

| 항목 | 내용 |
|---|---|
| Remote Facade | 원격 경계에 굵은 입자 인터페이스. 150회 × 5ms = 750ms를 1회 5ms로 |
| DTO | 경계 전용 자료구조. TS에서는 타입 + 매핑 함수로 충분, 클래스 불필요 |
| 사는 것 | 내부 리팩터링 자유. 내부 시계와 외부 계약 시계의 분리 |
| 파는 것 1 | 필드 추가 시 변경 지점 4곳 → 9곳, BFF 3종이면 15곳 |
| 파는 것 2 | BFF 3개 = 배포 3, 대시보드 3, 온콜 3. 방치하면 중앙 장치화 |
| 파는 것 3 | API Composition은 부분 실패가 계약의 일부가 된다 |
| 가용성 산술 | 99.9% 서비스 3개 전부 필수면 99.7%, 월 130분. 부분 실패 허용 시 월 43분 |
| 쓰지 말 때 | 소비자 1개·동일 배포, 화면 1종에 BFF, 같은 DB 조합 |

---

**다음 편 — [8편. 메시지로 말하기 — Enterprise Integration Patterns](/posts/backend-design-patterns-8-messaging-patterns)**

Hohpe와 Woolf가 2003년에 정리한 통합 패턴 중 오늘날까지 살아남은 것들을 고른다. 동기 호출을 비동기 메시지로 바꾸면 시간적 결합이 끊기지만, 그 대가로 순서·즉시성·디버깅 가능성을 판다. 큐는 결합도를 낮추는 동시에 새로운 결합 지점이 된다는 점까지 계산에 넣는다.
