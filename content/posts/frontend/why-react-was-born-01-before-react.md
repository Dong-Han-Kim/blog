---
# 📌 기본 메타데이터
title: 'React의 탄생 1편 — 서버 렌더링부터 MV* 프레임워크까지'
date: '2026-09-17'
category: 'frontend'
tags: ['React', '웹 역사', 'DOM', 'jQuery', 'AngularJS', 'Frontend']
description: '서버가 HTML 전체를 다시 그리던 시대, 명령형 DOM API, AJAX와 jQuery가 남긴 네 가지 대가, 그리고 Backbone·Knockout·AngularJS가 갈라진 지점까지.'

# 💬 옵션 필드
draft: false
series: 'React의 탄생'
seriesOrder: 1

# 📚 SEO용
keywords: ['React', '웹 역사', 'DOM', 'jQuery', 'AJAX', 'Backbone.js', 'Knockout.js', 'AngularJS', 'Dirty Checking', '양방향 바인딩']
---

# React의 탄생 1편 — 서버 렌더링부터 MV* 프레임워크까지

> 시리즈 전체 구성
>
> - 1편. React 이전 — 서버가 화면을 그리던 시대부터 MV* 프레임워크까지 (1~4절)
> - 2편. React의 핵심 발상 — "전부 다시 그린다" (5~7절)
> - 3편. React가 치른 대가와 그 이후 (8~10절)

> **이 글의 기준 질문**
> 화면은 시간에 따라 바뀐다. 그렇다면 "지금 화면이 어떤 상태인지"는 누가 기억하고, "이전 화면에서 다음 화면으로 가는 방법"은 누가 책임지는가?

React를 "Virtual DOM을 쓰는 라이브러리"로 기억하면 절반만 남는다. Virtual DOM은 수단이다. React가 겨냥한 것은 **상태가 바뀔 때마다 화면을 어떻게 고칠지 사람이 직접 적어야 하는 구조**였다. 이 글은 그 구조가 어디서 왔고, 앞선 해법들이 어디서 막혔고, React가 어떤 발상으로 그 벽을 넘었으며, 그 대가로 무엇을 떠안았는지를 순서대로 따라간다.

각 시대는 같은 틀로 본다.

1. 그 시대가 풀려던 문제
2. 해법
3. 그 해법이 치른 대가
4. 다음 시대를 부른 지점

**읽는 순서 안내**

| 구간 | 절 | 수준 |
|---|---|---|
| 기초 | 1~3절 | 서버 렌더링, DOM API, jQuery가 남긴 문제 |
| 중급 | 4~5절 | MV* 프레임워크의 세 갈래, Facebook의 사정 |
| 핵심 | 6~7절 | "전부 다시 그린다"는 발상, Virtual DOM·Reconciliation 직접 구현, 함께 들어온 설계 결정 |
| 심화 | 8~9절 | 초기 반발의 논점, React가 치른 대가와 그 후의 진화 |
| 정리 | 10절 | 불편 → 원인 → 답 → 대가 총정리표, 연표, 자가진단 |

## 1. 출발점 — 서버가 화면을 그리던 시대 (1990년대 ~ 2000년대 초)

### 1-1. 문제와 해법

초기 웹의 동적 페이지는 CGI, PHP, ASP, JSP 같은 서버 기술로 만들었다. 흐름은 단순하다.

```
사용자 클릭 → HTTP 요청 → 서버가 DB를 읽음 → HTML 전체를 문자열로 생성 → 브라우저가 페이지 전체를 새로 그림
```

```php
<?php
// 요청마다 처음부터 끝까지 다시 만든다
$count = get_unread_count($user_id);
$items = get_feed($user_id);
?>
<header>알림 <?= $count ?>개</header>
<ul>
  <?php foreach ($items as $item): ?>
    <li><?= htmlspecialchars($item['title']) ?></li>
  <?php endforeach; ?>
</ul>
```

이 모델에는 중요한 성질이 하나 있다. **화면은 그 순간의 데이터로부터 매번 새로 계산된다.** 식으로 쓰면 이렇다.

```
HTML = template(DB 상태)
```

