---
# 📌 기본 메타데이터
title: 'TypeScript로 다시 읽는 GoF 디자인 패턴 — 4편: 행위 패턴 Ⅱ'
date: '2026-09-16'
category: 'architecture'
tags: ['Design Pattern', 'GoF', 'Behavioral Pattern', 'TypeScript', 'AST']
description: 'Iterator, Mediator, Memento, Visitor, Interpreter — 순회하고, 조율하고, 기록하고, 구조를 방문하고, 언어를 해석하는 다섯 가지 패턴과 시리즈 정리'

# 💬 옵션 필드
draft: false
series: 'TypeScript로 다시 읽는 GoF 디자인 패턴'
seriesOrder: 4

# 📚 SEO용
keywords: ['Design Pattern', 'GoF', 'Behavioral Pattern', 'TypeScript', 'AST', '디자인 패턴', '행위 패턴', '이터레이터', '메멘토', '비지터', '인터프리터']
---

# TypeScript로 다시 읽는 GoF 디자인 패턴 — 4편: 행위 패턴 Ⅱ

## 시작하며

[3편](/posts/design-patterns-behavioral-1)에서 실무에서 가장 자주 쓰는 행위 패턴 여섯 가지를 봤다. 이번 편의 다섯 가지는 사용 빈도는 조금 낮지만, **라이브러리와 도구의 내부**를 이해하는 데 꼭 필요한 패턴들이다.

19. **Iterator** — 내부 구조를 드러내지 않고 순회한다
20. **Mediator** — 객체들의 복잡한 상호작용을 한곳에서 조율한다
21. **Memento** — 캡슐화를 깨지 않고 상태를 저장하고 복원한다
22. **Visitor** — 구조를 바꾸지 않고 새 연산을 추가한다
23. **Interpreter** — 간단한 언어의 문법을 클래스로 표현한다

---

## 19. Iterator

### 의도

컬렉션의 **내부 표현을 드러내지 않고** 요소들에 순차적으로 접근하는 방법을 제공한다.

### 문제 상황

배열, 트리, 페이지네이션 API 결과를 순회하는 코드가 각각 다르다. 사용하는 쪽이 자료구조의 내부(인덱스, 자식 노드, 다음 페이지 커서)를 알아야 한다.

```ts
// 페이지 API를 순회하려면 커서 처리 방식을 알아야 한다
let cursor: string | undefined;
do {
  const page = await api.listUsers({ cursor, limit: 100 });
  for (const user of page.items) {
    await process(user);
  }
  cursor = page.nextCursor;
} while (cursor);
// 사용자, 주문, 로그 목록마다 이 루프가 복사된다
```

### TypeScript에서는 — 언어에 내장되어 있다

Iterator는 JavaScript에서 **언어 차원의 프로토콜**이다. `Symbol.iterator` 메서드를 가진 객체는 `for...of`, 스프레드, 구조 분해에서 바로 쓸 수 있고, 제너레이터(`function*`)로 간단하게 구현한다.

```ts
class Tree<T> {
  constructor(
    readonly value: T,
    readonly children: Tree<T>[] = [],
  ) {}

  // 깊이 우선 순회 — 사용하는 쪽은 트리 구조를 모른다
  *[Symbol.iterator](): Generator<T> {
    yield this.value;
    for (const child of this.children) {
      yield* child;
    }
  }
}

const tree = new Tree("root", [new Tree("a", [new Tree("a-1")]), new Tree("b")]);

for (const value of tree) console.log(value); // root, a, a-1, b
const all = [...tree];
```

비동기 데이터에는 **비동기 이터레이터**를 쓴다. 위의 페이지네이션 루프를 한 번만 작성하고 재사용할 수 있다.

```ts
async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor);
}

// 사용하는 쪽은 페이지의 존재를 모른다
for await (const user of paginate((cursor) => api.listUsers({ cursor, limit: 100 }))) {
  await process(user);
  if (user.id === targetId) break; // 중단하면 이후 페이지는 요청하지 않는다
}
```

