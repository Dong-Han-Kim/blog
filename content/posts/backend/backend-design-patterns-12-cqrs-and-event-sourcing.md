---
# 📌 기본 메타데이터
title: '읽기와 쓰기를 가르다 — CQRS와 Event Sourcing'
date: '2026-09-15'
category: 'backend'
tags: ['CQRS', 'Event Sourcing', 'Materialized View', 'Projection', 'Eventual Consistency']
description: 'CQRS의 세 단계와 단계별 비용, CQRS와 별개인 Event Sourcing이 읽기 모델을 사실상 강제하는 이유. 투영 재구축 시간, 업캐스팅, 잊힐 권리와의 충돌.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 12

# 📚 SEO용
keywords: ['CQRS', 'Event Sourcing', 'Materialized View', 'Projection', 'Eventual Consistency', '백엔드 디자인 패턴']
---

# 읽기와 쓰기를 가르다 — CQRS와 Event Sourcing

## 하나의 모델이 정반대의 요구를 받는다

주문 취소 커맨드는 주문 하나와 그 품목만 있으면 된다. 불변식을 지켜야 하니 트랜잭션은 짧아야 하고, 로드 범위는 애그리게이트 하나로 좁아야 한다(5편). 넓게 잡으면 낙관적 잠금 충돌이 늘고 수정 한 건에 불필요한 행이 딸려 온다.

같은 주문의 목록 화면은 반대를 요구한다. 한 행에 주문 번호, 구매자 등급, 대표 상품명, 썸네일, 배송 상태, 쿠폰 이름을 붙여야 한다. 애그리게이트 규칙대로 밖은 ID로만 참조하면 이 화면은 로드 다섯 번이 되고, 목록이 20행이면 N+1이 된다.

[3편](/posts/backend-design-patterns-3-persistence-patterns)에서 "쓰기는 Repository를 통과하고 조회는 우회한다"는 결론에 도달한 지점이 여기다. 그 우회를 임시방편이 아니라 구조로 승격하는 것이 이 편의 주제다.

```ts
// modules/order/service.ts — Before: 하나의 모델이 두 요구를 다 받는다
export async function orderList(userId: string) {
  const orders = await repo.findByUser(userId)          // 애그리게이트 20개 로드
  return Promise.all(orders.map(async (o) => ({          // 행마다 3번씩 더
    id: o.id, status: o.status,
    grade: (await userRepo.findById(o.customerId))!.grade,
    coupon: o.couponId ? (await couponRepo.findById(o.couponId))!.name : null,
    firstItem: (await productRepo.findById(o.items[0].sku))!.name,
  })))
}
```

## 명령과 조회를 다른 모델로

Bertrand Meyer가 *Object-Oriented Software Construction*에서 제시한 Command-Query Separation(CQS)은 메서드 수준의 규칙이다. 상태를 바꾸는 메서드는 값을 돌려주지 않고, 값을 돌려주는 메서드는 상태를 바꾸지 않는다. CQRS는 이 규칙을 메서드가 아니라 **모델 수준**으로 올린 것이다. Greg Young이 정리해 이름을 붙였다.

여기서 가장 자주 생략되는 것이 **CQRS에 단계가 있다**는 사실이다. 세 단계의 비용은 서로 다른 자릿수다.

| 단계 | 구성 | 추가 운영 대상 | 정합성 | 되돌리기 |
|---|---|---|---|---|
| 1 | 같은 DB, 명령/조회 코드 경로만 분리 | 0개 | 즉시 | 파일 이동 |
| 2 | 읽기 전용 레플리카로 조회 분리 | 레플리카 1, 라우팅 규칙 | 복제 지연만큼 | 라우팅 되돌림 |
| 3 | 별도 읽기 저장소 + 비동기 투영 | 저장소 1, 투영기 1, 재구축 배치 1, 지연 감시 1 | 최종 일관성 | 저장소 제거 + 쿼리 재작성 |

**대부분의 팀에 필요한 것은 1단계다.** 1단계에는 새 인프라가 없고 최종 일관성 문제도 없다. 얻는 것은 설계 자유도다. 조회 함수가 애그리게이트를 로드할 의무에서 풀려나므로 화면에 맞는 SQL을 그대로 쓸 수 있다.

