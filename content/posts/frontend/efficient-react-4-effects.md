---
# 📌 기본 메타데이터
title: '효율적인 React 4편 — Effect 없이 생각하기: 동기화와 이벤트를 구분하는 법'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'useEffect', 'useEffectEvent', 'Side Effects', 'StrictMode']
description: 'useEffect는 ''무언가 바뀌면 실행''하는 도구가 아니라 ''화면이 존재하는 동안 외부 시스템과 맞추는'' 도구다. Effect가 필요 없는 일곱 가지 경우, 필요한 다섯 가지 경우, 의존성 배열을 줄이는 법, useEffectEvent.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 4

# 📚 SEO용
keywords: ['React', 'useEffect', 'useEffectEvent', 'Side Effects', 'StrictMode', '효율적인 React']
---

# 효율적인 React 4편 — Effect 없이 생각하기

1\~3편은 렌더의 **넓이**를 다뤘다. 이 편은 렌더 **뒤에** 일어나는 일을 다룬다. Profiler에서 "각 렌더는 가벼운데 상호작용 한 번에 커밋이 서너 번 찍힌다"면 대부분 Effect가 원인이다.

이 편의 기준 문장은 하나다.

> **이 코드는 화면이 존재해서 실행되어야 하는가, 사용자가 무언가를 해서 실행되어야 하는가?**
>
> 전자라면 Effect, 후자라면 이벤트 핸들러다. 둘 다 아니라면 렌더 중 계산이다.

---

## 1. Effect는 무엇을 위한 도구인가

`useEffect`의 정의는 "렌더 결과가 화면에 커밋된 뒤, 컴포넌트를 **React 바깥의 시스템**과 동기화한다"이다. 바깥 시스템의 예는 다음과 같다.

- 브라우저 API: `document.title`, `IntersectionObserver`, `matchMedia`, 이벤트 리스너
- 네트워크 연결: WebSocket, EventSource
- React로 만들지 않은 위젯: 지도 SDK, 차트 인스턴스, 에디터 라이브러리
- 타이머

이 정의에서 빠진 것이 중요하다. **React 안의 state끼리 맞추는 일, 사용자 행동에 반응하는 일은 Effect의 역할이 아니다.**

### Effect 하나가 만드는 타임라인

```
state 변경
 → 렌더 (옛 파생 state로)
 → 커밋 (DOM 반영)
 → 브라우저 페인트        ← 사용자가 한 프레임 동안 어긋난 화면을 봄
 → Effect 실행
 → setState
 → 다시 렌더
 → 다시 커밋
 → 다시 페인트
```

Effect 안에서 setState를 하면 렌더와 커밋이 한 번씩 더 일어나고, 그 사이에 **어긋난 화면이 한 번 그려질 수 있다**. Effect가 연쇄되면 이 과정이 반복된다.

---

## 2. Effect가 필요 없는 일곱 가지 경우

### 2-1. 다른 state나 props로 계산할 수 있는 값

2편에서 다뤘다. 렌더 중에 계산하고, 무거우면 캐시한다.

```tsx
// ❌
useEffect(() => { setFullName(`${first} ${last}`); }, [first, last]);
// ✅
const fullName = `${first} ${last}`;
```

### 2-2. 사용자 행동에 대한 반응

```tsx
// ❌ 제출 결과를 state에 두고 Effect로 요청
const [submitted, setSubmitted] = useState<FormData | null>(null);

useEffect(() => {
  if (submitted) {
    fetch('/api/orders', { method: 'POST', body: submitted });
    showToast('주문 완료');
  }
}, [submitted]);

function handleSubmit(data: FormData) {
  setSubmitted(data);
}
```

이 구조의 문제는 성능보다 **의미**다. POST 요청의 원인은 "사용자가 제출 버튼을 눌렀다"인데, 코드에서는 "`submitted` state가 바뀌었다"가 원인이 된다. 그래서 다음 문제가 생긴다.

