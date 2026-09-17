---
# 📌 기본 메타데이터
title: 'React의 탄생 3편 — 치른 대가와 그 이후의 진화'
date: '2026-09-17'
category: 'frontend'
tags: ['React', 'Hooks', 'Fiber', 'React Server Components', 'Signals', 'Frontend']
description: 'JSX를 향한 초기 반발과 Pete Hunt의 반론, 그리고 다시 그리는 비용·로직 재사용·동기 렌더링·상태 관리·SSR·세밀한 갱신이라는 여섯 가지 대가와 그에 대한 대응의 연표.'

# 💬 옵션 필드
draft: false
series: 'React의 탄생'
seriesOrder: 3

# 📚 SEO용
keywords: ['React', 'Pete Hunt', 'Separation of Concerns', 'Hooks', 'Fiber', 'Concurrent', 'Flux', 'Redux', 'React Server Components', 'Signals', 'React Compiler']
---

# React의 탄생 3편 — 치른 대가와 그 이후의 진화

2편에서 본 "전부 다시 그린다"는 발상은 공개 직후부터 환영받지 못했다. 이번 편은 그 반발의 논점, React가 이 선택으로 떠안은 비용, 그리고 그 비용을 줄이려 한 이후의 역사를 차례로 본다.

## 8. 초기 반발과 설득 (2013 ~ 2014)

### 8-1. "관심사 분리를 어긴다"

JSConf US 공개 직후의 반응은 대체로 부정적이었다. 가장 큰 논점은 JSX였다. HTML은 HTML 파일에, 로직은 JS 파일에 두는 것이 **Separation of Concerns** 라는 당시의 통념과 정면으로 부딪혔다.

같은 해 JSConf EU에서 Pete Hunt는 "React: Rethinking Best Practices"라는 발표로 반론을 정리했다. 요지는 이렇다.

- HTML과 JS로 나누는 것은 **기술의 분리(Separation of Technologies)** 이지 관심사의 분리가 아니다.
- 템플릿과 그것을 조종하는 컨트롤러는 **이미 강하게 결합되어 있다.** `ng-repeat`의 변수 이름이 바뀌면 컨트롤러도 바뀐다. 결합이 파일 경계를 넘나들 뿐 사라진 것이 아니다.
- 템플릿 언어는 결국 JavaScript의 기능(조건, 반복, 필터)을 **더 약한 형태로 다시 구현** 한다.
- 진짜 관심사는 "좋아요 버튼", "댓글 목록" 같은 **화면의 기능 단위** 이고, 컴포넌트는 그 단위로 나눈다.

### 8-2. 설득한 것은 논리보다 결과

반발 이후 React 팀은 여러 행사를 돌며 설명을 이어 갔고, 실제 제품에 쓰는 팀이 늘면서 인식이 바뀌었다. 복잡한 편집기, 대시보드처럼 **상태가 많고 여러 곳이 같은 데이터를 보여 주는 화면** 에서 효과가 분명했기 때문이다. 3~5절의 불편은 작은 화면에서는 잘 보이지 않고, 커질수록 커진다. React의 장점도 같은 곡선을 따랐다.

---

## 9. React가 치른 대가와 그 후의 진화 (심화)

모든 해법에는 비용이 있다. React가 "전부 다시 그린다"를 택하면서 떠안은 비용과, 그 비용을 줄이려는 시도가 이후 React의 역사다.

### 9-1. 대가 ① 다시 그리는 비용 → memo, 그리고 Compiler

"전부 다시 그린다"는 **바뀌지 않은 컴포넌트도 함수를 다시 호출한다** 는 뜻이다. Virtual DOM 비교로 DOM 조작은 줄였지만, `render` 호출과 트리 생성·비교 비용은 남는다.

| 시기 | 대응 | 성격 |
|---|---|---|
| 초기 | `shouldComponentUpdate` | 개발자가 직접 판별 |
| 2016 | `PureComponent` | props·state 얕은 비교 자동화 |
| 2018 | `React.memo`, 이후 `useMemo`·`useCallback` | 함수 컴포넌트용 수동 메모이제이션 |
| 2025 | React Compiler 1.0 | 빌드 시점에 메모이제이션 자동 삽입 |

