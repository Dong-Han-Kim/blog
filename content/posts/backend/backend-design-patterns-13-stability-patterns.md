---
# 📌 기본 메타데이터
title: '실패를 설계에 넣기 — Stability Patterns'
date: '2026-09-15'
category: 'backend'
tags: ['Resilience', 'Circuit Breaker', 'Bulkhead', 'Timeout', 'Load Shedding']
description: 'Nygard 계열 안정성 장치 여덟 개를 무엇을 막는가로 정리하고, 겹치는 순서와 설정값의 근거를 계산한다. 틀린 설정이 없는 것보다 나쁜 이유와 장치별 한계 이득.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 13

# 📚 SEO용
keywords: ['Resilience', 'Circuit Breaker', 'Bulkhead', 'Timeout', 'Load Shedding', '백엔드 디자인 패턴']
---

# 실패를 설계에 넣기 — Stability Patterns

## 세 번째 결과

프로세스 안의 함수 호출은 값을 돌려주거나 예외를 던진다. 두 가지다. 원격 호출은 세 가지다.

```ts
// modules/billing/issue.ts — Before: 두 가지 결과만 가정한 코드
export async function issueInvoice(orderId: string, amount: number) {
  const res = await fetch(`${TAX_AGENCY}/invoices`, {
    method: 'POST',
    body: JSON.stringify({ orderId, amount }),
  })
  return res.json()
}
```

성공, 실패, 그리고 **모른다**. 응답이 오지 않는 동안 세금계산서가 발행됐는지 호출자는 판단할 근거가 없다. 쓰기에서는 이 세 번째 상태가 특히 비싸다. 읽기라면 다시 물어보면 되지만, 여기서 다시 보내는 것은 중복 발행일 수 있다.

위 코드에는 세 번째 경우에 대한 지시가 없다. 지시가 없으면 기본값은 "무한히 기다린다"이고, 기다리는 동안 이 요청은 커넥션 하나와 이벤트 루프 대기 항목 하나를 점유한다. 그 점유가 전체 장애로 번지는 경로는 [안티패턴 12편](/posts/backend-antipatterns-12-retry-storm-thundering-herd)에 있다.

이 편은 반대쪽이다. 전파를 막는 장치가 여덟 개 있고, 여덟 개 전부 설정값을 요구한다. **주제는 장치의 목록이 아니라 그 설정값이 누구의 지속적인 부담이 되는가다.**

## 카탈로그와 그 출처

Michael Nygard가 *Release It!*(2007)에서 Stability Patterns로 묶은 목록은 Timeouts, Circuit Breaker, Bulkheads, Steady State, Fail Fast, Handshaking, Test Harness, Decoupling Middleware였다. 아래 표는 그 복사본이 아니라 **Nygard 계열**이다. 원목록에서 오늘도 선택지가 되는 것에 이후 표준으로 편입된 것을 더했다. Retry with Backoff + Jitter와 Fallback/Graceful Degradation은 1판에 없고, Load Shedding은 2018년 2판에서 Shed Load로 들어왔다. 겹쳐 놓는 것이 아니라 고르는 것이므로, 무엇을 막는지부터 확정한다.

| 패턴 | 막는 것 | 주 설정값 |
|---|---|---|
| Timeout | 무한 대기로 인한 자원 점유 | 대기 상한 |
| Retry with Backoff + Jitter | 일시적 실패가 최종 실패가 되는 것 | 횟수, 초기 간격, 상한, 지터 폭 |
| Circuit Breaker | 죽은 대상에 계속 호출해 회복을 방해하는 것 | 임계치, 윈도, cooldown, 시험 요청 수 |
| Bulkhead | 한 기능의 자원 고갈이 다른 기능으로 번지는 것 | 칸별 동시성 상한 |
| Fallback / Graceful Degradation | 부수 기능의 실패가 핵심 기능을 막는 것 | 기능별 필수 여부 분류 |
| Load Shedding / Rate Limiting | 처리 불가능한 부하를 받아 전부 느려지는 것 | 유입 상한, 큐 길이 |
| Steady State | 무한히 쌓이는 자원이 언젠가 한계에 닿는 것 | 보관 기간, 정리 주기 |
| Fail Fast | 실패할 작업에 자원을 먼저 쓰는 것 | 사전 검사 항목 |

