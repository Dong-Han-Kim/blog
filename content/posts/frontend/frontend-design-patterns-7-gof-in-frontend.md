---
# 📌 기본 메타데이터
title: '프론트엔드 디자인 패턴 (7) — GoF 23개의 운명: 생존, 변형, 소멸'
date: '2026-09-14'
category: 'frontend'
tags: ['Design Pattern', 'GoF', 'JavaScript', 'React', 'Architecture']
description: 'GoF 패턴 23개가 실제 프론트엔드 라이브러리 코드에서 어떤 모습으로 살아있는지 추적하고, 사라진 것들은 왜 사라졌는지 밝힌다. 시리즈 완결.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 디자인 패턴'
seriesOrder: 7

# 📚 SEO용
keywords: ['Design Pattern', 'GoF', 'JavaScript', 'React', 'Architecture', '프론트엔드 디자인 패턴']
---

# 프론트엔드 디자인 패턴 (7) — GoF 23개의 운명

1편에서 이렇게 말했습니다. "GoF 패턴 중 프론트엔드에서 실제로 살아남은 건 극소수입니다."

마지막 편에서 그 주장을 검증합니다. 23개를 하나씩 놓고, **실제 라이브러리 코드에서 어떤 모습인지** 찾아봅니다. 그리고 사라진 것들은 왜 사라졌는지 — 여기에 이 시리즈 전체를 관통하는 마지막 통찰이 있습니다.

---

## 전체 지도

| 분류 | 패턴 | 프론트엔드에서의 상태 |
|---|---|---|
| **생성** | Factory Method | ✅ `create*` 컨벤션으로 편재 |
| | Abstract Factory | ⚠️ 드묾 (테마/플랫폼 어댑터 정도) |
| | Builder | ✅ Fluent API로 생존 |
| | Prototype | ❌ 언어 기능에 흡수 |
| | Singleton | ⚠️ 모듈 시스템에 흡수 |
| **구조** | Adapter | ✅ 경계마다 존재 |
| | Bridge | ❌ 거의 없음 |
| | Composite | ✅ UI 트리 자체 |
| | Decorator | ✅ 미들웨어·HOC |
| | Facade | ✅ 라이브러리의 존재 이유 |
| | Flyweight | ⚠️ 가상 리스트 정도 |
| | Proxy | ✅ 반응성 엔진의 핵심 |
| **행위** | Observer | ✅✅ 압도적 1위 |
| | Command | ✅ Redux action |
| | Strategy | ✅ "함수를 넘긴다" = 이것 |
| | State | ✅ 상태 머신 (XState) |
| | Chain of Responsibility | ✅ 미들웨어, 이벤트 버블링 |
| | Mediator | ✅ Context, 이벤트 버스 |
| | Memento | ✅ undo/redo, 스냅샷 |
| | Iterator | ❌ 언어 기능에 흡수 |
| | Template Method | ⚠️ 클래스와 함께 퇴장 |
| | Visitor | ⚠️ 앱에는 없고 툴링에는 필수 |
| | Interpreter | ⚠️ 템플릿 엔진, 쿼리 파서 |

이제 하나씩 코드로 봅니다.

---

# 1부. 생존한 패턴들

## Observer — 프론트엔드의 공용어

23개 중 가장 중요합니다. 사실상 **프론트엔드의 반응성은 전부 Observer의 변주**입니다.

```typescript
// 1. DOM 이벤트 — 브라우저가 처음부터 제공한 Observer
element.addEventListener('click', handler);

// 2. 브라우저 API는 이름에 아예 박아놨다
new IntersectionObserver(cb).observe(el);
new MutationObserver(cb).observe(el, { childList: true });
new ResizeObserver(cb).observe(el);

// 3. Redux (4편)
store.subscribe(() => render(store.getState()));

// 4. Signal (5편) — 읽는 행위가 곧 구독
createEffect(() => console.log(count()));

// 5. Proxy 반응성 (5편)
watchEffect(() => console.log(state.count));

// 6. React 자체 — setState는 "이 Fiber를 구독 중인 스케줄러에게 알린다"
```

