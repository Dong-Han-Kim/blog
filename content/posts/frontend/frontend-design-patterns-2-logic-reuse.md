---
# 📌 기본 메타데이터
title: '프론트엔드 디자인 패턴 (2) — 로직 재사용의 진화: Mixin에서 Hooks까지'
date: '2026-09-14'
category: 'frontend'
tags: ['React', 'Hooks', 'HOC', 'Render Props', 'Design Pattern']
description: '하나의 요구사항을 Mixin, HOC, Render Props, Hooks 네 가지로 직접 리팩터링하며 각 전환의 이유를 체감한다. Hooks 내부의 연결 리스트와 의존성 배열의 정체까지.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 디자인 패턴'
seriesOrder: 2

# 📚 SEO용
keywords: ['React', 'Hooks', 'HOC', 'Render Props', 'Design Pattern', '프론트엔드 디자인 패턴']
---

# 프론트엔드 디자인 패턴 (2) — 로직 재사용의 진화

1편에서 "상태를 가진 로직을 어떻게 재사용하는가"가 프론트엔드 고유 패턴의 본진이라고 했습니다. 이번 편은 그 주장을 코드로 증명합니다.

방법은 이렇습니다. **하나의 요구사항을 네 번 구현합니다.** 2013년 방식부터 2019년 방식까지. 그리고 매번 "이전 방식의 무엇이 아파서 이렇게 바뀌었는가"를 짚습니다.

---

## 요구사항 정하기

데이터 페칭을 예제로 씁니다. 실제로 이 문제가 네 패턴 전부를 거쳐온 정확한 사례이기 때문입니다. Backbone의 믹스인, Redux의 `connect`, Apollo의 `<Query>`, 그리고 TanStack Query의 `useQuery` — 같은 문제에 대한 네 시대의 답입니다.

요구사항:

1. URL을 받아 데이터를 가져온다
2. `loading`, `error`, `data` 세 상태를 관리한다
3. URL이 바뀌면 다시 가져온다
4. 언마운트되거나 URL이 바뀌면 이전 요청을 취소한다
5. **여러 컴포넌트에서 재사용 가능해야 한다**

5번이 핵심입니다. 1~4번만이면 컴포넌트 안에 그냥 쓰면 됩니다. 재사용 요구가 붙는 순간 "이 로직을 어디에 담을 것인가"라는 문제가 생기고, 그게 이 편의 전부입니다.

---

## 1차 시도 — Mixin (2013)

```javascript
const FetchMixin = {
  getInitialState() {
    return { data: null, loading: true, error: null };
  },

  componentDidMount() {
    this._fetch(this.props.url);
  },

  componentDidUpdate(prevProps) {
    if (prevProps.url !== this.props.url) {
      this._abort();
      this._fetch(this.props.url);
    }
  },

  componentWillUnmount() {
    this._abort();
  },

  _abort() {
    if (this._controller) this._controller.abort();
  },

  _fetch(url) {
    this._controller = new AbortController();
    this.setState({ loading: true, error: null });

    fetch(url, { signal: this._controller.signal })
      .then(r => r.json())
      .then(data => this.setState({ data, loading: false }))
      .catch(error => {
        if (error.name !== 'AbortError') {
          this.setState({ error, loading: false });
        }
      });
  }
};

const UserProfile = React.createClass({
  mixins: [FetchMixin],
  render() {
    const { data, loading, error } = this.state;
    if (loading) return <Spinner />;
    if (error) return <ErrorView error={error} />;
    return <Profile user={data} />;
  }
});
```

동작합니다. 그리고 꽤 깔끔해 보입니다. 문제는 **두 번째 믹스인을 붙이는 순간** 드러납니다.

```javascript
const PollingMixin = {
  getInitialState() {
    return { lastPolledAt: null };     // ← FetchMixin의 getInitialState와 병합된다
  },
  componentDidMount() {
    this._timer = setInterval(this.tick, 5000);   // ← 둘 다 componentDidMount를 가진다
  },
  componentWillUnmount() {
    clearInterval(this._timer);
  },
  tick() { this._fetch(this.props.url); }        // ← FetchMixin의 내부 메서드에 의존
};

React.createClass({ mixins: [FetchMixin, PollingMixin] });
```