- 같은 데이터를 다시 제출하면 state가 바뀌지 않은 것으로 판단될 수 있다.
- 개발 모드 StrictMode에서 Effect가 두 번 실행되어 주문이 두 번 들어간 것처럼 보인다.
- 다른 경로로 `submitted`가 set되면 의도치 않게 주문이 나간다.

```tsx
// ✅ 원인이 있는 곳에서 실행
async function handleSubmit(data: FormData) {
  await fetch('/api/orders', { method: 'POST', body: data });
  showToast('주문 완료');
}
```

분석 이벤트도 같다. "버튼 클릭" 이벤트는 핸들러에서 보낸다. 반면 "페이지 노출" 이벤트는 **화면이 보여서** 발생하므로 Effect가 맞다(3절).

### 2-3. props가 바뀌면 state를 초기화

2편에서 다뤘다. `key`를 쓴다.

```tsx
// ❌
useEffect(() => { setComment(''); }, [postId]);
// ✅
<CommentBox key={postId} />
```

### 2-4. 부모에게 변경 알리기

```tsx
// ❌ state 변경 → 커밋 → Effect → 부모 setState → 부모 렌더 → 자식 렌더
function Toggle({ onChange }: { onChange: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => { onChange(on); }, [on, onChange]);
  return <button onClick={() => setOn(o => !o)}>{on ? 'ON' : 'OFF'}</button>;
}
```

이 코드는 렌더 패스를 두 번 거친다. 게다가 부모가 `onChange`를 인라인 함수로 넘기면 부모가 렌더될 때마다 Effect가 다시 실행된다.

```tsx
// ✅ A. 같은 이벤트에서 둘 다 업데이트 → 배칭으로 렌더 한 번
function Toggle({ onChange }: { onChange: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  function toggle() {
    const next = !on;
    setOn(next);
    onChange(next);
  }
  return <button onClick={toggle}>{on ? 'ON' : 'OFF'}</button>;
}

// ✅ B. 부모가 상태를 소유 (제어 컴포넌트)
function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return <button onClick={() => onChange(!on)}>{on ? 'ON' : 'OFF'}</button>;
}
```

부모가 그 값을 알아야 한다면 대개 B가 맞다. 진실의 원천이 하나가 되기 때문이다. 제어/비제어를 모두 지원해야 하는 컴포넌트라면 [디자인 패턴 시리즈 3편](/posts/frontend-design-patterns-3-headless-design)의 `useControllableState`가 이 문제를 푼다.

### 2-5. Effect 연쇄

```tsx
// ❌ 한 번의 클릭이 렌더 4회로 이어진다
const [card, setCard] = useState<Card | null>(null);
const [goldCount, setGoldCount] = useState(0);
const [round, setRound] = useState(1);
const [isGameOver, setIsGameOver] = useState(false);

useEffect(() => { if (card?.gold) setGoldCount(c => c + 1); }, [card]);
useEffect(() => { if (goldCount > 3) { setRound(r => r + 1); setGoldCount(0); } }, [goldCount]);
useEffect(() => { if (round > 5) setIsGameOver(true); }, [round]);
```

카드 한 장을 놓으면 `card` → `goldCount` → `round` → `isGameOver` 순으로 Effect가 이어진다. 커밋이 네 번이고, 코드만 보고는 "카드를 놓으면 무슨 일이 일어나는가"를 따라가기 어렵다.

```tsx
// ✅ 한 이벤트에서 다음 상태를 한 번에 계산
type Game = { card: Card | null; goldCount: number; round: number };

function placeCard(game: Game, card: Card): Game {
  let { goldCount, round } = game;
  if (card.gold) goldCount += 1;
  if (goldCount > 3) { round += 1; goldCount = 0; }
  return { card, goldCount, round };
}

function GameBoard() {
  const [game, setGame] = useState<Game>({ card: null, goldCount: 0, round: 1 });
  const isGameOver = game.round > 5;               // 파생값

  function handlePlace(card: Card) {
    if (isGameOver) return;
    setGame(g => placeCard(g, card));
  }
  // ...
}
```

