---
# 📌 기본 메타데이터
title: 'Next.js는 무엇이 불편해서 만들어졌나'
date: '2026-09-16'
category: 'frontend'
tags: ['Next.js', 'React', 'SSR', 'CSR', '웹 역사']
description: 'CSR의 구조적 한계와 수제 SSR의 고통, 그리고 Next.js가 그 문제를 규칙(convention)으로 해결한 과정'

# 💬 옵션 필드
draft: false

# 📚 SEO용
keywords: ['Next.js', 'React', 'SSR', 'CSR', '웹 역사', '하이드레이션', 'SPA', '프레임워크 역사']
---

# Next.js는 무엇이 불편해서 만들어졌나

프레임워크를 깊이 이해하려면 **"이게 없던 시절엔 무엇이 괴로웠나?"**부터 물어봐야 한다. API 문법은 버전마다 바뀌지만, 프레임워크가 풀려는 문제는 잘 바뀌지 않는다. v14와 v15 사이에 캐싱 기본값이 뒤집힌 것처럼 Next.js는 변화가 잦은 프레임워크다. 그래서 "왜"를 붙잡고 있어야 변화에 휘둘리지 않는다.

이 글은 다음 순서로 진행한다.

1. 2016년의 웹: SPA 전성기
2. CSR의 두 가지 구조적 약점
3. "그럼 SSR 하면 되잖아?" — 수제 SSR의 고통
4. Next.js의 답
5. 이후 진화: 불편함 → 해결의 반복

---

## 1. 2016년의 웹 — SPA 전성기

2013년 React가 공개된 뒤 프론트엔드의 주류는 **SPA(Single Page Application)**가 되었다. 렌더링 방식으로 보면 **CSR(Client-Side Rendering)**이다.

그 이전의 전통적인 웹(PHP, JSP, Rails)은 **서버가 완성된 HTML을 만들어** 보냈다. 페이지를 이동할 때마다 전체 새로고침이 일어났고, 인터랙션이 필요한 부분은 jQuery로 덧붙였다.

SPA는 이 역할을 뒤집었다.

```html
<!-- 서버가 보내주는 HTML -->
<!DOCTYPE html>
<html>
  <head><title>My App</title></head>
  <body>
    <div id="root"></div>
    <script src="/static/bundle.js"></script>
  </body>
</html>
```

서버는 사실상 **빈 껍데기와 JS 파일만** 준다. 화면을 그리는 일, 라우팅, 데이터 요청은 전부 브라우저에서 실행되는 JavaScript가 맡는다.

얻은 것은 분명했다. 페이지 전환이 앱처럼 부드러웠고, 프론트엔드와 백엔드가 API로 깔끔하게 분리되었고, 컴포넌트 기반으로 UI를 재사용할 수 있었다. 하지만 대가도 있었다.

---

## 2. CSR의 두 가지 구조적 약점

### 약점 ① 첫 화면이 늦다

CSR에서 사용자가 **의미 있는 콘텐츠**를 보기까지의 타임라인은 이렇다.

```
[브라우저]
 1. HTML 요청 → 빈 <div id="root"> 수신        ← 화면: 흰색
 2. bundle.js 요청 → 수백 KB~수 MB 다운로드      ← 화면: 흰색
 3. JS 파싱 · 컴파일 · 실행                      ← 화면: 흰색 (또는 스피너)
 4. React가 컴포넌트 마운트
 5. useEffect / componentDidMount에서 API 호출  ← 화면: 로딩 스피너
 6. 응답 수신 → 리렌더링                          ← 화면: 드디어 콘텐츠
```

핵심은 **콘텐츠가 JS 실행 이후에만 존재한다**는 점이다. 네트워크가 느리거나 기기가 저사양이면 2~3단계가 수 초씩 걸린다. 앱이 커질수록 번들도 커지니, 기능을 추가할수록 첫 화면이 느려지는 구조였다.

### 약점 ② 기계가 읽을 콘텐츠가 없다

웹페이지를 사람만 읽는 것은 아니다.

