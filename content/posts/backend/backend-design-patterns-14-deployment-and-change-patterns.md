---
# 📌 기본 메타데이터
title: '변경을 안전하게 내보내기 — Sidecar, Feature Toggle, Expand-Contract'
date: '2026-09-15'
category: 'backend'
tags: ['Deployment', 'Feature Toggle', 'Expand-Contract', 'Service Mesh']
description: '배포는 원자적이지 않다는 전제에서 나오는 Expand-Contract, Feature Toggle, Canary, Sidecar. 배포 3배·토글 조합 1,024가지·canary 검출 하한이라는 가격표와 만료일을 박은 토글.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 14

# 📚 SEO용
keywords: ['Deployment', 'Feature Toggle', 'Expand-Contract', 'Service Mesh', '백엔드 디자인 패턴']
---

# 변경을 안전하게 내보내기 — Sidecar, Feature Toggle, Expand-Contract

## 코드 리뷰는 통과했는데 배포가 장애를 만든다

주문 테이블의 `recipient_name` 컬럼을 `receiver_name`으로 바꾸는 작업이다. 마이그레이션 한 줄, 코드 참조 열두 군데 치환. 리뷰에서 지적은 없었다.

```sql
-- drizzle/0042_rename.sql — Before: 한 번에 바꾼다
ALTER TABLE orders RENAME COLUMN recipient_name TO receiver_name;
```

마이그레이션이 먼저 돌고 롤링 배포가 시작된다. 파드 20개를 30초 간격으로 교체하면 20 × 30초 = **10분**이 걸린다. 그 10분 동안 교체되지 않은 구버전 파드는 `recipient_name`을 SELECT 하고, PostgreSQL은 `42703 column does not exist`로 답한다. 트래픽의 절반이 500을 받는 구간이 수 분간 이어진다.

1막부터 3막까지는 코드와 런타임의 구조를 다뤘다. 여기서부터 대상이 바뀐다. **변경을 내보내는 행위 자체가 설계 대상**이다.

## 배포를 원자적이지 않다고 인정하는 네 가지 방법

### Expand-Contract (Parallel Change)

Danilo Sato가 Parallel Change(2014)라는 이름으로 정리했고 Expand-Contract로도 불린다. 계약을 바꿀 때 세 단계로 나눈다. **확장**은 새 것을 추가하고 옛 것과 함께 지원한다. **이행**은 읽기와 쓰기를 새 것으로 옮긴다. **축소**는 옛 것을 제거한다. 컬럼 이름 하나를 바꾸는 데 배포가 세 번 필요하다는 뜻이다.

1단계의 마이그레이션은 `ALTER TABLE orders ADD COLUMN receiver_name text;` 한 줄이다. 추가만 하고 삭제도 이름 변경도 하지 않으므로, 구버전 파드가 모르는 컬럼이 늘어나는 것은 무해하다. 인덱스는 `CREATE INDEX CONCURRENTLY`로 테이블 잠금을 피한다.

```ts
// db/orders.ts — After 1단계: 둘 다 쓰고, 읽기는 아직 옛 컬럼
export async function saveReceiver(id: string, name: string) {
  await db.update(orders)
    .set({ recipientName: name, receiverName: name })   // 이중 쓰기
    .where(eq(orders.id, id))
}
export const readReceiver = (o: OrderRow) => o.recipientName

// 2단계(이행): 백필 후 읽기만 옮긴다. 쓰기는 여전히 둘 다
//   (o: OrderRow) => o.receiverName ?? o.recipientName
// 3단계(축소): 쓰기도 새 컬럼만. 이 배포가 끝난 뒤에야 DROP COLUMN을 돌린다
//   (o: OrderRow) => o.receiverName
```

1단계와 2단계 사이에는 백필 작업이 들어간다. 배포 3회, 마이그레이션 2회, 백필 1회로 변경 단위가 6개다. 원래는 2개였다.

### Feature Toggle

Pete Hodgson이 2017년 martinfowler.com에 정리한 분류가 기준으로 쓰인다. 핵심은 **배포와 릴리스의 분리**이고, 더 중요한 것은 토글이 한 종류가 아니라는 사실이다.

