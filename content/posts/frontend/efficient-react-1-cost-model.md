---
# 📌 기본 메타데이터
title: '효율적인 React 1편 — 비용 모델: React는 무엇에 비용을 쓰는가'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'Rendering', 'Performance', 'Profiler']
description: '렌더를 일으키는 원인 세 가지, 렌더가 전파되는 규칙, 전파가 멈추는 두 조건. 최적화 API를 꺼내기 전에 알아야 할 React의 비용 구조를 정리한다.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 1

# 📚 SEO용
keywords: ['React', 'Rendering', 'Performance', 'Profiler', '효율적인 React']
---

# 효율적인 React 1편 — 비용 모델

> 이 시리즈는 [프론트엔드 안티패턴 시리즈](/posts/frontend-antipatterns-1-how-to-see)의 반대편이다. 안티패턴 시리즈가 "왜 이런 구조가 생기고, 비용이 언제 터지는가"를 다뤘다면, 이 시리즈는 "비용이 애초에 생기지 않는 구조를 어떻게 짜는가"를 다룬다.
>
> Fiber, Lane, Suspense 내부 동작, RSC Payload, 스트리밍 SSR은 [React 렌더링 Deep Dive 시리즈](/posts/react-rendering-principles)에서 다뤘으므로 여기서는 링크만 걸고 다시 설명하지 않는다. 이 시리즈의 초점은 **그 메커니즘을 알고 있을 때 코드를 어떻게 짜는가**이다.

---

## 1. "효율적"이라는 말의 정의

"React를 효율적으로 쓴다"는 말은 보통 "빠르게 만든다"로 읽힌다. 그런데 React 코드의 비용은 세 층에서 발생하고, 그중 속도는 하나일 뿐이다.

| 층 | 무엇이 비싼가 | 측정 수단 |
|---|---|---|
| **사용자 비용** | 늦게 뜨는 화면, 입력 후 반응 지연, 밀려나는 레이아웃 | LCP, INP, CLS |
| **런타임 비용** | 불필요하게 넓은 렌더, 무거운 커밋, 네트워크 Waterfall, 큰 번들 | React DevTools Profiler, Performance 패널 |
| **유지 비용** | "이 값이 왜 바뀌었지?"를 추적하는 시간, 수정 한 번에 건드려야 하는 파일 수 | 버그 수정 시간, 리뷰 난이도 |

세 층은 서로 충돌할 수 있다. 가장 흔한 예가 `useMemo`/`useCallback`을 곳곳에 두르는 경우다.

- 런타임 비용: 일부 렌더가 줄어든다.
- 유지 비용: 의존성 배열이 코드 전체에 퍼지고, 참조 하나가 불안정해지면 메모이제이션 전체가 조용히 무력화된다. 그 사실은 화면에 드러나지 않는다.

그래서 이 시리즈에서 "효율"은 다음을 뜻한다.

> **세 층의 비용이 애초에 생기지 않는 구조를 먼저 만들고, 최적화 API는 그 구조가 한계에 닿았을 때 국소적으로 쓴다.**

이 정의를 받아들이면 공부 순서도 정해진다. API보다 **비용이 어디서 생기는지**를 먼저 알아야 한다.

---

## 2. 렌더를 일으키는 원인은 세 가지뿐이다

컴포넌트 함수가 다시 호출되는 경우는 정확히 세 가지다.

1. **자기 state의 변경**: `useState`, `useReducer`의 setter 호출, 또는 `useSyncExternalStore`로 구독한 외부 스토어의 변경
2. **부모의 렌더**
3. **구독 중인 Context 값의 변경**

"props가 바뀌어서 렌더된다"는 말은 엄밀히 틀렸다. props는 부모가 렌더되면서 만들어 넘기는 값이다. 원인은 **부모의 렌더**이고, props 변경은 그 결과다. 이 차이가 중요한 이유는 다음 규칙 때문이다.

### 전파 규칙: 부모가 렌더되면 자식은 props가 같아도 렌더된다

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>{count}</button>
      <Child label="고정값" />   {/* props가 매번 같다 */}
    </>
  );
}