"알림이 3개였다가 4개가 됐으니 헤더 숫자를 고쳐라" 같은 코드가 없다. 이전 화면이 무엇이었는지 신경 쓸 필요가 없다. 요청이 올 때마다 현재 상태로 전체를 다시 만들 뿐이다. 상태에서 화면으로 가는 **전이(transition)** 를 적지 않고, 상태에서 화면을 만드는 **함수** 만 적는다.

뒤에서 보겠지만, React가 되찾으려 한 것이 바로 이 성질이다.

### 1-2. 대가

- 클릭 한 번마다 페이지 전체가 사라졌다가 다시 나타난다. 스크롤 위치, 입력 중인 폼, 펼쳐 둔 메뉴가 모두 초기화된다.
- 바뀐 것이 숫자 하나여도 HTML 전체를 전송한다.
- 대기 시간 동안 사용자는 아무것도 할 수 없다.

### 1-3. 다음 시대를 부른 지점

"페이지를 통째로 바꾸지 않고 **일부만** 바꾸고 싶다." 이 요구가 브라우저 쪽 프로그래밍을 불러냈다.

---

## 2. 브라우저의 무기 — JavaScript와 DOM

### 2-1. DOM은 명령형 API다

1995년 Netscape에서 JavaScript가 나왔고, 1998년 W3C DOM Level 1이 문서를 트리 객체로 다루는 표준 API를 정했다. DOM API의 모양을 보면 이후 모든 문제의 씨앗이 보인다.

```js
const li = document.createElement('li');
li.textContent = '새 글';
list.appendChild(li);

header.textContent = '알림 4개';
button.classList.add('active');
```

DOM은 **이미 존재하는 트리를 제자리에서 고치는** API다. "화면이 이래야 한다"를 말하는 방법은 없고, "이 노드를 만들어라, 저 노드에 붙여라, 이 텍스트를 바꿔라"만 말할 수 있다. 이런 방식을 **Imperative(명령형)** 라고 한다.

명령형 API로 화면을 바꾸려면 개발자가 두 가지를 모두 알아야 한다.

1. 지금 화면이 어떤 모양인지 (출발점)
2. 다음 화면이 어떤 모양이어야 하는지 (도착점)

그리고 **출발점에서 도착점으로 가는 명령 목록** 을 직접 작성해야 한다. 서버 렌더링 시대에는 2번만 알면 됐다. 브라우저에서 부분 갱신을 하는 순간 1번과 경로까지 사람 몫이 된다.

### 2-2. 브라우저마다 다른 API

2000년대 중반까지 브라우저 간 차이가 컸다. 대표적으로 이벤트 등록이 달랐다.

```js
// 표준 계열
el.addEventListener('click', handler, false);
// 구형 IE
el.attachEvent('onclick', handler);
```

이벤트 객체의 필드, 스타일 계산, XHR 생성 방법까지 달랐다. 명령형 API를 쓰는 비용에 "브라우저별 분기"라는 비용이 곱해졌다.

---

## 3. AJAX와 jQuery (2005 ~ 2010)

### 3-1. 문제: 페이지를 새로고침하지 않고 데이터를 받고 싶다

Microsoft는 1999년 IE5에 XMLHTTP(ActiveX)를 넣었고, 이후 다른 브라우저가 `XMLHttpRequest`로 따라갔다. 2004년 Gmail, 2005년 Google Maps가 새로고침 없이 데이터를 받아 화면 일부를 바꾸는 경험을 보여 줬고, 2005년 Jesse James Garrett이 이 방식을 **Ajax** 라고 이름 붙였다.

이제 브라우저는 "문서를 보여 주는 창"에서 "상태를 가진 애플리케이션"이 되기 시작했다.

### 3-2. 해법: jQuery

2006년 John Resig이 발표한 jQuery는 두 가지를 해결했다.

1. 브라우저 차이를 한 API 뒤로 숨겼다.
2. CSS 선택자로 요소를 찾고 메서드 체이닝으로 조작하게 했다.

```js
$('#load-more').on('click', function () {
  $.getJSON('/api/feed?page=2', function (items) {
    items.forEach(function (item) {
      $('<li>').text(item.title).appendTo('#feed');
    });
  });
});
```

짧고 명확하다. 작은 페이지에서는 이보다 나은 방법이 드물었다. 문제는 **화면이 커지고, 같은 데이터를 여러 곳이 보여 주기 시작하면서** 드러났다. jQuery는 DOM API를 편하게 만들었을 뿐, 2-1절의 명령형 구조 자체는 그대로였다.

