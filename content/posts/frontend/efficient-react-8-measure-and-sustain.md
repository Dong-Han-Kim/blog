---
# 📌 기본 메타데이터
title: '효율적인 React 8편 — 측정하고 유지하기: 판단을 기계에 맡기고, 시리즈를 정리한다'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'Web Vitals', 'RUM', 'Performance Budget', 'ESLint', 'Code Review']
description: '한 번 빠르게 만든 코드는 다음 PR에서 다시 느려진다. 실제 사용자 환경의 측정, 성능 예산을 CI에 거는 법, lint로 판단을 기계화하는 법, 리뷰 질문, 기존 코드베이스에 적용하는 순서, 그리고 시리즈 총정리.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 8

# 📚 SEO용
keywords: ['React', 'Web Vitals', 'RUM', 'Performance Budget', 'ESLint', 'Code Review', '효율적인 React']
---

# 효율적인 React 8편 — 측정하고 유지하기

1\~7편의 원칙을 적용하면 코드는 효율적인 상태가 된다. 문제는 그 상태가 **유지되지 않는다**는 것이다. 새 기능이 추가되고, 사람이 바뀌고, 라이브러리가 업데이트되면서 state는 다시 위로 올라가고, `'use client'`는 다시 레이아웃에 붙고, Effect는 다시 연쇄된다.

비용이 조금씩 늘어나는 변화는 PR 하나 단위에서는 보이지 않는다. 그래서 이 편의 전제는 다음과 같다.

> **사람의 주의력에 기대는 규칙은 시간이 지나면 지켜지지 않는다. 판단은 가능한 한 측정·lint·CI로 기계화하고, 사람은 기계가 판단할 수 없는 것만 리뷰한다.**

---

## 1. 개발자 기기의 측정은 사용자 경험이 아니다

### 1-1. Lab 데이터와 Field 데이터

| | Lab (Lighthouse, DevTools) | Field (실사용자 측정, RUM) |
|---|---|---|
| 환경 | 통제된 기기·네트워크 | 사용자의 실제 기기·네트워크·확장 프로그램 |
| 장점 | 재현 가능, 원인 분석에 적합 | 실제 경험, 통계적 분포 |
| 한계 | 실제 사용자 분포를 모름 | 원인 분석에 필요한 정보가 적음 |
| INP | 사람이 상호작용해야 측정 가능 | **실제 상호작용에서만 의미 있음** |

1편의 Profiler와 6편의 Performance 패널은 **원인을 찾는 도구**다. **문제가 있는지 판단하는 기준**은 Field 데이터여야 한다. 특히 INP는 사용자가 실제로 무엇을 클릭하는지에 달려 있어서 Lab에서 대표값을 얻기 어렵다.

### 1-2. Web Vitals 수집

```tsx
// app/web-vitals.tsx
'use client';
import { useReportWebVitals } from 'next/web-vitals';

export function WebVitals() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({
      name: metric.name,          // LCP, INP, CLS, FCP, TTFB
      value: metric.value,
      rating: metric.rating,      // good | needs-improvement | poor
      id: metric.id,
      path: location.pathname,
    });
    navigator.sendBeacon?.('/api/vitals', body) ||
      fetch('/api/vitals', { body, method: 'POST', keepalive: true });
  });
  return null;
}
```

`sendBeacon`과 `keepalive`는 페이지를 떠나는 순간에도 전송이 끝나도록 한다. INP와 CLS는 페이지 생애 전체에 걸쳐 확정되므로 이탈 시점 전송이 중요하다.

### 1-3. "무엇이" 느린지까지 수집한다

값만 모으면 "INP p75가 350ms"라는 사실만 안다. 고치려면 **어떤 요소의 어떤 상호작용이, 어느 구간에서** 느렸는지가 필요하다. `web-vitals` 라이브러리의 attribution 빌드는 이 정보를 준다.

