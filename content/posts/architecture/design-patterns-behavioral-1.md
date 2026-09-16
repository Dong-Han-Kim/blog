---
# 📌 기본 메타데이터
title: 'TypeScript로 다시 읽는 GoF 디자인 패턴 — 3편: 행위 패턴 Ⅰ'
date: '2026-09-16'
category: 'architecture'
tags: ['Design Pattern', 'GoF', 'Behavioral Pattern', 'TypeScript']
description: 'Strategy, State, Template Method, Observer, Command, Chain of Responsibility — 객체들이 책임을 나누고 협력하는 여섯 가지 방법'

# 💬 옵션 필드
draft: false
series: 'TypeScript로 다시 읽는 GoF 디자인 패턴'
seriesOrder: 3

# 📚 SEO용
keywords: ['Design Pattern', 'GoF', 'Behavioral Pattern', 'TypeScript', '디자인 패턴', '행위 패턴', '전략 패턴', '옵서버', '커맨드', '책임 연쇄']
---

# TypeScript로 다시 읽는 GoF 디자인 패턴 — 3편: 행위 패턴 Ⅰ

## 시작하며

행위 패턴은 **알고리즘과 책임을 객체들 사이에 어떻게 나누는가**를 다룬다. GoF 23개 패턴 중 11개로 가장 많아서 두 편으로 나눴다.

이번 편의 여섯 가지는 실무에서 가장 자주 만나는 패턴들이다.

13. **Strategy** — 알고리즘을 갈아 끼운다
14. **State** — 상태에 따라 행동이 바뀐다
15. **Template Method** — 뼈대는 고정하고 단계만 바꾼다
16. **Observer** — 변화를 구독자에게 알린다
17. **Command** — 요청을 객체로 만든다
18. **Chain of Responsibility** — 요청을 처리자 사슬에 흘려보낸다

---

## 13. Strategy

### 의도

알고리즘군을 정의하고 각각을 캡슐화해서 **서로 교체 가능하게** 만든다. 알고리즘을 사용하는 쪽과 독립적으로 알고리즘을 바꿀 수 있다.

### 문제 상황

배송비 계산 방식이 계속 늘어난다.

```ts
function calculateShipping(order: Order, method: string): number {
  if (method === "standard") {
    return order.total >= 50_000 ? 0 : 3_000;
  } else if (method === "express") {
    return 5_000 + order.weightKg * 500;
  } else if (method === "island") {
    return 3_000 + 4_000;
  } else if (method === "pickup") {
    return 0;
  }
  throw new Error(`알 수 없는 배송 방식: ${method}`);
}
```

새 방식을 추가할 때마다 이 함수를 수정해야 하고, 각 방식을 따로 테스트하기도 어렵다. `method`가 문자열이라 오타도 잡히지 않는다. 안티패턴 1편의 Primitive Obsession이다.

### 적용 — 정석 구현

```ts
interface ShippingStrategy {
  calculate(order: Order): number;
}

class StandardShipping implements ShippingStrategy {
  calculate(order: Order) {
    return order.total >= 50_000 ? 0 : 3_000;
  }
}

class ExpressShipping implements ShippingStrategy {
  calculate(order: Order) {
    return 5_000 + order.weightKg * 500;
  }
}

class Checkout {
  constructor(private strategy: ShippingStrategy) {}

  setStrategy(strategy: ShippingStrategy) {
    this.strategy = strategy;
  }

  total(order: Order) {
    return order.total + this.strategy.calculate(order);
  }
}
```

### TypeScript에서는

전략이 메서드 하나뿐이라면, **전략은 그냥 함수**다.

```ts
type ShippingStrategy = (order: Order) => number;

const shippingStrategies = {
  standard: (o) => (o.total >= 50_000 ? 0 : 3_000),
  express: (o) => 5_000 + o.weightKg * 500,
  island: () => 7_000,
  pickup: () => 0,
} satisfies Record<string, ShippingStrategy>;

type ShippingMethod = keyof typeof shippingStrategies;

export function totalWithShipping(order: Order, method: ShippingMethod) {
  return order.total + shippingStrategies[method](order);
}
```

