---
# 📌 기본 메타데이터
title: '프론트엔드 디자인 패턴 (5) — 상태의 4분류와 반응성 엔진 3종'
date: '2026-09-14'
category: 'frontend'
tags: ['State Management', 'React', 'Signals', 'Virtual DOM', 'Proxy', 'TanStack Query']
description: '서버/클라이언트/폼/URL 네 가지 상태를 가르는 실전 판단 기준과, VDOM diff·Proxy 추적·Signal 그래프 세 반응성 엔진의 내부 동작 비교.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 디자인 패턴'
seriesOrder: 5

# 📚 SEO용
keywords: ['State Management', 'React', 'Signals', 'Virtual DOM', 'Proxy', 'TanStack Query', '프론트엔드 디자인 패턴']
---

# 프론트엔드 디자인 패턴 (5) — 상태의 4분류와 반응성 엔진

이 편은 두 부분입니다.

**전반부**는 "이 데이터를 어디에 둘 것인가"를 기계적으로 판단하는 방법입니다. 4편에서 "Redux에 서버 데이터를 넣지 말라"고 했으니, 그럼 어디에 넣어야 하는지에 답해야죠.

**후반부**는 그 아래에서 돌아가는 엔진입니다. VDOM diff, Proxy 추적, Signal 그래프 — 세 가지가 각각 어떻게 "무엇을 다시 그릴지" 결정하는지 내부를 봅니다.

---

# 1부. 상태를 네 갈래로 가르기

## 판단 플로우차트

새 데이터를 만날 때마다 이 순서로 물으면 됩니다.

```
1. 이 데이터의 원본이 서버에 있는가?
   → 예: 서버 상태 (TanStack Query / SWR / RSC)

2. 새로고침하거나 링크로 공유했을 때 유지돼야 하는가?
   → 예: URL 상태 (searchParams)

3. 사용자가 지금 입력 중인 값인가?
   → 예: 폼 상태 (React Hook Form / 비제어 input)

4. 다른 값에서 계산할 수 있는가?
   → 예: 상태가 아니다. 계산해라.

5. 나머지
   → 클라이언트 상태. 한 컴포넌트 안이면 useState,
      멀리 떨어진 컴포넌트끼리 공유하면 Zustand/Jotai
```

**4번이 가장 많이 걸리는 함정입니다.** 실무 코드에서 "상태"라고 이름 붙은 것의 상당수가 파생 값입니다.

```typescript
// 나쁨 — 상태 세 개, 동기화 이펙트 두 개
const [items, setItems] = useState<Item[]>([]);
const [filtered, setFiltered] = useState<Item[]>([]);
const [total, setTotal] = useState(0);

useEffect(() => setFiltered(items.filter(i => i.active)), [items]);
useEffect(() => setTotal(filtered.reduce((s, i) => s + i.price, 0)), [filtered]);

// 좋음 — 상태 하나
const [items, setItems] = useState<Item[]>([]);
const filtered = items.filter(i => i.active);
const total = filtered.reduce((s, i) => s + i.price, 0);
```

**상태가 세 개면 세 개가 서로 어긋날 수 있고, 어긋나면 버그입니다.** 1편의 단일 소유권 원리를 가장 자주 위반하는 형태가 이겁니다.

---

## 서버 상태 — 그것은 상태가 아니라 캐시다

핵심 인식부터.

> `users`, `posts`, `orders`의 **진실의 원천은 서버**입니다. 클라이언트가 들고 있는 건 사본이고, 사본은 받는 순간부터 낡기 시작합니다.

낡은 사본을 다루는 문제는 **상태 관리 문제가 아니라 캐시 문제**입니다. 그리고 캐시 문제에는 정해진 어휘가 있습니다.

| 캐시 개념 | 서버 상태에서의 의미 |
|---|---|
| staleness | 이 데이터를 언제부터 "낡았다"고 볼 것인가 |
| revalidation | 낡은 걸 보여주면서 뒤에서 다시 가져오기 |
| deduplication | 같은 요청이 동시에 세 번 나가는 걸 한 번으로 |
| invalidation | 변경이 일어났을 때 무엇을 낡음 처리할 것인가 |
| garbage collection | 안 보는 데이터를 언제 버릴 것인가 |
| optimistic update | 서버 응답 전에 미리 반영하고 실패하면 되돌리기 |