```ts
// modules/order/commands.ts — After: 쓰기는 애그리게이트를 통과한다
export async function cancelOrder(id: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const order = await repo.load(tx, id)      // 애그리게이트 하나만
    const events = order.cancel(actor)         // 불변식은 여기서만 강제된다
    await repo.save(tx, order, events)
  })
}

// modules/order/queries.ts — After: 조회는 화면 모양 그대로 한 번에 읽는다
export async function orderList(userId: string): Promise<OrderRow[]> {
  return db.execute(sql`
    SELECT o.id, o.status, u.grade, c.name AS coupon, p.name AS first_item
    FROM orders o
    JOIN users u ON u.id = o.customer_id
    LEFT JOIN coupons c ON c.id = o.coupon_id
    JOIN products p ON p.sku = o.first_sku
    WHERE o.customer_id = ${userId} ORDER BY o.created_at DESC LIMIT 20`)
}
```

`OrderRow`는 도메인 타입이 아니라 화면 타입이다. 이 구분을 명시하지 않으면 조회 결과에 도메인 메서드를 붙이려는 압력이 곧 생기고, 두 모델이 다시 하나로 합쳐진다.

읽기 저장소를 따로 두는 3단계에서 그 저장소에 들어가는 것이 **Materialized View**다. 조인 결과를 미리 조립해 한 테이블에 넣어두고, 원본이 바뀌면 갱신한다. 조회가 조인 5개에서 단일 테이블 인덱스 조회로 바뀌는 대신, 갱신 책임이 생긴다.

## Event Sourcing은 별개 패턴이다

CQRS와 Event Sourcing은 함께 등장하는 일이 많아 한 묶음으로 오해되지만 독립적이다. CQRS만 쓰고 저장은 평범한 상태 테이블로 할 수 있고, Event Sourcing만 쓰고 조회를 매번 재생으로 처리할 수도 있다. 다만 후자는 좁은 범위에서만 버틴다. 식별자를 아는 스트림 하나를 재생하는 것은 싸지만, "상태가 배송중인 주문을 최신순 20건"처럼 스트림을 가로지르는 질문에는 전량 재생 외에 답할 방법이 없다. **Event Sourcing을 택하면 임의 조회가 비실용적이 되고, 그래서 읽기 모델이 사실상 강제된다.** 둘이 함께 다니는 이유는 개념적 친화성이 아니라 이 압력이다.

Event Sourcing은 현재 상태 대신 상태를 바꾼 사건들을 저장한다. Martin Fowler가 2005년 글에서 정리했다. 잔액 12,000원을 저장하는 대신 입금 20,000, 출금 8,000을 순서대로 저장하고, 잔액은 재생으로 얻는다.

```ts
// modules/account/event-store.ts — 이벤트 추가와 재생
export async function append(tx: Tx, streamId: string, expected: number, evts: Evt[]) {
  // 버전 충돌로 동시 쓰기를 막는다. UNIQUE(stream_id, version) 제약이 최종 방어선.
  await tx.insert(events).values(
    evts.map((e, i) => ({ streamId, version: expected + i + 1, type: e.type, data: e })),
  )
}

export async function replay(streamId: string): Promise<Account> {
  const snap = await loadSnapshot(streamId)                   // 없으면 version 0
  const rows = await db.select().from(events)
    .where(and(eq(events.streamId, streamId), gt(events.version, snap.version)))
    .orderBy(events.version)
  return rows.reduce(apply, snap.state)                       // apply: (s, e) => s
}
```

투영기는 같은 이벤트 스트림을 읽어 읽기 모델을 채운다. 여기서 실무 항목 셋이 생긴다.

**스냅샷.** 애그리게이트 하나에 이벤트가 2,000건 쌓이면 로드마다 2,000건을 재생한다. 100건마다 스냅샷을 남기면 평균 재생량이 50건으로 줄어 약 40배 차이가 난다. 대신 스냅샷은 캐시이지 진실이 아니므로, 구조가 바뀌면 전부 버리고 다시 만들 수 있어야 한다.

**이벤트 버전 관리.** 저장된 이벤트는 수정할 수 없다. 필드를 추가하거나 이름을 바꾸려면 옛 형태를 읽어 새 형태로 변환하는 업캐스팅(upcasting) 함수를 코드에 남겨야 하고, 그 함수는 지워지지 않는다. 스키마 마이그레이션이 한 번의 DDL이 아니라 영구적인 코드 자산이 된다.

