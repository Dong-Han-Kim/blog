---
# 📌 기본 메타데이터
title: '효율적인 React 7편 — 경계와 번들: JS가 도착하기까지'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'Next.js', 'use client', 'Code Splitting', 'Hydration', 'LCP']
description: 'JS는 받고, 해석하고, 실행하고, hydration해야 쓸모가 생긴다. ''use client'' 경계가 번들을 결정하는 방식, 코드 분할 단위, import 습관, 서드파티 스크립트, 이미지·폰트, hydration 불일치.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 7

# 📚 SEO용
keywords: ['React', 'Next.js', 'use client', 'Code Splitting', 'Hydration', 'LCP', '효율적인 React']
---

# 효율적인 React 7편 — 경계와 번들

1\~6편은 JS가 이미 브라우저에 있을 때의 이야기였다. 이 편은 그 이전을 다룬다.

> **클라이언트로 보내는 코드 1KB는 네 번 비용을 치른다. 다운로드, 해석·컴파일, 실행, hydration.**

같은 1KB라도 이미지는 다운로드와 디코딩으로 끝나지만, JS는 메인 스레드에서 해석과 실행을 거친다. 그래서 "번들이 크다"는 네트워크 문제이면서 동시에 **INP의 ① Input Delay** 문제(6편)다. hydration이 끝나기 전까지 버튼은 보이지만 눌러도 반응하지 않는다.

서버 컴포넌트와 클라이언트 컴포넌트의 실행 모델, RSC Payload, `children` 패턴을 포함한 경계 규칙 세 가지는 React 렌더링 Deep Dive 시리즈 [5편](/posts/react-server-components)에서 다뤘다. 이 편은 그 규칙을 **번들 크기 관점에서 어디에 경계를 그을지** 정하는 기준을 다룬다.

---

## 1. `'use client'`는 컴포넌트가 아니라 모듈 그래프에 긋는 선이다

### 1-1. 경계가 번들을 결정하는 방식

```tsx
// app/products/[id]/page.tsx
'use client';                                   // ← 버튼 하나 때문에 붙였다

import { marked } from 'marked';                // 마크다운 파서
import { format } from 'date-fns';
import { ProductGallery } from './ProductGallery';
import { ReviewList } from './ReviewList';

export default function ProductPage({ product }: { product: Product }) {
  const [qty, setQty] = useState(1);
  return (
    <>
      <ProductGallery images={product.images} />
      <div dangerouslySetInnerHTML={{ __html: marked(product.description) }} />
      <p>등록일 {format(product.createdAt, 'yyyy.MM.dd')}</p>
      <QuantityPicker value={qty} onChange={setQty} />
      <ReviewList reviews={product.reviews} />
    </>
  );
}
```

`'use client'`는 **이 파일과, 이 파일이 import하는 모든 모듈**을 클라이언트 번들에 넣으라는 선언이다. 수량 선택기 하나 때문에 마크다운 파서, 날짜 라이브러리, 갤러리, 리뷰 목록이 전부 브라우저로 간다. 그리고 전부 hydration 대상이 된다.

### 1-2. 경계를 말단(leaf)으로 내린다

```tsx
// app/products/[id]/page.tsx — 서버 컴포넌트 (지시어 없음)
import { marked } from 'marked';               // 서버에서만 실행, 번들 0KB
import { format } from 'date-fns';
import { AddToCart } from './AddToCart';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);
  return (
    <>
      <ProductGallery images={product.images} />   {/* 상호작용 없으면 서버 컴포넌트 */}
      <div dangerouslySetInnerHTML={{ __html: marked(product.description) }} />
      <p>등록일 {format(product.createdAt, 'yyyy.MM.dd')}</p>
      <AddToCart productId={product.id} />         {/* 여기만 클라이언트 */}
      <ReviewList reviews={product.reviews} />
    </>
  );
}
```

```tsx
// app/products/[id]/AddToCart.tsx
'use client';

export function AddToCart({ productId }: { productId: string }) {
  const [qty, setQty] = useState(1);
  return (/* QuantityPicker + 버튼 */);
}
```

클라이언트 번들에는 `AddToCart`와 그 의존성만 남는다. (마크다운을 HTML로 삽입할 때는 서버에서 sanitize해야 한다는 점은 별개로 지킨다.)