Redux로 서버 데이터를 다루면 **이걸 전부 손으로 짜야 합니다.** 실제로 2018년경 많은 코드베이스가 그렇게 했고, 슬라이스마다 `isLoading / error / data / lastFetchedAt`을 복붙했습니다.

### 무엇이 달라지는지 코드로

```typescript
// Redux 시절 — 슬라이스마다 반복
const usersSlice = createSlice({
  name: 'users',
  initialState: { data: [], loading: false, error: null, lastFetch: 0 },
  reducers: {
    loading(s) { s.loading = true; s.error = null; },
    loaded(s, a) { s.data = a.payload; s.loading = false; s.lastFetch = Date.now(); },
    failed(s, a) { s.error = a.payload; s.loading = false; },
  },
});
// + thunk + 중복 요청 방지 + 캐시 만료 체크 + 다른 화면에서 갱신했을 때 동기화...
```

```typescript
// 서버 상태 도구
const { data, isPending, error } = useQuery({
  queryKey: ['users', teamId],
  queryFn: () => api.getUsers(teamId),
  staleTime: 60_000,
});
```

**`queryKey`가 이 설계의 중심입니다.** 키가 곧 캐시 주소이고, 무효화의 단위이고, 중복 제거의 기준입니다.

```typescript
queryClient.invalidateQueries({ queryKey: ['users'] });          // users로 시작하는 전부
queryClient.invalidateQueries({ queryKey: ['users', teamId] });  // 이 팀만
```

**키 설계 = 캐시 정책 설계**입니다. 일반적인 것에서 구체적인 것 순으로 배열을 만들면(`['users', teamId, { status }]`) 무효화 범위를 계층적으로 고를 수 있습니다.

### 낙관적 업데이트 — 실패 경로까지가 패턴이다

```typescript
const mutation = useMutation({
  mutationFn: (item: Item) => api.addItem(item),

  onMutate: async (newItem) => {
    // 1. 진행 중인 refetch를 취소 (돌아와서 내 낙관 업데이트를 덮어쓰지 않도록)
    await queryClient.cancelQueries({ queryKey: ['cart'] });

    // 2. 롤백용 스냅샷
    const previous = queryClient.getQueryData<Item[]>(['cart']);

    // 3. 미리 반영
    queryClient.setQueryData<Item[]>(['cart'], old => [...(old ?? []), newItem]);

    return { previous };
  },

  onError: (_err, _newItem, context) => {
    queryClient.setQueryData(['cart'], context?.previous);   // 4. 되돌리기
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['cart'] });   // 5. 결국 서버가 진실
  },
});
```

**1번 `cancelQueries`를 빼먹는 게 가장 흔한 버그입니다.** 낙관 업데이트를 넣었는데 진행 중이던 refetch가 도착하면서 옛 데이터로 덮어쓰고, 화면이 깜빡이면서 방금 추가한 게 사라졌다 다시 나타납니다.

이 다섯 단계가 **분산 시스템의 보상 트랜잭션(compensating transaction)** 을 프론트엔드에서 하는 방식입니다.

---

## URL 상태 — 가장 자주 놓치는 분류

```typescript
// 흔한 코드
const [page, setPage] = useState(1);
const [sort, setSort] = useState('created');
const [filters, setFilters] = useState({ status: 'all' });
```

세 상태를 `useState`에 넣는 순간 이것들을 잃습니다.

- 새로고침하면 초기화됨
- 링크를 복사해서 동료에게 보내면 다른 화면이 열림
- 뒤로가기를 누르면 목록이 아니라 이전 페이지로 나감
- 상세 화면에 들어갔다 돌아오면 필터가 사라짐

**판단 기준은 한 문장입니다.**

> 이 값이 다르면 **사용자가 "다른 화면"이라고 인식하는가?** 그렇다면 URL에 있어야 합니다.

