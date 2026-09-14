---
# 📌 기본 메타데이터
title: '아무도 일하지 않는 계층 — Lasagna Architecture와 Leaky Layer'
date: '2026-09-14'
category: 'backend'
tags: ['Anti-Pattern', 'Layered Architecture', 'Hexagonal Architecture', 'Clean Architecture', 'Next.js', 'TypeScript']
description: '필드 하나에 파일 일곱 개를 건드리는 pass-through 계층과 새는 계층의 비용. 규칙은 계층 수가 아니라 의존 방향이다.'

# 💬 옵션 필드
draft: false
series: '백엔드 안티패턴'
seriesOrder: 4

# 📚 SEO용
keywords: ['Anti-Pattern', 'Layered Architecture', 'Hexagonal Architecture', 'Clean Architecture', 'Next.js', 'TypeScript', '백엔드 안티패턴']
---

# 아무도 일하지 않는 계층 — Lasagna Architecture와 Leaky Layer

## 필드 하나를 추가하는 데 파일 일곱 개를 건드린다

주문 응답에 `memo` 필드를 하나 추가하는 작업의 diff가 이렇게 나온다.

```
src/db/order.entity.ts        +1   memo: string
src/repo/order.repository.ts  +1   select에 memo 추가
src/repo/order.row.ts         +1   OrderRow에 memo
src/service/order.mapper.ts   +1   toDomain: memo: row.memo
src/domain/order.model.ts     +1   memo: string
src/api/order.dto.ts          +1   memo: string
src/api/order.presenter.ts    +1   toDto: memo: model.memo
```

일곱 파일, 일곱 줄. 여섯 줄은 `memo: x.memo`의 반복이고, 실제로 정보를 더한 줄은 첫 줄뿐이다. 이게 Lasagna Architecture(층은 많은데 각 층이 하는 일이 없는 구조)다.

정반대 모양도 같은 빈도로 나타난다.

```ts
// app/api/orders/route.ts — Leaky Layer
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const { rows } = await pool.query(
    `select * from orders o join users u on u.id = o.user_id
     where o.memo ilike '%${q}%' order by o.created_at desc limit 50`)  // 문자열 결합
  return Response.json(rows)   // 컬럼 전부가 그대로 응답에 나간다
}
```

Leaky Layer(계층이 막아야 할 것을 그대로 통과시키는 구조)다. 이 열 줄에는 SQL 인젝션, 컬럼 유출(`u.password_hash`가 응답에 포함된다), DB 컬럼명과 API 필드명의 직결, 테스트 불가능성이 동시에 들어 있다.

**두 구조는 정반대로 보이지만 원인이 같다. 계층의 개수를 정했을 뿐, 각 계층이 무엇을 막는지를 정하지 않았다.**

## 층을 세는 문화는 어디서 왔나

3계층(프레젠테이션 / 비즈니스 / 데이터 액세스)은 실제로 문제를 풀었던 구조다. 클라이언트가 웹과 데스크톱 둘이었고, DB가 교체 대상이었고, 팀이 UI 담당과 DB 담당으로 나뉘어 있던 조건에서 이 분할은 조직 구조와 코드 구조를 일치시켰다.

그 조건 중 상당수가 사라졌다. 클라이언트는 대개 하나이고, DB를 갈아 끼우는 일은 10년에 한 번이고, 한 사람이 화면부터 쿼리까지 다 만든다. 남은 것은 **디렉터리 이름의 관습**이다. `controller / service / repository`를 만드는 이유가 "그렇게 하는 것이니까"가 되면, 각 층은 존재 이유를 잃은 채 형태만 남는다.

Leaky Layer는 그 반대편 반작용이다. 층이 아무 일도 하지 않는다는 것을 알아챈 팀이 층을 없애는데, 이때 함께 사라지는 것이 층이 우연히 막아주던 것들이다. 파라미터 바인딩, 응답 필드 화이트리스트, 권한 검사가 여기 포함된다.

