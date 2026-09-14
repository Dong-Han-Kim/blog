---
# 📌 기본 메타데이터
title: '프론트엔드 안티패턴 (7) — CSS와 접근성: 조용히 실패하는 것들'
date: '2026-09-14'
category: 'frontend'
tags: ['CSS', 'Accessibility', 'a11y', 'Design Tokens', 'Anti-Pattern']
description: '!important가 해결이 아니라 증거인 이유, z-index 인플레이션, 마진 소유권, 그리고 div 버튼부터 포커스 관리까지 예외를 던지지 않는 실패들.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 안티패턴'
seriesOrder: 7

# 📚 SEO용
keywords: ['CSS', 'Accessibility', 'a11y', 'Design Tokens', 'Anti-Pattern', '프론트엔드 안티패턴']
---

# 프론트엔드 안티패턴 (7) — CSS와 접근성

이 두 영역을 한 편에 묶은 이유가 있습니다. **둘 다 조용히 실패하기 때문**입니다.

타입 에러는 빌드를 멈춥니다. 런타임 에러는 로그를 남깁니다. 그런데 `!important`가 한 줄 늘어나는 것도, 스크린 리더 사용자가 버튼을 못 누르는 것도 **아무 신호를 만들지 않습니다.** 1편에서 말한 "지연된 비용"의 전형입니다.

---

# 1부. CSS

## 특이성 전쟁과 `!important`

### 발생 경로

```css
/* 1주차 */
.button { background: blue; }

/* 3주차 — 사이드바 안에서는 다르게 */
.sidebar .button { background: gray; }

/* 6주차 — 사이드바의 강조 버튼은 또 달라야 함 */
.sidebar .button.primary { background: blue; }

/* 10주차 — 모달 안 사이드바의... */
#app .modal .sidebar .button.primary { background: blue; }

/* 12주차 — 포기 */
.button-override { background: blue !important; }
```

**각 단계는 전부 "지금 당장 화면을 맞추는" 합리적 선택이었습니다.** 그리고 이 방향은 되돌릴 수 없습니다. 다음 사람은 이걸 이기려고 `!important` 두 개와 더 긴 셀렉터를 씁니다.

### `!important`의 의미

`!important`는 문제의 **해결이 아니라 증거**입니다. 증거가 가리키는 것은 이것입니다.

> **스타일의 소유권이 불분명하다.** 여러 곳이 같은 요소의 같은 속성을 결정하려 하고 있다.

### 해법 1 — 스코프를 만든다

특이성 전쟁의 근본 원인은 **CSS가 전역 네임스페이스**라는 것입니다. 스코프가 생기면 경쟁 자체가 사라집니다.

```tsx
// CSS Modules — 클래스명이 자동으로 고유해진다
import styles from './Button.module.css';
<button className={styles.button} />
```

```tsx
// 유틸리티 클래스 — 특이성이 전부 동일해서 순서만 남는다
<button className="bg-blue-500 hover:bg-blue-600" />
```

**어느 쪽이든 "남의 스타일을 이겨야 하는" 상황이 구조적으로 없어집니다.**

### 해법 2 — 캐스케이드 레이어

레거시 CSS가 있어서 스코프를 못 만드는 경우, `@layer`가 특이성 계산 자체를 우회합니다.

```css
@layer reset, vendor, base, components, utilities;

@layer vendor {
  /* 서드파티 CSS — 특이성이 아무리 높아도 */
  #app .some-plugin .btn { color: red; }
}

@layer components {
  /* 뒤 레이어가 이긴다. 특이성 0.0.1이어도 */
  .btn { color: blue; }
}
```

**레이어 순서가 특이성보다 우선합니다.** 서드파티 CSS를 다룰 때 특히 유용합니다.

### 해법 3 — 특이성을 일부러 낮추기

```css
/* 특이성 0,1,0 — 재정의하기 어렵다 */
.card .title { font-size: 18px; }

/* 특이성 0,0,0 — :where()는 특이성을 0으로 만든다 */
:where(.card) :where(.title) { font-size: 18px; }
```

