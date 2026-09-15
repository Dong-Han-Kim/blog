---
# 📌 기본 메타데이터
title: '효율적인 React 6편 — 반응성과 우선순위: 빠르게 만들 수 없으면 먼저 반응한다'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'useTransition', 'useDeferredValue', 'Activity', 'Virtualization', 'INP']
description: '계산을 더 줄일 수 없을 때 남는 방법은 우선순위다. INP의 세 구간, useTransition과 useDeferredValue의 선택 기준, 디바운스와의 차이, 긴 작업 쪼개기, 가상화의 대가, Activity로 화면 상태 보존하기.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 6

# 📚 SEO용
keywords: ['React', 'useTransition', 'useDeferredValue', 'Activity', 'Virtualization', 'INP', '효율적인 React']
---

# 효율적인 React 6편 — 반응성과 우선순위

2\~3편에서 렌더를 **줄이는** 방법을 다뤘다. 그런데 줄일 수 없는 렌더도 있다. 검색어가 바뀌면 결과 목록은 실제로 다시 그려야 하고, 필터를 바꾸면 차트는 실제로 다시 계산해야 한다.

이 편의 전제는 이렇다.

> **모든 업데이트가 같은 급은 아니다. 사용자가 방금 한 행동에 대한 반응은 즉시, 그 결과로 바뀌는 무거운 화면은 조금 늦게.**

Concurrent 렌더링의 내부 구조(Fiber의 중단 가능한 작업 단위, Scheduler, Lane 우선순위)는 React 렌더링 Deep Dive 시리즈 [2편](/posts/react-fiber-architecture)과 [4편(Lane 번외편)](/posts/react-lane-internals)에서 다뤘다. 이 편은 그 구조를 **언제, 어떤 API로 쓰는가**를 다룬다.

---

## 1. 반응성의 지표: INP

INP(Interaction to Next Paint)는 사용자의 클릭·탭·키 입력부터 **그 결과가 화면에 그려지기까지** 걸린 시간이다. 페이지에서 일어난 상호작용 중 가장 느린 축(정확히는 상위 백분위)이 그 페이지의 INP가 된다. 200ms 이하가 "좋음" 기준이다.

한 번의 상호작용은 세 구간으로 나뉜다.

```
[입력] ─ ① Input Delay ─ [핸들러 시작] ─ ② Processing ─ [핸들러 끝] ─ ③ Presentation Delay ─ [페인트]
```

| 구간 | 무엇이 길게 만드나 | React에서의 원인 |
|---|---|---|
| ① Input Delay | 입력 시점에 메인 스레드가 다른 일을 하고 있음 | 이전 상호작용의 긴 렌더, hydration, 서드파티 스크립트 |
| ② Processing | 이벤트 핸들러 자체가 오래 걸림 | 핸들러 안의 무거운 계산, 동기 렌더 |
| ③ Presentation Delay | 렌더·커밋·레이아웃·페인트 | 넓은 렌더, 큰 DOM 변경, 레이아웃 스래싱 |

React의 기본 업데이트는 **동기**다. 한 번 렌더를 시작하면 끝날 때까지 메인 스레드를 놓지 않는다. 결과 목록 렌더에 300ms가 걸리면, 그동안 다음 키 입력은 ①에서 기다린다. 입력창에 글자가 뚝뚝 끊겨 나타나는 원인이다.

---

## 2. 긴급한 업데이트와 급하지 않은 업데이트

검색창에 글자를 입력하는 상황을 나눠 보자.

| 업데이트 | 사용자 기대 | 급 |
|---|---|---|
| 입력창에 글자가 보인다 | 즉시. 늦으면 고장처럼 느낀다. | **긴급** |
| 결과 목록이 바뀐다 | 조금 늦어도 된다. 중간 결과는 건너뛰어도 된다. | **급하지 않음** |

두 업데이트를 같은 급으로 처리하면 무거운 쪽이 가벼운 쪽을 막는다. React는 이 둘을 나누는 API를 두 가지 제공한다.

- `useTransition`: **state를 바꾸는 쪽**에서 "이 업데이트는 급하지 않다"고 표시한다.
- `useDeferredValue`: **값을 받는 쪽**에서 "이 값의 새 버전은 늦게 반영해도 된다"고 표시한다.