제너레이터는 **필요한 만큼만** 값을 만든다(지연 평가). 수백만 건을 전부 메모리에 올리지 않고 스트리밍하듯 처리할 수 있다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 직접 만든 자료구조, 페이지네이션 API, 파일·스트림처럼 **끝이 정해지지 않았거나 큰 데이터**를 순회할 때
- **주의** — 제너레이터는 순회 도중에도 원본 컬렉션을 참조한다. 순회 중에 컬렉션을 수정하면 결과를 예측하기 어렵다.

---

## 20. Mediator

### 의도

객체들이 서로 직접 참조하지 않고 **중재자를 통해서만 소통**하게 한다. 객체 간 다대다 관계를 중재자 중심의 일대다 관계로 바꾼다.

### 문제 상황

항공권 검색 폼에서 컴포넌트들이 서로를 직접 조작한다.

- 편도를 선택하면 → 귀국일 입력을 비활성화한다
- 출발일을 바꾸면 → 귀국일의 최소 날짜를 바꾼다
- 출발지와 도착지가 같으면 → 검색 버튼을 비활성화한다
- 성인 인원이 0이면 → 유아 인원을 0으로 만들고 검색 버튼을 비활성화한다

컴포넌트가 다섯 개라면 서로의 관계는 최대 스무 개까지 늘어난다. 각 컴포넌트가 다른 컴포넌트를 알고 있어서, 하나를 재사용하거나 제거하기 어렵다.

### 적용

```ts
type FormState = {
  tripType: "oneWay" | "roundTrip";
  from: string;
  to: string;
  departDate: string;
  returnDate: string | null;
  adults: number;
  infants: number;
};

type Derived = {
  returnDateDisabled: boolean;
  returnDateMin: string;
  canSearch: boolean;
};

// 중재자 — 필드 간 규칙은 전부 여기에만 있다
class SearchFormMediator {
  #state: FormState;
  #listeners = new Set<(state: FormState, derived: Derived) => void>();

  constructor(initial: FormState) {
    this.#state = initial;
  }

  subscribe(listener: (state: FormState, derived: Derived) => void) {
    this.#listeners.add(listener);
    listener(this.#state, this.#derive());
    return () => this.#listeners.delete(listener);
  }

  // 각 컴포넌트는 "내 값이 바뀌었다"고만 알린다
  change<K extends keyof FormState>(field: K, value: FormState[K]) {
    const next = { ...this.#state, [field]: value };

    if (next.tripType === "oneWay") next.returnDate = null;
    if (next.returnDate && next.returnDate < next.departDate) next.returnDate = next.departDate;
    if (next.adults === 0) next.infants = 0;

    this.#state = next;
    const derived = this.#derive();
    this.#listeners.forEach((l) => l(this.#state, derived));
  }

  #derive(): Derived {
    const s = this.#state;
    return {
      returnDateDisabled: s.tripType === "oneWay",
      returnDateMin: s.departDate,
      canSearch: s.from !== "" && s.to !== "" && s.from !== s.to && s.adults > 0,
    };
  }
}
```

각 입력 컴포넌트는 서로를 전혀 모른다. `mediator.change("tripType", "oneWay")`를 호출하고, 구독한 상태로 자신을 그리기만 한다. React에서 여러 자식의 상태를 **공통 부모로 끌어올리거나** `useReducer`로 규칙을 모으는 것도 같은 발상이다.

### Observer와의 차이

Observer는 **주체가 누가 듣는지 모르는** 느슨한 알림이다. Mediator는 **중재자가 참여자들을 알고 적극적으로 조율**한다. 실제 구현에서는 Mediator가 참여자와 소통하는 수단으로 Observer를 쓰는 경우가 많다. 위 예제도 그렇다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 여러 객체가 서로의 상태에 복잡하게 반응할 때. 폼, 대화상자, 채팅방, 항공 관제처럼 **조율 자체가 핵심 로직**인 경우
- **주의** — 모든 규칙이 중재자로 모이므로, 방치하면 중재자가 안티패턴 1편의 **God Object**가 된다. 중재자 하나가 담당하는 범위를 화면이나 유스케이스 하나로 제한한다.