**검색엔진 크롤러**가 1단계에서 받는 것은 `<div id="root"></div>`뿐이다. Google은 JS 렌더링을 지원하기 시작했지만 렌더링은 별도 대기열에서 나중에 처리되었고 안정성도 떨어졌다. 다른 검색엔진은 더 불리했다.

**링크 미리보기 크롤러**는 더 심각했다. 카카오톡, 슬랙, 페이스북, 트위터에 링크를 붙여 넣으면 제목·설명·썸네일이 뜨는데, 이 정보는 HTML의 `<meta property="og:...">` 태그에서 읽는다. 이 크롤러들은 보통 JS를 실행하지 않는다. 그래서 상품 페이지마다 다른 OG 태그를 JS로 넣어도 미리보기에는 반영되지 않았다.

커머스, 미디어, 블로그처럼 **검색 유입과 공유가 곧 매출인 서비스**에게 이건 치명적이었다.

> **중간 정리**
> CSR의 약점은 "구현을 잘못해서"가 아니라 **HTML에 콘텐츠가 없다는 구조 자체**에서 나온다. 그래서 해결책도 구조적이어야 한다. 즉 **서버에서 HTML을 채워서 보내는 것**이다.

---

## 3. "그럼 SSR 하면 되잖아?" — 수제 SSR의 고통

React는 처음부터 서버 렌더링 API를 제공했다.

```js
import { renderToString } from 'react-dom/server';
const html = renderToString(<App />);
```

이론상 SSR은 가능했다. 문제는 **이 한 줄을 실제 서비스로 만들기까지의 거리**였다. 2016년식 수제 SSR 서버를 보자.

```js
// server.js
import express from 'express';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter, matchPath } from 'react-router';
import { Provider } from 'react-redux';
import routes from './shared/routes';
import App from './shared/App';
import { createStore } from './shared/store';

const app = express();
app.use('/static', express.static('dist/client'));

app.get('*', async (req, res) => {
  // (1) URL에 맞는 라우트를 직접 찾는다
  const matched = routes.find(route => matchPath(req.url, route));

  // (2) 렌더링 "전에" 필요한 데이터를 직접 가져온다
  const store = createStore();
  if (matched && matched.component.fetchData) {
    await matched.component.fetchData(store, req);
  }

  // (3) 컴포넌트 트리를 HTML 문자열로 변환한다
  const context = {};
  const html = renderToString(
    <Provider store={store}>
      <StaticRouter location={req.url} context={context}>
        <App />
      </StaticRouter>
    </Provider>
  );

  // (4) 리다이렉트도 직접 처리한다
  if (context.url) return res.redirect(301, context.url);

  // (5) 서버 상태를 클라이언트로 넘기기 위해 직렬화한다
  const state = JSON.stringify(store.getState()).replace(/</g, '\\u003c');

  res.send(`<!DOCTYPE html>
<html>
  <head><title>My App</title></head>
  <body>
    <div id="root">${html}</div>
    <script>window.__INITIAL_STATE__ = ${state}</script>
    <script src="/static/bundle.js"></script>
  </body>
</html>`);
});

app.listen(3000);
```

클라이언트 쪽에서도 짝을 맞춰야 했다.

```js
// client.js
import { hydrate } from 'react-dom';
import { BrowserRouter } from 'react-router-dom';

const store = createStore(window.__INITIAL_STATE__); // 서버 상태로 시작

hydrate(
  <Provider store={store}>
    <BrowserRouter><App /></BrowserRouter>
  </Provider>,
  document.getElementById('root')
);
```

이 코드에 숨어 있는 고통을 하나씩 짚어 보자.

### 고통 ① 빌드 파이프라인이 두 벌

브라우저용 코드와 Node 서버용 코드는 실행 환경이 다르다. 그래서 **webpack 설정이 두 개** 필요했다. 클라이언트 번들은 브라우저 타깃에 코드 스플리팅과 압축을 적용하고, 서버 번들은 Node 타깃에 `node_modules`를 제외해야 했다.

