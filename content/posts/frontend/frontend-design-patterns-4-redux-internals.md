---
# 📌 기본 메타데이터
title: '프론트엔드 디자인 패턴 (4) — Redux를 밑바닥부터: 타임트래블은 왜 공짜인가'
date: '2026-09-14'
category: 'frontend'
tags: ['Redux', 'Flux', 'State Management', 'Design Pattern', 'Middleware']
description: '40줄짜리 createStore를 직접 구현하며 구독 메커니즘, 미들웨어 체인(compose), Command 패턴, 타임트래블이 설계의 필연적 결과인 이유를 확인한다.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 디자인 패턴'
seriesOrder: 4

# 📚 SEO용
keywords: ['Redux', 'Flux', 'State Management', 'Design Pattern', 'Middleware', '프론트엔드 디자인 패턴']
---

# 프론트엔드 디자인 패턴 (4) — Redux를 밑바닥부터

Redux의 소스 코드는 주석 빼면 200줄이 안 됩니다. 그런데 그 200줄에서 타임트래블 디버깅, 미들웨어 생태계, 액션 로그 재생, 서버 상태 하이드레이션이 전부 나옵니다.

이번 편은 그걸 직접 만들어 봅니다. **목표는 Redux를 쓰기 위해서가 아니라, "제약을 걸면 도구가 따라온다"는 설계 원리를 코드로 확인하는 것입니다.**

3편 마지막에서 State Reducer 패턴이 "제안하고 가로채기"라는 구조를 만들었죠. 이번 편에서 그게 미들웨어와 같은 구조라는 것도 확인합니다.

---

## 1. createStore — 40줄

```typescript
type Action = { type: string; [key: string]: unknown };
type Reducer<S> = (state: S | undefined, action: Action) => S;
type Listener = () => void;

function createStore<S>(reducer: Reducer<S>, preloadedState?: S) {
  let currentState = preloadedState as S;
  let currentReducer = reducer;
  let currentListeners: Listener[] = [];
  let nextListeners = currentListeners;
  let isDispatching = false;

  function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      nextListeners = currentListeners.slice();
    }
  }

  function getState(): S {
    if (isDispatching) {
      throw new Error('리듀서가 실행되는 동안에는 getState()를 호출할 수 없습니다.');
    }
    return currentState;
  }

  function subscribe(listener: Listener) {
    if (isDispatching) {
      throw new Error('리듀서가 실행되는 동안에는 subscribe()를 호출할 수 없습니다.');
    }
    let isSubscribed = true;
    ensureCanMutateNextListeners();
    nextListeners.push(listener);

    return function unsubscribe() {
      if (!isSubscribed) return;
      isSubscribed = false;
      ensureCanMutateNextListeners();
      nextListeners.splice(nextListeners.indexOf(listener), 1);
    };
  }

  function dispatch(action: Action) {
    if (isDispatching) {
      throw new Error('리듀서가 액션을 디스패치할 수 없습니다.');
    }
    try {
      isDispatching = true;
      currentState = currentReducer(currentState, action);
    } finally {
      isDispatching = false;
    }

    const listeners = (currentListeners = nextListeners);
    for (const listener of listeners) listener();

    return action;
  }

  dispatch({ type: '@@INIT' });   // 리듀서의 기본 상태를 채운다

  return { getState, dispatch, subscribe };
}
```

전부입니다. 그런데 이 40줄에 **의도적인 설계 결정이 다섯 개** 들어있습니다.

### 결정 1 — 상태는 밖에서 못 바꾼다

`currentState`는 클로저 안에 갇혀 있습니다. `getState()`로 읽을 수만 있고, 바꾸려면 반드시 `dispatch`를 거쳐야 합니다. 1편에서 말한 **"Observer에 방향을 강제한다"** 가 이 한 줄로 구현됩니다.

(물론 `getState().user.name = 'x'` 로 직접 변형할 수는 있습니다. JS가 막아주지 않으니까요. 그래서 Immer나 `Object.freeze`가 개발 환경에서 도와주는 것이고, 이건 **언어가 강제 못 하는 규약은 도구로 강제한다**는 2편·6편의 반복되는 주제입니다.)

### 결정 2 — `currentListeners` / `nextListeners` 이중 배열

가장 미묘한 부분입니다. 왜 리스너 배열이 두 개일까요?

