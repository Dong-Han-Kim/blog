---
# 📌 기본 메타데이터
title: '프론트엔드 안티패턴 (4) — 렌더링과 성능: 병목은 대개 리렌더가 아니다'
date: '2026-09-14'
category: 'frontend'
tags: ['Performance', 'React', 'Web Vitals', 'Rendering', 'Anti-Pattern']
description: 'React.memo 도배와 성능 방치는 같은 병이다. 실제 병목의 순서, Core Web Vitals가 잡아내는 안티패턴, 레이아웃 스래싱과 컴포지팅, 그리고 무엇을 어떤 도구로 측정할지.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 안티패턴'
seriesOrder: 4

# 📚 SEO용
keywords: ['Performance', 'React', 'Web Vitals', 'Rendering', 'Anti-Pattern', '프론트엔드 안티패턴']
---

# 프론트엔드 안티패턴 (4) — 렌더링과 성능

## 양극단, 하나의 병

성능 영역의 안티패턴은 정반대로 보이는 두 형태로 나타납니다.

**한쪽 끝 — 방어적 최적화 도배**

```tsx
const Row = React.memo(function Row({ item, onSelect }: RowProps) {
  const handleClick = useCallback(() => onSelect(item.id), [onSelect, item.id]);
  const style = useMemo(() => ({ opacity: item.active ? 1 : 0.5 }), [item.active]);
  const label = useMemo(() => `${item.name} (${item.code})`, [item.name, item.code]);
  return <div style={style} onClick={handleClick}>{label}</div>;
});
```

문자열 하나 만드는 데 `useMemo`를 씁니다. 이건 **최적화가 아니라 비용입니다.**

**다른 쪽 끝 — 완전 방치**

번들 크기를 모르고, Lighthouse를 한 번도 안 돌려봤고, 실사용자 지표를 수집하지 않습니다. 민원이 들어오면 그때 `React.memo`를 붙이기 시작합니다.

**둘은 같은 병입니다. 측정하지 않는 것.** 측정하지 않으면 남는 건 미신뿐이고, 미신은 도배 아니면 방치로 귀결됩니다.

---

## `React.memo`는 언제 값하는가

먼저 비용을 정확히 알아야 합니다.

**`React.memo`의 비용:**
- prop 개수만큼 얕은 비교 수행
- 이전 엘리먼트를 메모리에 유지
- `useCallback`/`useMemo`가 따라붙으면서 의존성 배열 관리 부담 발생
- 코드 가독성 저하

**`React.memo`의 이득:** 자식 서브트리의 렌더를 건너뜀

즉 **자식 렌더가 비교 비용보다 훨씬 비쌀 때만** 이득입니다. `<div>{name}</div>` 하나 렌더하는 컴포넌트는 비교하는 게 더 비쌉니다.

### 값하는 세 가지 경우

```tsx
// 1. 목록의 행 — 수백 개가 있고, 그중 하나만 바뀜
const Row = React.memo(TableRow);

// 2. 렌더가 실제로 무거움 — 차트, 지도, 에디터
const Chart = React.memo(ExpensiveChart);

// 3. 자주 리렌더되는 부모 아래의 안정적인 자식
// (부모가 1초에 60번 리렌더되는데 자식은 안 바뀜)
```

### memo를 붙였는데 효과가 없는 경우

```tsx
const Row = React.memo(TableRow);

// 🔴 매 렌더 새 객체/함수 → 비교가 항상 실패
<Row item={item} config={{ dense: true }} onSelect={() => select(item.id)} />
```

**memo는 prop 참조가 안정적일 때만 동작합니다.** 3편의 인라인 객체 안티패턴과 짝입니다. 이걸 고치려면 `useCallback`과 `useMemo`가 따라오고, 그래서 memo 하나가 다섯 줄의 부수 코드를 만듭니다.

### 더 나은 첫 번째 해법 — 구조를 바꾼다

```tsx
// Before — 상태가 위에 있어서 전체가 리렌더
function Page() {
  const [query, setQuery] = useState('');
  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <ExpensiveTree />          {/* query와 무관한데 같이 리렌더된다 */}
    </>
  );
}

// After — 상태를 필요한 곳으로 내린다
function SearchBox() {
  const [query, setQuery] = useState('');
  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}
function Page() {
  return <><SearchBox /><ExpensiveTree /></>;
}
```

```tsx
// children으로 잘라내는 방법도 있다
function Provider({ children }) {
  const [state, setState] = useState();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
// children은 부모에서 이미 만들어진 엘리먼트라 Provider 리렌더에 영향받지 않는다
```

