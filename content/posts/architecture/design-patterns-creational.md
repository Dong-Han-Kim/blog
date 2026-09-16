---
# 📌 기본 메타데이터
title: 'TypeScript로 다시 읽는 GoF 디자인 패턴 — 1편: 들어가며와 생성 패턴'
date: '2026-09-16'
category: 'architecture'
tags: ['Design Pattern', 'GoF', 'Creational Pattern', 'TypeScript', 'SOLID']
description: '디자인 패턴이 무엇이고 왜 배우는지, 그리고 Singleton, Factory Method, Abstract Factory, Builder, Prototype — 객체를 만드는 방법에 대한 다섯 가지 패턴'

# 💬 옵션 필드
draft: false
series: 'TypeScript로 다시 읽는 GoF 디자인 패턴'
seriesOrder: 1

# 📚 SEO용
keywords: ['Design Pattern', 'GoF', 'Creational Pattern', 'TypeScript', 'SOLID', '디자인 패턴', '생성 패턴', '싱글턴', '팩토리 메서드', '빌더', '프로토타입']
---

# TypeScript로 다시 읽는 GoF 디자인 패턴 — 1편: 들어가며와 생성 패턴

## 들어가며

[안티패턴 시리즈](/posts/anti-patterns-before-design-patterns)는 "이렇게 하면 망가진다"는 이야기였다. 이번 시리즈는 그 반대편, **"이런 문제에는 이런 구조가 검증되었다"**는 이야기다.

### 디자인 패턴이란

1994년 Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides 네 사람이 쓴 『Design Patterns: Elements of Reusable Object-Oriented Software』는 반복적으로 나타나는 설계 문제와 그 해법 23가지에 이름을 붙였다. 저자 네 명을 묶어 **GoF(Gang of Four)**라고 부른다.

패턴은 복사해서 붙여 넣는 코드가 아니다. 각 패턴은 다음 네 가지로 구성된다.

- **이름** — 팀이 설계를 한 단어로 이야기할 수 있게 해 주는 어휘
- **문제** — 언제 이 패턴을 고려해야 하는가
- **해법** — 참여하는 요소들과 그 관계
- **결과** — 적용했을 때 얻는 것과 잃는 것

네 번째 항목이 특히 중요하다. **모든 패턴에는 비용이 있다.** 비용을 모르고 패턴을 쓰면 안티패턴 2편의 Golden Hammer, 1편의 Cargo Cult가 된다.

### 모든 패턴을 관통하는 두 원칙

GoF 책 서두는 23개 패턴의 바탕이 되는 두 원칙을 제시한다.

1. **구현이 아니라 인터페이스에 맞춰 프로그래밍하라.**
2. **클래스 상속보다 객체 합성을 선호하라.**

패턴 대부분은 이 두 원칙을 특정 상황에 적용한 결과다. 패턴이 기억나지 않을 때는 이 두 문장으로 돌아가면 된다.

### 왜 "TypeScript로 다시" 읽는가

GoF 책의 예제는 C++과 Smalltalk로 쓰였다. 함수가 일급 객체가 아니고, 모듈 시스템이 약했던 언어들이다. JavaScript/TypeScript에서는 **언어가 이미 패턴을 내장**하고 있는 경우가 많다.

- Iterator → `Symbol.iterator`와 제너레이터
- Proxy → 내장 `Proxy` 객체
- Prototype → 프로토타입 체인 자체
- Strategy, Command → 함수 한 개

그래서 이 시리즈는 각 패턴을 **클래스 기반의 정석 구현**과 **TypeScript다운 구현**으로 나란히 보여준다. 정석을 알아야 라이브러리 코드가 읽히고, 언어다운 방식을 알아야 불필요한 클래스를 만들지 않는다.

### 시리즈 구성

GoF는 23개 패턴을 목적에 따라 세 범주로 나눈다.

| 편 | 범주 | 패턴 |
|---|---|---|
| 1편 | 생성(Creational) — 객체를 **만드는** 방법 | Singleton, Factory Method, Abstract Factory, Builder, Prototype |
| 2편 | 구조(Structural) — 객체를 **조합하는** 방법 | Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy |
| 3편 | 행위(Behavioral) Ⅰ — 책임을 **나누는** 방법 | Strategy, State, Template Method, Observer, Command, Chain of Responsibility |
| 4편 | 행위(Behavioral) Ⅱ — 순회·조율·기록·해석 | Iterator, Mediator, Memento, Visitor, Interpreter |