```ts
import { onINP, onLCP, onCLS } from 'web-vitals/attribution';

onINP(({ value, attribution }) => {
  report('INP', value, {
    target: attribution.interactionTarget,       // 상호작용한 요소의 선택자
    type: attribution.interactionType,           // pointer | keyboard
    inputDelay: attribution.inputDelay,          // 6편 ①
    processing: attribution.processingDuration,  // 6편 ②
    presentation: attribution.presentationDelay, // 6편 ③
  });
});

onLCP(({ value, attribution }) => {
  report('LCP', value, { element: attribution.target, url: attribution.url });
});

onCLS(({ value, attribution }) => {
  report('CLS', value, { shiftTarget: attribution.largestShiftTarget });
});
```

6편에서 INP를 세 구간으로 나눈 이유가 여기서 드러난다. 수집된 데이터에서 `inputDelay`가 크면 hydration이나 이전 작업을, `processing`이 크면 핸들러를, `presentation`이 크면 렌더 범위와 DOM 크기를 본다. 필드 이름은 라이브러리 버전에 따라 다를 수 있으므로 설치한 버전의 타입 정의를 기준으로 쓴다.

### 1-4. 평균이 아니라 p75로 본다

성능 데이터는 긴 꼬리 분포다. 평균은 소수의 매우 느린 값에 끌려가거나, 다수의 빠른 값에 가려진다. Core Web Vitals의 판정 기준도 **75번째 백분위**다. 대시보드에는 라우트별 p75를 두고, 저사양 기기 비중이 높은 서비스라면 p90도 함께 본다.

| 지표 | 좋음(p75) |
|---|---|
| LCP | 2.5초 이하 |
| INP | 200ms 이하 |
| CLS | 0.1 이하 |

---

## 2. 성능 예산: 느려지는 PR을 머지 전에 막는다

Field 데이터는 **배포 후에야** 나빠진 것을 알려준다. 배포 전에 막으려면 CI에서 확인 가능한 대리 지표에 예산을 건다.

### 2-1. 무엇에 예산을 거나

| 예산 | CI에서 측정 가능한가 | 비고 |
|---|---|---|
| 라우트별 First Load JS | ✅ 빌드 결과로 결정적 | 가장 안정적인 게이트 |
| 특정 청크·패키지 크기 | ✅ | 무거운 의존성 추가 감지 |
| Lighthouse LCP·TBT·CLS | △ 실행마다 편차 | 여러 번 실행한 중앙값으로, 여유 있게 |
| INP | ✗ | Field 데이터로 추적 |

### 2-2. 번들 크기 게이트

```json
// .size-limit.json
[
  { "name": "홈 클라이언트 JS", "path": ".next/static/chunks/app/page-*.js", "limit": "60 KB" },
  { "name": "공유 청크", "path": ".next/static/chunks/*.js", "limit": "220 KB" }
]
```

경로 패턴은 프레임워크 빌드 산출물 구조에 따라 달라지므로 실제 빌드 결과를 보고 정한다. 중요한 것은 도구가 아니라 규칙이다.

- 예산을 넘는 PR은 **실패**한다.
- 예산을 올리려면 PR 설명에 **이유**를 적는다. "이 기능이 이만큼의 JS를 쓸 가치가 있다"는 판단이 기록으로 남는다([안티패턴 시리즈 9편](/posts/frontend-antipatterns-9-organization) ADR).
- PR마다 **증감량**을 코멘트로 보여준다. 절대값보다 변화량이 리뷰어의 주의를 끈다.

### 2-3. Lab 지표 게이트

```js
// lighthouserc.js
module.exports = {
  ci: {
    collect: { url: ['http://localhost:3000/', 'http://localhost:3000/products/sample'], numberOfRuns: 3 },
    assert: {
      assertions: {
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
      },
    },
  },
};
```

Lab 지표는 편차가 있으므로 결정적인 항목(CLS처럼 레이아웃이 확정되면 같은 값이 나오는 것)은 `error`, 편차가 큰 항목은 `warn`으로 시작한다. 실패가 잦아서 사람들이 무시하게 되면 게이트는 의미를 잃는다.

---

## 3. 판단을 lint로 기계화한다

이 시리즈에서 다룬 규칙 중 상당수는 **코드만 보고 판정할 수 있다.** 그런 규칙은 리뷰 대상이 아니라 lint 대상이다.

### 3-1. `eslint-plugin-react-hooks`의 recommended 규칙

