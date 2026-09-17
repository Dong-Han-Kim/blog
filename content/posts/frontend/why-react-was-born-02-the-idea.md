---
# 📌 기본 메타데이터
title: 'React의 탄생 2편 — "전부 다시 그린다"는 발상과 Virtual DOM'
date: '2026-09-17'
category: 'frontend'
tags: ['React', 'Virtual DOM', 'Reconciliation', 'JSX', 'Flux', 'Frontend']
description: 'Facebook의 읽지 않은 메시지 버그와 XHP, Jordan Walke의 질문에서 출발해 UI = f(state), 미니 Virtual DOM 구현, Reconciliation의 두 가정, 그리고 JSX·단방향 흐름 같은 함께 온 설계 결정까지.'

# 💬 옵션 필드
draft: false
series: 'React의 탄생'
seriesOrder: 2

# 📚 SEO용
keywords: ['React', 'Virtual DOM', 'Reconciliation', 'JSX', 'XHP', 'Jordan Walke', 'UI = f(state)', 'Unidirectional Data Flow', 'Synthetic Event', '불변성']
---

# React의 탄생 2편 — "전부 다시 그린다"는 발상과 Virtual DOM

1편에서는 서버가 화면을 그리던 시대부터 MV* 프레임워크까지, "화면을 어떻게 고칠지"를 사람이 직접 적어야 했던 구조를 따라왔다. 이번 편은 그 구조가 Facebook이라는 규모에서 어떤 모습이 됐고, React가 어떤 발상으로 그 벽을 넘었는지를 본다.

## 5. Facebook의 사정 (2010 ~ 2013)

### 5-1. 규모가 만든 문제

Facebook의 웹 클라이언트에는 뉴스피드, 채팅, 알림, 광고 관리 도구처럼 **같은 데이터를 여러 곳이 동시에 보여 주고, 실시간으로 바뀌는** 화면이 많았다. 코드를 수정하는 엔지니어도 많았고 배포도 잦았다. 내부에서는 BoltJS라는 자체 MVC 계열 프레임워크를 쓰고 있었는데, 4절에서 본 구조적 불편(뷰 갱신을 직접 관리, 이벤트 연쇄 추적)이 규모에 비례해 커졌다.

이 시기의 상징적인 사례가 **채팅의 읽지 않은 메시지 수** 다. 2014년 F8에서 Flux를 소개하며 Facebook이 공개한 이야기에 따르면, 메시지를 다 읽었는데도 알림 숫자가 남아 있는 버그가 고쳐도 다시 나타나기를 반복했다. 원인은 특정 코드 한 줄이 아니라 구조였다. 같은 "읽음 여부"를 여러 모델과 뷰가 각자 들고 있었고, 서로의 변경을 이벤트로 전파했다. 어떤 순서로 이벤트가 도착하느냐에 따라 결과가 달라졌다. 3-3절(같은 사실의 복제)과 4-1절(이벤트 연쇄)이 결합된 형태다.

### 5-2. XHP — 서버에서 이미 풀어 둔 답

Facebook의 서버 코드는 PHP였고, 2010년에 공개한 **XHP** 라는 PHP 확장을 쓰고 있었다. XHP는 PHP 문법 안에 XML 리터럴을 쓰게 했다. (아래는 개념 스케치다.)

```php
<?php
// 문자열이 아니라 객체. $name은 자동으로 escape된다
$greeting = <div class="greeting">Hello, {$name}</div>;

// 사용자 정의 컴포넌트
class :ui:like-button extends :x:element {
  attribute int count;
  protected function render() {
    return <button class="like">좋아요 {$this->getAttribute('count')}</button>;
  }
}

echo <div><ui:like-button count={$count} /></div>;
```

XHP가 준 것은 세 가지다.

1. **마크업이 문자열이 아니라 값(객체)이다.** 조합할 수 있고, 함수의 반환값이 될 수 있다.
2. **기본이 escape다.** 문자열 결합에서 생기던 XSS를 구조로 막았다.
3. **컴포넌트로 합성한다.** `<ui:like-button>`은 자기 `render`를 가진 재사용 단위다.

그리고 XHP가 사는 환경, 즉 서버 렌더링은 1절에서 본 성질을 갖고 있었다. **요청마다 전체를 다시 그린다. 전이 코드가 없다.**

### 5-3. Jordan Walke의 질문

Facebook 엔지니어 Jordan Walke는 이 조합을 클라이언트로 가져올 수 없는지 물었다.