여기서 세 가지가 동시에 무너집니다.

**첫째, 생명주기는 병합되지만 나머지는 충돌합니다.** React는 `componentDidMount` 같은 생명주기 메서드는 순서대로 전부 호출해 줍니다. 하지만 `_fetch` 같은 일반 메서드가 겹치면 **런타임 에러**를 던집니다. 두 믹스인이 우연히 같은 헬퍼 이름을 쓰면 그 조합은 존재할 수 없게 됩니다.

**둘째, 암묵적 의존성입니다.** `PollingMixin.tick()`은 `this._fetch`를 호출합니다. 이건 `FetchMixin` 없이는 동작하지 않는데, 코드 어디에도 그 의존이 적혀 있지 않습니다. `mixins: [PollingMixin]`만 쓰면 런타임에 터집니다.

**셋째, 출처 불명입니다.** `this.state.data`를 봤을 때 어느 믹스인이 넣은 건지 알 방법이 없습니다. 믹스인 파일을 전부 열어서 grep해야 합니다.

> **병폐의 정체:** 믹스인은 **네임스페이스를 병합**합니다. 병합은 결합이 아니라 충돌입니다. N개를 조합하면 충돌 가능성이 N² 로 늘어납니다.

---

## 2차 시도 — HOC (2015)

함수형 사고가 답을 줍니다. 병합하지 말고 **감싸자**.

```typescript
type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
};

function withFetch<T, P extends object>(
  getUrl: (props: P) => string
) {
  return function (Wrapped: React.ComponentType<P & FetchState<T>>) {
    return class WithFetch extends React.Component<P, FetchState<T>> {
      static displayName = `withFetch(${Wrapped.displayName ?? Wrapped.name})`;
      state: FetchState<T> = { data: null, loading: true, error: null };
      private controller?: AbortController;

      componentDidMount() { this.load(); }

      componentDidUpdate(prev: P) {
        if (getUrl(prev) !== getUrl(this.props)) this.load();
      }

      componentWillUnmount() { this.controller?.abort(); }

      private load() {
        this.controller?.abort();
        this.controller = new AbortController();
        this.setState({ loading: true, error: null });

        fetch(getUrl(this.props), { signal: this.controller.signal })
          .then(r => r.json())
          .then((data: T) => this.setState({ data, loading: false }))
          .catch((error: Error) => {
            if (error.name !== 'AbortError') this.setState({ error, loading: false });
          });
      }

      render() {
        return <Wrapped {...this.props} {...this.state} />;
      }
    };
  };
}

// 사용
const UserProfile = withFetch<User, { userId: string }>(
  p => `/api/users/${p.userId}`
)(({ data, loading, error }) => {
  if (loading) return <Spinner />;
  if (error) return <ErrorView error={error} />;
  return <Profile user={data!} />;
});
```

**개선된 것:**

- 이름 충돌이 사라졌습니다. 각 HOC는 자기 클래스 스코프 안에서 삽니다.
- 합성이 명시적입니다. `withFetch(...)(Component)` — 함수 합성이니까요.
- `displayName`을 설정하면 DevTools에서 어떤 HOC인지 보입니다.

**여전히 아픈 것:**

**1) Wrapper Hell.** 실무에서는 이렇게 됩니다.

```typescript
export default withRouter(
  connect(mapStateToProps, mapDispatchToProps)(
    withTheme(
      withTranslation()(
        withErrorBoundary(UserProfile)
      )
    )
  )
);
```

DevTools 트리를 열면 실제 컴포넌트 하나에 래퍼가 다섯 겹 쌓여 있습니다. 각 래퍼는 실제 React 엘리먼트이고, 각각 렌더링 비용과 리렌더 전파를 만듭니다.

**2) Prop 출처 불명 — 믹스인 문제의 재발.**

```typescript
function UserProfile({ data, loading, error, t, theme, history, dispatch }) {
  // t는? theme는? history는? 각각 어느 HOC에서 온 건가?
}
```

믹스인은 `this.x`의 출처를 몰랐고, HOC는 `props.x`의 출처를 모릅니다. **주입 방식이 암묵적이면 계층을 바꿔도 같은 병이 재발합니다.**

**3) 타입이 지옥입니다.**

