---
# 📌 기본 메타데이터
title: '프론트엔드 디자인 패턴 (1) — 전체 지도: 상태는 어디에 사는가'
date: '2026-09-14'
category: 'frontend'
tags: ['Frontend', 'Design Pattern', 'Architecture', 'React', 'History']
description: 'jQuery부터 RSC까지, 프론트엔드 패턴의 역사를 하나의 질문으로 관통한다 — 상태는 어디에 살고, 변경은 어떻게 전파되며, 누가 그것을 소유하는가.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 디자인 패턴'
seriesOrder: 1

# 📚 SEO용
keywords: ['Frontend', 'Design Pattern', 'Architecture', 'React', 'History', '프론트엔드 디자인 패턴']
---

# 프론트엔드 디자인 패턴 (1) — 전체 지도

패턴 이름을 외우는 건 의미가 없습니다. HOC가 뭔지, Compound Component가 뭔지 정의만 아는 상태로는 새로운 패턴을 만났을 때 여전히 판단할 수 없습니다.

대신 이 시리즈는 하나의 질문으로 전체를 관통합니다.

> **상태(state)는 어디에 살고, 그 변경은 어떻게 전파되며, 누가 그것을 소유하는가?**

Observer부터 Signals까지, Mixin부터 React Server Components까지 — 프론트엔드가 만들어낸 모든 패턴은 이 질문에 대한 서로 다른 대답입니다. 각 시대가 **무엇 때문에 아팠고**, 그래서 **무엇을 포기하고 무엇을 얻었는지**를 잡으면, 처음 보는 패턴도 좌표에 찍을 수 있게 됩니다.

이번 편은 전체 지도입니다. 2편부터는 각 영역을 코드로 파고듭니다.

---

## 0. 왜 GoF 패턴은 프론트엔드에서 그대로 안 맞는가

1994년 GoF(Gang of Four)의 『Design Patterns』는 C++와 Smalltalk 맥락에서 쓰였습니다. 그 세계의 전제는 이랬습니다.

- 프로그램은 오래 살아있고, 객체 그래프가 장기간 유지된다
- 클래스는 컴파일 타임에 고정되고, 확장은 상속이나 합성으로 한다
- 상태 변경은 대체로 메서드 호출로 명시적으로 일어난다

프론트엔드는 이 셋이 전부 다릅니다.

**첫째, UI는 시간에 따라 변하는 상태의 투영입니다.** 객체의 정체성보다 "지금 이 순간의 화면"이 중요합니다.

**둘째, 이벤트 주도입니다.** 클릭, 네트워크 응답, 타이머, 다른 탭의 변경 — 변경의 진입점이 사방에 흩어져 있습니다.

**셋째, 런타임이 매번 새로 시작합니다.** 새로고침 한 번이면 모든 객체 그래프가 사라집니다. 그래서 "객체의 생명주기 관리"보다 "상태의 재구성 가능성"이 중요합니다.

그 결과 GoF 패턴 중 프론트엔드에서 실제로 살아남은 건 극소수입니다. **Observer**(압도적 1위), **Command**(Redux의 action), **Strategy**(함수를 prop으로 넘기는 모든 것), **Facade**(라이브러리 래핑), **Proxy**(MobX, Vue 반응성), **Decorator**(미들웨어, HOC) 정도입니다. Abstract Factory, Bridge, Visitor 같은 건 프론트엔드 코드에서 거의 볼 일이 없습니다 — AST를 다룰 때나 나오죠.

대신 프론트엔드는 **자기만의 패턴군**을 만들어냈습니다. Render Props, Hooks, Compound Component, Headless — 이것들은 GoF 목록에 없습니다. 왜 없을까요? GoF 시대에는 "선언적 UI 트리"라는 문제 자체가 없었기 때문입니다.

이게 이 시리즈의 두 번째 축입니다. **프론트엔드 고유 패턴은 "UI 트리"라는 자료구조 위에서만 의미가 있습니다.**

---

## 1. DOM 직접 조작기 (~2010) — 상태가 DOM에 살던 시절

### 문제

```javascript
$('#cart-count').text(items.length);
$('#checkout-btn').prop('disabled', items.length === 0);
if (items.length > 0) $('#empty-message').hide();
```

여기서 **진실의 원천(source of truth)은 어디입니까?** `items`처럼 보이지만, 실제로는 DOM입니다. 새 개발자가 `#cart-count`의 텍스트를 읽어서 로직을 짜는 순간, DOM이 정식 상태 저장소가 됩니다.

이 시대의 근본 문제는 **동기화 비용이 O(N×M)** 이라는 것이었습니다. N개의 UI 요소와 M개의 상태 변경 경로가 있으면, 최악의 경우 N×M개의 갱신 코드를 손으로 써야 합니다. 장바구니에 UI 요소 하나를 추가하면? 상태를 바꾸는 모든 곳을 찾아다녀야 합니다.

### 이 시대의 패턴

**Module 패턴** — ES 모듈이 없던 시절, IIFE로 스코프를 만들었습니다.