transition으로 표시된 렌더는 **중단 가능**하다. 렌더 도중 긴급 업데이트(다음 키 입력)가 들어오면 React는 진행 중인 렌더를 멈추고 긴급 업데이트를 먼저 처리한 뒤, 최신 값으로 급하지 않은 렌더를 다시 시작한다. 중간 값에 대한 렌더는 버려진다.

---

## 3. `useTransition`: setter를 가진 쪽에서 표시한다

```tsx
function ProductSearch({ products }: { products: Product[] }) {
  const [input, setInput] = useState('');       // 긴급: 입력창
  const [query, setQuery] = useState('');       // 급하지 않음: 결과
  const [isPending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setInput(next);                             // 즉시 반영
    startTransition(() => {
      setQuery(next);                           // 중단 가능한 렌더
    });
  }

  return (
    <>
      <input value={input} onChange={onChange} />
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <ResultGrid products={products} query={query} />
      </div>
    </>
  );
}
```

### 알아야 할 제약

**① 제어 입력의 값 자체는 transition에 넣을 수 없다.**

```tsx
startTransition(() => setInput(e.target.value));   // ❌ 입력이 늦게 반영되어 커서가 튄다
```

입력창의 값은 항상 긴급이다. 그래서 위 예제처럼 **입력용 state와 결과용 state를 나눈다**.

**② transition은 계산을 빠르게 만들지 않는다.**

`ResultGrid` 렌더가 300ms면 여전히 300ms다. 달라지는 점은 그 300ms 동안 **입력이 막히지 않는다**는 것이다. 렌더 자체의 비용은 2·3편 방법으로 따로 줄여야 한다.

**③ 이벤트 핸들러 안의 동기 계산은 중단되지 않는다.**

중단 가능한 것은 **React의 렌더 작업**이다. `startTransition` 콜백 안에서 10만 건을 정렬하면 그 정렬은 동기로 실행되어 메인 스레드를 막는다. 무거운 계산은 콜백이 아니라 **렌더 중 파생값**으로 옮겨야 transition의 중단 대상이 된다.

```tsx
// ❌ 콜백 안의 동기 계산은 중단되지 않는다
startTransition(() => setResults(heavySort(products, next)));

// ✅ query만 transition으로 바꾸고, 계산은 렌더 중에
startTransition(() => setQuery(next));
// ResultGrid 안: const sorted = useMemo(() => heavySort(products, query), [products, query]);
```

### 비동기 transition (React 19)

`startTransition`에 async 함수를 넘기면 await가 끝날 때까지 `isPending`이 유지된다. 5편의 Actions가 이 기능 위에 있다.

```tsx
function SaveButton({ draft }: { draft: Draft }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => {
        await saveDraft(draft);
        startTransition(() => router.refresh());   // await 이후의 state 업데이트도 transition으로 표시
      })}
    >
      {isPending ? '저장 중…' : '저장'}
    </button>
  );
}
```

await 이후에 일어나는 state 업데이트는 현재 구현상 바깥 transition 범위를 자동으로 이어받지 않으므로, 급하지 않은 업데이트라면 다시 `startTransition`으로 감싼다.

---

## 4. `useDeferredValue`: 값을 받는 쪽에서 표시한다

setter에 접근할 수 없는 경우가 있다. 값이 props로 내려오거나, URL `searchParams`에서 읽거나, 외부 스토어에서 오는 경우다.

```tsx
function SearchResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div style={{ opacity: isStale ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <SlowList query={deferredQuery} />
    </div>
  );
}

const SlowList = memo(function SlowList({ query }: { query: string }) {
  const items = useMemo(() => filterAndRank(allItems, query), [query]);
  return (/* 수백 개 행 */);
});
```

동작 순서는 이렇다.

1. `query`가 바뀐다.
2. **긴급 렌더**: `deferredQuery`는 아직 **이전 값**이다. `isStale`이 `true`가 되어 흐리게 표시된다.
3. **백그라운드 렌더**: `deferredQuery`를 새 값으로 두고 다시 렌더한다. 이 렌더는 중단 가능하다.

### 반드시 필요한 조건: 무거운 자식이 건너뛰어져야 한다

2번 긴급 렌더에서 `SlowList`가 **다시 렌더되면** 효과가 없다. 긴급 렌더도 똑같이 무거워지기 때문이다. `SlowList`가 `memo`로 감싸져 있어서 `query` prop이 이전과 같으면 건너뛰어야 한다. React Compiler를 쓰면 이 조건은 자동으로 만족된다(3편).