### 1-3. 경계를 정하는 질문

컴포넌트마다 순서대로 묻는다.

1. **state, Effect, 이벤트 핸들러, 브라우저 API를 쓰는가?** 아니면 서버 컴포넌트다.
2. 쓴다면, **그 부분만 떼어낼 수 있는가?** 카드 전체가 아니라 카드 안의 "좋아요 버튼"만 클라이언트로.
3. 떼어낼 수 없고 무관한 자식을 감싸야 한다면, **자식을 `children`으로 받는가?** 클라이언트 컴포넌트가 `children`으로 받은 서버 컴포넌트는 서버에서 렌더되어 결과만 전달된다.

```tsx
'use client';
export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button aria-expanded={open} onClick={() => setOpen(o => !o)}>{title}</button>
      {open && children}
    </section>
  );
}
```

```tsx
// 서버 컴포넌트에서
<Collapsible title="상세 스펙">
  <SpecTable productId={id} />   {/* 서버 컴포넌트 그대로 */}
</Collapsible>
```

3편의 Composition이 렌더 범위를 줄였던 것과 같은 구조가, 여기서는 **번들 범위**를 줄인다.

### 1-4. Provider는 얇은 클라이언트 파일로

Context Provider는 클라이언트 컴포넌트여야 한다. 루트 레이아웃 전체에 `'use client'`를 붙이지 말고 Provider만 분리한다.

```tsx
// app/providers.tsx
'use client';
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
```

```tsx
// app/layout.tsx — 서버 컴포넌트 유지
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
```

### 1-5. 반대 방향의 사고도 막는다: `server-only`

경계를 내리다 보면 서버 전용 코드(DB 클라이언트, 비밀 키를 쓰는 모듈)가 실수로 클라이언트 컴포넌트에 import될 수 있다.

```ts
// lib/db.ts
import 'server-only';               // 클라이언트 번들에 포함되면 빌드 에러
export const db = createDbClient(process.env.DATABASE_URL!);
```

런타임에 누출을 발견하는 대신 **빌드가 실패**하게 만든다. 비밀 값이 `NEXT_PUBLIC_` 접두사로 번들에 들어가는 문제는 [안티패턴 시리즈 6편](/posts/frontend-antipatterns-6-bundle-and-boundaries)에서 다뤘다.

---

## 2. 서버에 둘 수 있는 무거운 일

서버 컴포넌트에서 실행하는 라이브러리는 번들에 들어가지 않는다. 다음은 대표적으로 서버로 옮길 수 있는 작업이다.

| 작업 | 클라이언트에 두면 | 서버 컴포넌트에서 |
|---|---|---|
| 마크다운·MDX 파싱 | 파서 + 플러그인 전체 | HTML 결과만 |
| 코드 구문 강조 | 언어 문법 정의와 테마 | 강조된 HTML만 |
| 날짜·숫자·통화 포맷 | 로케일 데이터 | 문자열만 |
| 데이터 가공(정렬, 집계, 조인) | 원본 데이터 전체 + 가공 코드 | 가공된 결과만 |
| 권한에 따른 분기 | 모든 분기의 UI 코드 | 해당 사용자의 UI만 |

마지막 행은 보안과도 연결된다. 관리자 UI 코드가 일반 사용자 번들에 들어 있으면, 버튼을 숨겨도 코드는 읽을 수 있다.

---

## 3. 코드 분할 단위

### 3-1. 자동으로 분할되는 것

Next.js App Router는 **라우트 단위**로 코드를 자동 분할한다. 페이지 A의 코드는 페이지 B 번들에 들어가지 않는다. 그래서 수동 분할은 **한 라우트 안에서** 결정하면 된다.

### 3-2. 분할할 가치가 있는 것

| 대상 | 이유 |
|---|---|
| **사용자 행동으로 열리는 무거운 UI** | 모달 안의 에디터, 차트, 지도, 결제 위젯. 대부분의 방문자는 열지 않는다. |
| **첫 화면 아래(below the fold)의 무거운 영역** | 스크롤해야 보이는 댓글 에디터, 인터랙티브 데모 |
| **특정 조건에서만 쓰는 기능** | 관리자 도구, 특정 파일 형식 뷰어 |