**Timeout이 가장 싸고 가장 자주 빠진다.** HTTP 클라이언트 대부분이 기본값을 무제한 또는 수십 초로 두므로, 명시하지 않으면 없는 것과 같다. 값은 두 방향에서 온다. 위에서는 사용자 대면 예산 — 전체 1초에 직렬 구간이 셋이면 구간당 333ms 미만이다. 아래에서는 다운스트림 실측 — p99가 80ms인 호출에 타임아웃을 80ms로 잡으면 정상 요청의 1%를 죽이고, 2배인 160ms면 절단이 0.1% 미만으로 떨어지면서 재시도 1회를 포함한 320ms도 예산 안에 들어온다. **두 방향의 값이 충돌하면 위가 이긴다.** 나머지 값도 마찬가지로 근거가 있어야 한다. 회로의 `probes`(half-open에서 통과시킬 시험 요청 수)를 20으로 두면 회복 중인 다운스트림이 그 순간 20배 부하를 맞으므로 1~2가 상한이다.

## 장치를 겹치는 순서가 동작을 바꾼다

각 장치를 구현하는 것보다 어려운 것은 조합이다. 순서에 따라 같은 설정이 다른 의미가 된다.

```ts
// lib/policy.ts — 호출 정책을 선언하고 바깥부터 감싼다
type Policy = {
  bulkhead: number      // 이 대상에 허용할 동시 호출 수
  timeoutMs: number     // 시도 1회의 상한 (다운스트림 p99 × 2)
  retries: number       // 멱등 호출에만 1 이상
  breaker: { threshold: number; windowMs: number; cooldownMs: number; probes: number }
}

// 순서: 재시도( 회로( 격리( 타임아웃( 호출 ) ) ) )
export const call = <T>(p: Policy, key: string, fn: (s: AbortSignal) => Promise<T>) =>
  withRetry(p.retries, () =>
    withBreaker(key, p.breaker, () =>
      withBulkhead(key, p.bulkhead, () => withTimeout(p.timeoutMs, fn))))
```

**재시도가 회로 바깥에 있어야 한다.** 회로가 열린 동안 재시도는 즉시 실패로 끝나 다운스트림에 도달하지 않는다. 순서를 뒤집으면 3회 재시도가 모두 실패한 호출이 회로 입장에서 실패 1건으로 집계된다. 임계치 5가 실제로는 실패 15건을 뜻하게 되고, 회로는 의도보다 3배 늦게 열린다.

**타임아웃은 시도 하나마다 걸려야 한다.** 재시도 안쪽에 있으므로 최악의 총 소요는 `timeoutMs × (retries + 1) + 백오프 합`이다. 이 값이 상위 예산을 넘으면 상위가 먼저 포기하고, 아래의 재시도는 아무도 기다리지 않는 응답을 만드느라 자원을 쓴다.

첫머리의 발행 호출을 이 정책으로 감싸면, 고칠 것은 호출 코드가 아니라 값의 근거다.

```ts
// modules/billing/issue.ts — After: 값마다 유도 근거를 주석으로 남긴다
const TAX_POLICY: Policy = {
  bulkhead: 24,        // 30/s × 0.4s = 12얼랑, 여유 2배
  timeoutMs: 1600,     // 대행사 p99 800ms × 2
  retries: 0,          // 비멱등 POST. 아래 키가 붙기 전에는 0을 올리지 않는다
  breaker: { threshold: 10, windowMs: 30_000, cooldownMs: 20_000, probes: 1 },
}

export const issueInvoice = (orderId: string, amount: number) =>
  call(TAX_POLICY, 'tax-agency', (signal) =>
    fetch(`${TAX_AGENCY}/invoices`, {
      method: 'POST',
      // 멱등성 키를 대행사가 지원하면 retries를 1 이상으로 올릴 수 있다 (11편)
      headers: { 'Idempotency-Key': `invoice:${orderId}` },
      body: JSON.stringify({ orderId, amount }),
      signal,
    }).then((r) => r.json()))
```

