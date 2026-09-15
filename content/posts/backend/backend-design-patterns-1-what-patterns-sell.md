---
# 📌 기본 메타데이터
title: '패턴은 무엇을 파는가 — 해법이 아니라 교환 조건'
date: '2026-09-15'
category: 'backend'
tags: ['Design Pattern', 'Architecture', 'Backend', 'Trade-Off']
description: '패턴을 해법이 아니라 교환 조건으로 읽는 법. 간접성·일관성·중복이라는 세 통화, Repository로 계산해 본 가격표, 그리고 16편 시리즈의 지도.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 1

# 📚 SEO용
keywords: ['Design Pattern', 'Architecture', 'Backend', 'Trade-Off', '백엔드 디자인 패턴']
---

# 패턴은 무엇을 파는가 — 해법이 아니라 교환 조건

## 아무도 가격표를 묻지 않는다

설계 논의에서 "여기 Repository 패턴 넣죠"라는 제안이 나오면 대화는 보통 도입 여부로 간다. 넣자는 쪽은 테스트가 쉬워진다고 하고, 반대하는 쪽은 지금은 이르다고 한다. 둘 다 근거는 감각이다.

정작 빠지는 질문은 하나다. **그래서 이 패턴을 넣으면 무엇을 내주는가.**

패턴 설명 자료의 대부분이 이 질문에 답하지 않는다. 구조 다이어그램이 있고, 이득이 나열되고, 예제 코드가 있다. 무엇을 포기하는지는 맨 아래 "단점" 항목에 "복잡도가 증가할 수 있다" 한 줄로 처리된다. 이건 가격표가 아니라 광고 문구다.

이 시리즈 16편은 전부 그 가격표를 쓰는 데 절반을 쓴다. 먼저 왜 그래야 하는지부터 세운다.

## Consequences 절을 아무도 읽지 않는다

GoF의 『디자인 패턴』(1994)은 각 패턴을 여러 절로 나눠 기술한다. Intent, Motivation, Applicability, Structure, Participants, Collaborations, **Consequences**, Implementation, Sample Code, Known Uses, Related Patterns.

이 중 실무에서 유통되는 건 사실상 Structure 다이어그램과 Sample Code 두 개다. Consequences — 이 패턴을 쓰면 무엇이 좋아지고 무엇이 나빠지는가 — 는 원전에 분명히 있는데도 전파 과정에서 떨어져 나간다.

이건 우연이 아니라 구조적이다. 다이어그램은 슬라이드 한 장에 들어가고 대가는 문장 열 줄이 필요하다. 요약될수록 먼저 잘려 나가는 쪽은 언제나 대가다.

> 패턴은 해법이 아니라 **교환 조건**이다. 모든 패턴은 무언가를 얻기 위해 무언가를 내준다. 무엇을 내주는지 말하지 않는 패턴 설명은 완결되지 않은 것이다.

앞선 [백엔드 안티패턴 시리즈](/posts/backend-antipatterns-1-what-is-an-antipattern)가 "맥락이 사라진 해법"을 추적했다면, 이 시리즈는 그 앞단을 다룬다. **대가를 모른 채 산 해법**이 나중에 맥락을 잃은 해법이 된다. 대가를 알고 샀다면 맥락이 바뀌었을 때 되돌릴 근거가 남는다.

## 백엔드 패턴이 거래하는 세 가지 통화

패턴마다 내주는 것이 달라 보이지만, 백엔드에서는 대체로 세 축 중 하나에서 거래가 일어난다. 이 분류가 이 시리즈 전체의 뼈대다.

| 통화 | 사는 것 | 파는 것 | 해당 패턴 |
|---|---|---|---|
| 간접성 | 교체 가능성, 테스트 용이성 | 추적 가능성, 코드량 | Repository(3편), Ports and Adapters(4편), Strategy(6편) |
| 일관성 | 가용성, 확장성 | 즉시 정합성 | Saga(11편), CQRS(12편), Database per Service(10편) |
| 중복 | 자율성, 독립 배포 | 단일 진실 공급원 | 읽기 모델 복제(12편), Database per Service(10편) |

**간접성**은 A가 B를 직접 부르던 것을 A가 인터페이스를 부르고 B가 그것을 구현하게 바꾸는 거래다. 얻는 것은 B를 갈아끼울 수 있는 자유이고, 파는 것은 "이 호출이 어디로 가는지"를 코드만 읽고는 알 수 없게 되는 것이다. IDE의 "정의로 이동"이 인터페이스에서 멈추는 순간부터 대가가 청구되기 시작한다.

**일관성**은 분산 패턴 대부분이 거래하는 통화다. 두 서비스가 같은 트랜잭션 안에 있기를 포기하는 대신 서로 독립적으로 살아 있을 수 있게 된다. 여기서 파는 것은 코드의 성질이 아니라 **제품의 성질**이다. "주문 직후 재고 화면이 잠깐 다를 수 있다"를 제품 담당자가 받아들이지 못하면 이 거래는 성립하지 않는다.