**변주의 축은 세 가지입니다.**

| 축 | 선택지 |
|---|---|
| 구독자를 누가 아는가 | subject가 직접(Observer) vs 중개자가(Pub/Sub) |
| 구독 단위 | 객체 전체 / 속성 / 값 하나 / 컴포넌트 |
| 등록 방식 | 명시적 `subscribe` vs 읽기가 곧 구독(자동 추적) |

1편부터 5편까지의 역사 전체가 **이 세 축 위에서 좌표를 옮겨온 과정**입니다. Backbone은 (직접, 객체, 명시적), Redux는 (직접, 스토어 전체, 명시적), Signal은 (직접, 값 하나, 자동)입니다.

---

## Strategy — "함수를 넘긴다"의 정체

GoF의 Strategy는 알고리즘을 인터페이스로 추상화하고 구현 클래스를 갈아끼우는 패턴입니다. JavaScript에서는 **그냥 함수를 넘깁니다.**

```typescript
// 전부 Strategy다
items.sort((a, b) => a.price - b.price);

useQuery({ queryFn: () => api.getUsers() });

useForm({ resolver: zodResolver(schema) });        // 검증 전략 교체

useQuery({
  retry: (failureCount, error) =>                  // 재시도 전략
    error.status !== 404 && failureCount < 3,
});

<VirtualList estimateSize={(i) => rows[i].height} />   // 크기 계산 전략
```

**GoF의 Strategy 클래스 다이어그램(Context, Strategy 인터페이스, ConcreteStrategyA/B)이 JavaScript에서는 함수 타입 하나로 붕괴합니다.**

```typescript
// Java풍
interface SortStrategy { compare(a: Item, b: Item): number; }
class PriceSort implements SortStrategy { compare(a, b) { return a.price - b.price; } }

// JavaScript
type SortStrategy = (a: Item, b: Item) => number;
const byPrice: SortStrategy = (a, b) => a.price - b.price;
```

인터페이스, 구현 클래스, 인스턴스화가 전부 사라졌습니다. 이 관찰이 이 편 후반부의 핵심으로 이어집니다.

---

## Decorator — 미들웨어의 진짜 이름

4편에서 만든 Redux 미들웨어가 정확히 이것입니다.

```typescript
const logger: Middleware = (api) => (next) => (action) => {
  console.log(action);          // 추가 행동
  return next(action);          // 원래 동작에 위임
};
```

같은 구조가 도처에 있습니다.

```typescript
// Express / Koa / Next.js middleware
app.use((req, res, next) => { /* ... */ next(); });

// Axios 인터셉터
axios.interceptors.request.use(config => ({ ...config, headers: { ...auth } }));

// HOC (2편)
export default withErrorBoundary(withProfiler(Dashboard));

// Vite 플러그인
{ name: 'my-plugin', transform(code, id) { return transformed; } }
```

**Decorator와 Chain of Responsibility의 차이**를 명확히 해두면 좋습니다. 구조는 같고 **의도**가 다릅니다.

- **Decorator**: 모든 계층이 다 실행되고, 각자 뭔가를 **추가**한다 (로깅 + 인증 헤더 + 재시도)
- **Chain of Responsibility**: 누군가 처리하면 **거기서 멈춘다** (권한 없으면 `next()` 안 부르고 종료)

그래서 같은 미들웨어 구조가 `next`를 부르면 Decorator, 안 부르면 Chain of Responsibility로 동작합니다. **하나의 메커니즘이 두 패턴을 동시에 지원하는 것**이죠.

브라우저가 처음부터 Chain of Responsibility를 구현해 둔 곳도 있습니다.

```typescript
// DOM 이벤트 버블링이 바로 CoR
child.addEventListener('click', (e) => {
  if (handled) e.stopPropagation();   // 체인을 끊는다
});
// 처리되지 않으면 부모로, 그 위로 계속 올라간다
```