각 패턴은 **의도 → 문제 상황 → 적용 → TypeScript에서는 → 언제 쓰고 언제 피하나** 순서로 설명한다.

---

## 생성 패턴이 푸는 문제

`new ConcreteClass()`는 코드에서 가장 강한 결합이다. 호출한 쪽이 **구체 클래스의 이름, 생성자 인자, 생성 순서**를 모두 알아야 하기 때문이다. 생성 패턴은 "무엇을 만드는가"와 "어떻게 만드는가"를 사용하는 쪽에서 떼어낸다.

---

## 1. Singleton

### 의도

클래스의 **인스턴스가 오직 하나**만 존재하도록 보장하고, 그 인스턴스에 대한 **전역 접근점**을 제공한다.

### 문제 상황

DB 커넥션 풀, 설정 객체, 로거처럼 여러 개 만들면 자원이 낭비되거나 상태가 어긋나는 객체가 있다.

```ts
// 요청마다 풀이 새로 만들어진다 — 커넥션이 금방 고갈된다
export async function getUser(id: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool.query("SELECT * FROM users WHERE id = $1", [id]);
}
```

### 적용 — 정석 구현

```ts
export class Database {
  static #instance: Database | null = null;
  readonly pool: Pool;

  private constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  static getInstance(): Database {
    if (!Database.#instance) {
      Database.#instance = new Database();
    }
    return Database.#instance;
  }
}

const db = Database.getInstance();
```

`private constructor`가 외부의 `new`를 막고, `getInstance`가 유일한 생성 경로가 된다.

### TypeScript에서는

**ES 모듈 자체가 싱글턴이다.** 모듈은 처음 import될 때 한 번만 평가되고, 이후 import는 같은 결과를 공유한다.

```ts
// db.ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

대부분의 경우 이것으로 충분하다. 단, 예외가 있다. Next.js 개발 서버처럼 **핫 리로드로 모듈이 다시 평가되는 환경**에서는 인스턴스가 계속 새로 생긴다. 이때는 `globalThis`에 보관하는 방식을 흔히 쓴다.

```ts
const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}
```

### 언제 쓰고 언제 피하나

Singleton은 GoF 패턴 중 **가장 많이 비판받는 패턴**이다. 전역 접근점은 곧 **전역 상태**이고, 전역 상태는 다음 문제를 낳는다.

- 어떤 함수가 무엇에 의존하는지 시그니처에 드러나지 않는다
- 테스트마다 상태가 공유되어 테스트 순서에 따라 결과가 달라진다
- 테스트에서 가짜 객체로 교체하기 어렵다

그래서 현대 코드에서는 **"하나만 만든다"와 "전역으로 꺼내 쓴다"를 분리**한다. 인스턴스는 애플리케이션 시작 지점에서 하나만 만들고, 필요한 곳에는 **인자로 전달(의존성 주입)**한다.

```ts
// 의존성을 인자로 받는다 — 테스트에서 가짜 pool을 넣을 수 있다
export function createUserRepository(pool: Pool) {
  return {
    findById: (id: string) => pool.query("SELECT * FROM users WHERE id = $1", [id]),
  };
}
```

---

## 2. Factory Method

### 의도

객체를 생성하는 인터페이스는 정의하되, **어떤 클래스의 인스턴스를 만들지는 하위 클래스(또는 구현)가 결정**하게 한다.

### 문제 상황

알림 발송 로직이 채널의 구체 클래스를 직접 생성한다.

```ts
export async function notify(channel: string, to: string, message: string) {
  if (channel === "email") {
    await new EmailSender(smtpConfig).send(to, message);
  } else if (channel === "sms") {
    await new SmsSender(smsApiKey).send(to, message);
  } else if (channel === "slack") {
    await new SlackSender(webhookUrl).send(to, message);
  }
}
```

채널이 추가될 때마다 이 함수를 열어 분기를 추가해야 한다. 개방-폐쇄 원칙(OCP) 위반이고, 같은 분기가 여러 곳에 있다면 안티패턴 1편의 Shotgun Surgery로 이어진다.

### 적용 — 정석 구현

GoF의 Factory Method는 **상속**을 사용한다. 상위 클래스가 알고리즘의 뼈대를 갖고, "무엇을 만들지"만 하위 클래스에 맡긴다.

```ts
interface Sender {
  send(to: string, message: string): Promise<void>;
}