HOC의 정확한 타입은 "P를 받는 컴포넌트에 FetchState를 주입하고, 바깥에는 P만 남긴다"입니다. 이걸 TypeScript로 쓰면:

```typescript
type Omit2<T, K> = Pick<T, Exclude<keyof T, K>>;
declare function withFetch<T, P extends FetchState<T>>(
  C: React.ComponentType<P>
): React.ComponentType<Omit2<P, keyof FetchState<T>>>;
```

두 개만 합성해도 타입 추론이 무너집니다. `connect`의 타입 정의가 수백 줄인 이유가 이겁니다.

**4) ref와 정적 멤버가 안 뚫립니다.**

`<UserProfile ref={r} />`의 ref는 래퍼에 붙습니다. `React.forwardRef`로 수동 전달해야 하고, `Wrapped.someStatic`은 사라져서 `hoist-non-react-statics` 같은 라이브러리를 써야 합니다.

---

## 3차 시도 — Render Props (2017)

출처 불명이 문제라면, **주입을 눈에 보이게** 하면 됩니다.

```tsx
type FetchProps<T> = {
  url: string;
  children: (state: FetchState<T>) => React.ReactNode;
};

class Fetch<T> extends React.Component<FetchProps<T>, FetchState<T>> {
  state: FetchState<T> = { data: null, loading: true, error: null };
  private controller?: AbortController;

  componentDidMount() { this.load(); }
  componentDidUpdate(prev: FetchProps<T>) {
    if (prev.url !== this.props.url) this.load();
  }
  componentWillUnmount() { this.controller?.abort(); }

  private load() { /* 위와 동일 */ }

  render() {
    return this.props.children(this.state);
  }
}

// 사용
<Fetch<User> url={`/api/users/${userId}`}>
  {({ data, loading, error }) => {
    if (loading) return <Spinner />;
    if (error) return <ErrorView error={error} />;
    return <Profile user={data!} />;
  }}
</Fetch>
```

**결정적 개선:** `data`, `loading`, `error`가 **어디서 왔는지 코드에 그대로 보입니다.** 이름도 내가 정할 수 있습니다(`{({ data: user }) => ...}`). 타입 추론도 자연스럽습니다 — 그냥 함수 인자니까요.

Apollo Client의 `<Query>`, Formik, React Motion, Downshift가 전부 이 시대의 산물입니다.

**하지만 합성하면:**

```tsx
<Auth>
  {(user) => (
    <Fetch url={`/api/users/${user.id}/posts`}>
      {({ data: posts, loading: postsLoading }) => (
        <Fetch url={`/api/users/${user.id}/settings`}>
          {({ data: settings }) => (
            <Theme>
              {(theme) => (
                <Profile user={user} posts={posts} settings={settings} theme={theme} />
              )}
            </Theme>
          )}
        </Fetch>
      )}
    </Theme>
  )}
</Auth>
```

**콜백 지옥의 JSX 버전입니다.** 게다가 이 중첩이 전부 실제 컴포넌트 트리에 존재하고, 매 렌더마다 새 화살표 함수가 만들어져서 자식이 `React.memo`여도 소용이 없습니다.

---

## 여기서 멈춰서 생각해 보기

HOC와 Render Props를 나란히 놓고 **공통점**을 찾아봅시다.

| | 주입 방식 | 트리에 미치는 영향 |
|---|---|---|
| Mixin | 네임스페이스 병합 | 없음 |
| HOC | 컴포넌트를 감싸서 prop 주입 | **계층 +1** |
| Render Props | 컴포넌트 안에서 함수 호출 | **계층 +1** |

HOC와 Render Props는 **로직을 주입하기 위해 컴포넌트 트리를 변형합니다.** 재사용할 로직이 늘어날수록 트리가 깊어집니다. 이게 두 패턴이 공유한 근본 한계입니다.

역설적이게도 **믹스인은 이 문제가 없었습니다.** 믹스인은 트리를 건드리지 않았죠. 믹스인이 실패한 건 "트리를 안 건드린다"는 방향이 틀려서가 아니라, **병합이라는 수단이 틀렸기 때문**입니다.

그러면 이렇게 물어야 합니다.

> **트리를 건드리지 않으면서, 병합이 아닌 방법으로 상태 있는 로직을 주입할 수 없을까?**

---