---

## 21. Memento

### 의도

캡슐화를 위반하지 않고 객체의 **내부 상태를 저장**(스냅샷)해 두었다가, 나중에 그 상태로 **복원**할 수 있게 한다.

GoF는 세 역할을 구분한다.

- **Originator(원조자)** — 상태를 가진 객체. 스냅샷을 만들고, 스냅샷으로 복원한다
- **Memento(메멘토)** — 저장된 상태. 원조자 외에는 내용을 들여다보거나 바꿀 수 없다
- **Caretaker(관리자)** — 메멘토를 보관만 한다. 내용은 모른다

### 문제 상황

도면 편집기에서 "이전 상태로 되돌리기"를 구현하려고 한다. 3편의 Command 패턴은 **각 동작의 역연산**이 필요한데, 필터 적용이나 자동 정렬처럼 역연산을 정의하기 어려운 동작이 있다. 이럴 때는 동작을 되돌리는 대신 **상태 자체를 저장**하는 편이 단순하다.

### 적용

```ts
type Shape = { id: string; x: number; y: number; width: number; height: number };

// 메멘토 — 외부에서는 내용을 읽을 수 없는 불투명한 객체
class CanvasMemento {
  readonly #shapes: readonly Shape[];
  readonly createdAt = new Date();

  constructor(shapes: Shape[]) {
    this.#shapes = structuredClone(shapes);
  }

  // 원조자만 쓰도록 의도된 접근자
  restoreInto(target: { replaceAll(shapes: Shape[]): void }) {
    target.replaceAll(structuredClone(this.#shapes as Shape[]));
  }
}

// 원조자
class Canvas {
  #shapes: Shape[] = [];

  add(shape: Shape) { this.#shapes.push(shape); }
  autoArrange() { /* 복잡한 재배치 — 역연산을 정의하기 어렵다 */ }

  save(): CanvasMemento {
    return new CanvasMemento(this.#shapes);
  }

  restore(memento: CanvasMemento) {
    memento.restoreInto({ replaceAll: (shapes) => { this.#shapes = shapes; } });
  }
}

// 관리자 — 스냅샷을 보관만 한다
class History {
  #snapshots: CanvasMemento[] = [];
  constructor(private readonly limit = 50) {}

  push(m: CanvasMemento) {
    this.#snapshots.push(m);
    if (this.#snapshots.length > this.limit) this.#snapshots.shift(); // 오래된 것부터 버린다
  }

  pop() { return this.#snapshots.pop(); }
}

const canvas = new Canvas();
const history = new History();

history.push(canvas.save());
canvas.autoArrange();

const previous = history.pop();
if (previous) canvas.restore(previous); // 정렬 이전으로 복원
```

TypeScript에는 C++의 `friend` 같은 "특정 클래스에만 공개" 기능이 없으므로, 위 예제는 private 필드와 접근 경로 제한으로 **의도를 표현**한 것이다. 완벽한 차단보다는 "관리자는 내용을 몰라도 된다"는 설계 의도가 핵심이다.

### TypeScript에서는

상태를 **불변 객체**로 다루는 코드에서는 Memento가 거의 공짜다. 상태를 바꿀 때마다 새 객체가 생기므로, 이전 객체의 참조만 보관하면 그것이 스냅샷이다. Redux DevTools의 시간 여행 디버깅과 Immer의 불변 업데이트가 이 성질을 활용한다.

```ts
const past: Readonly<EditorState>[] = [];
let present: Readonly<EditorState> = initialState;

function update(recipe: (draft: EditorState) => void) {
  past.push(present);
  present = produce(present, recipe); // Immer — 바뀐 부분만 새로 만들고 나머지는 공유
}
```

### 언제 쓰고 언제 피하나