> 서버에서처럼 **상태가 바뀔 때마다 컴포넌트 트리 전체를 다시 그리는** 모델을 브라우저에서 쓸 수 있다면, 전이 코드와 이벤트 연쇄가 한꺼번에 사라진다.

걸림돌은 3-6절 그대로였다. 브라우저에서 전체를 다시 그리면 **느리고, DOM 상태가 사라진다.** 그가 만든 프로토타입(FaxJS)의 핵심은 이 걸림돌을 넘는 방법, 즉 "다시 그린 결과를 실제 DOM에 곧바로 쓰지 않고, 이전 결과와 비교해 **달라진 부분만** 반영한다"는 것이었다.

### 5-4. 사내 적용에서 공개까지

| 시기 | 사건 |
|---|---|
| 2010 | XHP 공개 |
| 2011 | Jordan Walke의 프로토타입(FaxJS). 이후 React로 발전해 뉴스피드 등에 적용 |
| 2012 | Facebook이 Instagram 인수. Instagram 웹에 React를 쓰려면 Facebook 코드베이스에서 분리해야 했고, 이 작업(Pete Hunt 주도)이 오픈소스화의 기반이 됨 |
| 2013년 5월 | JSConf US에서 React 공개 |

---

## 6. React의 핵심 발상 — "전부 다시 그린다"

### 6-1. UI = f(state)

React의 출발점은 한 줄이다.

```
UI = f(state)
```

컴포넌트는 상태를 받아 **화면이 어떤 모양이어야 하는지** 를 반환하는 함수다. 상태가 바뀌면 React가 함수를 다시 호출한다. 개발자는 "어떻게 고칠지"를 적지 않는다.

2013년 공개 당시의 API로 보면 이렇다.

```jsx
/** @jsx React.DOM */
var LikeButton = React.createClass({
  getInitialState: function () {
    return { liked: false, count: 0 };
  },
  handleClick: function () {
    var liked = !this.state.liked;
    this.setState({ liked: liked, count: this.state.count + (liked ? 1 : -1) });
  },
  render: function () {
    return (
      <div>
        <button className={this.state.liked ? 'active' : ''} onClick={this.handleClick}>
          좋아요 {this.state.count}
        </button>
        {this.state.count === 1 && <span className="first-like-badge">첫 좋아요!</span>}
      </div>
    );
  },
});

React.renderComponent(<LikeButton />, document.getElementById('root'));
```

3-3절 jQuery 코드와 비교하면:

| | jQuery | React |
|---|---|---|
| 상태 위치 | `.active` 클래스, `<span>` 텍스트 | `this.state` |
| 상태 읽기 | DOM에서 파싱 | 객체에서 읽기 |
| 배지 표시 | "0에서 1로 갈 때 show, 1에서 0으로 갈 때 hide" | "count가 1이면 있다" |
| 새 요소 추가 시 | 모든 전이 경로 수정 | `render`에 한 줄 |

배지 코드가 핵심이다. jQuery는 **변화(전이)** 를 적었고, React는 **조건(상태)** 을 적었다.

### 6-2. 왜 그냥 다시 그리면 안 되는가 → Virtual DOM

"매번 `render`를 호출해 전체를 다시 만든다"를 `innerHTML`로 구현하면 3-6절 문제로 돌아간다. React는 `render`의 결과를 **실제 DOM이 아닌 가벼운 JavaScript 객체 트리** 로 만든다. 이것이 **Virtual DOM** 이다.

```
setState
  → render() 호출 → 새 가상 트리 (JS 객체, 만들기 싸다)
  → 이전 가상 트리와 비교 (Reconciliation)
  → 달라진 부분만 실제 DOM에 명령형으로 반영 (Commit)
```

개발자는 선언형으로 적고, **명령형 변환은 라이브러리가 대신한다.** 3-6절 끝의 딜레마("선언형이면 화면이 망가지고, 명령형이면 코드가 망가진다")를 역할 분리로 푼 것이다.

- 코드 입장: 매번 전체를 다시 그린다 → 전이 코드 없음
- DOM 입장: 바뀐 노드만 수정된다 → 포커스·입력값·스크롤 유지, 불필요한 DOM 조작 없음

### 6-3. 직접 만들어 보기 — 미니 Virtual DOM

원리를 확인하려고 70줄 남짓으로 구현한다. React의 실제 구현과는 다르다(React 내부 시리즈 참고). 여기서는 **"비교해서 필요한 명령만 만든다"** 는 발상만 확인한다.

**① 가상 노드 만들기.** JSX는 결국 이 함수 호출로 바뀐다.