### 3-3. 대가 ① — 상태가 DOM에 산다

```js
// 좋아요 버튼
$('.like-btn').on('click', function () {
  const $btn = $(this);
  const liked = $btn.hasClass('active');            // 상태를 DOM 클래스에서 읽음
  const $count = $btn.siblings('.like-count');
  const n = parseInt($count.text(), 10);            // 숫자를 DOM 텍스트에서 읽음

  $btn.toggleClass('active');
  $count.text(liked ? n - 1 : n + 1);

  if (!liked && n === 0) $btn.siblings('.first-like-badge').show();
  if (liked && n === 1) $btn.siblings('.first-like-badge').hide();

  // 헤더의 "내가 누른 좋아요 수"는? 사이드바의 "인기 글" 순위는?
  // 이 핸들러가 그 요소들의 존재를 알아야 한다.
});
```

"좋아요를 눌렀는가"라는 사실이 JavaScript 변수가 아니라 `.active` 클래스에 들어 있다. "몇 개인가"라는 사실은 `<span>`의 텍스트에 들어 있다. 이 구조에서는:

- **Single Source of Truth가 DOM이 된다.** DOM은 표시를 위한 구조라 데이터를 담기에 불편하다. 숫자를 문자열로 저장하고 다시 파싱한다.
- **같은 사실이 여러 DOM에 복제된다.** 좋아요 수가 버튼 옆, 헤더, 사이드바 세 곳에 있으면 세 곳이 각각 진실을 주장한다. 하나를 고치다 빠뜨리면 화면끼리 모순된다.
- **읽기와 쓰기가 섞인다.** 핸들러가 DOM을 읽어 상태를 추정하고, 다시 DOM에 쓴다. 다른 핸들러가 중간에 같은 DOM을 바꾸면 추정이 틀린다.

### 3-4. 대가 ② — 전이(transition)의 폭발

목록 화면에 상태가 다섯 개 있다고 하자: `idle`, `loading`, `success`, `empty`, `error`.

명령형으로 짜면 상태가 바뀔 때마다 **무엇을 숨기고 무엇을 보일지** 를 적어야 한다.

```js
function toLoading() {
  $('#spinner').show();
  $('#list, #empty, #error').hide();
  $('#retry').prop('disabled', true);
}
function toSuccess(items) {
  $('#spinner, #empty, #error').hide();
  $('#list').empty().append(items.map(renderItem)).show();
  $('#retry').prop('disabled', false);
}
function toEmpty() { /* spinner, list, error 숨김, empty 표시 ... */ }
function toError(msg) { /* spinner, list, empty 숨김, error 표시, retry 활성 ... */ }
```

두 가지 비용이 생긴다.

**경로의 수.** 상태가 n개면 가능한 전이는 최대 n(n−1)개다. 5개면 20개. 위처럼 "도착 함수가 모든 요소를 리셋"하는 방식으로 줄여도, 각 도착 함수는 **화면의 모든 요소를 알아야** 한다.

**요소를 추가할 때의 반경.** 요구사항이 "로딩 중에는 필터 드롭다운도 비활성화"로 바뀌면 `toLoading`뿐 아니라 `toSuccess`, `toEmpty`, `toError` 모두에 "필터 다시 활성화"를 넣어야 한다. 하나라도 빠뜨리면 **특정 경로로 왔을 때만** 필터가 잠긴 채 남는다. 재현 조건이 "error에서 retry를 눌러 success로 온 경우" 같은 모양이 되어 찾기 어렵다.

같은 화면을 **상태에서 화면을 계산하는 함수** 로 적으면 경로가 사라진다.

```js
function view(state) {
  return {
    spinner: state.status === 'loading',
    list: state.status === 'success',
    empty: state.status === 'empty',
    error: state.status === 'error',
    retryDisabled: state.status === 'loading',
    filterDisabled: state.status === 'loading',   // 한 줄로 끝
  };
}
```

필터 요구사항은 한 줄이다. 어느 상태에서 왔는지는 상관없다. 1절 서버 렌더링이 가졌던 성질이다.