- **쓸 때** — 실행 취소, 임시 저장, 트랜잭션 롤백, 게임 세이브처럼 **특정 시점으로 돌아가야** 할 때
- **주의** — 상태가 크면 스냅샷마다 메모리를 크게 쓴다. 보관 개수에 **상한**을 두거나, 변경분만 저장하는 방식(구조적 공유, 3편의 Command)과 섞어 쓴다.

---

## 22. Visitor

### 의도

객체 구조를 이루는 요소들의 클래스를 **바꾸지 않고**, 그 요소들에 수행할 **새로운 연산을 추가**할 수 있게 한다.

### 문제 상황

간단한 수식 트리(AST)가 있다. 여기에 "계산하기", "문자열로 출력하기", "사용된 변수 모으기" 같은 연산을 추가하고 싶다. 연산마다 모든 노드 클래스에 메서드를 추가하면, 노드 클래스가 온갖 관심사로 비대해진다.

```ts
class NumberNode {
  evaluate() { /* ... */ }
  print() { /* ... */ }
  collectVariables() { /* ... */ }
  typeCheck() { /* ... */ }
  optimize() { /* ... */ }
  // 연산이 추가될 때마다 모든 노드 클래스를 수정해야 한다
}
```

### 적용 — 정석 구현

각 노드는 `accept` 하나만 갖고, 연산은 방문자(visitor) 객체로 분리한다.

```ts
interface ExprVisitor<R> {
  visitNumber(node: NumberExpr): R;
  visitVariable(node: VariableExpr): R;
  visitBinary(node: BinaryExpr): R;
}

interface Expr {
  accept<R>(visitor: ExprVisitor<R>): R;
}

class NumberExpr implements Expr {
  constructor(readonly value: number) {}
  accept<R>(v: ExprVisitor<R>) { return v.visitNumber(this); }
}

class VariableExpr implements Expr {
  constructor(readonly name: string) {}
  accept<R>(v: ExprVisitor<R>) { return v.visitVariable(this); }
}

class BinaryExpr implements Expr {
  constructor(readonly op: "+" | "*", readonly left: Expr, readonly right: Expr) {}
  accept<R>(v: ExprVisitor<R>) { return v.visitBinary(this); }
}

// 연산 1 — 계산
class Evaluator implements ExprVisitor<number> {
  constructor(private readonly env: Record<string, number>) {}
  visitNumber(n: NumberExpr) { return n.value; }
  visitVariable(n: VariableExpr) {
    if (!(n.name in this.env)) throw new Error(`정의되지 않은 변수: ${n.name}`);
    return this.env[n.name];
  }
  visitBinary(n: BinaryExpr) {
    const l = n.left.accept(this);
    const r = n.right.accept(this);
    return n.op === "+" ? l + r : l * r;
  }
}

// 연산 2 — 출력. 노드 클래스는 전혀 수정하지 않았다
class Printer implements ExprVisitor<string> {
  visitNumber(n: NumberExpr) { return String(n.value); }
  visitVariable(n: VariableExpr) { return n.name; }
  visitBinary(n: BinaryExpr) {
    return `(${n.left.accept(this)} ${n.op} ${n.right.accept(this)})`;
  }
}

// (x + 2) * 3
const expr = new BinaryExpr("*", new BinaryExpr("+", new VariableExpr("x"), new NumberExpr(2)), new NumberExpr(3));

expr.accept(new Printer());               // "((x + 2) * 3)"
expr.accept(new Evaluator({ x: 4 }));     // 18
```

`accept`가 방문자의 **자기 타입에 맞는 메서드**를 호출하는 구조를 **이중 디스패치**(double dispatch)라고 부른다. 호출되는 메서드가 노드의 타입과 방문자의 타입 두 가지에 의해 결정된다.

### 어디서 보는가

Babel 플러그인과 ESLint 규칙이 대표적이다. 둘 다 코드를 AST로 파싱한 뒤, 노드 타입 이름을 키로 하는 **방문자 객체**를 받아 트리를 순회한다.