2018년 Svelte의 Rich Harris는 "Virtual DOM is pure overhead"라는 글로, 컴파일 시점에 어떤 값이 어느 DOM에 연결되는지 알 수 있다면 런타임 비교 자체가 불필요하다고 주장했다. 6-5절에서 본 대로 Virtual DOM은 "선언형을 감당할 만하게" 만드는 장치이므로, **같은 선언형을 다른 방법으로 감당할 수 있다면** 대체될 수 있다는 지적이다. React는 Virtual DOM을 유지하되 컴파일러로 불필요한 재계산을 줄이는 쪽을 택했다.

실무 기준은 효율적인 React 1·3편에서 다뤘다. 핵심은 **memo는 사후 처방이고, 구조(state 위치, Composition)가 먼저** 라는 것이다.

### 9-2. 대가 ② 로직 재사용 → Mixin, HOC, Render Props, Hooks

컴포넌트는 화면을 재사용하기에는 좋았지만, **화면 없는 로직**(구독, 데이터 페칭, 창 크기 추적)을 재사용할 방법이 마땅치 않았다.

```
Mixin (createClass 시절)
  → 이름 충돌, 암묵적 의존 → 2016년 공식적으로 권장 중단
HOC (Higher-Order Component)
  → props 출처 불명, 래퍼 지옥
Render Props
  → 중첩 들여쓰기
Hooks (2018 발표, 2019 React 16.8)
  → 로직을 함수로 추출, 호출 순서 규칙이라는 새 제약
```

이 흐름 전체는 디자인 패턴 시리즈 2편에서 같은 데이터 페칭 로직을 네 번 구현하며 다뤘다. Hooks의 "호출 순서 규칙"은 컴포넌트마다 상태를 **호출 순서로 식별** 하는 내부 구조에서 나온 제약이며, 이 역시 "함수를 매번 다시 호출한다"는 모델의 결과다.

### 9-3. 대가 ③ 동기 렌더링 → Fiber, Concurrent

초기 React는 가상 트리 비교를 **재귀 호출로 한 번에** 끝냈다. 트리가 크면 그동안 메인 스레드가 막혀 입력과 애니메이션이 멈춘다.

- **React 16 (2017) — Fiber.** 렌더 작업을 작은 단위(fiber)로 쪼개고, 재귀 대신 반복으로 순회해 **중단하고 재개할 수 있는** 구조로 다시 썼다.
- **React 18 (2022) — Concurrent 기능.** 그 구조 위에서 업데이트에 우선순위를 매기고(`useTransition`, `useDeferredValue`), 급한 입력을 먼저 처리한다. 자동 배칭도 이때 확대됐다.

"전부 다시 그린다"는 모델이 **그리는 작업을 라이브러리가 관리한다** 는 뜻이기도 했기 때문에 가능한 변화다. 개발자가 DOM 명령을 직접 쓰는 구조였다면, 라이브러리가 작업을 중단·재개할 여지가 없다. 내부 동작은 React 내부 시리즈(Fiber, Lane)를, 사용 기준은 효율적인 React 6편을 참고한다.

### 9-4. 대가 ④ 상태 관리의 공백 → Flux, Redux, 그리고 분화

React는 의도적으로 **뷰 라이브러리** 였다. 컴포넌트 트리 바깥, 애플리케이션 전체의 상태를 어떻게 다룰지는 정하지 않았다.

- **Flux (2014).** 5-1절 채팅 버그에 대한 Facebook의 답. 모든 변경을 Action으로 표현하고, 단일 Dispatcher를 거쳐 Store에 반영하고, 뷰는 Store를 구독한다. 7-3절 단방향 흐름을 앱 전체로 확장했다.
- **Redux (2015).** Flux를 단일 스토어와 순수 함수 reducer로 단순화했다. 상태 변경이 `(state, action) => newState`로만 일어나므로 기록·재생(타임트래블)이 구조적으로 가능해졌다. 디자인 패턴 시리즈 4편에서 직접 구현했다.
- **이후.** 서버 데이터는 TanStack Query 같은 캐시 라이브러리로, URL·폼·UI 상태는 각자의 자리로 나뉘었다(효율적인 React 2편 상태 5분류).