abstract class Notifier {
  // 팩토리 메서드 — 하위 클래스가 구현한다
  protected abstract createSender(): Sender;

  async notify(to: string, message: string) {
    const sender = this.createSender();
    await sender.send(to, this.format(message));
  }

  protected format(message: string) {
    return `[알림] ${message}`;
  }
}

class EmailNotifier extends Notifier {
  protected createSender() {
    return new EmailSender(smtpConfig);
  }
}

class SlackNotifier extends Notifier {
  protected createSender() {
    return new SlackSender(webhookUrl);
  }
}
```

`Notifier.notify`는 어떤 Sender가 만들어지는지 모른 채로 동작한다.

### TypeScript에서는

실무에서는 상속 대신 **생성 함수를 등록하는 방식**(흔히 "심플 팩토리" 또는 레지스트리라고 부른다)이 더 자주 쓰인다. 엄밀히는 GoF의 Factory Method와 다르지만, 같은 목적 — 생성 책임의 분리 — 을 달성한다.

```ts
type SenderFactory = () => Sender;

const senderFactories: Record<string, SenderFactory> = {
  email: () => new EmailSender(smtpConfig),
  sms: () => new SmsSender(smsApiKey),
  slack: () => new SlackSender(webhookUrl),
};

export function createSender(channel: keyof typeof senderFactories): Sender {
  return senderFactories[channel]();
}
```

새 채널은 레지스트리에 한 줄을 추가하는 것으로 끝난다. `keyof typeof`로 존재하지 않는 채널 이름은 컴파일 단계에서 걸러진다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 생성할 구체 타입이 런타임에 결정되거나, 앞으로 늘어날 것이 분명할 때
- **피할 때** — 구현체가 하나뿐이고 늘어날 계획도 없을 때. 이때 팩토리는 안티패턴 3편의 Architecture Sinkhole처럼 아무 일도 하지 않는 계층이 된다.

---

## 3. Abstract Factory

### 의도

**서로 관련된 객체들의 묶음(제품군)**을, 구체 클래스를 지정하지 않고 생성할 수 있는 인터페이스를 제공한다.

Factory Method가 **객체 하나**의 생성을 추상화한다면, Abstract Factory는 **함께 쓰여야 하는 객체 여러 개**의 생성을 추상화한다.

### 문제 상황

운영 환경에서는 클라우드 저장소와 클라우드 큐를, 로컬 개발 환경에서는 디스크 저장소와 메모리 큐를 쓴다. 이 둘은 **짝이 맞아야** 한다. 로컬 디스크 저장소와 운영 큐가 섞이면 개발 중에 운영 큐로 메시지가 날아간다.

```ts
// 조합을 각자 결정하면 잘못된 짝이 섞이기 쉽다
const storage = isProd ? new S3Storage() : new DiskStorage();
const queue = isProd ? new SqsQueue() : new InMemoryQueue();
const cache = process.env.USE_REDIS ? new RedisCache() : new MemoryCache(); // 기준이 또 다르다
```

### 적용

```ts
interface FileStorage {
  save(key: string, body: Buffer): Promise<void>;
}

interface JobQueue {
  enqueue(job: Job): Promise<void>;
}

// 추상 팩토리 — 제품군을 한 번에 만든다
interface InfraFactory {
  createStorage(): FileStorage;
  createQueue(): JobQueue;
}

class CloudInfraFactory implements InfraFactory {
  createStorage() { return new S3Storage(process.env.BUCKET!); }
  createQueue() { return new SqsQueue(process.env.QUEUE_URL!); }
}

class LocalInfraFactory implements InfraFactory {
  createStorage() { return new DiskStorage("./.data"); }
  createQueue() { return new InMemoryQueue(); }
}