문제는 **이 결과를 실제 DOM에 어떻게 반영하느냐** 다. 가장 쉬운 방법은 매번 HTML 문자열을 만들어 `innerHTML`에 넣는 것인데, 여기서 3-6절의 문제가 생긴다.

### 3-5. 대가 ③ — 동적 요소와 이벤트의 수명

```js
$('.delete-btn').on('click', handler);   // 이 시점에 존재하는 버튼에만 붙는다
$('#list').append(newItemHtml);          // 새 항목의 삭제 버튼에는 핸들러가 없다
```

jQuery는 `.live()`, `.delegate()`, 이후 `.on(event, selector, handler)`로 **Event Delegation** 을 제공해 이 문제를 풀었다. 부모 하나에 핸들러를 달고, 이벤트가 버블링될 때 대상 선택자와 맞는지 검사하는 방식이다. 이 아이디어는 React의 이벤트 시스템으로 이어진다(7-4절).

반대 방향의 문제도 있었다. 요소를 제거하면서 연결된 핸들러와 데이터를 정리하지 않으면 메모리에 남는다. jQuery의 `.remove()`는 자신이 관리하는 이벤트·데이터를 정리했지만, 네이티브 API로 요소를 지우거나 외부 객체가 요소를 참조하면 정리 책임이 다시 개발자에게 돌아왔다. 구형 IE에서는 DOM 객체와 JS 객체 사이의 순환 참조가 수거되지 않는 문제까지 겹쳤다.

### 3-6. 대가 ④ — `innerHTML` 전체 재생성의 한계

3-4절의 선언형 방식을 가장 단순하게 구현하면 이렇다.

```js
function render(state) {
  container.innerHTML = template(state);   // 매번 통째로 교체
}
```

서버 렌더링과 똑같은 모델이다. 하지만 브라우저 안에서는 세 가지가 깨진다.

1. **DOM이 가진 상태가 사라진다.** 입력 중인 텍스트, 포커스, 커서 위치, 스크롤 위치, 재생 중인 동영상, CSS 트랜지션 진행 상태. 이것들은 JavaScript 데이터가 아니라 DOM 노드에 붙어 있다. 노드를 새로 만들면 함께 사라진다.
2. **이벤트 핸들러를 매번 다시 달아야 한다.**
3. **문자열 결합은 XSS에 취약하다.** 사용자 입력을 escape하지 않고 넣는 실수 한 번이 보안 사고가 된다.

> 실행 검증(Node 22 + jsdom, `verify/v.js` A): 입력창에 `hel`을 입력하고 포커스를 둔 상태에서 `innerHTML`로 "알림 개수"만 바뀐 화면을 다시 넣으면 → input 노드가 새로 만들어지고, `value`는 빈 문자열, 포커스도 사라진다.

그래서 jQuery 시대의 결론은 이랬다. **선언형으로 다시 그리면 코드는 단순해지지만 화면이 망가진다. 망가지지 않게 하려면 명령형으로 고쳐야 하고, 그러면 코드가 망가진다.** 이 딜레마가 다음 10년의 주제가 된다.

---

## 4. MV* 프레임워크의 시대 (2010 ~ 2013)

2010년 전후로 "상태를 DOM에서 꺼내 JavaScript 객체에 두자"는 흐름이 생겼다. 서버 쪽에서 익숙했던 MVC를 브라우저로 옮긴 것이다. 공통 목표는 같았지만, **모델이 바뀐 사실을 뷰에 어떻게 전달하느냐** 에서 세 갈래로 나뉘었다.

### 4-1. Backbone.js — 이벤트로 알리고, 그리는 방법은 뷰가 정한다 (2010)

```js
const Todo = Backbone.Model.extend({ defaults: { title: '', done: false } });

const TodoView = Backbone.View.extend({
  tagName: 'li',
  events: { 'click .toggle': 'toggle' },
  initialize() {
    this.listenTo(this.model, 'change', this.render);
  },
  toggle() {
    this.model.set('done', !this.model.get('done'));
  },
  render() {
    this.$el.html(this.template(this.model.toJSON()));
    return this;
  },
});
```

**해결한 것.** 상태가 모델 객체로 올라왔다. 모델은 `change` 이벤트를 발행하고, 뷰는 구독한다. 3-3절의 "상태가 DOM에 산다"가 풀렸다.