```typescript
const unsubscribeA = store.subscribe(() => {
  console.log('A');
  unsubscribeB();          // A가 실행되는 도중에 B가 구독 해제된다
});
const unsubscribeB = store.subscribe(() => console.log('B'));

store.dispatch({ type: 'X' });
```

배열이 하나뿐이라면, A를 실행하는 중에 B가 배열에서 제거됩니다. `for` 루프가 인덱스를 따라가고 있으니 **B를 건너뛰거나 인덱스가 어긋납니다.**

해법은 **순회 중인 배열은 절대 건드리지 않는 것**입니다. `subscribe`/`unsubscribe`는 `nextListeners`(복사본)를 수정하고, `dispatch`는 순회 직전에 `currentListeners = nextListeners`로 스냅샷을 고정합니다.

> 이게 **"이번 디스패치의 구독자 목록은 디스패치 시작 시점에 확정된다"** 는 계약입니다. 리스너 안에서 새로 구독하면 이번 알림에는 안 오고 다음 디스패치부터 옵니다. 명시적으로 정의된 동작이지 우연이 아닙니다.

### 결정 3 — `isDispatching` 가드

리듀서 안에서 `dispatch`를 호출하면 무한 루프이거나, 최소한 상태가 절반만 갱신된 시점에 또 다른 갱신이 시작되는 것입니다. 명시적 에러로 막습니다.

**"불변식을 지키는 가장 좋은 방법은 깨지는 순간 크게 터지게 하는 것"** — 조용히 잘못된 상태로 가는 것보다 낫습니다.

### 결정 4 — `@@INIT` 액션

스토어를 만들자마자 아무도 모르는 액션을 하나 던집니다. 왜냐하면 리듀서가 이렇게 생겼기 때문입니다.

```typescript
function counter(state = 0, action: Action) {
  switch (action.type) {
    case 'INCREMENT': return state + 1;
    default: return state;
  }
}
```

`state = 0`이라는 **기본 매개변수**가 초기값의 선언 위치입니다. 이걸 실행시키려면 리듀서를 한 번 호출해야 하고, 그래서 아무 데도 매칭되지 않는 액션을 던져 `default` 분기로 보냅니다. 초기 상태를 스토어가 아니라 **각 리듀서가 소유**하게 만드는 장치입니다.

### 결정 5 — 반환값은 세 함수뿐

`getState`, `dispatch`, `subscribe`. 이 세 개가 **외부 스토어(external store)의 최소 인터페이스**입니다. 나중에 나올 `useSyncExternalStore`가 요구하는 것도 정확히 이것이고, Zustand·Jotai·Valtio가 전부 이 모양을 따릅니다.

---

## 2. combineReducers — 단일 스토어를 나누기

```typescript
function combineReducers<S extends Record<string, unknown>>(
  reducers: { [K in keyof S]: Reducer<S[K]> }
): Reducer<S> {
  const keys = Object.keys(reducers) as (keyof S)[];

  return function combination(state = {} as S, action: Action): S {
    let hasChanged = false;
    const nextState = {} as S;

    for (const key of keys) {
      const previous = state[key];
      const next = reducers[key](previous, action);

      if (next === undefined) {
        throw new Error(`리듀서 "${String(key)}"가 undefined를 반환했습니다.`);
      }

      nextState[key] = next;
      hasChanged = hasChanged || next !== previous;
    }

    return hasChanged ? nextState : state;
  };
}
```

**주목할 두 줄:**

**`hasChanged`** — 모든 하위 리듀서가 이전 상태를 그대로 반환했다면 **새 객체가 아니라 원래 객체를 반환**합니다. 참조가 유지되므로 `useSelector`나 `React.memo`가 "안 바뀌었다"고 정확히 판단할 수 있습니다. 불변 업데이트 스타일에서 **참조 동등성이 곧 변경 감지**이기 때문에, 이 한 줄이 성능의 기반입니다.

**모든 리듀서가 모든 액션을 본다** — `dispatch({ type: 'LOGOUT' })` 하나로 `user`, `cart`, `notifications` 리듀서가 동시에 초기화될 수 있습니다. 액션은 "이벤트 브로드캐스트"이지 "특정 슬라이스에 보내는 메시지"가 아닙니다. 이게 Redux의 강력함이자, 액션 타입을 `'cart/add'`처럼 네임스페이스로 짓는 관례가 생긴 이유입니다.

---

## 3. 미들웨어 — 이 시리즈에서 가장 중요한 30줄

미들웨어의 시그니처는 처음 보면 기괴합니다.