```typescript
// Next.js App Router
function useQueryState(key: string, defaultValue: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = React.useCallback((next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) params.delete(key);   // 기본값이면 URL을 더럽히지 않는다
    else params.set(key, next);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }, [key, defaultValue, pathname, router, searchParams]);

  return [value, setValue] as const;
}
```

**두 가지 디테일:**

- **기본값일 때 파라미터를 지운다** — `?page=1&sort=created&status=all` 같은 URL은 공유할 때 지저분하고, 기본값이 바뀌면 옛 링크가 잘못된 상태를 고정합니다.
- **`replace` vs `push`** — 필터 변경마다 히스토리를 쌓으면 뒤로가기 열 번을 눌러야 목록에서 나갑니다. 필터·정렬은 `replace`, 페이지 이동은 `push`가 보통 맞습니다.

그리고 **서버 상태와의 궁합이 좋습니다.**

```typescript
const [status] = useQueryState('status', 'all');
const { data } = useQuery({
  queryKey: ['orders', { status }],   // URL이 바뀌면 쿼리 키가 바뀌고, 알아서 다시 가져온다
  queryFn: () => api.getOrders({ status }),
});
```

URL이 **파라미터의 단일 소유자**가 되고, 서버 상태는 그 파생입니다. 동기화 코드가 한 줄도 없습니다.

---

## 폼 상태 — 왜 별도 분류인가

폼이 특별한 이유는 하나입니다. **변경 빈도가 압도적으로 높습니다.**

```typescript
// 20개 필드 폼을 전부 제어 컴포넌트로 만들면
const [form, setForm] = useState(initialValues);
// 키 한 번 누를 때마다 폼 전체(+자식 20개)가 리렌더된다
```

React Hook Form이 택한 길은 **비제어 + ref 등록**입니다.

```typescript
const { register, handleSubmit, formState: { errors } } = useForm<FormValues>();

<input {...register('email', { required: '필수입니다' })} />
```

`register`가 반환하는 건 `{ name, onChange, onBlur, ref }` 입니다. 값은 **DOM이 들고 있고**, 라이브러리는 ref로 접근합니다. 타이핑할 때 React 상태가 안 바뀌므로 **리렌더가 일어나지 않습니다.** 제출 시점에만 DOM에서 값을 모읍니다.

> 여기서 재밌는 역설이 있습니다. 1편에서 "DOM이 상태를 들고 있던 시절이 문제였다"고 했는데, 폼에서는 **의도적으로 DOM에 상태를 맡깁니다.**
>
> 모순이 아닙니다. 1편의 문제는 "DOM이 상태를 들고 있다"가 아니라 **"여러 곳이 진실의 원천을 나눠 갖는다"** 였습니다. 폼 필드는 애초에 브라우저가 소유하도록 설계된 상태이고, RHF는 그 소유권을 **일관되게 DOM에 몰아줍니다.** 단일 소유권은 그대로 지켜집니다.

**언제 제어 컴포넌트를 써야 하나:** 타이핑에 따라 **다른 UI가 실시간으로 반응해야 할 때**입니다. 실시간 검색, 입력 중 미리보기, 필드 간 즉시 연동. 그럴 땐 리렌더가 목적이므로 제어가 맞습니다.

---

## 클라이언트 전역 상태 — 결국 남는 것

네 번 걸러내고 나면 실제로 남는 건 놀랄 만큼 적습니다.

- 테마, 언어, 사이드바 열림 같은 UI 환경설정
- 토스트/모달 큐
- 아직 서버에 안 보낸 마법사(wizard) 진행 상태
- 여러 화면에 걸친 선택 상태(예: 비교하려고 체크해 둔 항목들)
- 웹소켓 연결 상태 같은 런타임 정보

이 정도면 Zustand 30줄이나 Jotai 아톰 몇 개로 끝납니다. **"전역 상태 관리 라이브러리를 뭘 쓸까"가 프로젝트 초반의 큰 결정처럼 느껴지는데, 4분류를 제대로 하고 나면 그 결정의 비중이 확 줄어듭니다.**

