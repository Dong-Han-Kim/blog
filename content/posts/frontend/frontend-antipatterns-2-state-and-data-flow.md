---
# 📌 기본 메타데이터
title: '프론트엔드 안티패턴 (2) — 상태와 데이터 흐름: useEffect는 왜 계속 오용되는가'
date: '2026-09-14'
category: 'frontend'
tags: ['React', 'useEffect', 'State Management', 'Anti-Pattern', 'Hooks']
description: 'useEffect의 네 가지 오용을 해부하고, 왜 사람들이 계속 그렇게 쓰게 되는지 밝힌다. 파생 상태, props를 state로 복사, 성급한 전역화, boolean 상태 머신까지.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 안티패턴'
seriesOrder: 2

# 📚 SEO용
keywords: ['React', 'useEffect', 'State Management', 'Anti-Pattern', 'Hooks', '프론트엔드 안티패턴']
---

# 프론트엔드 안티패턴 (2) — 상태와 데이터 흐름

이 영역이 첫 번째인 이유는 단순합니다. **피해가 가장 크고, 가장 흔하고, 가장 되돌리기 어렵기 때문**입니다.

렌더링 성능 문제는 나중에 고칠 수 있습니다. CSS는 다시 쓸 수 있습니다. 하지만 상태 구조가 잘못되면 그 위에 올라간 모든 컴포넌트가 그 구조를 전제로 짜입니다. 1편의 분류로 말하면 **일방통행 문에 가깝습니다.**

---

## useEffect의 정체

시작점부터 바로잡아야 합니다. 많은 사람이 `useEffect`를 이렇게 이해합니다.

> ❌ "값이 바뀌면 뭔가를 실행하는 훅"

이 이해가 이 편에서 다룰 모든 안티패턴의 뿌리입니다. 정확한 정의는 이렇습니다.

> ✅ **컴포넌트를 React 바깥의 시스템과 동기화하는 탈출구(escape hatch)**

"바깥의 시스템"이란 React가 관리하지 않는 모든 것입니다. DOM API, 브라우저 이벤트, 타이머, 네트워크, 웹소켓, 서드파티 위젯, `localStorage`.

**React 안에서 끝나는 일에 `useEffect`를 쓰면 거의 언제나 오용입니다.**

### 판별 질문 하나

새 `useEffect`를 쓰기 전에 이걸 물으세요.

> **이 코드가 실행되어야 하는 이유가 무엇인가?**

- **"사용자가 뭘 해서"** → 이벤트 핸들러입니다
- **"다른 값에서 계산되니까"** → 그냥 렌더 중에 계산하세요
- **"화면에 나타났기 때문에"** → 이게 진짜 이펙트입니다
- **"바깥 시스템이 변했기 때문에"** → 이것도 진짜 이펙트입니다

뒤의 두 개가 아니면 `useEffect`가 답이 아닙니다.

---

## 오용 1 — 파생 상태를 이펙트로 계산하기

### 안티패턴

```typescript
function OrderSummary({ items }: { items: Item[] }) {
  const [total, setTotal] = useState(0);
  const [discounted, setDiscounted] = useState(0);
  const [isEligible, setEligible] = useState(false);

  useEffect(() => {
    setTotal(items.reduce((s, i) => s + i.price * i.qty, 0));
  }, [items]);

  useEffect(() => {
    setDiscounted(total * 0.9);
  }, [total]);

  useEffect(() => {
    setEligible(discounted >= 50000);
  }, [discounted]);

  return <Summary total={total} discounted={discounted} free={isEligible} />;
}
```

### 무엇이 잘못됐나

**1) 렌더가 네 번 돕니다.** 첫 렌더에서 `total`은 0, 두 번째에서 계산됨, 세 번째에서 `discounted` 계산됨, 네 번째에서 `isEligible`. **이펙트 체인이 길수록 중간 상태가 화면에 노출됩니다.** 사용자는 "0원"이 잠깐 보였다가 바뀌는 걸 봅니다.

**2) 상태가 네 개라 어긋날 수 있습니다.** `items`가 바뀌었는데 어떤 경로로 `total`만 갱신되고 `discounted`가 안 되는 상황이 논리적으로 가능합니다. 그리고 가능한 일은 언젠가 일어납니다.