```typescript
type Middleware = (api: MiddlewareAPI) =>
  (next: Dispatch) =>
    (action: Action) => unknown;
```

3단 커링입니다. 왜 이렇게 생겼는지 **각 단계가 언제 호출되는지**를 보면 이해됩니다.

| 단계 | 언제 호출되나 | 받는 것 |
|---|---|---|
| `(api) =>` | 스토어 생성 시 **한 번** | `getState`, `dispatch` |
| `(next) =>` | 체인 조립 시 **한 번** | 다음 미들웨어의 dispatch |
| `(action) =>` | 디스패치마다 **매번** | 액션 |

### compose

```typescript
function compose(...funcs: Function[]) {
  if (funcs.length === 0) return <T>(arg: T) => arg;
  if (funcs.length === 1) return funcs[0];
  return funcs.reduce((a, b) => (...args: unknown[]) => a(b(...args)));
}
```

이 한 줄이 `compose(f, g, h)(x)` 를 `f(g(h(x)))` 로 만듭니다. 손으로 펼쳐 보면:

```
[f, g, h].reduce((a, b) => (...args) => a(b(...args)))

1회차: a=f, b=g  →  fg = (...args) => f(g(...args))
2회차: a=fg, b=h →  fgh = (...args) => fg(h(...args))
                        = (...args) => f(g(h(...args)))
```

### applyMiddleware

```typescript
function applyMiddleware(...middlewares: Middleware[]) {
  return (createStoreFn: typeof createStore) =>
    <S>(reducer: Reducer<S>, preloadedState?: S) => {
      const store = createStoreFn(reducer, preloadedState);

      let dispatch: Dispatch = () => {
        throw new Error('미들웨어를 구성하는 동안에는 dispatch할 수 없습니다.');
      };

      const middlewareAPI = {
        getState: store.getState,
        dispatch: (action: Action) => dispatch(action),   // ← 클로저로 늦게 바인딩
      };

      const chain = middlewares.map(mw => mw(middlewareAPI));
      dispatch = compose(...chain)(store.dispatch);

      return { ...store, dispatch };
    };
}
```

**`middlewareAPI.dispatch`가 `store.dispatch`가 아니라 화살표 함수인 게 핵심입니다.** 미들웨어가 `api.dispatch(otherAction)`을 호출하면 **체인의 맨 앞으로 다시 들어갑니다.** 그래야 thunk가 던진 액션도 logger가 볼 수 있습니다. 만약 `store.dispatch`를 직접 넘겼다면 그 액션은 모든 미들웨어를 건너뛰었을 겁니다.

그리고 `dispatch`가 `let`인 이유 — 체인을 조립하는 시점엔 아직 최종 `dispatch`가 없습니다. 클로저가 나중에 할당될 변수를 참조하는 **늦은 바인딩**입니다.

### 미들웨어 세 개 직접 써보기

**로거 — Decorator 패턴 그 자체:**

```typescript
const logger: Middleware = (api) => (next) => (action) => {
  console.group(action.type);
  console.log('이전 상태', api.getState());
  console.log('액션', action);
  const result = next(action);        // 다음으로 넘긴다
  console.log('다음 상태', api.getState());
  console.groupEnd();
  return result;
};
```

**thunk — 전체가 9줄:**

```typescript
const thunk: Middleware = (api) => (next) => (action) => {
  if (typeof action === 'function') {
    return (action as any)(api.dispatch, api.getState);   // 액션이 아니면 실행해 버린다
  }
  return next(action);
};

// 사용
const fetchUser = (id: string) => async (dispatch, getState) => {
  dispatch({ type: 'user/loading' });
  try {
    const user = await api.get(`/users/${id}`);
    dispatch({ type: 'user/loaded', payload: user });
  } catch (e) {
    dispatch({ type: 'user/failed', error: e });
  }
};
```

redux-thunk는 **"dispatch에 함수를 넘길 수 있게 한다"** 는 한 줄짜리 아이디어입니다. 비동기 처리의 표준이 된 라이브러리가 실제로는 9줄이라는 사실이 Redux 설계의 밀도를 보여줍니다.

**여기서 미들웨어 순서의 실질적 의미가 드러납니다.** `applyMiddleware(logger, thunk)` 로 조립하면 logger가 체인 앞이므로, **thunk 함수 자체도 logger를 한 번 통과합니다.**

```typescript
dispatch(fetchUser('42'));
// logger가 보는 것: [함수], 'user/loading', 'user/loaded'
// → action.type을 읽으면 첫 항목은 undefined다
```

