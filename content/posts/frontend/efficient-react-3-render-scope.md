---
# 📌 기본 메타데이터
title: '효율적인 React 3편 — 구조로 렌더 범위 줄이기: memo보다 먼저 할 일'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'Composition', 'Context', 'useSyncExternalStore', 'React Compiler']
description: '렌더 반경을 사후에 막는 memo 대신, 반경이 처음부터 넓어지지 않게 하는 네 가지 구조 기법. 컴포넌트 정체성 규칙과 React Compiler가 바꾼 것, 바꾸지 못한 것.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 3

# 📚 SEO용
keywords: ['React', 'Composition', 'Context', 'useSyncExternalStore', 'React Compiler', '효율적인 React']
---

# 효율적인 React 3편 — 구조로 렌더 범위 줄이기

[1편](/posts/efficient-react-1-cost-model)에서 렌더 전파가 멈추는 조건을 두 가지로 정리했다.

- A. `memo` 컴포넌트의 props가 얕은 비교로 같을 때
- B. 자식 element 객체의 참조가 이전과 같을 때

A는 **이미 넓어진 반경을 사후에 막는** 방법이고, 넘기는 쪽 전체에 참조 안정성을 요구한다. B는 **반경이 처음부터 넓어지지 않게** 만드는 방법이고, 추가 비용 없이 구조만으로 동작한다.

이 편은 B를 설계 도구로 쓰는 네 가지 기법을 비용이 낮은 순서대로 다룬다.

```
1. state 내리기          — 가장 싸다. 컴포넌트 하나 분리.
2. Composition           — children/slot으로 element 생성 위치를 옮긴다.
3. Context 분할          — 자주 바뀌는 값과 드물게 바뀌는 값을 나눈다.
4. 외부 스토어 + selector — 필요한 조각만 구독한다.
   └─ 그래도 부족하면 → React Compiler / memo
```

---

## 1. 기법 1 — state 내리기 (Move State Down)

### 문제

```tsx
function Dashboard() {
  const [query, setQuery] = useState('');

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <SearchResults query={query} />
      <RevenueChart />       {/* query와 무관 */}
      <ActivityFeed />       {/* query와 무관 */}
    </div>
  );
}
```

한 글자 입력할 때마다 `RevenueChart`와 `ActivityFeed`가 렌더된다. `query`를 쓰는 곳은 입력창과 `SearchResults`뿐인데 state는 그 위의 `Dashboard`에 있다.

### 해결

`query`와 그것을 쓰는 부분만 컴포넌트로 뽑는다.

```tsx
function Dashboard() {
  return (
    <div>
      <Search />
      <RevenueChart />
      <ActivityFeed />
    </div>
  );
}

function Search() {
  const [query, setQuery] = useState('');
  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <SearchResults query={query} />
    </>
  );
}
```

이제 `query` 변경의 반경은 `Search` 하위 트리뿐이다. `memo`는 한 줄도 없다.

2편의 Colocation 규칙을 렌더 비용 관점에서 다시 본 것이다. 그리고 이 리팩터링은 코드도 읽기 쉽게 만든다. `Dashboard`는 레이아웃만, `Search`는 검색만 책임진다.

### 신호

- 한 컴포넌트 안에 **서로 무관한 state 그룹**이 있다.
- 자주 바뀌는 state(입력, hover, 드래그 좌표, 타이머)가 레이아웃 컴포넌트에 있다.
- Profiler에서 `The parent component rendered`가 넓게 찍힌다.

---

## 2. 기법 2 — Composition: element를 만드는 위치를 옮긴다

state 내리기가 안 되는 경우가 있다. **state를 가진 컴포넌트가 무관한 자식을 감싸야 할 때**다.

### 문제

```tsx
function ResizablePanel() {
  const [width, setWidth] = useState(320);   // 드래그 중 초당 수십 번 변경

  return (
    <aside style={{ width }}>
      <DragHandle onDrag={setWidth} />
      <FileTree />          {/* 무겁고 width와 무관 */}
    </aside>
  );
}
```