여기에 프레임워크의 변화가 겹친다. Next.js App Router의 Route Handler나 Server Action은 파일 하나에서 요청 수신부터 DB 접근까지 전부 쓸 수 있게 설계되어 있다. 이건 기능이지 결함이 아니다. 다만 "쓸 수 있다"와 "그래도 된다"가 구분되지 않으면, 층을 없애기로 한 결정이 **막을 것도 같이 없애기로 한 결정**이 된다. 두 안티패턴은 한 팀의 역사 안에서 번갈아 나타나기도 한다. Lasagna에 지친 팀이 Leaky로 가고, 사고가 나면 다시 층을 쌓는다.

## pass-through 계층의 비용과 누출 계층의 비용

**pass-through 쪽.** 필드 하나 추가에 7개 파일이라면, 필드 12개짜리 리소스 하나를 새로 만들 때 매핑 코드는 12 × (매핑 지점 수)만큼 생긴다. 위 구조는 매핑 지점이 2개(`toDomain`, `toDto`)이므로 24줄이다. 24줄 전부가 **컴파일러가 검증하지 않는 줄**이라는 게 문제다. `memo: row.note`처럼 이름만 비슷한 필드를 잘못 연결해도 타입이 같으면 통과한다. 같은 타입(`string`)을 가진 필드가 리소스 안에 4개 있으면, 잘못 연결 가능한 조합은 4 × 3 = 12가지이고 그중 어느 것도 타입 검사에 걸리지 않는다.

리뷰에서도 잘 걸리지 않는다. `+1/-0` 짜리 매핑 줄 여섯 개가 든 PR은 읽지 않고 승인되는 쪽에 가깝다. **아무 일도 하지 않는 계층은 버그를 막지 못할 뿐 아니라, 버그를 숨길 표면적을 제공한다.**

**Leaky Layer 쪽.** 비용의 성격이 다르다. 위 핸들러에서 `orders.memo` 컬럼 이름을 `orders.note`로 바꾸면 API 응답 필드명이 바뀌고, 그 즉시 클라이언트가 깨진다. DB 스키마 변경과 API 호환성이 같은 사건이 되는 것이다. 여기에 `select *`가 붙으면 컬럼을 추가하는 마이그레이션이 곧 응답 스키마 변경이 된다. 새 컬럼이 `internal_risk_score`나 `password_hash`라면 이건 스키마 변경이 아니라 보안 사고다.

테스트도 불가능해진다. 이 핸들러를 검증하려면 Postgres 인스턴스가 필요하고, 검증 로직만 따로 확인할 방법이 없다. "limit이 50을 넘으면 거부한다" 같은 규칙 하나를 확인하는 데 DB 기동 시간이 붙으면, 그 테스트는 작성되지 않는 쪽으로 기운다.

두 비용의 시간 구조가 다르다는 점이 중요하다. Lasagna의 비용은 **매 변경마다 조금씩** 청구된다. 필드 추가 한 번에 20분, 분기당 50회면 17시간이다. Leaky Layer의 비용은 평소에 0이다가 **한 번에 크게** 청구된다. 컬럼 추가 한 번이 응답에 내부 필드를 실어 보내는 사건이 되는 식이다. 전자는 팀이 체감하고 불평하지만 아무도 고치지 않고, 후자는 사고 나기 전까지 아무도 언급하지 않는다. 이 비대칭 때문에 조직은 대개 Lasagna를 먼저 고치고 Leaky Layer는 사후에 고친다.

## 계층이 아니라 의존 방향이 규칙이다

> **"계층은 몇 개여야 하는가"는 처음부터 잘못된 질문이다.** 답이 있는 질문은 "의존이 어느 방향으로만 흘러야 하는가"다.

이 규칙을 명시적으로 세운 것이 Alistair Cockburn의 Hexagonal Architecture(Ports and Adapters, 2005)와 Robert C. Martin의 Clean Architecture(*Clean Architecture*, 2017)다. 둘의 층 개수는 다르지만 공통 규칙은 하나다. **소스 코드 의존성은 항상 안쪽, 즉 정책 방향으로만 향한다.** 도메인 로직은 HTTP도 SQL도 모른다. 바깥이 안쪽의 인터페이스를 구현한다.

