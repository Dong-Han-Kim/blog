---
# 📌 기본 메타데이터
title: 'React Fiber 아키텍처 — 렌더링을 멈추고, 재개하고, 버릴 수 있는 이유'
date: '2026-04-05'
category: 'frontend'
tags: ['React', 'Fiber', 'Concurrent', 'Scheduler', 'useTransition']
description: 'React 16에서 도입된 Fiber 아키텍처가 왜 등장했고, 어떤 구조로 동시성 렌더링을 가능하게 하는지 정리합니다.'

# 💬 옵션 필드
draft: false
series: 'React 렌더링 Deep Dive'
seriesOrder: 2

# 📚 SEO용
keywords: ['React', 'Fiber', 'Concurrent', 'Scheduler', 'useTransition', 'React 렌더링']
---

# React Fiber 아키텍처 — 렌더링을 멈추고, 재개하고, 버릴 수 있는 이유

[1편](/posts/react-rendering-principles)에서 React 렌더링의 큰 흐름(Virtual DOM, Render/Commit Phase, Reconciliation)을 다뤘다. 이번 글에서는 그 Reconciliation을 실제로 수행하는 엔진, **Fiber 아키텍처**를 파헤쳐 본다.

## 출발점: Stack Reconciler의 한계

React 15까지의 Reconciliation 엔진을 **Stack Reconciler**라고 부른다. 이름 그대로 재귀 호출 스택 기반으로 동작했다.

```
diff(root)
 └─ diff(child1)
     └─ diff(grandchild1)
     └─ diff(grandchild2)
 └─ diff(child2)
     └─ ...
```

재귀로 트리를 파고들며 비교하는 방식인데, 치명적인 특징이 하나 있다. **한 번 시작하면 트리 전체를 다 돌 때까지 멈출 수 없다.** 재귀 함수는 중간에 "잠깐 멈췄다가 나중에 이어서" 할 방법이 없기 때문이다.

### 왜 문제가 되는가: 메인 스레드 블로킹

JavaScript는 싱글 스레드다. 그리고 브라우저는 부드러운 화면을 위해 초당 60프레임, 약 **16.6ms마다 한 번씩** 화면을 그려야 한다.

컴포넌트 트리가 커서 Reconciliation에 300ms가 걸린다고 해보자. 그동안:

- 브라우저는 프레임을 그릴 수 없다. 300ms면 약 **18프레임이 통째로 드랍**된다. 애니메이션이 뚝뚝 끊긴다.
- 사용자가 타이핑해도 이벤트 핸들러가 실행되지 못한다. 이벤트는 큐에 쌓이기만 하고, Reconciliation이 끝난 뒤에야 몰아서 처리된다. 타이핑한 글자가 한참 뒤에 한꺼번에 나타나는 현상이 이것이다.

이벤트 루프 관점에서 보면, 하나의 태스크(Reconciliation)가 너무 길어서 큐에 대기 중인 다른 태스크들(입력 이벤트, 렌더링)이 굶고 있는 상황이다. 사용자가 체감하는 것은 "느림"이 아니라 <strong>"멈춤(freeze)"</strong>이다.

### Fiber가 해결하려는 문제

React 팀의 문제의식은 이랬다.

> "Reconciliation 작업을 **잘게 쪼개서**, 중간중간 브라우저에게 제어권을 돌려주면 어떨까? 급한 일(사용자 입력, 애니메이션)을 먼저 처리하게 하고, 남는 시간에 이어서 계산하면 되지 않을까?"

이를 위해서는 세 가지가 필요하다.

1. 작업을 <strong>중단(pause)</strong>할 수 있어야 한다
2. 중단한 지점부터 <strong>재개(resume)</strong>할 수 있어야 한다
3. 작업에 <strong>우선순위(priority)</strong>를 매길 수 있어야 한다

그런데 재귀 호출 스택으로는 불가능하다. 콜 스택은 중간에 저장했다가 복원할 수 없다.

그래서 React 팀은 결정했다. **"콜 스택을 우리가 직접 구현하자."** 브라우저의 콜 스택 대신, 중단하고 재개할 수 있는 가상의 스택 프레임을 만든 것이다. 그 스택 프레임 하나하나가 바로 **Fiber 노드**다.

## Fiber 노드의 구조: 연결 리스트로 변한 트리

재귀는 "자식을 다 처리하고 부모로 돌아가는" 정보를 콜 스택이 자동으로 기억해준다. 콜 스택 없이 트리를 한 노드씩 순회하다가 아무 지점에서나 멈추고 재개하려면, 각 노드가 연결 정보를 직접 들고 있어야 한다.

그래서 각 Fiber 노드는 **3개의 포인터**를 가진다.