순서를 뒤집어 `applyMiddleware(thunk, logger)` 로 하면 thunk가 함수를 먼저 잡아먹으므로 logger에는 **진짜 액션만** 도달합니다. 어느 쪽이 맞는지는 목적에 달렸습니다 — "무엇이 디스패치됐는가"를 전부 보려면 앞쪽에, "상태를 바꾼 액션만" 보려면 뒤쪽에 둡니다. **체인의 위치가 곧 관측 범위입니다.**

**Chain of Responsibility로서:**

```typescript
const authGuard: Middleware = (api) => (next) => (action) => {
  if (action.meta?.requiresAuth && !api.getState().user) {
    return next({ type: 'auth/required' });   // 원래 액션을 삼키고 다른 걸 흘린다
  }
  return next(action);
};
```

`next`를 호출하지 않으면 **체인이 거기서 끊깁니다.** Express 미들웨어에서 `next()`를 안 부르면 요청이 멈추는 것과 똑같습니다.

---

## 4. 타임트래블은 왜 공짜인가

이제 핵심 질문입니다. Redux DevTools는 어떻게 상태를 과거로 되돌릴까요?

**답: 되돌리지 않습니다. 다시 만듭니다.**

```typescript
function createTimeTravelStore<S>(reducer: Reducer<S>) {
  const actionLog: Action[] = [];
  let store = createStore(reducer);

  return {
    ...store,
    dispatch(action: Action) {
      actionLog.push(action);
      return store.dispatch(action);
    },
    // n번째 액션 직후 상태로 이동
    jumpTo(index: number) {
      store = createStore(reducer);                    // 초기 상태로 리셋
      actionLog.slice(0, index + 1).forEach(store.dispatch);   // 재생
    },
    // 특정 액션만 빼고 다시 계산 (DevTools의 "skip" 기능)
    skip(index: number) {
      const filtered = actionLog.filter((_, i) => i !== index);
      store = createStore(reducer);
      filtered.forEach(store.dispatch);
    },
  };
}
```

**이게 가능한 이유는 두 가지 제약 덕분입니다.**

| 제약 | 무엇이 가능해지는가 |
|---|---|
| 리듀서가 **순수 함수** | 같은 액션 순서 → 항상 같은 상태 (재생 가능) |
| 액션이 **직렬화 가능한 객체** | 로깅, 저장, 전송, 재생 가능 |

순수하지 않은 리듀서(`Math.random()`, `Date.now()`, API 호출)가 하나라도 있으면 재생이 다른 결과를 냅니다. **"리듀서를 순수하게 유지하라"는 스타일 권고가 아니라 타임트래블의 전제조건입니다.**

### Command 패턴과의 정확한 대응

| GoF Command | Redux |
|---|---|
| 요청을 객체로 캡슐화 | `{ type, payload }` |
| Invoker | `dispatch` |
| Receiver | reducer |
| 명령 이력 (undo/redo) | action log |
| 명령 큐잉 | 미들웨어에서 큐에 쌓기 |
| 명령 직렬화 → 원격 실행 | 액션을 서버로 전송 |

마지막 줄이 실무에서 실제로 쓰입니다. **협업 편집기**가 그렇습니다. 각 클라이언트의 액션을 서버로 보내고, 서버가 순서를 정해 모두에게 브로드캐스트하면, 모든 클라이언트가 같은 액션 순서를 같은 리듀서에 먹여 같은 상태에 도달합니다. **결정론적 상태 재구성**이 협업의 기반이 됩니다.

**버그 리포트에도 씁니다.** "재현이 안 돼요" 문제를, 사용자의 액션 로그를 그대로 첨부받아 개발자 환경에서 재생하는 것으로 해결할 수 있습니다.

---

## 5. React와 연결하기 — useSyncExternalStore

스토어를 만들었으니 React에 붙여야 합니다. 순진한 구현은 이렇습니다.

```typescript
// 이러면 안 된다
function useStore<S, T>(store: Store<S>, selector: (s: S) => T): T {
  const [value, setValue] = useState(() => selector(store.getState()));
  useEffect(() => store.subscribe(() => setValue(selector(store.getState()))), []);
  return value;
}
```

