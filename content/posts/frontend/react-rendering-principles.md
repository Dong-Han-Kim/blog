---
# 📌 기본 메타데이터
title: 'React 렌더링 원리 — Virtual DOM, Reconciliation, 그리고 key'
date: '2026-04-05'
category: 'frontend'
tags: ['React', 'Virtual DOM', 'Reconciliation', 'Rendering']
description: 'React가 UI를 어떻게 효율적으로 업데이트하는지, 그 내부 원리를 단계별로 정리합니다.'

# 💬 옵션 필드
draft: false
series: 'React 렌더링 Deep Dive'
seriesOrder: 1

# 📚 SEO용
keywords: ['React', 'Virtual DOM', 'Reconciliation', 'Rendering', 'Fiber', 'key']
---

# React 렌더링 원리 — Virtual DOM, Reconciliation, 그리고 key

React를 사용하면서 `setState`를 호출하면 화면이 바뀐다는 건 알고 있지만, 그 사이에서 정확히 어떤 일이 벌어지는지 설명하라고 하면 막막할 때가 있다. 이 글에서는 React가 UI를 업데이트하는 전체 과정을 단계별로 정리한다.

## 렌더링의 두 단계: Render Phase와 Commit Phase

React의 렌더링은 크게 두 단계로 나뉜다.

### Render Phase — "무엇이 바뀌었는지 계산"

이 단계에서 React는 컴포넌트 함수를 호출하여 새로운 React Element 트리(Virtual DOM)를 생성하고, 이전 트리와 비교(diffing)한다.

핵심은 **이 단계에서 실제 DOM을 전혀 건드리지 않는다**는 점이다. 순수한 계산만 수행한다.

### Commit Phase — "실제 DOM에 변경사항을 반영"

Render Phase에서 계산된 diff 결과를 바탕으로 실제 DOM에 변경사항을 반영하는 단계다. `useEffect`, `useLayoutEffect` 같은 사이드 이펙트도 이 시점에 실행된다.

```
State 변경 → [Render Phase: 새 트리 생성 + Diff] → [Commit Phase: 실제 DOM 반영]
```

이 두 단계의 분리가 React 성능 최적화의 핵심이다. 비용이 큰 DOM 조작을 최소화하기 위해, 먼저 가벼운 JavaScript 객체 수준에서 비교를 마친 뒤 꼭 필요한 변경만 DOM에 적용하는 것이다.

## Virtual DOM은 왜 등장했는가

### 실제 DOM 조작이 비싼 이유

브라우저에서 DOM을 변경하면 다음과 같은 과정이 일어난다.

1. **Reflow** — 변경된 요소와 그 주변의 레이아웃을 다시 계산한다.
2. **Repaint** — 계산된 레이아웃을 기반으로 화면을 다시 그린다.

변경이 잦을수록 이 과정이 반복되며 성능에 큰 부담이 된다.

### "이전에는 전체를 다시 렌더링했다"는 오해

React 이전에도 jQuery나 Vanilla JS로 변경된 부분만 직접 골라서 DOM을 수정하는 건 가능했다. 정확히 하나만 바꾸면 오히려 그게 더 빠를 수도 있다.

진짜 문제는 "**변경된 부분을 개발자가 직접 추적하고 관리하는 것이 너무 복잡했다**"는 것이다.

애플리케이션이 커질수록 상태가 바뀔 때 어떤 DOM 노드를 찾아서 어떤 속성을 바꿔야 하는지 일일이 관리하는 건 사실상 불가능에 가까워진다.

### Virtual DOM의 진짜 가치

Virtual DOM의 핵심 가치는 "DOM 조작보다 빠르다"가 아니다.

> **"개발자는 UI의 최종 상태만 선언하면, React가 알아서 최소한의 DOM 변경을 계산해준다."**

이것이 바로 React가 말하는 **선언형(Declarative) UI**의 핵심이다. 개발자는 `setState`만 호출하면 되고, "어떤 DOM 노드를 찾아서 어떤 속성을 바꿔라" 같은 명령형 코드를 쓸 필요가 없다.

```jsx
// 명령형 (jQuery 시절)
document.getElementById("username").textContent = "홍길동";
document.getElementById("status").classList.add("active");

// 선언형 (React)
setState({ name: "홍길동", isActive: true });
// → React가 알아서 변경된 부분만 DOM에 반영
```

Virtual DOM은 **성능과 개발 편의성 사이의 영리한 트레이드오프**다.

## Reconciliation — 효율적인 트리 비교 전략