---

## Proxy — 반응성 엔진의 심장

5편에서 이미 깊이 봤습니다. GoF의 Proxy는 "실제 객체에 대한 접근을 제어하는 대리자"이고, JavaScript는 아예 `Proxy`라는 언어 기능으로 넣었습니다.

```typescript
// Vue 3 / Valtio / MobX — 반응성
const state = reactive({ count: 0 });

// Immer — draft가 Proxy다. "변형하는 것처럼 쓰지만 실제로는 불변 복사본을 만든다"
const next = produce(state, draft => { draft.items.push(item); });

// 테스트 모킹
const mock = new Proxy({}, { get: (_, key) => vi.fn() });
```

**Immer가 특히 좋은 사례입니다.** `draft.items.push()`는 진짜 변형처럼 보이지만, Proxy가 모든 쓰기를 기록해서 마지막에 **구조적 공유(structural sharing)** 로 새 객체를 만듭니다. 안 바뀐 가지는 참조를 그대로 재사용하므로, 4편에서 본 참조 동등성 기반 메모이제이션이 계속 작동합니다.

> **"변형처럼 쓰지만 불변"** — 개발자 경험과 런타임 요구사항이 충돌할 때 Proxy가 그 사이를 중재하는 전형적인 방식입니다.

---

## Command — Redux action

4편에서 전부 다뤘으니 요약만 하고, 다른 사례를 봅니다.

```typescript
// ProseMirror / Tiptap — 에디터의 모든 변경은 Transaction 객체
const tr = state.tr.insertText('안녕하세요', 0);
view.dispatch(tr);
// tr은 객체다 → 로깅, 전송, 되돌리기, 협업 동기화가 전부 가능

// 캔버스 편집기의 undo 스택
type Command = { do(): void; undo(): void };
const history: Command[] = [];
```

**Command의 가치는 "행위를 객체로 만든다"는 한 줄에 있습니다.** 객체가 되면 저장·전송·재생·역산이 가능해지고, 그게 undo, 협업, 감사 로그, 오프라인 큐를 전부 열어줍니다.

---

## Memento — 스냅샷

Command와 짝을 이루는 패턴입니다. Command가 "무엇을 했는가"를 저장한다면, Memento는 **"그 전에 어땠는가"** 를 저장합니다.

```typescript
// 5편의 낙관적 업데이트 — previous가 Memento다
onMutate: async (newItem) => {
  const previous = queryClient.getQueryData(['cart']);   // 스냅샷
  queryClient.setQueryData(['cart'], old => [...old, newItem]);
  return { previous };
},
onError: (_e, _v, ctx) => {
  queryClient.setQueryData(['cart'], ctx.previous);      // 복원
},
```

**어느 쪽을 저장할지는 트레이드오프입니다.**

| | Command (액션 로그) | Memento (상태 스냅샷) |
|---|---|---|
| 메모리 | 적음 (액션만) | 많음 (상태 전체) |
| 복원 속도 | 느림 (재생 필요) | 빠름 (바로 교체) |
| 순수성 요구 | 필수 | 불필요 |
| 부수 효과 | 재생 시 문제 | 없음 |

Redux DevTools는 실제로 **둘 다** 씁니다. 액션 로그를 쌓되, 주기적으로 상태 스냅샷을 찍어서 재생 시작점으로 삼습니다. 게임 엔진의 키프레임과 같은 발상입니다.

---

## Composite — UI 트리 그 자체

GoF의 Composite는 "개별 객체와 복합 객체를 같은 인터페이스로 다루는" 패턴입니다.

```tsx
<Card>                        {/* 복합 */}
  <Text>안녕</Text>            {/* 개별 */}
  <Card>                      {/* 복합이 복합을 담는다 */}
    <Button>확인</Button>
  </Card>
</Card>
```