디자인 시스템의 기본값을 `:where()`로 정의하면 **사용처에서 클래스 하나로 쉽게 덮어쓸 수 있습니다.** 3편의 제어권 넘기기와 같은 발상입니다.

---

## z-index 인플레이션

```css
.header  { z-index: 100; }
.dropdown { z-index: 1000; }
.modal   { z-index: 9999; }
.toast   { z-index: 99999; }
.tooltip { z-index: 999999; }   /* 다음 사람은 9999999를 쓸 것이다 */
```

### 왜 숫자를 올려도 안 되는 경우가 있는가

z-index는 **같은 stacking context 안에서만** 비교됩니다. 새 stacking context를 만드는 속성이 많다는 걸 모르면 계속 헤맵니다.

**stacking context를 만드는 것들:** `position` + `z-index`(auto 아님), `opacity < 1`, `transform`, `filter`, `will-change`, `isolation: isolate`, `contain: paint`, flex/grid 자식의 `z-index`.

```css
/* 이 부모 때문에 자식은 아무리 z-index를 올려도 형제 밖으로 못 나간다 */
.card { opacity: 0.99; }      /* 새 stacking context 생성 */
.card .tooltip { z-index: 999999; }   /* 소용없음 */
```

### 정상 — 토큰화 + 격리

```css
:root {
  --z-base: 0;
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-overlay: 30;
  --z-modal: 40;
  --z-toast: 50;
  --z-tooltip: 60;
}

.modal { z-index: var(--z-modal); }
```

**그리고 오버레이 계열은 포털로 body 바로 아래에 렌더하세요.** 그러면 부모의 stacking context에 갇히지 않습니다.

```tsx
createPortal(<Modal />, document.body);
```

**규칙: 문서에 정의된 토큰 외의 z-index 값이 코드에 등장하면 리뷰에서 막으세요.**

---

## 마진 소유권

실무에서 컴포넌트 재사용을 가장 자주 방해하는 안티패턴입니다.

```css
/* 🔴 컴포넌트가 자기 "바깥" 여백을 소유한다 */
.card { margin-bottom: 16px; }
```

이 카드를 다른 맥락에 쓰면 원치 않는 16px가 따라옵니다. 그래서 이런 게 생깁니다.

```css
.card--no-margin { margin-bottom: 0; }
.card--compact { margin-bottom: 8px; }
.sidebar .card:last-child { margin-bottom: 0; }
```

### 원칙

> **컴포넌트는 자기 안쪽(padding)만 소유한다. 바깥 여백은 배치하는 쪽이 소유한다.**

```css
/* ✅ 부모가 간격을 결정 */
.card-list { display: flex; flex-direction: column; gap: 16px; }
.card { padding: 16px; }   /* margin 없음 */
```

`gap`은 마진 병합(margin collapsing) 문제도, 마지막 항목 처리도 없습니다. **Flexbox/Grid가 보급된 지금 컴포넌트 루트에 `margin`을 쓸 이유가 거의 없습니다.**

예외가 필요하면 배치용 래퍼를 두거나, 간격을 prop으로 받는 레이아웃 컴포넌트를 씁니다.

```tsx
<Stack gap={16}>
  <Card />
  <Card />
</Stack>
```

---

## 매직 넘버 좌표

```css
/* 🔴 어떻게 나온 숫자인가? */
.dropdown { position: absolute; top: 37px; left: -12px; }
.badge { transform: translate(-3px, 2px); }
```

**이 숫자들은 특정 시점의 특정 폰트·특정 내용에 맞춰 눈으로 맞춘 값입니다.** 폰트가 바뀌거나, 텍스트가 길어지거나, 다른 언어가 들어오면 어긋납니다. 그리고 왜 37인지 아무도 모르므로 고칠 수도 없습니다.