**`memo`를 붙이기 전에 상태 위치와 합성 구조를 먼저 보세요.** 구조로 푸는 게 더 싸고 더 오래갑니다.

### React Compiler

React Compiler를 쓰면 이 판단의 상당 부분이 자동화됩니다. 컴파일 타임에 의존성을 분석해 메모이제이션을 삽입하므로 `useMemo`/`useCallback`/`memo`를 직접 쓸 일이 크게 줄어듭니다. **다만 컴파일러도 "구조가 잘못된 것"은 못 고칩니다** — 위의 상태 위치 문제는 여전히 사람이 풀어야 합니다.

---

## 병목의 실제 순서

사용자가 체감하는 느림의 원인은 측정해 보면 대체로 이 순서로 나타납니다.

| 순위 | 원인 | 체감 |
|---|---|---|
| 1 | **네트워크** — 워터폴, 과도한 페이로드 | 화면이 안 나옴 |
| 2 | **JS 번들 크기** — 다운로드 + 파싱 + 실행 | 하얀 화면이 길다 |
| 3 | **이미지·폰트** | 늦게 뜨고 화면이 튄다 |
| 4 | **긴 리스트를 전부 렌더** | 스크롤이 버벅인다 |
| 5 | **긴 동기 작업 (long task)** | 클릭이 안 먹는다 |
| 6 | **레이아웃 스래싱** | 애니메이션이 끊긴다 |
| 7 | 불필요한 리렌더 | (대개 체감 안 됨) |

**그런데 대부분 7번부터 손댑니다.** 가장 눈에 띄고, 가장 만만하고, 효과는 가장 작습니다.

**7번이 진짜 문제가 되는 경우도 있습니다** — 행이 500개인 표에서 타이핑할 때, 실시간 데이터가 초당 수십 번 들어올 때, 드래그 중에 매 프레임 상태가 바뀔 때. 그런 경우는 프로파일러에 명확히 보입니다. **보이지 않으면 문제가 아닙니다.**

---

## 측정 도구 지도

각 도구가 무엇을 알려주고 무엇을 못 알려주는지 구분해야 합니다.

| 도구 | 알려주는 것 | 못 알려주는 것 |
|---|---|---|
| React DevTools Profiler | 어떤 컴포넌트가 왜 몇 ms 렌더됐는지 | 네트워크, 레이아웃, 페인트 |
| Chrome Performance 패널 | 메인 스레드 전체 — long task, 리플로우, 페인트 | 컴포넌트 이름(일부만) |
| Lighthouse | 실험실 환경의 지표와 개선 제안 | 실제 사용자가 겪는 것 |
| RUM (Web Vitals) | **실제 사용자 기기에서의 지표** | 원인 |
| Bundle Analyzer | 무엇이 번들을 차지하는지 | 실행 시간 |

**핵심: 실험실 측정과 실사용자 측정은 둘 다 필요합니다.**

실험실(Lighthouse)은 **회귀를 CI에서 막는 데** 좋고, RUM은 **진짜 문제가 있는지 아는 데** 필요합니다. 실험실 점수가 95점인데 사용자가 느리다고 하면, 실험실 조건이 현실과 다른 것입니다. 그 격차 자체가 정보입니다.

### 반드시 켜야 할 것 하나

프로파일링할 때 **CPU 스로틀링 4~6배**를 켜세요. 개발 장비에서 60fps로 도는 것이 사용자 기기에서 15fps일 수 있습니다.

```
Chrome DevTools → Performance → ⚙️ → CPU: 4x slowdown / 6x slowdown
Network: Slow 4G
```

**이 설정 없이 한 성능 측정은 거의 의미가 없습니다.**

---

## Core Web Vitals가 잡아내는 안티패턴

세 지표가 각각 다른 종류의 안티패턴을 겨냥합니다.

### LCP (Largest Contentful Paint) — "가장 큰 요소가 언제 보이나"

**목표: 2.5초 이내**

**LCP를 망치는 안티패턴:**

```tsx
// 🔴 히어로 이미지에 lazy loading
<img src="/hero.jpg" loading="lazy" />
// → 첫 화면의 주인공을 늦게 로드하겠다는 선언

// ✅
<Image src="/hero.jpg" priority alt="..." />
```

