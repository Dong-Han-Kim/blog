---
# 📌 기본 메타데이터
title: 'TypeScript로 다시 읽는 GoF 디자인 패턴 — 2편: 구조 패턴'
date: '2026-09-16'
category: 'architecture'
tags: ['Design Pattern', 'GoF', 'Structural Pattern', 'TypeScript']
description: 'Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy — 객체와 클래스를 조합해 더 큰 구조를 만드는 일곱 가지 패턴'

# 💬 옵션 필드
draft: false
series: 'TypeScript로 다시 읽는 GoF 디자인 패턴'
seriesOrder: 2

# 📚 SEO용
keywords: ['Design Pattern', 'GoF', 'Structural Pattern', 'TypeScript', '디자인 패턴', '구조 패턴', '어댑터', '데코레이터', '프록시', '퍼사드']
---

# TypeScript로 다시 읽는 GoF 디자인 패턴 — 2편: 구조 패턴

## 시작하며

[1편](/posts/design-patterns-creational)의 생성 패턴이 객체를 **어떻게 만드는가**의 문제였다면, 구조 패턴은 만들어진 객체를 **어떻게 엮는가**의 문제다.

구조 패턴 일곱 가지는 겉보기에 비슷하다. 대부분 "객체 하나가 다른 객체를 감싸고 있다"는 모양을 하고 있기 때문이다. 그래서 이번 편에서는 각 패턴의 **구조**보다 **의도**의 차이에 집중한다. 같은 모양이라도 무엇을 위해 감쌌는지가 패턴을 구분한다.

| 패턴 | 감싸는 이유 |
|---|---|
| Adapter | 인터페이스를 **바꾸기** 위해 |
| Decorator | 기능을 **더하기** 위해 |
| Proxy | 접근을 **통제하기** 위해 |
| Facade | 복잡함을 **숨기기** 위해 |

---

## 6. Adapter

### 의도

호환되지 않는 인터페이스를 가진 클래스를, 클라이언트가 기대하는 **인터페이스로 변환**한다. 모양이 다른 플러그를 콘센트 규격에 맞춰 주는 변환 어댑터와 같다.

### 문제 상황

우리 시스템은 결제를 다음 인터페이스로 다룬다.

```ts
interface PaymentGateway {
  charge(request: { orderId: string; amountKrw: number }): Promise<{ transactionId: string }>;
}
```

새로 계약한 결제사의 SDK는 전혀 다른 모양이다. 금액은 문자열이고, 콜백 방식이며, 에러는 결과 코드로 알려준다.

```ts
// 외부 SDK — 우리가 수정할 수 없다
declare class LegacyPayClient {
  requestPayment(
    params: { merchantUid: string; price: string; currency: "KRW" },
    callback: (result: { code: string; tid?: string; message?: string }) => void,
  ): void;
}
```

### 적용

```ts
export class LegacyPayAdapter implements PaymentGateway {
  constructor(private readonly client: LegacyPayClient) {}

  charge({ orderId, amountKrw }: { orderId: string; amountKrw: number }) {
    return new Promise<{ transactionId: string }>((resolve, reject) => {
      this.client.requestPayment(
        { merchantUid: orderId, price: String(amountKrw), currency: "KRW" },
        (result) => {
          if (result.code === "0000" && result.tid) {
            resolve({ transactionId: result.tid });
          } else {
            reject(new PaymentFailedError(result.code, result.message));
          }
        },
      );
    });
  }
}
```

어댑터 하나가 **세 가지 불일치**를 흡수했다. 필드 이름, 데이터 타입, 비동기 방식(콜백 → Promise)이다. 에러 코드를 도메인 에러로 바꾸는 것은 안티패턴 3편 Leaky Abstraction의 처방과 같다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 외부 라이브러리, 레거시 코드, 벤더 SDK를 우리 인터페이스에 맞출 때. 안티패턴 5편 Vendor Lock-In의 처방도 결국 Adapter다.
- **주의** — 어댑터는 **변환만** 해야 한다. 비즈니스 규칙이 어댑터 안에 들어가기 시작하면 벤더를 교체할 때 규칙까지 다시 구현해야 한다.