`satisfies`는 각 전략이 올바른 시그니처인지 검사하면서도, `ShippingMethod` 타입을 `"standard" | "express" | "island" | "pickup"`이라는 **정확한 키 목록**으로 유지해 준다. `Array.prototype.sort`에 비교 함수를 넘기는 것도 Strategy 패턴이다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 같은 목적의 알고리즘이 여러 개이고 런타임에 골라야 할 때, 분기문이 계속 자랄 때
- **피할 때** — 분기가 두세 개로 고정되어 있고 앞으로 늘 일이 없을 때. 단순한 `if`가 더 읽기 쉽다.

---

## 14. State

### 의도

객체의 **내부 상태가 바뀌면 행동도 바뀌게** 한다. 밖에서 보면 객체의 클래스가 바뀐 것처럼 보인다.

### 문제 상황

주문 객체의 모든 메서드가 상태를 검사한다.

```ts
class Order {
  status: "PENDING" | "PAID" | "SHIPPED" | "CANCELLED" = "PENDING";

  pay() {
    if (this.status !== "PENDING") throw new Error("결제할 수 없는 상태");
    this.status = "PAID";
  }

  ship() {
    if (this.status !== "PAID") throw new Error("배송할 수 없는 상태");
    this.status = "SHIPPED";
  }

  cancel() {
    if (this.status === "SHIPPED" || this.status === "CANCELLED") {
      throw new Error("취소할 수 없는 상태");
    }
    // 결제 후 취소면 환불도 해야 한다
    if (this.status === "PAID") this.refund();
    this.status = "CANCELLED";
  }
  // 상태가 하나 늘면 모든 메서드의 조건문을 다시 검토해야 한다
}
```

**"어떤 상태에서 무엇이 가능한가"**라는 규칙이 모든 메서드에 흩어져 있다.

### 적용

상태마다 클래스를 만들고, 각 상태가 **자기 상태에서 가능한 행동과 다음 상태**를 안다.

```ts
interface OrderState {
  readonly name: string;
  pay(order: Order): void;
  ship(order: Order): void;
  cancel(order: Order): void;
}

abstract class BaseState implements OrderState {
  abstract readonly name: string;
  pay(_: Order): void { throw new InvalidTransitionError(this.name, "pay"); }
  ship(_: Order): void { throw new InvalidTransitionError(this.name, "ship"); }
  cancel(_: Order): void { throw new InvalidTransitionError(this.name, "cancel"); }
}

class PendingState extends BaseState {
  readonly name = "PENDING";
  pay(order: Order) { order.transitionTo(new PaidState()); }
  cancel(order: Order) { order.transitionTo(new CancelledState()); }
}

class PaidState extends BaseState {
  readonly name = "PAID";
  ship(order: Order) { order.transitionTo(new ShippedState()); }
  cancel(order: Order) {
    order.refund();
    order.transitionTo(new CancelledState());
  }
}

class ShippedState extends BaseState { readonly name = "SHIPPED"; }
class CancelledState extends BaseState { readonly name = "CANCELLED"; }

class Order {
  #state: OrderState = new PendingState();

  get status() { return this.#state.name; }

  transitionTo(state: OrderState) { this.#state = state; }
  refund() { /* 환불 처리 */ }

  pay() { this.#state.pay(this); }
  ship() { this.#state.ship(this); }
  cancel() { this.#state.cancel(this); }
}
```

허용되지 않은 전이는 `BaseState`가 기본으로 막는다. 새 상태를 추가할 때는 **새 클래스 하나**를 만들고 관련 전이만 정의하면 된다.

### TypeScript에서는

상태 전이 규칙을 **데이터(전이 표)**로 표현하는 방식도 흔하다. 규칙이 한눈에 보인다는 장점이 있다.

```ts
type Status = "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";
type Action = "pay" | "ship" | "cancel";

const transitions: Record<Status, Partial<Record<Action, Status>>> = {
  PENDING: { pay: "PAID", cancel: "CANCELLED" },
  PAID: { ship: "SHIPPED", cancel: "CANCELLED" },
  SHIPPED: {},
  CANCELLED: {},
};

function next(status: Status, action: Action): Status {
  const to = transitions[status][action];
  if (!to) throw new InvalidTransitionError(status, action);
  return to;
}
```