```tsx
// 🔴 클라이언트에서 데이터를 받아 렌더 — LCP 요소가 3초 뒤에 나타남
'use client';
function ProductPage() {
  const { data } = useQuery(...);       // 서버 응답 → 렌더
  if (!data) return <Skeleton />;
  return <h1>{data.title}</h1>;         // 이게 LCP 요소
}

// ✅ 서버에서 렌더
async function ProductPage() {
  const data = await getProduct(id);
  return <h1>{data.title}</h1>;
}
```

```html
<!-- 🔴 렌더 블로킹 폰트 -->
<link rel="stylesheet" href="https://fonts.googleapis.com/...">
<!-- CSS 다운로드 → 폰트 다운로드 → 그제서야 텍스트 표시 -->
```

### CLS (Cumulative Layout Shift) — "화면이 얼마나 튀나"

**목표: 0.1 이하**

**CLS를 망치는 안티패턴:**

```tsx
// 🔴 크기 없는 이미지 — 로드되는 순간 아래 내용이 밀린다
<img src={url} alt="" />

// ✅ 공간을 미리 확보
<img src={url} width={800} height={600} alt="" />
// 또는 CSS로
// .thumb { aspect-ratio: 4 / 3; width: 100%; }
```

```css
/* 🔴 font-display 미설정 — 폰트 교체 시 글자 크기가 바뀌며 레이아웃이 밀림 */
@font-face { font-family: 'Pretendard'; src: url(...); }

/* ✅ */
@font-face {
  font-family: 'Pretendard';
  src: url(...) format('woff2');
  font-display: swap;
  size-adjust: 102%;          /* 폴백 폰트와 크기를 맞춰 교체 시 밀림을 줄인다 */
}
```

```tsx
// 🔴 나중에 나타나서 위쪽 내용을 밀어내는 요소
{showBanner && <Banner />}        // 배너가 나타나면 아래가 다 밀린다

// ✅ 자리를 미리 잡거나, 레이아웃 흐름 밖에 두기
<div style={{ minHeight: 56 }}>{showBanner && <Banner />}</div>
```

**CLS는 개발자가 가장 못 느끼는 지표입니다.** 캐시가 데워진 상태에서는 모든 게 즉시 로드되어 튀지 않으니까요. 반드시 캐시를 비우고 느린 네트워크로 확인해야 합니다.

### INP (Interaction to Next Paint) — "클릭하면 얼마나 빨리 반응하나"

**목표: 200ms 이내.** 2024년 3월부터 FID를 대체한 Core Web Vital입니다. FID가 "첫 입력의 지연"만 봤다면, INP는 **페이지 수명 전체의 모든 상호작용**을 봅니다. 그래서 훨씬 엄격하고, SPA에서 특히 드러납니다.

**INP를 망치는 안티패턴:**

```typescript
// 🔴 입력 핸들러에서 무거운 동기 작업
function handleSearch(e) {
  const q = e.target.value;
  const results = allItems.filter(i => fuzzyMatch(i, q));   // 50,000건
  setResults(results);      // 키 누를 때마다 200ms 블로킹
}

// ✅ 긴급하지 않은 업데이트를 분리
function handleSearch(e) {
  const q = e.target.value;
  setQuery(q);                          // 긴급: 입력창 반응
  startTransition(() => {
    setResults(allItems.filter(i => fuzzyMatch(i, q)));   // 비긴급
  });
}
```

```typescript
// 🔴 클릭 핸들러에서 동기 작업 후 화면 갱신
function handleExport() {
  const csv = rows.map(toCsvLine).join('\n');   // 10,000행 — 메인 스레드 점유
  download(csv);
}

// ✅ 청크로 나누거나 워커로
async function handleExport() {
  const csv = await generateCsvInWorker(rows);
  download(csv);
}
```

**INP는 "긴 작업(long task, 50ms 초과)"의 누적입니다.** Performance 패널에서 빨간 삼각형으로 표시되는 것들이 전부 후보입니다.

---

## 레이아웃 스래싱

React 바깥, 브라우저 엔진 층위의 안티패턴입니다.

```javascript
// 🔴 읽기와 쓰기가 교차한다
elements.forEach(el => {
  const height = el.offsetHeight;          // 읽기 → 강제 동기 레이아웃
  el.style.height = `${height * 2}px`;     // 쓰기 → 레이아웃 무효화
});
```

브라우저는 스타일 변경을 모아뒀다가 한 번에 처리하려 합니다. 그런데 중간에 레이아웃 값을 읽으면 **"지금 당장 계산해라"** 라고 강요하는 셈입니다. 요소 100개면 리플로우 100번입니다.