```tsx
'use client';
import dynamic from 'next/dynamic';

const RichEditor = dynamic(() => import('./RichEditor'), {
  loading: () => <EditorSkeleton />,
});

export function CommentComposer() {
  const [open, setOpen] = useState(false);
  return open ? <RichEditor /> : <button onClick={() => setOpen(true)}>댓글 쓰기</button>;
}
```

`ssr: false`는 **브라우저 API 없이는 모듈 평가 자체가 실패하는 라이브러리**에만 쓴다. 습관적으로 붙이면 그 영역이 서버 HTML에서 빠져서 LCP와 CLS가 나빠진다.

### 3-3. 분할하면 오히려 손해인 것

- **첫 화면에 보이는 콘텐츠**: 분할하면 "HTML → JS 청크 요청 → 렌더"로 한 단계가 늘어 LCP가 늦어진다.
- **작은 컴포넌트**: 청크 요청 하나의 왕복 비용이 절약되는 바이트보다 크다.
- **거의 모든 사용자가 곧바로 쓰는 기능**: 어차피 받을 코드를 늦게 받을 뿐이다.

### 3-4. 분할한 코드는 의도가 보일 때 미리 받는다

5편 2-4절에서 다뤘다. hover, focus, 화면 진입 직전에 `import()`를 먼저 호출해 두면 클릭 시점에는 청크가 이미 도착해 있다.

---

## 4. import 습관이 번들을 정한다

트리셰이킹이 실패하는 다섯 가지 원인은 [안티패턴 시리즈 6편](/posts/frontend-antipatterns-6-bundle-and-boundaries)에서 다뤘다. 여기서는 일상에서 지킬 습관만 정리한다.

| 습관 | 이유 |
|---|---|
| 대형 라이브러리는 ESM·부분 import를 지원하는지 확인 | CommonJS 전체 import는 트리셰이킹이 어렵다 |
| 내부 코드의 거대한 barrel 파일(`index.ts`에서 전부 re-export) 지양 | 번들러가 사이드 이펙트 여부를 판단하지 못하면 전체를 포함한다 |
| 아이콘은 개별 import | `import * as Icons`는 전체 세트 |
| 브라우저 내장 기능으로 대체 가능한지 확인 | 날짜·숫자 포맷은 `Intl`, 딥 클론은 `structuredClone`, 요청은 `fetch` |
| 새 의존성 추가 시 크기 확인 | 추가 시점에 보는 것이 제거하는 것보다 싸다 |

Next.js는 자주 쓰이는 대형 패키지에 대해 개별 모듈 import로 자동 변환하는 설정(`optimizePackageImports`)을 제공한다. 사용하는 라이브러리가 대상인지 확인한다.

### 측정

- 빌드 출력의 **라우트별 First Load JS**를 기록한다. 이 수치가 늘어나는 PR은 리뷰에서 이유를 묻는다(8편 성능 예산).
- 번들 분석기(`@next/bundle-analyzer` 등)로 **무엇이** 크게 차지하는지 본다. 예상하지 못한 라이브러리가 클라이언트 청크에 있다면 대부분 `'use client'` 경계가 너무 위에 있는 것이다.

---

## 5. 서드파티 스크립트

분석, 광고, 채팅 위젯, A/B 테스트 스크립트는 **내 번들 밖에 있어서** 번들 분석에 잡히지 않지만, 같은 메인 스레드를 쓴다.

### 5-1. 로딩 시점을 명시한다

```tsx
import Script from 'next/script';

<Script src="https://analytics.example.com/a.js" strategy="afterInteractive" />  {/* hydration 이후 */}
<Script src="https://chat.example.com/widget.js" strategy="lazyOnload" />        {/* 브라우저 유휴 시 */}
```

| 전략 | 쓰는 경우 |
|---|---|
| `beforeInteractive` | 페이지가 동작하기 전에 반드시 필요한 것(봇 탐지, 동의 관리 등). 드물다. |
| `afterInteractive` | 기본값. 페이지뷰 분석처럼 곧 필요한 것. |
| `lazyOnload` | 채팅 위젯, 피드백 버튼처럼 늦어도 되는 것. |