```css
/* ✅ 관계로 표현 */
.dropdown-wrapper { position: relative; }
.dropdown {
  position: absolute;
  top: calc(100% + var(--space-1));   /* 트리거 바로 아래 + 간격 토큰 */
  left: 0;
}
```

**복잡한 포지셔닝(충돌 감지, 뷰포트 경계, 자동 뒤집기)은 직접 계산하지 마세요.** Floating UI 같은 라이브러리나 CSS Anchor Positioning이 훨씬 정확합니다.

---

## 토큰 없이 하드코딩된 값

```css
/* 🔴 200곳에 흩어진 같은 파랑 */
.btn-primary { background: #3b82f6; }
.link { color: #3b82f6; }
.badge-info { border-color: #3b82f6; }
```

브랜드 컬러 변경 요청이 오면 **200곳을 찾아 고쳐야 합니다.** 범용 스멜 **Shotgun Surgery**의 CSS 판본입니다. 그리고 `#3b82f6`와 `#3B82F6`와 `rgb(59,130,246)`가 섞여 있으면 검색으로도 다 못 찾습니다.

### 토큰은 두 계층으로

```css
:root {
  /* 1층: 원시 토큰 — 값 그 자체 */
  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --gray-50: #f9fafb;
  --gray-900: #111827;

  /* 2층: 시맨틱 토큰 — 역할 */
  --color-primary: var(--blue-500);
  --color-primary-hover: var(--blue-600);
  --color-surface: var(--gray-50);
  --color-text: var(--gray-900);
}
```

**컴포넌트는 시맨틱 토큰만 씁니다.**

```css
.btn-primary { background: var(--color-primary); }
```

이 분리가 있어야 다음 절의 다크모드가 가능해집니다.

---

## 다크모드를 나중에 얹기

시맨틱 토큰 없이 다크모드를 요구받으면 **리팩터링이 아니라 재작성**입니다.

```css
/* ✅ 시맨틱 토큰이 있으면 매핑만 바꾸면 된다 */
:root {
  --color-surface: var(--gray-50);
  --color-text: var(--gray-900);
}

:root[data-theme='dark'] {
  --color-surface: var(--gray-900);
  --color-text: var(--gray-50);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --color-surface: var(--gray-900);
    --color-text: var(--gray-50);
  }
}
```

**컴포넌트 CSS는 한 줄도 안 고칩니다.**

### 다크모드의 흔한 실수 세 개

```css
/* 🔴 단순 반전 — 대비가 깨지고 눈이 아프다 */
filter: invert(1);

/* 🔴 순수 검정 배경 — OLED에서 번짐, 대비가 과함 */
background: #000;   /* → #0a0a0a ~ #18181b 권장 */

/* 🔴 그림자를 그대로 — 어두운 배경에서 검정 그림자는 안 보인다 */
box-shadow: 0 2px 8px rgba(0,0,0,0.1);
/* 다크모드에서는 밝은 테두리나 배경 밝기 차이로 층위를 표현 */
```

---

## px 고정과 접근성

```css
/* 🔴 사용자가 브라우저 기본 폰트 크기를 키워도 반영되지 않는다 */
body { font-size: 14px; }
.container { max-width: 1200px; }
@media (max-width: 768px) { /* ... */ }
```

시력이 약한 사용자는 브라우저 설정에서 기본 폰트를 키웁니다. `px`로 고정하면 **그 설정이 무시됩니다.**

```css
/* ✅ rem — 사용자 설정을 존중한다 */
body { font-size: 1rem; }          /* 기본 16px, 사용자가 바꾸면 따라감 */
.container { max-width: 75rem; }
@media (min-width: 48em) { /* ... */ }
```

**경계선(border), 그림자 같은 장식은 `px`가 맞습니다.** 텍스트와 그에 비례해야 하는 간격에 `rem`을 쓰세요.

### 유동 타이포그래피

```css
/* 미디어쿼리 없이 부드럽게 */
h1 { font-size: clamp(1.75rem, 1.2rem + 2.5vw, 3rem); }
```