문제는 **tearing(찢어짐)** 입니다. React 18의 동시성 렌더링에서는 렌더가 중간에 멈췄다가 재개될 수 있습니다. 그 사이에 외부 스토어가 바뀌면, **같은 화면의 컴포넌트 A는 옛 값을 보고 컴포넌트 B는 새 값을 보는** 상태가 됩니다. 하나의 프레임에 두 개의 진실이 존재하는 것이죠.

React가 이 문제를 위해 만든 공식 API가 `useSyncExternalStore`입니다.

```typescript
function useStore<S, T>(store: Store<S>, selector: (state: S) => T): T {
  return React.useSyncExternalStore(
    store.subscribe,                       // 구독 등록 (해제 함수 반환)
    () => selector(store.getState()),      // 클라이언트 스냅샷
    () => selector(store.getState())       // 서버 스냅샷 (SSR용)
  );
}
```

React가 렌더 직전과 커밋 직전에 스냅샷을 다시 읽어서, 값이 달라졌으면 동기적으로 다시 렌더합니다. **외부 상태를 쓰는 대가로 동시성 기능 일부를 포기하는 것**이고, 그래서 이름에 `Sync`가 들어갑니다.

> 여기서 1편의 원리가 또 나옵니다. **진실의 원천이 React 밖에 있으면, React의 스케줄링과 그 외부 상태 사이에 반드시 조정 장치가 필요합니다.** `useSyncExternalStore`는 그 조정의 이름입니다.

### 셀렉터와 참조 동등성

```typescript
// 매 렌더 새 배열 → 상태가 안 바뀌어도 무한 리렌더
const activeUsers = useStore(store, s => s.users.filter(u => u.active));
```

`filter`는 매번 새 배열을 만듭니다. `useSyncExternalStore`는 `Object.is`로 스냅샷을 비교하므로, 값이 같아도 참조가 다르면 "바뀌었다"고 판단합니다. 최악의 경우 무한 루프입니다.

**해법 두 가지:**

```typescript
// (a) 메모이즈된 셀렉터 (reselect)
const selectActiveUsers = createSelector(
  [(s: State) => s.users],
  (users) => users.filter(u => u.active)   // users 참조가 같으면 이전 결과 반환
);

// (b) 커스텀 동등성 비교
const activeUsers = useStoreWithEqualityFn(
  store,
  s => s.users.filter(u => u.active),
  shallow
);
```

`createSelector`는 **입력 참조가 같으면 계산을 건너뛰고 이전 출력을 그대로 반환**합니다. `combineReducers`가 `hasChanged`로 참조를 유지해 준 게 여기서 값을 합니다. **불변성 → 참조 동등성 → 메모이제이션 → 리렌더 최소화** 라는 사슬 전체가 하나의 설계입니다.

---

## 6. Zustand는 무엇을 뺐는가 — 30줄로 재구현

같은 외부 스토어 인터페이스 위에서, Redux가 건 제약 중 일부를 뺀 것이 Zustand입니다.

```typescript
function create<T extends object>(
  createState: (set: SetState<T>, get: () => T) => T
) {
  let state: T;
  const listeners = new Set<(s: T, prev: T) => void>();

  const setState: SetState<T> = (partial, replace) => {
    const nextPartial = typeof partial === 'function'
      ? (partial as (s: T) => Partial<T>)(state)
      : partial;

    if (!Object.is(nextPartial, state)) {
      const prev = state;
      state = replace ? (nextPartial as T) : Object.assign({}, state, nextPartial);
      listeners.forEach(l => l(state, prev));
    }
  };

  const getState = () => state;
  const subscribe = (l: (s: T, prev: T) => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };

  state = createState(setState, getState);

  function useStore<U>(selector: (s: T) => U = getState as any): U {
    return React.useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state)
    );
  }

  return Object.assign(useStore, { getState, setState, subscribe });
}
```

사용:

```typescript
const useCart = create((set, get) => ({
  items: [] as Item[],
  add: (item: Item) => set(s => ({ items: [...s.items, item] })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((sum, i) => sum + i.price, 0),
}));

function CartBadge() {
  const count = useCart(s => s.items.length);   // 이 값이 바뀔 때만 리렌더
  return <span>{count}</span>;
}
```

**Redux 대비 뺀 것과 얻은 것:**

| 뺀 것 | 대가로 잃은 것 | 얻은 것 |
|---|---|---|
| 액션 객체 | 액션 로그, 타임트래블 | 보일러플레이트 소멸 |
| 순수 리듀서 | 재생 가능성 | 액션과 상태를 한곳에 |
| 단일 스토어 | 전역 크로스 슬라이스 액션 | 스토어를 기능별로 분리 |

