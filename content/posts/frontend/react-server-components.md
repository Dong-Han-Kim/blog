---
# 📌 기본 메타데이터
title: 'React Server Components — 렌더링을 어디서 할 것인가'
date: '2026-04-05'
category: 'frontend'
tags: ['React', 'RSC', 'Server Components', 'Next.js', 'SSR']
description: 'SSR과 RSC의 차이, Server/Client Component의 경계 규칙, 그리고 children 패턴이 왜 중요한지 정리합니다.'

# 💬 옵션 필드
draft: false
series: 'React 렌더링 Deep Dive'
seriesOrder: 5

# 📚 SEO용
keywords: ['React', 'RSC', 'Server Components', 'Next.js', 'SSR', 'React 렌더링']
---

# React Server Components — 렌더링을 어디서 할 것인가

지금까지의 시리즈([1편](/posts/react-rendering-principles), [2편](/posts/react-fiber-architecture), [3편](/posts/react-suspense))는 전부 "브라우저 안에서" 벌어지는 이야기였다. Virtual DOM 생성도, Fiber 순회도, Suspense의 재시도도 모두 클라이언트의 JavaScript가 하는 일이었다.

Server Components(RSC)는 질문의 축을 바꾼다.

> "그런데 그 컴포넌트, 꼭 브라우저에서 실행해야 해?"

## 먼저, SSR을 정확히 이해하기

SSR(Server-Side Rendering)이 하는 일을 정확히 짚으면 이렇다.

1. 서버가 컴포넌트 트리를 실행해 **HTML 문자열**을 만든다
2. 브라우저는 그 HTML을 즉시 표시한다 (빠른 첫 화면)
3. 그런데 이 HTML은 아직 죽어있다. 클릭해도 반응이 없다
4. 그래서 **같은 컴포넌트들의 JavaScript를 전부 다운로드**해 다시 실행하고, HTML에 이벤트 핸들러를 붙인다 — 이것이 **Hydration**이다

여기서 SSR의 한계가 보인다.

- **JS 번들은 하나도 줄지 않는다.** 서버에서 HTML을 만들었어도, hydration을 위해 모든 컴포넌트 코드가 브라우저로 전송된다. 사실상 같은 렌더링을 서버에서 한 번, 클라이언트에서 한 번, **두 번** 하는 셈이다.
- **첫 로드에만 적용된다.** 이후 데이터가 바뀌면 결국 클라이언트에서 fetch하고 클라이언트에서 렌더링한다.

즉 SSR은 "**첫 화면이 뜨는 속도**"를 해결한 것이지, "**브라우저로 보내는 코드의 양**"은 해결하지 못했다.

## RSC의 정체: 브라우저로 코드를 보내지 않는 컴포넌트

Server Component의 핵심 정의는 이것이다.

> **오직 서버에서만 실행되고, 그 JavaScript 코드가 브라우저로 절대 전송되지 않는 컴포넌트.**

마크다운을 HTML로 변환하는 블로그 글 컴포넌트를 예로 들어보자.

```jsx
// 마크다운 파서, 코드 하이라이터... 합쳐서 수백 KB
import { parseMarkdown } from "heavy-markdown-lib";
import { highlight } from "heavy-syntax-highlighter";

async function BlogPost({ slug }) {
  const post = await db.posts.find(slug);   // DB 직접 접근!
  const html = highlight(parseMarkdown(post.content));
  return <article dangerouslySetInnerHTML={{ __html: html }} />;
}
```

이 컴포넌트가 Server Component라면:

- `heavy-markdown-lib`, `heavy-syntax-highlighter`는 **브라우저 번들에 0바이트도 포함되지 않는다.** 서버에서 실행이 끝났고, 결과만 넘어간다.
- **DB에 직접 접근한다.** API 라우트를 따로 만들 필요가 없고, API 키 같은 비밀 값도 서버에 안전하게 남는다.
- **`async/await`가 자연스럽게 가능하다.** 서버에서는 렌더링이 요청 처리의 일부이므로, 기다렸다가 완성해서 보내면 된다.

## 서버에서 클라이언트로 넘어가는 것: RSC Payload

SSR과 결정적으로 다른 지점이 여기다. RSC의 결과물은 HTML이 **아니다**. **RSC Payload**라 부르는 직렬화된 데이터다. 개념적으로 이렇게 생겼다.

```
["article", { children: ["h1", {}, "React 렌더링 원리"], ... }]
```

어디서 본 형태다. **Virtual DOM(React Element 트리)을 직렬화한 것**이다. 1편의 개념이 여기서 다시 등장한다.

HTML이 아니라 React가 이해하는 트리 형태이기 때문에, 클라이언트의 React는 이것을 받아 **기존 트리와 Reconciliation을 할 수 있다.** 데이터가 바뀌어 서버가 새 Payload를 보내면, 클라이언트는 화면을 통째로 갈아치우는 게 아니라 **바뀐 부분만 부드럽게 업데이트**한다. 클라이언트 컴포넌트의 state(입력 중이던 폼, 스크롤 위치)도 유지된다. HTML을 다시 받는 전통적인 MPA 방식으로는 불가능한 일이다.

## SSR vs RSC 정리

| | SSR | RSC |
|---|---|---|
| 해결하는 문제 | 첫 화면 표시 속도 | 브라우저로 보내는 JS 양 |
| 결과물 | HTML 문자열 | RSC Payload (직렬화된 React 트리) |
| 컴포넌트 JS 전송 | 전부 전송 (hydration 필요) | 전송 안 함 |
| 적용 시점 | 첫 로드만 | 첫 로드 + 이후 갱신에도 |