상태와 전이가 복잡해지면 XState 같은 상태 머신 라이브러리가 이 방식을 체계화해 준다.

### Strategy와의 차이

두 패턴의 클래스 구조는 거의 같다. 차이는 **누가 교체를 결정하는가**다.

- Strategy는 **외부(클라이언트)**가 전략을 골라 넣는다. 전략끼리는 서로를 모른다.
- State는 **상태 객체 스스로** 다음 상태로 전이한다. 상태끼리 서로를 안다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 상태가 여러 개이고 상태마다 허용되는 행동이 다를 때. 안티패턴 3편 Anemic Domain Model을 고칠 때 자주 함께 쓰인다.
- **피할 때** — 상태가 두세 개이고 전이가 단순할 때. 전이 표나 조건문 몇 개로 충분하다.

---

## 15. Template Method

### 의도

상위 클래스에 **알고리즘의 뼈대**를 정의하고, 일부 단계의 구현을 하위 클래스에 맡긴다. 알고리즘 구조는 그대로 두고 특정 단계만 재정의할 수 있다.

### 문제 상황

CSV, 엑셀, JSON 데이터를 가져오는 작업이 있다. 세 작업 모두 "읽기 → 파싱 → 검증 → 저장 → 결과 보고" 순서가 같은데, 코드가 세 벌로 복사되어 있다. 검증 규칙을 바꾸려면 세 곳을 모두 고쳐야 한다.

### 적용

```ts
abstract class DataImporter<Row> {
  // 템플릿 메서드 — 순서는 여기서만 정의한다
  async run(source: Buffer): Promise<ImportResult> {
    const rows = this.parse(source);
    const valid: Row[] = [];
    const errors: string[] = [];

    rows.forEach((row, i) => {
      const error = this.validate(row);
      if (error) errors.push(`${i + 1}행: ${error}`);
      else valid.push(row);
    });

    if (this.shouldAbort(errors, rows.length)) {
      return { saved: 0, errors };
    }

    await this.save(valid);
    return { saved: valid.length, errors };
  }

  // 하위 클래스가 반드시 구현하는 단계
  protected abstract parse(source: Buffer): Row[];
  protected abstract validate(row: Row): string | null;
  protected abstract save(rows: Row[]): Promise<void>;

  // 훅(hook) — 기본 동작이 있고, 필요할 때만 재정의한다
  protected shouldAbort(errors: string[], total: number): boolean {
    return errors.length > total * 0.1; // 기본: 오류 10% 초과 시 중단
  }
}

class EmployeeCsvImporter extends DataImporter<Employee> {
  protected parse(source: Buffer) { return parseCsv<Employee>(source.toString("utf-8")); }
  protected validate(row: Employee) { return row.email.includes("@") ? null : "이메일 형식 오류"; }
  protected save(rows: Employee[]) { return employeeRepository.insertMany(rows); }

  // 인사 데이터는 오류가 하나라도 있으면 중단한다
  protected shouldAbort(errors: string[]) { return errors.length > 0; }
}
```

`shouldAbort`처럼 **기본 구현이 있는 선택적 단계**를 훅이라고 부른다. 하위 클래스는 필요한 것만 재정의한다.

GoF는 이 구조를 **할리우드 원칙** — "우리에게 연락하지 마세요, 우리가 연락할게요" — 으로 설명한다. 하위 클래스가 상위 클래스를 호출하는 것이 아니라, 상위 클래스가 하위 클래스의 단계를 호출한다.

### TypeScript에서는

Template Method는 **상속**에 기반한다. 상속은 결합이 강하므로, 단계들을 **객체로 주입**하는 합성 방식이 더 선호되는 경우가 많다.

```ts
interface ImportSteps<Row> {
  parse(source: Buffer): Row[];
  validate(row: Row): string | null;
  save(rows: Row[]): Promise<void>;
  shouldAbort?(errors: string[], total: number): boolean;
}

export async function runImport<Row>(source: Buffer, steps: ImportSteps<Row>) {
  const shouldAbort = steps.shouldAbort ?? ((e, total) => e.length > total * 0.1);
  // 이하 동일한 뼈대
}
```