**남은 것.**

- `render`를 어떻게 구현할지는 여전히 개발자 몫이다. 대부분 `this.$el.html(...)`로 통째로 교체했고, 그러면 3-6절 문제가 그대로 돌아온다. 이를 피하려고 `render` 대신 세밀한 갱신 메서드를 쓰면 3-4절 전이 폭발로 돌아간다.
- 뷰 안에 하위 뷰가 있을 때, 상위 뷰의 `render`가 하위 뷰의 DOM을 날려 버린다. 하위 뷰를 다시 만들고, 이전 하위 뷰의 구독을 해제하는 코드를 직접 관리해야 했다. 해제를 빠뜨려 제거된 뷰가 계속 이벤트를 받는 현상은 **Zombie View** 라고 불렸다.
- 모델 A의 변경 핸들러가 모델 B를 바꾸고, B의 핸들러가 C를 바꾸는 식의 **이벤트 연쇄** 가 생기면 "이 값을 누가 바꿨는가"를 따라가기 어렵다.

Backbone은 의도적으로 얇은 라이브러리였다. 구조는 줬지만 **뷰 갱신이라는 가장 어려운 문제는 개발자에게 남겼다.**

### 4-2. Knockout.js · Ember.js — 의존성을 추적한다 (2010 · 2011)

```js
function ProfileVM() {
  this.first = ko.observable('Kim');
  this.last = ko.observable('Han');
  this.full = ko.computed(() => `${this.first()} ${this.last()}`);
}
ko.applyBindings(new ProfileVM());
```

```html
<input data-bind="value: first">
<p data-bind="text: full"></p>
```

**해결한 것.** 값을 **Observable** 로 감싸면, 그 값을 읽은 계산(`computed`)과 바인딩이 자동으로 구독자로 등록된다. `first`가 바뀌면 `full`이 다시 계산되고, `full`을 쓰는 `<p>`의 텍스트만 바뀐다. 개발자는 전이를 적지 않는다. 바인딩이 "어느 DOM을 고칠지"를 정확히 안다. 이 방식을 **Fine-grained Reactivity** 라고 한다.

**남은 것.**

- **모든 데이터를 감싸야 한다.** 서버에서 받은 JSON을 observable로 변환하고, 보낼 때 다시 벗긴다. 배열은 `observableArray`로 따로 다룬다. 감싸는 것을 잊은 필드는 조용히 반응하지 않는다.
- **읽기 방식이 바뀐다.** `this.first()`처럼 함수 호출로 읽어야 추적된다. 일반 객체처럼 읽으면 추적이 끊긴다.
- **계산 그래프가 커지면** 어떤 값이 어떤 순서로 다시 계산되는지 머릿속으로 그리기 어렵다. 구독이 명시적으로 드러나지 않기 때문이다.
- **뷰 구조 자체가 바뀌는 경우**(목록의 추가·삭제·재정렬, 조건부 영역)는 템플릿 바인딩(`foreach`, `if`)의 규칙에 따라야 했다.

이 갈래는 사라지지 않았다. 9-6절에서 Signals라는 이름으로 돌아온다.

### 4-3. AngularJS — 양방향으로 묶고, 바뀌었는지 전부 검사한다 (2010)

```html
<div ng-controller="ProfileCtrl">
  <input ng-model="user.first">
  <p>{{ user.first }} {{ user.last }}</p>
  <p ng-if="user.first.length > 10">이름이 깁니다</p>
</div>
```

```js
app.controller('ProfileCtrl', function ($scope) {
  $scope.user = { first: 'Kim', last: 'Han' };
  $scope.$watch('user.first', function (v) {
    $scope.greeting = '안녕, ' + v;
  });
});
```

**해결한 것.** 일반 JavaScript 객체를 그대로 쓴다(Knockout처럼 감쌀 필요가 없다). 입력값이 모델로, 모델이 화면으로 자동으로 흐른다(**Two-way Data Binding**). 폼 중심 화면은 코드가 극적으로 줄었다.