`FileTree`는 `aside` **안에** 있어야 하므로 state를 내릴 곳이 없다.

### 해결: 자식을 밖에서 만들어 넘긴다

```tsx
function ResizablePanel({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(320);
  return (
    <aside style={{ width }}>
      <DragHandle onDrag={setWidth} />
      {children}
    </aside>
  );
}

function Sidebar() {
  return (
    <ResizablePanel>
      <FileTree />
    </ResizablePanel>
  );
}
```

`<FileTree />` element를 만드는 쪽은 `Sidebar`다. 드래그로 `ResizablePanel`이 렌더돼도 `Sidebar`는 렌더되지 않으므로 `children`은 같은 객체이고, React는 `FileTree`를 건너뛴다.

> 실행 검증(React 19): `children`을 감싼 컴포넌트의 state를 두 번 바꾸자 감싼 컴포넌트는 3회, `children`으로 들어온 컴포넌트는 1회 호출됐다.

### 여러 자리가 필요하면 slot props

`children`은 prop 이름 중 하나일 뿐이다. element는 어떤 prop으로든 넘길 수 있다.

```tsx
function SplitLayout({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const [ratio, setRatio] = useState(0.5);
  return (
    <div className="split">
      <div style={{ flex: ratio }}>{left}</div>
      <Divider onChange={setRatio} />
      <div style={{ flex: 1 - ratio }}>{right}</div>
    </div>
  );
}

<SplitLayout left={<Editor />} right={<Preview />} />
```

### Prop Drilling도 Composition으로 풀린다

```tsx
// ❌ Layout과 Header는 user를 쓰지 않고 전달만 한다
<Page user={user} />
  → <Layout user={user} />
    → <Header user={user} />
      → <UserMenu user={user} />
```

```tsx
// ✅ 데이터를 쓰는 element를 데이터가 있는 곳에서 만든다
function Page({ user }: { user: User }) {
  return (
    <Layout header={<Header right={<UserMenu user={user} />} />}>
      {/* ... */}
    </Layout>
  );
}
```

`Layout`과 `Header`는 `user`의 존재를 모른다. 이 둘의 props 타입에서 `user`가 사라지므로 재사용성도 높아진다. Context를 꺼내기 전에 이 방법이 되는지 먼저 확인한다.

### Composition이 동작하지 않는 경우

- `children`을 **함수로** 받는 경우(Render Props): `children(width)`는 매 렌더마다 새 element를 만든다. 자식이 state 값을 **써야 한다면** 렌더되는 게 맞으므로 문제가 아니다.
- `React.cloneElement(children, { extra })`로 props를 주입하는 경우: 새 element가 만들어지므로 bail-out이 사라진다.

---

## 3. 기법 3 — Context 분할

1편에서 확인한 Context의 성질을 다시 적는다.

1. Context 값이 `Object.is`로 달라지면 **그 Context를 읽는 모든 컴포넌트**가 렌더된다.
2. `memo`는 이 경로를 막지 못한다.
3. 구독은 **값 전체 단위**다. 필드 단위 구독은 없다.

### 3-1. Provider는 children을 받는 컴포넌트로 분리한다

```tsx
// ❌ Provider의 state 변경이 App 전체를 렌더
function App() {
  const [theme, setTheme] = useState<Theme>('light');
  return (
    <ThemeContext value={{ theme, setTheme }}>
      <Header />
      <Main />
      <Footer />
    </ThemeContext>
  );
}
```

```tsx
// ✅ Provider 컴포넌트가 children을 받는다 → 기법 2와 같은 원리
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

function App() {
  return (
    <ThemeProvider>
      <Header />
      <Main />
      <Footer />
    </ThemeProvider>
  );
}
```

이제 `theme`이 바뀌면 **Context를 읽는 컴포넌트만** 렌더된다. `useMemo`는 Provider가 다른 이유(부모 렌더)로 렌더될 때 value 객체가 새로 생기는 것을 막는다.

### 3-2. 값과 변경 함수를 나눈다