뼈대는 함수 하나로 고정되고, 단계는 Strategy처럼 주입된다. 테스트할 때 하위 클래스를 만들 필요 없이 가짜 단계 객체를 넘기면 된다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 여러 구현이 **같은 순서**를 공유하고 일부 단계만 다를 때. 프레임워크의 생명주기 메서드(React 클래스 컴포넌트의 `componentDidMount` 등)가 대표적이다.
- **주의** — 상속 계층이 깊어지면 "이 단계가 어디서 재정의됐는지" 추적하기 어려워진다. 상속은 한 단계로 제한하는 것이 좋다.

---

## 16. Observer

### 의도

객체 사이에 **일대다 의존 관계**를 정의해서, 한 객체(주체)의 상태가 바뀌면 그 객체에 의존하는 모든 객체(관찰자)에게 **자동으로 알린다.** 발행-구독(Pub/Sub) 구조의 원형이다.

### 문제 상황

회원 가입 함수가 가입 이후에 일어나야 하는 모든 일을 직접 알고 있다.

```ts
export async function signUp(input: SignUpInput) {
  const user = await userRepository.create(input);
  await mailer.sendWelcome(user);
  await couponService.issueWelcomeCoupon(user.id);
  await analytics.track("sign_up", user.id);
  await slack.notifyAdmins(`신규 가입: ${user.email}`);
  // 마케팅팀이 요청할 때마다 여기에 한 줄씩 늘어난다
  return user;
}
```

회원 모듈이 메일, 쿠폰, 분석, 슬랙 모듈에 모두 의존한다. 분석 서비스 장애가 가입 실패로 이어진다.

### 적용

```ts
type Listener<T> = (payload: T) => void | Promise<void>;

class EventBus<Events extends Record<string, unknown>> {
  #listeners = new Map<keyof Events, Set<Listener<any>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event)!.add(listener);
    return () => this.#listeners.get(event)?.delete(listener); // 구독 해제 함수
  }

  async emit<K extends keyof Events>(event: K, payload: Events[K]) {
    const listeners = [...(this.#listeners.get(event) ?? [])];
    const results = await Promise.allSettled(listeners.map((l) => l(payload)));
    results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .forEach((r) => logger.error("리스너 실패", r.reason)); // 한 리스너의 실패가 나머지를 막지 않는다
  }
}

type AppEvents = {
  userSignedUp: { userId: string; email: string };
  orderPaid: { orderId: string; amount: number };
};

export const bus = new EventBus<AppEvents>();

// 회원 모듈은 "가입했다"는 사실만 알린다
export async function signUp(input: SignUpInput) {
  const user = await userRepository.create(input);
  await bus.emit("userSignedUp", { userId: user.id, email: user.email });
  return user;
}

// 각 모듈이 스스로 구독한다
bus.on("userSignedUp", ({ email }) => mailer.sendWelcome(email));
bus.on("userSignedUp", ({ userId }) => couponService.issueWelcomeCoupon(userId));
```

의존 방향이 뒤집혔다. 회원 모듈은 누가 듣는지 모르고, 새 후속 작업은 **회원 모듈을 수정하지 않고** 추가된다. 이벤트 이름과 페이로드가 타입으로 묶여 있어 오타나 잘못된 필드는 컴파일 단계에서 걸린다.

### 어디서 보는가

DOM의 `addEventListener`, Node.js의 `EventEmitter`, RxJS의 Observable, React 상태 관리 라이브러리의 구독 기능이 모두 Observer다. 안티패턴 4편에서 본 서비스 간 이벤트 발행은 이 패턴을 시스템 규모로 확장한 것이다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 한 변화에 반응해야 하는 대상이 여럿이고, 그 목록이 계속 바뀔 때
- **주의 1 — 메모리 누수** — 구독만 하고 해제하지 않으면 관찰자가 계속 메모리에 남는다. React에서 `useEffect`의 정리 함수로 구독을 해제하는 이유다.
- **주의 2 — 흐름의 은폐** — 이벤트가 이벤트를 부르는 연쇄는 "무엇이 무엇을 일으키는지" 추적하기 어렵게 만든다. 안티패턴 2편에서 본 **Spaghetti Code의 현대적 형태**가 바로 이것이다. 이벤트는 "이미 일어난 사실"을 알리는 데 쓰고, 반드시 순서대로 실행되어야 하는 핵심 흐름은 직접 호출로 남긴다.