---

## 7. Bridge

### 의도

**추상화(무엇을 하는가)와 구현(어떻게 하는가)을 분리**해서 둘이 독립적으로 확장되게 한다.

### 문제 상황

알림에는 종류(일반 알림, 긴급 알림, 요약 알림)가 있고, 채널(이메일, SMS, 슬랙)이 있다. 이것을 상속으로만 표현하면 조합마다 클래스가 필요하다.

```
Notification
├── NormalEmailNotification
├── NormalSmsNotification
├── NormalSlackNotification
├── UrgentEmailNotification
├── UrgentSmsNotification
├── UrgentSlackNotification
├── DigestEmailNotification
└── ...  (종류 3 × 채널 3 = 9개, 채널이 하나 늘면 12개)
```

두 개의 변화 축이 하나의 상속 계층에 얽혀서 **클래스 수가 곱셈으로 늘어난다.**

### 적용

두 축을 분리하고, 추상화가 구현을 **참조**(합성)하게 한다. 이 참조가 두 계층을 잇는 "다리"다.

```ts
// 구현 계층 — 어떻게 보내는가
interface Channel {
  deliver(to: string, subject: string, body: string): Promise<void>;
}

class EmailChannel implements Channel {
  async deliver(to: string, subject: string, body: string) { /* SMTP 발송 */ }
}

class SmsChannel implements Channel {
  async deliver(to: string, _subject: string, body: string) {
    /* 제목 없이 본문만, 길이 제한 적용 */
  }
}

// 추상화 계층 — 무엇을 보내는가
abstract class Notification {
  constructor(protected readonly channel: Channel) {}
  abstract send(to: string, message: string): Promise<void>;
}

class NormalNotification extends Notification {
  send(to: string, message: string) {
    return this.channel.deliver(to, "알림", message);
  }
}

class UrgentNotification extends Notification {
  async send(to: string, message: string) {
    // 긴급 알림은 세 번까지 재시도한다 — 채널과 무관한 규칙
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.channel.deliver(to, "[긴급]", message);
      } catch (e) {
        if (attempt === 3) throw e;
      }
    }
  }
}

// 조합은 런타임에 결정된다
new UrgentNotification(new SmsChannel()).send("010-0000-0000", "서버 응답 없음");
```

이제 클래스 수는 **곱셈이 아니라 덧셈**(종류 3 + 채널 3)으로 늘어난다.

### Adapter와의 차이

코드 모양은 비슷하지만 시점이 다르다. Adapter는 **이미 존재하는** 호환되지 않는 것들을 **사후에** 맞춘다. Bridge는 두 축이 독립적으로 변할 것을 **미리 알고 설계 단계에서** 분리한다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 상속 계층에 서로 독립적인 변화 축이 두 개 이상 섞여 있을 때
- **피할 때** — 한 축만 변할 때. 두 번째 축이 "생길지도 모른다"는 이유로 미리 분리하면 안티패턴 2편의 Premature Optimization과 같은 실수가 된다.

---

## 8. Composite

### 의도

객체들을 **트리 구조**로 구성하고, 클라이언트가 **개별 객체(잎)와 복합 객체(가지)를 똑같이 다룰 수 있게** 한다.

### 문제 상황

파일 시스템에서 크기를 계산할 때, 파일이면 크기를 바로 읽고 폴더면 내부를 순회해야 한다. 이 구분을 사용하는 쪽이 매번 하면 코드 곳곳에 타입 검사가 생긴다.

```ts
function getSize(node: FileNode | FolderNode): number {
  if (node instanceof FileNode) return node.bytes;
  let total = 0;
  for (const child of node.children) {
    total += getSize(child); // 권한 계산, 검색, 삭제에도 같은 분기가 반복된다
  }
  return total;
}
```