**React 엘리먼트 트리가 Composite입니다.** `<Text>`든 `<Card>`든 똑같이 `ReactNode`이고, 부모는 자식이 잎인지 가지인지 신경 쓰지 않습니다. `children: ReactNode` 타입 하나가 이 패턴 전체를 표현합니다.

너무 자연스러워서 패턴으로 인식되지도 않습니다. **패턴이 언어나 프레임워크에 흡수되면 이름을 잃습니다** — 이 편의 반복되는 주제입니다.

---

## Facade — 라이브러리가 존재하는 이유

1편에서 jQuery를 예로 들었습니다. 지금 쓰는 것들도 전부 Facade입니다.

```typescript
// TanStack Query — 그 뒤에 캐시, 중복 제거, 재시도, GC가 숨어 있다
const { data } = useQuery({ queryKey: ['users'], queryFn: getUsers });

// framer-motion — requestAnimationFrame, 스프링 물리, 인터럽트 처리를 감춘다
<motion.div animate={{ x: 100 }} />

// Next.js의 <Image> — srcset, lazy loading, 포맷 변환, CLS 방지를 감춘다
```

**Facade의 수명 = 감추는 복잡성의 수명.** jQuery는 브라우저 차이가 사라지자 함께 사라졌습니다. 반대로 TanStack Query가 감추는 캐시 복잡성은 없어질 기미가 없으니 오래갈 겁니다.

> **라이브러리를 평가할 때의 질문:** 이게 감추는 복잡성이 **본질적인가, 우발적인가?** 우발적 복잡성(브라우저 버그, 임시 API 파편화)을 감추는 Facade는 수명이 짧습니다.

---

## Factory Method — `create*` 컨벤션

JavaScript 생태계에서 `create`로 시작하는 함수는 전부 이것입니다.

```typescript
createStore(reducer)           // Redux (4편에서 직접 구현)
createSlice({ ... })           // RTK
createSignal(0)                // Solid (5편)
createContext(null)            // React
createSelector([...], fn)      // reselect
createRoot(container)          // React DOM
defineConfig({ ... })          // Vite
```

**왜 `new Store()` 대신 `createStore()`인가?**

1. **클로저로 진짜 private을 만들 수 있습니다.** 4편의 `currentState`는 클래스 필드로는 (`#` 이전에는) 불가능했습니다.
2. **`this` 바인딩 문제가 없습니다.** `store.dispatch`를 떼어내서 넘겨도 동작합니다.
3. **반환 타입을 자유롭게 정할 수 있습니다.** 조건에 따라 다른 구현을 반환해도 호출부는 모릅니다.

세 번째가 GoF Factory Method의 원래 의도이고, 나머지 둘은 JavaScript 고유의 이유입니다.

---

## Builder — Fluent API

```typescript
// Zod
const schema = z.object({
  email: z.string().email('이메일 형식이 아닙니다').max(255),
  age: z.number().int().positive().optional(),
});

// Drizzle ORM
const rows = await db.select().from(projects).where(eq(projects.active, true)).limit(10);

// TanStack Query 빌더 패턴
queryOptions({ queryKey: ['x'] });
```

1편에서 jQuery 체이닝을 이야기했는데, 그 형태가 **타입 수준에서 진화해서** 돌아왔습니다.

```typescript
z.string()          // ZodString — .email()이 있다
z.number()          // ZodNumber — .email()이 없다, .int()가 있다
z.string().email()  // ZodString — 여전히 .max()가 있다
```

**각 단계가 다른 타입을 반환하므로, 불가능한 조합이 컴파일 에러가 됩니다.** jQuery 시절의 체이닝이 "읽기 편하다"는 이점만 있었다면, 지금의 Fluent API는 **타입으로 유효한 조합을 강제**합니다. 같은 패턴이 언어 기능의 발전으로 질이 달라진 사례입니다.

---

## State — 상태 머신

3편의 State Reducer가 이 패턴의 약식 버전이었습니다. 본격적인 형태는 이렇습니다.