| 종류 | 답하는 것 | 수명 | 전환 주체 |
|---|---|---|---|
| Release Toggle | 미완성 코드를 배포해도 되나 | 며칠~수 주 | 개발자 |
| Ops Toggle | 부하가 걸릴 때 끌 수 있나 | 기능과 동일 | 운영자 |
| Experiment Toggle | A와 B 중 어느 쪽이 나은가 | 실험 기간 | 실험 플랫폼 |
| Permission Toggle | 이 사용자에게 보여줄 것인가 | 무기한 | 제품 |

수명이 다르면 관리 방식도 달라야 한다. Release Toggle은 제거가 계획에 들어 있어야 하고, Permission Toggle은 제거 대상이 아니라 도메인 규칙이다. 둘을 같은 방식으로 두면 무엇을 지워도 되는지 아무도 모르게 된다.

### Blue-Green과 Canary Release

Blue-Green은 동일한 환경을 두 벌 두고 트래픽을 통째로 옮긴다. 롤백이 라우팅 전환 한 번이라 빠르다. Canary는 신버전에 트래픽의 일부(5% 같은)만 보내고 지표를 본 뒤 비율을 올린다. 실패를 5%에게만 노출하는 대신 **두 버전이 같은 DB와 큐를 공유하므로 데이터 호환성이 전제 조건**이 된다. Canary는 Expand-Contract 위에서만 성립한다.

### Sidecar와 Ambassador

Brendan Burns와 David Oppenheimer가 2016년 논문에서 컨테이너 기반 분산 시스템의 패턴으로 Sidecar, Ambassador, Adapter를 정리했다. 애플리케이션 프로세스 옆에 보조 컨테이너를 같은 배포 단위로 붙이고, TLS 종료·재시도·타임아웃·메트릭 수집 같은 횡단 관심사를 그쪽으로 옮긴다. Ambassador는 바깥으로 나가는 호출을 대리하는 형태다. **Service Mesh는 이것을 전면화해 모든 파드에 프록시를 붙이고 정책을 컨트롤 플레인에서 배포하는 구조다.**

## 롤링 배포 중에는 두 버전이 반드시 같이 산다

앞의 예에서 두 버전이 공존한 시간은 10분이었다. 줄일 수는 있어도 0으로 만들 수 없고, 롤백하면 방향이 뒤집혀 신버전이 써 놓은 데이터를 구버전이 읽어야 한다. 클라이언트가 모바일 앱이면 공존 기간은 **몇 달**이다.

> 여기서 규칙 하나가 따라 나온다. **모든 변경은 한 단계 하위 호환이어야 한다.** N과 N+1이 동시에 살아 있어도 양방향으로 동작해야 하고, 그래서 파괴적 변경은 한 번에 할 수 없고 세 번에 나눠서만 할 수 있다.

Expand-Contract는 이 제약에서 연역된 결과이지 선택지가 아니다. 무중단 배포를 하기로 한 순간 남은 선택은 "쓸 것인가"가 아니라 "축소를 언제 할 것인가"뿐이다.

## 배포 3배, 조합 1,024가지, 프록시 200개

**Expand-Contract는 변경 단위를 3배로 만든다.** 배포 3회, 마이그레이션 2회, 백필 1회. 리뷰·승인·관측 창도 같은 배수로 늘어나, 하루 안에 끝나던 변경이 스프린트 두 개에 걸친다.

더 비싼 대가는 세 가지다. 첫째, 이행 기간 동안 코드에 두 경로가 공존한다. `o.receiverName ?? o.recipientName` 같은 분기가 생기고 테스트 케이스는 (옛 값만, 새 값만, 둘 다) 3가지로 늘어난다. 둘째, 확장 단계의 새 컬럼은 nullable이어야 하므로 `NOT NULL`과 `UNIQUE`를 DB가 강제할 수 없다. **불변식이 일시적으로 DB에서 애플리케이션 코드로 이사한다.** 셋째가 가장 흔한 실패다. 축소는 사용자에게 도착하는 이득이 0인 배포라 우선순위에서 항상 밀리고, 6개월 뒤 컬럼 두 개 중 어느 쪽이 진실인지 아무도 모르는 상태가 남는다.

**Feature Toggle은 경로 수를 지수로 늘린다.** 토글 10개면 이론적 조합은 2¹⁰ = **1,024가지**인데, 실제로 테스트되는 것은 기본 조합 하나와 새로 켠 것 몇 개뿐이다. 모든 쌍을 4조합씩 검사하는 pairwise 테스트로 줄여도 (10 × 9 ÷ 2) × 4 = **180 케이스**라 이 역시 현실적으로 돌리지 않는다. 게다가 토글 상태가 외부 설정 서비스에 있으면 "프로덕션에서 이 요청이 어느 경로로 돌았는가"가 저장소에 남지 않아 재현 불가능한 버그가 나온다. 그리고 **제거가 계획되지 않은 토글은 영구 분기문이 된다.**