```js
function h(type, props, ...children) {
  return { type, props: props ?? {}, key: props?.key, children: children.flat() };
}
const isText = (v) => typeof v !== 'object';

// <p>알림 {n}개</p>  ≡  h('p', null, '알림 ', n, '개')
```

**② 가상 노드 → 실제 DOM (최초 생성).**

```js
function createDom(vnode) {
  if (isText(vnode)) return document.createTextNode(String(vnode));
  const el = document.createElement(vnode.type);
  setProps(el, {}, vnode.props);
  vnode.children.forEach((c) => el.appendChild(createDom(c)));
  return el;
}

function setProps(el, oldProps, newProps) {
  for (const k in oldProps) {
    if (k === 'key' || k in newProps) continue;
    if (k.startsWith('on')) el[k.toLowerCase()] = null;
    else el.removeAttribute(k);
  }
  for (const k in newProps) {
    if (k === 'key' || oldProps[k] === newProps[k]) continue;   // 같으면 건드리지 않는다
    if (k.startsWith('on')) el[k.toLowerCase()] = newProps[k];
    else el.setAttribute(k, newProps[k]);
  }
}
```

**③ 비교하고 필요한 명령만 실행 (patch).**

```js
function patch(parent, dom, oldV, newV) {
  if (oldV === undefined) {                       // 새로 생김
    const d = createDom(newV);
    parent.appendChild(d);
    return d;
  }
  if (newV === undefined) {                       // 사라짐
    parent.removeChild(dom);
    return null;
  }
  if (isText(oldV) && isText(newV)) {             // 텍스트끼리
    if (String(oldV) !== String(newV)) dom.nodeValue = String(newV);
    return dom;
  }
  if (isText(oldV) || isText(newV) || oldV.type !== newV.type) {
    const d = createDom(newV);                    // 종류가 다르면 통째로 교체
    parent.replaceChild(d, dom);
    return d;
  }
  setProps(dom, oldV.props, newV.props);          // 같은 종류면 노드를 재사용하고 속성만
  patchChildren(dom, oldV.children, newV.children);
  return dom;
}
```

**④ 자식 목록 비교.** key가 없으면 위치(인덱스)로, 있으면 key로 짝을 찾는다.

```js
function patchChildren(parent, oldCh, newCh) {
  const doms = Array.from(parent.childNodes);
  const keyed = newCh.length > 0 && newCh.every((c) => !isText(c) && c.key != null);

  if (!keyed) {
    newCh.forEach((c, i) => patch(parent, doms[i], oldCh[i], c));
    for (let i = oldCh.length - 1; i >= newCh.length; i--) parent.removeChild(doms[i]);
    return;
  }

  const oldByKey = new Map(oldCh.map((c, i) => [c.key, { vnode: c, dom: doms[i] }]));
  newCh.forEach((c, i) => {
    const hit = oldByKey.get(c.key);
    let d;
    if (hit) {
      d = patch(parent, hit.dom, hit.vnode, c);   // 같은 key → 같은 노드 재사용
      oldByKey.delete(c.key);
    } else {
      d = createDom(c);
    }
    const at = parent.childNodes[i];
    if (at !== d) parent.insertBefore(d, at ?? null);   // 필요할 때만 이동
  });
  for (const { dom: d } of oldByKey.values()) parent.removeChild(d);
}
```

**⑤ 진입점.**

```js
function createRoot(container) {
  let prevV, rootDom;
  return {
    render(nextV) {
      rootDom = patch(container, rootDom, prevV, nextV);
      prevV = nextV;
    },
  };
}
```

**사용해 보기.** 3-6절과 같은 시나리오다.

```js
const root = createRoot(box);
const App = (n) =>
  h('div', null,
    h('p', null, '알림 ', n, '개'),
    h('input', { class: 'q' }),
  );

root.render(App(0));
// 사용자가 input에 'hel'을 입력하고 포커스를 둔 상태
root.render(App(1));   // 코드는 "전부 다시 그린다"
```

> 실행 검증(Node 22 + jsdom, `verify/v.js` A):
> - 두 번째 `render` 후 input은 **같은 노드**, `value`는 `hel` 그대로, 포커스 유지.
> - MutationObserver로 기록한 실제 DOM 변경은 `characterData` **1건** (숫자 텍스트 `0` → `1`)뿐이었다.
> - 같은 시나리오를 `innerHTML`로 하면 input이 새로 생성되고 입력값·포커스가 사라진다.

코드는 전체를 다시 기술했지만 DOM에는 명령 한 줄만 나갔다. 이것이 "전부 다시 그린다"가 브라우저에서 성립하는 이유다.