**중복**은 정규화 교육을 받은 개발자에게 가장 저항이 큰 거래다. 같은 데이터를 두 곳에 두는 것이 낭비가 아니라 결합도를 끊는 값이라는 관점 전환이 필요하다.

세 통화 모두 공통점이 있다. **지금 확실한 비용을 내고 나중에 도착할 유연성을 산다**는 것이다. 그래서 패턴 도입의 손익은 "그 유연성이 실제로 필요해질 확률 × 그때 얻는 이득"과 "지금 내는 비용"의 비교다.

## 공짜로 딸려 오는 것 하나, 그리고 그 함정

가격표에 잡히지 않지만 실재하는 이득이 하나 있다. **이름**이다.

Alexander가 패턴을 정리한 목적 자체가 설계를 논의할 공용 어휘를 만드는 것이었다. "이벤트를 발행하기 전에 같은 트랜잭션에 레코드를 남기고 별도 프로세스가 그걸 읽어서 보내자"를 "Outbox 쓰자"로 줄일 수 있으면, 설계 회의의 대역폭이 달라진다. 코드 리뷰에서 "여기 Anticorruption Layer가 필요해 보인다"는 한 문장이 문단 하나를 대체한다.

이 이득은 비용이 거의 없다. 이름만 쓰고 구조는 안 넣어도 되기 때문이다. 그래서 패턴을 공부하는 것과 패턴을 적용하는 것은 분리된 결정이고, **전자는 거의 항상 남는 장사다.**

함정은 그다음이다. 이름은 합의를 가장한다. 두 사람이 "Repository 쓰자"에 동의했을 때, 한 명은 인터페이스 하나를 생각하고 다른 한 명은 Unit of Work와 Identity Map까지 딸린 완전한 구현을 생각하고 있을 수 있다. 패턴 이름은 넓고, 넓은 말에 대한 동의는 동의가 아니다. 이름으로 대화를 줄인 만큼 **범위는 명시적으로 좁혀야 한다.**

## 가격표를 실제로 써보면

Repository를 예로 가격을 계산해 보자. 주문 조회 하나를 두 가지로 쓴다.

```ts
// app/api/orders/[id]/route.ts — Before: 패턴 없음
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, params.id))
    .limit(1)
  if (!rows[0]) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(rows[0])
}
```

파일 하나, 함수 하나, 호출 경로 한 단계다. 이 코드의 문제는 명확하다. 도메인 로직이 생기면 이 핸들러가 비대해지고([안티패턴 4편](/posts/backend-antipatterns-4-lasagna-architecture-leaky-layer)), 테스트하려면 DB가 떠 있어야 한다.

```ts
// domain/order/repository.ts — After: 인터페이스
export interface OrderRepository {
  findById(id: string): Promise<Order | null>
}

// infra/order/drizzle-repository.ts — After: 구현
export function createOrderRepository(db: Db): OrderRepository {
  return {
    async findById(id) {
      const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
      return rows[0] ? toDomain(rows[0]) : null
    },
  }
}

// app/api/orders/[id]/route.ts — After: 핸들러는 HTTP만 번역한다
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const order = await repo.findById(params.id)
  return order
    ? Response.json(toResponse(order))
    : Response.json({ error: 'not found' }, { status: 404 })
}
```

가격표는 이렇다. 엔티티 하나당 파일이 1개에서 최소 3개로 늘고, 테스트 더블과 매핑 함수(`toDomain`, `toResponse`)까지 세면 5개가 된다. 조회 하나를 따라가려면 인터페이스에서 한 번 끊긴다. 그리고 덜 알려진 대가가 하나 더 있다. **`findById`라는 좁은 인터페이스는 ORM의 조인·부분 선택·배치 로딩을 숨긴다.** 목록 화면에서 이걸 반복 호출하면 N+1이 인터페이스 뒤에서 조용히 자란다.

얻는 것도 정확히 적어야 한다. 도메인 로직이 DB 스키마를 모르게 되고, 단위 테스트가 DB 없이 돈다. "나중에 DB를 바꿀 수 있다"는 자주 인용되지만 실제로 회수되는 경우는 드물어서, 이걸 도입 근거의 1순위에 놓으면 대개 손해 보는 거래가 된다.

**엔티티가 세 개이고 조회가 CRUD뿐인 내부 도구라면 Before가 맞다.** 도메인 규칙이 쌓이기 시작하고 같은 조회가 여러 유스케이스에서 쓰이는 순간부터 After가 이긴다. 이 시리즈가 각 편에서 답하려는 것이 그 전환점이다.

## 패턴이 안티패턴이 되는 지점