function Child({ label }: { label: string }) {
  console.log('Child render');   // 버튼을 누를 때마다 찍힌다
  return <p>{label}</p>;
}
```

`label`은 한 번도 바뀌지 않지만 `Child`는 버튼을 누를 때마다 호출된다. React는 기본적으로 props를 비교하지 않는다. 비교 자체도 비용이고, 대부분의 컴포넌트는 비교하는 것보다 그냥 다시 호출하는 편이 싸기 때문이다.

그래서 정확한 멘탈 모델은 다음과 같다.

> **state가 바뀐 컴포넌트를 루트로 하는 하위 트리 전체가 다시 호출 대상이 된다.**

### 렌더는 싸고, 넓은 렌더가 비싸다

"다시 호출된다"가 곧 "느리다"는 뜻은 아니다. 렌더(Render Phase)는 함수를 호출해서 새 element 트리를 만들고 이전 트리와 비교하는 작업이다. DOM을 건드리는 커밋(Commit Phase)은 **실제로 달라진 부분에만** 일어난다. 위 예제에서 `Child`는 렌더되지만 결과가 같아서 DOM 변경은 없다.

비용이 문제가 되는 경우는 세 가지로 좁혀진다.

1. 하위 트리가 **넓다**: 수백\~수천 개 컴포넌트가 함께 호출된다.
2. 개별 렌더가 **무겁다**: 렌더 중에 큰 배열 정렬, 필터링, 포맷팅을 한다.
3. 렌더가 **자주** 일어난다: 입력, 스크롤, 마우스 이동, 타이머처럼 초당 수십 번 바뀌는 state가 트리 위쪽에 있다.

세 조건이 겹치면 사용자가 느낀다. 반대로 말하면 **셋 중 하나만 끊어도** 대부분 해결된다. 이 시리즈의 3편은 1번(넓이)을, 6편은 3번(빈도와 우선순위)을 구조로 끊는 방법을 다룬다.

---

## 3. 전파가 멈추는 두 조건

부모가 렌더됐는데도 자식이 호출되지 않는 경우는 두 가지다.

### 조건 A. `memo`로 감싼 컴포넌트의 props가 얕은 비교로 같을 때

```tsx
const Chart = memo(function Chart({ data }: { data: number[] }) { /* ... */ });
```

`memo`는 이전 props와 새 props의 각 키를 `Object.is`로 비교한다. 모두 같으면 호출을 건너뛴다. 여기서 흔한 함정이 생긴다.

```tsx
function Page() {
  const [q, setQ] = useState('');
  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} />
      <Chart data={[1, 2, 3]} />          {/* 매 렌더마다 새 배열 → memo 무력화 */}
      <Chart data={STATIC_DATA} />        {/* 모듈 상수 → memo 동작 */}
    </>
  );
}
```

인라인 객체, 배열, 함수는 렌더마다 새로 만들어지므로 `Object.is` 비교에서 항상 다르다. `memo`를 쓰려면 **넘기는 쪽**이 참조를 안정적으로 유지해야 한다. 그래서 `memo` 하나가 부모 쪽의 `useMemo`/`useCallback`을 연쇄적으로 요구하게 된다. 앞에서 말한 유지 비용이 여기서 생긴다.

### 조건 B. 자식 element 객체의 참조가 이전 렌더와 같을 때

이 조건은 덜 알려져 있지만 더 강력하다.

```tsx
function App() {
  return (
    <ScrollTracker>
      <HeavyContent />
    </ScrollTracker>
  );
}

function ScrollTracker({ children }: { children: React.ReactNode }) {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div>
      <ProgressBar y={y} />
      {children}
    </div>
  );
}
```

스크롤할 때마다 `ScrollTracker`가 렌더되지만 `HeavyContent`는 **처음 한 번만** 호출된다. `memo`는 어디에도 없다.

메커니즘은 이렇다.

1. `<HeavyContent />`라는 JSX는 `React.createElement(HeavyContent)` 호출이고, 결과는 평범한 객체다.
2. 이 객체를 <strong>만든 쪽은 `App`</strong>이다. `ScrollTracker`는 그 객체를 `children` prop으로 **받기만** 한다.
3. `ScrollTracker`의 state가 바뀌어도 `App`은 렌더되지 않는다. 그래서 `children`은 이전 렌더와 **같은 객체**다.
4. React는 재조정 중에 "이전 element와 새 element가 같은 객체이고, 걸려 있는 업데이트도 없다"는 것을 확인하면 그 하위 트리를 건너뛴다(bail-out).

즉 **element를 누가 만들었는가**가 렌더 전파의 경계를 정한다. 이 성질은 3편에서 "구조로 렌더 범위 줄이기"의 핵심 도구로 다시 쓴다.

> 실행 검증(React 19, jsdom): `ScrollTracker` state를 두 번 바꾸면 `ScrollTracker`는 3회, `HeavyContent`는 1회 호출됐다.

### 번외: 같은 값으로 setState하면

```tsx
setCount(0); // 이미 0이면
```

새 값이 이전 값과 `Object.is`로 같으면 React는 렌더를 건너뛴다. 다만 문서상으로는 "건너뛰기 전에 해당 컴포넌트를 한 번 더 호출할 수 있다"고 되어 있으니, 부수효과가 렌더 횟수에 의존하도록 짜면 안 된다. 객체 state는 내용이 같아도 새 객체를 넣으면 다른 값으로 취급된다.

```tsx
setUser({ ...user });  // 내용이 같아도 새 참조 → 렌더
```

---

## 4. Context는 전파 규칙의 예외다

Context 구독은 트리의 부모-자식 관계를 **건너뛰는** 렌더 경로다.

```tsx
const AppContext = createContext<{ user: User; setUser: (u: User) => void } | null>(null);

