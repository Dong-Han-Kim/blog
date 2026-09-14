---
# 📌 기본 메타데이터
title: 'React Suspense — 데이터 로딩을 렌더링 시스템 안으로'
date: '2026-04-05'
category: 'frontend'
tags: ['React', 'Suspense', 'Concurrent', 'startTransition']
description: 'Suspense가 어떤 문제를 풀고, Promise를 throw한다는 독특한 메커니즘이 동시성 렌더링과 어떻게 맞물리는지 정리합니다.'

# 💬 옵션 필드
draft: false
series: 'React 렌더링 Deep Dive'
seriesOrder: 3

# 📚 SEO용
keywords: ['React', 'Suspense', 'Concurrent', 'startTransition', 'React 렌더링']
---

# React Suspense — 데이터 로딩을 렌더링 시스템 안으로

[2편](/posts/react-fiber-architecture)에서 Fiber가 렌더링을 멈추고, 재개하고, 버릴 수 있게 만든 과정을 다뤘다. 이번 글에서는 그 기반 위에서 React가 "데이터를 기다리는 동안 무엇을 보여줄 것인가"라는 문제를 어떻게 렌더링 시스템 안으로 끌어들였는지 살펴본다.

## Suspense가 풀려는 문제: 스피너 지옥

전통적인 데이터 로딩 패턴은 이렇다.

```jsx
function UserProfile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser().then(data => {
      setUser(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spinner />;
  return <div>{user.name}</div>;
}
```

이 패턴의 문제는 **로딩 상태 관리가 각 컴포넌트에 흩어진다**는 것이다. 컴포넌트 10개가 각자 데이터를 가져오면 로딩 state도 10개, 스피너도 10개다. 화면 곳곳에서 스피너가 제각각 나타났다 사라지는 "스피너 지옥"이 된다.

Suspense의 발상은 이렇다.

> "컴포넌트가 '나 아직 데이터가 없어서 렌더링 못 해'라고 **React에게 직접 알리게** 하고, 로딩 UI는 **바깥에서 선언적으로** 정하자."

```jsx
<Suspense fallback={<Spinner />}>
  <UserProfile />   {/* 데이터 없으면 스스로 "잠깐만!"이라고 외침 */}
  <UserPosts />     {/* 이 둘 중 하나라도 준비 안 되면 fallback 표시 */}
</Suspense>
```

로딩 상태가 컴포넌트 내부 로직이 아니라 **컴포넌트 트리의 구조**가 됐다. 1편에서 다룬 선언형 철학이 데이터 로딩까지 확장된 것이다.

## 내부 동작: Promise를 throw한다

컴포넌트는 어떻게 "잠깐만!"을 외칠까? 답이 의외인데, **Promise를 throw**한다.

```js
function UserProfile() {
  const user = readUser();  // 데이터가 없으면 내부에서 throw promise;
  return <div>{user.name}</div>;
}
```

`throw`는 원래 에러를 위한 것이지만, 함수 실행을 즉시 중단하고 상위로 전파된다는 성질이 있다. React는 이 성질을 활용한다.

1. 렌더링 중 컴포넌트가 Promise를 throw하면
2. React는 가장 가까운 `<Suspense>` 경계까지 거슬러 올라가
3. 그 자리에 fallback을 렌더링하고
4. throw된 Promise가 resolve되면 **해당 지점부터 렌더링을 재시도**한다

Error Boundary가 에러를 잡는 것과 똑같은 메커니즘으로 "아직 안 됨"을 잡는 것이다.

그리고 "렌더링을 중단했다가 나중에 재시도한다"가 가능한 이유는, **Render Phase가 버려도 되는 순수 계산이기 때문**이다. 2편의 내용이 그대로 전제가 된다.

> **주의**: Promise를 throw하는 것은 React의 공개 API가 아니다. 직접 구현하기보다 이를 지원하는 프레임워크나 라이브러리(Next.js, Relay, TanStack Query, React 19의 `use()` 훅 등)를 통해 사용하는 것이 표준이다.