### 5-2. 무거운 임베드는 Facade로

동영상 플레이어, 지도, 소셜 임베드는 iframe 하나에 수백 KB의 JS를 끌고 온다. 처음에는 **썸네일 이미지와 재생 버튼만** 보여주고, 클릭했을 때 실제 임베드로 교체한다.

```tsx
'use client';
export function VideoFacade({ videoId, title }: { videoId: string; title: string }) {
  const [active, setActive] = useState(false);
  if (active) return <iframe src={`https://player.example.com/embed/${videoId}?autoplay=1`} title={title} allow="autoplay" />;
  return (
    <button onClick={() => setActive(true)} aria-label={`${title} 재생`}>
      <img src={`/thumbs/${videoId}.webp`} alt="" width={640} height={360} />
    </button>
  );
}
```

---

## 6. 이미지와 폰트: LCP와 CLS의 대부분

### 6-1. LCP 이미지

대부분의 페이지에서 LCP 요소는 첫 화면의 큰 이미지다.

| 할 일 | 이유 |
|---|---|
| LCP 이미지는 **지연 로딩하지 않는다** | `loading="lazy"`는 레이아웃이 확정된 뒤에야 요청을 시작한다 |
| 우선 로드를 지정한다 | `fetchpriority="high"` 또는 Next.js `Image`의 우선 로드 옵션(버전에 따라 이름이 다르므로 문서 확인) |
| `width`/`height` 또는 `aspect-ratio`를 지정한다 | 도착 전에 공간을 확보해 CLS를 막는다 |
| `sizes`를 지정한다 | 반응형 이미지에서 모바일이 데스크톱 크기 이미지를 받지 않게 한다 |
| 첫 화면 아래 이미지는 지연 로딩한다 | 대역폭을 LCP 이미지에 양보한다 |

CSS `background-image`로 넣은 히어로 이미지는 CSS를 받고 파싱한 뒤에야 발견된다. LCP 이미지는 `<img>`로 넣는다.

### 6-2. 폰트

한글 웹폰트는 글리프 수가 많아 파일이 크다. 두 가지 비용이 생긴다.

- **텍스트가 늦게 보인다(FOIT)** 또는 **폰트가 바뀌면서 레이아웃이 밀린다(FOUT → CLS).**
- 쓰지 않는 글자까지 다운로드한다.

```tsx
// app/layout.tsx
import localFont from 'next/font/local';