function Provider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(guest);
  return (
    <AppContext value={{ user, setUser }}>   {/* React 19: Context를 Provider로 직접 사용 */}
      {children}
    </AppContext>
  );
}

const LogoutButton = memo(function LogoutButton() {
  const { setUser } = useContext(AppContext)!;  // setUser만 쓴다
  return <button onClick={() => setUser(guest)}>로그아웃</button>;
});
```

`user`가 바뀌면 `LogoutButton`도 렌더된다. 이유는 두 가지다.

1. `value={{ user, setUser }}`는 Provider가 렌더될 때마다 새 객체다.
2. Context 값이 `Object.is`로 달라지면 **그 Context를 읽는 모든 컴포넌트**가 렌더되고, `memo`는 이 경로를 막지 못한다. `memo`는 부모에서 오는 렌더만 막는다.

"`setUser`만 쓰는데 왜 렌더되나"라는 질문의 답은 **Context는 값 전체 단위로 구독된다**는 것이다. 필드 단위 구독은 없다. 해결 방법(Context 분리, 외부 스토어와 selector)은 3편에서 다룬다.

> 실행 검증: `{state, setState}`를 하나의 Context에 담으면 `memo`로 감싼 소비자가 state 변경마다 렌더됐고(2회), `setState`만 담은 별도 Context의 소비자는 렌더되지 않았다(1회).

---

## 5. 배칭: 여러 setState는 한 번의 렌더

```tsx
function handleSubmit() {
  setLoading(true);
  setError(null);
  setCount(c => c + 1);
  // 렌더는 한 번
}
```

React 18부터 이벤트 핸들러뿐 아니라 `setTimeout`, Promise 콜백, 네이티브 이벤트 핸들러 안의 업데이트도 자동으로 배칭된다. 그래서 "setState를 여러 번 부르면 렌더도 여러 번"이라는 걱정은 필요 없다.

다만 배칭이 **상태 설계의 문제를 가려 준다**는 점은 알아 둘 필요가 있다. `loading`, `error`, `data`를 따로 set해도 렌더는 한 번이라 겉보기에는 문제가 없다. 하지만 `loading: true`와 `error: "..."`가 동시에 참인 상태는 여전히 만들 수 있다. 이건 렌더 비용이 아니라 유지 비용의 문제이고, 2편에서 다룬다.

---

## 6. 측정: 추측 대신 무엇을 볼 것인가

지금까지의 모델로 "어디가 느릴 것 같다"는 가설은 세울 수 있다. 가설을 확인하는 도구는 다음과 같다.

### React DevTools Profiler

1. 설정(톱니바퀴) → Profiler → <strong>"Record why each component rendered while profiling"</strong>을 켠다.
2. 녹화 버튼을 누르고 느린 상호작용을 한 번 수행한 뒤 멈춘다.
3. **Flamegraph**에서 커밋 하나를 선택한다.
   - 회색 막대: 이번 커밋에서 렌더되지 않은 컴포넌트
   - 색 막대: 렌더된 컴포넌트. 노란색에 가까울수록 오래 걸렸다.
4. 컴포넌트를 선택하면 "Why did this render?"에 원인이 나온다.
   - `The parent component rendered` → 원인 2. 구조 문제일 가능성이 크다.
   - `Hook N changed` → 원인 1. 어떤 state인지 확인한다.
   - `Context changed` → 원인 3. Context 설계를 확인한다.

이 세 문구가 2절의 세 원인과 그대로 대응한다. 원인을 알면 해결 방향도 정해진다.

### "Highlight updates when components render"

DevTools 설정에서 켜면 렌더되는 컴포넌트에 테두리가 깜빡인다. 입력 한 글자에 화면 전체가 깜빡이면 state가 너무 위에 있다는 신호다. 정밀 측정이 아니라 **렌더 반경을 눈으로 확인하는 용도**다.

### Chrome Performance 패널

React 19.2부터 Performance 패널에 React 전용 트랙(Scheduler, Components)이 추가되어, 어떤 우선순위의 작업이 언제 실행됐는지 브라우저 타임라인 위에서 볼 수 있다. INP가 나쁠 때 "입력 → 이벤트 핸들러 → 렌더 → 커밋 → 페인트" 중 어느 구간이 긴지 확인하는 용도다.

### 측정할 때 지킬 것

- **프로덕션 빌드로 측정한다.** 개발 모드는 StrictMode의 이중 렌더와 추가 검사 때문에 느리다. 개발 모드 수치로 최적화 여부를 판단하면 안 된다.
- **CPU 스로틀링(4x\~6x)을 켠다.** 개발자 기기에서 16ms 걸리는 작업은 중저가 모바일에서 60\~100ms가 된다.
- **상호작용 단위로 측정한다.** "페이지가 느리다"가 아니라 "검색창에 한 글자 입력 시 커밋 120ms"처럼 기록한다.

---

## 7. 판단 흐름

1편의 내용을 판단 순서로 정리하면 다음과 같다. 이후 편은 각 가지를 하나씩 깊게 다룬다.

```
느린 상호작용 발견
  └─ 프로덕션 빌드 + CPU 스로틀링으로 측정
       ├─ 렌더 범위가 넓다 (회색이 적다)
       │    ├─ "parent rendered" → state 위치 확인 (2·3편)
       │    ├─ "context changed" → Context 분할 / selector (3편)
       │    └─ 구조로 안 되면 → Compiler / memo (3편)
       ├─ 개별 렌더가 무겁다 (노란 막대)
       │    └─ 파생 계산 캐시, 긴 작업은 transition (2·6편)
       ├─ 렌더는 가벼운데 여러 번 커밋된다
       │    └─ Effect 연쇄 확인 (4편)
       ├─ 렌더 전에 이미 늦다 (데이터 대기)
       │    └─ Waterfall, Suspense 경계 (5편)
       └─ 첫 로드가 늦다
            └─ 번들, 클라이언트 경계 (7편)