### 9-5. 대가 ⑤ 클라이언트가 모든 것을 한다 → SSR, RSC

React는 브라우저에서 화면을 그리므로, 초기에는 **빈 HTML + 큰 JS 번들** 이 기본이었다. 첫 화면이 늦고, 검색 엔진과 저사양 기기에 불리했다.

```
1990s  서버가 HTML 생성 (전이 없음, 대신 전체 새로고침)
2013   브라우저가 전부 그림 (전이 없음, 대신 큰 번들·늦은 첫 화면)
2015~  SSR + Hydration (서버가 HTML 생성, 브라우저가 같은 트리로 다시 연결)
2020~  React Server Components 발표 (서버에서만 실행되는 컴포넌트, 번들에 포함되지 않음)
2024   React 19에서 RSC·Actions 정식화
```

흥미로운 순환이다. React는 서버 렌더링 모델(1절, 5-2절)을 브라우저로 가져오며 태어났고, 이제 **컴포넌트 모델을 유지한 채 일부를 다시 서버로 돌려보내고 있다.** 달라진 점은 "요청마다 페이지 전체를 새로 그린다"가 아니라, **서버 컴포넌트와 클라이언트 컴포넌트가 한 트리 안에 공존하고, 경계에서 각자의 비용을 나눠 진다** 는 것이다. 경계 설계는 효율적인 React 5·7편에서 다뤘다.

### 9-6. 대가 ⑥ 세밀하지 않은 갱신 → Signals의 재부상

4-2절 Knockout의 Fine-grained Reactivity는 "어느 DOM을 고칠지"를 정확히 알았다. React는 대신 "컴포넌트를 다시 호출하고 비교한다"를 택했다. 둘은 서로 다른 비용을 진다.

| | React (다시 호출 + 비교) | Fine-grained (Signals) |
|---|---|---|
| 변경 시 실행 범위 | 상태를 가진 컴포넌트와 그 하위(memo로 제한) | 값을 읽은 계산·DOM 바인딩만 |
| 데이터 모양 | 일반 값, 불변 업데이트 | signal로 감싸거나 Proxy로 추적 |
| 코드 모델 | 렌더 함수가 매번 전체를 기술 | 설정 코드는 한 번, 반응 부분만 재실행 |
| 약점 | 불필요한 재렌더 관리 | 추적 규칙(읽는 방식, 구조 분해 시 추적 끊김) |

2020년대에 SolidJS가 JSX 문법을 쓰면서도 컴포넌트를 한 번만 실행하는 방식을 보였고, Vue 3(Proxy 기반), Preact Signals, Angular Signals, Svelte 5 runes가 같은 방향으로 움직였다. 2010년의 Observable이 **데이터 래핑의 불편을 줄인 형태로** 돌아온 셈이다. React는 컴파일러로 불필요한 재계산을 줄이는 쪽으로 대응하고 있다. 세 엔진(VDOM·Proxy·Signal)의 구현 비교는 디자인 패턴 시리즈 5편에 있다.

### 9-7. 대가 요약

| React의 선택 | 얻은 것 | 치른 비용 | 이후 대응 |
|---|---|---|---|
| 전부 다시 호출 | 전이 코드 제거 | 불필요한 재렌더 | memo → Compiler |
| 함수·클래스 컴포넌트 | 화면 재사용 | 화면 없는 로직 재사용 어려움 | Mixin → HOC → Render Props → Hooks |
| 재귀 비교 | 단순한 구현 | 긴 작업이 메인 스레드 점유 | Fiber → Concurrent |
| 뷰만 담당 | 작은 범위, 조합 자유 | 앱 상태 구조의 공백 | Flux → Redux → 역할별 분화 |
| 브라우저 렌더링 | 풍부한 상호작용 | 번들·첫 화면 | SSR → RSC |
| 컴포넌트 단위 갱신 | 일반 값 사용, 단순한 멘탈 모델 | 세밀도 부족 | Compiler (외부에서는 Signals) |