```tsx
const CartItemsContext = createContext<CartItem[]>([]);
const CartActionsContext = createContext<CartActions | null>(null);

function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, []);

  // dispatch는 참조가 영구히 안정 → actions 객체도 한 번만 생성
  const actions = useMemo<CartActions>(() => ({
    add: (item) => dispatch({ type: 'ADD', item }),
    remove: (id) => dispatch({ type: 'REMOVE', id }),
  }), []);

  return (
    <CartActionsContext value={actions}>
      <CartItemsContext value={items}>
        {children}
      </CartItemsContext>
    </CartActionsContext>
  );
}

// 상품 카드 수백 개: 담기 버튼은 actions만 구독 → 장바구니가 바뀌어도 렌더 안 됨
function AddToCartButton({ product }: { product: Product }) {
  const { add } = useContext(CartActionsContext)!;
  return <button onClick={() => add(toCartItem(product))}>담기</button>;
}

// 헤더 배지: items를 구독 → 바뀔 때만 렌더
function CartBadge() {
  const items = useContext(CartItemsContext);
  return <span>{items.length}</span>;
}
```

"변경 함수만 쓰는 컴포넌트"가 많을수록 효과가 크다. 상품 목록의 버튼 수백 개가 장바구니 변경마다 렌더되던 구조가, 배지 하나만 렌더되는 구조로 바뀐다.

> 실행 검증: `{state, setState}`를 하나의 Context에 담은 경우 `memo` 소비자가 state 변경마다 렌더됐고, `setState`만 담은 Context의 소비자는 렌더되지 않았다.

### 3-3. Context가 맞지 않는 경우

Context 분할은 **변경 빈도가 낮은 값**에서 잘 동작한다. 다음 경우에는 한계가 있다.

- 값이 초당 여러 번 바뀐다(커서 위치, 실시간 데이터).
- 하나의 큰 객체에서 소비자마다 **다른 필드**를 구독한다. 필드마다 Context를 만들 수는 없다.

이때는 기법 4로 간다.

---

## 4. 기법 4 — 외부 스토어와 selector 구독

### 4-1. 원리: React 밖에 state를 두고, 필요한 조각만 구독한다

`useSyncExternalStore`는 React 외부 저장소를 구독하는 공식 훅이다. 핵심은 **`getSnapshot`이 반환한 값이 이전과 `Object.is`로 같으면 렌더하지 않는다**는 점이다. `getSnapshot`에서 selector를 적용하면 필드 단위 구독이 된다.

최소 구현은 20줄이면 된다.

```ts
type Listener = () => void;

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (updater: (prev: T) => Partial<T>) => {
      state = { ...state, ...updater(state) };
      listeners.forEach(l => l());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T extends object, S>(
  store: ReturnType<typeof createStore<T>>,
  selector: (state: T) => S,
): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),   // 서버 렌더용 스냅샷
  );
}
```

```tsx
const editorStore = createStore({ cursor: { line: 1, col: 1 }, fileName: 'index.ts', dirty: false });

function StatusBarCursor() {
  const line = useStore(editorStore, s => s.cursor.line);   // 원시값
  const col = useStore(editorStore, s => s.cursor.col);
  return <span>{line}:{col}</span>;
}

function TabTitle() {
  const fileName = useStore(editorStore, s => s.fileName);  // cursor가 바뀌어도 렌더 안 됨
  const dirty = useStore(editorStore, s => s.dirty);
  return <span>{fileName}{dirty && ' •'}</span>;
}
```

> 실행 검증: `{a, b}` 스토어에서 `b`만 바꿨을 때 `s => s.a`를 구독한 컴포넌트는 렌더되지 않았고(1회), `s => s.b`를 구독한 컴포넌트만 렌더됐다(2회).

Zustand, Jotai, Redux의 `useSelector`가 모두 이 원리 위에 있다. 라이브러리를 고를 때도 "selector 구독을 지원하는가"가 핵심 기준이다.

### 4-2. 함정: selector가 매번 새 객체를 반환하면

```tsx
// ❌ 매 호출마다 새 객체 → 스냅샷이 항상 "다름"
const { line, col } = useStore(editorStore, s => ({ line: s.cursor.line, col: s.cursor.col }));
```

