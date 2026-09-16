---
# 📌 기본 메타데이터
title: '디자인 패턴 전에 알아야 할 안티패턴 — 3편: 계층과 모듈 구조'
date: '2026-09-16'
category: 'architecture'
tags: ['Anti-Pattern', 'Architecture', 'Layered Architecture', 'DDD', 'TypeScript']
description: 'Architecture Sinkhole, Cyclic Dependency, Leaky Abstraction, Anemic Domain Model, Inner-Platform Effect, Swiss Army Knife — 한 애플리케이션 안에서 계층과 모듈의 경계가 무너진 안티패턴'

# 💬 옵션 필드
draft: false
series: '디자인 패턴 전에 알아야 할 안티패턴'
seriesOrder: 3

# 📚 SEO용
keywords: ['Anti-Pattern', 'Architecture', 'Layered Architecture', 'DDD', 'TypeScript', '안티패턴', '계층 구조', '순환 의존', '빈약한 도메인 모델', '누수 추상화']
---

# 디자인 패턴 전에 알아야 할 안티패턴 — 3편: 계층과 모듈 구조

## 시작하며

[1편](/posts/anti-patterns-before-design-patterns)은 함수와 파일 단위의 안티패턴을, [2편](/posts/anti-patterns-architecture-and-process)은 시스템 구조와 개발 문화 차원의 안티패턴을 다뤘다. 2편의 Big Ball of Mud가 **아키텍처가 아예 없는 상태**였다면, 3~5편은 **아키텍처가 분명히 있는데 잘못 설계된 상태**를 다룬다.

- **3편 (이번 글)** — 한 애플리케이션 안의 계층과 모듈 경계
- **4편** — 경계가 네트워크가 된 분산 시스템
- **5편** — 시스템 간 통합과 아키텍처를 결정하는 조직

> **분류에 대한 메모**
> 안티패턴이라는 용어를 대중화한 Brown 외 『AntiPatterns』(1998)는 안티패턴을 **개발(Development)**, **아키텍처(Architecture)**, **관리(Management)** 세 범주로 나눈다. 원전 기준으로 2편의 Spaghetti Code와 Lava Flow는 개발 범주에 속한다. 이 시리즈는 원전 분류 대신 **"문제가 영향을 미치는 범위"**를 기준으로 재분류하고 있다는 점을 밝혀 둔다.

이번 편의 여섯 가지는 다음과 같다.

14. **Architecture Sinkhole** — 아무 일도 하지 않는 계층
15. **Cyclic Dependency** — 서로를 import하는 모듈
16. **Leaky Abstraction** — 구현 세부가 인터페이스 밖으로 새는 설계
17. **Anemic Domain Model** — 데이터만 있고 행위가 없는 도메인 객체
18. **Inner-Platform Effect** — 발밑의 플랫폼을 조잡하게 다시 만드는 설계
19. **Swiss Army Knife** — 모든 쓰임새를 담은 비대한 인터페이스

---

## 14. Architecture Sinkhole

### 정의

계층형 아키텍처에서 **요청이 각 계층을 통과하지만, 어떤 계층도 실질적인 일을 하지 않고 다음 계층으로 넘기기만 하는 상태**를 말한다. Mark Richards가 『Software Architecture Patterns』에서 계층형 아키텍처의 대표적인 함정으로 소개한 이름이다. 요청이 구멍(sinkhole)에 빠지듯 아래로 흘러내려 가기만 한다.

### 냄새나는 코드

```ts
// controller
export async function getUserHandler(req: Request) {
  return userService.getUser(req.params.id);
}

// service
export const userService = {
  getUser: (id: string) => userFacade.getUser(id),
};

// facade
export const userFacade = {
  getUser: (id: string) => userRepository.findById(id),
};

// repository
export const userRepository = {
  findById: (id: string) => db.query.users.findFirst({ where: eq(users.id, id) }),
};
```

네 개의 계층이 있지만 실제로 일하는 곳은 repository 하나다. 여기에 응답 필드 하나를 추가하려면 네 파일의 타입을 모두 고쳐야 한다. 1편의 **Shotgun Surgery**가 구조적으로 강제되는 셈이다.

### 판단 기준 — 80/20 규칙