**어떻게 동작하나 — Dirty Checking.** 일반 객체는 값이 바뀌어도 알려 주지 않는다. 그래서 AngularJS는 이벤트 핸들러, `$http` 응답, `$timeout` 등이 끝날 때마다 `$digest` 루프를 돌린다. 등록된 모든 watcher의 현재 값을 이전 값과 비교하고, 하나라도 달라졌으면 **한 바퀴 더** 돈다. 어떤 watcher의 리스너가 다른 값을 바꿀 수 있기 때문이다.

직접 구현하면 핵심은 20줄 남짓이다.

```js
function createScope() {
  const watchers = [];
  const scope = {
    $watch(getter, listener) {
      watchers.push({ getter, listener, initial: true, last: undefined });
    },
    $digest() {
      let dirty, ttl = 10;
      do {
        dirty = false;
        for (const w of watchers) {
          const v = w.getter(scope);
          if (w.initial || v !== w.last) {
            const old = w.last;
            w.last = v;
            w.initial = false;
            w.listener(v, old, scope);
            dirty = true;              // 누군가 바뀌었으니 전체를 다시 검사
          }
        }
        if (dirty && !ttl--) throw new Error('10 $digest() iterations reached. Aborting!');
      } while (dirty);
    },
  };
  return scope;
}
```

**대가.**

1. **비용이 화면 전체의 watcher 수에 비례한다.** 키 입력 하나가 화면의 모든 바인딩 비교를 일으킨다. 바인딩이 많은 화면(큰 표, 긴 목록)에서 입력 지연이 생겼다.
2. **수렴할 때까지 여러 바퀴 돈다.** 값 하나가 바뀌어도 연쇄의 길이만큼 루프가 반복된다.
3. **서로를 고치는 watcher는 멈추지 않는다.** 그래서 반복 상한(TTL 10)이 있고, 넘으면 예외를 던진다. AngularJS 사용자에게 익숙했던 `10 $digest() iterations reached` 에러다.
4. **변경의 원인을 추적하기 어렵다.** 입력 → 모델 → watcher → 다른 모델 → 화면 → (양방향이므로) 다시 모델. 화면에 틀린 값이 보일 때 "누가 이 값을 썼는가"의 후보가 넓다.

> 실행 검증(Node 22, `verify/v.js` D):
> - `first → fullName → greeting` 연쇄에서 `first` 하나만 바꿔도 `$digest`가 **3바퀴**, watcher 평가 6회로 수렴했다(watcher 등록 순서가 연쇄와 반대라서).
> - `a`의 리스너가 `b = a + 1`, `b`의 리스너가 `a = b + 1`을 쓰게 하면 수렴하지 못하고 `10 $digest() iterations reached. Aborting!`으로 중단했다(중단 시점 `a=22, b=21`).

### 4-4. 템플릿 언어라는 공통 비용

세 갈래 모두 HTML 위에 **별도의 템플릿 문법** 을 얹었다. `data-bind="foreach: items"`, `ng-repeat="item in items | filter:q"`, Handlebars의 `{{#each}}`.

- 조건, 반복, 필터, 스코프 규칙을 **JavaScript가 아닌 두 번째 언어** 로 배워야 한다.
- 템플릿 안의 오타는 JavaScript 도구(린터, 타입 검사, 에디터 자동완성)가 잡지 못한다. 문자열이기 때문이다.
- 표현력이 부족한 부분은 결국 컨트롤러나 커스텀 디렉티브로 빠져나간다. 화면 로직이 템플릿과 스크립트 두 곳에 나뉜다.

### 4-5. 세 갈래 비교

| | Backbone | Knockout / Ember | AngularJS |
|---|---|---|---|
| 상태 위치 | 모델 객체 | Observable | 일반 객체(scope) |
| 변경 감지 | 모델이 이벤트 발행 | 읽기 시 의존성 자동 등록 | 전체 비교(Dirty Checking) |
| 뷰 갱신 방법 | 개발자가 `render` 작성 | 바인딩이 해당 DOM만 수정 | 바인딩이 해당 DOM만 수정 |
| 데이터 흐름 | 이벤트 연쇄 | 계산 그래프 | 양방향 |
| 남은 불편 | 뷰 갱신·하위 뷰 수명 | 데이터 래핑, 그래프 가시성 | 전체 비교 비용, 원인 추적 |
| 공통 | 템플릿이 별도 언어, "무엇이 무엇을 바꾸는지"를 한 곳에서 읽기 어려움 | | |