## 4차 시도 — Hooks (2019)

```typescript
function useFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null, loading: true, error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState(s => ({ ...s, loading: true, error: null }));

    fetch(url, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: T) => setState({ data, loading: false, error: null }))
      .catch((error: Error) => {
        if (error.name === 'AbortError') return;
        setState({ data: null, loading: false, error });
      });

    return () => controller.abort();     // 정리(cleanup)가 선언 바로 옆에 있다
  }, [url]);

  return state;
}
```

사용하는 쪽:

```tsx
function UserProfile({ userId }: { userId: string }) {
  const user = useAuth();
  const { data: posts, loading } = useFetch<Post[]>(`/api/users/${userId}/posts`);
  const { data: settings } = useFetch<Settings>(`/api/users/${userId}/settings`);
  const theme = useTheme();

  if (loading) return <Spinner />;
  return <Profile user={user} posts={posts} settings={settings} theme={theme} />;
}
```

**네 개의 로직을 가져왔는데 트리 깊이는 0만큼 늘어났습니다.**

Hooks가 해결한 것을 정리하면:

| 문제 | Mixin | HOC | Render Props | Hooks |
|---|---|---|---|---|
| 이름 충돌 | ❌ | ✅ | ✅ | ✅ |
| 출처 명시 | ❌ | ❌ | ✅ | ✅ |
| 트리 오염 없음 | ✅ | ❌ | ❌ | ✅ |
| 타입 추론 | ❌ | ❌ | ✅ | ✅ |
| 조건부 사용 | ✅ | ✅ | ✅ | ❌ |
| 정리 코드 응집 | ❌ | ❌ | ❌ | ✅ |

마지막 두 줄이 중요합니다. Hooks는 **조건부 사용을 포기했고**, 대신 **설정과 정리(setup/cleanup)를 한 곳에 모으는 것**을 얻었습니다. 클래스 시절에는 `componentDidMount`에서 구독하고 `componentWillUnmount`에서 해제하느라 관련 코드가 파일의 양 끝에 흩어져 있었습니다. `useEffect`는 그 둘을 한 함수 안에 넣습니다.

왜 조건부 사용을 포기해야 했는지 — 이게 다음 절입니다.

---

## Hooks는 어떻게 동작하는가

"훅은 최상위에서만 호출하라"는 규칙은 스타일 가이드가 아니라 **런타임 무결성 조건**입니다. 왜 그런지는 직접 구현해 보면 30초 만에 이해됩니다.

### 최소 구현

```typescript
type Hook = { memoizedState: any; next: Hook | null };

let currentFiber: { hooks: Hook | null } = { hooks: null };
let workInProgressHook: Hook | null = null;
let isMount = true;

function mountWorkInProgressHook(): Hook {
  const hook: Hook = { memoizedState: null, next: null };
  if (workInProgressHook === null) {
    currentFiber.hooks = hook;          // 첫 훅 = 리스트의 head
  } else {
    workInProgressHook.next = hook;     // 이어 붙인다
  }
  workInProgressHook = hook;
  return hook;
}

function updateWorkInProgressHook(): Hook {
  // 갱신 시에는 "순서대로" 꺼내 쓴다
  const hook = workInProgressHook === null
    ? currentFiber.hooks!
    : workInProgressHook.next!;
  workInProgressHook = hook;
  return hook;
}

function useState<S>(initial: S): [S, (v: S) => void] {
  const hook = isMount ? mountWorkInProgressHook() : updateWorkInProgressHook();
  if (isMount) hook.memoizedState = initial;

  const setState = (value: S) => {
    hook.memoizedState = value;
    render();                            // 리렌더 스케줄
  };
  return [hook.memoizedState, setState];
}
```

핵심은 이 한 줄입니다.

```typescript
const hook = workInProgressHook === null ? fiber.hooks : workInProgressHook.next;
```

**훅에는 이름표가 없습니다.** `useState('han')`이라고 써도 React는 그 상태가 "userName"인지 모릅니다. 아는 건 **"이번 렌더에서 몇 번째로 호출된 훅인가"** 뿐입니다.

각 컴포넌트 인스턴스(Fiber)는 훅 상태의 **단방향 연결 리스트**를 들고 있고, 렌더링 때마다 head부터 순서대로 `next`를 따라가며 소비합니다.