`retries: 0`과 `Idempotency-Key`가 한 파일에 붙어 있는 것이 요점이다. 재시도 가능 여부는 라이브러리 설정이 아니라 **상대 API의 계약**이 정한다. `threshold`가 흔한 5가 아니라 10인 이유는 뒤의 오탐 계산에 있다.

Bulkhead 상한도 같은 식으로 선언한다. 값은 리틀의 법칙으로 역산한다.

```ts
// lib/bulkhead-registry.ts — 기능별 칸과 필수 여부를 한곳에 선언한다
export const CAPACITY = {
  // 동시성 = 목표 처리량(req/s) × 응답시간(s), 여기에 여유 2배
  payment:   { limit: 40, essential: true  },  // 100/s × 0.2s = 20 → 40
  inventory: { limit: 20, essential: true  },  //  50/s × 0.2s = 10 → 20
  recommend: { limit: 6,  essential: false },  //  60/s × 0.05s = 3 → 6
  banner:    { limit: 4,  essential: false },
} as const

// essential:false인 칸이 가득 차면 대기시키지 않고 즉시 비운 값으로 떨어뜨린다
export async function guarded<T>(key: keyof typeof CAPACITY, fn: () => Promise<T>, empty: T) {
  const { limit, essential } = CAPACITY[key]
  if (!essential && inflight(key) >= limit) return empty   // Load Shedding
  return withBulkhead(key, limit, fn)                      // 필수는 대기 허용
}
```

`essential` 플래그가 Fallback의 전제다. 무엇이 없어도 되는지를 문서가 아니라 호출 지점에서 참조 가능한 자료로 두지 않으면, 그 판단을 장애 중에 사람이 하게 된다.

## 공통 원리는 실패를 국소화하고 빠르게 만드는 것

여덟 개가 하는 일은 결국 두 가지다. 실패의 범위를 한 칸 안에 가두고, 실패에 걸리는 시간을 줄인다.

두 번째가 덜 직관적이다. 실패는 어차피 실패인데 왜 빠른 편이 나은가. 요청 하나가 붙잡는 커넥션·메모리·이벤트 루프 항목의 총량은 점유 시간에 비례하고, 30초 뒤에 실패하는 요청은 50ms에 실패하는 요청보다 같은 자원을 600배 오래 쥔다. 자원이 유한하므로 **느린 실패는 그 시간 동안 자원을 얻지 못한 다른 요청들까지 실패시킨다.** 빠른 실패는 실패 건수를 1로 유지하고, 느린 실패는 그것을 곱한다. Fail Fast가 목록에 있는 이유도 같다.

## 무엇을 내주는가

**설정값이 늘어나고, 틀린 설정은 없는 것보다 나쁘다.** 위 정책 타입 하나에 값이 일곱 개이고 호출 대상이 여섯 개면 42개다. Circuit Breaker의 오탐이 이 대가를 가장 선명하게 보여준다. 연속 실패 임계가 5, 초당 1,000건, 다운스트림의 정상 실패율이 10%라면 연속 5회 실패가 우연히 발생할 빈도는 1000 × 0.1⁵ = 0.01건/초, **시간당 36회**다. 정상 상태에서 회로가 시간당 36번 열리고 열린 동안의 실패율은 100%다. 임계를 10으로 올리면 1000 × 0.1¹⁰ = 1e-7건/초로 사실상 0이 된다. 같은 장치가 설정 하나로 방어 수단이 되기도 하고 장애 원인이 되기도 한다.