중요한 것은 둘의 관계다. **RSC와 SSR은 대체재가 아니라 보완재다.** Next.js App Router는 첫 요청 시 RSC로 트리를 만들고 → 그것을 SSR로 HTML까지 구워서 보낸다. 첫 화면은 HTML로 빠르게, 이후 갱신은 RSC Payload로 부드럽게.

## Client Component와의 경계 규칙

서버에서만 실행된다면 `useState`는? `onClick`은? 서버는 렌더링이 끝나면 연결이 끊기므로 상태나 이벤트가 존재할 수 없다. 그래서 `"use client"` 지시어로 표시하는 **Client Component**가 존재한다.

두 종류의 컴포넌트가 한 트리에 섞일 때의 규칙이 중요하다.

### 규칙 1: import가 경계를 결정한다

```jsx
// ClientComponent.jsx
"use client";
import ServerThing from "./ServerThing";  // ❌ 이 순간 ServerThing은
                                          //    Client Component로 변한다
```

`"use client"` 파일이 import하는 모든 것은 **클라이언트 번들로 딸려 들어간다.** 서버 컴포넌트이길 기대했던 파일도 import되는 순간 클라이언트 컴포넌트로 취급된다. 그 안에서 DB에 접근하고 있었다면 브라우저에는 DB가 없으므로 에러가 난다.

실행 시점을 생각하면 자명하다. 클라이언트 컴포넌트는 브라우저에서 실행되는데, 그 렌더링 도중에 "이 부분은 서버에서 실행해줘"라고 할 수 없다. 서버는 이미 응답을 끝내고 떠났다.

### 규칙 2: 탈출구 — children으로 전달하기

**직접 import는 안 되지만, props로 건네받는 것은 된다.**

```jsx
// ServerPage.jsx (Server Component)
import ClientLayout from "./ClientLayout";
import ServerContent from "./ServerContent";

export default function Page() {
  return (
    <ClientLayout>
      <ServerContent />   {/* Server Component를 children으로! */}
    </ClientLayout>
  );
}
```

```jsx
// ClientLayout.jsx
"use client";

export default function ClientLayout({ children }) {
  const [open, setOpen] = useState(true);
  return (
    <div onClick={() => setOpen(!open)}>
      {open && children}   {/* 받은 것을 배치만 한다 */}
    </div>
  );
}
```

이 구조에서 `<ServerContent />`를 <strong>실행하는 주체는 서버 컴포넌트인 `Page`</strong>다. 서버가 `ServerContent`를 미리 렌더링해서, 그 <strong>결과물(RSC Payload 조각)</strong>을 `children`이라는 상자에 담아 건네준다. `ClientLayout`은 상자의 내용물이 무엇인지 알 필요 없이 "받은 것을 어디에 놓을지"만 결정한다.

비유하면 클라이언트 컴포넌트는 **액자**다. 액자가 그림을 그릴 수는 없지만(import 불가), 서버가 완성해 건네준 그림을 걸 수는 있다(children 전달).

정리하면:

> "상위 컴포넌트가 Server Component여야 한다" (X)
> **"Server Component를 '실행'하는 주체가 서버여야 한다. 트리상 위치는 클라이언트 컴포넌트 아래여도 상관없다"** (O)

### 이 패턴이 중요한 이유

children 패턴이 없다면, 트리 최상단에 `"use client"` 레이아웃(테마 프로바이더, 인터랙티브 네비게이션 등) 하나만 있어도 **그 아래 전부가 클라이언트로 오염**되어 RSC의 이점이 사라진다. children 패턴 덕분에 "인터랙티브한 껍데기 + 서버 렌더링 알맹이" 구조가 가능하다.

Next.js App Router의 `layout.tsx`가 정확히 이 원리로 동작한다. 레이아웃이 클라이언트 컴포넌트여도 `children`으로 들어오는 페이지는 서버 컴포넌트로 남을 수 있다.

### 규칙 3: 경계를 넘는 props는 직렬화 가능해야 한다

서버→클라이언트 경계를 넘는 props는 **네트워크를 건너야 하므로 직렬화 가능해야 한다.** 문자열, 숫자, 배열, 일반 객체, JSX는 되지만 — **함수는 안 된다.**

```jsx
// Server Component에서
<ClientButton onClick={() => {...}} />  // ❌ 함수는 경계를 넘지 못한다
<ClientButton label="저장" />           // ✅ 직렬화 가능
```

"Server Component에서 Client Component에 이벤트 핸들러를 넘길 수 없다"는 흔한 에러의 원인이 이것이다. (예외적으로 Server Actions는 넘길 수 있는데, 함수 자체가 아니라 "서버의 함수를 가리키는 참조"가 넘어가는 것이다.)

## 정리

| 개념 | 핵심 |
|------|------|
| **SSR** | 첫 화면 HTML을 미리 생성. 단, hydration 때문에 JS 번들은 그대로 |
| **RSC** | 서버에서만 실행, 코드는 브라우저로 전송되지 않음 |
| **RSC Payload** | 직렬화된 React 트리 — 클라이언트에서 Reconciliation 가능 |
| **경계 규칙 1** | `"use client"`가 import하면 전부 클라이언트로 |
| **경계 규칙 2** | 서버가 실행한 결과물을 children/props로 전달하는 것은 가능 |
| **경계 규칙 3** | 경계를 넘는 props는 직렬화 가능해야 함 (함수 불가) |

## 다음 글 예고

Server Component가 `await`로 데이터를 기다린다면, 그동안 사용자는 빈 화면을 봐야 할까? 여기서 3편의 Suspense가 다시 등장한다. 다음 글에서는 **RSC와 Suspense가 결합해 서버 렌더링 결과를 스트리밍으로 조각조각 전달하는 방식**을 다뤄보겠다.