`getSnapshot`이 호출될 때마다 새 객체를 반환하면 React는 스냅샷이 계속 바뀐다고 판단하고 다시 렌더를 시도한다. 결과는 무한 루프다.

> 실행 검증: 새 객체를 반환하는 `getSnapshot`은 `"The result of getSnapshot should be cached to avoid an infinite loop"` 경고 후 `Maximum update depth exceeded` 에러를 냈다.

해결 방법은 세 가지다.

1. **원시값을 여러 번 구독한다.** 위 `StatusBarCursor`처럼 한다. 가장 단순하다.
2. **이미 스토어에 있는 객체 참조를 그대로 반환한다.** `s => s.cursor`는 `cursor`가 교체될 때만 바뀐다.
3. **얕은 비교로 이전 결과를 재사용한다.** Zustand의 `useShallow`가 이 역할을 한다.

### 4-3. 기법 3과 4의 선택 기준

| | Context 분할 | 외부 스토어 + selector |
|---|---|---|
| 변경 빈도 | 낮음(테마, 세션, 설정) | 높음(편집기, 실시간, 드래그) |
| 구독 단위 | Context 하나 = 값 하나 | selector 하나 = 조각 하나 |
| 트리 스코프 | Provider 하위로 자연스럽게 제한 | 모듈 전역(스코프가 필요하면 Context로 스토어 인스턴스를 주입) |
| SSR·테스트 격리 | 요청마다 Provider가 새로 생김 | 모듈 전역 스토어는 요청 간 공유 위험 |

마지막 행은 Next.js 서버 렌더에서 중요하다. 모듈 스코프의 스토어는 서버에서 **모든 요청이 공유**한다. 사용자별 데이터를 넣으면 다른 사용자에게 섞일 수 있다. 사용자별 스토어가 필요하면 Provider 안에서 `useState(() => createStore(...))`로 인스턴스를 만들고 Context로 스토어 **참조**만 내려보낸다. 참조는 바뀌지 않으므로 Context 렌더 문제도 생기지 않는다.

---

## 5. 컴포넌트 정체성: 렌더 범위보다 비싼 실수

렌더 **범위**가 넓은 것은 성능 문제다. 컴포넌트 **정체성**이 흔들리는 것은 성능 문제이면서 버그다. React는 트리의 **위치**와 **타입**, **key**로 "같은 컴포넌트인가"를 판단한다. 셋 중 하나라도 바뀌면 이전 인스턴스를 버리고 새로 마운트한다. state와 DOM이 모두 사라진다.

### 5-1. 컴포넌트 안에서 컴포넌트를 정의하지 않는다

```tsx
// ❌
function ProductPage({ product }: { product: Product }) {
  const [tab, setTab] = useState('detail');

  function ReviewForm() {                  // 렌더마다 새 함수 = 새 타입
    const [text, setText] = useState('');
    return <textarea value={text} onChange={e => setText(e.target.value)} />;
  }

  return (<><Tabs value={tab} onChange={setTab} /><ReviewForm /></>);
}
```

`ProductPage`가 렌더될 때마다 `ReviewForm`은 **다른 함수**다. React는 타입이 바뀌었다고 판단하고 이전 인스턴스를 언마운트한다. 탭을 바꾸면 작성 중인 리뷰가 사라진다. 매번 마운트하므로 비용도 일반 렌더보다 크다.

> 실행 검증: 내부 정의 컴포넌트에 `'typed'`를 입력한 뒤 부모 state를 바꾸자 값이 `'init'`으로 돌아갔다.

해결은 컴포넌트를 모듈 스코프로 옮기고 필요한 값은 props로 받는 것이다. 클로저로 부모 값을 읽고 싶어서 안에 정의했다면, 그 값이 곧 props다.

### 5-2. key는 데이터의 정체성이어야 한다

```tsx
{items.map((item, index) => <Row key={index} item={item} />)}   // ❌ 순서가 바뀌는 목록
{items.map(item => <Row key={item.id} item={item} />)}         // ✅
```