7.x 버전의 recommended 설정에는 React Compiler와 같은 분석을 쓰는 규칙이 포함되어 있다. 이 시리즈의 내용과 대응시키면 다음과 같다.

| 규칙 | 잡아내는 것 | 관련 편 |
|---|---|---|
| `rules-of-hooks` | 조건문·반복문 안의 훅 | 3편 |
| `exhaustive-deps` | 의존성 배열 누락 | 4편 |
| `set-state-in-effect` | Effect 안에서 동기적으로 setState | 2·4편 Derived State, Effect 연쇄 |
| `set-state-in-render` | 렌더 중 무조건 setState | 2편 |
| `static-components` | 렌더 중 컴포넌트 정의 | 3편 정체성 |
| `purity` | 렌더 중 `Date.now()`, `Math.random()` 등 | 3편 Compiler 전제, 7편 hydration 불일치 |
| `refs` | 렌더 중 `ref.current` 읽기·쓰기 | 3편, 4편 `useEffectEvent` |
| `immutability` | props·state 직접 변경 | 3편 |
| `preserve-manual-memoization` | 컴파일러가 기존 수동 메모이제이션을 보존할 수 없는 코드 | 3편 |
| `error-boundaries` | try/catch로 자식 렌더 에러를 잡으려는 코드 | 5편 |

(규칙 이름과 구성은 7.1 기준이다. 버전이 올라가면 설치한 버전의 recommended 설정을 확인한다.)

도입할 때 지킬 것은 두 가지다.

1. **경고를 주석으로 끄는 것을 리뷰에서 막는다.** `// eslint-disable-next-line react-hooks/exhaustive-deps`는 4편에서 말한 "사실을 속이는 의존성 배열"이다. 끄는 주석에는 이유를 반드시 적게 하고, 가능하면 억제 주석 자체를 검사한다.
2. **기존 코드베이스는 신규·수정 파일부터 `error`로 적용한다.** 한 번에 전체를 고치려는 PR은 머지되지 않는다.

### 3-2. 프로젝트 규칙으로 막을 수 있는 것

```js
// eslint.config.js 일부
{
  files: ['**/*.client.tsx', 'components/**/*.tsx'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'lodash', message: '개별 함수 import 또는 내장 기능을 쓰세요 (7편)' },
        { name: 'moment', message: 'Intl 또는 경량 날짜 라이브러리를 쓰세요 (7편)' },
      ],
      patterns: [
        { group: ['@/lib/db', '@/lib/db/*'], message: '서버 전용 모듈입니다 (7편 server-only)' },
      ],
    }],
  },
}
```

팀이 합의한 "이 라이브러리는 클라이언트에서 쓰지 않는다", "이 경로는 서버 전용이다" 같은 결정을 규칙으로 옮기면, 결정을 모르는 새 팀원도 같은 판단을 따르게 된다.

### 3-3. 기계화하기 어려운 것은 리뷰로

| 기계로 판정 가능 | 사람이 판단해야 함 |
|---|---|
| Effect 안의 setState | 이 state가 애초에 필요한가, 어느 종류의 상태인가(2편) |
| 렌더 중 컴포넌트 정의 | state가 알맞은 위치에 있는가(2·3편) |
| 번들 크기 초과 | 이 기능이 그 크기를 쓸 가치가 있는가 |
| hydration 경고 | Suspense 경계가 UX 단위와 맞는가(5편) |
| 의존성 배열 누락 | 이 값에 반응해야 하는가, `useEffectEvent`가 맞는가(4편) |

---

## 4. 렌더 횟수 회귀 테스트: 핵심 경로에만

3편의 구조 최적화는 리팩터링 한 번에 조용히 깨질 수 있다. 성능이 특히 중요한 경로(대형 목록, 에디터, 대시보드 필터)에는 `<Profiler>`로 커밋 횟수를 검사하는 테스트를 둘 수 있다.