```ts
// ESLint 규칙의 형태 — 노드 타입별로 방문 함수를 정의한다
export default {
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "eval") {
          context.report({ node, message: "eval은 사용할 수 없습니다" });
        }
      },
    };
  },
};
```

규칙을 몇 개를 추가하든 AST 노드 정의는 바뀌지 않는다. Visitor 패턴이 약속하는 바로 그 성질이다.

### TypeScript에서는 — 판별 유니온

TypeScript에서는 노드를 **판별 유니온**(discriminated union)으로 정의하고 `switch`로 분기하는 방식이 더 간결하다. `never` 검사를 넣으면 노드 종류를 추가했을 때 처리하지 않은 곳을 컴파일러가 알려준다.

```ts
type Expr =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: string }
  | { kind: "binary"; op: "+" | "*"; left: Expr; right: Expr };

function print(e: Expr): string {
  switch (e.kind) {
    case "number": return String(e.value);
    case "variable": return e.name;
    case "binary": return `(${print(e.left)} ${e.op} ${print(e.right)})`;
    default: {
      const unreachable: never = e; // 새 kind를 추가하면 여기서 컴파일 에러
      throw new Error(`처리하지 않은 노드: ${JSON.stringify(unreachable)}`);
    }
  }
}
```

### 언제 쓰고 언제 피하나

Visitor에는 분명한 트레이드오프가 있다.

- **연산 추가는 쉽다** — 새 방문자 클래스 하나면 된다
- **요소 추가는 어렵다** — 노드 종류가 하나 늘면 **모든 방문자**를 수정해야 한다

그래서 **요소 종류는 거의 고정되어 있고, 연산은 계속 늘어나는** 구조에 적합하다. 프로그래밍 언어의 AST가 전형적인 예다. 반대로 요소 종류가 자주 늘어난다면, 연산을 각 요소 클래스에 두는 일반적인 다형성이 낫다.

---

## 23. Interpreter

### 의도

간단한 언어의 **문법을 클래스 계층으로 표현**하고, 그 구조로 문장을 **해석**한다. 문법 규칙 하나가 클래스 하나에 대응한다.

### 문제 상황

관리자가 알림 조건을 직접 입력할 수 있게 해 달라는 요구가 있다.

```
temperature > 80 and (pressure > 5 or status == "error")
```

### 적용

문법의 각 규칙을 노드로 표현하고, 각 노드가 스스로를 해석(`interpret`)한다.

```ts
type Context = Record<string, number | string>;

interface Condition {
  interpret(ctx: Context): boolean;
}

// 끝 기호(terminal) — 비교식
class Compare implements Condition {
  constructor(
    private readonly field: string,
    private readonly op: ">" | "<" | "==",
    private readonly value: number | string,
  ) {}

  interpret(ctx: Context) {
    const actual = ctx[this.field];
    switch (this.op) {
      case ">": return typeof actual === "number" && actual > (this.value as number);
      case "<": return typeof actual === "number" && actual < (this.value as number);
      case "==": return actual === this.value;
    }
  }
}

// 비끝 기호(nonterminal) — 다른 식을 조합한다
class And implements Condition {
  constructor(private readonly left: Condition, private readonly right: Condition) {}
  interpret(ctx: Context) { return this.left.interpret(ctx) && this.right.interpret(ctx); }
}

class Or implements Condition {
  constructor(private readonly left: Condition, private readonly right: Condition) {}
  interpret(ctx: Context) { return this.left.interpret(ctx) || this.right.interpret(ctx); }
}

// temperature > 80 and (pressure > 5 or status == "error")
const rule = new And(
  new Compare("temperature", ">", 80),
  new Or(new Compare("pressure", ">", 5), new Compare("status", "==", "error")),
);

rule.interpret({ temperature: 85, pressure: 3, status: "error" }); // true
```