```javascript
var CartModule = (function () {
  var items = [];                              // private
  function add(item) { items.push(item); render(); }
  return { add: add };                         // public API
})();
```

클로저로 캡슐화를 흉내 낸 것이죠. 오늘날 `import/export`가 하는 일을 언어 기능 없이 해냈습니다. `#private` 필드와 모듈 시스템이 생긴 지금은 역사적 유물입니다.

**Pub/Sub (발행-구독)** — 모듈 간 직접 참조를 끊기 위한 첫 시도.

```javascript
EventBus.on('cart:changed', updateHeader);
EventBus.emit('cart:changed', items);
```

Observer와 뭐가 다른가? **중개자의 존재**입니다. Observer는 subject가 observer 목록을 직접 들고 있습니다(서로를 압니다). Pub/Sub은 이벤트 버스가 중간에 있어서 발행자와 구독자가 서로를 모릅니다.

결합도는 낮아지지만, 대가로 **"이 이벤트를 누가 듣고 있는가"를 정적으로 알 수 없게** 됩니다. 이 트레이드오프는 지금도 유효합니다. 전역 이벤트 버스가 대규모 앱에서 악명 높은 이유죠.

**Facade** — jQuery 그 자체가 거대한 Facade였습니다. `addEventListener` vs `attachEvent`, `XMLHttpRequest` vs `ActiveXObject` 같은 브라우저 파편화를 하나의 API 뒤에 숨겼습니다.

jQuery가 쇠퇴한 이유는 "설계가 나빠서"가 아니라 **감춰야 할 차이가 사라져서**입니다. Facade의 수명은 그것이 감추는 복잡성의 수명과 같습니다.

**Fluent Interface (체이닝)** — `$('.item').addClass('x').fadeIn().on('click', f)`. 매 메서드가 `this`를 반환하는 것. 지금도 살아있습니다. Drizzle ORM, Zod(`z.string().min(3).email()`), TanStack Query 빌더가 전부 같은 패턴입니다.

### 왜 무너졌나

앱이 커지면서 "DOM이 곧 상태"라는 전제가 감당이 안 됐습니다. 다음 시대의 통찰은 단순합니다. **상태를 DOM 밖으로 꺼내자.**

---

## 2. MV* 시대 (2010~2014) — Observer가 왕좌에 오르다

Backbone, Knockout, Angular 1, Ember의 시대입니다. 핵심 아이디어는 이렇습니다.

> 상태는 Model에 산다. View는 Model을 **구독**해서, 변하면 자기를 갱신한다.

Observer 패턴의 전면 도입입니다. 동기화 비용이 O(N×M)에서 O(N+M)으로 떨어집니다 — 각 View는 자기가 구독한 Model만 알면 되니까요.

### MVC / MVP / MVVM을 정확히 구분하기

이 셋은 **View와 상태 사이에 무엇이 서 있는가**로 갈립니다.

**MVC (Backbone)** — View가 Model을 **직접** 구독합니다.

```javascript
var CartView = Backbone.View.extend({
  initialize: function () {
    this.listenTo(this.model, 'change', this.render);  // View → Model 직접 의존
  },
  render: function () { /* ... */ }
});
```

Controller의 경계가 흐릿합니다. Backbone에는 사실 Controller가 없고, View가 이벤트 핸들링까지 다 합니다. 그래서 "Backbone은 MV*"라고 부르죠.

**MVP** — Presenter가 View 인터페이스를 통해서만 View를 조작합니다. View는 수동적(Passive View)이 되고, Presenter를 DOM 없이 테스트할 수 있게 됩니다. 안드로이드 진영에서 유행했고 웹에서는 상대적으로 덜 쓰였습니다.

**MVVM (Knockout, Angular 1, Vue)** — **ViewModel + 바인딩 엔진**. 개발자가 구독을 손으로 쓰지 않습니다. 선언만 하면 프레임워크가 Observer 배선을 자동으로 합니다.

```html
<input data-bind="value: userName">   <!-- Knockout -->
<input ng-model="user.name">          <!-- Angular 1 -->
```

이게 **양방향 바인딩(two-way binding)** 입니다. View가 바뀌면 Model이 바뀌고, Model이 바뀌면 View가 바뀝니다.

### 양방향 바인딩의 근본 문제

양방향 바인딩은 데모에서 마법 같고 실무에서 지옥입니다. 이유는 **변경의 인과 그래프가 순환(cycle)을 갖기 때문**입니다.

`A`가 바뀌면 watcher가 `B`를 바꾸고, `B`의 watcher가 `C`를 바꾸고, `C`의 watcher가 다시 `A`를 건드린다고 해봅시다. Angular 1의 그 악명 높은 에러가 여기서 나옵니다.

```
10 $digest() iterations reached. Aborting!
```

Angular 1은 **더티 체킹(dirty checking)** 으로 반응성을 구현했습니다. 이벤트가 끝날 때마다 모든 watcher의 값을 이전 값과 비교하고, 하나라도 바뀌었으면 다시 전체를 돌립니다. 최대 10회까지 돌려보고, 그래도 안정화가 안 되면 포기하고 던지는 겁니다.