**3) 디버깅이 불가능해집니다.** "왜 할인가가 이상하지?"의 답을 찾으려면 세 개의 이펙트와 세 개의 상태를 동시에 추적해야 합니다.

### 정상

```typescript
function OrderSummary({ items }: { items: Item[] }) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discounted = total * 0.9;
  const isEligible = discounted >= 50000;

  return <Summary total={total} discounted={discounted} free={isEligible} />;
}
```

**상태 0개, 이펙트 0개, 렌더 1회.** 그리고 이 세 값은 **구조적으로 어긋날 수 없습니다.**

### "계산이 비싸면 어떻게 하나요"

먼저 **정말 비싼지 측정하세요.** 배열 1,000개를 `reduce`하는 건 1ms도 안 걸립니다. 비싸다는 건 보통 수만 건 정렬, 복잡한 트리 순회, 큰 문자열 파싱 정도입니다.

진짜 비싸면 `useMemo`입니다 — 상태가 아니라 **캐시**입니다.

```typescript
const sortedRows = useMemo(
  () => rows.slice().sort(comparator),   // 50,000건
  [rows, comparator]
);
```

**`useMemo`와 `useState` + `useEffect`의 차이가 중요합니다.** `useMemo`는 렌더 중에 계산이 끝나므로 중간 상태가 없습니다. 이펙트 방식은 렌더가 끝난 뒤에 계산하므로 반드시 한 프레임 동안 틀린 값이 보입니다.

---

## 오용 2 — 이벤트 핸들러에 있어야 할 로직

### 안티패턴

```typescript
const [submitted, setSubmitted] = useState(false);

useEffect(() => {
  if (submitted) {
    toast.success('저장되었습니다');
    analytics.track('order_created');
    router.push('/orders');
  }
}, [submitted]);

async function handleSubmit() {
  await saveOrder(data);
  setSubmitted(true);   // 이펙트를 "발사"하기 위한 상태
}
```

`submitted`는 **상태가 아니라 신호**입니다. 화면에 표현되는 어떤 것도 아니고, 오직 이펙트를 트리거하기 위해 존재합니다.

### 무엇이 잘못됐나

- 두 번 제출하면 `submitted`가 이미 `true`라 이펙트가 안 돕니다
- Strict Mode에서 이펙트가 두 번 실행되면 토스트가 두 번 뜨고 이벤트도 두 번 기록됩니다
- 저장 성공과 후속 동작 사이에 한 프레임의 틈이 생깁니다
- 실패 경로가 어디인지 코드에서 안 보입니다

### 정상

```typescript
async function handleSubmit() {
  try {
    await saveOrder(data);
    toast.success('저장되었습니다');
    analytics.track('order_created');
    router.push('/orders');
  } catch (e) {
    toast.error('저장에 실패했습니다');
  }
}
```

**인과관계가 코드에 그대로 보입니다.** 성공하면 이것, 실패하면 저것. 상태 하나가 사라졌고 이펙트가 사라졌습니다.

---

## 오용 3 — 부모에게 상태 밀어 올리기

### 안티패턴

```typescript
function Filter({ onChange }: { onChange: (v: FilterValue) => void }) {
  const [value, setValue] = useState<FilterValue>(initial);

  useEffect(() => {
    onChange(value);     // 자식 상태를 이펙트로 부모에 통보
  }, [value, onChange]);

  return <input value={value.q} onChange={e => setValue({ ...value, q: e.target.value })} />;
}
```

### 무엇이 잘못됐나

**1) 한 프레임 늦습니다.** 자식이 렌더되고, 커밋되고, 그 다음에 부모가 안다는 것을 알고, 부모가 다시 렌더됩니다.

**2) 진동할 수 있습니다.** 부모가 `onChange`를 받아 자기 상태를 바꾸고, 그게 `Filter`에 다시 내려오면 순환이 생깁니다.