전이 규칙은 순수 함수 `placeCard`에 모였고, 렌더는 한 번이며, `isGameOver`는 state가 아니다. 규칙이 더 복잡해지면 2편의 `useReducer`로 옮긴다.

### 2-6. 앱 전체에서 한 번만 실행할 초기화

```tsx
// ❌ StrictMode 개발 모드에서 두 번 실행, 컴포넌트 재마운트 시 다시 실행
useEffect(() => {
  initAnalytics();
  loadFeatureFlags();
}, []);
```

"마운트 시 한 번"과 "앱 시작 시 한 번"은 다르다. 컴포넌트는 여러 번 마운트될 수 있다. 앱 전체에서 한 번이어야 한다면 컴포넌트 밖으로 뺀다.

```ts
// ✅ 모듈 스코프: 모듈이 처음 평가될 때 한 번
if (typeof window !== 'undefined') {
  initAnalytics();
}
```

또는 진입점(`main.tsx`, Next.js라면 `instrumentation-client.ts` 같은 클라이언트 초기화 지점)에서 실행한다.

### 2-7. 데이터 가져오기

Effect에서 fetch하는 코드는 5편의 주제이므로 여기서는 결론만 적는다.

1. 서버 컴포넌트에서 읽을 수 있으면 거기서 읽는다.
2. 클라이언트에서 읽어야 하면 서버 캐시 라이브러리를 쓴다.
3. 직접 Effect로 짤 수밖에 없다면 **최소한 Race Condition은 막는다.**

```tsx
useEffect(() => {
  let ignore = false;
  fetchUser(userId).then(user => {
    if (!ignore) setUser(user);
  });
  return () => { ignore = true; };
}, [userId]);
```

> 실행 검증: `userId`를 `'a'`(60ms 응답)에서 `'b'`(10ms 응답)로 바꿨다. 가드가 없으면 늦게 도착한 `'a'`의 응답이 최종 화면에 남았고(`id=b`인데 `data-a` 표시), 가드가 있으면 `data-b`가 표시됐다.

`ignore` 플래그는 결과를 버릴 뿐 요청은 계속된다. 요청 자체를 취소하려면 `AbortController`를 cleanup에서 `abort()`한다. 캐싱, 중복 제거, 재시도는 여전히 없으므로 3번은 마지막 수단이다.

---

## 3. Effect가 맞는 다섯 가지 경우

| 경우 | 예 | 확인할 것 |
|---|---|---|
| **외부 이벤트 구독** | `resize`, `online`, 키보드 단축키 | 값을 읽는 목적이면 `useSyncExternalStore`가 더 맞다 |
| **브라우저 API 동기화** | `document.title`, `IntersectionObserver`, 포커스 이동 | DOM 노드에 묶인 작업은 ref 콜백도 후보 |
| **React 밖 위젯 제어** | 지도 SDK 인스턴스 생성·파괴, 줌 레벨 동기화 | 생성과 파괴가 대칭인가 |
| **연결 유지** | WebSocket, EventSource | 의존성이 바뀌면 끊고 다시 연결 |
| **화면 노출에 따른 기록** | 페이지뷰, 노출 로그 | 개발 모드 이중 실행은 허용 가능한가 |

### 3-1. 값을 읽는 구독은 `useSyncExternalStore`로

```tsx
// Effect 버전: 첫 렌더에 틀린 값, 이후 동기화
function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
```

```tsx
// ✅ 첫 렌더부터 정확, Concurrent 렌더링에서도 일관
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,          // 서버 렌더 시 기본값
  );
}
```

`useSyncExternalStore`는 렌더 도중 외부 값이 바뀌었을 때 화면 일부만 새 값을 보여주는 불일치(tearing)도 막아 준다. `matchMedia`, `localStorage` 변경 감지, 3편의 외부 스토어가 모두 이 형태다.