```typescript
// XState
const orderMachine = createMachine({
  initial: 'draft',
  states: {
    draft:     { on: { SUBMIT: 'reviewing' } },
    reviewing: { on: { APPROVE: 'approved', REJECT: 'draft' } },
    approved:  { on: { SHIP: 'shipped' } },
    shipped:   { type: 'final' },
  },
});
```

**핵심 가치는 "불가능한 상태를 표현 불가능하게 만든다"** 입니다.

```typescript
// 나쁨 — 16가지 조합 중 유효한 건 4개뿐
{ isLoading: boolean; isError: boolean; isSuccess: boolean; isIdle: boolean }

// 좋음 — 4가지만 존재 가능
type Status = { type: 'idle' } | { type: 'loading' }
            | { type: 'success'; data: Data } | { type: 'error'; error: Error };
```

3편의 "boolean prop 폭발" 안티패턴과 정확히 같은 처방입니다. **상호배타적인 것은 유니온으로.** 그리고 `data`가 `success`일 때만 존재한다는 것까지 타입이 보장합니다.

---

## Mediator — Context와 이벤트 버스

3편의 Compound Component가 이 패턴입니다.

```tsx
// Select(Mediator)가 Trigger, Content, Option 사이의 통신을 중재한다
// 자식들은 서로를 모른다
<Select>
  <Select.Trigger />
  <Select.Content>
    <Select.Option value="a" />
  </Select.Content>
</Select>
```

Mediator가 없으면 자식들이 서로를 직접 알아야 하고, N개 컴포넌트 사이에 N² 개의 관계가 생깁니다. Mediator를 두면 N개로 줄어듭니다.

**주의할 점은 Mediator가 비대해지는 것입니다.** Context에 모든 걸 넣으면 그 Context가 앱의 모든 것을 아는 God Object가 됩니다. 3편에서 "Context는 의존성 주입이지 상태 관리자가 아니다"라고 한 이유입니다.

---

## Adapter — 경계마다 하나씩

시스템 경계가 있는 곳에는 항상 Adapter가 있습니다.

```typescript
// 1. 서버 응답 → 도메인 모델
function toProject(dto: ProjectDTO): Project {
  return { id: dto.project_id, name: dto.project_nm, startedAt: new Date(dto.start_dt) };
}

// 2. 검증 라이브러리 → 폼 라이브러리
useForm({ resolver: zodResolver(schema) });   // Zod를 RHF 인터페이스에 맞춘다

// 3. 코어 로직 → 프레임워크
// @tanstack/query-core를 react / vue / svelte 어댑터가 각각 감싼다

// 4. 6편의 app/dashboard/page.tsx — Next.js 라우팅을 FSD 구조에 맞추는 어댑터
```

**Adapter는 "번역 비용을 한 곳에 모으는" 패턴입니다.** DTO 변환을 컴포넌트 곳곳에서 하면 `dto.project_nm`이 코드 전체에 퍼지고, 서버가 필드명을 바꾸면 20곳을 고쳐야 합니다. 어댑터 하나면 한 곳입니다.

---

## Visitor — 앱에는 없고, 툴링에는 필수

앱 코드에서 Visitor를 쓸 일은 거의 없습니다. 그런데 **우리가 매일 쓰는 도구는 전부 Visitor로 만들어져 있습니다.**

```javascript
// Babel 플러그인
export default function myPlugin() {
  return {
    visitor: {
      Identifier(path) { /* 모든 식별자 노드를 방문 */ },
      CallExpression(path) { /* 모든 호출식을 방문 */ },
    },
  };
}

// ESLint 규칙 — 6편에서 만든 아키텍처 규칙도 이 형태
module.exports = {
  create(context) {
    return {
      ImportDeclaration(node) {
        if (violatesLayerRule(node.source.value)) context.report({ node, message: '...' });
      },
    };
  },
};
```