**투영 위치 관리.** 투영기는 자기가 어디까지 읽었는지를 저장해야 하고, 그 값이 유실되면 처음부터 다시 읽는다.

## 왜 갈라놓으면 이득이 되는가

근거는 부하 특성의 비대칭이다. 일반적인 업무 시스템에서 조회 요청은 쓰기 요청보다 훨씬 많고, 비가 100:1이면 최적화 노력 한 단위가 적용되는 트래픽이 100배다. 하나의 모델을 쓰면 그 최적화가 쓰기의 제약 — 정규화, 불변식, 좁은 트랜잭션 — 안에서만 가능하다.

분리하면 제약이 사라진다. 읽기 모델은 비정규화해도 되고, 인덱스를 필요한 만큼 붙여도 쓰기 지연에 영향이 없고, 다른 종류의 저장소를 써도 된다. 확장도 따로 한다. 조회가 늘면 읽기 쪽만 늘리면 되고, 그쪽은 상태가 없으므로 수평 확장이 싸다.

Event Sourcing이 추가로 주는 것은 **과거다**. 완전한 감사 로그가 부산물로 생기고, 임의 시점의 상태를 재구성할 수 있고, 무엇보다 **새 읽기 모델을 과거 데이터로 채울 수 있다.** 상태만 저장하는 시스템에서 "지난 1년간 등급 변경 이력별 이탈률"이라는 질문은 그 시점부터 로그를 쌓아야 답할 수 있지만, 이벤트 저장소가 있으면 지금 투영기를 하나 쓰면 된다.

## 무엇을 내주는가

**비동기 투영을 쓰는 순간 쓰기 직후 읽기가 옛 값을 돌려준다.** 사용자가 주소를 저장하고 목록으로 돌아왔는데 그대로다. 버그 리포트로 들어오고, 재현이 안 되고, 투영 지연이 200ms라는 설명은 CS에서 통하지 않는다. 대응은 셋이고 전부 비용이 있다. 낙관적 UI는 클라이언트에 같은 계산을 한 벌 더 두는 것이고, 쓰기 후 일정 시간 해당 사용자만 원본으로 읽게 고정하는 방식은 라우팅 상태를 요청마다 들고 다녀야 하고, 커맨드 응답에 투영 완료를 기다려 붙이면 비동기의 이점이 사라진다.

**투영 코드가 도메인 로직의 복제본이 된다.** "취소 가능 여부"를 읽기 모델의 불리언 컬럼으로 미리 계산해 두면, 그 판단 규칙이 도메인과 투영기 두 곳에 존재한다. 규칙이 바뀌면 둘을 함께 고쳐야 하고, 투영 쪽을 빠뜨리면 목록에서는 취소 버튼이 보이는데 누르면 거부된다.

**투영 재구축 시간이 운영 일정이 된다.** 이벤트 1억 건을 단일 프로세스가 초당 5,000건으로 재생하면 20,000초, 5.56시간이다. 배치 삽입과 병렬 4로 초당 20,000건까지 올려도 1.39시간이다. 이 시간 동안 구버전 투영을 계속 서비스해야 하므로 읽기 저장소가 두 벌 필요하고, 재구축 중에도 새 이벤트가 들어오므로 따라잡기 구간이 별도로 있다. **읽기 모델 스키마를 바꾸는 배포가 반나절짜리 작업이 된다.**

**이벤트는 영원히 산다.** 이벤트 1억 건에 건당 500바이트면 50GB이고, 이건 지울 수 없는 50GB다. 상태 테이블처럼 오래된 행을 아카이브로 옮길 수 없다. 재생의 출발점이기 때문이다.

**개인정보 삭제 요구와 근본적으로 충돌한다.** 잊힐 권리는 데이터를 지우라고 요구하고 Event Sourcing은 지우지 않는 것을 전제로 성립한다. 우회는 암호화 삭제(crypto-shredding)다. 개인정보를 이벤트에 직접 넣지 않고 사용자별 키로 암호화해 넣은 뒤, 삭제 요청이 오면 키만 파기한다. 이벤트는 남지만 복호화가 불가능해진다. 대가는 키 관리 시스템이 하나 더 생기는 것, 키를 잃으면 그 스트림의 재생이 불가능해지는 것, 그리고 이 설계를 나중에 도입할 수 없다는 것이다. **암호화 삭제는 첫 이벤트를 저장하기 전에 결정해야 한다.**