```javascript
// ✅ 읽기를 전부 먼저, 쓰기를 나중에
const heights = elements.map(el => el.offsetHeight);   // 리플로우 1회
elements.forEach((el, i) => {
  el.style.height = `${heights[i] * 2}px`;             // 배치 처리
});
```

**강제 리플로우를 유발하는 대표 속성들:**

`offsetTop/Left/Width/Height`, `clientTop/Left/Width/Height`, `scrollTop/Left/Width/Height`, `getBoundingClientRect()`, `getComputedStyle()`, `focus()`, `scrollIntoView()`

React에서는 `useLayoutEffect` 안에서 이런 코드를 쓸 때 특히 주의해야 합니다. `useLayoutEffect`는 **브라우저가 그리기 전에 동기적으로 실행**되므로, 여기서 무거운 작업을 하면 화면이 그대로 멈춥니다.

---

## 애니메이션 — 어떤 속성을 움직이는가

CSS 속성마다 브라우저가 하는 일이 다릅니다.

| 속성 | 유발하는 단계 | 비용 |
|---|---|---|
| `width`, `height`, `top`, `left`, `margin` | **레이아웃** → 페인트 → 합성 | 가장 비쌈 |
| `background-color`, `box-shadow`, `border-radius` | 페인트 → 합성 | 중간 |
| `transform`, `opacity` | **합성만** | 가장 쌈 |

```css
/* 🔴 매 프레임 레이아웃 재계산 — 요소가 많으면 20fps */
.slide { transition: left 300ms; }
.slide.open { left: 0; }

/* ✅ 컴포지터 스레드에서 처리 — 메인 스레드를 안 건드림 */
.slide { transition: transform 300ms; }
.slide.open { transform: translateX(0); }
```

**`will-change`의 오용도 흔합니다.**

```css
/* 🔴 모든 요소에 미리 걸어두기 — 각각 별도 레이어가 되어 메모리를 먹는다 */
* { will-change: transform; }

/* ✅ 애니메이션 직전에만, 끝나면 제거 */
.card:hover { will-change: transform; }
```

`will-change`는 "곧 바뀔 거니 레이어로 승격해 둬"라는 힌트입니다. 남발하면 GPU 메모리가 고갈되어 **오히려 느려집니다.**

---

## 긴 목록을 전부 렌더하기

```tsx
// 🔴 5,000행 — DOM 노드 5,000개 × 셀 8개 = 40,000 노드
<tbody>{rows.map(r => <Row key={r.id} row={r} />)}</tbody>
```

증상: 초기 렌더 3초, 스크롤 버벅임, 메모리 급증, 필터 한 번에 화면 정지.

```tsx
// ✅ 가상화 — 보이는 것만 렌더
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualTable({ rows }: { rows: Row[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(v => (
          <div
            key={rows[v.index].id}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%',
              height: v.size, transform: `translateY(${v.start}px)`,
            }}
          >
            <Row row={rows[v.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 가상화의 대가 — 알고 쓰기

가상화는 공짜가 아닙니다.

- **Ctrl+F가 안 됩니다.** DOM에 없는 행은 브라우저 검색에 안 잡힙니다
- **스크린 리더가 전체 목록을 파악하지 못합니다.** `aria-setsize`, `aria-posinset`을 직접 줘야 합니다
- **인쇄하면 보이는 부분만 나옵니다**
- 가변 높이 행이면 구현이 까다로워집니다

**그래서 "행이 많으면 무조건 가상화"가 아닙니다.** 200행 정도면 페이지네이션이 더 나은 선택인 경우가 많습니다 — 구현이 단순하고 위의 문제가 전부 없습니다. **가상화는 페이지네이션이 UX상 불가능할 때의 선택지입니다.**

---

## 이미지와 폰트

번들 크기보다 이쪽이 더 큰 경우가 흔합니다.

### 이미지 안티패턴

```tsx
// 🔴 원본 4000×3000 JPEG를 200×150으로 표시
<img src="/uploads/photo.jpg" className="w-[200px]" />
```

사용자는 3MB를 받아서 200px로 봅니다. **대역폭의 99%가 버려집니다.**

```tsx
// ✅ 크기·포맷·반응형 처리
<Image
  src="/uploads/photo.jpg"
  width={200} height={150}
  sizes="(max-width: 768px) 100vw, 200px"
  alt="제품 사진"