**왜 AST에서만 Visitor가 값하는가:** Visitor는 "자료구조는 안정적이고, 그 위에서 수행할 연산이 계속 늘어날 때" 유리합니다. AST 노드 타입은 언어 문법이라 잘 안 바뀌고, 그 위의 연산(린트 규칙, 변환, 분석)은 무한히 늘어납니다. **정확히 Visitor가 설계된 상황입니다.**

반대로 앱 코드에서는 자료구조가 계속 바뀌므로 Visitor를 쓰면 새 타입이 추가될 때마다 모든 visitor를 고쳐야 합니다.

---

# 2부. 사라진 패턴들, 그리고 왜

## 언어 기능에 흡수된 것들

**Iterator** — `Symbol.iterator`, `for...of`, 제너레이터가 언어에 들어왔습니다. 패턴을 구현할 일이 없고, 그냥 씁니다.

```typescript
function* paginate<T>(items: T[], size: number) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
for (const page of paginate(rows, 20)) { /* ... */ }
```

**Prototype** — "기존 객체를 복제해서 새 객체를 만든다". JavaScript는 **프로토타입 기반 언어**라서 이게 언어 자체입니다. 얕은 복사는 `{...obj}`, 깊은 복사는 `structuredClone(obj)` 한 줄입니다.

**Singleton** — ES 모듈은 **최초 import 시 한 번만 평가되고 결과가 캐싱**됩니다. 모듈 자체가 싱글톤입니다.

```typescript
// shared/api/queryClient.ts
export const queryClient = new QueryClient();   // 어디서 import하든 같은 인스턴스
```

GoF의 Singleton 클래스(`getInstance()`, private 생성자)를 쓸 이유가 없습니다. 그리고 SSR 환경에서는 **오히려 싱글톤이 위험합니다** — 서버 프로세스가 여러 요청에 걸쳐 살아있으므로 모듈 전역 상태가 사용자 간에 새어나갑니다. 그래서 Next.js에서는 요청마다 `new QueryClient()`를 만들고 Provider로 주입합니다. **패턴이 무용해진 정도가 아니라 안티패턴이 된 사례입니다.**

**Template Method** — 클래스 컴포넌트의 생명주기 메서드가 정확히 이 패턴이었습니다. 베이스 클래스가 골격을 정의하고(`render` 전에 `componentWillMount`, 후에 `componentDidMount`), 하위 클래스가 훅 지점을 채웁니다. **Hooks가 이걸 대체했고, 2편에서 본 대로 그게 더 나은 이유가 있었습니다.**

---

## 함수가 일급이면 사라지는 것들

이 편에서 가장 중요한 통찰입니다.

Peter Norvig가 1996년에 관찰한 바가 있습니다. **GoF의 23개 패턴 중 16개는 동적 언어에서 "보이지 않거나 훨씬 단순해진다"** 는 것입니다. 30년이 지나 JavaScript 생태계에서 그대로 확인됩니다.

| GoF 패턴 | JavaScript에서 |
|---|---|
| Strategy | 함수를 인자로 넘긴다 |
| Command | 객체 리터럴 `{ type, payload }` |
| Factory Method | 그냥 함수가 객체를 반환한다 |
| Template Method | 콜백을 받는 함수 |
| Visitor | 핸들러 객체 `{ NodeType: fn }` |
| Observer | 콜백 배열 |
| State | 유니온 타입 + switch |
| Decorator | 함수를 감싸는 함수 |
| Iterator | 제너레이터 |

**공통점이 보입니다. GoF 패턴의 상당수는 "함수를 값처럼 다룰 수 없는 언어"에서 함수를 흉내 내기 위한 우회로였습니다.**

Strategy 패턴의 클래스 다이어그램 — 인터페이스, 구현 클래스, 인스턴스, 주입 — 이 전부가 하려던 일은 **"동작 하나를 변수에 담아 넘기기"** 입니다. 함수가 일급이면 그건 `const fn = (a, b) => a - b` 한 줄입니다.