이 규칙이 실제로 하는 일은 방향을 뒤집는 장치 하나를 요구하는 것이다. 유스케이스가 리포지토리를 호출해야 하는데 의존은 안쪽으로만 흘러야 하므로, 인터페이스를 안쪽에 두고 구현을 바깥에 둔다. TypeScript에서는 `type` 선언 한 줄이면 되고 DI 컨테이너도 필요 없다. 2편에서 `Deps` 인자로 한 것과 같은 기법이다.

의존 방향이 규칙이 되면 층의 개수는 결과값이 된다. 그리고 층을 추가할 자격 기준이 하나 생긴다.

> 그 계층이 **무엇을 막는가**를 한 문장으로 말할 수 없으면 넣지 않는다.

이 문장 테스트를 통과하는 계층의 예는 이렇다. "이 매핑 계층은 DB 컬럼명 변경이 API 응답에 도달하는 것을 막는다." "이 포트는 도메인 로직이 Postgres 문법에 의존하는 것을 막는다." 통과하지 못하는 예는 "관심사 분리를 위해", "계층형 아키텍처의 표준이라서"다.

그래서 **매핑이 필요한 경계와 필요 없는 경계가 갈린다.** 공개 API 응답과 DB 행 사이에는 매핑이 필요하다. 둘의 변경 이유가 다르고(클라이언트 요구 vs 스키마 최적화), 한쪽에는 숨겨야 할 필드가 있다. 반면 유스케이스 함수와 도메인 타입 사이에는 매핑이 필요 없다. 둘은 같은 이유로 바뀐다. **변경 이유가 같은 두 표현 사이의 매핑은 전부 순수 비용이다.**

## Route Handler는 HTTP 번역만 한다

Next.js App Router를 예로 들면, Route Handler의 책임은 세 가지로 못 박을 수 있다. 요청을 도메인 입력으로 파싱하고, 유스케이스를 호출하고, 결과를 HTTP 상태와 응답 본문으로 번역한다. 그 외에는 아무것도 하지 않는다.

```ts
// app/api/orders/route.ts — After
import { searchOrders } from '@/usecases/search-orders'
import { orderRepo } from '@/adapters/pg/order-repo'

const Query = z.object({ q: z.string().trim().min(1).max(60), limit: z.coerce.number().int().min(1).max(50).default(20) })

export async function GET(req: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return Response.json({ error: 'invalid_query' }, { status: 400 })

  const session = await requireSession(req)                       // 인증도 HTTP 관심사
  const orders = await searchOrders({ repo: orderRepo }, { ...parsed.data, actor: session.userId })
  return Response.json({ items: orders.map(toOrderResponse) })    // 화이트리스트 매핑
}
```

유스케이스는 HTTP를 모르고, 자기가 필요한 능력만 포트로 선언한다.

```ts
// usecases/search-orders.ts
export type OrderRepo = { search(actor: UserId, q: string, limit: number): Promise<Order[]> }

export async function searchOrders(deps: { repo: OrderRepo }, input: SearchInput): Promise<Order[]> {
  if (input.limit > 20 && !isStaff(input.actor)) throw new Forbidden('limit_exceeded')
  return deps.repo.search(input.actor, input.q, input.limit)
}

// adapters/pg/order-repo.ts — SQL은 여기에만 존재한다
export const orderRepo: OrderRepo = {
  async search(actor, q, limit) {
    const { rows } = await pool.query(
      `select id, status, memo, created_at from orders
       where user_id = $1 and memo ilike '%' || $2 || '%'
       order by created_at desc limit $3`, [actor, q, limit])   // 파라미터 바인딩
    return rows.map(toOrder)
  },
}
```

계층은 셋이지만, 각 계층은 문장 테스트를 통과한다. Route Handler는 검증되지 않은 입력이 안쪽으로 들어가는 것을 막고, 유스케이스는 권한 규칙이 어댑터마다 복제되는 것을 막고, 어댑터는 SQL 문법이 도메인으로 새는 것을 막는다. `toOrderResponse`의 화이트리스트는 새 컬럼이 자동으로 응답에 실리는 것을 막는다.

