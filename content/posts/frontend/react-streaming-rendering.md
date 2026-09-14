---
# 📌 기본 메타데이터
title: 'React 스트리밍 렌더링 — Suspense 경계가 응답을 쪼개는 절단선이 되기까지'
date: '2026-04-05'
category: 'frontend'
tags: ['React', 'Streaming', 'SSR', 'Suspense', 'Selective Hydration', 'Next.js']
description: 'RSC와 Suspense가 결합해 서버 렌더링 결과를 조각조각 스트리밍하는 방식과 Selective Hydration까지, 시리즈의 마지막 퍼즐을 맞춥니다.'

# 💬 옵션 필드
draft: false
series: 'React 렌더링 Deep Dive'
seriesOrder: 6

# 📚 SEO용
keywords: ['React', 'Streaming', 'SSR', 'Suspense', 'Selective Hydration', 'Next.js', 'React 렌더링']
---

# React 스트리밍 렌더링 — Suspense 경계가 응답을 쪼개는 절단선이 되기까지

[5편](/posts/react-server-components)에서 Server Component가 `await`로 서버에서 직접 데이터를 가져올 수 있다는 것을 다뤘다. 그런데 이것은 새로운 문제를 만든다. 이번 글에서는 그 문제와 해법 — 스트리밍 — 을 다루며 시리즈의 본편을 마무리한다.

## 문제: 가장 느린 컴포넌트가 전체를 인질로 잡는다

페이지에 컴포넌트가 3개 있다고 하자.

- `<Header />` — 데이터 필요 없음, 즉시 렌더링 가능
- `<PostList />` — DB 조회 200ms
- `<Recommendations />` — 추천 알고리즘 API 2초(!)

서버가 "전부 완성될 때까지" 기다렸다가 응답을 보내면, 가장 느린 `<Recommendations />` 때문에 **사용자는 2초 동안 빈 화면**을 보게 된다. Header는 0ms에 준비됐는데도 말이다.

이 구조, 어디서 본 모양이다. [2편](/posts/react-fiber-architecture)에서 Stack Reconciler가 "한 번 시작하면 끝까지 멈출 수 없어서" 급한 일을 처리하지 못했던 것과 정확히 같은 문제다. 그때의 해법이 "작업을 쪼개서 급한 것부터"였다면, 이번 해법은 <strong>"응답을 쪼개서 준비된 것부터"</strong>다.

## 해법: Suspense 경계가 스트리밍의 절단선이 된다

[3편](/posts/react-suspense)에서 배운 Suspense를 서버에서 그대로 사용한다.

```jsx
export default function Page() {
  return (
    <>
      <Header />
      <Suspense fallback={<PostListSkeleton />}>
        <PostList />
      </Suspense>
      <Suspense fallback={<RecsSkeleton />}>
        <Recommendations />
      </Suspense>
    </>
  );
}
```

이제 서버의 동작이 바뀐다. HTTP 응답을 한 번에 보내고 끝내는 게 아니라, **연결을 열어둔 채 준비되는 대로 조각(chunk)을 흘려보낸다.**

```
[0ms]    Header + 스켈레톤 2개가 담긴 HTML 전송  ← 사용자는 즉시 화면을 본다
[200ms]  PostList 완성 → 해당 조각 전송
[2000ms] Recommendations 완성 → 해당 조각 전송, 연결 종료
```

서버 입장에서 Suspense 경계는 **"여기까지는 먼저 보내도 된다"는 절단선**이다. 클라이언트에서 fallback을 보여주는 UI 장치였던 것이, 서버에서는 응답을 쪼개는 단위가 된다. 같은 컴포넌트, 같은 선언이 두 가지 역할을 한다.

## 나중에 도착한 조각은 어떻게 제자리를 찾아갈까

200ms에 도착한 PostList HTML은 어떻게 스켈레톤 자리에 들어갈까? React가 스트리밍하는 조각을 뜯어보면 이렇게 생겼다.

```html
<!-- 나중에 도착하는 조각 -->
<div hidden id="S:1">
  <ul>...PostList 내용...</ul>
</div>
<script>
  // "S:1의 내용을 B:1(스켈레톤) 자리와 교체하라"
  $RC("B:1", "S:1")
</script>
```

숨겨진 HTML과 함께 **자리를 바꿔치기하는 인라인 스크립트**가 같이 내려온다. 주목할 점은 이 시점에 React 본체(번들)가 아직 로드되지 않았어도 동작한다는 것이다. 몇 줄짜리 DOM 조작 스크립트일 뿐이기 때문이다. 그래서 JS 번들 다운로드와 무관하게 화면이 착착 채워질 수 있다.