> **여기서 이 시리즈의 마지막 원리가 나옵니다.**
>
> **패턴은 언어의 결핍을 메우는 구조물입니다.** 결핍이 해소되면 패턴은 사라지거나 언어 기능으로 흡수되고, 이름을 잃습니다.

이 원리는 우리가 이 시리즈에서 본 모든 것을 설명합니다.

- **Module 패턴**은 ES 모듈이 생기자 사라졌습니다 (1편)
- **Container/Presentational**은 Hooks가 생기자 저자가 철회했습니다 (1편, 3편)
- **Mixin, HOC, Render Props**는 각각 다음 세대에 흡수됐습니다 (2편)
- **`as` prop**은 `asChild`로 대체됐습니다 (3편)
- <strong>`useMemo`/`useCallback`</strong>은 React Compiler로 흡수되는 중입니다 (2편)
- **의존성 배열**은 Signal 진영에서는 애초에 존재하지 않습니다 (5편)

**그래서 패턴을 배울 때 함께 배워야 하는 것은 "이 패턴이 메우고 있는 결핍이 무엇인가"입니다.** 그걸 알면 그 결핍이 해소됐을 때 패턴을 버릴 수 있습니다.

---

## 프론트엔드가 새로 만든 패턴들

거꾸로, GoF 목록에 없는데 프론트엔드에서 생겨난 것들이 있습니다. 이들은 **GoF 시대에 존재하지 않았던 문제**를 풉니다.

| 패턴 | 푸는 문제 | GoF에 없는 이유 |
|---|---|---|
| **Hooks** | 상태 있는 로직을 트리 변형 없이 재사용 | "선언적 UI 트리"라는 자료구조가 없었음 |
| **Render Props / Slot** | 렌더 시점·횟수를 사용자에게 위임 | 렌더링이라는 개념 자체가 없었음 |
| **Compound Component** | 배치의 자유 + 암묵적 상태 공유 | 위와 같음 |
| **Headless** | 동작과 표현의 완전 분리 | "접근성"이 설계 축이 아니었음 |
| **State Reducer** | 상태 전이 규칙 자체를 확장 지점으로 | Strategy의 극단적 형태이긴 함 |
| **Suspense** | 비동기 로딩을 선언적으로 경계 지음 | 동기 프로그램 전제 |
| **낙관적 업데이트 + 롤백** | 네트워크 지연을 UI에서 감춤 | 분산 시스템 전제가 없었음 |
| **Islands / 부분 하이드레이션** | 정적 HTML 안에 인터랙티브 섬 | 배포 경계 개념이 없었음 |
| **Server Components** | 렌더 트리가 배포 경계를 넘음 | 위와 같음 |

**이 목록의 공통점:** 전부 **"시간"과 "경계"** 를 다룹니다. GoF는 한 프로세스 안의 객체 관계를 다뤘고, 프론트엔드 패턴은 **비동기, 네트워크, 사용자 상호작용, 배포 경계** 를 다룹니다. 문제 영역이 다르니 패턴 목록이 다른 게 당연합니다.

---

# 3부. 시리즈 정리

## 관통한 네 가지 원리

일곱 편을 거치며 반복해서 나온 것들입니다.

### 1. 단일 소유권

> 같은 정보가 두 곳에 있으면 언젠가 달라진다.

- DOM과 변수가 각자 상태를 들고 있던 시절의 동기화 지옥 (1편)
- 파생 값을 `useState`로 만들고 `useEffect`로 동기화하는 안티패턴 (2편, 5편)
- 서버 데이터를 Redux에 복제해 두고 낡아가는 문제 (5편)
- 폼 상태의 소유권을 DOM에 일관되게 몰아주는 RHF (5편)

**새 상태를 만들 때 첫 질문: 이 정보의 진짜 주인은 누구인가?**

### 2. 변경 전파의 방향성

> 추적 가능성은 편의성보다 비싸다.