const pretendard = localFont({
  src: './fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-sans',
  // next/font는 대체 폰트의 크기 보정값을 계산해 폰트 교체 시 레이아웃 이동을 줄인다
});
```

- **셀프 호스팅**: 외부 폰트 서버로의 추가 연결을 없앤다. `next/font`는 빌드 시점에 폰트를 가져와 같은 도메인에서 제공한다.
- **대체 폰트 크기 보정**: 웹폰트와 시스템 폰트의 글자 폭 차이 때문에 교체 시 줄바꿈이 달라진다. `size-adjust` 등으로 보정하면 CLS가 줄어든다.
- **서브셋**: 한글은 동적 서브셋(유니코드 범위별로 나눈 파일을 필요한 범위만 로드)을 제공하는 배포본을 쓰거나, 사용 글자가 정해진 곳(로고, 제목 전용 폰트)은 해당 글자만 남긴다.
- **가변 폰트**: 굵기별 파일 여러 개 대신 파일 하나.

---

## 7. Hydration 비용과 불일치

### 7-1. hydration 비용을 줄이는 방법

hydration은 서버 HTML에 **클라이언트 컴포넌트 트리 전체를 다시 실행**해서 이벤트 핸들러를 연결하는 작업이다. 비용은 클라이언트 컴포넌트의 양에 비례한다.

1. **클라이언트 컴포넌트를 줄인다.** 1절의 경계 내리기가 곧 hydration 비용 줄이기다. 서버 컴포넌트는 hydration 대상이 아니다.
2. **Suspense 경계로 나눈다.** 경계 단위로 hydration이 나뉘고, 사용자가 상호작용한 영역이 먼저 hydration된다(Selective Hydration, [React 렌더링 Deep Dive 6편](/posts/react-streaming-rendering)). 경계가 없으면 페이지 전체가 한 덩어리로 hydration되어 그동안 모든 입력이 기다린다.

### 7-2. 불일치(hydration mismatch)는 성능 버그다

서버 HTML과 클라이언트 첫 렌더 결과가 다르면 React는 경고를 내고, 불일치가 생긴 경계를 **클라이언트에서 다시 렌더**한다. 서버 렌더의 이점이 그 영역에서 사라진다.

| 원인 | 예 | 해결 |
|---|---|---|
| 시간·난수 | `Date.now()`, `Math.random()`으로 렌더 | 서버에서 값을 정해 props로 전달, ID는 `useId` |
| 환경 분기 | 렌더 중 `typeof window !== 'undefined'` 분기 | 클라이언트 전용 값은 `useSyncExternalStore`의 서버 스냅샷 또는 마운트 후 표시 |
| 로케일·타임존 | 서버(UTC)와 브라우저(KST)의 날짜 포맷 차이 | 타임존을 명시해 포맷하거나 서버에서 문자열로 확정 |
| 브라우저 저장소 | `localStorage` 값으로 첫 렌더 | 첫 렌더는 기본값, 이후 반영(또는 쿠키로 서버에서 읽기) |
| 잘못된 HTML 중첩 | `<p>` 안의 `<div>` | 브라우저가 서버 HTML을 고쳐서 구조가 달라진다 |

`suppressHydrationWarning`은 "마지막 수정 3분 전"처럼 **텍스트 한 곳이 다를 수밖에 없는 경우**에만, 해당 요소 하나에 쓴다. 경고를 끄는 것이지 재렌더를 막는 장치로 쓰면 안 된다.

---

## 8. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| `'use client'` 경계, 비밀 유출 | [6편 — use client 커트라인, `NEXT_PUBLIC_` 비밀 유출](/posts/frontend-antipatterns-6-bundle-and-boundaries) |
| 코드 분할 단위, 트리셰이킹 | [6편 — 트리셰이킹 실패 5원인, 코드 분할 단위](/posts/frontend-antipatterns-6-bundle-and-boundaries) |
| LCP·CLS | [4편 — LCP/CLS/INP](/posts/frontend-antipatterns-4-rendering-performance) |
| 서드파티 스크립트 | [9편 — Cargo Cult(도입 판단)](/posts/frontend-antipatterns-9-organization) |

---

## 자가진단 체크리스트

- [ ] `'use client'`가 페이지나 레이아웃 파일 최상단에 붙어 있지 않다.
- [ ] 클라이언트 컴포넌트가 무관한 자식을 감쌀 때 `children`으로 받는다.
- [ ] Provider는 `children`을 받는 얇은 클라이언트 파일로 분리되어 있다.
- [ ] DB·비밀 키 모듈에 `server-only`가 있다.
- [ ] 마크다운 파싱, 구문 강조, 데이터 가공은 서버에서 한다.
- [ ] 사용자 행동으로 열리는 무거운 UI만 분할하고, 첫 화면 콘텐츠는 분할하지 않았다.
- [ ] `ssr: false`는 브라우저 없이 평가가 불가능한 라이브러리에만 쓴다.
- [ ] 라우트별 First Load JS를 알고 있다.
- [ ] 서드파티 스크립트마다 로딩 전략이 명시되어 있다.
- [ ] LCP 이미지는 지연 로딩하지 않고 크기가 지정되어 있다.
- [ ] 웹폰트는 셀프 호스팅, 크기 보정, 서브셋이 적용되어 있다.
- [ ] 콘솔에 hydration 불일치 경고가 없다.

---

## 다음 편

1\~7편에서 비용 구조, 상태, 렌더 범위, Effect, 데이터, 우선순위, 번들을 다뤘다. 마지막 [8편](/posts/efficient-react-8-measure-and-sustain)은 이 모든 것을 **팀과 시간 속에서 유지하는 법**을 다룬다. 실제 사용자 환경에서 INP를 추적하는 법, 성능 예산을 CI에 거는 법, lint 규칙으로 판단을 기계화하는 법, 그리고 시리즈 전체를 하나의 체크리스트로 정리한다.