---

## 미디어쿼리 남발

```css
/* 🔴 컴포넌트마다 브레이크포인트를 반복 */
@media (max-width: 640px) { .card { ... } }
@media (max-width: 640px) { .list { ... } }
@media (max-width: 640px) { .nav { ... } }
```

그리고 **미디어쿼리는 뷰포트 크기만 알 뿐, 그 컴포넌트가 실제로 얼마나 넓은 공간에 놓였는지 모릅니다.** 같은 카드가 넓은 본문에도, 좁은 사이드바에도 들어가면 뷰포트 기준으로는 올바른 판단을 할 수 없습니다.

```css
/* ✅ 컨테이너 쿼리 — 자기가 놓인 공간을 기준으로 */
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: 120px 1fr; }
}
```

```css
/* ✅ 내재적 반응형 — 쿼리 없이 알아서 줄바꿈 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1rem;
}
```

**브레이크포인트 없이 해결되는 경우가 생각보다 많습니다.**

---

## 모바일 `100vh`

```css
/* 🔴 모바일 브라우저에서 주소창 높이만큼 잘린다 */
.full-screen { height: 100vh; }

/* ✅ 동적 뷰포트 단위 */
.full-screen { height: 100dvh; }
```

`svh`(최소), `lvh`(최대), `dvh`(동적) 중 상황에 맞는 것을 쓰면 됩니다.

---

# 2부. 접근성

## `<div onClick>`

```tsx
// 🔴
<div onClick={handleClick} className="btn">저장</div>
```

이 하나로 잃는 것들:

| 잃는 것 | 결과 |
|---|---|
| `tabIndex` | 키보드로 도달 불가 |
| Enter/Space 처리 | 키보드로 실행 불가 |
| `role="button"` | 스크린 리더가 버튼인지 모름 |
| `:disabled` | 비활성 상태 표현 불가 |
| 폼 제출 | `<form>` 안에서 submit 안 됨 |
| 포커스 링 | 기본 제공 안 됨 |

```tsx
// ✅ 이 전부가 공짜
<button type="button" onClick={handleClick} className="btn">저장</button>
```

**`<button>`이 기본 스타일이 있어서 싫다면 스타일을 지우세요. 요소를 바꾸지 말고.**

```css
.btn {
  appearance: none;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  cursor: pointer;
}
```

### 링크와 버튼을 헷갈리는 것도 같은 문제

```tsx
// 🔴 이동인데 버튼
<button onClick={() => router.push('/orders')}>주문 목록</button>
// → 새 탭으로 열기, 링크 복사, 미들클릭이 전부 안 됨

// 🔴 동작인데 링크
<a href="#" onClick={handleDelete}>삭제</a>
// → 주소창에 #이 남고, 새 탭으로 열면 아무 일도 안 일어남
```

**규칙: 주소가 바뀌면 `<a>`, 무언가를 실행하면 `<button>`.**

---

## `outline: none`

```css
/* 🔴 포커스 링이 안 예뻐서 */
*:focus { outline: none; }
```

키보드 사용자가 **자기가 어디 있는지 알 수 없게 됩니다.** Tab을 눌러도 아무 변화가 없으니 화면을 탐색할 방법이 사라집니다.

```css
/* ✅ 기본 링을 대체하되, 마우스 클릭 시엔 안 보이게 */
:focus { outline: none; }
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
  border-radius: 4px;
}
```

`:focus-visible`은 브라우저가 **"이 포커스를 사용자에게 보여줘야 하는가"** 를 판단한 결과입니다. 키보드 탐색이면 보이고, 마우스 클릭이면 안 보입니다. 디자이너의 요구와 접근성 요구를 동시에 만족합니다.

---

## placeholder를 label로 쓰기

```tsx
// 🔴
<input placeholder="이메일" />
```