```
       ┌─────────┐
       │  App    │
       └─────────┘
        child ↓ ↑ return
       ┌─────────┐  sibling   ┌─────────┐
       │ Header  │ ─────────→ │  Main   │
       └─────────┘            └─────────┘
                               child ↓ ↑ return
                              ┌─────────┐  sibling  ┌─────────┐
                              │  List   │ ────────→ │ Footer  │
                              └─────────┘           └─────────┘
```

- **`child`** — 첫 번째 자식
- **`sibling`** — 바로 다음 형제
- **`return`** — 부모

이 구조에서 트리는 사실상 <strong>연결 리스트(Linked List)</strong>가 된다. 순회 규칙은 단순하다.

1. `child`가 있으면 자식으로 내려간다
2. 없으면 `sibling`으로 간다
3. `sibling`도 없으면 `return`으로 올라가 부모의 `sibling`을 찾는다

### 이 구조가 혁명적인 이유

재귀는 "지금 어디까지 했는지"를 콜 스택이 기억하지만, 이 구조에서는 **"지금 처리 중인 Fiber 노드 하나"를 가리키는 포인터 변수 하나**만 기억하면 된다.

```js
let nextUnitOfWork = currentFiber;

while (nextUnitOfWork !== null && 시간이_남았는가()) {
  nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
}
// 시간이 없으면 루프를 빠져나온다.
// nextUnitOfWork에 "다음에 할 일"이 저장되어 있으니
// 나중에 이 변수부터 다시 시작하면 된다.
```

`while` 루프이므로 언제든 멈출 수 있고, 변수 하나만 있으면 그 지점부터 재개할 수 있다. Fiber 노드 하나를 처리하는 것이 <strong>작업의 최소 단위(unit of work)</strong>가 된다.

## Scheduler와 Time Slicing: 브라우저에게 양보하기

작업을 쪼갤 수 있게 됐으니, 이제 "언제 양보할지"를 정해야 한다.

React는 작업을 **약 5ms의 짧은 조각**으로 쪼개서 실행한다. 한 조각이 끝날 때마다 "지금 브라우저가 처리해야 할 급한 일이 있는가?"를 확인하고, 있으면 메인 스레드를 <strong>양보(yield)</strong>한다. 브라우저가 급한 일을 끝내면 다시 이어서 작업한다.

개념적으로는 브라우저의 `requestIdleCallback`과 같은 아이디어지만, 브라우저 지원과 호출 빈도 문제 때문에 React는 이를 직접 구현한 **Scheduler**라는 자체 패키지를 사용한다. 이렇게 작업을 잘게 썰어 프레임 사이사이에 끼워 넣는 기법을 **Time Slicing**이라고 부른다.

비유하면, 주방장이 300인분 요리를 한 번에 만드는 게 아니라 5인분 만들 때마다 홀을 확인하고, 주문이 들어오면 그것부터 받고 다시 요리하는 것이다.

## 절반만 그려진 화면은 왜 안 보이는가

작업을 쪼개서 처리하다 중단됐을 때, 사용자에게 절반만 렌더링된 화면이 보이면 안 된다. React는 이 문제를 두 가지 장치로 해결한다.

### 중단 가능한 것은 Render Phase뿐이다

1편에서 다뤘듯 Render Phase는 실제 DOM을 건드리지 않는 순수 계산이다. 그러므로 이 단계는 아무리 쪼개고, 멈추고, 심지어 **버리고 다시 시작해도** 사용자 화면에 아무 영향이 없다.

반면 Commit Phase는 실제 DOM을 수정하므로, React는 이 단계를 **동기적으로, 한 번에, 끝까지** 실행한다. Commit은 계산된 변경사항을 반영만 하는 것이라 빠르다. 시간이 오래 걸리는 것은 비교·계산인 Render Phase이고, 정확히 그 부분만 쪼갠 것이다.

### 더블 버퍼링: 두 개의 Fiber 트리

"계산을 중간까지 했는데 버려도 된다"가 가능하려면, 작업 중인 트리와 화면에 보이는 트리가 분리되어야 한다. React는 **Fiber 트리를 2개** 유지한다.

- **`current` 트리** — 지금 화면에 그려져 있는 상태
- **`workInProgress` 트리** — 뒤에서 조립 중인 다음 상태

Render Phase는 `workInProgress` 트리에서만 작업한다. 그동안 화면(`current`)은 온전히 유지된다. Commit까지 완료되면 React는 포인터 하나만 바꿔 **`workInProgress`를 새로운 `current`로 교체**한다.

게임 그래픽의 **더블 버퍼링**과 같은 기법이다. 보여주는 버퍼와 그리는 버퍼를 분리하고, 완성되면 통째로 스왑한다. 사용자는 언제나 완성된 화면만 본다.

## Lane: 모든 업데이트가 똑같이 급하지 않다

검색창에 타이핑하는 상황을 생각해 보자. 두 가지 업데이트가 발생한다.