통과만 하는 요청이 존재하는 것 자체는 문제가 아니다. Richards는 **요청의 약 20%가 단순 통과라면 정상, 80%가 단순 통과라면 싱크홀**이라는 기준을 제시한다. 계층 대부분이 의미를 잃었다면 계층형 구조가 이 시스템에 맞는지부터 다시 물어야 한다.

### 처방

첫째, **의미 없는 계층은 제거한다.** "나중에 로직이 생길지도 몰라서" 만든 계층은 2편 Premature Optimization의 구조 버전이다.

둘째, **열린 계층(open layer)을 명시적으로 허용한다.** 단순 조회는 서비스 계층을 건너뛰어도 된다고 규칙으로 정해 둔다. 읽기와 쓰기 경로를 나누는 가벼운 CQRS가 자연스러운 형태다.

```ts
// 읽기 경로 — 도메인 규칙이 없으므로 쿼리 모듈이 직접 조회
export const userQueries = {
  getProfile: (id: string) =>
    db.select({ id: users.id, name: users.name, grade: users.grade })
      .from(users)
      .where(eq(users.id, id)),
};

// 쓰기 경로 — 규칙이 있는 곳만 서비스를 거친다
export const userCommands = {
  async changeEmail(id: string, email: string) {
    const user = await userRepository.findById(id);
    user.changeEmail(email); // 검증, 중복 확인, 이벤트 발행
    await userRepository.save(user);
  },
};
```

핵심은 **"건너뛰어도 되는 경우"를 개인 판단이 아니라 팀 규칙으로 문서화**하는 것이다. 규칙 없는 계층 건너뛰기는 곧 계층의 붕괴로 이어진다.

---

## 15. Cyclic Dependency

### 정의

**모듈 A가 B를 의존하고, B가 다시 A를 의존하는 순환 구조**다. Robert C. Martin은 이를 막기 위해 **ADP(Acyclic Dependencies Principle, 비순환 의존성 원칙)** — 모듈 의존 그래프에는 순환이 없어야 한다 — 를 제시했다.

순환이 생기면 두 모듈은 사실상 하나의 모듈이 된다. 따로 테스트할 수 없고, 따로 이해할 수 없고, 따로 떼어낼 수 없다.

### 냄새나는 코드

```ts
// order/order.service.ts
import { userService } from "../user/user.service";

export const orderService = {
  async create(userId: string, items: OrderItem[]) {
    const user = await userService.find(userId);
    // ...
  },
  async countByUser(userId: string) {
    return orderRepository.count({ userId });
  },
};

// user/user.service.ts
import { orderService } from "../order/order.service";

export const userService = {
  async find(id: string) { /* ... */ },
  async getGrade(id: string) {
    const count = await orderService.countByUser(id);
    return count > 10 ? "VIP" : "NORMAL";
  },
};
```

처음에는 아무 문제 없이 동작한다. 그러다 누군가 모듈 최상위에서 상대 모듈의 값을 사용하는 순간, **import 시점에 아직 초기화되지 않은 값**을 참조하는 에러가 터진다. 에러 위치는 원인과 전혀 상관없는 곳이라 추적이 어렵다.

### 처방

**1. 의존 방향을 정하고, 공통 관심사를 추출한다.** "회원 등급"은 회원 정보와 주문 이력을 모두 알아야 하는 별개의 관심사다.

```ts
// grade/grade.service.ts — user와 order를 모두 의존하는 상위 모듈
import { userService } from "../user/user.service";
import { orderService } from "../order/order.service";

export const gradeService = {
  async getGrade(userId: string) {
    const user = await userService.find(userId);
    if (!user) throw new UserNotFoundError(userId);
    const count = await orderService.countByUser(userId);
    return count > 10 ? "VIP" : "NORMAL";
  },
};
// user → order 의존이 사라졌다. 이제 방향은 grade → user, grade → order, order → user 한 방향뿐이다.
```

**2. 의존성 역전(DIP)을 적용한다.** 하위 모듈이 인터페이스를 정의하고 상위 모듈이 구현을 주입한다.

**3. 이벤트로 끊는다.** "주문 완료 시 등급 재계산"처럼 결과만 알리면 되는 경우 직접 호출 대신 이벤트를 발행한다.

### 탐지