```tsx
import { Profiler } from 'react';
import { render, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

test('필터 입력은 차트를 다시 렌더하지 않는다', async () => {
  const commits: string[] = [];
  const onRender: React.ProfilerOnRenderCallback = (id, phase) => commits.push(`${id}:${phase}`);

  const { getByRole } = render(
    <Dashboard
      chartSlot={
        <Profiler id="chart" onRender={onRender}>
          <RevenueChart />
        </Profiler>
      }
    />,
  );

  await act(async () => { await userEvent.type(getByRole('searchbox'), 'abc'); });

  expect(commits).toEqual(['chart:mount']);   // 입력 3회 후에도 마운트 1회뿐
});
```

> 실행 검증(React 19, jsdom): `children`으로 전달된 `<Profiler>` 하위 컴포넌트는 감싼 컴포넌트의 state를 두 번 바꾼 뒤에도 `onRender`가 `mount` 1회만 기록됐다.

이 테스트는 **구현 세부에 결합**되어 있다. 컴포넌트 구조가 정당한 이유로 바뀌면 테스트도 바뀌어야 한다. 그래서 모든 컴포넌트에 두지 않고, "여기가 다시 느려지면 사용자가 바로 느낀다"는 경로에만 둔다. 테스트 이름에 **무엇을 보장하는지**를 적어서, 깨졌을 때 수정하는 사람이 의도를 알 수 있게 한다.

---

## 5. 코드 리뷰 질문 목록

lint와 CI가 걸러낸 뒤 남는 판단을 편별 질문으로 정리했다. PR 템플릿이나 리뷰 체크리스트로 쓸 수 있다.

**상태 (2편)**
- 새로 추가된 state는 계산으로 대체할 수 없는가?
- 서버 데이터를 클라이언트 state에 복사하고 있지 않은가?
- 필터·정렬·탭처럼 공유되어야 할 값이 URL에 있는가?
- boolean 여러 개가 하나의 흐름을 표현하고 있지 않은가?

**렌더 범위 (3편)**
- 자주 바뀌는 state가 필요 이상으로 위에 있지 않은가?
- Context에 자주 바뀌는 값과 드물게 바뀌는 값이 섞여 있지 않은가?
- 새 `memo`가 있다면, 구조로 해결할 수 없었는가? 넘기는 props가 안정적인가?

**Effect (4편)**
- 이 Effect의 원인은 화면의 존재인가, 사용자 행동인가?
- cleanup이 설정과 대칭인가?

**데이터 (5편)**
- 새 요청이 기존 요청 뒤에 줄을 서지 않는가?
- Suspense 경계가 "함께 나타날 단위"와 맞는가? 스켈레톤 크기가 맞는가?
- 서버 함수에 인증과 입력 검증이 있는가?

**반응성 (6편)**
- 입력 직후 무거운 렌더가 동기로 일어나지 않는가?
- 목록이 커질 수 있는 구조인가? 상한이 있는가?

**번들 (7편)**
- `'use client'`가 필요한 만큼만 내려가 있는가?
- 새 의존성의 크기를 확인했는가? 서버에서 처리할 수 없는가?
- LCP 요소와 폰트 로딩에 영향을 주는가?

---

## 6. 기존 코드베이스에 적용하는 순서

이 시리즈의 내용을 이미 운영 중인 코드에 한꺼번에 적용하려 하면 실패한다. **되돌리기 비용이 낮고, 효과를 측정할 수 있는 것부터** 순서대로 한다.

| 단계 | 작업 | 되돌리기 비용 | 효과 확인 |
|---|---|---|---|
| 1 | Web Vitals Field 수집 시작 (attribution 포함) | 없음 | 기준선 확보 |
| 2 | 번들 크기 측정과 PR별 증감 코멘트(아직 실패시키지 않음) | 없음 | 증가 추세 파악 |
| 3 | hooks lint를 신규·수정 파일에 적용 | 낮음 | 새 문제 유입 차단 |
| 4 | hydration 불일치 경고 제거 | 낮음 | 콘솔 경고 0 |
| 5 | Field 데이터 p75가 가장 나쁜 라우트의 `'use client'` 경계 내리기 | 중간 | 해당 라우트 First Load JS, INP |
| 6 | 같은 라우트의 Effect 연쇄·파생 state 제거, state 위치 조정 | 중간 | Profiler 커밋 수 |
| 7 | 데이터 Waterfall 병렬화, Suspense 경계 재배치 | 중간 | LCP, 스트리밍 순서 |
| 8 | lint 경고 0 확인 후 React Compiler 도입 | 중간 (지시어로 부분 제외 가능) | 렌더 시간 |
| 9 | 번들·Lab 예산을 실패 게이트로 전환 | 낮음 | 회귀 차단 |