---

## 17. Command

### 의도

**요청 자체를 객체로 캡슐화**한다. 요청을 객체로 만들면 매개변수화, 큐에 저장, 로그 기록, 실행 취소(undo)가 가능해진다.

### 문제 상황

에디터의 버튼 클릭 핸들러가 동작을 직접 실행한다. 이 구조에서는 "실행 취소"를 구현할 방법이 없다. 무엇을 어떻게 실행했는지에 대한 기록이 남지 않기 때문이다.

### 적용

```ts
interface Command {
  execute(): void;
  undo(): void;
}

class InsertTextCommand implements Command {
  constructor(
    private readonly doc: TextDocument,
    private readonly position: number,
    private readonly text: string,
  ) {}

  execute() {
    this.doc.insert(this.position, this.text);
  }

  undo() {
    this.doc.delete(this.position, this.text.length);
  }
}

class DeleteTextCommand implements Command {
  #deleted = "";

  constructor(
    private readonly doc: TextDocument,
    private readonly position: number,
    private readonly length: number,
  ) {}

  execute() {
    this.#deleted = this.doc.slice(this.position, this.length); // 되돌리기 위해 기억
    this.doc.delete(this.position, this.length);
  }

  undo() {
    this.doc.insert(this.position, this.#deleted);
  }
}

class CommandHistory {
  #done: Command[] = [];
  #undone: Command[] = [];

  run(command: Command) {
    command.execute();
    this.#done.push(command);
    this.#undone = []; // 새 작업을 하면 다시 실행 기록은 사라진다
  }

  undo() {
    const command = this.#done.pop();
    if (!command) return;
    command.undo();
    this.#undone.push(command);
  }

  redo() {
    const command = this.#undone.pop();
    if (!command) return;
    command.execute();
    this.#done.push(command);
  }
}
```

버튼 핸들러는 이제 `history.run(new InsertTextCommand(doc, pos, "안녕"))`만 호출한다. **요청하는 쪽(버튼)과 실행하는 쪽(문서)이 분리**되었고, 그 사이에 기록이 생겼다.

### 직렬화 가능한 커맨드

커맨드를 **순수 데이터**로 표현하면 저장하고 전송할 수 있다. 작업 큐와 이벤트 소싱이 이 방식을 쓴다.

```ts
type JobCommand =
  | { type: "sendEmail"; to: string; templateId: string }
  | { type: "generateReport"; reportId: string; month: string };

await queue.enqueue<JobCommand>({ type: "generateReport", reportId: "sales", month: "2026-09" });

// 워커는 커맨드를 꺼내 실행한다 — 요청 시점과 실행 시점이 분리된다
```

Redux의 액션도 "무엇을 할지"를 데이터로 표현한 커맨드다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 실행 취소/다시 실행, 작업 예약과 큐잉, 작업 이력 기록, 매크로(여러 커맨드를 묶어 실행)
- **피할 때** — 단순히 함수를 호출하면 되는 곳. 기록도, 취소도, 지연 실행도 필요 없다면 커맨드 객체는 불필요한 한 겹이다.

---

## 18. Chain of Responsibility

### 의도

요청을 보내는 쪽과 받는 쪽의 결합을 없애기 위해, **여러 처리자를 사슬로 연결**하고 요청을 사슬을 따라 전달한다. 각 처리자는 요청을 직접 처리하거나 다음 처리자에게 넘긴다.

### 문제 상황

API 요청 하나를 처리하기 전에 인증, 권한, 요청 제한, 입력 검증을 해야 한다. 이것을 핸들러마다 반복하면 순서가 제각각이 되고 빠뜨리기 쉽다.