**설정값은 한 번 정하고 끝나지 않는다.** 다운스트림 팀이 인덱스를 추가해 p99가 80ms에서 20ms로 떨어지면 타임아웃 160ms는 8배로 헐거워지고, 데이터가 늘어 p99가 300ms가 되면 같은 값이 정상 요청을 대량으로 죽인다. **이 값들은 코드가 아니라 다운스트림의 성질을 기록한 것이다.** 분기마다 실측값과 대조하는 작업이 고정 일정에 들어간다.

**Bulkhead는 자원 효율을 떨어뜨린다.** 총 제공 부하 5얼랑(초당 100건 × 응답 50ms)에 커넥션 20개를 통합 풀로 쓰면 대기 확률은 3.5×10⁻⁷다. 같은 20개를 네 칸으로 갈라 칸당 5개, 부하도 1.25얼랑씩 나뉘면 9.7×10⁻³으로 약 2만 8천 배 나빠진다. 같은 대기 확률을 유지하려면 칸당 11개, 총 44개가 필요하다. **격리의 값은 커넥션 20개에서 44개로, 2.2배다.**

**Fallback은 평소에 실행되지 않는 두 번째 코드 경로다.** 정상 상태의 호출 횟수가 0이라 테스트가 없으면 썩고, 참조하는 캐시 형식이 바뀌어도 컴파일만 통과하면 아무도 모른다. 주입 훈련이 분기별 일정 항목으로 추가된다.

**거절을 제품이 받아들여야 한다.** Load Shedding의 대가는 코드가 아니라 합의다([안티패턴 12편](/posts/backend-antipatterns-12-retry-storm-thundering-herd)).

**Steady State는 잊힌다.** 로그·임시 파일·세션의 정리 주기는 배포 첫날에 정하지 않으면 디스크가 찰 때 정해진다.

**관측 없이는 어떤 값도 튜닝할 수 없다.** 회로 개방 횟수, 칸별 거절 수, 타임아웃 발생률, Fallback 실행 횟수가 지표로 없으면 42개 값은 추측이다(15편).

## 쓰지 말아야 할 때

대가가 전부 같은 형태였으므로 판단 기준도 하나로 적을 수 있다. **장치 하나의 연간 유지 비용과, 그 장치가 이미 얹힌 장치들 위에 더해 주는 한계 이득을 비교한다.** 네트워크 경계가 없는 프로세스 내부 호출이 제외되는 것은 이 계산 이전의 문제다.

**한계 이득으로 계산한다 — 겹치는 이득은 빼야 한다.** Circuit Breaker를 예로 든다. 설정값 네 개를 분기마다 재튜닝하고 회당 2시간(실측 수집, 값 결정, 배포, 관찰)이 든다면 호출 지점 하나당 연 8시간, 480분이다. 이득 쪽은 흔히 "장애 전파를 막는다"로 뭉뚱그려지는데, 호출자의 자원 점유를 끊는 몫은 이미 Timeout과 Bulkhead가 가져갔다. 회로에만 남는 한계 이득은 **죽은 다운스트림에 호출을 멈춰 회복을 앞당기는 시간**뿐이다. 회당 15분을 앞당긴다면 손익분기는 연간 장애 횟수 f에 대해 15f = 480, **f = 32회**다. 그 다운스트림이 열흘에 한 번꼴로 죽지 않는다면 회로는 유지 비용이 이득을 넘는다. 순서도 여기서 나온다. 설정값이 하나뿐이고 이득이 다른 장치와 거의 겹치지 않는 **Timeout이 언제나 먼저**이고, Circuit Breaker는 이 계산을 통과한 지점에만 붙인다.

**정책을 지점마다 둘지 뭉칠지도 같은 계산이다.** 호출 지점 6개에 값 7개면 42개지만 공통 정책 하나면 7개다. 공통 정책은 가장 느린 다운스트림에 맞춰지므로 빠른 호출의 타임아웃이 그만큼 헐거워진다. 지점들의 p99가 서로 3배 안에 들어오면 그 손실이 작고, p99 20ms와 800ms를 한 정책으로 묶으면 빠른 쪽은 사실상 타임아웃이 없는 상태가 된다. **편차가 기준이지 지점 수가 기준이 아니다.**