React가 이전 Virtual DOM과 새 Virtual DOM을 비교할 때, 모든 노드를 완벽하게 비교하려면 시간 복잡도가 <strong>O(n³)</strong>이다. 노드가 1,000개면 비교 연산이 10억 번이 되는 셈이다.

React는 이를 해결하기 위해 **두 가지 휴리스틱**(가정)을 적용하여 복잡도를 <strong>O(n)</strong>으로 줄였다.

### 가정 1: 타입이 다르면 완전히 다른 트리다

```jsx
// before
<div>
  <Counter />
</div>

// after
<section>
  <Counter />
</section>
```

`<div>` → `<section>`으로 타입이 바뀌면, React는 그 아래 자식들을 비교하지도 않고 **서브트리 전체를 제거한 뒤 새로 생성**한다. `<Counter />`의 state도 초기화된다.

이 전략은 대부분의 실제 상황에서 유효하다. 컨테이너 요소의 타입이 바뀔 정도면 내부 구조도 달라졌을 가능성이 높기 때문이다.

### 가정 2: key를 통해 같은 요소를 식별한다

리스트를 렌더링할 때 `key`를 넣지 않으면 React가 경고를 띄우는 이유가 바로 여기에 있다.

```jsx
// before
<ul>
  <li>사과</li>
  <li>바나나</li>
</ul>

// after — 맨 앞에 "포도" 추가
<ul>
  <li>포도</li>
  <li>사과</li>
  <li>바나나</li>
</ul>
```

`key`가 없으면 React는 위에서부터 순서대로 비교한다.

- 첫 번째 `<li>`: 사과 → 포도 — **변경**
- 두 번째 `<li>`: 바나나 → 사과 — **변경**
- 세 번째 `<li>`: 없음 → 바나나 — **생성**

결과적으로 **3개 모두 다시 렌더링**된다.

`key`를 넣으면:

```jsx
<li key="grape">포도</li>
<li key="apple">사과</li>
<li key="banana">바나나</li>
```

React가 key로 각 요소를 추적하기 때문에 "사과와 바나나는 그대로, 포도만 새로 추가됐구나"라고 판단한다. **1개만 추가**하면 끝이다.

### index를 key로 쓰면 안 되는 이유

```jsx
// before — index가 key
<li key={0}>사과</li>
<li key={1}>바나나</li>

// after — 맨 앞에 "포도" 추가
<li key={0}>포도</li>   // React: "key=0이 바뀌었으니 업데이트"
<li key={1}>사과</li>   // React: "key=1도 바뀌었으니 업데이트"
<li key={2}>바나나</li> // React: "key=2는 새로 생겼으니 생성"
```

index를 key로 쓰면 항목이 추가·삭제·재정렬될 때 key가 전부 밀려버린다. 단순 텍스트라면 그나마 괜찮지만, 각 `<li>` 안에 `<input>`이 있고 사용자가 값을 입력한 상태라면? key=0에 묶여있던 input 상태가 "포도" 항목에 그대로 남아버린다. **데이터와 UI 상태가 엉키는 버그**가 발생하는 것이다.

따라서 key에는 **데이터 자체의 고유 식별자**(DB의 id, UUID 등)를 사용하는 것이 원칙이다.

## 정리

React의 렌더링 과정을 한 문장으로 요약하면 다음과 같다.

> **State가 변경되면 → 컴포넌트 함수를 다시 호출하여 새 Virtual DOM을 생성하고 → Reconciliation으로 이전 트리와 비교한 뒤 → 변경된 부분만 실제 DOM에 반영한다.**

| 개념 | 핵심 |
|------|------|
| **Render Phase** | 새 Virtual DOM 생성 + Diff 계산 (DOM 미접촉) |
| **Commit Phase** | 실제 DOM 반영 + 사이드 이펙트 실행 |
| **Virtual DOM** | 성능보다는 선언형 UI를 가능하게 하는 추상화 계층 |
| **Reconciliation** | 두 가지 휴리스틱으로 O(n³) → O(n) 비교 |
| **key** | 리스트 항목의 동일성을 React에게 알려주는 식별자 |

## 다음 글 예고

이 글에서 다룬 Reconciliation을 실제로 수행하는 엔진이 React 16부터 **Fiber 아키텍처**로 바뀌었다. 이전에는 트리 비교를 시작하면 끝날 때까지 멈출 수 없었지만, Fiber는 작업을 잘게 쪼개서 중간에 더 급한 업데이트를 먼저 처리할 수 있게 만들었다.

다음 글에서는 이 Fiber 아키텍처가 왜 등장했고, 어떻게 동작하는지 다뤄보겠다.