---

## 10. 정리

### 10-1. 불편 → 원인 → React의 답

| 불편 | 구조적 원인 | 등장한 시대 | React의 답 |
|---|---|---|---|
| 같은 값이 화면마다 다르다 | 상태가 DOM에 복제되어 삶 | jQuery | 상태는 컴포넌트가 소유, DOM은 결과물 |
| 요소 하나 추가에 모든 경로를 고친다 | 전이를 사람이 기술 | jQuery, Backbone | `UI = f(state)`, 전이 제거 |
| 다시 그리면 입력·포커스가 날아간다 | `innerHTML` 전체 교체 | jQuery, Backbone | Virtual DOM + Reconciliation |
| 새로 생긴 요소에 핸들러가 없다 | 요소별 이벤트 바인딩 | jQuery | Synthetic Event + Event Delegation |
| 누가 이 값을 바꿨는지 모른다 | 이벤트 연쇄, 양방향 바인딩 | Backbone, AngularJS | Unidirectional Data Flow |
| 바인딩이 늘수록 입력이 느리다 | 전체 Dirty Checking | AngularJS | 상태를 바꾼 컴포넌트 하위만 다시 그림 |
| 데이터를 전부 감싸야 한다 | Observable 래핑 | Knockout, Ember | 일반 값 + 불변 업데이트 |
| 두 번째 언어(템플릿)를 배운다 | 문자열 템플릿 DSL | 전 시대 공통 | JSX = JavaScript 표현식 |
| 문자열 결합이 XSS를 부른다 | 마크업이 문자열 | 전 시대 공통 | 마크업을 값으로, 기본 escape (XHP 계승) |

### 10-2. 관통하는 원리

1. **화면은 상태의 함수다.** 전이를 적지 말고 결과를 적는다. 서버 렌더링이 가졌던 성질을 브라우저에서 되찾은 것이 React의 출발이다.
2. **진실의 원천은 하나다.** DOM은 진실을 담는 곳이 아니라 진실을 보여 주는 곳이다.
3. **변경은 한 방향으로 흐른다.** 편의성보다 추적 가능성을 택한다.
4. **명령형 작업은 라이브러리에 위임한다.** 위임했기 때문에 라이브러리가 그 작업을 최적화하고(Reconciliation), 쪼개고(Fiber), 순서를 정하고(Concurrent), 서버로 옮길(RSC) 수 있었다.

4번은 React 이후 10여 년의 진화를 설명한다. 개발자가 DOM 명령을 직접 쓰던 구조에서는 불가능했던 변화들이다.

### 10-3. 연표

| 연도 | 사건 |
|---|---|
| 1995 | JavaScript 등장 (Netscape) |
| 1998 | W3C DOM Level 1 |
| 1999 | IE5에 XMLHTTP |
| 2004–2005 | Gmail, Google Maps. "Ajax" 명명 |
| 2006 | jQuery |
| 2010 | Backbone.js, Knockout.js, AngularJS. Facebook XHP 공개 |
| 2011 | Ember.js. React 프로토타입(FaxJS), Facebook 내부 적용 |
| 2012 | Facebook의 Instagram 인수, React 분리 작업 |
| 2013 | React 공개 (JSConf US, 5월). "Rethinking Best Practices" (JSConf EU). Om |
| 2014 | Flux 발표 (F8) |
| 2015 | React Native. `react-dom` 분리 (0.14). Redux |
| 2016 | Mixin 권장 중단 |
| 2017 | React 16 — Fiber |
| 2018 | Hooks 발표. "Virtual DOM is pure overhead" (Svelte) |
| 2019 | React 16.8 — Hooks 정식 |
| 2020 | React 17 — 이벤트 위임 지점 변경. Server Components 발표 |
| 2022 | React 18 — Concurrent 기능 |
| 2024 | React 19 — Actions, RSC 정식 |
| 2025 | React Compiler 1.0. React Foundation 설립 발표 |