**Bulkhead는 자원 총량을 2.2배로 늘릴 수 있을 때만 격리다.** 총량을 그대로 둔 채 칸만 나누면 격리가 아니라 대기 확률을 2만 8천 배 악화시키는 작업이다. 다운스트림의 최대 커넥션이 정해져 있거나 DB 커넥션이 비싸 풀을 못 키우는 환경에서는, 칸을 나누는 대신 필수/부수 분류만 두고 부수 호출을 먼저 버리는 편이 싸다.

**Fallback은 주입 훈련을 일정에 넣을 수 있을 때만 넣는다.** 검증되지 않은 Fallback은 장애 때 두 번째 예외를 던진다. 분기마다 실패를 주입할 여력이 없다면 대체 값 없이 실패를 올려보내는 쪽이 낫다. **틀린 대체 값은 없는 것보다 나쁘고, 잘못 설정한 회로와 같은 이유에서다.**

**설정값을 유도할 실측이 없으면 장치를 넣지 않는다.** 이 편의 모든 값이 다운스트림의 p99와 실패율에서 나왔다. 그 둘을 모른 채 임계치를 관례대로 5로 두면 실패율 10%인 다운스트림에서 시간당 36번 회로가 열린다. 계측이 장치보다 먼저다(15편). 사슬 자체가 길어서 생기는 문제라면 장치가 아니라 10편의 경계 설계로 푸는 편이 싸다([안티패턴 12편](/posts/backend-antipatterns-12-retry-storm-thundering-herd)).

## 요약

| 항목 | 내용 |
|---|---|
| 출처 | Nygard 계열. *Release It!*(2007) 원목록 + 이후 편입분(재시도·Fallback·Shed Load) |
| 전제 | 원격 호출의 결과는 성공·실패·"모른다"의 3상태 |
| 공통 원리 | 실패를 한 칸에 가두고 빠르게 만든다. 느린 실패는 다른 요청까지 실패시킨다 |
| Timeout 근거 | 위에서 예산(1초·3구간 → 333ms), 아래에서 실측(p99 80ms → 160ms) |
| 조합 순서 | 재시도(회로(격리(타임아웃))). 뒤집으면 임계치 5가 실제 15가 됨 |
| 대가 1 | 대상 6개 × 값 7개 = 42개 설정. 임계 5·실패율 10%·1000rps면 오탐 시간당 36회 |
| 대가 2 | 격리는 통합 풀 대비 커넥션 2.2배(20개 → 44개) |
| 대가 3 | Fallback은 평시 실행 0회라 썩는다. 실패 주입 훈련이 정기 일정이 됨 |
| 선택 기준 | 연간 유지 비용 vs 이미 얹은 장치 위의 한계 이득. 회로는 회복 단축 15분 기준 f=32회/년 |
| 쓰지 말아야 할 때 | 실측 없는 설정, 자원 총량을 못 늘리는 격리, 훈련 없는 Fallback, 프로세스 내 호출 |

---

**다음 편 — [14편. 변경을 안전하게 내보내기 — Sidecar, Feature Toggle, Expand-Contract](/posts/backend-design-patterns-14-deployment-and-change-patterns)**

3막이 여기서 끝난다. 10~13편은 경계를 긋고, 그 경계를 넘는 쓰기를 맞추고, 읽기를 가르고, 실패를 가두는 일이었다. 4막은 그렇게 만든 시스템을 계속 바꾸는 방법을 다룬다. Feature Toggle이 왜 지우지 않으면 부채가 되는지, Expand-Contract가 왜 배포 횟수를 3배로 만드는지, Sidecar가 무엇을 떼어내고 무엇을 대신 요구하는지를 따진다.