### 실전 리팩터링 — 하나의 슬라이스를 네 갈래로

```typescript
// Before — 전부 Redux
{
  orders: { data, loading, error },         // 서버
  orderFilters: { status, dateRange },      // URL
  orderForm: { customerName, items },       // 폼
  selectedOrderIds: [],                     // 클라이언트
  sidebarOpen: true,                        // 클라이언트
}
```

```typescript
// After
const [status] = useQueryState('status', 'all');                 // URL
const { data: orders } = useQuery({ queryKey: ['orders', { status }], ... });  // 서버
const { register, handleSubmit } = useForm<OrderForm>();         // 폼
const selected = useSelectionStore(s => s.selectedIds);          // 클라이언트
const sidebarOpen = useUIStore(s => s.sidebarOpen);              // 클라이언트
```

**전역 스토어에 남은 건 두 줄입니다.**

---

# 2부. 반응성 엔진 3종

"상태가 바뀌면 화면이 갱신된다"는 같은 결과를, 세 가지 방식이 완전히 다른 메커니즘으로 만듭니다. **차이는 "무엇을 다시 그릴지 언제 어떻게 아는가"에 있습니다.**

---

## 엔진 A — VDOM diff (React)

### 동작

```
setState 호출
  → 해당 컴포넌트를 "dirty"로 표시
  → 컴포넌트 함수를 다시 실행 (자식들도 따라서 다시 실행)
  → 새 엘리먼트 트리와 이전 트리를 비교
  → 달라진 DOM만 수정
```

**핵심은 "컴포넌트 함수를 다시 실행한다"** 입니다. 상태가 하나 바뀌었을 때 React가 아는 것은 **"이 컴포넌트 어딘가가 바뀌었다"** 뿐입니다. 어느 텍스트 노드인지는 모릅니다. 그래서 전부 다시 만들어 보고 비교합니다.

### 비교 알고리즘의 두 가지 가정

완전한 트리 비교는 O(n³)입니다. React는 휴리스틱 두 개로 O(n)을 만듭니다.

1. **타입이 다르면 통째로 버린다.** `<div>`가 `<span>`이 되면 그 아래 서브트리 전체를 파괴하고 새로 만듭니다. 자식이 같아도 마찬가지입니다.
2. **`key`로 형제 간 정체성을 판별한다.**

```tsx
// key가 index면 — 앞에 항목을 삽입했을 때 전부 "내용이 바뀐 것"으로 처리된다
{items.map((item, i) => <Row key={i} item={item} />)}

// key가 id면 — 삽입된 하나만 새로 만들고 나머지는 이동시킨다
{items.map(item => <Row key={item.id} item={item} />)}
```

`key`는 성능 최적화가 아니라 **정체성 선언**입니다. `key`가 같으면 React는 같은 컴포넌트 인스턴스로 취급하고, 그 안의 `useState`도 유지됩니다. 인덱스를 key로 쓴 목록에서 "정렬했더니 입력 중이던 값이 다른 행으로 옮겨간" 버그가 나는 이유입니다.

### 대가와 완화

리렌더가 컴포넌트 단위라서, 상태가 위쪽에 있으면 아래 전부가 다시 실행됩니다. 완화 수단들:

```tsx
// 1. 상태를 필요한 곳까지 내린다 (가장 근본적)
// 2. children으로 잘라내기 — Provider가 리렌더돼도 children은 다시 안 만들어진다
function Layout({ children }) {
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ open, setOpen }}>{children}</Ctx.Provider>;
}
// 3. React.memo / useMemo / useCallback (수동)
// 4. React Compiler (자동)
```

**정신 모델은 가장 단순합니다.** "상태가 바뀌면 그 컴포넌트부터 아래로 함수가 다시 실행된다." 이 한 문장이면 React의 렌더 동작 전부를 설명할 수 있습니다. 그리고 그 단순함이 React가 이 모델을 버리지 않는 이유입니다.

---

## 엔진 B — Proxy 추적 (Vue 3, MobX, Valtio)

### 동작

ES6 `Proxy`로 객체의 속성 읽기/쓰기를 가로챕니다.