문제의 본질은 성능이 아닙니다. **"이 값이 왜 이렇게 됐는가"를 역추적할 수 없다**는 것입니다. 변경의 출처가 없으니 브레이크포인트를 어디에 찍을지조차 알 수 없습니다.

> **여기서 배울 원리:** 자유로운 양방향 전파는 추적 가능성을 희생한다. 다음 시대는 정확히 이 대가를 거부하면서 시작됩니다.

---

## 3. 단방향 데이터 흐름 (2014~) — React와 Flux

### React의 진짜 통찰

React를 "Virtual DOM 라이브러리"로 이해하면 절반만 이해한 것입니다. VDOM은 **구현 전략**이지 아이디어가 아닙니다. React의 아이디어는 이겁니다.

> **UI = f(state).** 렌더링을 순수하고 멱등한 함수로 만든다.

10년 전의 명령형 코드가 "무엇이 바뀌었는지 계산해서 DOM을 어떻게 고칠지" 지시했다면, React는 "이 상태일 때 화면은 이렇게 생겼다"만 선언합니다. **어떻게 도달할지는 런타임의 문제로 내려보냅니다.**

VDOM diff는 이 선언을 성능적으로 감당 가능하게 만드는 장치일 뿐입니다. 실제로 Svelte는 컴파일로, Solid는 Signal로 같은 선언성을 VDOM 없이 달성합니다.

### Flux — 방향의 강제

```
Action → Dispatcher → Store → View
   ↑                            ↓
   └────────────────────────────┘
```

Flux는 Observer를 버리지 않았습니다. **Observer에 방향을 강제**했습니다. View는 Store를 구독하지만, Store를 직접 바꿀 수는 없습니다. 반드시 Action을 발행해야 합니다. 사이클이 하나의 방향으로만 돕니다.

이게 왜 결정적이냐면 — **디버깅이 가능해집니다.** 상태가 이상하면 액션 로그만 보면 됩니다. "무엇이 이 상태를 만들었는가"에 항상 답이 있습니다.

### Redux — 두 개의 고전 패턴이 만나다

Redux는 Flux를 단순화하면서 두 가지를 추가했습니다. **단일 스토어**와 **순수 리듀서**입니다.

```typescript
type Reducer<S, A> = (state: S, action: A) => S;
```

이 시그니처를 잘 보세요. `Array.prototype.reduce`의 시그니처입니다. 즉 **애플리케이션의 현재 상태 = 초기 상태에 모든 액션을 순서대로 fold한 결과**입니다.

여기서 두 패턴이 보입니다.

**Command 패턴** — action은 "무엇을 해달라"는 요청을 **객체로 구체화(reify)** 한 것입니다. 객체이기 때문에 로깅할 수 있고, 직렬화할 수 있고, 큐에 넣을 수 있고, 되돌릴 수 있습니다. Redux DevTools의 타임트래블은 공짜로 얻어진 게 아니라 이 설계의 필연적 결과입니다.

**Event Sourcing의 냄새** — 상태를 저장하는 게 아니라 상태를 만든 사건들을 저장한다는 발상. 물론 Redux는 진짜 Event Sourcing은 아닙니다(과거 액션을 영구 보관하지 않으니까요). 하지만 사고방식은 같습니다.

**미들웨어**는 또 다른 고전 패턴입니다.

```typescript
const logger: Middleware = (store) => (next) => (action) => {
  console.log('dispatching', action);
  const result = next(action);          // 다음 미들웨어로 넘김
  console.log('next state', store.getState());
  return result;
};
```

`next`를 호출해서 체인의 다음으로 넘기는 이 구조 — **Chain of Responsibility** 이자 **Decorator**입니다. Express 미들웨어, Koa의 onion model, Axios 인터셉터, Next.js middleware가 전부 같은 모양입니다. 한 번 이 형태를 알아보면 백엔드/프론트 가리지 않고 계속 보입니다.

### 치른 대가

- **보일러플레이트** — 액션 타입, 액션 생성자, 리듀서, 셀렉터. 값 하나 바꾸는 데 파일 네 개.
- **잘못된 유혹** — "전역 스토어가 있으니 모든 상태를 여기 넣자." 서버에서 받아온 데이터까지 Redux에 밀어 넣었고, 이게 6장에서 터집니다.

---

## 4. 로직 재사용의 역사 — 프론트엔드 고유 패턴의 본진

이 장이 전체 시리즈에서 가장 중요합니다. **"상태를 가진 로직(stateful logic)을 어떻게 재사용하는가"** — 이 질문에 React 생태계는 10여 년간 네 번 답을 바꿨습니다. 그리고 매번 앞의 답이 왜 실패했는지가 다음 답의 설계도가 됐습니다.

### (1) Mixins — 2013