```

---

## 8. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| 비용 3층, 측정 장치 | [1편 — 비용 곡선, 설명 가능성, 측정 장치 5종](/posts/frontend-antipatterns-1-how-to-see) |
| 전파 규칙과 memo의 한계 | [4편 — memo 도배 vs 방치, 병목의 실제 순서](/posts/frontend-antipatterns-4-rendering-performance) |
| Context는 값 전체 단위 구독 | [2편 — 성급한 Context 전역화](/posts/frontend-antipatterns-2-state-and-data-flow) |

---

## 자가진단 체크리스트

- [ ] 렌더를 일으키는 원인 세 가지를 말할 수 있다.
- [ ] "props가 같으면 자식은 렌더되지 않는다"가 왜 틀렸는지 설명할 수 있다.
- [ ] `children`으로 받은 element가 왜 다시 렌더되지 않는지 "element를 만든 쪽" 관점으로 설명할 수 있다.
- [ ] `memo`로 감싼 컴포넌트가 Context 변경 시 렌더되는 이유를 안다.
- [ ] Profiler의 "Why did this render?" 세 문구를 원인 세 가지와 연결할 수 있다.
- [ ] 성능을 개발 모드가 아니라 프로덕션 빌드와 CPU 스로틀링 환경에서 측정한다.

---

## 다음 편

렌더 비용을 줄이는 가장 확실한 방법은 **렌더를 일으킬 state 자체를 줄이는 것**이다. [2편](/posts/efficient-react-2-state-design)에서는 state를 최소로 유지하는 법, 파생값을 계산으로 바꾸는 법, 그리고 state를 서버·URL·폼·UI·전역 다섯 종류로 나눠 각각 알맞은 자리에 두는 법을 다룬다.