- 양방향 바인딩이 만든 사이클과 `$digest` 지옥 (1편)
- Flux가 Observer에 방향을 강제해서 얻은 디버깅 가능성 (1편, 4편)
- `dispatch`만 열고 상태를 클로저에 가두는 40줄 (4편)
- Signal이 정확한 의존 그래프로 Knockout과 달라진 지점 (5편)
- 레이어 의존성을 한 방향으로만 허용하는 FSD (6편)

**구조가 아니라 방향이 문제를 푼다.**

### 3. 제어의 역전 — 결정을 미루기

> 모든 경우를 예측해서 prop을 만들지 말고, 결정 지점을 열어둬라.

- Render Props가 렌더를 위임 (2편)
- State Reducer가 상태 전이 규칙을 위임 (3편)
- Headless가 DOM과 스타일을 위임 (3편)
- 미들웨어가 `next`로 체인을 열어둠 (4편)
- entity가 `actions` slot으로 행위를 위층에 위임 (6편)

**prop이 15개를 넘어가면 이 신호다.**

### 4. 좋은 추상은 감춘 만큼 드러낸다

> 추상을 평가할 때 "무엇을 편하게 해주는가"가 아니라 "무엇을 명시적으로 만들었는가"를 봐라.

- Mixin은 감추기만 해서 무너졌다 (2편)
- Hooks는 트리 구조를 감추고 데이터 흐름을 드러냈다 (2편)
- Headless는 스타일을 포기하고 동작 계약을 명시했다 (3편)
- Redux는 편의를 포기하고 타임트래블을 얻었다 (4편)

---

## 새 패턴을 만났을 때의 체크리스트

이 시리즈의 실용적 산출물입니다. 처음 보는 패턴이나 라이브러리를 평가할 때 이 여섯 개를 물으면 됩니다.

1. **이 패턴이 메우는 결핍은 무엇인가?** 그 결핍이 내 환경에도 있는가?
2. **진실의 원천이 어디로 이동하는가?** 소유권이 명확해지는가 흐려지는가?
3. **변경 전파에 방향이 있는가?** 사이클이 생길 수 있는가?
4. **무엇을 감추고 무엇을 드러내는가?** 감춘 것이 디버깅 때 필요해지는가?
5. **치르는 대가는 무엇인가?** 공짜인 것처럼 보이면 아직 못 찾은 것이다.
6. **정적으로 검증 가능한가?** 규약에만 의존한다면 린터나 타입으로 강제할 수 있는가?

---

## 마무리

프론트엔드 패턴의 역사는 하나의 질문에 대한 답의 역사였습니다.

> 상태는 어디에 살고, 그 변경은 어떻게 전파되며, 누가 그것을 소유하는가?

DOM이 소유하던 것을 Model이 가져갔고, Model의 양방향 전파가 무너지자 Store가 방향을 강제했고, Store에 다 넣으려던 시도가 서버 상태의 발견으로 정리됐고, 이제 일부는 서버 컴포넌트로 경계를 넘어가는 중입니다.

다음에 올 것이 무엇이든, **그것도 이 질문에 대한 답일 겁니다.** 패턴의 이름은 바뀌어도 질문은 바뀌지 않습니다.

---

## 시리즈 전체 목차

1. [전체 지도 — 상태는 어디에 사는가](/posts/frontend-design-patterns-1-overview)
2. [로직 재사용의 진화 — Mixin에서 Hooks까지](/posts/frontend-design-patterns-2-logic-reuse)
3. [Headless 컴포넌트 — 제어권을 설계한다](/posts/frontend-design-patterns-3-headless-design)
4. [Redux를 밑바닥부터 — 타임트래블은 왜 공짜인가](/posts/frontend-design-patterns-4-redux-internals)
5. [상태의 4분류와 반응성 엔진 3종](/posts/frontend-design-patterns-5-state-and-reactivity)
6. [폴더 구조는 의존성 규칙이다 — FSD와 기계적 강제](/posts/frontend-design-patterns-6-architecture-fsd)
7. GoF 23개의 운명 — 생존, 변형, 소멸 (이 글)