### 10-4. 자가진단 체크리스트

- [ ] "명령형"과 "선언형"의 차이를 "전이를 적는가, 결과를 적는가"로 설명할 수 있다
- [ ] 상태가 DOM에 살 때 생기는 문제 세 가지를 말할 수 있다
- [ ] 상태 n개일 때 전이 코드가 왜 늘어나는지, 선언형에서는 왜 사라지는지 설명할 수 있다
- [ ] `innerHTML` 전체 교체가 망가뜨리는 DOM 상태를 세 가지 이상 댈 수 있다
- [ ] Backbone, Knockout, AngularJS가 변경을 감지하는 방식의 차이를 설명할 수 있다
- [ ] Dirty Checking이 여러 바퀴 도는 이유와 반복 상한이 필요한 이유를 설명할 수 있다
- [ ] XHP에서 React로 이어진 세 가지 성질을 말할 수 있다
- [ ] "Virtual DOM이 DOM보다 빠르다"가 왜 부정확한지, 무엇과 비교해야 맞는지 설명할 수 있다
- [ ] Reconciliation의 두 가정과, 각 가정이 오늘날 어떤 규칙(컴포넌트 정체성, key)으로 드러나는지 연결할 수 있다
- [ ] 단방향 데이터 흐름이 양방향 바인딩과 비교해 무엇을 내주고 무엇을 얻었는지 말할 수 있다
- [ ] React의 선택 하나를 골라, 그 대가와 이후 대응(memo/Hooks/Fiber/Redux/RSC/Compiler)을 이어 설명할 수 있다

### 10-5. 이어서 읽기

| 궁금한 것 | 글 |
|---|---|
| 재렌더 비용을 구조로 줄이는 법 | [효율적인 React 1편(비용 모델)](/posts/efficient-react-1-cost-model), [3편(렌더 범위)](/posts/efficient-react-3-render-scope) |
| "전부 다시 그린다"가 실제로 다시 그리는 범위 | [React 렌더링 원리](/posts/react-rendering-principles) |
| React 위에 프레임워크가 또 필요해진 이유 | [Next.js는 무엇이 불편해서 만들어졌나](/posts/why-nextjs-was-born) |
| 로직 재사용 패턴의 변천 | [디자인 패턴 시리즈 2편](/posts/frontend-design-patterns-2-logic-reuse) |
| Flux·Redux를 직접 구현 | [디자인 패턴 시리즈 4편](/posts/frontend-design-patterns-4-redux-internals) |
| VDOM·Proxy·Signal 엔진 비교 | [디자인 패턴 시리즈 5편](/posts/frontend-design-patterns-5-state-and-reactivity) |
| key, 컴포넌트 내부 정의가 왜 문제인가 | [안티패턴 시리즈 3편](/posts/frontend-antipatterns-3-component-design), [효율적인 React 3편](/posts/efficient-react-3-render-scope) |
| Fiber, Lane, 스트리밍의 내부 | [Fiber](/posts/react-fiber-architecture) · [Lane](/posts/react-lane-internals) · [스트리밍](/posts/react-streaming-rendering) |

---

> **부록 — 실행 검증 재현**
>
> ```bash
> mkdir verify && cd verify && npm init -y
> npm i jsdom
> node v.js
> ```
>
> 검증 환경: Node 22.22, jsdom 30.1.0. `v.js`는 이 글 6-3절의 미니 Virtual DOM과 4-3절의 `$digest` 구현을 그대로 담고 있으며, 14건 검증이 모두 통과한다.
> - A: `innerHTML` 재생성 시 input 노드·값·포커스 소실 / VDOM patch 시 유지, DOM 변경 1건
> - B: key 유무에 따른 DOM 변경 내역과 체크 상태 이동
> - C: 부모 타입 변경 시 하위 노드 재생성
> - D: 연쇄 watcher 3바퀴 수렴, 상호 갱신 watcher의 반복 상한 초과