순환은 눈으로 찾기 어렵기 때문에 도구로 막는다.

```bash
npx madge --circular --extensions ts src/
```

ESLint의 `import/no-cycle` 규칙이나 dependency-cruiser를 CI에 넣어 두면 순환이 **생기는 순간** 차단할 수 있다.

---

## 16. Leaky Abstraction

### 정의

Joel Spolsky는 2002년 글에서 **자명하지 않은 추상화는 정도의 차이일 뿐 모두 새어 나온다**는 "새는 추상화의 법칙"을 제시했다. 여기서 안티패턴은 누수 그 자체가 아니다. **하위 구현의 세부가 인터페이스 밖으로 흘러나와서, 호출자가 구현을 알아야만 올바르게 쓸 수 있는 설계**가 안티패턴이다.

### 냄새나는 코드

```ts
interface UserRepository {
  findById(id: string): Promise<User | null>;
  // 호출자가 SQL 문법과 컬럼명을 알아야 한다
  search(whereClause: string): Promise<User[]>;
}

// service
try {
  await userRepository.create(user);
} catch (e: any) {
  // PostgreSQL의 unique_violation 에러 코드를 서비스가 알고 있다
  if (e.code === "23505") {
    throw new Error("이미 가입된 이메일입니다");
  }
  throw e;
}
```

인터페이스는 "저장소"라고 말하지만, 실제로는 **PostgreSQL을 알아야 쓸 수 있는 저장소**다. DB를 바꾸는 순간 서비스 계층의 에러 처리가 조용히 망가진다.

### 처방

구현 세부는 구현체 안에서 **도메인의 언어로 번역**한다.

```ts
export class DuplicateEmailError extends Error {
  constructor(public readonly email: string) {
    super(`이미 가입된 이메일입니다: ${email}`);
  }
}

export interface UserSearchCriteria {
  nameContains?: string;
  grade?: "VIP" | "NORMAL";
  joinedAfter?: Date;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  search(criteria: UserSearchCriteria): Promise<User[]>;
  create(user: User): Promise<void>; // 중복 시 DuplicateEmailError
}

// 구현체 내부에서만 DB를 안다
export class PgUserRepository implements UserRepository {
  async create(user: User) {
    try {
      await db.insert(users).values(toRow(user));
    } catch (e) {
      if (isUniqueViolation(e)) throw new DuplicateEmailError(user.email);
      throw e;
    }
  }
  // ...
}
```

### 판단 기준과 주의점

"구현을 교체하면 호출부도 고쳐야 하는가?"가 가장 단순한 판별 질문이다.

다만 **모든 누수를 막으려는 시도 역시 실패한다.** 네트워크 지연, N+1 쿼리, 트랜잭션 경계 같은 성능·일관성 특성은 인터페이스 뒤로 완전히 숨길 수 없다. 숨길 수 없는 누수는 억지로 감추지 말고 **인터페이스 문서에 드러내는 것**이 정직한 설계다.

---

## 17. Anemic Domain Model

### 정의

Martin Fowler가 2003년에 이름 붙인 안티패턴이다. **도메인 객체가 데이터 필드와 getter/setter만 갖고, 모든 비즈니스 규칙은 서비스 계층에 있는 상태**를 말한다. 겉모습은 객체지향이지만 실체는 "데이터 구조 + 절차적 함수"다. 빈혈(anemic)이라는 이름처럼 객체에 행위라는 피가 돌지 않는다.

### 냄새나는 코드

```ts
export class Order {
  id!: string;
  status!: "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";
  items!: OrderItem[];
  paidAt?: Date;
}

export const orderService = {
  cancel(order: Order) {
    if (order.status === "SHIPPED") throw new Error("배송된 주문은 취소할 수 없습니다");
    if (order.status === "CANCELLED") throw new Error("이미 취소된 주문입니다");
    order.status = "CANCELLED";
  },
};

// 다른 파일 어딘가 — 규칙을 그대로 우회한다
order.status = "CANCELLED";
```

"배송된 주문은 취소할 수 없다"는 규칙이 `Order`가 아닌 곳에 있으니, `status`에 직접 값을 넣는 코드를 막을 방법이 없다. 서비스는 `Order`의 데이터만 만지작거리므로 1편의 **Feature Envy**가 계층 전체에 퍼진 형태이기도 하다.