문자열을 이 트리로 바꾸는 **파서**는 Interpreter 패턴의 범위 밖이다. GoF는 해석 구조만 다루며, 실무에서는 파서 생성기나 이미 존재하는 표현식 라이브러리를 사용한다. 2편의 Composite와 구조가 같다는 점도 눈여겨볼 만하다. Interpreter는 Composite 구조에 "해석"이라는 연산을 얹은 것이고, 해석할 연산이 여러 개로 늘어나면 앞의 Visitor로 분리하게 된다.

### 어디서 보는가

정규 표현식 엔진, SQL의 WHERE 절 평가, 템플릿 엔진, 스프레드시트 수식, 설정 파일의 조건식이 모두 이 구조를 내부에 가지고 있다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 문법이 **작고 안정적**이며, 해석 성능이 크게 중요하지 않을 때
- **피할 때** — 문법이 계속 커질 때. 조건문 몇 개로 시작한 언어에 변수, 함수, 반복이 추가되기 시작했다면 안티패턴 3편의 **Inner-Platform Effect**로 가고 있는 것이다. 그때는 직접 언어를 만들지 말고, 규칙을 코드로 작성하거나 검증된 표현식 엔진을 쓴다. 사용자 입력을 해석할 때는 `eval`이나 `new Function`을 절대 쓰지 않는다.

---

## 시리즈를 마치며

네 편에 걸쳐 GoF 23개 패턴을 모두 살펴봤다.

| 범주 | 패턴 | 공통 질문 |
|---|---|---|
| 생성 (1편) | Singleton, Factory Method, Abstract Factory, Builder, Prototype | 누가, 어떻게 만드는가? |
| 구조 (2편) | Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy | 어떻게 조합하는가? |
| 행위 Ⅰ (3편) | Strategy, State, Template Method, Observer, Command, Chain of Responsibility | 책임을 어떻게 나누는가? |
| 행위 Ⅱ (4편) | Iterator, Mediator, Memento, Visitor, Interpreter | 순회·조율·기록·해석을 어떻게 분리하는가? |

### 헷갈리는 패턴 한눈에 구분하기

| 비슷한 패턴 | 구분 기준 |
|---|---|
| Strategy vs State | 교체를 **외부**가 결정하는가, **상태 스스로** 전이하는가 |
| Adapter vs Bridge | **사후에** 맞추는가, **설계 단계에서** 분리하는가 |
| Decorator vs Proxy | 기능을 **더하는가**, 접근을 **통제하는가** |
| Observer vs Mediator | **모르는** 구독자에게 알리는가, **아는** 참여자를 조율하는가 |
| Command vs Memento | **동작**을 기록하는가, **상태**를 기록하는가 |
| Composite vs Interpreter | 구조 자체인가, 그 구조로 **언어를 해석**하는가 |

### 패턴을 대하는 태도

안티패턴 시리즈의 결론이 "공통된 뿌리를 보라"였다면, 이번 시리즈의 결론은 "**패턴은 목표가 아니라 결과**"라는 것이다.

좋은 코드를 쓰다 보면 자연스럽게 패턴이 나타난다. 반대로 패턴을 먼저 정하고 코드를 거기에 맞추면, 문제가 없는 곳에 해법을 설치하게 된다. 그것이 안티패턴 2편의 Golden Hammer이고, 1편의 Cargo Cult다.

패턴을 쓸지 고민될 때는 세 가지를 묻는다.

1. **지금** 이 문제가 실제로 존재하는가, 아니면 "언젠가" 생길 문제인가?
2. 패턴을 적용하면 **읽는 사람**에게 더 쉬워지는가, 더 어려워지는가?
3. TypeScript가 **이미 제공하는** 더 단순한 방법은 없는가?

### 다음 단계

GoF 패턴은 **객체 수준**의 설계 어휘다. 한 단계 위, **애플리케이션과 시스템 수준**에도 이름 붙은 패턴들이 있다. Repository, Unit of Work, Dependency Injection, CQRS, Event Sourcing, Saga, Transactional Outbox 같은 패턴들이다. 안티패턴 시리즈 3~5편의 처방에서 이미 몇 가지를 만났다. 이 패턴들은 별도의 시리즈에서 다룬다.