```typescript
const targetMap = new WeakMap<object, Map<PropertyKey, Set<Effect>>>();
let activeEffect: Effect | null = null;

function reactive<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      track(obj, key);                                // 누가 읽었는지 기록
      const result = Reflect.get(obj, key, receiver);
      return typeof result === 'object' && result !== null
        ? reactive(result)                            // 중첩 객체도 감싼다
        : result;
    },
    set(obj, key, value, receiver) {
      const old = obj[key as keyof T];
      const result = Reflect.set(obj, key, value, receiver);
      if (!Object.is(old, value)) trigger(obj, key);  // 기록해 둔 구독자를 깨운다
      return result;
    },
  });
}

function track(target: object, key: PropertyKey) {
  if (!activeEffect) return;                          // 이펙트 밖에서 읽으면 추적 안 함
  let deps = targetMap.get(target);
  if (!deps) targetMap.set(target, (deps = new Map()));
  let set = deps.get(key);
  if (!set) deps.set(key, (set = new Set()));
  set.add(activeEffect);
}

function trigger(target: object, key: PropertyKey) {
  targetMap.get(target)?.get(key)?.forEach(effect => effect());
}

function effect(fn: () => void) {
  const run = () => { activeEffect = run; fn(); activeEffect = null; };
  run();                                              // 최초 실행 때 의존성이 수집된다
}
```

**핵심은 `activeEffect`라는 전역 슬롯입니다.** 이펙트를 실행하는 동안 "지금 실행 중인 이펙트"를 전역에 꽂아 두고, 그 사이에 읽히는 모든 속성이 자기 구독자로 그 이펙트를 등록합니다. **의존성을 선언하지 않아도 실행 경로에서 자동으로 수집됩니다.**

React의 의존성 배열이 하려던 일을 런타임이 정확하게 해내는 셈입니다.

### 대가

**1) 구조 분해하면 반응성이 끊깁니다.**

```typescript
const state = reactive({ count: 0 });
const { count } = state;          // 이 순간 원시값이 복사된다 — 더 이상 추적 불가
```

Vue의 `toRefs()`나 `.value`를 쓰는 `ref()`가 존재하는 이유입니다. **Proxy는 객체만 감쌀 수 있고 원시값은 못 감쌉니다.**

**2) 컬렉션과 특수 타입은 별도 처리가 필요합니다.** `Map`, `Set`, `Date`는 내부 슬롯 때문에 단순 `get/set` 가로채기로는 동작하지 않아 핸들러를 따로 써야 합니다.

**3) "언제 추적되는가"가 실행 경로에 달려 있습니다.**

```typescript
effect(() => {
  if (state.showDetail) console.log(state.detail);   // showDetail이 false면 detail은 추적 안 됨
});
```

조건이 바뀌면 의존성 집합도 바뀝니다. 그래서 실제 구현은 이펙트를 재실행할 때마다 **이전 의존성을 정리(cleanup)하고 다시 수집**합니다. 정확하지만 추적 비용이 매 실행마다 듭니다.

---

## 엔진 C — Signal (SolidJS, Preact, Angular, Svelte 5)

### 동작

읽는 행위 자체가 구독입니다.

```typescript
type Computation = { execute: () => void; deps: Set<Set<Computation>> };
let currentComputation: Computation | null = null;

function createSignal<T>(value: T) {
  const subscribers = new Set<Computation>();

  const read = (): T => {
    if (currentComputation) {
      subscribers.add(currentComputation);
      currentComputation.deps.add(subscribers);      // 양방향 링크 (정리를 위해)
    }
    return value;
  };

  const write = (next: T) => {
    if (Object.is(value, next)) return;
    value = next;
    [...subscribers].forEach(c => c.execute());
  };

  return [read, write] as const;
}

function createEffect(fn: () => void) {
  const computation: Computation = {
    deps: new Set(),
    execute() {
      cleanup(computation);                          // 이전 구독 해제
      const prev = currentComputation;
      currentComputation = computation;
      try { fn(); } finally { currentComputation = prev; }
    },
  };
  computation.execute();
}

function cleanup(c: Computation) {
  c.deps.forEach(subs => subs.delete(c));
  c.deps.clear();
}

function createMemo<T>(fn: () => T) {
  const [get, set] = createSignal<T>(undefined as T);
  createEffect(() => set(fn()));                     // fn이 읽는 시그널에 자동 구독
  return get;
}
```