**도구가 없다.** 관리자 화면 생성기, ORM 기반 조회, DB 콘솔에서의 임시 확인, 백오피스 도구가 전부 상태 테이블을 전제한다. "이 주문 지금 상태가 뭐냐"를 SQL 한 줄로 답할 수 없고, 매번 재생하거나 투영을 조회해야 한다. 신규 입사자가 이 구조에 익숙해지는 데 드는 시간도 여기에 포함된다.

## 쓰지 말아야 할 때

**CRUD가 지배적인 도메인에 3단계 CQRS를 넣지 않는다.** 화면이 폼이고 조회가 단일 테이블 조회라면 읽기 모델이 원본과 같은 모양이 된다. 같은 데이터를 한 벌 더 두고 투영기를 운영하면서 얻는 것이 없다.

**읽기와 쓰기의 부하 비가 낮으면 분리 이득이 작다.** 비가 3:1이면 읽기 최적화가 적용되는 트래픽이 전체의 75%이고, 이 정도는 인덱스와 레플리카(2단계)로 처리된다. 3단계의 운영 대상 4개를 추가할 근거가 되지 못한다.

**팀이 처음 쓰는 경우 1단계에서 멈춘다.** 1단계는 파일을 나누는 일이라 틀려도 되돌리기가 싸다. 3단계는 최종 일관성을 제품 요구사항으로 올리는 일이고(10편), 그 합의 없이 배포하면 첫 CS 문의에서 되돌리게 된다.

**Event Sourcing을 시스템 전체에 적용하는 것은 거의 항상 과잉이다.** 이력이 본질인 애그리게이트는 보통 소수다. 잔액과 거래, 재고 수량, 권한 부여 이력, 주문 상태 전이 정도이고, 상품 카탈로그와 배너 설정과 공지사항은 아니다. **감사가 요구사항으로 적혀 있는 애그리게이트에만 적용하고 나머지는 상태 테이블로 두는 배치가 현실적이다.** 한 서비스 안에서 두 방식이 공존하는 것은 일관성 부족이 아니라 비용 계산의 결과다.

## 요약

| 항목 | 내용 |
|---|---|
| CQS → CQRS | 메서드 수준 분리(Meyer)를 모델 수준으로 올린 것. Greg Young이 이름을 붙임 |
| 3단계 | (1) 같은 DB 코드 분리 (2) 읽기 레플리카 (3) 별도 저장소 + 비동기 투영 |
| 권장 | 대부분의 팀에 필요한 것은 1단계. 추가 인프라 0개, 정합성 손실 0 |
| Event Sourcing | 상태 대신 사건을 저장하고 재생으로 상태를 얻음(Fowler, 2005). CQRS와 별개 |
| 왜 통하는가 | 읽기:쓰기 100:1이면 최적화가 100배 트래픽에 적용. 제약 없이 비정규화 가능 |
| 대가 1 | 쓰기 직후 읽기가 옛 값. 대응 3가지 모두 비용 있음 |
| 대가 2 | 투영 재구축 1억 건 = 5.56시간(초당 5천) / 1.39시간(초당 2만). 저장소 2벌 필요 |
| 대가 3 | 이벤트 불변 → 업캐스팅 영구 유지, 잊힐 권리와 충돌, 암호화 삭제는 사전 결정 |
| 쓰지 말아야 할 때 | CRUD 지배, 읽기/쓰기 비 3:1 이하, 첫 도입. ES는 감사가 본질인 애그리게이트에만 |

---

**다음 편 — [13편. 실패를 설계에 넣기 — Stability Patterns](/posts/backend-design-patterns-13-stability-patterns)**

10~12편은 정합성을 다뤘다. 남은 것은 실패다. 원격 호출의 결과는 성공과 실패가 아니라 "모른다"를 포함한 세 가지이고, 이것을 설계에 넣지 않으면 느린 다운스트림 하나가 전체를 멈춘다. Nygard가 정리한 여덟 개의 장치를 무엇을 막는가 기준으로 늘어놓고, 각 장치의 설정값이 왜 지속적인 운영 비용인지 — 틀린 설정이 왜 없는 것보다 나쁜지 — 를 계산으로 따진다.