### 3-2. DOM 노드에 묶인 작업은 ref 콜백으로

React 19부터 ref 콜백이 cleanup 함수를 반환할 수 있다.

```tsx
function LazyImage({ src }: { src: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      ref={(node) => {
        if (!node) return;
        const io = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) { setVisible(true); io.disconnect(); }
        });
        io.observe(node);
        return () => io.disconnect();
      }}
    >
      {visible ? <img src={src} alt="" /> : <Placeholder />}
    </div>
  );
}
```

`useRef` + `useEffect` 조합보다 나은 점은 **노드가 실제로 붙고 떨어지는 시점**에 정확히 실행된다는 것이다. 조건부로 렌더되는 노드에서 Effect는 노드가 없는 상태로 실행될 수 있지만 ref 콜백은 그렇지 않다.

주의할 점: 인라인 ref 콜백은 렌더마다 새 함수이므로, 컴포넌트가 다시 렌더되면 cleanup과 재설정이 반복된다. 자주 렌더되는 컴포넌트라면 콜백을 `useCallback`으로 고정하거나(컴파일러가 있으면 자동) 해당 노드를 별도 컴포넌트로 분리한다.

---

## 4. 올바른 Effect의 조건

### 4-1. 설정과 정리는 대칭이다

```tsx
useEffect(() => {
  const conn = createConnection(roomId);
  conn.connect();
  return () => conn.disconnect();   // connect의 정확한 반대
}, [roomId]);
```

개발 모드 StrictMode는 마운트 직후 **설정 → 정리 → 설정**을 한 번 더 실행한다. 이건 버그가 아니라 검사다. 사용자가 다른 화면에 갔다 돌아오는 상황(재마운트)을 미리 재현해서 정리가 빠진 Effect를 드러낸다. "두 번 실행되니까 ref로 막자"는 검사를 끄는 것이지 문제를 고치는 것이 아니다. 정리 함수를 쓰면 두 번 실행돼도 결과가 같아진다.

### 4-2. 의존성 배열은 선택이 아니라 사실이다

의존성 배열은 "언제 실행할지 고르는 곳"이 아니라 <strong>"Effect 코드가 읽는 반응 값의 목록"</strong>이다. lint 규칙(`react-hooks/exhaustive-deps`)이 그 목록을 코드에서 자동으로 뽑아낸다. 배열에서 값을 빼는 것은 "이 값이 바뀌어도 옛 값을 계속 쓰겠다"는 뜻이고, 그 결과는 오래된 클로저(stale closure) 버그다.

그래서 의존성을 줄이고 싶으면 **배열이 아니라 코드를** 바꾼다.

**① Effect 안에서만 쓰는 함수는 Effect 안으로 옮긴다**

```tsx
// ❌ 렌더마다 새 함수 → 매번 재실행
function createOptions() { return { serverUrl, roomId }; }
useEffect(() => { const c = createConnection(createOptions()); /* ... */ }, [createOptions]);

// ✅
useEffect(() => {
  const c = createConnection({ serverUrl, roomId });
  /* ... */
}, [serverUrl, roomId]);
```

**② 객체 props 대신 원시값을 의존성으로**

```tsx
function ChatRoom({ options }: { options: { roomId: string; serverUrl: string } }) {
  const { roomId, serverUrl } = options;           // 렌더 중 분해
  useEffect(() => { /* ... */ }, [roomId, serverUrl]);  // 부모가 인라인 객체를 넘겨도 안정
}
```

**③ 이전 state 기반 업데이트는 함수형으로**

```tsx
// ❌ messages가 바뀔 때마다 다시 연결
useEffect(() => {
  conn.on('message', (m) => setMessages([...messages, m]));
}, [messages]);

// ✅ messages를 읽지 않는다
useEffect(() => {
  conn.on('message', (m) => setMessages(prev => [...prev, m]));
}, []);
```