Proxy와 구조가 비슷합니다. 차이는 **감싸는 단위**입니다. Proxy는 객체를 감싸고, Signal은 **값 하나**를 감쌉니다.

### 왜 컴포넌트가 한 번만 실행되는가

Solid의 JSX는 컴파일 타임에 이렇게 변환됩니다.

```jsx
// 작성한 코드
function Counter() {
  const [count, setCount] = createSignal(0);
  return <div>Count: {count()}</div>;
}

// 대략 이렇게 컴파일된다
function Counter() {
  const [count, setCount] = createSignal(0);
  const el = template(`<div>Count: </div>`);
  const textNode = el.firstChild.nextSibling;
  createEffect(() => { textNode.data = count(); });   // 이 텍스트 노드만 구독한다
  return el;
}
```

**컴포넌트 함수는 "DOM을 만들고 이펙트를 배선하는" 설정 코드**입니다. 한 번 실행되고 끝입니다. 이후 `count`가 바뀌면 그 텍스트 노드를 갱신하는 이펙트만 돌아갑니다. 컴포넌트도, 부모도, 형제도 다시 실행되지 않습니다.

그래서 **Solid에는 `useMemo`도 `useCallback`도 의존성 배열도 필요 없습니다.** 함수 본문이 재실행되지 않으니 매 렌더 새 함수가 생기는 문제 자체가 없습니다. 2편에서 본 클로저 함정 대부분이 구조적으로 사라집니다.

### Signal이 푸는 어려운 문제 — glitch

```typescript
const [a, setA] = createSignal(1);
const b = createMemo(() => a() * 2);
const c = createMemo(() => a() + b());     // a와 b 둘 다에 의존
createEffect(() => console.log(c()));
```

`setA(2)`를 호출하면 순진한 구현은 이렇게 됩니다.

1. `a`가 2로 바뀜
2. `c` 구독자 실행 → `a(2) + b(2)` = 4 (`b`가 아직 갱신 전!) ← **일시적으로 잘못된 값**
3. `b` 구독자 실행 → `b`가 4가 됨
4. `c` 다시 실행 → 2 + 4 = 6

2번의 `4`가 **glitch**입니다. 존재하지 않아야 할 중간 상태가 이펙트에 노출됐습니다.

해법은 **위상 정렬(topological sort)** 입니다. 의존 그래프에서 깊이를 계산해 `b`를 `c`보다 먼저 갱신하거나, 갱신을 지연시키고 읽을 때 "내 의존성 중 낡은 게 있나" 확인하는 pull 방식(push-pull 하이브리드)을 씁니다.

> **여기서 볼 것:** 1편에서 Angular 1의 `$digest` 사이클을 이야기했습니다. 같은 문제 영역입니다. 차이는 Angular 1이 **더티 체킹으로 전부 다시 확인하며 안정화될 때까지 반복**했고, Signal은 **정확한 의존 그래프를 알고 있어서 올바른 순서로 정확히 한 번씩 갱신**한다는 것입니다.
>
> 15년 만에 같은 아이디어(세밀한 반응성)가 돌아왔지만, **의존 그래프를 정확히 추적한다**는 조건이 붙으면서 성립하게 됐습니다.

---

## 세 엔진 비교