```javascript
const TimerMixin = {
  componentDidMount() { this.timer = setInterval(this.tick, 1000); },
  componentWillUnmount() { clearInterval(this.timer); }
};
React.createClass({ mixins: [TimerMixin], /* ... */ });
```

**실패한 이유 세 가지:**

1. **이름 충돌** — 두 믹스인이 같은 메서드 이름을 쓰면? 조용히 깨집니다.
2. **암묵적 의존성** — 믹스인이 `this.state.x`를 읽는다면 그 컴포넌트는 `x`를 가져야 합니다. 하지만 어디에도 명시되지 않습니다.
3. **출처 불명** — 컴포넌트에서 `this.someValue`를 봤을 때, 이게 어느 믹스인에서 왔는지 추적 불가.

핵심 병폐는 **"네임스페이스를 병합한다"** 는 발상 자체입니다. 여기서 얻을 교훈: **암묵적 주입은 규모에서 반드시 무너진다.**

### (2) HOC (Higher-Order Component) — 2015~2018

함수형 사고의 도입입니다. **컴포넌트를 받아 컴포넌트를 반환하는 함수.**

```typescript
const withUser = <P extends object>(
  Wrapped: React.ComponentType<P & { user: User }>
) => (props: P) => {
  const user = useSomeStore();
  return <Wrapped {...props} user={user} />;
};
```

믹스인의 이름 충돌은 사라졌습니다(합성은 명시적이니까). 하지만:

1. **Wrapper Hell** — `withRouter(connect(mapState)(withTheme(withAuth(Component))))`. DevTools를 열면 실제 컴포넌트 하나에 래퍼가 열 겹 쌓여 있습니다.
2. **Prop 출처 불명** — 믹스인 문제의 재발입니다. `props.user`가 어느 HOC에서 온 건지 모릅니다.
3. **타입 지옥** — 제네릭으로 prop을 주입/제거하는 타입을 TypeScript로 정확히 표현하기가 대단히 어렵습니다.
4. **ref와 정적 메서드가 안 뚫림** — `forwardRef`, `hoist-non-react-statics` 같은 우회 장치가 필요했습니다.

### (3) Render Props — 2017

주입을 **명시적**으로 만든 답입니다.

```tsx
<MouseTracker render={({ x, y }) => <Cursor x={x} y={y} />} />
```

`x`, `y`가 어디서 왔는지 **코드에 그대로 보입니다.** 출처 불명 문제가 사라졌습니다. 하지만:

```tsx
<Auth>{(user) =>
  <Theme>{(theme) =>
    <Data user={user}>{(data) =>
      <Actual user={user} theme={theme} data={data} />
    }</Data>
  }</Theme>
}</Auth>
```

**콜백 지옥의 JSX 버전**입니다. 게다가 이 중첩이 전부 실제 컴포넌트 트리에 존재합니다.

### (4) Hooks — 2019, 그리고 왜 이게 근본적인가

여기서 한 번 멈춰서 생각해 봅시다. **HOC와 Render Props의 공통점이 뭘까요?**

둘 다 **컴포넌트 트리의 구조를 변형해서 로직을 주입**합니다. 로직이 필요하면 계층을 하나 더 만들어야 했습니다. 재사용할 로직이 늘어날수록 트리가 깊어집니다. 이게 두 패턴이 공유한 근본 한계입니다.

Hooks는 이 전제를 깹니다.

```typescript
function useMouse() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return pos;
}

// 사용하는 쪽 — 트리는 그대로다
function Cursor() {
  const { x, y } = useMouse();
  const theme = useTheme();
  const user = useAuth();
  // ...
}
```

세 개의 로직을 가져왔는데 **트리 깊이는 0만큼 늘어났습니다.** 로직 재사용을 UI 계층 구조에서 완전히 분리한 것 — 이게 Hooks의 진짜 기여입니다. 반환값이 그냥 값이라 이름을 내가 정한다는 점에서 출처 불명 문제도 해결됩니다.

**대가는 무엇인가?**

Hooks는 마법이 아니라 **규약(convention)** 위에 서 있습니다. 훅은 호출 순서로 자기 상태를 식별합니다. React 내부적으로 각 컴포넌트 인스턴스는 훅 상태의 **연결 리스트**를 들고 있고, 렌더마다 순서대로 꺼내 씁니다. 그래서 조건문 안에서 훅을 호출하면 순서가 틀어지면서 무너집니다.

"Rules of Hooks"는 스타일 가이드가 아니라 **런타임 무결성 조건**입니다. 언어가 강제하지 못해서 ESLint 플러그인이 대신 강제하고 있죠.

그리고 클로저입니다.

```typescript
useEffect(() => {
  const id = setInterval(() => console.log(count), 1000);  // count가 박제됨
  return () => clearInterval(id);
}, []);   // ← 의존성 배열이 거짓말을 하고 있다
```

의존성 배열은 **"이 클로저가 포착한 값 중 무엇이 바뀌면 다시 만들어야 하는가"** 를 개발자가 손으로 선언하는 장치입니다. 원래 컴파일러가 할 일입니다. React Compiler(구 React Forget)가 등장한 이유가 정확히 이것 — 사람이 수동으로 관리하던 메모이제이션과 의존성 추적을 컴파일 타임으로 되돌려놓는 것입니다.