컴포넌트가 `import './Button.css'`나 `import logo from './logo.png'`를 하면 서버 번들은 이걸 어떻게 처리할지 따로 정해야 했다. Node는 CSS 파일을 import할 줄 모르기 때문이다.

### 고통 ② 데이터 패칭에 표준이 없다

(2)번 코드를 보면 서버는 렌더링 **전에** 데이터를 다 가져와야 한다. `renderToString`은 동기 함수라서 비동기 데이터를 기다려 주지 않기 때문이다.

그런데 "이 페이지가 어떤 데이터를 필요로 하는지"를 서버가 알아낼 방법이 React에는 없었다. 그래서 팀마다 `static fetchData()`, `static need = [...]`, `loadData` 같은 **자체 규칙**을 발명했다. 회사를 옮기면 SSR 구조를 처음부터 다시 배워야 했다.

### 고통 ③ 하이드레이션은 양쪽이 똑같아야 한다

**하이드레이션(hydration)**은 서버가 만든 HTML 위에 React가 이벤트 핸들러를 붙여 "살려내는" 과정이다. 이때 클라이언트의 첫 렌더링 결과가 서버 HTML과 **정확히 같아야** 한다.

그래서 서버에서 가져온 데이터를 `window.__INITIAL_STATE__`로 직렬화해 넘기고, 클라이언트는 그 상태로 시작해야 했다. 이걸 빠뜨리면 클라이언트가 빈 상태로 렌더링해 불일치가 생기고 화면이 깜빡이거나 경고가 났다. 직렬화할 때 `</script>` 문자열로 인한 XSS도 직접 막아야 했다(위 코드의 `replace` 부분).

### 고통 ④ 라우팅도 양쪽에서

서버는 `StaticRouter`, 클라이언트는 `BrowserRouter`를 썼다. 라우트 정의는 공유해야 하고, 서버는 (1)번처럼 별도로 매칭 로직을 돌려야 했다. 404와 리다이렉트도 직접 처리해야 했다.

### 고통 ⑤ 코드 스플리팅과 SSR의 충돌

번들이 커지는 문제를 해결하려면 페이지별로 코드를 쪼개야 한다. 그런데 SSR과 결합하면 새 질문이 생긴다. **"이 요청에서 렌더링된 컴포넌트가 어느 청크에 들어 있는가?"**

서버가 이걸 알아서 해당 청크의 `<script>`를 HTML에 넣어 줘야 한다. 그렇지 않으면 하이드레이션 시점에 필요한 코드가 없다. 이걸 추적하는 도구 설정이 악명 높게 까다로웠다.

### 고통 ⑥ 개발 환경

클라이언트 코드를 수정하면 브라우저 HMR이 필요하고, 공유 컴포넌트를 수정하면 서버 번들도 다시 빌드하고 서버를 재시작해야 한다. 이 둘을 동시에 굴리는 개발 서버를 구성하는 것 자체가 하나의 프로젝트였다.

### 시대적 분위기: JavaScript Fatigue

2016년 무렵 개발자들은 이 상황을 **"JavaScript Fatigue(자바스크립트 피로)"**라고 불렀다. 도구는 넘쳐나는데 조합은 직접 해야 했고, 기능 하나 만들기 전에 설정과 씨름하는 시간이 더 길었다.

같은 해 7월 Facebook이 **Create React App(CRA)**을 공개해 설정 문제를 크게 덜어 주었다. 하지만 CRA는 **CSR 전용**이었다. SSR의 고통은 여전히 개발자 몫이었다.

> **중간 정리**
> SSR은 "불가능"한 게 아니라 **"각자 힘들게, 각자 다르게"** 만들어야 하는 것이었다. 필요한 부품은 다 있었지만 조립 설명서가 없었다.

---

## 4. Next.js의 답 — "PHP처럼 단순하게, 그러나 React로"

2016년 10월 25일, **ZEIT**(현 **Vercel**, 창업자 Guillermo Rauch)가 Next.js를 공개했다.