**3) `onChange`가 인라인 함수면 무한 루프입니다.** 매 렌더 새 참조 → 이펙트 재실행 → 부모 리렌더 → 또 새 함수. 이걸 피하려고 의존성 배열에서 `onChange`를 빼면 이번엔 낡은 클로저를 붙잡습니다.

### 정상 — 두 갈래

**(a) 상태를 부모가 소유한다 (가장 단순)**

```typescript
function Filter({ value, onChange }: { value: FilterValue; onChange: (v: FilterValue) => void }) {
  return <input value={value.q} onChange={e => onChange({ ...value, q: e.target.value })} />;
}
```

**(b) 자식이 소유하되, 변경 시점에 직접 알린다**

```typescript
function Filter({ defaultValue, onChange }: FilterProps) {
  const [value, setValue] = useState(defaultValue);

  function update(next: FilterValue) {
    setValue(next);
    onChange(next);      // 같은 이벤트 안에서 함께 처리
  }

  return <input value={value.q} onChange={e => update({ ...value, q: e.target.value })} />;
}
```

제어/비제어를 동시에 지원해야 한다면 이 둘을 합친 `useControllableState` 패턴이 표준 해법입니다.

---

## 오용 4 — 데이터 페칭

### 안티패턴과 그 실제 결과

```typescript
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(setUser);
  }, [userId]);
  // ...
}
```

이 코드에는 결함이 최소 다섯 개 있습니다.

**1) 경쟁 상태(race condition).** 사용자가 A를 클릭하고 바로 B를 클릭하면 요청이 두 개 나갑니다. A의 응답이 느려서 나중에 도착하면, **화면은 B인데 데이터는 A입니다.** 그리고 이 버그는 개발자의 빠른 네트워크에서는 재현되지 않습니다.

```typescript
// 최소한의 수정
useEffect(() => {
  let ignore = false;
  fetch(`/api/users/${userId}`)
    .then(r => r.json())
    .then(data => { if (!ignore) setUser(data); });
  return () => { ignore = true; };
}, [userId]);
```

**2) 에러 처리 없음.** 네트워크가 실패하면 `user`는 영원히 `null`이고 로딩 스피너가 영원히 돕니다.

**3) HTTP 에러를 성공으로 처리.** `fetch`는 404나 500에서 reject하지 않습니다. `r.json()`이 HTML 에러 페이지를 파싱하려다 실패합니다.

**4) 로딩 상태 없음.** `user === null`이 "로딩 중"인지 "없음"인지 구분되지 않습니다.

**5) 워터폴.** 자식 컴포넌트가 렌더되어야 자기 요청을 시작합니다. 5편에서 다룹니다.

### 정상

```typescript
const { data: user, isPending, error } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => api.getUser(userId),
});
```

경쟁 상태, 취소, 중복 제거, 캐싱, 재시도, 에러 상태가 전부 처리됩니다. **직접 짜야 할 이유가 거의 없습니다.**

서버 컴포넌트를 쓸 수 있다면 더 간단합니다.

```tsx
async function UserProfile({ userId }: { userId: string }) {
  const user = await api.getUser(userId);   // 경쟁 상태 자체가 존재하지 않음
  return <Profile user={user} />;
}
```

---

## 그럼 언제 useEffect가 맞나

목록이 짧습니다. 이게 정상입니다.

```typescript
// 1. 브라우저 이벤트 구독
useEffect(() => {
  const onResize = () => setWidth(window.innerWidth);
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, []);

// 2. 서드파티 명령형 라이브러리
useEffect(() => {
  const map = new MapLibrary(ref.current!);
  return () => map.destroy();
}, []);

// 3. 타이머
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}, []);

// 4. 외부 스토어 동기화 (가능하면 useSyncExternalStore를 쓰는 게 낫다)
// 5. 문서 제목, 포커스 이동 같은 명령형 DOM 조작
```

**공통점: 전부 React가 모르는 세계와의 연결입니다.**

---

## props를 state로 복사하기

파생 상태의 가장 흔한 변종이고, 별도로 다룰 가치가 있습니다.

### 안티패턴

```typescript
function EditForm({ user }: { user: User }) {
  const [name, setName] = useState(user.name);   // 초기값으로만 쓰임

  // user가 바뀌어도 name은 그대로다 → 버그
}
```