### 처방

규칙을 데이터 곁으로 옮기고, 상태는 캡슐화한다.

```ts
export class Order {
  #status: OrderStatus;

  constructor(
    public readonly id: string,
    status: OrderStatus,
    private readonly items: OrderItem[],
  ) {
    this.#status = status;
  }

  get status() {
    return this.#status;
  }

  cancel() {
    if (this.#status === "SHIPPED") throw new OrderAlreadyShippedError(this.id);
    if (this.#status === "CANCELLED") throw new OrderAlreadyCancelledError(this.id);
    this.#status = "CANCELLED";
  }

  get total() {
    return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }
}

// 서비스는 조율만 한다
export const orderService = {
  async cancel(orderId: string) {
    const order = await orderRepository.findById(orderId);
    order.cancel();
    await orderRepository.save(order);
  },
};
```

이제 `order.status = "CANCELLED"`는 컴파일되지 않는다. 규칙을 우회할 길이 타입 수준에서 사라졌다.

### 주의 — 언제나 안티패턴은 아니다

비즈니스 규칙이 거의 없는 **단순 CRUD 시스템에서는 빈약한 모델이 오히려 적절하다.** Fowler 자신도 로직이 단순하면 Transaction Script(절차적으로 트랜잭션을 처리하는 방식)가 합리적인 선택이라고 설명한다. 안티패턴이 되는 조건은 **"규칙이 복잡한데도 규칙이 객체 밖에 흩어져 있을 때"**다.

---

## 18. Inner-Platform Effect

### 정의

시스템을 지나치게 유연하게 만들려다가, **그 시스템이 올라타 있는 플랫폼(데이터베이스, 프로그래밍 언어)을 시스템 안에 조잡하게 다시 만들어 버리는 현상**이다. The Daily WTF를 통해 널리 알려진 용어다.

2편의 Reinventing the Wheel이 **외부의 검증된 라이브러리**를 다시 만드는 것이라면, Inner-Platform Effect는 **지금 딛고 서 있는 플랫폼 자체**를 다시 만드는 것이다.

### 냄새나는 설계 1 — EAV 테이블

"컬럼이 계속 추가되니 스키마를 유연하게 하자"는 발상에서 시작한다.

```sql
CREATE TABLE entity_attributes (
  entity_id   BIGINT,
  attr_name   VARCHAR(100),
  attr_value  VARCHAR(4000)
);
```

이제 스키마 변경 없이 어떤 속성이든 저장할 수 있다. 대신 **타입 검사, NOT NULL, 외래 키, 인덱스, 간단한 WHERE 절**을 모두 잃는다. "30세 이상이면서 서울에 사는 회원"을 조회하려면 같은 테이블을 여러 번 self join해야 하고, 나이는 문자열로 비교된다. 데이터베이스가 원래 제공하던 기능을 애플리케이션 코드로 하나씩 다시 구현하게 된다.

### 냄새나는 설계 2 — 설정으로 만든 프로그래밍 언어

```ts
const discountRule = {
  if: { field: "order.total", op: ">", value: 100000 },
  then: { action: "applyDiscount", rate: 0.1 },
};
```

처음에는 깔끔하다. 곧 AND/OR가 필요해지고, 변수가 필요해지고, 반복이 필요해진다. 결국 **디버거도, 타입 검사도, 테스트 도구도 없는 나쁜 프로그래밍 언어**가 완성된다.

### 처방

- 스키마는 실제 테이블과 마이그레이션으로 관리한다. 스키마 변경을 두려워하는 것이 근본 원인이라면 마이그레이션 자동화를 먼저 개선한다.
- 정말로 사용자가 정의하는 동적 속성이 필요하다면, 핵심 필드는 정규 컬럼으로 두고 나머지만 JSONB 같은 반정형 컬럼에 담는다.
- 규칙은 코드로 작성하고, 설정에는 **값**만 둔다.

```ts
// 규칙은 코드, 임계값과 비율은 설정
export function calculateDiscount(order: Order, config: DiscountConfig) {
  return order.total > config.threshold ? order.total * config.rate : 0;
}
```

### 판단 기준