**Canary는 판정 자동화 없이는 그냥 느린 배포다.** 총 1,000 rps에서 5% canary는 50 rps, 5분이면 50 × 60 × 5 = 15,000 요청이다. 기저 오류율 0.1%면 기대 오류는 15건이고 표준편차는 √15 ≈ 3.9다. 신버전이 0.2%로 나빠지면 30건이라 약 4σ로 잡히지만, 0.13%면 19.5건이라 1.2σ 안에 묻힌다. **canary가 검출할 수 있는 열화에는 하한이 있고, 그 하한은 트래픽과 관측 창의 함수다.** 사람이 대시보드를 5분 쳐다보는 것은 판정이 아니다.

**Sidecar와 Service Mesh는 자원과 홉을 청구한다.** 프록시 하나가 40\~100MB를 쓰면 파드 200개에 7.8\~19.5GB가 추가된다. 호출 하나가 송신 측과 수신 측 프록시 2개를 지나면 왕복 1ms 정도가 붙는데, 내부 호출 p50이 5ms인 구간에서는 20% 증가다. 서비스 4개를 거치는 체인이면 프록시 8홉, 약 4ms다. 여기에 디버깅 대상이 하나 늘고(502가 앱에서 났는지 프록시에서 났는지), 컨트롤 플레인이 운영 대상으로 추가된다. 메시 업그레이드는 데이터 플레인 전체의 재시작을 부른다.

Service Mesh가 [안티패턴 6편](/posts/backend-antipatterns-6-smart-pipes-dumb-endpoints)의 ESB를 닮았다는 지적은 절반만 맞다. **결정적 차이는 데이터 플레인이 각 파드 옆에 분산되어 있다는 것이다.** 프록시 하나가 죽으면 그 파드만 영향을 받고, 컨트롤 플레인이 죽어도 이미 배포된 설정으로 데이터 플레인은 계속 돈다. 단일 장애점이 아니다. 다만 정책 소유권이 중앙 한 팀에 모인다는 조직적 성질은 같고, ESB를 안티패턴으로 만든 것은 중앙 런타임보다 중앙 소유권 쪽이었다. 라우팅 규칙에 도메인 조건이 들어가면 같은 결말에 도달한다.

## 토글에 기한을 박아 넣기

토글 제거를 기억에 맡기면 제거되지 않는다. 흔한 Before는 환경변수를 참조 지점마다 읽는 것이다.

```ts
// checkout/handler.ts — Before: 토글이 흩어지고 수명이 기록되지 않는다
if (process.env.CHECKOUT_V2 === 'true') return checkoutV2(cmd)
return checkoutV1(cmd)
```

이 토글이 언제 사라져야 하는지, 누구 것인지, Release인지 Permission인지가 코드 어디에도 없다. 만료일을 선언에 넣고 CI가 검사하게 하면 기한이 강제된다.

```ts
// lib/toggles.ts — After: 종류와 만료일을 선언으로 고정한다
type ToggleKind = 'release' | 'ops' | 'experiment' | 'permission'
type ToggleSpec = { kind: ToggleKind; owner: string; expiresAt: string | null }

export const TOGGLES = {
  'checkout-v2':   { kind: 'release', owner: 'order-team', expiresAt: '2026-11-01' },
  'disable-recos': { kind: 'ops',     owner: 'platform',   expiresAt: null },
} as const satisfies Record<string, ToggleSpec>

export const isOn = (n: keyof typeof TOGGLES, ctx: Ctx) => resolver.evaluate(n, ctx)

// lib/toggles.test.ts — 기한이 지난 토글이 남아 있으면 CI가 깨진다
it('만료일이 지난 토글은 제거되어야 한다', () => {
  const expired = Object.entries(TOGGLES)
    .filter(([, t]) => t.expiresAt !== null && Date.parse(t.expiresAt) < Date.now())
    .map(([name]) => name)
  expect(expired).toEqual([])   // 제거하거나, 논의를 거쳐 만료일을 연장해야 통과한다
})
```