### 그래서 이게 깨집니다

```typescript
function Bad({ isLoggedIn }) {
  if (isLoggedIn) {
    const [name, setName] = useState('');     // 1번 훅 (때때로)
  }
  const [theme, setTheme] = useState('dark'); // 2번 훅? 1번 훅?
}
```

`isLoggedIn`이 `true`였다가 `false`가 되면, 두 번째 `useState`가 **첫 번째 훅의 슬롯을 읽습니다.** `theme`에 빈 문자열이 들어오고, 최악의 경우 `useState`가 있던 자리를 `useEffect`가 읽어서 타입이 완전히 어긋납니다.

> **여기서 배울 것:** React는 이 규약을 언어로 강제할 수 없습니다(JS에는 그런 기능이 없으니까). 그래서 `eslint-plugin-react-hooks`가 대신 강제합니다. **정적 검증기가 없는 규약은 규약이 아니라 희망사항입니다** — 6편의 아키텍처 규칙에서 똑같은 원리가 다시 나옵니다.

### 왜 이 설계를 택했나

이름 기반(`useState('userName', '')`)으로 만들 수도 있었을 겁니다. 그러면 조건부 호출도 가능했겠죠. 하지만 그건 **믹스인의 네임스페이스 병합 문제를 그대로 재수입**하는 것입니다. 커스텀 훅 두 개가 같은 키를 쓰면 충돌하니까요.

React는 **"이름 충돌 없음"을 위해 "조건부 호출"을 팔았습니다.** 1편에서 말한 원리 그대로 — 좋은 추상은 감춘 만큼 무언가를 명시적으로 만들고, 그 대가를 어딘가에서 치릅니다.

---

## Hooks가 데려온 새로운 함정: 클로저

Hooks의 진짜 난이도는 API가 아니라 **클로저**입니다. 클래스 컴포넌트에서 `this.props`는 항상 최신이었습니다(변경 가능한 객체를 참조하니까). 함수 컴포넌트에서는 매 렌더가 **자기만의 props와 state를 가진 별개의 함수 호출**입니다.

### 함정 1 — Stale closure in interval

```typescript
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      console.log(count);   // 영원히 0을 찍는다
      setCount(count + 1);  // 영원히 0 + 1 = 1
    }, 1000);
    return () => clearInterval(id);
  }, []);   // ← 의존성 배열이 거짓말을 하고 있다
}
```

이펙트는 최초 렌더에서 한 번만 실행되고, 그때의 클로저는 `count === 0`인 세계를 포착한 채 박제됩니다.

**해법 세 가지, 각각 다른 의미:**

```typescript
// (a) 함수형 업데이트 — count에 대한 의존을 제거
setCount(c => c + 1);

// (b) 의존성 정직하게 선언 — 매번 인터벌 재설정 (의미는 맞지만 타이머가 리셋됨)
useEffect(() => { /* ... */ }, [count]);

// (c) ref로 최신 값 보관 — "렌더링에 참여하지 않는 최신 값"
const countRef = useRef(count);
countRef.current = count;
useEffect(() => {
  const id = setInterval(() => console.log(countRef.current), 1000);
  return () => clearInterval(id);
}, []);
```

(a)가 대체로 정답입니다. **의존을 없앨 수 있으면 없애는 게 의존을 선언하는 것보다 낫습니다.**

### 함정 2 — 이펙트 안에서 쓰는 콜백 prop

```typescript
function Search({ onResult }: { onResult: (r: Result[]) => void }) {
  const [q, setQ] = useState('');

  useEffect(() => {
    search(q).then(onResult);
  }, [q, onResult]);   // onResult가 매 렌더 새 함수라면 무한 루프
}
```

부모가 `<Search onResult={(r) => setResults(r)} />` 로 쓰면 `onResult`는 매 렌더 새 참조입니다. 이펙트가 매번 재실행되고, 결과가 부모 상태를 바꾸고, 다시 렌더되고, 또 새 함수가 생기고... 무한 루프입니다.

이게 바로 `useEffectEvent`(구 `useEvent`)가 풀려는 문제입니다. **"이펙트 안에서 읽지만 이펙트를 재실행시키지는 않아야 하는 값"** 이라는 개념이 기존 의존성 배열 모델에는 없었습니다.