그래서 이걸 붙입니다.

```typescript
useEffect(() => { setName(user.name); }, [user.name]);   // 동기화 이펙트
```

**이제 사용자가 입력하던 중에 백그라운드 refetch가 일어나면 입력값이 날아갑니다.** 그리고 이 버그는 재현이 어렵습니다.

### 정상 — 세 가지 선택

**(a) 정말 파생이면 계산하세요.**

```typescript
const displayName = user.nickname ?? user.name;   // 상태 아님
```

**(b) "초기값"이 의도라면 `key`로 리셋하세요.**

```tsx
// 부모에서
<EditForm key={user.id} user={user} />
```

`key`가 바뀌면 React가 컴포넌트를 새로 마운트하므로 **모든 내부 상태가 초기화됩니다.** 이펙트 동기화보다 훨씬 명확하고, "어떤 조건에서 폼을 초기화할 것인가"가 한 줄로 표현됩니다.

**(c) 편집 중 상태와 원본을 명시적으로 분리하세요.**

```typescript
type Draft = { base: User; changes: Partial<User> };
// 원본과 변경분이 각자의 자리를 갖는다
```

편집 화면에서 "변경사항이 있습니다" 배지나 취소 기능이 필요하다면 (c)가 유일한 정답입니다.

---

## 성급한 전역화

### 안티패턴의 발생 경로

1. prop을 세 단계 내려보내는 게 번거롭다
2. Context를 만든다
3. 편하니까 다른 값도 넣는다
4. 6개월 뒤 `AppContext`에 스무 개 값이 들어있다
5. 아무 값이나 하나 바뀌면 **모든 소비자가 리렌더된다**

React Context는 **선택적 구독을 지원하지 않습니다.** `value` 객체의 참조가 바뀌면 `useContext`를 호출한 모든 컴포넌트가 리렌더됩니다. 그중 그 값을 안 쓰는 컴포넌트도 포함입니다.

### prop drilling에 대한 오해

**세 단계 drilling은 문제가 아닙니다.** 오히려 장점이 있습니다.

- 데이터 흐름이 코드에 그대로 보입니다
- 어떤 컴포넌트가 무엇에 의존하는지 타입으로 드러납니다
- 리팩터링할 때 컴파일러가 잡아줍니다

문제가 되는 건 **다섯 단계 이상**, 그리고 **중간 컴포넌트들이 그 값을 쓰지도 않으면서 전달만 할 때**입니다.

### 해법 1 — 합성으로 없앤다 (첫 번째로 시도할 것)

```tsx
// Before — Layout이 user를 3단계 내려보낸다
<Layout user={user} />
  <Sidebar user={user} />
    <UserPanel user={user} />

// After — 다 만들어서 넣는다. Layout은 user를 모른다
<Layout sidebar={<UserPanel user={user} />} />
```

**drilling의 상당수는 상태 문제가 아니라 구조 문제입니다.** children이나 슬롯으로 넘기면 중간 계층이 그 값을 알 필요가 없어집니다.

### 해법 2 — Context를 쪼갠다

합성으로 안 되면 Context를 쓰되, **변경 주기가 다른 것을 같은 Context에 넣지 마세요.**

```typescript
// 안티패턴 — 하나에 다 넣음
<AppContext.Provider value={{ user, theme, cart, notifications, ... }}>

// 정상 — 변경 주기별로 분리
<ThemeContext.Provider value={theme}>            {/* 거의 안 바뀜 */}
  <UserContext.Provider value={user}>            {/* 로그인 시에만 */}
    <CartContext.Provider value={cart}>          {/* 자주 바뀜 */}
```

**값과 디스패처를 분리하는 것도 효과적입니다.**

```tsx
// 값은 자주 바뀌지만 디스패처는 안 바뀐다
<CartStateContext.Provider value={cart}>
  <CartDispatchContext.Provider value={dispatch}>
```

`dispatch`만 쓰는 컴포넌트(추가 버튼 등)는 장바구니가 바뀌어도 리렌더되지 않습니다.

### 해법 3 — 외부 스토어