/>
```

체크리스트:
- [ ] 표시 크기에 맞게 리사이즈되는가
- [ ] WebP/AVIF로 서빙되는가
- [ ] `srcset`/`sizes`로 기기별 크기를 주는가
- [ ] 첫 화면 밖 이미지는 `loading="lazy"`인가
- [ ] 첫 화면 안 이미지는 `priority`인가
- [ ] `width`/`height` 또는 `aspect-ratio`가 있는가 (CLS)

### 폰트 안티패턴

```css
/* 🔴 웹폰트 6종 × 각 300KB = 1.8MB */
@font-face { font-family: 'X'; font-weight: 300; src: url(x-300.woff2); }
@font-face { font-family: 'X'; font-weight: 400; src: url(x-400.woff2); }
/* ... 400, 500, 600, 700, 800 ... */
```

```css
/* ✅ 가변 폰트 하나 + 서브셋 */
@font-face {
  font-family: 'X';
  src: url('x-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+AC00-D7A3, U+0020-007E;   /* 한글 완성형 + ASCII */
}
```

한글 폰트는 글자 수가 많아 특히 무겁습니다. **서브셋팅(사용하는 글자만 추출)이나 동적 서브셋이 큰 효과를 냅니다.**

---

## 과잉 최적화의 진짜 비용

성능을 위해 지불하는 비용 중 가장 저평가된 것은 **버그**입니다.

```tsx
// 의존성 배열이 거짓말을 하면 메모이제이션이 낡은 값을 붙잡는다
const filtered = useMemo(
  () => rows.filter(r => r.status === status),
  [rows]                                          // 🔴 status가 빠졌다
);
// status를 바꿔도 결과가 안 바뀐다 — 디버깅이 매우 어렵다
```

`useMemo`/`useCallback`을 쓸 때마다 **의존성 배열이라는 수동 관리 대상이 하나씩 늘어납니다.** 그리고 그게 틀렸을 때 생기는 버그는 "가끔 값이 안 바뀐다"는 형태라 재현이 어렵습니다.

**측정해서 필요하다고 확인된 곳에만 쓰세요.** 그게 아니면 순수한 손해입니다.

---

## 요약 — 우선순위대로

성능 작업을 시작한다면 이 순서가 투자 대비 효과가 가장 큽니다.

**1. 측정 장치부터 (1편)**
RUM으로 실사용자 LCP/CLS/INP 수집 → 어디가 나쁜지 확인

**2. 네트워크와 번들 (5·6편)**
워터폴 제거, 번들 분석, 코드 분할

**3. 이미지와 폰트**
리사이즈, 포맷, `priority`, `font-display`, 서브셋

**4. 긴 목록**
페이지네이션 또는 가상화

**5. 긴 작업 쪼개기**
`startTransition`, 워커, 청킹

**6. 그 다음에야 리렌더**
프로파일러로 실제 병목 확인 후 구조 변경 → 그래도 남으면 `memo`

| 안티패턴 | 지표에 드러남 | 해법 |
|---|---|---|
| 근거 없는 memo 도배 | (안 드러남, 버그로 드러남) | 측정 후 필요한 곳만 |
| 성능 방치 | 전부 | CI 예산 + RUM |
| 히어로 이미지 lazy | LCP | `priority` |
| 크기 없는 이미지 | CLS | `width`/`height`/`aspect-ratio` |
| 폰트 교체 밀림 | CLS | `font-display`, `size-adjust` |
| 입력 핸들러의 무거운 작업 | INP | `startTransition`, 워커 |
| 레이아웃 스래싱 | 프레임 드롭 | 읽기/쓰기 분리 |
| `left`/`width` 애니메이션 | 프레임 드롭 | `transform`/`opacity` |
| 5,000행 전부 렌더 | INP, 메모리 | 페이지네이션 또는 가상화 |

**관통하는 원리 세 개**

1. **측정하지 않은 최적화는 최적화가 아니라 추측이다.**
2. **CPU 스로틀링 없이 한 측정은 측정이 아니다.**
3. **구조를 고치는 것이 메모이제이션보다 싸고 오래간다.**

---

## 다음 편

**5편 — 네트워크와 실패 경로의 안티패턴**

병목 1순위인 네트워크를 정면으로 다룹니다. 워터폴이 생기는 네 가지 경로, N+1 요청, 그리고 대부분의 코드에 빠져 있는 것 — 재시도, 타임아웃, 취소, 롤백. **실패 경로가 없는 코드는 완성된 것이 아닙니다.**