- 입력을 시작하면 **무엇을 입력하는 칸인지 사라집니다**
- 스크린 리더가 일관되게 읽지 않습니다
- placeholder는 대비가 낮아 저시력 사용자에게 안 보입니다
- 자동완성이 제대로 동작하지 않습니다

```tsx
// ✅
<label htmlFor="email">이메일</label>
<input id="email" type="email" autoComplete="email" placeholder="you@example.com" />
```

**공간이 없다면 시각적으로만 숨기세요. DOM에서 지우지 말고.**

```css
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

`display: none`이나 `visibility: hidden`은 **스크린 리더에서도 사라지므로** 이 목적에 쓰면 안 됩니다.

---

## 폼 에러를 시각적으로만 표시

```tsx
// 🔴 빨간 테두리와 빨간 글씨 — 스크린 리더는 아무것도 모른다
<input className={error ? 'border-red-500' : ''} />
{error && <span className="text-red-500">{error}</span>}
```

```tsx
// ✅ 프로그래밍적으로 연결
<label htmlFor="email">이메일</label>
<input
  id="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'email-error' : undefined}
/>
{error && (
  <span id="email-error" role="alert" className="text-red-500">
    {error}
  </span>
)}
```

`aria-describedby`로 연결하면 **포커스가 입력창에 갈 때 에러 메시지가 함께 읽힙니다.** `role="alert"`는 에러가 나타나는 즉시 알립니다.

---

## 색만으로 정보 전달

```tsx
// 🔴 색각 이상 사용자에게는 전부 같은 회색
<Badge className="bg-green-100">완료</Badge>
<Badge className="bg-red-100">실패</Badge>
```

텍스트가 있으니 이건 괜찮은 편입니다. 진짜 문제는 이런 것들입니다.

```tsx
// 🔴 상태를 점 색깔로만 표현
<span className={`dot ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />

// 🔴 차트에서 색으로만 계열 구분
```

**규칙: 색은 보조 수단이어야 합니다.** 아이콘 모양, 텍스트, 패턴, 위치 중 하나가 함께 있어야 합니다.

```tsx
// ✅ 색 + 아이콘 + 텍스트
<span className="dot bg-green-500" />
<span className="sr-only">온라인</span>
```

대비도 함께 확인하세요. **일반 텍스트 4.5:1, 큰 텍스트 3:1**이 WCAG AA 기준입니다.

---

## 포커스 관리 부재

### 모달을 열었는데 포커스가 그대로

```tsx
// 🔴 모달이 열렸지만 키보드 포커스는 뒤쪽 페이지에 남아있다
{isOpen && <div className="modal">...</div>}
```

키보드 사용자는 Tab을 눌러도 모달에 못 들어갑니다. 스크린 리더 사용자는 모달이 열린 줄도 모릅니다.

**모달에 필요한 것 다섯 가지:**

1. 열릴 때 포커스를 모달 안으로 이동
2. **포커스 트랩** — Tab이 모달 밖으로 나가지 않음
3. ESC로 닫기
4. 닫을 때 **원래 트리거로 포커스 복귀**
5. 뒤쪽 콘텐츠를 `aria-hidden` 또는 `inert` 처리

```tsx
// ✅ 직접 구현하지 말고 검증된 것을 쓰세요
import * as Dialog from '@radix-ui/react-dialog';
```

**이 다섯 가지를 직접 정확히 구현하는 것은 생각보다 어렵습니다.** Headless 라이브러리의 존재 이유의 절반이 이것입니다.

### 라우트 전환 시 포커스

SPA에서 페이지를 이동해도 **포커스는 클릭했던 링크에 남아있습니다.** 스크린 리더 사용자는 화면이 바뀐 것을 모릅니다.

```tsx
// ✅ 라우트 변경 시 알리고 포커스 이동
function RouteAnnouncer() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [pathname]);

  return <div ref={ref} tabIndex={-1} aria-live="polite" className="sr-only" />;
}
```

---

## ARIA 과잉과 오용

> **ARIA의 제1 규칙: ARIA를 쓰지 않는 것.**
> 시맨틱 HTML 요소로 할 수 있다면 그렇게 하라.

```tsx
// 🔴 시맨틱 요소를 두고 ARIA로 흉내
<div role="button" tabIndex={0} onKeyDown={handleKey} onClick={handleClick}>저장</div>

// ✅
<button onClick={handleClick}>저장</button>
```

```tsx
// 🔴 잘못된 ARIA는 없는 것보다 나쁘다
<button aria-label="닫기">저장</button>
// → 화면에는 "저장", 스크린 리더는 "닫기". 음성 제어 사용자가 "저장 클릭"이라고 말해도 안 됨

// 🔴 이미 버튼인데 role 중복
<button role="button">

// 🔴 숨겨진 요소에 aria-label
<div aria-hidden="true"><button aria-label="메뉴">…</button></div>
// → aria-hidden 안의 포커스 가능 요소는 접근성 트리에서 사라지지만 Tab으로는 도달함
```

**`aria-label`을 쓸 때는 화면의 보이는 텍스트를 포함해야 합니다.** 음성 제어 사용자는 보이는 글자를 말하기 때문입니다.

---

## alt 텍스트 오용

```tsx
// 🔴 장식용 이미지에 설명 — 스크린 리더가 불필요한 것을 읽는다
<img src="/decorative-swirl.svg" alt="장식용 곡선 무늬" />

// ✅ 장식이면 빈 alt (속성 자체를 빼면 안 됨 — 그러면 파일명을 읽는다)
<img src="/decorative-swirl.svg" alt="" />

// 🔴 파일명 그대로
<img src={url} alt="IMG_2024_001.jpg" />

// 🔴 불필요한 접두사
<img src={url} alt="이미지: 제품 사진" />   // "이미지"는 스크린 리더가 이미 말한다

// ✅ 그 이미지가 전달하는 정보
<img src={url} alt="파란색 무선 이어폰 케이스가 열려 있는 모습" />
```

**판별 질문: 이 이미지가 로드되지 않았을 때, 무슨 정보가 사라지는가?** 그게 alt에 들어갈 내용입니다. 아무것도 안 사라지면 `alt=""`입니다.

---

## 헤딩 레벨을 스타일로 고르기

```tsx
// 🔴 "작게 보이고 싶어서" h4
<h1>페이지 제목</h1>
<h4>섹션 제목</h4>     {/* h2가 맞다 */}
```

스크린 리더 사용자는 **헤딩 목록으로 페이지를 탐색합니다.** 레벨이 건너뛰면 구조를 파악할 수 없습니다.

```tsx
// ✅ 레벨은 구조로, 크기는 CSS로
<h2 className="text-base font-medium">섹션 제목</h2>
```

---

## 모션과 자동재생

```css
/* ✅ 사용자가 모션 감소를 요청했으면 존중한다 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

전정기관 장애가 있는 사용자에게 시차 스크롤이나 큰 화면 전환은 **실제로 어지럼증과 메스꺼움을 유발합니다.**

```tsx
// 자동재생 캐러셀도 마찬가지 — 일시정지 수단이 반드시 있어야 한다
```

---

## 터치 타겟이 너무 작음

```tsx
// 🔴 아이콘 버튼 16px
<button className="w-4 h-4"><TrashIcon /></button>
```

**최소 44×44px(WCAG 2.5.5 기준)** 이 권장됩니다. 시각적 크기는 작게 유지하면서 타겟만 키울 수 있습니다.

```css
.icon-btn {
  position: relative;
  width: 16px; height: 16px;
}
.icon-btn::after {
  content: '';
  position: absolute;
  inset: -14px;         /* 44×44 터치 영역 */
}
```

---

## "접근성은 나중에"

**이 시리즈 전체에서 가장 비싼 안티패턴입니다.**

나중에 추가하려면 바꿔야 하는 것들: DOM 구조, 컴포넌트 API, 포커스 흐름, 상태 관리(모달 스택), 디자인(대비, 터치 크기), 폼 구조. 즉 **거의 전부**입니다.

### 지금 넣을 수 있는 최소한

```javascript
// eslint.config.js — 한 번 설정하면 계속 막아준다
'jsx-a11y/alt-text': 'error',
'jsx-a11y/anchor-is-valid': 'error',
'jsx-a11y/click-events-have-key-events': 'error',
'jsx-a11y/no-static-element-interactions': 'error',
'jsx-a11y/label-has-associated-control': 'error',
'jsx-a11y/no-autofocus': 'warn',
```

```bash
# 자동 검사 (린터가 못 잡는 런타임 문제)
npm i -D @axe-core/playwright
```

```typescript
// e2e 테스트에 추가
import AxeBuilder from '@axe-core/playwright';

test('대시보드 접근성', async ({ page }) => {
  await page.goto('/dashboard');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

**자동 도구가 잡는 건 전체의 30~40% 정도입니다.** 나머지는 키보드만으로 한 번 써보는 것으로 상당 부분 발견됩니다.

### 5분 수동 검사

1. 마우스를 치우고 **Tab만으로** 주요 작업을 끝까지 해보기
2. 포커스가 지금 어디 있는지 **항상 보이는지** 확인
3. 브라우저 확대 200%에서 레이아웃이 깨지지 않는지
4. 모달을 열고 Tab을 계속 눌러 **밖으로 나가는지** 확인
5. 이미지를 차단하고 페이지가 이해되는지

---

## 요약

### CSS

| 안티패턴 | 해법 |
|---|---|
| `!important`와 특이성 전쟁 | 스코프(CSS Modules/유틸리티), `@layer`, `:where()` |
| z-index 인플레이션 | 토큰화 + 포털 + stacking context 이해 |
| 컴포넌트가 마진 소유 | 부모의 `gap` |
| 매직 넘버 좌표 | 관계로 표현, 포지셔닝 라이브러리 |
| 하드코딩된 색 | 원시 토큰 + 시맨틱 토큰 2계층 |
| 다크모드 나중에 | 시맨틱 토큰을 처음부터 |
| px 고정 | `rem`, `clamp()` |
| 미디어쿼리 남발 | 컨테이너 쿼리, 내재적 반응형 |
| `100vh` | `100dvh` |

### 접근성

| 안티패턴 | 해법 |
|---|---|
| `<div onClick>` | `<button>` + 스타일 초기화 |
| `outline: none` | `:focus-visible` 대체 스타일 |
| placeholder를 label로 | `<label>` + `.sr-only` |
| 시각적 에러만 | `aria-invalid` + `aria-describedby` |
| 색만으로 정보 | 아이콘/텍스트 병기, 대비 4.5:1 |
| 포커스 관리 없음 | 트랩·복귀·ESC, Headless 라이브러리 |
| ARIA 과잉/오용 | 시맨틱 HTML 우선 |
| 잘못된 alt | "로드 안 되면 사라지는 정보" |
| 스타일로 헤딩 선택 | 레벨은 구조, 크기는 CSS |
| 모션 강제 | `prefers-reduced-motion` |
| 작은 터치 타겟 | 44×44, 의사요소로 확장 |

**관통하는 원리 세 개**

1. **`!important`는 해결이 아니라 소유권이 불분명하다는 증거다.**
2. **컴포넌트는 자기 안쪽만 소유한다.** 바깥 여백도, 바깥 위치도 부모의 결정입니다.
3. **접근성은 기능 요구사항이다.** 나중에 얹는 순간 재작성이 됩니다.

---

## 다음 편

**8편 — 견고함의 안티패턴**

에러 바운더리가 없어서 흰 화면이 되는 구조, `catch`로 에러를 삼키는 것, `as`와 `any`가 만드는 거짓 안정감, 런타임 검증 없이 API 응답을 신뢰하는 것, 그리고 깨지는데 아무도 안 읽는 테스트를 다룹니다.