1\~2단계를 건너뛰면 5단계 이후의 작업이 효과가 있었는지 알 수 없다. 측정 없이 진행한 최적화는 "좋아진 것 같다"로 끝나고, 다음 리팩터링에서 근거 없이 되돌려진다.

---

## 7. 시리즈 총정리

### 7-1. 관통하는 원리 다섯 가지

시리즈를 관통한 원리를 편별 내용과 연결하면 다음과 같다.

| 원리 | 핵심 문장 | 구체화한 편 |
|---|---|---|
| **1. 진실의 원천은 하나, 나머지는 계산** | state가 두 개면 동기화 코드가 생기고, 그 코드가 버그가 된다 | [2편](/posts/efficient-react-2-state-design) Derived State, ID 선택, 서버 상태는 캐시 · [4편](/posts/efficient-react-4-effects) Effect 제거 |
| **2. 변경의 반경을 구조로 제한** | `memo`는 넓어진 반경을 사후에 막고, 구조는 처음부터 좁힌다 | [3편](/posts/efficient-react-3-render-scope) state 내리기, Composition, Context 분할, selector · [7편](/posts/efficient-react-7-boundaries-and-bundle) `'use client'` 경계 |
| **3. 렌더는 순수하게, 부수효과는 격리** | 순수해야 React가 렌더를 건너뛰고, 멈추고, 다시 시작할 수 있다 | [3편](/posts/efficient-react-3-render-scope) Compiler 전제 · [4편](/posts/efficient-react-4-effects) 이벤트 핸들러와 Effect의 구분 · [6편](/posts/efficient-react-6-responsiveness) 중단 가능한 렌더 |
| **4. 도착 순서를 설계** | 사용자가 느끼는 지연은 계산보다 순서에서 생긴다 | [5편](/posts/efficient-react-5-data-flow) 병렬 요청, Suspense 경계 · [6편](/posts/efficient-react-6-responsiveness) 우선순위 · [7편](/posts/efficient-react-7-boundaries-and-bundle) 코드 분할, LCP |
| **5. 판단은 측정 위에서** | 추측으로 한 최적화는 근거 없이 되돌려진다 | [1편](/posts/efficient-react-1-cost-model) Profiler · [6편](/posts/efficient-react-6-responsiveness) INP 세 구간 · [8편](/posts/efficient-react-8-measure-and-sustain) RUM, 예산, lint |

### 7-2. 디자인 패턴·안티패턴 시리즈와의 관계

세 시리즈는 같은 문제를 다른 방향에서 본다.

- <strong>[디자인 패턴 시리즈](/posts/frontend-design-patterns-1-overview)</strong>는 "각 시대가 어떤 문제를 풀려고 어떤 구조를 만들었는가"를 다뤘다. 그 결론은 *패턴은 언어의 결핍을 메우는 구조물*이었다.
- <strong>[안티패턴 시리즈](/posts/frontend-antipatterns-1-how-to-see)</strong>는 "합리적이었던 선택이 언제 비용으로 바뀌는가"를 다뤘다. 그 결론은 *안티패턴은 실수가 아니라 구조*였다.
- **이 시리즈**는 "React의 비용 구조를 알고 있을 때, 비용이 생기지 않는 구조를 어떻게 고르는가"를 다뤘다.

이어서 보면 한 줄로 정리된다. **React를 효율적으로 쓴다는 것은 API를 많이 아는 것이 아니라, React가 무엇에 비용을 쓰는지 알고 그 비용이 생기지 않는 자리에 코드를 두는 것이다.** 최적화 API는 그 구조가 한계에 닿은 곳에서만 쓴다.

### 7-3. 최종 판단 흐름