### 적용

잎과 가지가 **같은 인터페이스**를 구현한다.

```ts
interface FsNode {
  readonly name: string;
  size(): number;
  find(predicate: (node: FsNode) => boolean): FsNode[];
}

class File implements FsNode {
  constructor(readonly name: string, private readonly bytes: number) {}

  size() {
    return this.bytes;
  }

  find(predicate: (node: FsNode) => boolean) {
    return predicate(this) ? [this] : [];
  }
}

class Folder implements FsNode {
  #children: FsNode[] = [];

  constructor(readonly name: string) {}

  add(...nodes: FsNode[]) {
    this.#children.push(...nodes);
    return this;
  }

  size() {
    return this.#children.reduce((sum, child) => sum + child.size(), 0);
  }

  find(predicate: (node: FsNode) => boolean): FsNode[] {
    const self = predicate(this) ? [this] : [];
    return [...self, ...this.#children.flatMap((child) => child.find(predicate))];
  }
}

const root = new Folder("root").add(
  new File("README.md", 1_200),
  new Folder("src").add(new File("index.ts", 3_400), new File("app.ts", 5_100)),
);

root.size(); // 9700 — 호출하는 쪽은 파일인지 폴더인지 신경 쓰지 않는다
root.find((n) => n.name.endsWith(".ts"));
```

재귀는 사용하는 쪽이 아니라 **각 노드 안**에 있다.

### 어디서 보는가

React의 컴포넌트 트리, DOM, 메뉴와 하위 메뉴, 조직도, 부품 구성표(BOM)가 모두 Composite 구조다. React에서 컴포넌트 하나와 컴포넌트 여러 개를 감싼 Fragment를 똑같이 렌더링할 수 있는 것도 같은 발상이다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 데이터가 본질적으로 부분-전체 계층을 이룰 때
- **주의** — 잎에는 의미 없는 `add` 같은 메서드를 공통 인터페이스에 넣으면, 안티패턴 3편 Swiss Army Knife가 된다. 위 예제처럼 **자식 관리 메서드는 가지에만** 두는 편이 안전하다.

---

## 9. Decorator

### 의도

객체를 감싸서 **기존 인터페이스를 유지한 채 책임을 동적으로 추가**한다. 상속 없이 기능을 확장하는 방법이다.

### 문제 상황

HTTP 클라이언트에 로깅, 재시도, 캐싱을 붙이고 싶다. 상속으로 해결하면 조합 폭발이 일어난다. `LoggingHttpClient`, `RetryingHttpClient`, `LoggingRetryingHttpClient`, `CachingLoggingRetryingHttpClient`…

### 적용 — 정석 구현

모든 데코레이터는 **감싸는 대상과 같은 인터페이스**를 구현한다. 그래서 몇 겹이든 감쌀 수 있다.

```ts
interface HttpClient {
  get<T>(url: string): Promise<T>;
}

class FetchClient implements HttpClient {
  async get<T>(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as T;
  }
}

class LoggingClient implements HttpClient {
  constructor(private readonly inner: HttpClient) {}

  async get<T>(url: string) {
    const start = performance.now();
    try {
      return await this.inner.get<T>(url);
    } finally {
      console.log(`GET ${url} ${Math.round(performance.now() - start)}ms`);
    }
  }
}

class RetryClient implements HttpClient {
  constructor(private readonly inner: HttpClient, private readonly retries = 3) {}

  async get<T>(url: string) {
    let lastError: unknown;
    for (let i = 0; i < this.retries; i++) {
      try {
        return await this.inner.get<T>(url);
      } catch (e) {
        lastError = e;
        await new Promise((r) => setTimeout(r, 2 ** i * 100)); // 지수 백오프
      }
    }
    throw lastError;
  }
}

// 조합 순서가 곧 동작 순서다
const client: HttpClient = new LoggingClient(new RetryClient(new FetchClient()));
```