설계 철학의 출발점은 흥미롭게도 **PHP**였다. PHP 시절에는 `about.php` 파일을 서버 폴더에 넣으면 그게 곧 `/about` 페이지였다. 라우터 설정도, 빌드도 없었다. 서버가 HTML을 만드는 것이 기본이었으니 SEO 걱정도 없었다.

Next.js의 목표는 **이 단순함을 React의 컴포넌트 모델 위에서 되살리는 것**이었다.

```bash
npm install next react react-dom
mkdir pages
```

```js
// pages/index.js — 파일 하나가 곧 "/" 페이지 (초기 Next.js 스타일)
import React from 'react';
import Link from 'next/link';
import fetch from 'isomorphic-fetch';

export default class Home extends React.Component {
  // 서버 첫 요청 때도, 클라이언트 페이지 전환 때도 실행되는 데이터 패칭 규칙
  static async getInitialProps() {
    const res = await fetch('https://api.example.com/posts');
    const posts = await res.json();
    return { posts };
  }

  render() {
    return (
      <div>
        <ul>
          {this.props.posts.map(p => <li key={p.id}>{p.title}</li>)}
        </ul>
        <Link href="/about"><a>About</a></Link>
      </div>
    );
  }
}
```

```json
{
  "scripts": {
    "dev": "next",
    "build": "next build",
    "start": "next start"
  }
}
```

3장의 거대한 `server.js`와 `client.js`가 전부 사라졌다. 앞의 고통 목록과 대응시켜 보면 이렇다.

| 기존의 고통 | Next.js의 해법 |
|---|---|
| 흰 화면, SEO | **SSR이 기본값** — 설정 없이 서버에서 HTML 생성 |
| ① 빌드 파이프라인 두 벌 | **Zero-config** — webpack/Babel 설정을 프레임워크가 내장 |
| ② 데이터 패칭 표준 부재 | **`getInitialProps`** — 모두가 같은 규칙 사용 |
| ③ 상태 직렬화·하이드레이션 | 프레임워크가 `__NEXT_DATA__`로 자동 전달 |
| ④ 라우팅 동기화 | **파일 시스템 라우팅** — `pages/` 구조가 곧 URL |
| ⑤ 코드 스플리팅 + SSR | **페이지 단위 자동 코드 스플리팅** |
| ⑥ 개발 환경 | `next` 한 줄로 HMR 포함 개발 서버 |

`getInitialProps`에는 주목할 만한 설계가 하나 있다. 첫 요청에서는 **서버**에서 실행되고, 이후 `<Link>`로 이동할 때는 **클라이언트**에서 실행된다. 첫 화면은 SSR의 장점(빠른 콘텐츠, SEO)을, 이후 전환은 SPA의 장점(부드러운 이동)을 가져가려는 설계다. 당시에는 이런 앱을 **"Universal"** 또는 **"Isomorphic" JavaScript**라고 불렀다.

스타일링은 처음에 `next/css`를 기본으로 제공했다. 2017년 3월 Next.js 2.0에서 `next/css`가 deprecated되고, 스코프가 격리된 CSS를 지원하는 `styled-jsx`가 기본 솔루션이 되었다. 같은 릴리스에서 `<Link>`의 `prefetch` 기능도 추가되었다.

> **핵심**
> Next.js는 새로운 렌더링 기술을 발명한 것이 아니다. **이미 존재하던 부품(React SSR, webpack, Babel)을 합의된 규칙(convention)으로 조립해 준 것**이다. Rails의 "Convention over Configuration" 철학을 React 생태계에 가져왔다고도 볼 수 있다.

---

## 5. 이후 진화 — 불편함 → 해결의 반복

Next.js의 역사는 이 패턴의 반복이다.

### Next.js 9 (2019) — API Routes

**불편함**: 화면은 Next.js로 만들어도 API는 별도 Express 서버를 띄워야 했다. 배포 대상이 두 개가 되었다.

**해결**: `pages/api/` 아래에 파일을 두면 API 엔드포인트가 된다.