```
새 코드를 쓰거나 문제를 발견했다
│
├─ [상태] 이 값은 state여야 하는가?
│    상수 / props / 계산 / 서버 캐시 / URL / 비제어 폼 → 아니라면 state
│    state라면 → 가장 가까운 공통 조상, 불가능한 조합이 없는 모양
│
├─ [범위] 이 state가 바뀌면 어디까지 렌더되는가?
│    내리기 → Composition → Context 분할 → selector → Compiler / memo
│
├─ [효과] 이 코드는 왜 실행되는가?
│    값 → 계산 / 사용자 행동 → 핸들러 / 화면의 존재 → Effect(+cleanup)
│
├─ [도착] 데이터와 코드는 언제 도착하는가?
│    위에서 병렬로 시작 / 경계는 함께 나타날 단위 / 이미 보인 화면은 유지
│
├─ [우선순위] 줄일 수 없는 무거운 작업인가?
│    transition · deferred / Worker / 가상화 / Activity
│
├─ [번들] 이 코드가 브라우저에 가야 하는가?
│    서버 컴포넌트 기본 / 말단에만 'use client' / 행동으로 열리는 것만 분할
│
└─ [유지] 이 판단을 기계가 대신할 수 있는가?
     lint / 예산 / RUM / 핵심 경로 테스트 → 남는 것만 리뷰
```

---

## 8. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| 측정 장치, p75 | [1편 — 측정 장치 5종, 설명 가능성](/posts/frontend-antipatterns-1-how-to-see) |
| 성능 예산, 예산 상향 시 이유 기록 | [9편 — ADR, 부채 사분면](/posts/frontend-antipatterns-9-organization) |
| lint 억제 주석, 리뷰 질문 | [9편 — 코드 리뷰, 임시 코드 영속성](/posts/frontend-antipatterns-9-organization) |
| 렌더 횟수 테스트의 결합도 | [8편 — 테스트 안티패턴](/posts/frontend-antipatterns-8-robustness) |
| 적용 순서 | [1편 — 되돌리기 비용(일방/양방향 문)](/posts/frontend-antipatterns-1-how-to-see) |

---

## 자가진단 체크리스트 (시리즈 전체 요약)

**측정**
- [ ] Field에서 LCP·INP·CLS를 attribution과 함께 수집하고 라우트별 p75를 본다.
- [ ] 성능은 프로덕션 빌드와 CPU 스로틀링 환경에서 측정한다.

**상태·범위·효과**
- [ ] 파생값을 state + Effect로 만들지 않는다.
- [ ] 서버 데이터는 캐시 계층에, 공유될 UI 값은 URL에 있다.
- [ ] 자주 바뀌는 state가 레이아웃 위에 있지 않고, Context는 변경 빈도별로 나뉘어 있다.
- [ ] 컴포넌트를 렌더 중에 정의하지 않고, key는 데이터의 정체성이다.
- [ ] 사용자 행동의 결과는 핸들러에서, 외부 시스템 동기화만 Effect에서 처리한다.

**도착·우선순위·번들**
- [ ] 독립적인 요청은 병렬로 시작하고, Suspense 경계는 UX 단위와 맞다.
- [ ] 입력 직후의 무거운 렌더는 transition·deferred로 분리되어 있다.
- [ ] `'use client'`는 말단에 있고, 라우트별 First Load JS를 알고 있다.
- [ ] LCP 이미지와 폰트가 최적화되어 있고 hydration 경고가 없다.

**유지**
- [ ] hooks recommended lint가 `error`로 적용되어 있고 억제 주석에는 이유가 있다.
- [ ] 번들 예산이 CI 게이트로 걸려 있다.
- [ ] 핵심 경로에 렌더 회귀 테스트가 있다.

---

## 시리즈를 마치며

8편에 걸쳐 다룬 내용은 결국 [1편](/posts/efficient-react-1-cost-model)의 질문 두 개로 돌아간다.

> **"이 state가 바뀌면, 그 변화의 반경은 어디까지인가?"**
> **"이 데이터와 코드는 언제 도착하는가?"**

두 질문에 코드를 보고 답할 수 있고, 그 답을 측정으로 확인할 수 있고, 확인한 판단을 lint와 CI로 고정할 수 있다면, React를 효율적으로 쓰고 있는 것이다.