> **이 장의 관통 원리:** 좋은 추상은 "무엇을 감추는가"가 아니라 **"감춘 대가로 무엇을 명시적으로 만들었는가"** 로 평가해야 합니다. Hooks는 트리 구조를 감추는 대신 데이터 흐름을 코드 한 줄로 드러냈습니다.

---

## 5. 컴포넌트 API 설계 패턴 — 제어권을 어디까지 넘길 것인가

4장이 "로직 재사용" 축이었다면, 이 장은 **직교하는 다른 축**입니다. 컴포넌트를 **남에게 쓰라고 내놓을 때**의 설계 문제죠. 관통하는 질문 하나:

> 컴포넌트가 얼마나 많은 결정을 스스로 하고, 얼마나 많은 결정을 사용자에게 넘기는가?

### Container / Presentational

"데이터를 가져오는 컴포넌트"와 "그리는 컴포넌트"를 나누자는 것. 2015년 Dan Abramov가 대중화했고, **2019년에 본인이 공개적으로 철회**했습니다. 이유는 Hooks가 나오면서 "데이터를 가져오려면 별도 컴포넌트가 필요하다"는 전제가 사라졌기 때문입니다.

이 사건 자체가 좋은 교훈입니다. **많은 패턴은 언어/런타임의 결핍을 메우는 임시 구조물**이고, 결핍이 해소되면 함께 사라져야 합니다. 지금도 관성으로 이 구조를 강요하는 코드베이스가 많습니다.

### Compound Component

```tsx
<Select value={v} onChange={setV}>
  <Select.Trigger />
  <Select.Content>
    <Select.Option value="a">A</Select.Option>
  </Select.Content>
</Select>
```

부모가 Context로 상태를 내려주고, 자식들이 암묵적으로 소비합니다. HTML의 `<select>/<option>`, `<table>/<tr>/<td>` 관계를 흉내 낸 것이죠.

- **얻는 것** — 배치의 자유. 사용자가 Trigger와 Content 사이에 아무거나 끼워 넣을 수 있습니다. prop이 20개짜리 괴물 API가 안 됩니다.
- **잃는 것** — **계약이 타입으로 표현되지 않습니다.** `<Select.Option>`을 `<Select>` 밖에 쓰면 컴파일은 통과하고 런타임에 터집니다.

### Control Props와 State Reducer

**제어/비제어(controlled/uncontrolled)** 는 HTML 폼 요소에서 온 개념입니다. `<input value={v} onChange={f}>` 는 제어, `<input defaultValue="x">` 는 비제어. 컴포넌트가 상태를 스스로 들고 있을지, 밖에서 받을지의 문제입니다.

Kent C. Dodds가 이걸 극한까지 밀어붙인 게 **State Reducer** 패턴입니다.

```typescript
const { isOpen } = useSelect({
  items,
  stateReducer: (state, { changes, type }) => {
    // "선택해도 닫히지 않게" 같은 내부 동작을 사용자가 덮어쓴다
    if (type === 'ItemClick') return { ...changes, isOpen: true };
    return changes;
  }
});
```

컴포넌트가 "다음 상태는 이겁니다"라고 **제안**하고, 사용자가 그걸 가로채 수정합니다. **제어의 역전(Inversion of Control)** 의 가장 깔끔한 사례 중 하나입니다. 라이브러리는 모든 요구사항을 예측할 필요가 없어지고, 대신 상태 전이 자체를 확장 지점으로 열어둡니다.

### Headless — 현재의 성숙한 답

Radix UI, Headless UI, TanStack Table, Downshift가 여기 속합니다. **동작(behavior)과 표현(presentation)을 완전히 분리**합니다.

Headless 라이브러리가 제공하는 것: 키보드 내비게이션, 포커스 트랩, ARIA 속성, 상태 전이, 포지셔닝, 외부 클릭 감지.
제공하지 않는 것: **스타일 한 줄도 없습니다.**

왜 이 분리가 맞는가? 실무에서 **디자인은 바뀌지만 접근성 요구사항과 상호작용 로직은 안 바뀌기 때문**입니다. Bootstrap/Material UI 시대에 겪은 고통 — 디자인 시스템 하나 바꾸겠다고 라이브러리를 통째로 걷어내야 했던 그 고통 — 을 축으로 재단한 결과입니다.

**asChild / Slot 패턴**은 그 연장선입니다.

```tsx
<Tooltip.Trigger asChild>
  <MyButton />   {/* Trigger의 동작을 내 컴포넌트에 "주입"한다 */}
</Tooltip.Trigger>
```

래퍼 DOM 노드를 추가하지 않고 동작만 합성합니다. `as` prop(polymorphism)의 더 안전한 후계자입니다.