`expiresAt: null`을 허용하는 것이 중요하다. Ops Toggle과 Permission Toggle은 영구 존재가 정상이므로 기한 검사는 Release Toggle에만 걸려야 한다. 기한 연장에는 커밋이 필요하고 커밋에는 리뷰어가 붙는다. 제거 결정을 기억에서 코드 리뷰로 옮기는 것이 이 구현의 전부다.

## 쓰지 말아야 할 때

**서비스가 한 대이고 짧은 다운타임이 허용되면 Expand-Contract는 손해다.** 새벽 2분 유지보수 창을 잡고 멈춘 뒤 `RENAME COLUMN` 한 줄을 돌리는 비용은 배포 3회와 몇 주의 리드타임보다 훨씬 싸다. 사내 관리 도구, 배치 전용 DB가 여기 해당한다. 판단 기준은 관행이 아니라 **2분 중단의 실제 비용**이다.

파괴적이지 않은 변경에 적용하는 것도 과잉이다. nullable 컬럼 추가나 응답 필드 추가는 그 자체로 하위 호환이라 배포 한 번이면 된다. 이 패턴이 필요한 것은 삭제·이름 변경·타입 변경·의미 변경 네 가지다.

**Feature Toggle은 변경의 수명보다 토글 관리 비용이 클 때 쓰지 않는다.** 하루 안에 머지되고 검증되는 변경이면 브랜치로 충분하다. 토글은 미완성 코드를 몇 주간 기본 브랜치에 두고 싶을 때 값을 하는 것이지, 모든 `if`를 토글로 바꾸는 규율이 아니다. 조건부 로직의 기본 도구로 삼으면 아무도 조합을 모르는 분기 숲에 도달한다.

**Canary의 손익분기는 서비스 수가 아니라 트래픽이다.** 총 10 rps인 서비스에서 5% canary는 0.5 rps, 5분이면 150 요청이다. 오류율이 0%에서 1%로 나빠져도 기대 오류는 1.5건이라 판정이 불가능하다. 이 구간에서는 Blue-Green으로 통째로 전환하고 롤백을 빠르게 만드는 쪽이 낫다.

**Service Mesh의 손익분기는 서비스 수와 언어 수로 계산한다.** 전부 Node.js 한 언어이고 서비스가 3~5개라면 재시도·타임아웃·mTLS·메트릭은 공용 HTTP 클라이언트 모듈 하나로 해결된다. 라이브러리 방식의 비용은 언어 수에 비례해 늘고, 메시의 비용은 언어 수와 무관한 대신 고정비가 크다. 대체로 **서비스 10개 이상이고 언어가 2개 이상일 때** 교차한다. 13편의 Circuit Breaker를 메시로 얻겠다는 것만으로는 근거가 약하다.

## 요약

| 항목 | 내용 |
|---|---|
| 전제 | 배포는 원자적이지 않다. 롤링 배포 중 두 버전이 반드시 공존한다 |
| 파생 규칙 | 모든 변경은 한 단계 하위 호환. 파괴적 변경은 세 번에 나눠야 한다 |
| Expand-Contract | 확장 → 이행 → 축소. 컬럼 이름 하나에 배포 3회, 변경 단위 6개 |
| 대가 1 | 이행 중 두 경로 공존, nullable 강제로 불변식이 DB에서 코드로 이사 |
| 대가 2 | 토글 10개 = 1,024 조합. pairwise로 줄여도 180 케이스 |
| 대가 3 | 프록시 40\~100MB × 파드 200개 = 7.8\~19.5GB, 호출당 2홉 1ms |
| Canary 한계 | 5% × 1,000 rps × 5분 = 15,000 요청. 0.1%→0.13%는 못 본다 |
| 쓰지 말 때 | 2분 중단이 싼 단일 서비스, 10 rps canary, 언어 1개 서비스 5개의 mesh |

---

**다음 편 — [15편. 운영을 패턴으로 — Health Check, Correlation ID, Leader Election](/posts/backend-design-patterns-15-operational-patterns)**

배포된 뒤의 시스템을 다루는 패턴들로 4막을 닫는다. liveness와 readiness를 왜 갈라야 하는지, SIGTERM 이후의 순서가 왜 배포 에러율을 결정하는지, Leader Election이 왜 락만으로는 안전해지지 않는지를 다룬다. 공통점은 전부 시스템이 자기 상태를 말하게 만드는 장치라는 것이다.