"이 설정 포맷에 조건문이나 반복문이 필요해지고 있는가?", "애플리케이션 코드가 데이터 타입 검증을 직접 하고 있는가?" 둘 중 하나라도 그렇다면 플랫폼을 다시 만들고 있을 가능성이 높다.

---

## 19. Swiss Army Knife

### 정의

『AntiPatterns』의 아키텍처 범주에 속하는 안티패턴으로, **예상 가능한 모든 쓰임새를 하나의 인터페이스에 담아 지나치게 비대해진 상태**를 말한다. 인터페이스 분리 원칙(ISP)을 위반한 대표 사례다.

1편의 God Object와 비슷해 보이지만 초점이 다르다. God Object는 **구현**이 비대한 것이고, Swiss Army Knife는 **계약(인터페이스)**이 비대한 것이다. 구현은 여러 클래스에 나뉘어 있어도 계약 하나가 모든 것을 요구할 수 있다.

### 냄새나는 코드

```ts
export interface StorageClient {
  upload(key: string, body: Buffer): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  createSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  setLifecyclePolicy(policy: LifecyclePolicy): Promise<void>;
  replicate(targetRegion: string): Promise<void>;
  encrypt(key: string): Promise<void>;
  resizeImage(key: string, width: number): Promise<void>;
  scanVirus(key: string): Promise<ScanResult>;
}

export class LocalDiskStorage implements StorageClient {
  // ...
  async replicate() { throw new Error("Not supported"); }
  async setLifecyclePolicy() { throw new Error("Not supported"); }
  async resizeImage() { throw new Error("Not supported"); }
}
```

프로필 이미지를 보여주기만 하는 컴포넌트도 이 인터페이스 전체에 의존한다. 테스트용 mock을 만들 때마다 쓰지도 않는 메서드 열 개를 채워야 한다.

### 처방

사용하는 쪽의 **역할**을 기준으로 인터페이스를 나눈다.

```ts
export interface FileReader {
  download(key: string): Promise<Buffer>;
}

export interface FileWriter {
  upload(key: string, body: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface SignedUrlIssuer {
  createSignedUrl(key: string, ttlSeconds: number): Promise<string>;
}

// 소비자는 필요한 역할만 의존한다
export async function getAvatarUrl(userId: string, urls: SignedUrlIssuer) {
  return urls.createSignedUrl(`avatars/${userId}`, 300);
}

// 구현체는 가능한 역할만 구현한다
export class S3Storage implements FileReader, FileWriter, SignedUrlIssuer { /* ... */ }
export class LocalDiskStorage implements FileReader, FileWriter { /* ... */ }
```

이미지 리사이즈나 바이러스 검사처럼 저장소와 본질적으로 다른 책임은 별도 모듈로 분리한다.

### 판단 기준

구현체에 `Not supported`가 있는가? mock에 빈 메서드를 채우고 있는가? 인터페이스 이름에 `Manager`, `Client`, `Helper`처럼 무엇이든 담을 수 있는 단어가 붙어 있는가?

---

## 마치며

이번 편의 여섯 가지는 모두 **경계가 제 역할을 못 하는 상태**다.

| 안티패턴 | 무너진 경계 | 빠른 탐지 신호 |
|---|---|---|
| Architecture Sinkhole | 계층이 의미를 잃음 | 필드 하나 추가에 계층 수만큼 파일 수정 |
| Cyclic Dependency | 모듈 간 방향이 사라짐 | `madge --circular` 결과 |
| Leaky Abstraction | 구현이 인터페이스로 샘 | 구현 교체 시 호출부 수정 필요 |
| Anemic Domain Model | 데이터와 규칙이 분리됨 | 상태 필드에 외부에서 직접 대입 |
| Inner-Platform Effect | 시스템과 플랫폼의 경계 | 설정에 조건문, 코드에서 타입 검증 |
| Swiss Army Knife | 역할 간 경계 | `Not supported` 구현, 거대한 mock |

한 프로세스 안에서는 이런 문제가 "불편함"으로 끝난다. 하지만 이 경계들이 **네트워크로 바뀌는 순간** 같은 문제가 지연과 장애가 되어 돌아온다. 4편에서는 분산 시스템에서 이 문제들이 어떻게 증폭되는지 다룬다.