> **이 축의 스펙트럼:** 다 알아서 해주는 컴포넌트 ↔ 아무것도 안 해주지만 뭐든 되는 컴포넌트. 정답은 없고, **누가 쓰느냐**로 결정됩니다. 사내 제품 팀이면 결정을 많이 해주는 쪽, 오픈소스면 넘기는 쪽.

---

## 6. 상태의 재분류 (2020~) — 우리가 상태라 부르던 것의 정체

### 결정적 깨달음

React Query(현 TanStack Query)와 SWR이 던진 질문은 이것이었습니다.

> Redux에 넣던 것의 대부분은 **상태가 아니라 서버 데이터의 캐시**가 아니었나?

`users`, `posts`, `orders` — 이것들의 진실의 원천은 클라이언트가 아니라 **서버**입니다. 클라이언트가 들고 있는 건 사본이고, 사본은 언제든 낡습니다(stale). 낡은 사본에 필요한 건 리듀서가 아니라 **캐시 정책**입니다. TTL, 무효화, 재검증, 중복 요청 제거, 낙관적 업데이트.

Redux로 서버 데이터를 다루면 이 전부를 손으로 짜야 했습니다. `isLoading`, `error`, `data` 세 필드를 리듀서마다 복붙하던 그 시절이죠.

### 상태의 4분류 — 실무에서 가장 유용한 분류법

| 종류 | 진실의 원천 | 적합한 도구 |
|------|-------------|-------------|
| **서버 상태** | 서버 | TanStack Query, SWR, RSC |
| **클라이언트 전역 상태** | 브라우저 메모리 | Zustand, Jotai, Context |
| **폼 상태** | 입력 중인 사용자 | React Hook Form, 비제어 input |
| **URL 상태** | 주소창 | 라우터의 searchParams |

**URL 상태를 별도로 두는 게 중요합니다.** 필터, 정렬, 페이지 번호, 탭 선택 — 이것들을 `useState`에 넣는 순간 공유 가능성과 뒤로가기를 잃습니다. "새로고침해도 유지돼야 하는가? 링크로 공유돼야 하는가?"가 예이면 URL이 그 상태의 집입니다.

이 분류를 한 뒤에 Redux에 남는 게 뭐냐면 — **놀랍게도 별로 없습니다.** 그래서 Redux가 "죽었다"고들 하는데, 정확히는 **역할이 정당한 크기로 축소된 것**입니다.

### Proxy 반응성과 Signals — 역사가 원을 그린다

MobX, Valtio, Vue 3의 `reactive()`는 ES6 `Proxy`로 속성 접근을 가로챕니다.

```typescript
const state = proxy({ count: 0 });
state.count++;   // 읽기/쓰기가 추적되어 구독자에게 자동 전파
```

그리고 **Signals** — SolidJS가 대중화하고 Preact, Angular, Svelte 5(runes)가 채택한 모델입니다.

```typescript
const [count, setCount] = createSignal(0);
const double = createMemo(() => count() * 2);  // count에 자동 구독
```

**여기서 뭔가 낯익지 않나요?** Knockout의 `ko.observable()`이 정확히 이 모양이었습니다. 15년 만에 돌아온 겁니다.

무엇이 달라졌길래 이번엔 되는가? **양방향이 아니라 단방향이고, 의존 그래프가 자동으로 정확하게 추적되기 때문**입니다. 2장에서 본 사이클 문제가 없습니다. Knockout은 "누구든 아무 observable이나 쓸 수 있는" 세계였고, Signal은 파생 값이 순수 계산인 세계입니다.

**VDOM vs Signal의 실질적 차이:**

- **VDOM** — 상태가 바뀌면 컴포넌트 함수를 **다시 실행**하고, 결과 트리를 비교해서 달라진 DOM만 고칩니다. 갱신 단위 = 컴포넌트.
- **Signal** — 그 값을 실제로 읽는 DOM 지점이 **자기가 직접** 구독합니다. 컴포넌트 함수는 최초 한 번만 실행됩니다. 갱신 단위 = 값을 쓰는 그 자리.

Signal 쪽이 세밀한 갱신(fine-grained reactivity)에서 압도적으로 효율적입니다. 대신 VDOM은 **정신 모델이 단순**합니다 — "매번 다시 그린다"는 한 문장으로 끝나죠. React가 VDOM을 유지하면서 React Compiler로 성능을 메우려는 이유입니다.

어느 쪽이 옳다기보다 **"단순한 정신 모델 + 컴파일러 최적화" 대 "정밀한 런타임 추적 + 약간 더 복잡한 규칙"** 의 노선 차이입니다.

---

## 7. 경계의 이동 (2023~) — RSC와 직렬화라는 새 제약

React Server Components는 패턴이라기보다 **패턴이 놓이는 판 자체를 바꾼 사건**입니다.

```tsx
// 서버에서만 실행 — 번들에 포함되지 않는다
async function PostList() {
  const posts = await db.query.posts.findMany();   // 컴포넌트 안에서 DB 직접 접근
  return <ul>{posts.map(p => <PostItem key={p.id} post={p} />)}</ul>;
}
```