1. **input에 글자가 나타나는 것** — 즉각적이어야 한다. 늦으면 사용자는 앱이 고장났다고 느낀다.
2. **1만 개 목록을 필터링해 다시 그리는 것** — 100~200ms 늦어도 아무도 모른다.

React 17까지는 이 둘을 구분할 방법이 없었다. 같은 우선순위로 처리되므로, 무거운 목록 렌더링이 input 글자 표시까지 붙잡고 늘어졌다.

React 18부터는 내부에 <strong>Lane(차선)</strong>이라는 우선순위 체계가 생겼다. 클릭·타이핑 같은 **긴급(urgent) 업데이트**는 추월 차선으로, 무거운 화면 전환 같은 **전환(transition) 업데이트**는 저속 차선으로 배정된다.

핵심 동작은 이것이다.

> **저속 차선 작업을 처리하는 도중 추월 차선 업데이트가 들어오면, React는 하던 작업을 버리고 급한 것부터 처리한 뒤, 저속 작업을 처음부터 다시 시작한다.**

이것이 가능한 이유가 바로 지금까지의 설계다. Render Phase는 DOM을 건드리지 않으니 버려도 되고, `workInProgress` 트리에서 작업하니 화면은 온전하다. **Fiber의 모든 설계가 여기서 합쳐진다.**

## useTransition — "이 업데이트는 안 급해요"

기본적으로 모든 업데이트는 긴급으로 취급된다. 개발자가 "이건 안 급하다"고 표시해야 저속 차선으로 간다. 그 도구가 `useTransition`이다.

```jsx
function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    setQuery(e.target.value);            // 긴급 — input에 글자 바로 표시

    startTransition(() => {
      setResults(filterHugeList(e.target.value));  // 전환 — 늦어도 됨
    });
  }

  return (
    <>
      <input value={query} onChange={handleChange} />
      {isPending && <Spinner />}
      <HugeList items={results} />
    </>
  );
}
```

`startTransition`으로 감싼 state 업데이트는 저속 차선으로 배정된다. 사용자가 빠르게 타이핑하면 input은 즉각 반응하고, 목록 렌더링은 뒤에서 진행되다가 — 타이핑이 계속되면 **진행 중이던 렌더링을 버리고 다시 시작**한다. `isPending`으로 "계산 중" 표시도 할 수 있다.

## useDeferredValue — "이 값은 한 박자 늦게 따라와도 돼요"

`useDeferredValue`는 같은 문제를 다른 각도에서 푼다. 업데이트를 감싸는 게 아니라 **값 자체를 지연**시킨다.

```jsx
function SearchPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);  // 한 박자 늦게 따라오는 값

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <HugeList query={deferredQuery} />  {/* 지연된 값으로 렌더링 */}
    </>
  );
}
```

타이핑하면 `query`는 즉시 바뀌지만, `deferredQuery`는 React가 여유 있을 때 저속 차선에서 따라온다. input은 항상 즉각 반응하고, 무거운 목록은 늦게 갱신된다.

### 둘의 차이: 누가 업데이트를 트리거하는가

- **`useTransition`** — `setState`를 직접 호출하는 위치에서 감쌀 수 있을 때. 소스에서 "이 업데이트는 전환"이라고 표시한다.
- **`useDeferredValue`** — 업데이트 트리거에 접근할 수 없을 때. props로 값이 내려오는 자식 컴포넌트는 부모의 setState를 감쌀 수 없다. 그럴 때 받은 값을 지연시킨다.

같은 Lane 메커니즘을 사용하는 두 개의 입구다.

## 정리

| 단계 | 내용 |
|------|------|
| **문제** | Stack Reconciler는 중단 불가 → 메인 스레드 블로킹 → 프레임 드랍, 입력 지연 |
| **구조** | Fiber 노드 = 가상 스택 프레임, child/sibling/return 연결 리스트 |
| **실행** | Scheduler가 약 5ms 단위 Time Slicing으로 브라우저에 양보 |
| **안전장치** | Render/Commit 분리 + 더블 버퍼링으로 화면은 항상 온전 |
| **결실** | Lane 우선순위 → `useTransition`, `useDeferredValue` 등 동시성 기능 |

주목할 점은 시간 축이다. 1~4번은 React 16(2017년)에서 이미 깔린 기반이고, 5번은 React 18(2022년)에서야 개방된 열매다. Fiber는 **미래의 동시성 기능을 위한 5년짜리 밑작업**이었던 셈이다.

## 다음 글 예고

Fiber와 Lane이라는 기반 위에서, React는 "데이터를 기다리는 동안 무엇을 보여줄 것인가"라는 문제까지 렌더링 시스템 안으로 끌어들였다. 다음 글에서는 **Suspense**와 동시성 렌더링이 실제 사용자 경험에서 어떻게 작동하는지 다뤄보겠다.