`LoggingClient`가 가장 바깥에 있으므로 재시도를 포함한 **전체 소요 시간**이 기록된다. 순서를 바꾸면 **시도 한 번마다** 기록된다. 데코레이터에서는 감싸는 순서가 의미를 가진다.

### TypeScript에서는

인터페이스가 함수 하나라면 **고차 함수**가 가장 간결한 데코레이터다.

```ts
type Fetcher<T> = (url: string) => Promise<T>;

const withRetry = <T>(fn: Fetcher<T>, retries = 3): Fetcher<T> =>
  async (url) => {
    for (let i = 0; ; i++) {
      try {
        return await fn(url);
      } catch (e) {
        if (i >= retries - 1) throw e;
      }
    }
  };

const withLogging = <T>(fn: Fetcher<T>): Fetcher<T> =>
  async (url) => {
    console.log(`GET ${url}`);
    return fn(url);
  };

const getJson = withLogging(withRetry(fetchJson));
```

React의 고차 컴포넌트(HOC), Express 미들웨어도 같은 계열이다. TypeScript 5.0부터는 ECMAScript 표준 데코레이터 문법(`@decorator`)도 지원하는데, 이름은 같지만 클래스와 메서드에 메타 기능을 붙이는 **언어 기능**이다. GoF의 Decorator 패턴을 구현하는 데 쓸 수는 있지만 둘이 같은 개념은 아니다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 로깅, 캐싱, 재시도, 권한 검사, 측정처럼 **핵심 로직과 직교하는 부가 기능**을 조합할 때
- **주의** — 겹이 많아지면 스택 트레이스가 깊어지고 디버깅이 어려워진다. 조합을 한곳(애플리케이션 조립 지점)에서만 하도록 규칙을 둔다.

---

## 10. Facade

### 의도

복잡한 하위 시스템에 대해 **단순화된 통합 인터페이스**를 제공한다. 건물의 정면(facade)만 보고 내부 구조를 몰라도 출입할 수 있는 것과 같다.

### 문제 상황

주문 한 건을 처리하려면 컨트롤러가 여섯 개 모듈의 호출 순서와 실패 처리를 모두 알아야 한다.

```ts
export async function postOrder(req: Request) {
  const cart = await cartModule.get(req.userId);
  const priced = await pricingModule.calculate(cart, req.couponCode);
  await inventoryModule.reserve(cart.items);
  try {
    const payment = await paymentModule.charge(req.userId, priced.total);
    const order = await orderModule.create(req.userId, cart, payment.id);
    await notificationModule.orderPlaced(order);
    return order;
  } catch (e) {
    await inventoryModule.release(cart.items);
    throw e;
  }
}
// 앱 API, 관리자 API, 배치 작업에 같은 코드가 복사된다
```

### 적용

```ts
export class CheckoutFacade {
  constructor(
    private readonly cart: CartModule,
    private readonly pricing: PricingModule,
    private readonly inventory: InventoryModule,
    private readonly payment: PaymentModule,
    private readonly orders: OrderModule,
    private readonly notifications: NotificationModule,
  ) {}

  async placeOrder(userId: string, couponCode?: string) {
    const cart = await this.cart.get(userId);
    const priced = await this.pricing.calculate(cart, couponCode);
    await this.inventory.reserve(cart.items);

    try {
      const paid = await this.payment.charge(userId, priced.total);
      const order = await this.orders.create(userId, cart, paid.id);
      await this.notifications.orderPlaced(order);
      return order;
    } catch (e) {
      await this.inventory.release(cart.items);
      throw e;
    }
  }
}

// 사용하는 쪽은 한 줄
export const postOrder = (req: Request) => checkout.placeOrder(req.userId, req.couponCode);
```