### 6-4. Reconciliation의 두 가정

두 트리의 최소 편집 거리를 구하는 일반 알고리즘은 노드 수 n에 대해 O(n³) 수준이다. 1,000개 노드면 10억 번 단위의 연산이 필요해 매 갱신마다 돌릴 수 없다. React는 두 가지 가정을 두어 O(n)으로 줄였다. 위 미니 구현도 같은 가정을 따른다.

**가정 1. 타입이 다르면 서브트리 전체가 다르다.** `<section>`이 `<article>`로 바뀌면 자식을 비교하지 않고 통째로 새로 만든다. 같은 자식 구조를 가진 다른 타입으로 바뀌는 경우는 드물다는 판단이다.

> 실행 검증(`verify/v.js` C): 부모가 `section`에서 `article`로 바뀌면, 자식 `input`의 구조가 같아도 새 노드가 만들어지고 입력값이 사라진다.

이 가정은 오늘날 React에서 **컴포넌트 정체성** 규칙으로 드러난다. 부모 컴포넌트 안에서 자식 컴포넌트를 정의하면 렌더마다 "다른 타입"이 되어 state가 초기화된다(효율적인 React 3편, 안티패턴 시리즈 3편).

**가정 2. 형제 사이에서는 key로 같은 항목을 식별한다.** key가 없으면 위치로 비교한다.

```js
const List = (items) => h('ul', null, items.map((t) => h('li', { key: t }, t)));
root.render(List(['b', 'c', 'd']));
// 사용자가 b 항목을 체크 (DOM 쪽 상태)
root.render(List(['a', 'b', 'c', 'd']));   // 맨 앞에 a 추가
```

> 실행 검증(`verify/v.js` B):
>
> | | 실제 DOM 변경 | 체크 표시가 붙은 항목 |
> |---|---|---|
> | key 없음 | 텍스트 3건 수정(b→a, c→b, d→c) + 끝에 노드 1개 추가 | **a** (엉뚱한 항목) |
> | key 있음 | 맨 앞에 노드 1개 삽입 | **b** (그대로) |

key가 없으면 "첫 번째 `<li>`는 여전히 첫 번째 `<li>`"로 보고 텍스트만 바꾼다. 결과 텍스트는 맞지만, 노드에 붙어 있던 상태(체크, 포커스, 컴포넌트 state)는 **위치를 따라가고 데이터를 따라가지 않는다.** `key={index}`가 위험한 이유가 이것이다(안티패턴 시리즈 3편).

### 6-5. 정리: Virtual DOM은 "빠르게"가 아니라 "선언형을 감당할 만하게"

흔한 오해가 "Virtual DOM이 DOM보다 빠르다"다. 같은 변경을 손으로 정확히 한 줄 쓴 명령형 코드보다, 트리를 만들고 비교하는 과정이 추가된 쪽이 빠를 수는 없다. Virtual DOM이 이긴 비교 대상은 두 가지다.

1. `innerHTML` 전체 교체 → 훨씬 적은 DOM 조작, DOM 상태 보존
2. 사람이 쓴 전이 코드 → 같은 수준의 정확성을, 전이 코드 없이

즉 Virtual DOM은 **선언형으로 적는 비용을 실용적인 수준으로 낮추는 장치** 다. 이 구분은 9-1절과 9-6절에서 다시 중요해진다.

---

## 7. React가 함께 가져온 설계 결정

"전부 다시 그린다"를 성립시키려면 주변 설계도 맞춰야 했다.

### 7-1. 템플릿 대신 JavaScript — JSX

React는 템플릿 언어를 만들지 않았다. 화면 기술을 **JavaScript 표현식** 으로 한다. JSX는 그 위의 문법 설탕이며, 컴파일하면 함수 호출이 된다.

```jsx
<ul>{items.filter((i) => !i.done).map((i) => <li key={i.id}>{i.title}</li>)}</ul>

// ↓ 컴파일 결과 (개념)
React.createElement('ul', null,
  items.filter((i) => !i.done).map((i) => React.createElement('li', { key: i.id }, i.title)));
```

- 반복은 `map`, 조건은 `&&`·삼항, 필터는 `filter`. **새로 배울 문법이 없다**(4-4절).
- 마크업이 값이므로 변수에 담고, 함수로 반환하고, 인자로 넘길 수 있다(5-2절 XHP의 성질).
- 린터·타입 검사·에디터가 화면 코드까지 이해한다. 오타가 문자열 속에 숨지 않는다.
- 삽입되는 값은 기본으로 escape된다(XHP와 같은 선택).