index를 key로 쓰면 목록 앞에 항목이 추가될 때 **state가 위치를 따라간다.**

> 실행 검증: `['b']` 목록에서 `b`를 체크한 뒤 앞에 `a`를 추가했다. `key=index`에서는 `a`가 체크됐고, `key=id`에서는 `b`가 체크된 상태를 유지했다.

index key가 안전한 조건은 세 가지를 **모두** 만족할 때다. 목록이 정적이고, 순서가 바뀌지 않고, 항목에 state나 비제어 입력이 없다. `key={Math.random()}`이나 렌더 중 `crypto.randomUUID()`는 매 렌더마다 전체 목록을 다시 마운트한다.

### 5-3. 조건부 렌더링은 위치로 정체성을 판단한다

```tsx
{isEditing ? <Input defaultValue={a} /> : <Input defaultValue={b} />}
```

두 `<Input />`은 **같은 위치, 같은 타입**이므로 React는 같은 컴포넌트로 본다. 조건이 바뀌어도 state와 DOM이 유지되고, `defaultValue`는 반영되지 않는다. 다른 컴포넌트로 취급하고 싶다면 `key`를 다르게 준다.

```tsx
{isEditing ? <Input key="edit" defaultValue={a} /> : <Input key="view" defaultValue={b} />}
```

반대로, 조건에 따라 감싸는 요소가 달라지면(`<div>` ↔ `<section>`) 하위 트리 전체의 state가 사라진다. state를 유지하고 싶다면 감싸는 구조를 고정한다.

---

## 6. React Compiler: 바뀐 것과 바뀌지 않은 것