하위 모듈은 그대로 남아 있다. Facade는 하위 시스템을 **감추는 것이 아니라 편한 입구를 추가**하는 것이다. 세밀한 제어가 필요한 쪽은 여전히 하위 모듈을 직접 쓸 수 있다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 여러 모듈을 정해진 순서로 조합하는 흐름이 여러 곳에서 반복될 때, 라이브러리의 복잡한 API를 팀이 쓰기 쉽게 감쌀 때
- **주의 1** — 하위 모듈 호출을 그대로 전달하기만 하는 Facade는 안티패턴 3편의 **Architecture Sinkhole**이다. Facade는 **조합과 순서**라는 실제 일을 해야 존재 이유가 있다.
- **주의 2** — 모든 흐름을 한 Facade에 몰아넣으면 안티패턴 1편의 **God Object**가 된다. 유스케이스 단위로 나눈다.

---

## 11. Flyweight

### 의도

많은 수의 비슷한 객체를 효율적으로 다루기 위해, **공유 가능한 상태를 분리해 여러 객체가 함께 쓰도록** 한다.

GoF는 객체의 상태를 두 가지로 나눈다.

- **내재 상태(intrinsic)** — 객체 자체에 속하며 여러 객체가 공유할 수 있는 상태 (예: 아이콘 이미지, 색상, 폰트)
- **외재 상태(extrinsic)** — 사용하는 맥락에 따라 달라져 공유할 수 없는 상태 (예: 좌표, 개별 ID)

### 문제 상황

지도 위에 설비 마커 10만 개를 그린다. 마커마다 아이콘 이미지 데이터와 스타일 객체를 따로 가지면 메모리가 폭증한다.

```ts
const markers = equipments.map((eq) => ({
  id: eq.id,
  x: eq.x,
  y: eq.y,
  icon: loadIconBitmap(eq.type),         // 같은 타입이어도 매번 새로 로드
  style: { color: colorOf(eq.type), size: 16, border: "1px solid #000" },
}));
```

설비 종류가 다섯 가지뿐이라면, 아이콘과 스타일은 사실 **다섯 벌이면 충분하다.**

### 적용

```ts
// 공유되는 내재 상태
class MarkerType {
  constructor(
    readonly bitmap: ImageBitmap,
    readonly color: string,
    readonly size: number,
  ) {}

  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.drawImage(this.bitmap, x, y, this.size, this.size);
  }
}

// 플라이웨이트 팩토리 — 같은 키면 같은 객체를 돌려준다
class MarkerTypeFactory {
  #cache = new Map<string, MarkerType>();

  async get(kind: string): Promise<MarkerType> {
    let type = this.#cache.get(kind);
    if (!type) {
      type = new MarkerType(await loadIconBitmap(kind), colorOf(kind), 16);
      this.#cache.set(kind, type);
    }
    return type;
  }
}

// 개별 마커는 외재 상태와 공유 객체에 대한 참조만 가진다
interface Marker {
  id: string;
  x: number;
  y: number;
  type: MarkerType;
}

function render(ctx: CanvasRenderingContext2D, markers: Marker[]) {
  for (const m of markers) m.type.draw(ctx, m.x, m.y);
}
```

10만 개의 마커가 5개의 `MarkerType`을 공유한다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 객체 수가 매우 많고, 그 상태의 대부분이 공유 가능하며, **메모리가 실제로 문제임을 측정으로 확인했을 때**
- **피할 때** — 객체가 수백 개 수준일 때. Flyweight는 코드를 복잡하게 만드는 성능 최적화이므로, 측정 없이 적용하면 안티패턴 2편의 Premature Optimization이다.
- **주의** — 공유 객체는 반드시 **불변**이어야 한다. 마커 하나가 공유 스타일의 색을 바꾸면 같은 종류의 마커 10만 개가 모두 바뀐다.

---

## 12. Proxy

### 의도

다른 객체에 대한 **대리자**를 두어, 그 객체에 대한 **접근을 통제**한다. 실제 객체와 같은 인터페이스를 가지므로 사용하는 쪽은 대리자인지 모른다.

GoF는 목적에 따라 프록시를 구분한다.