"이거 그냥 PHP로 돌아간 거 아닌가?"라는 질문이 항상 나옵니다. **아닙니다.** 결정적 차이는 **부분 렌더 트리의 직렬화**입니다.

PHP는 HTML 문자열을 던지고 끝났습니다. RSC는 렌더 결과를 React가 이해하는 **트리 포맷으로 스트리밍**해서, 클라이언트의 기존 상태를 유지한 채 트리의 일부만 교체할 수 있습니다. 스크롤도, 입력 중이던 값도, 열려 있던 모달도 살아있습니다.

### 새롭게 등장한 설계 제약

**1. 직렬화 가능성이 새로운 타입 제약이 됐습니다.**

서버 컴포넌트가 클라이언트 컴포넌트에 넘기는 prop은 전부 직렬화되어 네트워크를 건너야 합니다. 함수는 못 넘깁니다(서버 액션 제외). 클래스 인스턴스도, 커스텀 객체도 조심해야 합니다. **"어떤 데이터를 경계 너머로 보낼 것인가"가 설계 결정이 됐습니다.**

**2. `"use client"`는 파일 표시가 아니라 의존성 그래프의 커트라인입니다.**

`"use client"`를 붙인 모듈부터 그 아래 import 트리 전체가 클라이언트 번들로 들어갑니다. 그래서 이걸 어디에 놓느냐가 번들 크기를 결정합니다. 실전 원칙: **클라이언트 경계를 최대한 잎(leaf) 쪽으로 밀어내고, 상태가 필요한 최소 단위만 클라이언트로 만든다.**

**3. children으로 서버 컴포넌트를 주입하는 패턴.**

```tsx
// ClientProvider는 클라이언트지만, children은 서버에서 렌더된 결과다
<ClientProvider>
  <ServerHeavyComponent />
</ClientProvider>
```

클라이언트 컴포넌트의 `children`은 이미 렌더된 결과로 전달되므로, 서버 컴포넌트를 클라이언트 트리 안쪽에 배치할 수 있습니다. 4장의 Render Props와 같은 원리 — **주입 지점을 열어두면 결정을 미룰 수 있다** — 가 서버/클라이언트 경계에서 재등장한 것입니다.

---

## 8. 아키텍처 레이어 — 폴더 구조는 의존성 규칙의 물리적 표현이다

이 장은 다른 축입니다. 앞의 7개 장이 "코드를 어떻게 쓰는가"였다면, 이건 **"코드를 어디에 두는가"** 입니다.

핵심 명제부터.

> 폴더 구조 논쟁은 미학 논쟁이 아니라 **의존성 규칙 논쟁**입니다. 폴더는 "누가 누구를 import해도 되는가"를 눈에 보이게 만든 장치입니다.

### 세 가지 구조

**(1) 기술별 분류** — `components/`, `hooks/`, `utils/`, `api/`

튜토리얼의 기본값이고, 20개 파일까지는 잘 돌아갑니다. 문제는 **기능 하나를 고치려면 네 폴더를 오간다**는 것, 그리고 **무엇을 지워도 되는지 알 수 없다**는 것입니다.

**(2) 기능별 분류 (Feature-based)** — `features/cart/`, `features/auth/`

응집도가 높아집니다. 기능을 통째로 지울 수 있게 되고, 이건 큰 장점입니다. 문제는 **기능 간 의존성이 자유롭게 생긴다**는 것. `features/cart`가 `features/auth`의 내부를 import하기 시작하면 몇 달 뒤 순환 참조 그래프가 됩니다.

**(3) FSD (Feature-Sliced Design)** — 층에 순서를 매깁니다.

```
app → pages → widgets → features → entities → shared
```

규칙은 하나입니다. **위 층은 아래 층만 import할 수 있고, 같은 층끼리는 서로 import할 수 없습니다.** 그리고 각 슬라이스는 공개 API(`index.ts`)를 통해서만 외부에 노출합니다.

이건 사실 **비순환 의존성 원칙(Acyclic Dependencies Principle)** 을 폴더로 강제한 것입니다. ESLint의 `import/no-restricted-paths`로 기계적으로 검증할 수 있고, 검증할 수 없는 규칙은 규칙이 아니라 희망사항이라는 점에서 이게 중요합니다.

### Clean Architecture를 프론트에 적용할 때의 함정

백엔드 클린 아키텍처는 "도메인은 DB를 모른다"를 위해 레이어를 쌓습니다. 프론트엔드에서 이걸 그대로 하면 UseCase, Repository, Entity, DTO, Mapper 클래스가 줄줄이 생기고, **버튼 하나 만드는 데 파일 여섯 개**가 됩니다.

왜 과잉이 되는가? **프론트엔드에서 "가장 안쪽"이 무엇인지가 불분명하기 때문**입니다. 백엔드의 안쪽은 비즈니스 규칙이고 이건 진짜로 오래 삽니다. 그런데 프론트엔드에서 가장 자주 바뀌는 건 UI고, 가장 안 바뀌는 건 대체로 서버 API 계약입니다. 바깥에 있어야 할 것이 실질적으로 가장 안정적인 셈이죠.