```js
// pages/api/hello.js
export default function handler(req, res) {
  res.status(200).json({ message: 'hello' });
}
```

App Router의 **Route Handlers**(`app/api/.../route.ts`)의 조상이다.

### Next.js 9.3 ~ 9.5 (2020) — SSG · SSR · ISR의 분리

**불편함**: `getInitialProps`는 서버와 클라이언트 양쪽에서 실행되어 "이 코드가 지금 어디서 돌고 있지?"라는 혼란을 낳았다. 모든 요청을 SSR하면 서버 비용도 컸다. 블로그 글처럼 거의 안 바뀌는 페이지까지 매번 렌더링할 필요는 없었다.

**해결**: 렌더링 시점을 명시적으로 나눴다.

- `getStaticProps` — **빌드 타임**에 HTML 생성 (SSG)
- `getServerSideProps` — **요청마다** 서버에서 생성 (SSR)
- `revalidate` 옵션 — 정적 페이지를 **주기적으로 재생성** (ISR, 9.5)

두 함수는 **항상 서버에서만** 실행된다. 실행 위치에 대한 혼란이 사라졌다.

### Next.js 13 (2022) — App Router와 React Server Components

**불편함**: SSR을 해도 결국 **페이지 전체 컴포넌트의 JS를 클라이언트로 보내 하이드레이션**해야 했다. 서버에서 이미 다 그린 정적인 부분까지 JS가 따라갔다. 데이터 패칭은 페이지 최상단 함수에서만 할 수 있었고, 여러 페이지가 공유하는 레이아웃도 표현하기 어려웠다.

**해결**: App Router(13.4에서 stable)는 다음을 도입했다.

- **Server Components** — 서버에서만 실행되고 JS가 클라이언트로 가지 않는 컴포넌트
- **중첩 레이아웃** — `layout.tsx`로 페이지 간 공유 UI 표현
- **컴포넌트 단위 데이터 패칭** — `async` 컴포넌트에서 직접 `await`
- **스트리밍** — 준비된 부분부터 먼저 전송

### 캐싱 정책의 변화 (v14 → v15 → v16)

**불편함**: v14까지는 `fetch`와 GET Route Handler를 **기본적으로 캐싱**했다. 의도하지 않은 캐싱 때문에 "데이터가 왜 안 바뀌지?"라는 혼란이 많았다.

**해결**: v15에서 기본값을 **캐싱하지 않음**으로 뒤집었고, v16에서는 `"use cache"` 중심의 **Cache Components**로 캐싱을 명시적으로 선언하는 방향으로 정리했다.

> **흐름 정리**
> 2016년 "SSR이 너무 어렵다" → 2019년 "API 서버를 따로 띄우기 번거롭다" → 2020년 "렌더링 시점이 헷갈리고 비싸다" → 2022년 "JS를 너무 많이 보낸다" → 2024~25년 "암묵적 캐싱을 예측할 수 없다".
> 매 단계가 **직전 해법이 만든 새로운 불편함**에 대한 응답이다.

---

## 마무리

1. **CSR은 HTML에 콘텐츠가 없다는 구조적 한계** 때문에 첫 화면 속도와 SEO에서 불리했다.
2. **React SSR은 가능했지만**, 빌드·데이터 패칭·하이드레이션·라우팅·코드 스플리팅을 전부 직접 조립해야 했다.
3. **Next.js는 이 조립을 규칙으로 표준화**했다. 파일 기반 라우팅, 기본 SSR, zero-config가 그 결과이고, 이 철학은 App Router까지 이어진다.

다음 글에서는 같은 페이지를 **CRA(CSR) → Pages Router(SSR) → App Router(RSC)** 세 가지 방식으로 구현해, 브라우저가 실제로 받는 HTML과 JS가 어떻게 달라지는지 직접 비교해 볼 예정이다.

## 참고

- [Next.js 2.0 — Vercel Blog](https://vercel.com/blog/next2)
- [Next.js Blog](https://nextjs.org/blog)
- [React Docs — Server Rendering APIs](https://react.dev/reference/react-dom/server)