// 환경 판단은 딱 한 곳에서
export function createInfraFactory(): InfraFactory {
  return process.env.NODE_ENV === "production"
    ? new CloudInfraFactory()
    : new LocalInfraFactory();
}

// 사용하는 쪽은 제품군이 무엇인지 모른다
const infra = createInfraFactory();
const storage = infra.createStorage();
const queue = infra.createQueue();
```

환경 분기가 한 곳으로 모였고, **잘못된 짝이 섞일 방법이 사라졌다.**

### TypeScript에서는

객체 리터럴로도 충분히 표현된다.

```ts
const localInfra: InfraFactory = {
  createStorage: () => new DiskStorage("./.data"),
  createQueue: () => new InMemoryQueue(),
};
```

### 언제 쓰고 언제 피하나

- **쓸 때** — 테마(라이트/다크 컴포넌트 묶음), 환경(운영/로컬/테스트), DB 방언처럼 **일관성이 중요한 제품군**이 여러 개일 때
- **피할 때** — 제품군이 하나뿐일 때. 또한 제품 종류를 추가하려면(예: `createCache` 추가) **모든 팩토리 구현을 수정**해야 한다는 비용을 감수해야 한다. 제품군은 자주 늘지만 제품 종류는 잘 늘지 않는 상황에 적합하다.

---

## 4. Builder

### 의도

복잡한 객체의 **생성 과정을 단계별로 분리**해서, 같은 생성 절차로 서로 다른 표현을 만들 수 있게 한다.

### 문제 상황

생성자 인자가 많아지면 호출 코드가 읽히지 않는다. 이를 흔히 **점층적 생성자(telescoping constructor)** 문제라고 부른다.

```ts
const query = new SearchQuery("users", ["id", "name"], "age > 20", "name", "ASC", 20, 40, true, false);
// 여덟 번째 true는 무슨 뜻인가? 아홉 번째 false는?
```

### 적용

```ts
type Order = "ASC" | "DESC";

class SearchQuery {
  constructor(
    readonly table: string,
    readonly columns: string[],
    readonly conditions: string[],
    readonly orderBy: { column: string; order: Order } | null,
    readonly limit: number | null,
    readonly offset: number | null,
  ) {}
}

class SearchQueryBuilder {
  #columns: string[] = ["*"];
  #conditions: string[] = [];
  #orderBy: { column: string; order: Order } | null = null;
  #limit: number | null = null;
  #offset: number | null = null;

  constructor(private readonly table: string) {}

  select(...columns: string[]) {
    this.#columns = columns;
    return this;
  }

  where(condition: string) {
    this.#conditions.push(condition);
    return this;
  }

  orderBy(column: string, order: Order = "ASC") {
    this.#orderBy = { column, order };
    return this;
  }

  paginate(page: number, size: number) {
    if (page < 1 || size < 1) throw new Error("page와 size는 1 이상이어야 합니다");
    this.#limit = size;
    this.#offset = (page - 1) * size;
    return this;
  }

  build() {
    return new SearchQuery(
      this.table, this.#columns, this.#conditions,
      this.#orderBy, this.#limit, this.#offset,
    );
  }
}

const query = new SearchQueryBuilder("users")
  .select("id", "name")
  .where("age > 20")
  .orderBy("name")
  .paginate(3, 20)
  .build();
```

각 단계에 이름이 생겼고, `paginate`처럼 **여러 필드를 일관되게 설정하는 규칙**과 검증을 한곳에 둘 수 있다. Drizzle, Knex, Prisma 같은 쿼리 빌더가 이 패턴의 대표적인 예다.

> 예제의 `where(condition: string)`은 구조 설명용이다. 실제 쿼리 빌더는 SQL 인젝션을 막기 위해 값을 파라미터로 분리한다.

### TypeScript에서는

필드가 많을 뿐 단계별 규칙이 없다면 **옵션 객체**로 충분하다.

```ts
function createSearchQuery(options: {
  table: string;
  columns?: string[];
  limit?: number;
}) { /* ... */ }