`useDeferredValue`를 붙였는데 효과가 없다면 가장 먼저 이 조건을 확인한다.

### 초기값 (React 19)

```tsx
const deferredQuery = useDeferredValue(query, '');
```

첫 렌더에서 `''`로 가볍게 먼저 그리고, 실제 값으로는 백그라운드에서 다시 렌더한다. 무거운 컴포넌트의 첫 표시를 늦추지 않고 싶을 때 쓴다.

### 선택 기준

| 상황 | API |
|---|---|
| 내가 setter를 호출한다 | `useTransition` |
| 값이 props, URL, 외부 스토어에서 온다 | `useDeferredValue` |
| 버튼 클릭 후 대기 상태를 표시하고 싶다 | `useTransition`의 `isPending` |
| "이전 값을 보고 있음"을 표시하고 싶다 | `useDeferredValue`와 비교(`value !== deferred`) |

---

## 5. transition과 디바운스는 다른 문제를 푼다

| | 디바운스·스로틀 | transition / deferred |
|---|---|---|
| 지연 | 고정(예: 300ms) | 기기 성능에 맞춰 자동. 빠른 기기에서는 거의 즉시 |
| 입력 중 결과 갱신 | 입력이 멈춰야 갱신(디바운스) | 여유가 있으면 입력 중에도 갱신 |
| 줄이는 대상 | **작업 발생 횟수** | **작업이 메인 스레드를 막는 시간** |
| 네트워크 요청 | 요청 수를 줄인다 | 요청 수는 줄지 않는다 |

그래서 검색 자동완성은 둘을 **함께** 쓴다.

- 입력 → 로컬 목록 필터링의 무거운 렌더: transition / deferred
- 입력 → 서버 요청: 디바운스(또는 캐시 라이브러리의 키 변경 + 이전 요청 취소)

"렌더가 무거워서 디바운스를 걸었다"면, 빠른 기기 사용자까지 300ms를 기다리게 만드는 선택이다. 렌더 문제는 우선순위로, 요청 수 문제는 디바운스로 푼다.

---

## 6. 긴 작업을 쪼개야 할 때

transition이 중단할 수 있는 단위는 **컴포넌트 렌더 사이**다. 컴포넌트 **하나**의 렌더가 200ms 걸리면 그 200ms는 쪼개지지 않는다. 핸들러 안의 긴 동기 작업도 마찬가지다.

### 선택지

**① 계산을 렌더 밖 캐시로 옮긴다.** 2편의 `useMemo`, 서버에서 미리 계산, 인덱스 구조 도입(예: 매 입력마다 전체를 선형 탐색하지 않고 미리 만든 검색 인덱스 조회).

**② 목록을 작은 컴포넌트로 나눈다.** 행 1,000개를 한 컴포넌트의 `map`에서 복잡하게 계산하면 쪼갤 수 없지만, `<Row>` 1,000개로 나누면 React가 행 사이에서 중단할 수 있다.

**③ Web Worker로 옮긴다.** 이미지 처리, 대용량 CSV 파싱, 복잡한 검색 순위 계산처럼 수백 ms 이상 걸리는 순수 계산은 메인 스레드에 둘 이유가 없다.

```ts
// search.worker.ts
self.onmessage = (e: MessageEvent<{ query: string; items: Item[] }>) => {
  const result = rankItems(e.data.items, e.data.query);
  self.postMessage(result);
};
```

**④ 핸들러 안에서 메인 스레드에 양보한다.** 여러 단계로 나뉜 작업이라면 단계 사이에 브라우저에 제어권을 돌려준다.

```ts
async function handleExport() {
  setStatus('preparing');                        // 이 업데이트가 먼저 페인트되도록
  await yieldToMain();
  const rows = buildRows(data);
  await yieldToMain();
  const csv = toCsv(rows);
  download(csv);
}

type SchedulerWithYield = { yield: () => Promise<void> };

function hasSchedulerYield(g: unknown): g is { scheduler: SchedulerWithYield } {
  const s = (g as { scheduler?: Partial<SchedulerWithYield> }).scheduler;
  return typeof s?.yield === 'function';
}

function yieldToMain(): Promise<void> {
  if (hasSchedulerYield(globalThis)) return globalThis.scheduler.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}
```