### 7-2. 컴포넌트 — 합성의 단위

React의 컴포넌트는 "상태와 props를 받아 가상 트리를 반환하는 단위"다. 컴포넌트가 다른 컴포넌트를 반환값에 포함하면 트리가 된다. MVC에서 뷰·컨트롤러·템플릿으로 나뉘던 것이 **하나의 단위** 로 합쳐졌다. 나누는 기준은 기술 종류(HTML/JS)가 아니라 **화면의 기능 단위** 다(8-1절).

### 7-3. Unidirectional Data Flow

```
      props (데이터)
부모 ─────────────▶ 자식
     ◀─────────────
      콜백 (의도 전달)
```

- 데이터는 **위에서 아래로만** 흐른다. 자식은 props를 수정하지 않는다.
- 자식이 무언가 바꾸고 싶으면 부모가 준 콜백을 호출해 **의도를 알린다.** 실제 변경은 상태의 소유자가 한다.

4-3절의 양방향 바인딩과 비교하면, 화면에 틀린 값이 보였을 때 추적 경로가 한 방향이다. "이 값을 가진 컴포넌트를 찾고, 그 컴포넌트의 `setState` 호출부를 본다." 편의성(양방향 바인딩이 줄여 주던 코드)을 내주고 **추적 가능성** 을 얻은 선택이다. React의 폼이 "Controlled Component"(`value` + `onChange`)라는 약간 장황한 모양을 갖게 된 것도 이 선택의 결과다.

5-1절의 읽지 않은 메시지 수 문제는 이 원칙을 **애플리케이션 전체 상태** 로 확장한 Flux(2014)로 이어진다(9-4절).

### 7-4. Synthetic Event와 Event Delegation

React는 요소마다 핸들러를 달지 않는다. 루트에 이벤트별 리스너를 하나씩 두고, 이벤트가 올라오면 해당 위치의 컴포넌트 트리를 따라 핸들러를 호출한다(3-5절 jQuery 위임과 같은 원리). 이벤트 객체는 브라우저 차이를 감싼 **Synthetic Event** 로 전달한다.

- 다시 그릴 때 핸들러를 달고 떼는 비용이 없다(3-6절 2번 문제 해소).
- 동적으로 생긴 요소도 자동으로 처리된다(3-5절).
- 브라우저 차이가 한 층 아래로 숨는다(2-2절).

위임 지점은 초기에 `document`였고, React 17(2020)부터 **React를 마운트한 루트 컨테이너** 로 바뀌었다. 한 페이지에 여러 React 버전이 공존할 때 이벤트가 서로 간섭하던 문제를 줄이기 위해서다.

### 7-5. 불변성과 "바뀌었는가"의 싼 판별

"전부 다시 그린다"를 그대로 하면, 바뀌지 않은 하위 트리까지 매번 `render`를 호출하고 비교한다. React는 초기부터 `shouldComponentUpdate(nextProps, nextState)`라는 탈출구를 뒀다. `false`를 반환하면 그 하위 트리의 렌더와 비교를 건너뛴다.

이 판별이 싸려면 **데이터를 제자리에서 고치지 않아야** 한다.

```js
// 제자리 수정: 같은 참조. 바뀌었는지 알려면 내용을 깊이 비교해야 한다
state.items.push(newItem);

// 새 객체: 참조가 다르면 바뀐 것. 비교는 === 한 번
setState({ items: [...state.items, newItem] });
```

2013년 말 David Nolen이 ClojureScript의 불변 자료구조 위에 React를 얹은 Om을 발표하며, 참조 비교만으로 하위 트리를 건너뛰는 방식이 큰 화면에서 효과적이라는 것을 보여 줬다. 이후 React 생태계 전반이 불변 업데이트를 기본 관습으로 받아들였다(`PureComponent`, `React.memo`, Redux 모두 이 전제 위에 있다).

### 7-6. 렌더러 분리 — "Learn once, write anywhere"

컴포넌트가 반환하는 것은 가상 트리일 뿐 DOM이 아니다. 그러므로 **가상 트리를 무엇으로 바꿀지(렌더러)** 는 교체할 수 있다. 2015년 React Native가 가상 트리를 iOS·Android 네이티브 뷰로 바꾸는 렌더러로 나왔고, 같은 해 React 0.14에서 `react`와 `react-dom` 패키지가 분리됐다. 이후 캔버스, 터미널, PDF, 3D 장면 등으로 렌더러가 늘어났다.

"HTML 문자열을 만든다"가 아니라 "화면 기술을 값으로 만든다"는 선택(7-1절)이 가져온 확장성이다.