**④ 반응할 필요가 없는 값은 `useEffectEvent`로** (다음 절)

---

## 5. `useEffectEvent`: 반응하는 값과 반응하지 않는 값을 나눈다

### 문제

```tsx
function ChatRoom({ roomId, theme }: { roomId: string; theme: Theme }) {
  useEffect(() => {
    const conn = createConnection(roomId);
    conn.on('connected', () => showNotification('연결됨', theme));
    conn.connect();
    return () => conn.disconnect();
  }, [roomId, theme]);   // theme을 빼면 옛 테마로 알림, 넣으면 테마 변경 시 재연결
}
```

요구사항은 두 가지다.

- `roomId`가 바뀌면 **다시 연결해야 한다**. (반응해야 하는 값)
- 알림은 **최신** `theme`으로 띄워야 하지만, `theme`이 바뀌었다고 재연결할 이유는 없다. (읽기만 하는 값)

의존성 배열 하나로는 두 요구를 동시에 표현할 수 없다.

### 해결

```tsx
import { useEffect, useEffectEvent } from 'react';

function ChatRoom({ roomId, theme }: { roomId: string; theme: Theme }) {
  const onConnected = useEffectEvent(() => {
    showNotification('연결됨', theme);   // 호출 시점의 최신 theme
  });

  useEffect(() => {
    const conn = createConnection(roomId);
    conn.on('connected', () => onConnected());
    conn.connect();
    return () => conn.disconnect();
  }, [roomId]);                           // onConnected는 의존성이 아니다
}
```

`useEffectEvent`로 만든 함수는 **항상 최신 props/state를 읽지만, 반응 값으로 취급되지 않는다**. lint도 이 함수를 의존성에서 제외한다.

> 실행 검증(React 19.2+): `theme`을 `'light'`에서 `'dark'`로 바꿔도 연결 Effect는 다시 실행되지 않았다(connect 1회).

### 사용 규칙

- **Effect 안에서만 호출한다.** 렌더 중에 호출하거나 이벤트 핸들러로 쓰지 않는다.
- **다른 컴포넌트나 훅에 넘기지 않는다.**
- **의존성 배열을 속이는 용도로 쓰지 않는다.** "이 Effect가 `roomId`에 반응해야 하는가?"의 답이 "예"라면 `roomId`를 Effect Event 안에 숨기면 안 된다. 기준은 "이 값이 바뀌었을 때 **동기화를 다시 해야 하는가**"다.

이전에는 이 문제를 `useRef`에 최신 값을 저장하는 방식으로 풀었다. `useEffectEvent`는 그 패턴을 공식화하면서, 렌더 중에 ref를 쓰는 규칙 위반(3편 Compiler 규칙)을 피하게 해 준다.

---

## 6. `useLayoutEffect`: 페인트 전에 측정해야 할 때만

```tsx
function Tooltip({ anchorRect, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    setHeight(ref.current!.getBoundingClientRect().height);
  }, []);

  const top = anchorRect.top - height < 0 ? anchorRect.bottom : anchorRect.top - height;
  return <div ref={ref} style={{ position: 'fixed', top }}>{children}</div>;
}
```

`useEffect`로 측정하면 "잘못된 위치로 페인트 → 측정 → 올바른 위치로 다시 페인트"가 되어 툴팁이 한 번 튄다. `useLayoutEffect`는 커밋 직후 **페인트 전에** 동기적으로 실행되므로 사용자는 최종 위치만 본다.

대가도 있다. `useLayoutEffect` 안의 작업과 거기서 일으킨 렌더는 **페인트를 막는다**. 무거운 작업을 넣으면 INP와 프레임이 직접 나빠진다. 쓰는 조건은 "DOM을 측정하고, 그 결과로 페인트 전에 레이아웃을 바꿔야 한다"뿐이다. 서버 렌더에서는 실행되지 않으므로, SSR 화면의 첫 페인트는 여전히 측정 전 상태라는 점도 고려한다(CSS로 초기 숨김 처리 등).