- **가상 프록시** — 생성 비용이 큰 객체를 실제로 필요할 때까지 늦게 만든다
- **보호 프록시** — 권한에 따라 접근을 제한한다
- **원격 프록시** — 다른 주소 공간(서버)에 있는 객체를 로컬 객체처럼 보이게 한다
- 흔히 여기에 **캐싱 프록시**, **로깅 프록시** 등이 더해진다

### 적용 — 보호 프록시

```ts
interface DocumentStore {
  read(id: string): Promise<Doc>;
  delete(id: string): Promise<void>;
}

class ProtectedDocumentStore implements DocumentStore {
  constructor(
    private readonly real: DocumentStore,
    private readonly user: { id: string; role: "viewer" | "admin" },
  ) {}

  read(id: string) {
    return this.real.read(id);
  }

  async delete(id: string) {
    if (this.user.role !== "admin") {
      throw new ForbiddenError(`${this.user.id}는 문서를 삭제할 수 없습니다`);
    }
    return this.real.delete(id);
  }
}
```

### Decorator와의 차이

구조는 거의 같다. 차이는 **의도와 관계의 주도권**이다.

- Decorator는 **기능을 더한다.** 여러 겹을 자유롭게 쌓는 것이 전제이고, 조합은 사용하는 쪽이 정한다.
- Proxy는 **접근을 통제한다.** 실제 객체의 생성·수명·권한을 대리자가 관리하는 경우가 많고, 사용하는 쪽은 보통 실제 객체를 직접 만나지 않는다.

### TypeScript에서는

JavaScript에는 언어 차원의 `Proxy` 객체가 있다. 속성 읽기, 쓰기, 함수 호출 같은 기본 동작을 가로챌 수 있다.

```ts
// 가상 프록시 — 무거운 객체를 첫 접근 시점에 생성
function lazy<T extends object>(factory: () => T): T {
  let instance: T | null = null;
  return new Proxy({} as T, {
    get(_target, prop) {
      instance ??= factory();
      const value = Reflect.get(instance, prop);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
}

const reportEngine = lazy(() => new HeavyReportEngine()); // 아직 생성되지 않음
reportEngine.render(data);                                // 이 순간 생성
```

Vue 3의 반응성 시스템, MobX, Immer가 내장 `Proxy`로 객체 접근을 가로채 변경을 추적한다. tRPC 클라이언트처럼 서버 함수를 로컬 함수처럼 호출하게 해 주는 도구는 **원격 프록시**의 현대적인 형태라고 볼 수 있다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 지연 로딩, 권한 검사, 원격 호출 캡슐화, 캐싱
- **주의** — 원격 프록시는 네트워크 호출을 **로컬 호출처럼 보이게** 만든다. 편리한 만큼 호출 비용이 가려져서, 반복문 안에서 무심코 호출하면 안티패턴 4편의 **Chatty Services**가 된다.

---

## 마치며

| 패턴 | 핵심 의도 | 연결되는 안티패턴 |
|---|---|---|
| Adapter | 인터페이스 변환 | Leaky Abstraction, Vendor Lock-In의 처방 |
| Bridge | 두 변화 축의 분리 | 상속으로 인한 클래스 폭발 방지 |
| Composite | 부분과 전체를 동일하게 | 잎에 무의미한 메서드 → Swiss Army Knife |
| Decorator | 기능의 동적 추가 | 상속 조합 폭발 방지 |
| Facade | 복잡함에 대한 단순한 입구 | 전달만 하면 Sinkhole, 비대하면 God Object |
| Flyweight | 공유로 메모리 절약 | 측정 없으면 Premature Optimization |
| Proxy | 접근 통제 | 원격 호출 은폐 → Chatty Services |

구조 패턴은 모두 **합성**(composition)으로 문제를 푼다. 1편에서 말한 "상속보다 합성" 원칙이 가장 직접적으로 드러나는 범주다.

다음 편부터는 행위 패턴이다. 객체를 만들고 조합했다면, 이제 그 객체들이 **어떻게 책임을 나누고 협력하는가**를 본다.