선택적 구독이 필요하면 Context가 아니라 외부 스토어입니다.

```typescript
const count = useCart(s => s.items.length);   // 이 값이 바뀔 때만 리렌더
```

**판단 기준:** Context는 **의존성 주입**(거의 안 바뀌는 것을 트리 아래로 전달), 외부 스토어는 **상태 공유**(자주 바뀌고 일부만 구독).

---

## boolean 네 개로 만든 상태 머신

### 안티패턴

```typescript
const [isLoading, setLoading] = useState(false);
const [isError, setError] = useState(false);
const [isSuccess, setSuccess] = useState(false);
const [isEmpty, setEmpty] = useState(false);
const [data, setData] = useState<Row[] | null>(null);
```

**조합이 16가지인데 유효한 건 4가지입니다.** 나머지 12가지는 전부 버그이고, 언젠가 전부 발생합니다.

그리고 이런 코드가 따라옵니다.

```tsx
{isLoading && !isError && <Spinner />}
{!isLoading && isError && <ErrorView />}
{!isLoading && !isError && isSuccess && data && data.length > 0 && <Table rows={data} />}
{!isLoading && !isError && isSuccess && isEmpty && <Empty />}
```

조건 하나를 추가할 때마다 **모든 분기를 다시 검토**해야 합니다.

### 정상 — 판별 유니온

```typescript
type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'success'; data: T };

const [state, setState] = useState<LoadState<Row[]>>({ status: 'idle' });
```

```tsx
switch (state.status) {
  case 'idle':    return null;
  case 'loading': return <Spinner />;
  case 'error':   return <ErrorView error={state.error} />;   // error 접근 가능
  case 'success': return state.data.length
    ? <Table rows={state.data} />                             // data 접근 가능
    : <Empty />;
}
```

**얻는 것:**

- 불가능한 상태가 **표현 불가능**해집니다
- `data`는 `success`일 때만 존재한다고 타입이 보장합니다 — `data!`나 `data?.` 가 사라집니다
- `switch`에 `case`를 빠뜨리면 TypeScript가 잡습니다(`noImplicitReturns`, exhaustiveness check)

```typescript
// 빠짐없음 검사
function assertNever(x: never): never {
  throw new Error(`처리되지 않은 상태: ${JSON.stringify(x)}`);
}
// switch 끝에: default: return assertNever(state);
```

> 범용 코드 스멜 중 **Primitive Obsession**이 프론트엔드에서 나타나는 대표적 형태가 이겁니다. 원시 타입(boolean)으로 도메인 개념(로딩 상태)을 표현하려다 실패한 것이죠.

---

## 문자열로 쓰는 ID와 날짜

Primitive Obsession의 다른 변종입니다.

```typescript
// 안티패턴 — 전부 string이라 서로 바꿔 넣어도 컴파일된다
function transfer(fromUserId: string, toUserId: string, orderId: string) {}
transfer(orderId, fromUserId, toUserId);   // ✅ 컴파일 통과, 런타임 재앙
```

```typescript
// 정상 — branded type
type Brand<T, B extends string> = T & { readonly __brand: B };
type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

const asUserId = (s: string) => s as UserId;

function transfer(from: UserId, to: UserId, order: OrderId) {}
transfer(orderId, fromUserId, toUserId);   // ❌ 컴파일 에러
```

런타임 비용이 **0**입니다. 타입만 존재하고 컴파일되면 사라집니다.

날짜도 마찬가지입니다. `"2026-09-14"`와 `"2026-09-14T00:00:00Z"`와 `1757808000000`이 전부 프로젝트 안에 섞여 있으면, 어느 함수가 뭘 기대하는지 호출부에서 알 수 없습니다. **경계에서 한 번 파싱하고, 안쪽에서는 하나의 타입만 쓰세요.**

---

## 자식이 부모 상태를 캐묻는 구조

범용 스멜 **Feature Envy**의 프론트엔드 변형입니다.

```tsx
// 안티패턴 — 자식이 부모 데이터를 받아서 판단을 대신한다
function OrderRow({ order, allOrders, currentUser, permissions, settings }) {
  const isLast = allOrders[allOrders.length - 1].id === order.id;
  const canEdit = permissions.some(p => p.resource === 'order' && p.action === 'edit')
    && (order.ownerId === currentUser.id || currentUser.role === 'admin')
    && settings.editingEnabled;
  // ...
}
```