| | VDOM (React) | Proxy (Vue 3, MobX) | Signal (Solid, Preact) |
|---|---|---|---|
| 갱신 단위 | 컴포넌트 | 이펙트(대개 컴포넌트 렌더) | 값을 읽는 DOM 지점 |
| 의존성 추적 | 안 함 (전부 재실행 후 비교) | 런타임 자동 (속성 단위) | 런타임 자동 (값 단위) |
| 컴포넌트 함수 실행 | 갱신마다 | 갱신마다 | 최초 1회 |
| 메모이제이션 | 수동(→ 컴파일러) | 대체로 불필요 | 불필요 |
| 정신 모델 | 단순 (매번 다시 그린다) | 중간 | 중간 (읽기=구독) |
| 함정 | 리렌더 전파, 클로저 | 구조 분해 시 반응성 소실 | 컴포넌트 밖으로 값 빼낼 때 |
| 비용 | diff 비용 | 추적 비용 + 메모리 | 그래프 유지 비용 |

### React는 왜 Signal로 안 가는가

성능만 보면 Signal이 우세한데도 React가 VDOM을 유지하는 이유는 몇 가지입니다.

**1) 정신 모델의 단순함.** "상태가 바뀌면 함수가 다시 실행된다"는 한 문장이 주는 가치가 큽니다. Signal 모델에서는 "이 코드가 몇 번 실행되는가"를 항상 의식해야 합니다 — 컴포넌트 본문은 한 번, 이펙트는 의존성이 바뀔 때마다, JSX 안의 표현식은 또 별도로.

**2) `count`가 아니라 `count()` 입니다.** 값을 읽는 시점이 곧 구독이라서, 시그널을 그냥 변수처럼 넘기면 반응성이 끊깁니다. 이건 **"함수 컴포넌트는 그냥 함수다"** 라는 React의 약속과 충돌합니다.

**3) 컴파일러 노선을 택했습니다.** React Compiler는 "사람이 단순한 모델로 짜고, 최적화는 기계가 한다"는 방향입니다. 2편 끝에서 말한 것처럼, 의존성 추적은 원래 컴파일 타임에 할 수 있는 일이니까요.

**어느 쪽이 옳다기보다 노선의 차이입니다.** 런타임 그래프로 정확히 추적할 것인가(Signal), 컴파일러로 재실행 범위를 좁힐 것인가(React). 둘 다 "불필요한 일을 안 하겠다"는 같은 목표를 향합니다.

---

## 요약

**1부 — 상태 분류**

| 종류 | 진실의 원천 | 도구 | 판별 질문 |
|---|---|---|---|
| 서버 상태 | 서버 | TanStack Query, RSC | 원본이 서버에 있나? |
| URL 상태 | 주소창 | searchParams | 공유·새로고침에 살아남아야 하나? |
| 폼 상태 | 입력 중인 사용자 | RHF, 비제어 | 지금 타이핑 중인 값인가? |
| 파생 값 | 다른 상태 | 그냥 계산 | 계산할 수 있나? |
| 클라이언트 상태 | 브라우저 메모리 | useState, Zustand | 나머지 |

**2부 — 반응성 엔진**

- **VDOM**은 추적하지 않는 대신 전부 다시 실행하고 비교합니다. 단순한 정신 모델이 대가입니다.
- **Proxy**는 객체 속성 접근을 가로채 자동 추적합니다. 원시값과 구조 분해가 약점입니다.
- **Signal**은 값 단위로 추적하고 DOM 지점이 직접 구독합니다. 가장 정밀하지만 "읽기가 곧 구독"이라는 규칙을 항상 의식해야 합니다.

**관통하는 원리:** 세 엔진 모두 1편의 질문에 답하고 있습니다 — **변경을 어떻게 전파할 것인가.** 차이는 전파 대상을 얼마나 정확히 아느냐이고, 정확도를 올릴수록 추적 비용과 규칙의 복잡도가 함께 올라갑니다.

---

## 다음 편

**6편 — FSD와 의존성 규칙 강제**

지금까지 다섯 편이 "코드를 어떻게 쓰는가"였다면, 다음 편은 **"코드를 어디에 두는가"** 입니다. 폴더 구조 논쟁을 의존성 규칙 논쟁으로 환원하고, FSD의 레이어를 설계한 뒤, ESLint로 그 규칙을 기계 검증 가능하게 만듭니다. 2편의 Rules of Hooks에서 봤던 원리 — **정적 검증기가 없는 규약은 규약이 아니다** — 가 아키텍처 층위에서 반복됩니다.