createSearchQuery({ table: "users", limit: 20 });
```

이름 있는 인자, 선택적 필드, 기본값을 모두 얻는다. Builder가 필요한 것은 **생성 과정에 순서나 규칙이 있을 때**, 또는 **같은 과정으로 다른 결과물**(SQL 문자열, 실행 계획 등)을 만들어야 할 때다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 선택적 요소가 많고 조합 규칙이 있을 때, 불변 객체를 단계적으로 조립하고 싶을 때
- **피할 때** — 필드 몇 개짜리 단순 객체. 옵션 객체나 생성자로 충분한 곳에 Builder를 두면 코드량만 두 배가 된다.

---

## 5. Prototype

### 의도

**원형(prototype) 인스턴스를 복제**해서 새 객체를 만든다. 생성 비용이 크거나, 런타임에 구성된 객체를 기준으로 비슷한 객체를 여럿 만들어야 할 때 쓴다.

### 문제 상황

사용자가 화면에서 복잡하게 설정한 차트를 "복제" 버튼으로 복사하고 싶다. 설정 항목이 수십 개인데, 복사 코드를 필드마다 작성하면 필드가 추가될 때마다 복사 코드를 빠뜨린다.

### 적용

복제 책임을 **객체 자신**에게 둔다.

```ts
interface Cloneable<T> {
  clone(): T;
}

class ChartConfig implements Cloneable<ChartConfig> {
  constructor(
    public title: string,
    public series: { name: string; color: string }[],
    public axis: { min: number; max: number },
  ) {}

  clone(): ChartConfig {
    return new ChartConfig(
      this.title,
      this.series.map((s) => ({ ...s })), // 중첩 배열은 깊게 복사
      { ...this.axis },
    );
  }
}

const original = new ChartConfig("매출", [{ name: "2026", color: "#0a0" }], { min: 0, max: 100 });
const copy = original.clone();
copy.title = "매출 (사본)";
copy.series[0].color = "#a00"; // 원본에는 영향 없음
```

핵심은 **얕은 복사와 깊은 복사의 구분**이다. 스프레드 연산자(`{ ...obj }`)는 한 단계만 복사하므로, 중첩된 배열과 객체는 원본과 사본이 공유하게 된다. 복제 로직을 객체 안에 두면 "무엇을 깊게 복사해야 하는지"를 그 객체를 가장 잘 아는 곳에서 결정할 수 있다.

### TypeScript에서는

JavaScript는 이름부터 **프로토타입 기반 언어**다. `Object.create(proto)`는 프로토타입을 원형으로 새 객체를 만든다. 데이터 복제에는 내장 `structuredClone`을 쓸 수 있다.

```ts
const plainConfig = { title: "매출", series: [{ name: "2026", color: "#0a0" }] };
const deepCopy = structuredClone(plainConfig);
```

단, `structuredClone`은 **클래스 인스턴스의 프로토타입을 보존하지 않는다.** 복사 결과는 일반 객체가 되어 메서드가 사라지고, 함수가 들어 있으면 에러가 발생한다. 클래스 인스턴스를 복제할 때는 위처럼 `clone` 메서드를 직접 구현하는 편이 안전하다.

### 언제 쓰고 언제 피하나

- **쓸 때** — 복사·붙여넣기, 템플릿에서 새 문서 만들기, 초기화 비용이 큰 객체(파싱 결과 등)를 여러 벌 만들 때
- **피할 때** — 순환 참조나 외부 자원(커넥션, 파일 핸들)을 가진 객체. 이런 객체는 "복제"의 의미 자체가 모호하다.

---

## 마치며

| 패턴 | 한 줄 요약 | TypeScript다운 대안 |
|---|---|---|
| Singleton | 인스턴스를 하나로 제한 | ES 모듈 + 의존성 주입 |
| Factory Method | 무엇을 만들지 하위 구현이 결정 | 생성 함수 레지스트리 |
| Abstract Factory | 짝이 맞는 제품군을 한 번에 생성 | 팩토리 객체 리터럴 |
| Builder | 복잡한 생성을 단계로 분리 | 옵션 객체 (규칙이 없을 때) |
| Prototype | 원형을 복제해 생성 | `structuredClone` (일반 데이터일 때) |

다섯 패턴의 공통점은 **사용하는 쪽이 `new`와 구체 클래스 이름을 몰라도 되게 만드는 것**이다. 다음 편에서는 이렇게 만든 객체들을 **어떻게 조합하는가**, 구조 패턴 일곱 가지를 다룬다.