이 컴포넌트는 자기 데이터보다 **남의 데이터에 더 관심이 많습니다.** 그래서 prop이 다섯 개고, 테스트하려면 다섯 개를 다 만들어야 하고, 권한 규칙이 바뀌면 모든 행 컴포넌트를 고쳐야 합니다.

```tsx
// 정상 — 판단은 소유자가, 자식은 결과만 받는다
function OrderRow({ order, canEdit, isLast }: OrderRowProps) { /* ... */ }

// 부모에서
{orders.map((order, i) => (
  <OrderRow
    key={order.id}
    order={order}
    canEdit={canEditOrder(order, currentUser, permissions, settings)}
    isLast={i === orders.length - 1}
  />
))}
```

**`canEditOrder`는 순수 함수라 단독으로 테스트할 수 있고, 규칙이 바뀌면 한 곳만 고칩니다.**

---

## 상태를 너무 높이 올리기

"lift state up"은 좋은 조언이지만 과하게 적용되는 경우가 많습니다.

```tsx
// 안티패턴 — 모달 하나의 열림 상태가 최상단에
function App() {
  const [isOrderModalOpen, setOrderModalOpen] = useState(false);
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  // ... 이 상태들이 20개쯤 쌓인다
}
```

모달 하나 열고 닫을 때마다 **앱 전체가 리렌더됩니다.**

**규칙: 상태는 그것을 필요로 하는 컴포넌트들의 가장 가까운 공통 조상에 둡니다.** "가장 가까운"이 핵심입니다. 그리고 **혼자만 쓰는 상태는 올리지 마세요.**

역으로 **너무 내리는 것**도 문제입니다. 두 형제가 같은 값을 각자 `useState`로 들고 있으면 동기화 버그가 생깁니다. 1편의 단일 소유권 문제죠.

---

## 요약

| 안티패턴 | 왜 그렇게 되는가 | 정상 |
|---|---|---|
| 파생 상태를 이펙트로 | "값이 바뀌면 실행" 멘탈 모델 | 렌더 중에 계산 |
| 이벤트 로직을 이펙트로 | 신호용 boolean 상태 | 핸들러 안에서 순차 실행 |
| 부모에 이펙트로 통보 | 자식이 상태를 소유하고 싶음 | 소유권을 올리거나 같은 이벤트에서 알림 |
| 이펙트로 데이터 페칭 | 표준 도구를 안 씀 | 서버 상태 도구 / 서버 컴포넌트 |
| props를 state로 복사 | 초기값이 필요해서 | 계산하거나 `key`로 리셋 |
| 성급한 Context 전역화 | prop drilling 회피 | 합성 → Context 분리 → 외부 스토어 |
| boolean 상태 머신 | 상태가 하나씩 추가됨 | 판별 유니온 |
| string ID/날짜 | 처음엔 하나뿐이었음 | branded type, 경계에서 파싱 |
| 자식이 부모 데이터 캐묻기 | prop 하나 추가가 쉬워서 | 판단은 소유자가, 결과만 전달 |

**관통하는 원리 세 개**

1. **저장할 수 있으면 계산하라.** 상태가 하나 늘면 어긋날 수 있는 쌍이 하나 늘어납니다.
2. **인과관계를 코드에 드러내라.** 이펙트 체인은 인과를 감춥니다. 이벤트 핸들러는 드러냅니다.
3. **불가능한 상태를 표현 불가능하게 만들어라.** 타입이 막아주면 테스트가 필요 없습니다.

---

## 다음 편

**3편 — 컴포넌트 설계의 안티패턴**

성급한 추상화가 왜 중복보다 비싼지, 컴포넌트 안에서 컴포넌트를 정의하면 무슨 일이 일어나는지(입력값이 사라지는 그 버그), `key={index}`가 만드는 정체성 혼란, 그리고 700줄짜리 페이지 컴포넌트를 쪼개는 순서를 다룹니다.