## 동시성과 만나는 지점: 이미 보이는 화면을 숨기지 마라

Suspense가 진짜 빛나는 것은 **화면 전환** 상황이다. 탭 A를 보고 있다가 탭 B를 클릭했는데, 탭 B의 데이터가 아직 없다고 하자.

동시성 기능 없이라면: 탭 B로 즉시 전환 → 데이터 없음 → **멀쩡히 보던 화면이 사라지고 스피너 등장**. 최악의 UX다.

`startTransition`으로 탭 전환을 감싸면 이야기가 달라진다.

```jsx
startTransition(() => setTab("B"));
```

React는 탭 B 렌더링을 저속 차선의 `workInProgress` 트리에서 진행하다가, Suspend가 발생하면 **커밋을 보류**한다. 화면에는 탭 A가 그대로 유지되고(`isPending`으로 흐림 처리 가능), 탭 B의 데이터가 준비되면 그때 완성된 화면으로 스왑한다. 2편에서 다룬 더블 버퍼링의 실전 활용이다.

fallback이냐 이전 화면 유지냐의 기준은 단순하다.

- **처음 나타나는 콘텐츠** → fallback을 보여준다
- **이미 보이던 콘텐츠를 대체하는 전환** → transition으로 감싸 이전 화면을 유지한다

## Suspense 경계가 없으면 어떻게 될까

컴포넌트가 Promise를 throw했는데 잡아줄 `<Suspense>` 경계가 없다면? throw이므로 트리 최상단까지 전파된다. 그다음은 상황에 따라 갈린다.

### 경우 1: 초기 렌더링 — 에러

첫 렌더링 중 경계 없이 Suspend가 발생하면, React는 이를 처리되지 않은 에러처럼 취급한다.

> "A component suspended while rendering, but no fallback UI was specified."

당연한 결과다. "아직 못 그려요"라고 외쳤는데 대신 보여줄 fallback이 어디에도 없으니, React가 보여줄 수 있는 것이 아무것도 없다. Error Boundary 없는 에러가 앱을 깨뜨리는 것과 같은 구조다.

Next.js 같은 프레임워크가 `loading.tsx` 파일 하나로 자동으로 `<Suspense>`를 감싸주는 이유가 여기에 있다.

### 경우 2: Transition 중 — 에러가 아니라 대기

`startTransition`으로 감싼 업데이트 중에 Suspend가 발생하면, 경계가 없어도 에러가 나지 않는다. **화면에 보여줄 것이 있기 때문이다.** 이전 화면(`current` 트리)이 멀쩡히 존재하므로, React는 fallback을 찾을 필요 없이 커밋을 보류하고 이전 화면을 유지하면 된다.

| 상황 | 경계 없이 Suspend하면 |
|------|---------------------|
| 초기 렌더링 | 에러 — 보여줄 것이 아무것도 없음 |
| Transition 업데이트 | 이전 화면 유지하며 대기 — 보여줄 것이 있음 |

두 동작 모두 하나의 원칙으로 설명된다. **React는 빈 화면을 절대 보여주지 않으려 한다.**

## 정리

시리즈 전체가 하나의 흐름으로 연결된다.

> **Virtual DOM** (무엇을 그릴지 선언) → **Fiber** (작업을 쪼갤 수 있게) → **Scheduler + Lane** (급한 것부터) → **Suspense** (데이터 대기까지 렌더링 시스템 안으로)

| 개념 | 핵심 |
|------|------|
| **Suspense의 목적** | 흩어진 로딩 상태를 트리 구조로 선언 |
| **동작 원리** | Promise를 throw → 가장 가까운 경계가 fallback 렌더링 → resolve 후 재시도 |
| **동시성과의 결합** | transition 중 Suspend 시 커밋 보류, 이전 화면 유지 |
| **경계 부재 시** | 초기 렌더링은 에러, transition은 대기 |