`scheduler.yield()`는 지원 브라우저가 제한적이므로 대체 경로를 함께 둔다.

---

## 7. 가상화: 보이는 행만 렌더한다, 그리고 대가를 치른다

### 7-1. 원리

스크롤 컨테이너에서 **화면에 보이는 행 + 앞뒤 여유분**만 DOM에 두고, 전체 높이는 빈 공간으로 유지한다. 1만 행 목록이 DOM 노드 30\~50행 분량이 된다.

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function LogTable({ rows }: { rows: LogRow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  return (
    <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(v => (
          <div
            key={rows[v.index].id}
            style={{ position: 'absolute', top: 0, transform: `translateY(${v.start}px)`, height: v.size, width: '100%' }}
          >
            <LogRowView row={rows[v.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 7-2. 대가

| 잃는 것 | 이유 | 보완 |
|---|---|---|
| 브라우저 찾기(Ctrl+F) | DOM에 없는 행은 검색되지 않는다 | 앱 내 검색 제공 |
| 스크린 리더의 목록 탐색 | 전체 개수와 위치를 알 수 없다 | `aria-rowcount`, `aria-rowindex` / `aria-setsize`, `aria-posinset` |
| 행 내부 state | 화면 밖으로 나가면 언마운트된다 | state를 행 밖(부모, 스토어)으로 올린다 |
| 가변 높이의 단순함 | 높이를 측정해야 하고 스크롤이 튈 수 있다 | 측정 API 사용, 가능하면 고정 높이 |
| 인쇄, SEO | 보이지 않는 행은 없다 | 인쇄용 뷰, 서버 렌더 목록 분리 |
| 앞으로 가기/뒤로 가기 시 위치 복원 | 전체 높이가 늦게 확정된다 | 스크롤 위치 저장·복원 |

### 7-3. 가상화 전에 확인할 대안

- **페이지네이션이나 "더 보기"**: 사용자가 정말 1만 행을 스크롤하는가? 대부분의 목록은 검색·필터가 먼저다.
- **CSS `content-visibility: auto`**: 화면 밖 요소의 레이아웃·페인트를 브라우저가 건너뛴다. DOM은 유지되므로 찾기와 접근성이 살아 있다. React 렌더 비용은 줄지 않지만, 병목이 레이아웃·페인트라면 이것으로 충분하다.

```css
.row { content-visibility: auto; contain-intrinsic-size: auto 36px; }
```

가상화는 **행 수가 수천 이상이고, 행이 복잡하고, 측정해서 병목이 DOM 크기로 확인됐을 때** 쓴다.

---

## 8. `<Activity>`: 숨긴 화면의 상태를 보존한다

### 8-1. 기존 선택지의 한계

탭 UI에서 비활성 탭을 처리하는 방법은 두 가지였다.

| 방식 | 문제 |
|---|---|
| 조건부 렌더링 `{tab === 'a' && <A />}` | 탭을 바꾸면 언마운트 → 입력 중인 폼, 스크롤 위치, 로드한 데이터가 사라진다 |
| CSS로 숨김 `display: none` | 숨겨진 탭도 계속 렌더·Effect 실행 → 타이머, 구독, 폴링이 계속 돌고 업데이트마다 같이 렌더된다 |

### 8-2. `<Activity>`의 동작 (React 19.2)

```tsx
import { Activity } from 'react';

function Tabs({ active }: { active: 'editor' | 'preview' | 'history' }) {
  return (
    <>
      <Activity mode={active === 'editor' ? 'visible' : 'hidden'}>
        <Editor />
      </Activity>
      <Activity mode={active === 'preview' ? 'visible' : 'hidden'}>
        <Preview />
      </Activity>
      <Activity mode={active === 'history' ? 'visible' : 'hidden'}>
        <History />
      </Activity>
    </>
  );
}
```

`mode="hidden"`일 때는 다음과 같이 동작한다.

- **state는 보존된다.** 컴포넌트 인스턴스가 유지된다.
- **DOM은 숨겨진다.** (`display: none`)
- **Effect는 정리된다.** cleanup이 실행되어 구독, 타이머, 연결이 멈춘다.
- **업데이트는 낮은 우선순위로 처리된다.** 숨긴 트리의 props가 바뀌면 보이는 화면의 작업이 끝난 뒤 여유 있을 때 렌더된다.

다시 `visible`이 되면 Effect가 다시 설정되고, 보존된 state로 즉시 화면이 나타난다.

> 실행 검증(React 19.3): 탭 내부 state를 `'typed'`로 바꾼 뒤 `hidden` → `visible`로 전환했다. state는 `'typed'`로 유지됐고, 숨길 때 Effect cleanup이 1회 실행됐다.

### 8-3. 쓰임새

- **탭, 사이드 패널**: 전환 시 입력과 스크롤 유지.
- **뒤로 가기 대비**: 목록 → 상세 → 목록에서 목록 화면을 hidden으로 유지하면 복귀가 즉시다.
- **다음 화면 미리 렌더**: 사용자가 곧 열 가능성이 높은 화면을 hidden으로 먼저 렌더해 두면, 데이터와 코드가 준비된 상태로 나타난다.

### 8-4. 대가

숨긴 트리는 **메모리와 DOM 노드를 계속 차지한다.** 모든 화면을 Activity로 감싸면 페이지 전체 DOM이 커져서 오히려 레이아웃 비용이 늘어난다. 되돌아올 가능성이 높고, 다시 만드는 비용이 큰 화면에만 쓴다. 그리고 Effect가 정리되므로 "숨겨져 있어도 계속 돌아야 하는 작업"(백그라운드 업로드 진행 등)은 Activity 바깥에 둔다.

---

## 9. 판단 흐름

```
상호작용이 느리다 (INP)
  ├─ ① Input Delay가 길다
  │    └─ 이전 작업이 메인 스레드를 점유 → 이전 렌더를 transition으로, 서드파티 스크립트 지연
  ├─ ② Processing이 길다
  │    └─ 핸들러의 동기 계산 → 렌더 중 파생값으로 이동 / Worker / yield
  └─ ③ Presentation Delay가 길다
       ├─ 렌더 범위가 넓다        → 2·3편
       ├─ 줄일 수 없는 무거운 렌더 → useTransition / useDeferredValue (+ 무거운 자식 memo)
       ├─ DOM이 너무 크다         → content-visibility → 가상화
       └─ 레이아웃이 반복 계산된다 → 읽기/쓰기 분리 (안티패턴 4편)
```

---

## 10. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| INP 세 구간 | [4편 — LCP/CLS/INP](/posts/frontend-antipatterns-4-rendering-performance) |
| 가상화의 대가 | [4편 — 가상화의 대가](/posts/frontend-antipatterns-4-rendering-performance), [7편 — 접근성](/posts/frontend-antipatterns-7-css-and-a11y) |
| 긴 작업, 레이아웃 | [4편 — 레이아웃 스래싱, 병목의 실제 순서](/posts/frontend-antipatterns-4-rendering-performance) |
| 디바운스와 요청 취소 | [5편 — 폴링, 취소](/posts/frontend-antipatterns-5-network-and-failure) |

---

## 자가진단 체크리스트

- [ ] 입력창의 값은 긴급 업데이트이고, 무거운 결과 렌더는 transition이나 deferred 값으로 분리했다.
- [ ] `useDeferredValue`를 받는 무거운 자식이 `memo`(또는 컴파일러)로 건너뛰어진다.
- [ ] 무거운 계산이 `startTransition` 콜백 안이 아니라 렌더 중 파생값으로 있다.
- [ ] 렌더가 무거운 문제를 고정 디바운스로 가리고 있지 않다.
- [ ] 수백 ms 이상 걸리는 순수 계산은 Worker 후보로 검토했다.
- [ ] 가상화 전에 페이지네이션, `content-visibility`를 검토했고, 가상화했다면 접근성 속성을 넣었다.
- [ ] 되돌아올 화면의 상태 보존이 필요할 때 `<Activity>`를 쓰고, 모든 화면에 남용하지 않는다.

---

## 다음 편

지금까지는 JS가 이미 로드된 뒤의 이야기였다. [7편](/posts/efficient-react-7-boundaries-and-bundle)에서는 **JS가 도착하기까지**를 다룬다. `'use client'` 경계를 어디에 두어야 번들이 작아지는지, 코드 분할 단위를 어떻게 정하는지, 서드파티 스크립트와 이미지·폰트가 LCP와 INP를 어떻게 망가뜨리는지 살펴본다.