대가를 계산하지 않고 산 패턴은 대부분 같은 방식으로 실패한다. 이득이 도착하지 않는데 비용은 매일 청구되는 상태다.

계층 패턴을 대가 계산 없이 적용하면 아무것도 하지 않는 계층이 쌓인 구조가 되고([안티패턴 4편](/posts/backend-antipatterns-4-lasagna-architecture-leaky-layer)), 서비스 분해를 대가 계산 없이 적용하면 배포만 쪼개진 시스템이 된다([안티패턴 9편](/posts/backend-antipatterns-9-distributed-monolith)). 두 경우 모두 패턴 자체는 무죄다. 가격을 안 보고 샀을 뿐이다.

그래서 이 시리즈는 각 편에 **"쓰지 말아야 할 때"** 절을 고정으로 둔다. 앞 시리즈의 "오히려 정답인 경우"를 거울처럼 뒤집은 자리다. 패턴 카탈로그에서 가장 쓸모 있는 항목은 대개 그 자리에 있다.

## 이 시리즈의 지도

각 막은 경계의 크기로 나뉜다. 안쪽에서 시작해 바깥으로 나간다.

| 막 | 다루는 경계 | 편 |
|---|---|---|
| 1막 | 하나의 프로세스 안 — 모듈과 계층 | [2](/posts/backend-design-patterns-2-where-domain-logic-lives)~[6편](/posts/backend-design-patterns-6-gof-in-the-backend) |
| 2막 | 프로세스 경계 — 통합과 메시징 | [7](/posts/backend-design-patterns-7-remote-boundary-patterns)~[9편](/posts/backend-design-patterns-9-anticorruption-and-strangler) |
| 3막 | 서비스 경계 — 분산 정합성과 실패 | [10](/posts/backend-design-patterns-10-service-decomposition)~[13편](/posts/backend-design-patterns-13-stability-patterns) |
| 4막 | 배포 경계 — 변경과 운영 | [14](/posts/backend-design-patterns-14-deployment-and-change-patterns)~[15편](/posts/backend-design-patterns-15-operational-patterns) |

1막의 패턴들은 모놀리식 시대에 정리됐지만 폐기되지 않았다. 마이크로서비스 하나의 내부가 곧 작은 모놀리식이기 때문에, Repository와 Ports and Adapters는 2020년대 서비스 안에서 그대로 살아 있다. 시대 순으로 가면서도 "지나간 패턴"이라는 취급을 하지 않는 이유다.

GoF 패턴은 독립 막을 주지 않고 6편에 모아 처리한다. 백엔드에서 실제로 살아남은 것은 23개 중 소수이고, 그마저도 TypeScript에서는 클래스 없이 함수와 타입으로 같은 효과를 내는 경우가 많기 때문이다.

## 각 편을 읽는 법

모든 편은 같은 여섯 단계로 간다.

1. **문제** — 이 패턴이 없을 때 무엇이 무너지는가
2. **패턴의 형태** — 무엇을 하는 것인가
3. **왜 통하는가** — 어떤 힘을 어떻게 균형 잡는가
4. **무엇을 내주는가** — 가격표
5. **쓰지 말아야 할 때** — 과잉이 되는 조건
6. **요약과 다음 편**

급하면 4번과 5번만 읽어도 된다. 1\~3번은 어떤 패턴인지 아는 독자에게는 복습이지만, 4\~5번은 대부분의 자료에 없는 내용이다.

## 요약

| 항목 | 내용 |
|---|---|
| 관통 명제 | 패턴은 해법이 아니라 교환 조건. 대가를 말하지 않는 설명은 미완성 |
| 전파의 문제 | GoF 원전의 Consequences 절이 요약 과정에서 가장 먼저 잘린다 |
| 거래 통화 1 | 간접성 — 교체 가능성을 사고 추적 가능성을 판다 |
| 거래 통화 2 | 일관성 — 가용성을 사고 즉시 정합성을 판다. 제품이 동의해야 성립 |
| 거래 통화 3 | 중복 — 자율성을 사고 단일 진실 공급원을 판다 |
| 손익 계산 | (유연성이 필요해질 확률 × 그때의 이득) vs 지금 내는 비용 |
| 실패 방식 | 이득은 도착하지 않는데 비용만 매일 청구되는 상태 |
| 고정 절 | 각 편의 "쓰지 말아야 할 때"가 카탈로그에서 가장 쓸모 있는 항목 |

---

**다음 편 — [2편. 도메인 로직은 어디에 사는가 — Transaction Script, Domain Model, Table Module](/posts/backend-design-patterns-2-where-domain-logic-lives)**

Fowler가 PoEAA(2002)에서 정리한 세 가지 선택지를 놓고, 각각이 언제 이기는지를 분기 수와 규칙 재사용 횟수로 따진다. Transaction Script는 후진 선택지가 아니라 특정 구간에서 최적인 선택지라는 것이 이 편의 결론이다.