[React Compiler](https://react.dev/blog/2025/10/07/react-compiler-1)는 2025년 10월 1.0이 나왔다. 빌드 단계에서 컴포넌트와 훅을 분석해 **자동으로 메모이제이션 코드를 삽입**한다.

### 6-1. 무엇을 해 주나

```tsx
function ProductList({ products, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const filtered = products.filter(p => p.name.includes(query));
  return (
    <>
      <SearchBox value={query} onChange={setQuery} />
      <Grid items={filtered} onSelect={onSelect} />
    </>
  );
}
```

컴파일러는 이 코드를 대략 다음처럼 바꾼다.

- `filtered`는 `products`와 `query`가 바뀔 때만 다시 계산한다.
- `<Grid items={filtered} onSelect={onSelect} />` element는 `filtered`와 `onSelect`가 같으면 **이전 element 객체를 재사용**한다.

두 번째 항목이 중요하다. 컴파일러는 `memo`로 감싸는 방식이 아니라 **element 참조를 캐시해서 1편의 조건 B를 자동으로 만든다.** `useMemo`보다 세밀하게, 조건문 뒤에서도 동작한다.

### 6-2. 전제: Rules of React

컴파일러는 코드가 규칙을 지킨다고 **가정**하고 최적화한다. 규칙을 어긴 컴포넌트는 분석 단계에서 감지되면 최적화를 건너뛴다(bail-out). 감지되지 않으면 잘못된 캐시로 이어질 수 있다.

| 규칙 | 어기는 코드 |
|---|---|
| 렌더는 순수하다 | 렌더 중 외부 변수 수정, `Math.random()`/`Date.now()`로 출력 결정 |
| props와 state는 불변이다 | `props.items.push(x)`, `state.count++` |
| 렌더 중 ref를 읽거나 쓰지 않는다 | `return <div>{ref.current}</div>` |
| 훅은 최상위에서 호출한다 | 조건문·반복문 안의 훅 |

규칙 위반을 사람이 찾을 필요는 없다. `eslint-plugin-react-hooks`의 최신 recommended 설정에는 컴파일러와 같은 분석을 쓰는 규칙이 포함되어 있다. **컴파일러 도입 전에 lint부터 켜서 경고를 0으로 만드는 것**이 안전한 순서다. 특정 컴포넌트에 문제가 생기면 함수 본문 첫 줄에 `'use no memo'` 지시어를 넣어 그 컴포넌트만 제외하고 원인을 찾는다.

### 6-3. 컴파일러가 바꾸지 않는 것

컴파일러는 **같은 입력에 대한 반복 계산**을 없앤다. 입력 자체가 바뀌는 구조 문제는 그대로 남는다.

| 문제 | 컴파일러 후에도 남는 이유 | 해결 |
|---|---|---|
| state가 너무 위에 있다 | state가 실제로 바뀌므로 그 state를 받는 경로는 모두 렌더 | 기법 1·2 |
| Context 값이 자주 바뀐다 | 모든 소비자가 렌더되는 규칙은 그대로 | 기법 3·4 |
| 파생값을 Effect로 동기화 | 이중 렌더 구조는 캐시로 해결되지 않음 | 2편, 4편 |
| 첫 계산이 무겁다 | 캐시는 두 번째 호출부터 효과 | 6편 transition, Web Worker |
| 목록이 너무 길다 | 1만 개 행을 처음 그리는 비용 | 6편 가상화 |
| 네트워크 Waterfall, 큰 번들 | 렌더 밖의 문제 | 5·7편 |

그래서 이 편의 순서는 컴파일러가 있어도 바뀌지 않는다. **구조로 반경을 좁히고, 반복 계산은 컴파일러에 맡긴다.** 이 역할 분담이 가장 비용이 낮다.

### 6-4. 컴파일러 없이 수동으로 memo할 때의 기준

컴파일러를 쓸 수 없는 환경이라면 다음 조건이 **모두** 맞을 때만 `memo`를 쓴다.

1. Profiler로 해당 컴포넌트가 병목임을 확인했다.
2. 기법 1\~4로 반경을 줄일 수 없다.
3. 넘기는 props를 모두 안정적으로 만들 수 있다(원시값, 모듈 상수, `useMemo`/`useCallback`, `dispatch`, setter).

3번이 안 되면 `memo`는 비교 비용만 추가하고 효과는 없다. `memo`를 추가할 때는 부모 쪽 코드도 **함께** 리뷰한다.

---

## 7. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| state 내리기, Composition | [3편 — God Component 쪼개는 순서](/posts/frontend-antipatterns-3-component-design) |
| 컴포넌트 정체성, key | [3편 — 컴포넌트 내부 정의 정체성 버그, key=index](/posts/frontend-antipatterns-3-component-design) |
| Context 분할, selector | [2편 — 성급한 Context 전역화](/posts/frontend-antipatterns-2-state-and-data-flow) |
| memo 사용 기준, Compiler | [4편 — memo 도배 vs 방치](/posts/frontend-antipatterns-4-rendering-performance) |

---

## 자가진단 체크리스트

- [ ] 자주 바뀌는 state(입력, hover, 드래그, 타이머)가 레이아웃 컴포넌트에 있지 않다.
- [ ] 무관한 무거운 자식을 감싸야 할 때 `children`이나 slot으로 받는다.
- [ ] Provider는 `children`을 받는 별도 컴포넌트이고, value 객체는 안정적이다.
- [ ] 변경 함수만 쓰는 소비자가 많으면 값 Context와 액션 Context를 나눴다.
- [ ] selector가 새 객체를 반환하지 않는다(원시값, 기존 참조, 얕은 비교).
- [ ] 사용자별 데이터를 모듈 전역 스토어에 두지 않는다(SSR).
- [ ] 컴포넌트 안에서 컴포넌트를 정의하지 않는다.
- [ ] 순서가 바뀌거나 항목에 state가 있는 목록은 데이터 ID를 key로 쓴다.
- [ ] 컴파일러 도입 전에 hooks lint 경고를 0으로 만들었다.

---

## 다음 편

지금까지 "렌더가 얼마나 넓게 일어나는가"를 다뤘다. 그런데 렌더 자체보다 **렌더 뒤에 연쇄적으로 일어나는 일**이 더 비싼 경우가 많다. [4편](/posts/efficient-react-4-effects)에서는 `useEffect`가 맞는 경우와 틀린 경우를 가르는 기준, Effect 없이 같은 일을 하는 방법들, 그리고 `useEffectEvent`가 해결하는 문제를 다룬다.