**대가는 간접 비용이다.** 요청 하나를 추적하려면 파일 세 개를 열어야 하고, `OrderRepo` 인터페이스와 그 구현이 항상 같이 움직인다. 포트 정의는 구현이 하나뿐일 때 특히 무의미해 보인다 — 인터페이스와 구현이 1:1인데 굳이 나눠 둔 셈이기 때문이다. 이건 실제 비용이고, 규모가 작을수록 회수되지 않는다. 그리고 이 구조 자체가 Lasagna Architecture로 미끄러지기 쉽다. 포트를 추가할 때마다 "무엇을 막는가"를 다시 묻지 않으면 층이 관습으로 늘어난다.

## 이게 오히려 정답인 경우

- **내부 도구·단일 목적 API.** 사내 대시보드의 조회 엔드포인트 다섯 개짜리 서비스에서 포트/어댑터를 나누면 파일 수가 3배가 되고 얻는 게 없다. Route Handler에서 파라미터 바인딩된 쿼리를 바로 쓰고 응답 필드만 명시하는 것으로 충분하다. Leaky Layer의 네 가지 비용 중 인젝션과 컬럼 유출 두 가지는 계층 없이도 막을 수 있다. **계층이 아니라 바인딩과 화이트리스트가 그걸 막는 장치다.**
- **읽기 전용 조회, 특히 복잡한 집계.** 도메인 규칙이 없고 SQL이 곧 로직인 경우, 쿼리를 도메인 객체로 풀었다가 다시 집계하는 건 성능과 가독성을 동시에 잃는다. 쓰기 경로에만 계층을 두고 읽기 경로는 얇게 두는 비대칭 구조가 더 정확한 경우가 많다.
- **교체 가능성이 실제로 0인 경계.** "나중에 DB를 바꿀 수도 있으니까"로 정당화된 추상화는 대부분 회수되지 않는다. 그 계층이 막는 것이 가상의 미래뿐이라면 문장 테스트를 통과하지 못한 것이다.
- **프로토타입.** 2편과 같은 이유다. 시간축이 짧으면 순손실이 성립하지 않는다.

## 요약

| 항목 | 내용 |
|---|---|
| 증상 A | Lasagna — 필드 1개 추가에 파일 7개, 매핑 줄의 대부분이 `x: y.x` |
| 증상 B | Leaky Layer — Route Handler에 SQL 문자열 결합, `select *`가 그대로 응답 |
| 공통 원인 | 계층의 개수만 정하고 각 계층이 무엇을 막는지 정하지 않음 |
| 비용 | 컴파일러가 못 잡는 매핑 줄(같은 타입 4개면 오연결 12가지) / 컬럼명 변경이 곧 API 파괴 |
| 규칙 | 층 개수가 아니라 의존 방향. Hexagonal(Cockburn, 2005), Clean Architecture(Martin, 2017) |
| 자격 기준 | "이 계층이 무엇을 막는가"를 한 문장으로 못 쓰면 넣지 않는다 |
| 매핑 판정 | 변경 이유가 다른 경계에만 매핑. 같은 이유로 바뀌는 두 표현 사이 매핑은 순수 비용 |
| 정답인 경우 | 내부 도구, 읽기 전용 집계 경로, 교체 가능성 0인 경계, 프로토타입 |

---

**다음 편 — 5편. 데이터베이스가 아키텍처가 될 때 — Smart DB와 DB-as-IPC**

4편에서 SQL을 어댑터 안쪽으로 밀어 넣었다. 5편은 그 반대 방향으로 끝까지 간 시스템을 다룬다. 비즈니스 로직이 저장 프로시저에, 부수효과가 트리거 체인에, 조회 로직이 뷰 위의 뷰에 있는 구조다. 이 선택이 합리적이었던 시대의 전제가 무엇이었고 그 전제가 언제 무너졌는지, 그리고 그 청구서가 Oracle에서 PostgreSQL로 이관할 때 어떤 형태로 돌아오는지를 본다.