그리고 **하나 더한 것**이 있습니다. `useCart(s => s.items.length)` — **선택적 구독**입니다. Context는 값이 바뀌면 모든 소비자가 리렌더되지만(3편의 안티패턴), Zustand는 셀렉터 결과가 바뀐 컴포넌트만 리렌더합니다. 스토어가 외부에 있기 때문에 가능한 일입니다.

---

## 7. 그래서 지금 Redux를 써야 하나

**Redux Toolkit(RTK)이 바꾼 것부터:**

```typescript
const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] as Item[] },
  reducers: {
    add(state, action: PayloadAction<Item>) {
      state.items.push(action.payload);   // Immer 덕분에 "변형"처럼 써도 불변
    },
  },
});
```

액션 타입 문자열, 액션 생성자, `switch` 문이 전부 사라졌습니다. 그런데 **핵심 제약은 그대로 남아 있습니다** — 리듀서는 여전히 순수하고, 액션은 여전히 직렬화 가능한 객체입니다. 그래서 타임트래블도 그대로 됩니다. **RTK가 없앤 건 의식(ceremony)이지 제약이 아닙니다.**

**Redux가 여전히 정당한 자리:**

1. **액션 로그 자체가 가치 있을 때** — 협업 편집, 감사 로그(audit trail), 오프라인 액션 큐, "재현 불가 버그"를 액션 로그로 재생해야 하는 제품.
2. **상태 전이가 복잡한 클라이언트 상태 머신** — 다단계 위저드, 캔버스 편집기의 undo/redo, 주문 프로세스처럼 "어떤 상태에서 어떤 액션이 허용되는가"가 로직의 본체인 경우.
3. **하나의 이벤트가 여러 도메인을 동시에 건드릴 때** — `LOGOUT` 하나로 모든 슬라이스를 초기화하는 브로드캐스트 구조가 필요한 경우.

**Redux가 부당한 자리:**

- **서버 데이터 캐싱.** 1편에서 말한 그 문제입니다. `isLoading/error/data`를 리듀서로 관리하고 있다면 TanStack Query나 RTK Query가 맞습니다.
- **단순 전역 UI 상태.** 테마, 사이드바 열림, 토스트 큐 정도에 Redux를 쓰는 건 과합니다. Zustand 열 줄이면 끝납니다.

---

## 요약

| 구성요소 | 구현의 핵심 | 만들어낸 능력 |
|---|---|---|
| `createStore` | 상태를 클로저에 가두고 `dispatch`만 열기 | 단방향 강제, 추적 가능성 |
| 이중 리스너 배열 | 순회 중인 배열을 건드리지 않기 | 디스패치 중 구독 변경의 안전성 |
| `combineReducers` | `hasChanged`로 참조 유지 | 메모이제이션의 기반 |
| `compose` | `reduce`로 함수 중첩 | 미들웨어 체인 |
| `applyMiddleware` | `api.dispatch`를 늦게 바인딩 | 미들웨어가 체인 앞으로 재진입 |
| 순수 리듀서 + 직렬화 액션 | 제약 두 개 | 타임트래블, 액션 재생, 협업 |
| `useSyncExternalStore` | 렌더 전후 스냅샷 재확인 | 동시성 렌더링에서 tearing 방지 |

**관통하는 원리:** **제약을 걸면 도구가 따라옵니다.** Redux는 "상태를 아무 데서나 바꾸지 마라, 리듀서를 순수하게 유지해라, 액션을 객체로 만들어라"는 세 가지 불편을 강요했고, 그 대가로 타임트래블·액션 재생·미들웨어 생태계를 얻었습니다.

반대로 말하면 — **그 능력이 필요 없다면 그 제약도 필요 없습니다.** 도구를 고를 때 물어야 할 질문은 "무엇이 더 좋은가"가 아니라 **"이 제약이 사주는 능력이 지금 나에게 필요한가"** 입니다.

---

## 다음 편

**5편 — 상태의 4분류와 반응성 모델**

이번 편에서 "Redux에 서버 데이터를 넣지 마라"고 했는데, 그럼 어디에 넣어야 하는지가 다음 편입니다. 서버/클라이언트/폼/URL 네 가지 상태를 가르는 실전 판단 기준과, 그 아래에서 돌아가는 세 가지 반응성 엔진 — VDOM diff, Proxy 추적, Signal 그래프 — 의 내부 동작을 비교합니다.