```typescript
// React 실험적 API
const onResultEvent = useEffectEvent(onResult);
useEffect(() => {
  search(q).then(onResultEvent);
}, [q]);   // onResultEvent는 의존성에 들어가지 않는다
```

### 의존성 배열의 정체

여기까지 오면 의존성 배열이 무엇인지 정확히 말할 수 있습니다.

> 의존성 배열은 **"이 클로저가 포착한 자유변수 중, 무엇이 바뀌면 클로저를 다시 만들어야 하는가"** 를 개발자가 손으로 선언하는 장치다.

이건 원래 컴파일러의 일입니다. 클로저가 어떤 자유변수를 포착했는지는 AST만 보면 기계적으로 알 수 있으니까요. 실제로 `eslint-plugin-react-hooks`의 `exhaustive-deps` 규칙이 하는 일이 정확히 그 계산입니다 — 다만 **검사만 하고 고쳐주지는 않았습니다.**

**React Compiler**가 등장한 이유가 이것입니다. 컴파일 타임에 의존성을 추론하고 메모이제이션을 자동 삽입해서, `useMemo`/`useCallback`/의존성 배열을 사람 손에서 걷어냅니다.

```typescript
// 컴파일러 이전
const sorted = useMemo(() => items.sort(cmp), [items, cmp]);
const handleClick = useCallback(() => onSelect(id), [onSelect, id]);

// 컴파일러 이후 — 그냥 쓰면 컴파일러가 알아서 캐싱한다
const sorted = items.sort(cmp);
const handleClick = () => onSelect(id);
```

**역사가 한 바퀴 돌았습니다.** 원래 컴파일러의 일이었던 것을 런타임 API로 개발자에게 떠넘겼다가(2019), 다시 컴파일러로 돌려보내는 중입니다(2024~). Signal 진영이 "그건 애초에 런타임 그래프로 풀 문제였다"고 주장하는 지점이기도 하고요 — 5편에서 다룹니다.

---

## 커스텀 훅 설계 원칙

훅을 잘 쓰는 것과 훅을 **설계하는 것**은 다릅니다. 실무에서 쌓인 원칙 몇 가지.

### 1. 반환 형태: 튜플 vs 객체

```typescript
// 튜플 — 값이 1~2개이고 이름을 바꿔 쓸 일이 잦을 때
const [isOpen, toggle] = useToggle();
const [query, setQuery] = useState('');

// 객체 — 값이 3개 이상이거나 선택적으로 쓸 때
const { data, error, isLoading, refetch } = useQuery(...);
```

기준은 **"사용처에서 이름을 바꿀 가능성"** 과 **"일부만 꺼내 쓸 가능성"** 입니다. 튜플은 이름을 자유롭게 붙일 수 있지만 순서를 외워야 하고, 4개를 넘어가면 `const [a, , , d] = ...` 같은 참사가 벌어집니다.

### 2. 훅은 한 가지 관심사만

```typescript
// 나쁨 — 페칭 + 페이지네이션 + 정렬 + 선택이 한 덩어리
function useDataTable(url) { /* 200줄 */ }

// 좋음 — 작은 훅을 합성한다
function useDataTable(url: string) {
  const { page, setPage } = usePagination();
  const { sort, setSort } = useSort();
  const query = useFetch(`${url}?page=${page}&sort=${sort}`);
  const selection = useSelection(query.data ?? []);
  return { ...query, page, setPage, sort, setSort, selection };
}
```

**훅의 가장 큰 장점이 합성인데, 거대한 훅 하나를 만들면 그 장점을 스스로 버리는 것입니다.**

### 3. 옵션 객체를 받아라, 인자를 늘리지 마라

```typescript
// 나쁨 — 세 번째 인자만 주려면 앞을 undefined로 채워야 한다
useFetch(url, undefined, undefined, { retry: 3 });

// 좋음
useFetch({ url, retry: 3 });
```

이건 3편의 컴포넌트 API 설계와 같은 원리입니다. **위치 기반 인자는 확장에 닫혀 있습니다.**

### 4. 파생 값은 상태로 만들지 마라