실용적 판단 기준은 이겁니다. **이 앱에 서버와 독립적으로 존재하는 도메인 로직이 실제로 있는가?** 있다면(오프라인 편집기, 복잡한 계산기, 협업 에디터) 레이어링이 값을 합니다. 대부분의 CRUD 대시보드는 그런 게 없고, 그러면 클린 아키텍처는 순수한 비용입니다.

---

## 관통하는 원리 네 가지

시대를 다 지나왔으니 처음의 질문으로 돌아갑니다. 이 역사 전체에서 반복되는 원리는 네 개입니다.

### 1. 단일 소유권 (Single source of truth)

모든 사고는 "같은 정보가 두 곳에 있고 둘이 달라진" 순간에 시작됩니다. DOM과 변수, Redux와 서버, `useState`와 URL. 새 상태를 만들 때 물어야 할 첫 질문은 **"이 정보의 진짜 주인은 누구인가?"** 입니다. 파생 가능한 값은 저장하지 말고 계산하세요.

### 2. 변경 전파의 방향성

양방향 바인딩이 무너진 이유, Flux가 이긴 이유, Signal이 Knockout과 다른 이유가 전부 여기 있습니다. 전파에 방향이 있으면 "왜 이렇게 됐는가"를 역추적할 수 있습니다. **추적 가능성은 편의성보다 비싼 가치입니다.**

### 3. 제어의 역전 — 결정을 미루기

Render Props, State Reducer, Headless, `asChild`, RSC의 children 주입. 전부 같은 원리입니다. **모든 경우를 예측해서 prop을 만들지 말고, 확장 지점을 열어두고 결정을 사용자에게 넘기세요.** prop이 15개를 넘어가기 시작하면 이 신호입니다.

### 4. 좋은 추상은 감춘 만큼 드러낸다

Mixin은 감추기만 했고 무너졌습니다. Hooks는 트리 구조를 감추는 대신 데이터 흐름을 드러냈습니다. Headless는 스타일을 포기하는 대신 동작 계약을 명시했습니다. 추상을 평가할 때 **"무엇을 편하게 해주는가"가 아니라 "무엇을 명시적으로 만들었는가"** 를 보세요.

---

## 시대별 요약

| # | 시대 | 핵심 질문 | 대표 패턴 | 치른 대가 |
|---|------|-----------|-----------|-----------|
| 1 | DOM 직접 조작 (~2010) | 상태가 DOM에 살 때 무슨 일이 벌어지나 | Module, Pub/Sub, Facade, Fluent | O(N×M) 동기화 |
| 2 | MV* (2010~2014) | 상태를 꺼내면 어떻게 동기화하나 | Observer, MVC/MVP/MVVM | 양방향 전파의 추적 불가 |
| 3 | 단방향 흐름 (2014~) | 변경의 출처를 어떻게 추적하나 | Flux, Redux, 미들웨어 체인 | 보일러플레이트 |
| 4 | 로직 재사용 | 상태 있는 로직을 어떻게 재사용하나 | Mixin → HOC → Render Props → Hooks | 암묵 규약(훅 규칙, 의존성 배열) |
| 5 | 컴포넌트 API 설계 | 제어권을 어디까지 넘기나 | Compound, State Reducer, Headless | 계약이 타입에 안 잡힘 |
| 6 | 상태 재분류 (2020~) | 전역 상태라 부르던 건 정말 상태였나 | 서버 캐시, Proxy, Signals | 도구 수 증가 |
| 7 | 경계의 이동 (2023~) | 배포 경계를 넘으면 뭐가 제약인가 | RSC, 서버 액션 | 직렬화 제약, 정신 모델 복잡도 |
| 8 | 아키텍처 레이어 | 폴더는 어떤 규칙의 표현인가 | Feature-based, FSD | 과잉 설계 위험 |

---

## 다음 편

2편부터는 각 영역을 코드로 파고듭니다.

- **2편 — 로직 재사용 패턴의 진화**: 하나의 요구사항을 Mixin, HOC, Render Props, Hooks 네 가지로 직접 리팩터링하며 각 전환의 이유를 체감합니다. Hooks 내부의 연결 리스트 구조와 의존성 배열의 정체까지.
- **3편 — Headless 컴포넌트 설계**: Compound + Control Props + State Reducer를 조합해 실전 API 하나를 처음부터 설계합니다.
- **4편 — Redux를 밑바닥부터 구현하기**: 40줄짜리 `createStore`로 타임트래블이 왜 공짜인지 이해합니다.
- **5편 — 상태 4분류와 반응성 모델**: VDOM, Proxy, Signal의 내부 동작을 비교합니다.
- **6편 — FSD와 의존성 규칙 강제**: 폴더 구조를 ESLint로 기계 검증 가능하게 만듭니다.
- **7편 — GoF 패턴의 프론트엔드 번역**: 고전 패턴 23개가 실제 라이브러리 코드에서 어떤 모습인지 추적합니다.