### 적용

```ts
type Context = {
  req: Request;
  user?: { id: string; role: string };
};

type Middleware = (ctx: Context, next: () => Promise<Response>) => Promise<Response>;

// 각 처리자는 자기 일만 하고, 계속할지 멈출지 결정한다
const authenticate: Middleware = async (ctx, next) => {
  const token = ctx.req.headers.get("authorization");
  if (!token) return new Response("Unauthorized", { status: 401 }); // 사슬 중단
  ctx.user = await verifyToken(token);
  return next(); // 다음 처리자로
};

const requireRole = (role: string): Middleware => async (ctx, next) => {
  if (ctx.user?.role !== role) return new Response("Forbidden", { status: 403 });
  return next();
};

const timing: Middleware = async (ctx, next) => {
  const start = Date.now();
  const res = await next(); // 뒤쪽 처리자들이 모두 끝난 뒤 돌아온다
  console.log(`${ctx.req.url} ${Date.now() - start}ms`);
  return res;
};

// 사슬 조립
function compose(middlewares: Middleware[], handler: (ctx: Context) => Promise<Response>) {
  return (ctx: Context) => {
    const dispatch = (i: number): Promise<Response> =>
      i === middlewares.length
        ? handler(ctx)
        : middlewares[i](ctx, () => dispatch(i + 1));
    return dispatch(0);
  };
}

export const deleteUser = compose(
  [timing, authenticate, requireRole("admin")],
  async (ctx) => {
    /* 실제 삭제 로직 */
    return new Response(null, { status: 204 });
  },
);
```

`timing`처럼 `next()` **앞뒤로** 코드를 둘 수 있는 방식은 Koa의 미들웨어 구조에서 널리 알려졌다. 요청이 사슬을 따라 들어갔다가 응답이 거꾸로 빠져나오는 모양이다.

### 정석과의 차이

GoF의 원형은 **요청을 처리할 수 있는 처리자 하나가 처리하면 전달이 끝나는** 구조다. 고객 문의를 상담원 → 팀장 → 부서장 순으로 올리는 결재 흐름을 떠올리면 된다. 웹 프레임워크의 미들웨어는 여러 처리자가 **모두 조금씩 일하는** 변형이지만, "처리자를 사슬로 연결하고 각자 계속 여부를 결정한다"는 핵심은 같다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 요청 전처리/후처리(인증, 로깅, 검증), 이벤트 버블링, 단계적 승인, 여러 파서 중 처리 가능한 것 찾기
- **주의** — 사슬이 길어지면 요청이 **어디서 멈췄는지** 알기 어렵다. 또한 사슬 순서가 의미를 가진다. 인증보다 권한 검사가 먼저 오면 `ctx.user`가 비어 있다. 순서를 한곳에서 조립하고 문서화한다.

---

## 마치며

| 패턴 | 핵심 질문 | TypeScript다운 형태 |
|---|---|---|
| Strategy | 알고리즘을 어떻게 갈아 끼울까? | 함수 레코드 + `satisfies` |
| State | 상태마다 행동이 다르면? | 상태 클래스 또는 전이 표 |
| Template Method | 순서는 같고 단계만 다르면? | 뼈대 함수 + 단계 객체 주입 |
| Observer | 변화를 누구에게 알릴까? | 타입 안전한 이벤트 버스 |
| Command | 요청을 기록하고 되돌리려면? | 커맨드 객체, 직렬화 가능한 유니온 타입 |
| Chain of Responsibility | 처리자를 어떻게 이어 붙일까? | 미들웨어 + `compose` |

여섯 패턴 모두 **"누가 무엇을 결정하는가"**를 옮기는 기술이다. 분기 결정을 객체로(Strategy, State), 순서 결정을 상위 구조로(Template Method, Chain), 반응 결정을 구독자로(Observer), 실행 시점 결정을 호출자 바깥으로(Command) 옮긴다.

마지막 4편에서는 나머지 행위 패턴 다섯 가지 — Iterator, Mediator, Memento, Visitor, Interpreter — 를 다룬다.