---

## 7. Effect를 쓰기 전 확인 순서

```
"무언가 바뀌면 X를 하고 싶다"
  ├─ X가 값을 만드는가?                       → 렌더 중 계산 (2편)
  ├─ X의 원인이 사용자 행동인가?               → 이벤트 핸들러
  ├─ props 변경 시 state 초기화인가?           → key
  ├─ 부모에게 알리는가?                        → 같은 핸들러에서 호출 / 제어 컴포넌트
  ├─ 다른 state를 연쇄로 바꾸는가?             → 핸들러에서 다음 상태를 한 번에 계산
  ├─ 앱 전체에서 한 번인가?                    → 모듈 스코프 / 진입점
  ├─ 데이터 가져오기인가?                      → 서버 컴포넌트 / 서버 캐시 (5편)
  ├─ 외부 값을 읽는 구독인가?                  → useSyncExternalStore
  ├─ DOM 노드에 붙었다 떨어지는 작업인가?       → ref 콜백
  └─ 화면이 존재하는 동안 외부 시스템과 동기화    → useEffect (+ cleanup)
       ├─ 페인트 전 측정이 필요 → useLayoutEffect
       └─ 반응하지 않을 최신 값 → useEffectEvent
```

그리고 Effect를 쓰게 되면 **이름 있는 커스텀 훅으로 감싼다**. `useOnlineStatus`, `useChatConnection`, `useDocumentTitle`처럼 이름이 붙으면 컴포넌트 본문에는 "무엇을 동기화하는가"만 남고, 구현 방식(Effect냐 `useSyncExternalStore`냐)은 나중에 바꿀 수 있다.

---

## 8. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| Effect가 필요 없는 경우들 | [2편 — useEffect 4대 오용](/posts/frontend-antipatterns-2-state-and-data-flow) |
| Race Condition, 취소 | [5편 — 재시도·타임아웃·취소·롤백](/posts/frontend-antipatterns-5-network-and-failure) |
| `useLayoutEffect`와 측정 | [4편 — 레이아웃 스래싱](/posts/frontend-antipatterns-4-rendering-performance) |
| Effect의 에러 처리 | [8편 — catch 삼키기](/posts/frontend-antipatterns-8-robustness) |

---

## 자가진단 체크리스트

- [ ] Effect 안에서 다른 state를 set해 파생값을 만들지 않는다.
- [ ] POST 요청, 토스트, 클릭 분석 이벤트는 이벤트 핸들러에 있다.
- [ ] Effect가 연쇄로 서로의 의존성을 바꾸지 않는다.
- [ ] 모든 Effect에 설정과 대칭인 cleanup이 있다(필요한 경우).
- [ ] StrictMode 이중 실행을 ref 플래그로 막고 있지 않다.
- [ ] `exhaustive-deps` 경고를 주석으로 끄지 않았다.
- [ ] 외부 값을 읽는 구독은 `useSyncExternalStore`를 쓴다.
- [ ] 최신 값을 읽되 반응하지 않아야 하는 경우 `useEffectEvent`를 쓴다.
- [ ] Effect를 쓰는 로직은 이름 있는 커스텀 훅으로 감쌌다.

---

## 다음 편

2편에서 "서버 상태는 캐시다", 이 편에서 "데이터 가져오기는 Effect의 일이 아니다"라고 결론만 적었다. [5편](/posts/efficient-react-5-data-flow)에서는 그 대안을 구체적으로 다룬다. 요청을 트리 위에서 병렬로 시작하는 법, Suspense 경계를 어디에 둘지 정하는 기준, 서버 컴포넌트와 클라이언트 캐시의 역할 분담, 그리고 Actions와 `useOptimistic`으로 쓰기 작업을 다루는 법이다.