```typescript
// 나쁨 — items가 바뀔 때마다 동기화 이펙트가 필요해진다
const [items, setItems] = useState<Item[]>([]);
const [total, setTotal] = useState(0);
useEffect(() => { setTotal(items.reduce((s, i) => s + i.price, 0)); }, [items]);

// 좋음 — 계산하면 된다
const total = items.reduce((s, i) => s + i.price, 0);
```

1편의 **단일 소유권** 원리입니다. `total`의 주인은 `items`이지 별도 상태가 아닙니다. 상태가 두 개면 둘이 어긋날 수 있고, 어긋나면 버그입니다. 비싼 계산이면 `useMemo`를 쓰되, 그건 **성능 최적화이지 상태 관리가 아닙니다.**

---

## 그럼 HOC와 Render Props는 죽었나

아닙니다. **각자 아직 유효한 자리가 있습니다.**

### HOC가 여전히 맞는 곳

**컴포넌트를 감싸는 것 자체가 목적일 때.**

```typescript
export default withErrorBoundary(Dashboard);      // 에러 경계로 감싸기
export default Sentry.withProfiler(Dashboard);    // 렌더 계측
export default requireAuth(AdminPage);            // 렌더 자체를 막기
```

`requireAuth`는 훅으로 못 만듭니다. 훅은 **컴포넌트가 렌더되는 것 자체를 막을 수 없기** 때문입니다. `useAuth()`가 "권한 없음"을 반환해도, 그 아래 코드는 이미 실행되고 있습니다. "이 컴포넌트를 렌더할 것인가 말 것인가"는 **바깥에서만 결정할 수 있는 문제**이고, 그러면 감싸는 수밖에 없습니다.

기준: **prop을 주입하려고 HOC를 쓰면 안티패턴, 렌더 자체를 제어하려고 쓰면 정당합니다.**

### Render Props가 여전히 맞는 곳

**부모가 자식의 렌더 시점·횟수·인자를 제어해야 할 때.**

```tsx
<VirtualList items={items} height={600}>
  {(item, style) => <Row style={style} data={item} />}
</VirtualList>
```

가상 스크롤은 자식을 **"보이는 개수만큼, 각자 다른 style로"** 렌더합니다. 훅으로는 표현할 수 없습니다 — 훅은 값을 반환할 뿐, 자식을 몇 번 렌더할지 결정하지 않으니까요. TanStack Virtual, react-window가 여전히 함수 자식을 쓰는 이유입니다.

기준: **값을 전달하려면 훅, 렌더를 위임하려면 함수 자식.**

---

## 요약

| 패턴 | 주입 방식 | 해결한 것 | 남긴 문제 | 지금의 자리 |
|---|---|---|---|---|
| Mixin | 네임스페이스 병합 | 생명주기 재사용 | 이름 충돌, 암묵 의존 | 사망 |
| HOC | 감싸서 prop 주입 | 이름 충돌 제거 | wrapper hell, 출처 불명, 타입 | 렌더 제어용으로 생존 |
| Render Props | 함수 자식 호출 | 출처 명시, 타입 추론 | 중첩 지옥, 트리 오염 | 렌더 위임용으로 생존 |
| Hooks | 값 반환 | 트리 오염 제거 | 호출 순서 규약, 클로저 | 기본값 |

**관통하는 교훈 셋:**

1. **암묵적 주입은 규모에서 무너진다.** 믹스인의 `this.x`, HOC의 `props.x` — 출처를 모르면 리팩터링이 불가능해집니다.
2. **추상의 비용은 사라지지 않고 이동한다.** Hooks는 트리 오염을 없앤 대신 호출 순서 규약과 클로저 관리를 데려왔습니다.
3. **정적 검증기가 없는 규약은 규약이 아니다.** Rules of Hooks는 ESLint 없이는 성립하지 않습니다.

---

## 다음 편

**3편 — Headless 컴포넌트 설계: 제어권을 설계한다**

이번 편이 "로직을 어떻게 재사용하는가"였다면, 다음 편은 직교하는 축입니다. **그 로직을 남에게 쓰라고 내놓을 때의 API를 어떻게 설계하는가.**

드롭다운 하나를 예제로, prop 15개짜리 괴물에서 시작해 Compound Component → Control Props → State Reducer → Headless로 단계적으로 리팩터링하며 **제어권 스펙트럼**을 직접 만들어 봅니다.