## Selective Hydration: hydration도 쪼개진다

스트리밍이 열어준 보너스가 하나 더 있다. [5편](/posts/react-server-components)에서 hydration을 "죽은 HTML에 생명을 불어넣는 과정"이라고 했다. 전통적인 SSR에서는 이것도 **전체가 한 덩어리**였다. 트리 전체가 hydration될 때까지 어떤 버튼도 클릭에 반응하지 않았다.

React 18부터는 Suspense 경계 단위로 **hydration도 조각조각** 진행된다. 그리고 여기서 2편의 Scheduler가 다시 등장한다.

> 사용자가 아직 hydration되지 않은 영역을 **클릭하면**, React는 그 이벤트를 기억해두고 **해당 경계의 hydration을 최우선으로 앞당긴다**. 끝나자마자 그 클릭을 재생(replay)한다.

"급한 것부터"라는 Lane의 철학이 hydration 순서에까지 적용된 것이다. **사용자가 만지는 곳이 곧 우선순위다.**

## 만약 Suspense 경계를 아예 안 쓴다면?

페이지 전체를 `async` Server Component 하나로만 만들면 어떻게 될까?

에러가 날 것 같지만, 나지 않는다. 3편의 "경계 없이 Suspend하면 초기 렌더링에서 에러" 규칙은 **클라이언트에서** 렌더링하다 Suspend됐을 때의 이야기다. 브라우저는 당장 화면에 무언가를 그려야 하는데 보여줄 것이 없으니 에러였다.

서버는 사정이 다르다. 서버에서 렌더링은 **HTTP 요청 처리의 일부**다. `async` 컴포넌트가 `await`하고 있으면 서버는 그냥 기다리면 된다. 응답을 아직 보내지 않았을 뿐이니 에러가 날 이유가 없다.

대신 벌어지는 일은 이것이다. Suspense 경계가 하나도 없으면 **절단선이 없으므로** 서버는 응답을 쪼갤 수 없다.

```
경계 있음:  [0ms] 껍데기 → [200ms] 목록 → [2000ms] 추천
경계 없음:  ......................................... [2000ms] 전부 한 방에
```

가장 느린 `await`가 끝날 때까지 **첫 바이트조차 전송되지 않는다**(TTFB 지연). 기능적으로는 멀쩡히 동작하지만, 스트리밍 이전 시대의 "가장 느린 컴포넌트가 전체를 인질로 잡는" 문제로 정확히 되돌아간다.

교훈을 한 줄로 정리하면:

> **Suspense 경계는 에러를 막는 장치가 아니라, 사용자 경험을 설계하는 도구다.** 경계를 어디에 긋느냐가 곧 "무엇을 먼저 보여줄 것인가"라는 결정이다.

Next.js가 `loading.tsx` 파일 하나만 만들면 페이지를 자동으로 `<Suspense>`로 감싸주는 것도, 이 결정을 개발자가 최소한 한 번은 하게 만드는 설계다.

## 시리즈 전체 그림: 한 번의 요청 안에서

Next.js App Router에서 페이지 하나를 요청하면 벌어지는 일을 시리즈 전체의 언어로 묘사하면 이렇다.

1. 서버가 **Server Component**들을 실행 (5편) — 번들에 없는 코드로 DB 직접 조회
2. `await` 중인 컴포넌트는 **Suspense 경계**에서 잘라 (3편) fallback 먼저 전송
3. 준비되는 대로 **스트리밍**으로 조각 전송, 인라인 스크립트로 교체 (6편)
4. 클라이언트 React가 RSC Payload를 받아 **Reconciliation** (1편)
5. **Selective Hydration**이 사용자 인터랙션 우선으로 진행 (2편의 Scheduler)

렌더링을 "쪼개고, 우선순위를 매기고, 준비된 것부터"라는 하나의 사상이 클라이언트(Fiber)에서 시작해 네트워크(스트리밍)와 서버(RSC)까지 확장된 것 — 그것이 지난 10년의 React 역사다.

| 편 | 주제 | 핵심 질문 |
|----|------|----------|
| 1편 | Virtual DOM, Reconciliation | 무엇을 어떻게 비교하는가 |
| 2편 | Fiber, Scheduler, Lane | 어떻게 멈추고 재개하는가 |
| 3편 | Suspense | 데이터 대기를 어떻게 선언하는가 |
| 4편 | Lane 비트마스크 | 우선순위를 어떻게 구현했는가 |
| 5편 | Server Components | 어디서 렌더링하는가 |
| 6편 | 스트리밍, Selective Hydration | 어떤 순서로 전달하는가 |
