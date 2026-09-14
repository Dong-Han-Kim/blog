---
# 📌 기본 메타데이터
title: '디자인 패턴 전에 알아야 할 안티패턴 7가지'
date: '2026-09-14'
category: 'architecture'
tags: ['Anti-Pattern', 'Code Smell', 'Refactoring', 'Clean Code', 'SOLID', 'TypeScript']
description: 'Magic Number, God Object, Long Method, Feature Envy, Shotgun Surgery, Primitive Obsession, Cargo Cult — 언어와 프레임워크를 가리지 않고 등장하는 대표 안티패턴 전체'

# 💬 옵션 필드
draft: false
series: '디자인 패턴 전에 알아야 할 안티패턴'
seriesOrder: 1

# 📚 SEO용
keywords: ['Anti-Pattern', 'Code Smell', 'Refactoring', 'Clean Code', 'SOLID', 'TypeScript', '안티패턴', '디자인 패턴']
---

# 디자인 패턴 전에 알아야 할 안티패턴 7가지

## 시작하며

디자인 패턴을 배우기 전에 안티패턴부터 보는 데는 이유가 있다. **디자인 패턴은 결국 안티패턴을 피하기 위해 정리된 해결책**이기 때문이다. "왜 이 패턴이 필요한가"를 먼저 체감하면 학습이 훨씬 자연스럽다.

이 글에서 다루는 일곱 가지는 특정 언어나 프레임워크에 종속되지 않는 **범용 안티패턴**이다. 프론트엔드든 백엔드든, TypeScript든 Java든, 어디에서도 같은 진단과 처방이 통한다.

순서에도 의도가 있다.

1. **Magic Number / Magic String** — 리터럴 차원의 문제
2. **God Object** — 클래스/모듈 차원의 문제
3. **Long Method** — 함수 차원의 문제
4. **Feature Envy** — 책임 위치의 문제 (한 곳에 잘못 뭉침)
5. **Shotgun Surgery** — 책임 위치의 문제 (여러 곳에 잘못 흩어짐)
6. **Primitive Obsession** — 도메인 표현 부재의 문제
7. **Cargo Cult Programming** — 사고방식과 프로세스의 문제

작은 단위에서 시작해 점점 시야를 넓히고, 마지막에는 코드 자체가 아닌 **코드를 짜는 사고방식**으로 결이 바뀐다. 마지막 하나가 다른 여섯을 감싸는 메타 레벨의 안티패턴이다.

---

## 1. Magic Number / Magic String

### 정의

코드 안에 **설명 없이 박혀 있는 숫자나 문자열 리터럴**을 말한다. 그 값이 왜 거기 있는지, 무엇을 의미하는지 코드만 봐서는 알 수 없는 상태다.

### 냄새나는 코드

```typescript
function calculateShipping(weight: number, country: string): number {
  if (country === "KR") {
    if (weight > 30) {
      return weight * 1500 + 5000;
    }
    return weight * 1500;
  }
  if (country === "US") {
    return weight * 3000 + 10000;
  }
  return 0;
}
```

이 코드를 처음 보는 사람의 머릿속에는 즉시 이런 질문들이 떠오른다.

- `30`은 무엇인가? kg? 박스 개수?
- `1500`, `3000`은 무엇의 단위 가격인가?
- `5000`, `10000`은 추가 요금인가, 통관비인가?
- `"KR"`, `"US"`는 어떤 코드체계인가? ISO?

작성자는 알고 있을지 몰라도, 6개월 뒤의 동료 또는 6개월 뒤의 본인에게는 미스터리가 된다.

### 왜 안티패턴인가

세 가지 문제가 동시에 발생한다.

**1. 의도 소실.** 작성 시점의 맥락이 코드에 표현되지 않아, 시간이 지나면 그 숫자의 의미가 사라진다.

**2. 변경의 산탄총 효과.** `1500`이 코드베이스 여러 곳에 흩어져 있으면, 가격 인상 시 모든 곳을 찾아 바꿔야 한다. 게다가 "이 1500과 저 1500이 같은 1500인가?"를 매번 추론해야 한다.

**3. 타입 안정성 붕괴.** `country === "KR"`은 오타가 나도 컴파일러가 잡아주지 못한다. `"Kr"`, `"KOR"` 같은 변형이 모두 통과한다.

### 리팩토링

```typescript
const SHIPPING_RATE_PER_KG = {
  KR: 1500,
  US: 3000,
} as const;

const HEAVY_PACKAGE_THRESHOLD_KG = 30;
const HEAVY_PACKAGE_SURCHARGE_KRW = 5000;
const INTERNATIONAL_HANDLING_FEE_KRW = 10000;

type CountryCode = keyof typeof SHIPPING_RATE_PER_KG;

function calculateShipping(weight: number, country: CountryCode): number {
  const baseRate = SHIPPING_RATE_PER_KG[country] * weight;

  if (country === "KR" && weight > HEAVY_PACKAGE_THRESHOLD_KG) {
    return baseRate + HEAVY_PACKAGE_SURCHARGE_KRW;
  }
  if (country === "US") {
    return baseRate + INTERNATIONAL_HANDLING_FEE_KRW;
  }
  return baseRate;
}
```

상수로 빼는 순간 **이름이 곧 문서**가 된다. `HEAVY_PACKAGE_THRESHOLD_KG`라는 이름만 봐도 단위와 의미가 즉시 전달된다.

추가로 `as const`와 `keyof typeof`를 활용해 `CountryCode` 타입을 도출했다. 이제 `country` 파라미터에 `"Kr"` 같은 오타가 들어오면 컴파일 단계에서 에러가 난다.

### 모든 리터럴을 상수로 빼야 할까

이 안티패턴을 처음 배운 사람이 흔히 빠지는 함정이 **모든 리터럴을 상수로 빼버리는 것**이다. `array.length - 1`의 `1`을 `LAST_INDEX_OFFSET`으로, `for (let i = 0; i < arr.length; i++)`의 `0`을 `FIRST_INDEX`로 빼는 식이다. 이렇게 하면 가독성이 오히려 떨어진다.

리터럴이 다음 셋 중 하나에 해당할 때만 빼는 것이 맞다.

**1. 도메인 의미가 있는가.** `30`이 "무거운 짐의 기준"이라는 도메인 의미를 가지면 뺀다. 반면 `arr.length - 1`의 `1`은 "배열의 마지막 인덱스를 구한다"는 관용구라 이름을 붙이면 노이즈가 된다.

**2. 두 번 이상 등장하는가.** 같은 값이 여러 곳에 나오면 거의 항상 빼는 것이 맞다. 동일한 정책을 표현하는 두 리터럴이 따로 존재하면 둘 중 하나만 변경되어 정책이 어긋날 위험이 생긴다.

**3. 바뀔 가능성이 있는가.** 가격, 정책, 임계값 같은 것은 언젠가 바뀐다. 반면 수학적 상수(`Math.PI`)나 관용구(`i = 0`, `i++`)는 바뀌지 않는다.

한 줄로 압축하면:

> **"이 숫자 왜 여기 있어?"라고 물었을 때 답이 길어지면 상수로 빼라.**

### 실무에서 자주 놓치는 곳

이 안티패턴은 너무 익숙해져서 알아채지 못하는 경우가 많다. 다음 패턴들이 코드베이스에 있다면 의심해볼 가치가 있다.

- HTTP 상태 코드를 `=== 200`, `=== 401`로 직접 비교하는 곳
- 시간 계산에서 `1000 * 60 * 60 * 24` 같은 표현
- DB enum 컬럼을 문자열로 직접 비교 (`status === "pending"`)
- 권한 체크 (`role === "admin"`)
- 페이지네이션 기본값 (`limit ?? 20`, `page ?? 1`)
- OAuth scope 문자열, 토큰 만료 시간(초 단위 숫자)

### 요약

| 항목 | 내용 |
|------|------|
| 증상 | 의미를 알 수 없는 숫자/문자열이 코드에 박혀 있음 |
| 원인 | 작성 시점의 맥락이 코드에 표현되지 않음 |
| 해법 | 도메인 의미를 가진 리터럴을 명명된 상수로 추출 |
| 함정 | 모든 리터럴을 빼지 말 것 — 관용구는 그대로 두기 |
| 판단 기준 | 도메인 의미 / 중복 등장 / 변경 가능성 |
| TS 보너스 | `as const` + `keyof typeof`로 타입 안정성까지 확보 |

---

## 2. God Object

### 정의

**하나의 객체(클래스, 모듈, 함수)가 너무 많은 책임을 지고 있는 상태**를 말한다. 시스템의 거의 모든 일을 그 객체 하나가 알고, 결정하고, 실행한다. 이름도 종종 `Manager`, `Helper`, `Util`, `Service`, `Handler` 같이 모호하게 끝난다.

### 냄새나는 코드

```typescript
// userService.ts
export class UserService {
  async signUp(email: string, password: string) { /* ... */ }
  async signIn(email: string, password: string) { /* ... */ }
  async signInWithGoogle(code: string) { /* ... */ }
  async refreshAccessToken(token: string) { /* ... */ }
  async verifyJWT(token: string) { /* ... */ }

  async sendWelcomeEmail(userId: string) { /* ... */ }
  async sendPasswordResetEmail(email: string) { /* ... */ }
  async sendVerificationCode(phone: string) { /* ... */ }

  async hashPassword(plain: string) { /* ... */ }
  async comparePassword(plain: string, hash: string) { /* ... */ }

  async getUserProfile(userId: string) { /* ... */ }
  async updateUserProfile(userId: string, data: any) { /* ... */ }
  async uploadAvatar(userId: string, file: Buffer) { /* ... */ }
  async resizeAvatar(file: Buffer) { /* ... */ }

  async logUserActivity(userId: string, action: string) { /* ... */ }
  async detectFraudulentLogin(userId: string, ip: string) { /* ... */ }

  async exportUserDataAsCSV(userId: string) { /* ... */ }
  async deleteUserAccount(userId: string) { /* ... */ }
  // ... 30개 더
}
```

`UserService` 같은 이름은 처음에는 작게 시작했다가, 사용자와 관련된 모든 것이 흘러들어와서 1000줄, 2000줄로 자라난다.

### 왜 안티패턴인가

네 가지가 동시에 무너진다.

**1. 변경 이유가 너무 많다.** 이메일 템플릿이 바뀌어도, 비밀번호 해싱 알고리즘이 바뀌어도, 아바타 리사이즈 라이브러리가 바뀌어도 모두 이 파일을 건드린다. "하나의 이유로 변경되어야 한다"는 단일 책임 원칙(SRP)이 박살난다.

**2. 테스트가 지옥이 된다.** `signUp` 하나를 테스트하려고 이메일 발송, 해싱, DB, 외부 API를 전부 mock해야 한다. 테스트 셋업이 본 로직보다 길어진다.

**3. 재사용 불가능.** `sendWelcomeEmail`만 쓰고 싶은데 `UserService` 전체를 import하고 인스턴스화해야 한다. 의존성이 줄줄이 딸려온다.

**4. 머지 컨플릭트의 자석.** 팀원 셋이 각자 다른 기능을 작업해도 모두 이 파일을 건드리니 매번 충돌이 난다.

### "큰 클래스"와 "God Object"의 차이

여기서 헷갈리지 말아야 한다. **단순히 길다고 God Object가 아니다.** 진짜 신호는 다음과 같다.

**1. 응집도가 낮다.** 안의 메서드들이 서로 별 관계 없이 "사용자"라는 키워드 하나로 묶여 있다. `hashPassword`와 `resizeAvatar`는 같은 객체에 있을 이유가 없다.

**2. 책임의 층위가 섞여 있다.** 비즈니스 로직(`signUp`), 인프라(`sendEmail`), 유틸리티(`hashPassword`)가 한 클래스에 다 있다.

**3. 이름이 모든 것을 받아낼 수 있다.** `UserService`는 사용자 관련 어떤 메서드든 정당화할 수 있다. 이게 함정이다.

### 리팩토링

책임의 축으로 쪼갠다.

```typescript
// 인증 도메인
class AuthService {
  signUp / signIn / signInWithGoogle
}
class TokenService {
  issue / refresh / verify
}
class PasswordHasher {
  hash / compare
}

// 알림 도메인 (인프라)
class EmailNotifier {
  sendWelcome / sendPasswordReset
}
class SmsNotifier {
  sendVerificationCode
}

// 프로필 도메인
class ProfileService {
  get / update
}
class AvatarService {
  upload / resize
}

// 횡단 관심사
class ActivityLogger { ... }
class FraudDetector { ... }
```

핵심은 <strong>"이 클래스가 변경되어야 하는 이유는 단 하나"</strong>가 되도록 자르는 것이다. `EmailNotifier`는 이메일 전송 방식이 바뀔 때만 변경되고, `PasswordHasher`는 해싱 정책이 바뀔 때만 변경된다.

### 잘게 쪼개면 파일이 너무 많아지지 않을까

이 질문은 정당하다. 그리고 잘게 쪼개는 데 드는 비용은 "파일 개수"가 아니라 다른 것에 있다.

**비용 1: 인지적 점프.** `signUp()` 하나의 흐름을 이해하려고 5개 파일을 열어야 하는 상황이 생긴다. 각 파일은 짧지만, 흐름의 전체 그림은 어디에도 없다. 코드의 흐름이 파일 사이에 흩어져 있는 상태를 *Lasagna Code*라고 부른다.

**비용 2: 잘못된 경계로 자르면 더 나빠진다.** 만약 `PasswordHasher`와 `AuthService`가 항상 같이 변경된다면, 두 개로 나눈 것이 오히려 손해다. **변경의 이유가 같으면 한 곳에 있는 것이 맞다.** SOLID의 SRP가 말하는 "단일 책임"의 본뜻이 이것이다. "메서드 하나당 클래스 하나"가 아니라 "변경 이유 하나당 클래스 하나"다.

### 그래서 판단 기준

쪼갤지 말지의 진짜 기준은 두 가지다.

**1. 변경의 빈도와 이유가 다른가.** 다르면 쪼갠다. 이메일 템플릿은 마케팅이 자주 바꾸지만 비밀번호 해싱은 보안팀이 몇 년에 한 번 바꾼다. 변경 주체와 주기가 다르면 분리한다.

**2. 혼자 의미 있게 사용될 수 있는가.** `PasswordHasher`는 회원가입 외에도 비밀번호 변경, 관리자 비밀번호 리셋 등에서 재사용된다. 그러면 분리할 가치가 있다. 반면 `WelcomeEmailFormatter`처럼 한 곳에서만 쓰는 것이라면, 분리하면 점프 비용만 늘어난다.

요약하면: **쪼개는 것은 좋지만, 같이 변하는 것까지 쪼개면 그것은 SOLID가 아니라 과잉 분해다.**

### 처음부터 신은 없었다

God Object는 거의 항상 다음과 같은 경로로 자란다.

1. `UserService.signUp()` 하나로 시작 (멀쩡함)
2. "회원가입 시 환영 메일 보내야 함" → `sendWelcomeEmail`을 같은 클래스에 추가 (편의상 합리적)
3. "비밀번호도 여기서 해싱하자" → `hashPassword` 추가 (편의상)
4. 6개월 뒤, 30개 메서드의 괴물

각 단계가 **혼자 보면 다 합리적**이라는 점이 무섭다. 그래서 God Object는 코드 리뷰에서 잡기가 어렵다. PR 하나만 보면 "메서드 하나 추가했네" 정도다.

이를 막는 실무적 신호는 두 가지다.

- **파일이 300~500줄을 넘기 시작하면** 분리를 진지하게 고민한다.
- **메서드를 추가하기 전에 "이게 정말 이 클래스의 책임인가?"를 한 번 묻는다.** 답이 "음… 일단 여기 두자"이면 거의 항상 다른 곳에 두는 것이 맞다.

### 요약

| 항목 | 내용 |
|------|------|
| 증상 | 한 클래스/모듈이 시스템의 너무 많은 일을 처리 |
| 진짜 신호 | 길이가 아니라 응집도 부족 + 책임 층위 혼재 + 모호한 이름 |
| 원인 | "편의상 여기 두자"의 누적 |
| 해법 | 변경의 축을 따라 분리 |
| 함정 | 과잉 분해 → Lasagna Code |
| 판단 기준 | 변경 이유가 같은가 / 독립적으로 재사용되는가 |
| 예방 | 파일 길이 모니터링 + 메서드 추가 시 책임 의식 |

---

## 3. Long Method

### 정의

**하나의 함수가 너무 많은 일을, 너무 많은 추상화 수준에서 처리하는 상태**를 말한다. 단순히 "줄 수가 많다"는 것이 아니다. 핵심은 **추상화 수준이 섞여 있다**는 점이다.

### 냄새나는 코드

```typescript
async function checkout(userId: string, cartId: string) {
  // 1. 카트 조회
  const cart = await db.query.carts.findFirst({
    where: eq(carts.id, cartId),
    with: { items: { with: { product: true } } },
  });
  if (!cart) throw new Error("Cart not found");
  if (cart.userId !== userId) throw new Error("Forbidden");

  // 2. 재고 확인
  for (const item of cart.items) {
    if (item.product.stock < item.quantity) {
      throw new Error(`Out of stock: ${item.product.name}`);
    }
  }

  // 3. 가격 계산
  let subtotal = 0;
  for (const item of cart.items) {
    subtotal += item.product.price * item.quantity;
  }
  let discount = 0;
  if (subtotal > 100000) discount = subtotal * 0.1;
  else if (subtotal > 50000) discount = subtotal * 0.05;
  const shipping = subtotal > 30000 ? 0 : 3000;
  const total = subtotal - discount + shipping;

  // 4. 결제
  const paymentResult = await fetch("https://pg.example.com/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, amount: total }),
  });
  if (!paymentResult.ok) throw new Error("Payment failed");
  const payment = await paymentResult.json();

  // 5. 주문 생성
  const order = await db.insert(orders).values({
    userId, cartId, subtotal, discount, shipping, total,
    paymentId: payment.id, status: "paid",
  }).returning();

  // 6. 재고 차감
  for (const item of cart.items) {
    await db.update(products)
      .set({ stock: sql`stock - ${item.quantity}` })
      .where(eq(products.id, item.productId));
  }

  // 7. 카트 비우기
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));

  // 8. 이메일
  await fetch("https://email.example.com/send", { /* ... */ });

  return order[0];
}
```

이 함수는 80줄짜리다. 흐름을 이해하려면 머리를 8번 다른 모드로 전환해야 한다. DB 쿼리 모드 → 비즈니스 룰 모드 → HTTP 호출 모드 → DB 쓰기 모드 → 또 HTTP 모드.

### 진짜 문제는 길이가 아니다

Long Method를 "100줄 넘으면 안티패턴"으로 외우면 안 된다. 진짜 신호는 세 가지다.

**신호 1: 주석으로 단락이 나뉜다.** 위 코드의 `// 1. 카트 조회`, `// 2. 재고 확인` 같은 주석들. 이 주석들은 **"여기가 함수가 되었어야 했다"는 화석**이다. 작성자도 무의식중에 "여기서 의미가 끊긴다"는 것을 알고 주석으로 표시한 것이다. 주석 대신 함수명으로 바꿨어야 한다.

**신호 2: 추상화 수준이 섞여 있다.** 같은 함수 안에 다음이 공존한다.

- `cart.userId !== userId` (저수준: 객체 속성 비교)
- `await fetch("https://pg.example.com/charge", ...)` (저수준: HTTP 디테일)
- `subtotal > 100000 ? 0.1 : 0.05` (중간: 비즈니스 규칙)
- "결제하고 주문 만들고 재고 차감한다" (고수준: 비즈니스 워크플로)

이 코드를 읽는 사람은 "이 함수가 *무엇을* 하는가"를 보려고 들어왔는데, *어떻게* 하는지의 디테일이 같은 평면에 펼쳐져 있다. 마치 책의 목차와 본문이 한 페이지에 섞여 있는 느낌이다.

**신호 3: 한 번에 머리에 안 들어온다.** 화면에서 스크롤해야 끝이 보이거나, "이 변수 어디서 선언했더라"를 다시 위로 올라가서 찾아야 하면 이미 길다.

### 리팩토링: Extract Method + SLAP

핵심 원칙은 **하나의 함수는 하나의 추상화 수준에서만 말한다**이다. 이를 *Single Level of Abstraction Principle (SLAP)*라고 부른다.

```typescript
async function checkout(userId: string, cartId: string) {
  const cart = await loadOwnedCart(userId, cartId);
  assertAllItemsInStock(cart);

  const pricing = calculatePricing(cart);
  const payment = await chargePayment(userId, pricing.total);

  const order = await createOrder({ cart, pricing, payment });
  await decrementStock(cart);
  await emptyCart(cartId);
  await sendOrderConfirmation(userId, order);

  return order;
}
```

**8번의 모드 전환이 사라졌다.** 모든 줄이 같은 추상화 수준 — "주문 처리 워크플로의 한 단계"다. 코드가 마치 명세서를 읽는 것처럼 읽힌다. 이것이 SLAP의 효과다.

각 헬퍼는 자기 추상화 수준 안에서 산다.

```typescript
function calculatePricing(cart: CartWithItems) {
  const subtotal = sumLineItems(cart.items);
  const discount = computeDiscount(subtotal);
  const shipping = computeShipping(subtotal);
  return {
    subtotal,
    discount,
    shipping,
    total: subtotal - discount + shipping,
  };
}

function computeDiscount(subtotal: number): number {
  if (subtotal > LARGE_ORDER_THRESHOLD) {
    return subtotal * LARGE_ORDER_DISCOUNT_RATE;
  }
  if (subtotal > MEDIUM_ORDER_THRESHOLD) {
    return subtotal * MEDIUM_ORDER_DISCOUNT_RATE;
  }
  return 0;
}
```

`calculatePricing`은 "가격 계산이라는 하나의 일"만 하고, 그 안에서 또 같은 수준의 단계로 쪼개져 있다. 함수가 트리 구조로 자연스럽게 자라난다.

### SRP의 진짜 의미

Long Method는 SRP(단일 책임 원칙) 위반의 표면적 증상이다. SRP는 흔히 "한 함수는 한 가지만 해라"로 외우지만, Robert Martin이 다시 정의한 원문은 다음과 같다.

> **"하나의 모듈은 단 하나의 액터(actor)에 대해서만 책임을 진다."**

즉, "한 가지 일"이 아니라 <strong>"한 가지 변경 이유"</strong>다. 누가 이 코드를 바꾸자고 요구할 수 있는가? 그 요구의 출처가 하나여야 한다.

위 `checkout` 함수를 이 렌즈로 다시 보면:

- **가격 계산 로직** → 마케팅팀이 할인율 변경 요청
- **결제 호출** → 인프라/결제팀이 PG사 변경 요청
- **재고 차감** → 물류팀이 재고 정책 변경 요청
- **이메일 발송** → CS팀이 템플릿 변경 요청

**4명의 다른 액터가 한 함수를 건드리려고 들어온다.** 이것이 SRP 위반의 진짜 모습이다. "함수가 길다"는 표면적 증상이고, "변경 요구의 출처가 여러 개로 섞여 있다"가 본질이다.

Long Method 정리가 God Object 정리로 이어지는 이유가 여기에 있다. **두 안티패턴은 같은 병의 다른 증상이다.** 변경의 축을 따라 함수를 자르고, 그 함수들이 같은 축을 따라 모이면 자연스럽게 클래스/모듈이 된다.

### 함수는 짧을수록 좋은가

**"한 함수 5줄 룰" 같은 것을 무작정 따르면 *Lasagna Code*에 빠진다.** 함수가 너무 잘게 쪼개지면 흐름을 따라가려고 정의로 점프, 또 점프, 또 점프해야 한다.

실용적인 기준은 다음 셋이다.

1. 한 함수가 한 가지 일만 하고
2. 그 일이 함수명으로 정확히 표현되고
3. 추상화 수준이 안에서 일관되면

길이는 그 결과로 정해지는 것이지, 목표가 아니다. 보통 5~30줄에 자연스럽게 수렴한다.

### 함수를 쪼갤 때의 함정 — 트랜잭션 경계

Long Method를 함수로 추출할 때 가장 흔한 실수는 **각 헬퍼가 자기 트랜잭션을 알아서 시작하는 것**이다.

```typescript
// 안티패턴
async function createOrder(...) {
  return await db.transaction(async (tx) => { ... });
}
async function decrementStock(...) {
  return await db.transaction(async (tx) => { ... });  // 별도 트랜잭션!
}
```

이렇게 하면 결제는 됐는데 재고 차감에서 에러가 나면 **결제도 성공, 주문도 성공, 재고만 어긋남.** 데이터 정합성 박살이다. 트랜잭션 경계가 비즈니스 워크플로의 경계와 어긋나서 생긴 일이다.

올바른 접근은 두 단계다.

**1. 트랜잭션 경계는 "오케스트레이터"가 결정한다.** 함수를 쪼개되, 트랜잭션을 시작/커밋하는 책임은 가장 위의 워크플로 함수가 가진다. 헬퍼들은 트랜잭션 객체를 인자로 받기만 한다.

```typescript
async function checkout(userId: string, cartId: string) {
  const cart = await loadOwnedCart(userId, cartId);
  assertAllItemsInStock(cart);
  const pricing = calculatePricing(cart);

  // 외부 결제는 트랜잭션 밖 (DB 트랜잭션이 외부 시스템을 잡지 못하므로)
  const payment = await chargePayment(userId, pricing.total);

  try {
    // DB에 영향을 주는 작업만 한 트랜잭션에 묶음
    const order = await db.transaction(async (tx) => {
      const order = await createOrder(tx, { cart, pricing, payment });
      await decrementStock(tx, cart);
      await emptyCart(tx, cartId);
      return order;
    });

    // 부수효과는 트랜잭션 밖. 실패해도 주문은 유지.
    await sendOrderConfirmation(userId, order);
    return order;
  } catch (err) {
    await refundPayment(payment.id);  // 보상 트랜잭션
    throw err;
  }
}
```

**2. 시스템 경계마다 다른 일관성 모델을 인정한다.** DB 안에서는 ACID 트랜잭션으로 묶을 수 있다. 하지만 DB 바깥(PG사 결제, 이메일, 외부 재고 시스템)은 ACID로 묶을 수 없다. 거기는 *Saga 패턴*, *보상 트랜잭션*, *Outbox 패턴* 같은 분산 일관성 도구가 필요하다. 위 코드의 `refundPayment`가 가장 단순한 형태의 보상 트랜잭션이다.

이 구분 — DB 안 vs DB 밖 — 이 잡히지 않으면 함수를 아무리 잘 쪼개도 결과적으로 데이터가 어긋난다.

정리하면:

- 트랜잭션을 함수 안에 숨기지 마라. 트랜잭션 객체를 인자로 받게 해서 경계를 호출자에게 명시적으로 드러낸다.
- 헬퍼는 "이 일을 한다"만 알고, <strong>"언제 커밋되는지는 모른다"</strong>가 올바른 상태다.
- 외부 시스템과의 일관성은 트랜잭션이 아니라 워크플로 패턴(보상, Saga, Outbox)으로 푼다.

### 실무 신호

- **새 기능을 추가할 때 "기존 함수 안 어딘가에 if문을 끼워 넣어야 한다"는 느낌이 들면**, 그 함수는 이미 길거나 곧 길어진다. 그 if는 새 함수의 씨앗이다.
- **함수를 설명할 때 "그리고", "그다음에"가 두 번 이상 나오면** 그건 함수 두 개 이상이다.

### 요약

| 항목 | 내용 |
|------|------|
| 증상 | 함수가 길고, 주석으로 단락이 나뉘고, 추상화 수준이 섞임 |
| 본질 | SRP 위반 — 변경의 축이 여러 개 섞여 있음 |
| 해법 | Extract Method + SLAP |
| 함정 1 | 너무 잘게 쪼개면 Lasagna Code |
| 함정 2 | 트랜잭션 경계를 헬퍼 안에 숨기면 데이터 정합성 붕괴 |
| 올바른 트랜잭션 처리 | 오케스트레이터가 경계를 결정, 헬퍼는 tx를 인자로 받음 |
| 실무 신호 | "if를 끼워 넣어야 한다" / 설명할 때 "그리고"가 두 번 이상 |

---

## 4. Feature Envy

### 정의

**한 클래스의 메서드가 자기 클래스의 데이터보다 다른 클래스의 데이터를 더 많이 만지는 상태.** 이름 그대로 "남의 기능을 부러워하는" 메서드다. 이 메서드는 사실 *다른 클래스에 있어야 했던* 것이다.

앞의 세 안티패턴이 "한 곳에 너무 많은 것이 쌓인" 문제였다면, Feature Envy는 **"엉뚱한 곳에 가 있는" 문제**다. 양이 아니라 위치의 문제.

### 냄새나는 코드

```typescript
class Order {
  constructor(
    public items: OrderItem[],
    public customer: Customer,
  ) {}
}

class Customer {
  constructor(
    public membershipLevel: "bronze" | "silver" | "gold",
    public lifetimePurchaseAmount: number,
    public country: string,
    public birthYear: number,
  ) {}
}

class OrderPriceCalculator {
  calculateDiscount(order: Order): number {
    const customer = order.customer;

    // 멤버십 등급별 할인
    let baseDiscount = 0;
    if (customer.membershipLevel === "gold") baseDiscount = 0.15;
    else if (customer.membershipLevel === "silver") baseDiscount = 0.10;
    else if (customer.membershipLevel === "bronze") baseDiscount = 0.05;

    // 누적 구매액에 따른 추가 할인
    let loyaltyBonus = 0;
    if (customer.lifetimePurchaseAmount > 1_000_000) loyaltyBonus = 0.05;
    else if (customer.lifetimePurchaseAmount > 500_000) loyaltyBonus = 0.03;

    // 시니어 추가 할인
    const currentYear = new Date().getFullYear();
    const age = currentYear - customer.birthYear;
    let ageBonus = 0;
    if (age >= 60) ageBonus = 0.05;

    return baseDiscount + loyaltyBonus + ageBonus;
  }
}
```

이 메서드가 `OrderPriceCalculator`에 있지만, 자세히 보면 **`order` 자체는 거의 안 만진다.** 읽는 건 전부 `customer`의 데이터다. `customer.membershipLevel`, `customer.lifetimePurchaseAmount`, `customer.birthYear`. 이 메서드는 사실상 **고객 정보를 분석하는 메서드**다.

### 왜 안티패턴인가

세 가지 문제가 있다.

**1. 캡슐화 위반.** `Customer`의 내부 데이터(`membershipLevel`, `birthYear`)를 외부에서 직접 들여다보고 판단한다. `Customer`가 그 필드들을 protected로 만들거나 이름을 바꾸면 외부 코드가 모두 깨진다. 한 클래스의 변경이 엉뚱한 클래스를 깨는 *Shotgun Surgery*의 씨앗이 된다.

**2. 응집도 분산.** "고객의 할인 자격을 판단하는 로직"이 `Customer` 밖에 흩어져 있다. 다른 곳에서 같은 판단이 필요하면 또 같은 패턴이 반복된다. `OrderPriceCalculator` 외에도 `Coupon`, `Newsletter`, `Promotion` 등이 모두 `customer.membershipLevel`을 들여다본다.

**3. "Tell, Don't Ask" 원칙 위반.** 객체에게 *데이터를 묻고 외부에서 판단*하는 것이 아니라, **객체에게 *시키는 것*이 객체지향의 본래 정신**이다. 위 코드는 `Customer`에게 데이터를 묻고 `OrderPriceCalculator`가 판단하고 있다. 반대여야 한다.

### 리팩토링: Move Method

판단 로직을 데이터의 주인에게 옮긴다.

```typescript
class Customer {
  constructor(
    private membershipLevel: "bronze" | "silver" | "gold",
    private lifetimePurchaseAmount: number,
    private country: string,
    private birthYear: number,
  ) {}

  calculateDiscountRate(): number {
    return (
      this.membershipDiscount() +
      this.loyaltyBonus() +
      this.seniorBonus()
    );
  }

  private membershipDiscount(): number {
    const RATES = { gold: 0.15, silver: 0.10, bronze: 0.05 };
    return RATES[this.membershipLevel];
  }

  private loyaltyBonus(): number {
    if (this.lifetimePurchaseAmount > 1_000_000) return 0.05;
    if (this.lifetimePurchaseAmount > 500_000) return 0.03;
    return 0;
  }

  private seniorBonus(): number {
    const age = new Date().getFullYear() - this.birthYear;
    return age >= 60 ? 0.05 : 0;
  }
}

class OrderPriceCalculator {
  calculateDiscount(order: Order): number {
    return order.customer.calculateDiscountRate();
  }
}
```

세 가지가 동시에 좋아진다.

- `Customer`의 필드를 `private`으로 닫을 수 있다 (캡슐화 회복).
- 할인율 판단이 한곳에 모인다 (응집도 회복).
- `OrderPriceCalculator`는 "묻기"가 아니라 "시키기"를 한다 (Tell, Don't Ask).

### 식별 방법 — 점(.)을 세어라

Feature Envy를 빠르게 식별하는 휴리스틱이 있다. **메서드 안에서 `someOtherObject.x`, `someOtherObject.y` 같은 외부 객체 접근이 자기 객체 접근(`this.x`)보다 많으면** 의심하라. 위 원본 코드에서 `customer.~~~` 접근이 4번이고 `this.~~~` 접근은 0번이었다. 명백한 신호다.

또 다른 신호는 **연쇄 점 접근**이다. `order.customer.address.city.zipCode` 같은 형태. 이건 *Law of Demeter* 위반이고, Feature Envy의 친척이다. 객체가 자기 친구하고만 대화해야지, 친구의 친구의 친구하고 대화하면 안 된다.

### 함정 1 — 데이터 객체는 예외다

모든 Feature Envy를 옮기면 안 된다. 다음 두 경우는 옮기지 마라.

**1. 데이터 객체(DTO/Value Object)는 Feature Envy의 대상이 정상이다.** API 응답으로 받은 raw 데이터, 폼 입력 객체 같은 것은 메서드를 갖지 않는 것이 맞다. 그런 객체에 메서드를 붙이려고 클래스를 만드는 건 오히려 *Anemic Domain Model*의 반대 방향 과잉이다.

**2. 옮기면 의존성 방향이 거꾸로 되는 경우.** 만약 `Customer`에 `calculateDiscountRate()`를 넣었더니 `Customer`가 `Order`나 `Pricing` 모듈을 import하게 된다면, **저수준 도메인 객체가 고수준 정책을 알게 되는 것**이다. 이건 의존성 방향을 거꾸로 만든다. 이 경우는 `Order` 쪽에 두거나, 별도의 `DiscountPolicy` 같은 것을 만드는 것이 맞다.

기본 규칙: **Feature Envy는 "데이터의 주인 쪽으로 옮긴다"가 기본**이지만, 옮겼을 때 의존성이 거꾸로 되면 멈춰라.

### 함정 2 — 그럼 Customer도 God Object가 되지 않나

Feature Envy를 풀 때 마주치는 두 번째 딜레마다. `Customer`에 `calculateDiscountRate()`를 넣었으니, 앞으로 `canPlaceOrder()`, `isEligibleForCoupon()`, `shouldReceiveNewsletter()`, `getShippingPriority()`도 다 여기 넣게 된다. 결국 `Customer`가 30개 메서드의 신이 된다.

이 딜레마를 푸는 열쇠는 **"판단"과 "정책"을 구분하는 것**이다.

- **판단(자기 상태에 대한 사실 확인)** — `Customer`가 알아야 한다. `isAdult()`, `hasVerifiedEmail()`, `yearsSinceRegistration()`.
- **정책(비즈니스 규칙의 적용)** — 별도 객체로 분리한다. `DiscountPolicy`, `CouponEligibilityPolicy`, `NewsletterTargetingRule`.

이 렌즈로 다시 보면 `calculateDiscountRate`는 사실 **정책**이지 순수한 판단이 아니다. 할인율 자체는 마케팅 정책의 일부이므로, `Customer`가 그것을 직접 계산하는 것은 여전히 어색하다. 더 정확한 리팩토링은 다음과 같다.

```typescript
class Customer {
  // 자기 상태에 대한 판단만
  constructor(
    private membershipLevel: MembershipLevel,
    private lifetimePurchaseAmount: number,
    private birthYear: number,
  ) {}

  getMembershipLevel(): MembershipLevel {
    return this.membershipLevel;
  }

  getLifetimePurchaseAmount(): number {
    return this.lifetimePurchaseAmount;
  }

  getAge(): number {
    return new Date().getFullYear() - this.birthYear;
  }
}

// 정책은 별도 객체
class DiscountPolicy {
  calculateFor(customer: Customer): number {
    return (
      this.membershipDiscount(customer.getMembershipLevel()) +
      this.loyaltyBonus(customer.getLifetimePurchaseAmount()) +
      this.seniorBonus(customer.getAge())
    );
  }

  private membershipDiscount(level: MembershipLevel): number {
    const RATES = { gold: 0.15, silver: 0.10, bronze: 0.05 };
    return RATES[level];
  }

  private loyaltyBonus(amount: number): number {
    if (amount > 1_000_000) return 0.05;
    if (amount > 500_000) return 0.03;
    return 0;
  }

  private seniorBonus(age: number): number {
    return age >= 60 ? 0.05 : 0;
  }
}
```

이렇게 하면 두 안티패턴을 동시에 피한다.

- **Feature Envy 해소** — `OrderPriceCalculator`가 `customer.membershipLevel`을 직접 뒤지지 않는다. `customer.getAge()`, `customer.getMembershipLevel()` 같은 자기 상태 응답만 요청한다.
- **God Object 회피** — `Customer`는 자기 정보를 노출하는 데만 집중하고, 정책은 정책 객체가 담당한다. 새 정책이 생겨도 `Customer`가 부풀지 않는다.

여기서 미묘한 균형이 있다. 첫 번째 리팩토링(`Customer.calculateDiscountRate`)이 나쁜 것은 아니다. **정책이 하나뿐이고 변경 빈도가 낮다면** 그대로 두는 것이 오히려 단순하다. 하지만 **정책이 여러 개로 늘어나기 시작하면** 정책 객체로 분리하는 것이 맞다. 판단 기준은 God Object와 똑같다: **변경의 축이 나뉘는가.**

이것이 나중에 배울 **Strategy 패턴**의 씨앗이다. Feature Envy → Move Method → 정책 분리 → Strategy로 자연스럽게 이어진다.

### 한 줄 요약

> **메서드의 점(.)이 자기 자신보다 다른 객체를 더 많이 가리키면, 그 메서드는 잘못된 곳에 살고 있다.**
> **단, 옮긴 곳이 신이 되지 않도록 판단과 정책을 구분하라.**

### 요약

| 항목 | 내용 |
|------|------|
| 증상 | 메서드가 자기 데이터보다 남의 데이터를 더 많이 만짐 |
| 원인 | 캡슐화 부족, Ask 지향 사고 |
| 해법 | Move Method — 데이터의 주인에게 로직을 옮김 |
| 원칙 | Tell, Don't Ask / Law of Demeter |
| 함정 1 | DTO/Value Object에는 적용하지 말 것 |
| 함정 2 | 의존성 방향이 거꾸로 되면 정책 객체로 분리 |
| 함정 3 | 옮긴 곳이 신이 될 조짐이 보이면 정책 객체로 분리 |
| 판단 기준 | 판단(자기 상태)은 데이터 주인에게, 정책(비즈니스 규칙)은 별도 객체에 |

---

## 5. Shotgun Surgery

### 정의

**하나의 논리적 변경을 위해 여러 클래스/파일/모듈에 각각 작은 수정을 가해야 하는 상태.** "산탄총 수술"이라는 이름 그대로, 한 발을 쏘려고 여러 곳에 상처가 남는 모양이다.

Feature Envy와 짝을 이루는 안티패턴이다. 두 개는 응집도의 반대 극단이다.

- **Feature Envy** — 로직이 잘못된 곳에 뭉쳐 있음 → 올바른 곳으로 이동
- **Shotgun Surgery** — 로직이 여러 곳에 흩어져 있음 → 올바른 곳으로 응집

### 냄새나는 코드

역할(role) 개념이 여러 파일에 퍼져 있는 상황을 보자.

```typescript
// user.model.ts
type UserRole = string;  // "admin", "editor", "viewer"

// permission.middleware.ts
if (req.user.role === "admin") {
  next();
} else {
  res.status(403).send("Forbidden");
}

// admin-panel.tsx
{user.role === "admin" && <AdminButton />}
{user.role === "editor" && <EditorPanel />}

// audit-log.service.ts
const priority = log.userRole === "admin" ? "high" : "normal";

// email-templates.ts
if (recipient.role === "admin") template = "admin-welcome";
else if (recipient.role === "editor") template = "editor-welcome";

// notification.service.ts
const channels = user.role === "admin" ? ["email", "sms", "slack"] : ["email"];

// dashboard.tsx
const canEdit = user.role === "admin" || user.role === "editor";
```

이제 새 역할 `"super-admin"`을 추가한다고 하자. 이 20개(혹은 그 이상)의 파일을 모두 뒤져서 조건을 추가해야 한다. **하나라도 빠뜨리면 버그.** 그리고 그 하나를 빠뜨렸다는 사실을 발견하기까지 며칠, 몇 주가 걸릴 수 있다.

또 다른 흔한 예: 부가세율이 10%에서 8%로 바뀔 때, 프론트엔드 표시, 백엔드 계산, 리포트 export, 이메일 안내 문구, 계약서 PDF 생성기, 세금 신고 데이터 export가 모두 각자 `0.1`을 하드코딩하고 있으면? 하나라도 놓치면 금액이 안 맞는다.

### 왜 안티패턴인가

네 가지 문제가 겹친다.

**1. 변경 비용의 폭발.** 하나의 개념적 변경이 수십 개 파일 수정을 요구한다. 요구사항 변경 한 줄에 대응하는 코드 변경이 수백 줄이 된다.

**2. 누락 위험.** "이 개념을 표현하는 곳이 어디어디인지" 완전한 목록을 아무도 갖고 있지 않다. grep에 걸리지 않는 방식으로 표현된 곳(변수명이 다르거나, 값이 다른 이름으로 저장되거나)은 발견되지 않는다.

**3. 검색 의존.** 리팩토링과 변경이 "grep 해서 다 찾을 수 있다"는 가정에 서 있다. 이 가정은 코드베이스가 커질수록 무너진다.

**4. 팀 확산의 어려움.** 새 팀원이 "이 개념 하나를 바꾸려면 어디를 봐야 하나요?"라고 물으면 답이 길어진다. "여기, 여기, 여기, 그리고 여기서 우연히 관련되어 있고…"

### 리팩토링: 개념을 한 곳으로 응집

원칙은 단순하다. **함께 변하는 것은 함께 있어야 한다.** 이를 *Common Closure Principle (CCP)*라고 부른다.

역할 예시를 리팩토링하면:

```typescript
// roles.ts — 역할 개념을 표현하는 유일한 파일
export const ROLES = {
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const RolePolicy = {
  canAccessAdminPanel: (role: Role): boolean => role === ROLES.ADMIN,
  canEdit: (role: Role): boolean => role === ROLES.ADMIN || role === ROLES.EDITOR,
  getEmailTemplate: (role: Role): string => {
    const templates = {
      admin: "admin-welcome",
      editor: "editor-welcome",
      viewer: "viewer-welcome",
    };
    return templates[role];
  },
  getNotificationChannels: (role: Role): string[] => {
    return role === ROLES.ADMIN ? ["email", "sms", "slack"] : ["email"];
  },
  getAuditPriority: (role: Role): "high" | "normal" => {
    return role === ROLES.ADMIN ? "high" : "normal";
  },
};
```

이제 다른 파일들은 이렇게 바뀐다.

```typescript
// permission.middleware.ts
if (RolePolicy.canAccessAdminPanel(req.user.role)) next();

// admin-panel.tsx
{RolePolicy.canAccessAdminPanel(user.role) && <AdminButton />}

// audit-log.service.ts
const priority = RolePolicy.getAuditPriority(log.userRole);

// notification.service.ts
const channels = RolePolicy.getNotificationChannels(user.role);
```

이제 `"super-admin"` 역할을 추가할 때 **`roles.ts` 한 파일만 수정**하면 된다. 다른 파일들은 자동으로 새 역할을 반영한다. `RolePolicy` 안의 각 함수만 갱신하면 되는 것이다.

### 실무 신호

Shotgun Surgery는 다음과 같은 신호로 알아챈다.

**1. PR에 항상 같은 파일 세트가 함께 등장한다.** 세율을 바꾸는 PR도, 상품 카테고리를 바꾸는 PR도, 항상 같은 5~10개 파일이 함께 수정된다면 그 파일들은 하나의 개념을 나눠 갖고 있다.

**2. 같은 문자열/enum 값이 코드베이스 여러 곳에 중복된다.** `"admin"`이 30번 등장하는 것 자체는 문제가 아니지만, 그 30개가 서로 다른 판단을 내리는 근거로 쓰이고 있으면 문제다.

**3. "이거 하나 바꾸려면 X, Y, Z도 바꿔야 해요"라는 대화가 반복된다.** 팀 지식으로만 존재하는 변경 목록이 있다면, 그건 코드로 표현되어야 할 것이 팀원의 머릿속에 있는 것이다.

**4. 새 기능을 추가하는데 이미 존재하는 여러 파일을 동시에 열게 된다.** 새 기능이 여러 곳의 조건 분기에 자기를 추가하도록 요구한다면, 그 조건 분기들은 하나의 정책 객체로 통합될 필요가 있다.

### 함정 — 응집을 위한 응집

여기서도 균형 감각이 필요하다. 모든 것을 응집시키려 들면 **God Object로 바로 이어진다.**

`RolePolicy`에 계속 메서드를 추가하다 보면 `AdminPolicy`, `UserPolicy`, `SessionPolicy`, `AuditPolicy`가 다 한 파일에 들어가서 결국 신이 된다. Shotgun Surgery를 풀다가 God Object가 되는 것도 흔한 경로다.

균형점은 이렇게 잡는다.

**같은 이유로 변하는 것끼리 응집.** 역할 정의(`ROLES`)와 역할 기반 판단(`RolePolicy`)은 같은 이유(새 역할 추가, 역할 권한 변경)로 변하니 한 곳에 둔다. 하지만 감사 로그의 저장 방식이 바뀌는 것은 다른 이유이므로 `RolePolicy.getAuditPriority`가 저장 로직까지 알 필요는 없다. 반환값(우선순위)만 결정하고, 실제 저장은 감사 로그 모듈이 맡는다.

이 원칙을 한 줄로 압축하면: **변경 이유가 같으면 붙이고, 다르면 떼어놓아라.** God Object 편에서 봤던 SRP의 다른 표현이다.

### Feature Envy와의 관계 정리

두 안티패턴이 한 쌍이라는 것을 다시 짚자.

| Feature Envy | Shotgun Surgery |
|-------------|-----------------|
| 로직이 잘못된 곳에 뭉쳐 있음 | 로직이 여러 곳에 흩어져 있음 |
| Move Method로 옮김 | 한 개념으로 응집 |
| 캡슐화 위반이 원인 | 응집도 부족이 원인 |
| 남의 데이터를 만짐 | 같은 개념을 여러 곳이 표현 |

둘 다 **응집도** 문제이지만 방향이 반대다. Feature Envy는 "떨어져 있어야 할 것이 붙어 있음(잘못된 위치에)", Shotgun Surgery는 "붙어 있어야 할 것이 떨어져 있음". 리팩토링 방향도 반대다. 하나는 옮겨서 분리, 다른 하나는 모아서 통합.

### 한 줄 요약

> **하나의 변경이 여러 파일을 요구한다면, 그 개념은 한 곳에 모여있지 않은 것이다.**

### 요약

| 항목 | 내용 |
|------|------|
| 증상 | 하나의 개념 변경이 여러 파일 수정을 요구 |
| 원인 | 같은 개념이 여러 곳에 표현되어 있음 |
| 해법 | 개념을 한 파일/모듈에 응집 (Common Closure Principle) |
| Feature Envy와의 관계 | 응집도 문제의 반대 극단 |
| 함정 | 과도한 응집은 God Object로 이어짐 |
| 판단 기준 | "같은 이유로 함께 변하는가?" |
| 실무 신호 | PR에 같은 파일 세트 반복 등장 / 팀 지식으로만 존재하는 변경 목록 |

---

## 6. Primitive Obsession

### 정의

**도메인 개념을 원시 타입(string, number, boolean)으로만 표현하는 습관.** 사용자 ID도 string, 상품 ID도 string, 이메일도 string, 금액도 number, 좌표도 number. 도메인의 의미가 타입 시스템에 표현되지 않은 상태다.

한국어로는 "기본 타입 집착"으로 옮긴다. Refactoring 책에서 Fowler가 처음 정리한 코드 스멜 중 하나다.

### 냄새나는 코드

```typescript
function transferMoney(
  fromUserId: string,
  toUserId: string,
  amount: number,
  currency: string,
): void {
  // ...
}

// 호출부
transferMoney(
  product.id,        // productId를 userId 자리에 (컴파일 통과!)
  customer.email,    // email을 userId 자리에 (컴파일 통과!)
  -1000,             // 음수 금액 (컴파일 통과!)
  "KRW",             // 대문자? 소문자? 공백? 검증 없음
);
```

함수 시그니처만 봐서는 인자 순서를 틀렸는지, 금액이 유효한지, 통화 코드가 올바른지 알 수 없다. 컴파일러는 `string`이 `string`인지, `number`가 `number`인지만 확인한다. 도메인 규칙은 어디에도 표현되어 있지 않다.

또 하나의 흔한 증상은 **검증 로직의 산개**다.

```typescript
// signup.controller.ts
function signUp(email: string) {
  if (!email.includes("@")) throw new Error("Invalid email");
  // ...
}

// invite.controller.ts
function inviteUser(email: string) {
  if (!/\S+@\S+\.\S+/.test(email)) throw new Error("Invalid email");
  // 다른 정규식!
}

// admin/add-user.controller.ts
function addUser(email: string) {
  // 검증 없음! 그냥 저장!
}
```

같은 "유효한 이메일"이라는 도메인 개념이 세 곳에 각각 다른 방식으로(또는 아예 없이) 표현되어 있다. 이건 Shotgun Surgery의 씨앗이기도 하다.

그리고 통화가 다른 금액을 더하는 재앙도 흔하다.

```typescript
function totalPrice(a: number, b: number): number {
  return a + b;  // 이 함수는 KRW와 USD를 더한다
}
```

### 왜 안티패턴인가

네 가지 문제가 겹친다.

**1. 타입 시스템이 도움을 주지 않는다.** TypeScript를 쓰는 이유의 절반이 타입 안정성인데, 모든 것을 `string`으로 표현하면 그 이득이 사라진다. `userId: string`과 `productId: string`은 컴파일러에게 같은 타입이다.

**2. 도메인 규칙이 분산된다.** "유효한 이메일이란 무엇인가"의 정의가 코드 여러 곳에 각기 다르게 산다. 이메일 규칙을 바꾸려면 모든 곳을 찾아 고쳐야 한다 (Shotgun Surgery).

**3. 검증 누락 위험.** 함수가 `email: string`을 받으면, 그 이메일이 이미 검증되었는지 아닌지 알 수 없다. 방어적으로 매번 검증하거나, 검증되었다고 믿거나 둘 중 하나다.

**4. 리팩토링이 어렵다.** `userId`를 `string`에서 `UUID` 객체로 바꾸고 싶다고 하자. 코드베이스의 모든 `string` 타입을 뒤져서 어느 것이 userId인지 판별해야 한다.

### 리팩토링: Value Object 도입

원시 타입 대신 **자기 검증하는 값 객체**를 만든다.

```typescript
class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const normalized = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new Error(`Invalid email: ${raw}`);
    }
    return new Email(normalized);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}

class Money {
  constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {
    if (!Number.isFinite(amount)) throw new Error("Invalid amount");
    if (amount < 0) throw new Error("Money cannot be negative");
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} + ${other.currency}`);
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }
}
```

이제 함수 시그니처가 도메인을 표현한다.

```typescript
function transferMoney(from: UserId, to: UserId, amount: Money): void {
  // 인자 타입이 도메인 개념
}

// 이제 다음 호출은 모두 컴파일 에러
transferMoney(
  product.id,               // 타입 에러: ProductId ≠ UserId
  Email.create("a@b.com"),  // 타입 에러: Email ≠ UserId
  -1000,                    // 타입 에러: number ≠ Money
);
```

`Money` 객체는 생성 시점에 이미 "음수가 아님"이 보장된다. `Money.add`는 통화가 다르면 에러를 던진다. `Email.create`는 유효하지 않은 형식을 통과시키지 않는다.

**도메인 규칙이 타입에 붙어서 이동한다.** 이메일 검증 로직은 이제 `Email.create` 한 곳에만 있고, 어떤 함수든 `Email` 타입을 받으면 이미 검증된 값임을 신뢰할 수 있다.

### TypeScript 특화: Branded Types

Value Object를 클래스로 만드는 것이 부담스러울 때, TypeScript는 더 가벼운 도구를 제공한다.

```typescript
type UserId = string & { readonly __brand: "UserId" };
type ProductId = string & { readonly __brand: "ProductId" };

function createUserId(raw: string): UserId {
  if (!/^user_\w+$/.test(raw)) throw new Error("Invalid UserId format");
  return raw as UserId;
}

const userId: UserId = createUserId("user_123");
const productId: ProductId = "prod_456" as ProductId;

function getUser(id: UserId): User { /* ... */ }

getUser(userId);      // OK
getUser(productId);   // 타입 에러
getUser("just a string");  // 타입 에러
```

브랜드 타입은 **런타임에는 그냥 string**이지만, **컴파일 시점에는 다른 타입으로 취급된다**. 런타임 오버헤드가 없다.

트레이드오프:

| | 클래스 (Value Object) | Branded Type |
|---|---------------------|--------------|
| 런타임 검증 | 가능 | 생성 함수에서만 |
| 컴파일 타임 구분 | 가능 | 가능 |
| 오버헤드 | 인스턴스 생성 비용 | 없음 |
| 조작 로직 | 메서드로 자연스러움 | 외부 함수 |
| JSON 직렬화 | 커스텀 필요 | 그대로 가능 |

간단한 ID나 식별자에는 브랜드 타입이 자연스럽고, 검증이나 조작 로직이 있는 개념(Money, Email, DateRange)에는 클래스가 자연스럽다.

### 함정 — 모든 원시 타입을 감쌀 필요는 없다

이 안티패턴을 배운 직후 흔한 실수는 **모든 string과 number를 Value Object로 감싸는 것**이다. 이건 오버 엔지니어링이고, 코드 가독성을 오히려 해친다.

Value Object로 감쌀지 판단하는 기준 세 가지:

**1. 검증 규칙이 있는가.** Email, PhoneNumber, ZipCode처럼 형식이 정의된 값. `"userInput"` 같은 자유 문자열은 감싸지 않는다.

**2. 조작 로직이 있는가.** `Money.add`, `DateRange.overlaps`, `Duration.plus`처럼 그 타입에 특화된 연산이 있는 것. 단순 표시용 문자열은 감싸지 않는다.

**3. 다른 원시 타입과 혼동될 수 있는가.** `UserId`와 `ProductId`가 둘 다 string이지만 절대 섞이면 안 되는 경우. 로그의 라인 번호 같은 순수 카운터는 감싸지 않는다.

셋 중 하나라도 강하게 해당하면 감쌀 가치가 있다. 셋 다 해당 안 되면 그냥 원시 타입이 맞다.

또 하나의 함정은 **Value Object의 mutable 사용**이다. Value Object는 정의상 불변이어야 한다. `Money`에 `setAmount()`를 만들지 마라. 새 값이 필요하면 새 인스턴스를 만들어 반환해야 한다. 이걸 어기면 참조 공유로 인한 버그가 예상치 못한 곳에서 터진다.

### Anemic Domain Model 회피

Primitive Obsession의 반대 극단은 *Anemic Domain Model*이다. Value Object는 만들었는데 그 안에 로직이 없고, 로직은 여전히 밖의 서비스 클래스에 있는 경우다.

```typescript
// Anemic
class Money {
  constructor(public amount: number, public currency: string) {}
}

class MoneyService {
  add(a: Money, b: Money): Money {
    if (a.currency !== b.currency) throw new Error("mismatch");
    return new Money(a.amount + b.amount, a.currency);
  }
}
```

이 코드는 클래스만 있지 객체지향이 아니다. Value Object의 정신은 **관련 로직이 데이터와 함께 있는 것**이다. 검증, 조작, 비교 로직이 그 타입 안에 있어야 한다. Feature Envy에서 봤던 Tell, Don't Ask 원칙이 여기서도 적용된다.

### 한 줄 요약

> **도메인 개념은 도메인 타입으로 표현되어야 한다. 모든 것을 string으로 두면 컴파일러가 도와줄 수 없다.**

### 요약

| 항목 | 내용 |
|------|------|
| 증상 | 도메인 개념이 원시 타입(string, number)으로만 표현됨 |
| 원인 | 타입 시스템을 도메인 표현에 활용하지 않음 |
| 해법 | Value Object 또는 Branded Type |
| 부수효과 | 검증 로직이 한 곳에 집중, 함수 시그니처가 도메인 표현 |
| 함정 1 | 모든 원시 타입을 감쌀 필요 없음 (판단 기준 3가지) |
| 함정 2 | Value Object의 mutable 사용 금지 |
| 함정 3 | Anemic Domain Model — 로직 없는 껍데기 클래스 |
| 판단 기준 | 검증 규칙 있음 / 조작 로직 있음 / 다른 원시 타입과 혼동 위험 |

---

## 7. Cargo Cult Programming

### 정의

**어떤 관행이 왜 존재하는지 이해하지 못한 채, 그 형식만 따라하는 프로그래밍.**

이 안티패턴은 앞의 여섯 개와 결이 다르다. 그것들이 코드 자체에 대한 안티패턴이라면, 이것은 **사고방식과 프로세스에 대한 안티패턴**이다. 하지만 그 영향력은 가장 크다. 앞의 여섯은 코드의 지역 현상이지만, Cargo Cult는 팀 전체의 의사결정 문화를 오염시킨다.

### 이름의 유래

2차 대전 중 남태평양 원주민 부족들은 미군이 활주로를 만들고 화물기(cargo)를 착륙시켜 물자를 내리는 것을 봤다. 전쟁이 끝나고 미군이 떠난 뒤, 원주민들은 물자가 다시 오길 바라며 활주로 모양을 흉내냈다. 대나무로 관제탑을 만들고, 코코넛으로 헤드셋을 만들고, 하늘을 보며 신호를 보냈다.

형식은 따라했지만 그 뒤의 메커니즘 — 왜 활주로가 있고, 왜 관제탑이 있고, 왜 헤드셋을 쓰는지 — 은 이해하지 못한 것이다. 물자가 올 리 없었다.

물리학자 Richard Feynman이 이 이야기를 1974년 Caltech 졸업식 연설에서 인용하며 "Cargo Cult Science"라는 용어를 만들었고, 이후 프로그래밍 세계에도 적용되었다.

### 냄새나는 코드 예시

**1. 의미 없는 방어 코드**

```typescript
try {
  const result = await fetch("/api/users");
  return result.json();
} catch (e) {
  throw e;  // 그대로 다시 던짐 — try/catch가 아무 일도 안 함
}
```

"에러 처리는 좋은 것"이라는 관행만 흉내낸 상태. 이 try/catch는 스택 트레이스만 지저분하게 만들고 아무 값도 제공하지 않는다.

**2. 아무 데나 useCallback / useMemo**

```typescript
function Button({ label }: { label: string }) {
  const handleClick = useCallback(() => {
    console.log(label);
  }, [label]);
  return <button onClick={handleClick}>{label}</button>;
}
```

`Button`은 매우 가벼운 컴포넌트다. `useCallback`은 부모가 리렌더될 때 자식이 memo되어 있어야만 이득이 있는데, 여기서는 그 조건이 성립하지 않는다. 오히려 hook 오버헤드만 추가되고, 의존성 배열 관리 부담만 생긴다.

"React 최적화는 좋은 것"이라는 관행을 형식만 따라한 결과다.

**3. 이유 없는 상태관리 라이브러리 도입**

간단한 폼 상태를 위해 Redux를 도입하는 경우. 컴포넌트 지역 상태로 충분한 것을 전역 스토어에 얹으면, 보일러플레이트만 늘고 기능은 그대로다. Redux는 여러 컴포넌트가 같은 상태를 공유해야 하고 상태 변경이 복잡한 경우를 위한 도구다. 그 조건 없이 도입하면 그냥 부담이다.

**4. 이유 없는 마이크로서비스**

5명 팀에서 8개 마이크로서비스로 시작. "Netflix가 그렇게 한다", "확장성을 위해"만이 이유. 실제로는 조직 규모, 배포 파이프라인, 관찰가능성, 장애 전파 등의 조건이 갖춰지지 않아서 모놀리스보다 훨씬 느리게 개발된다.

**5. 방금 배운 패턴을 즉시 적용**

디자인 패턴 책을 읽자마자 코드베이스에 Strategy, Factory, Observer, Visitor를 우겨넣기 시작. **지금 이 시리즈를 읽자마자 "God Object 발견! 분해해야지"라고 회사 코드에 손대는 것도 여기에 해당한다.**

### 왜 이것이 가장 위험한가

세 가지 이유로 다른 안티패턴보다 심각하다.

**1. 자기 강화된다.** "베스트 프랙티스"라는 이름표가 붙는 순간 반론이 어려워진다. "왜 이렇게 짜죠?"에 "이게 표준이니까"라는 답이 나오면 대화가 끝난다. 근거 대신 권위가 자리를 잡는다.

**2. 팀 컨벤션을 오염시킨다.** 한 사람이 도입한 무의미한 패턴이 팀 표준이 되면, 이후 모든 코드가 그것을 따라간다. 새 팀원도 "여기 표준"으로 학습한다. 원본에서는 이유가 있었을 관행이, 카피된 코드베이스에서는 이유가 없다.

**3. 지우기 어렵다.** 코드가 없는 것보다 있는 것이 지우기 어렵다. "왜 이렇게 짜여있는지 모르지만 뺐다가 뭐 잘못될까 무섭다"가 축적된다. 언젠가 legacy가 되어 아무도 손대지 못한다.

### 리팩토링: 코드가 아니라 사고 과정을 바꾼다

Cargo Cult의 리팩토링은 코드 변경이 아니다. **도입 결정 앞에 놓는 세 가지 질문**이다. 새 라이브러리, 패턴, 컨벤션, 아키텍처를 도입할 때 3분 안에 다음 셋을 답할 수 있어야 한다.

**질문 1: 이게 없으면 어떤 구체적인 문제가 생기나?**

"성능이 나빠진다", "확장이 어렵다" 같은 추상적 답은 답이 아니다. "현재 초당 100 요청에서 응답이 800ms인데 이걸 도입하면 200ms로 떨어진다"처럼 구체적이어야 한다. 문제를 구체적으로 표현할 수 없다면 아직 도입할 때가 아니다.

**질문 2: 대안은 무엇이고 왜 이걸 골랐나?**

"이게 좋으니까"가 아니라 "A, B, C를 검토했고 이 조건에서 이게 맞다"여야 한다. 대안을 검토하지 않은 도입은 취향이지 결정이 아니다.

**질문 3: 어떤 조건이 바뀌면 이걸 걷어낼 것인가?**

이 질문은 겸손을 강제한다. "영원히 좋을 것"이라는 답은 없다. 팀 규모, 트래픽, 도메인 복잡도가 변하면 오늘의 좋은 결정이 내일의 부담이 될 수 있다. 그 조건을 미리 명시해두면 나중에 걷어낼 근거가 된다.

셋 다 답이 안 나오면 **도입을 미룬다.** 명확한 문제가 발생할 때까지 기다린다.

### 실무적 방어선

**1. Architectural Decision Record (ADR).** 새 라이브러리/패턴/컨벤션 도입 시, 위의 세 질문에 답하는 짧은 문서(1페이지)를 작성한다. 나중에 이 문서만 봐도 왜 이 결정이 이루어졌는지 알 수 있다. 조건이 변하면 걷어낼 근거도 된다.

**2. "왜?" 질문의 정상화.** 코드리뷰에서 "이거 왜 이렇게 했어요?"가 무례한 질문이 아니라 정상적인 질문이 되도록 문화를 만든다. 답이 없는 코드는 리뷰 통과하지 못하도록 한다.

**3. 파일럿부터.** 새 패턴을 팀 전체에 도입하기 전에 한 모듈에서 시도하고, 3개월 후 회고한다. "이 패턴이 실제로 도움이 되었나?"를 데이터로 확인한다.

**4. "학습 즉시 적용" 자제.** 새로운 개념을 배우고 나서 한 주 정도는 실무 코드에 적용하지 않는다. 배운 렌즈를 통해 코드를 새로 보되, 리팩토링을 감행하지는 않는다. 시간이 지나도 여전히 문제로 보이는 것만 손을 댄다.

### 이 시리즈 자체와의 관계

이 문서를 다 읽은 지금이 사실 **가장 위험한 순간**이다. 방금 배운 개념 하나하나를 "발견"하고 "해결"하고 싶어진다. 지금까지 잘 돌아가던 코드가 갑자기 다 스멜로 보인다.

이때 회사 코드에 무차별 리팩토링을 감행하는 것이 Cargo Cult다. 안티패턴을 배웠다는 사실이 리팩토링의 근거가 될 수는 없다. 근거는 **실제로 그 코드가 아팠던 이력**이다. 변경이 반복적으로 어려웠던 곳, 버그가 자주 났던 곳, 새 팀원이 이해하지 못했던 곳이 리팩토링 후보다.

건강한 사용법:

- **새 코드를 짤 때 렌즈로 활용.** 자기가 지금 만드는 코드가 God Object의 씨앗은 아닌지, Primitive Obsession으로 시작하고 있지는 않은지 점검한다.
- **이미 아파했던 코드부터 정리.** 변경할 때마다 손이 많이 갔던 곳, 이해가 오래 걸렸던 곳부터 조금씩 정리한다.
- **팀원과 공통 언어로 사용.** "이건 God Object라서 나누자"는 대화가 가능한 공통 어휘가 생긴다. 이게 이 시리즈의 진짜 가치다.
- **남의 코드를 판단하는 무기로는 사용하지 않기.** 특히 오래 유지되어 온 코드에 대해서. 그 코드는 지금까지 시스템을 굴렸다는 실증이 있다. 지식이 새로 생겼다고 그 실증을 무시하지 않는다.

### 한 줄 요약

> **이유를 설명할 수 없으면 도입하지 마라. 이유가 소멸했으면 걷어내라. 방금 배웠다는 사실은 도입의 이유가 아니다.**

### 요약

| 항목 | 내용 |
|------|------|
| 증상 | 이유 없이 형식만 따라하는 코드/설정/구조 |
| 원인 | "베스트 프랙티스"의 무비판 수용, 학습 즉시 적용 충동 |
| 해법 | 도입 결정 앞에 세 가지 질문 |
| 세 가지 질문 | ① 없으면 어떤 문제가 생기나 ② 대안 검토했나 ③ 어떤 조건에서 걷어낼 것인가 |
| 방어선 | ADR / "왜?" 질문 정상화 / 파일럿 / 학습 즉시 적용 자제 |
| 가장 큰 함정 | 이 시리즈 자체를 Cargo Cult로 적용하는 것 |
| 감각 | 남의 코드는 무기 아닌 렌즈로, 자기 코드는 아팠던 곳부터 |

---

## 일곱 가지를 관통하는 원리

여기까지 온 시점에서 일곱 안티패턴을 한 프레임으로 볼 수 있다.

| 안티패턴 | 잘못된 것 | 표면 증상 | 근본 원인 | 해법 |
|---------|----------|----------|----------|------|
| Magic Number | 리터럴에 이름이 없음 | 의미 불명 숫자 | 맥락 미표현 | 명명된 상수 |
| God Object | 클래스가 너무 많음 | 30개 메서드 | 변경 축 혼재 | 축 따라 분리 |
| Long Method | 함수가 너무 많음 | 80줄 | 변경 축 혼재 | Extract + SLAP |
| Feature Envy | 위치가 잘못됨 (뭉침) | 남의 데이터만 만짐 | Ask 지향 | Move Method |
| Shotgun Surgery | 위치가 잘못됨 (흩어짐) | 한 개념 여러 파일 | 응집 부족 | 개념 응집 |
| Primitive Obsession | 도메인 개념 부재 | 모든 게 string/number | 타입 활용 부족 | Value Object |
| Cargo Cult | 이유 없는 도입 | 형식만 따라함 | 이해 없이 흉내 | 도입 전 질문 |

관통하는 원리는 세 가지로 압축된다.

### 원리 1. 이름과 위치가 곧 설계다

좋은 리팩토링은 새 알고리즘을 만드는 게 아니라, 있던 것에 **올바른 이름**을 붙이고 **올바른 곳**에 옮기는 작업이다. Magic Number 해소, Extract Method, Move Method, Value Object 도입 모두 이름과 위치의 조정이다. 알고리즘 자체는 대부분 그대로다.

### 원리 2. "변경의 축"이 설계의 실제 단위다

God Object, Long Method, Shotgun Surgery는 같은 병(변경 축 혼재/분산)의 서로 다른 증상이다. Feature Envy도 결국 "변경이 일어나야 할 곳"이 아닌 다른 곳에 로직이 앉아 있는 문제다. 코드를 나누고 합칠 때의 기준은 <strong>"이게 언제, 누구 때문에 바뀌는가"</strong>다.

이 원리에서 **Common Closure Principle**과 **Single Responsibility Principle**이 자연스럽게 도출된다. 함께 변하는 것은 함께 있어야 하고, 다른 이유로 변하는 것은 분리되어야 한다.

### 원리 3. 모든 도입과 변경에는 이유가 있어야 한다

Cargo Cult가 담고 있는 원리는 다른 여섯 개를 감싼다. Value Object를 도입할 때, God Object를 분해할 때, Long Method를 쪼갤 때, 이유 없이 하면 그 자체가 새로운 안티패턴이 된다.

"베스트 프랙티스니까"는 이유가 아니다. "안티패턴을 배웠으니까"도 이유가 아니다. **"이 코드가 이 문제로 아팠다"** 또는 <strong>"이 문제가 곧 예상된다"</strong>만이 이유다.

---

## 실무에 적용할 때의 균형 감각

안티패턴을 배우고 나면 가장 흔한 실수가 **눈에 보이는 모든 것을 리팩토링하려 드는 것**이다. 몇 가지 방어선을 두는 것이 좋다.

**1. 남의 코드에 즉시 손대지 마라.** 특히 오래 유지되어 온 코드에 학습 직후 리팩토링을 들이대는 것은 거의 항상 나쁜 선택이다. 코드에는 명시되지 않은 이유가 있는 경우가 많고, 팀의 신뢰 자본은 제한적이다. 리팩토링 제안은 근거와 이익을 보여주는 방식으로 하되, 우선 자기 코드부터 정리한다.

**2. 모든 원칙에는 반대 방향의 안티패턴이 있다.** 이 글에서 반복적으로 나온 경고를 다시 정리하면:

- Magic Number 제거 → 지나치면 **관용구까지 상수화**
- God Object 분해 → 지나치면 **Lasagna Code / 과잉 분해**
- Long Method 추출 → 지나치면 **함수 점프 지옥**
- Feature Envy 이동 → 지나치면 **또 다른 God Object** 또는 **Anemic Domain Model**
- Shotgun Surgery 응집 → 지나치면 **God Object**
- Primitive Obsession 해소 → 지나치면 **오버 엔지니어링 / Anemic Domain Model**
- Cargo Cult 방어 → 지나치면 **NIH(Not Invented Here) / 검증된 도구 거부**

원칙은 방향이지 끝점이 아니다. 반대 방향에도 벽이 있다.

**3. 리팩토링은 언제나 목적을 동반한다.** "안티패턴이니까 고친다"는 나쁜 이유다. "이 코드에 곧 새 기능이 들어올 텐데 지금 상태로는 추가가 어렵다", "이 부분이 자주 버그를 낸다", "새 팀원이 이해하는 데 오래 걸린다" 같은 구체적 이유가 있어야 한다. 이유 없는 리팩토링은 다른 형태의 낭비다.

**4. 리팩토링과 새 기능은 같은 커밋에 넣지 마라.** 안티패턴을 발견해서 손대고 싶다면, 그것만을 위한 별도 커밋/PR을 만든다. 새 기능 PR에 리팩토링을 섞으면 리뷰가 어렵고, 문제가 생겼을 때 원인 추적도 어렵다.

---

## 디자인 패턴으로

안티패턴이 **왜**에 대한 답이었다면, 디자인 패턴은 **어떻게**에 대한 정리다. 이 글에서 다룬 일곱 안티패턴 중 상당수가 다음의 유명 패턴과 짝을 이룬다.

- **Feature Envy의 정책 분리** → **Strategy 패턴**
- **God Object 없이 복잡성 감추기** → **Facade 패턴**
- **Long Method의 흐름 유지 + 변형점 갈아끼우기** → **Template Method 패턴**
- **Primitive Obsession 해소** → **Value Object 패턴 (DDD)**
- **Shotgun Surgery 방지 (개별 → 통합 알림)** → **Observer 패턴 / 이벤트 기반 아키텍처**
- **Magic Number 해소가 확장되면** → **Enum, 심지어 State 패턴까지**

이 시리즈의 안티패턴들을 체감한 이후에 디자인 패턴을 보면 훨씬 자연스럽게 이해된다. "이 패턴은 이런 문제를 풀기 위해 있구나"가 즉시 와닿는다. 반대로 문제를 체감하지 않은 상태에서 패턴을 배우면 그 자체가 Cargo Cult가 되기 쉽다.

디자인 패턴 학습은 이 시리즈의 자연스러운 다음 단계다. 하지만 그 사이에 한 걸음이 더 있다. **자기 코드를 이 렌즈로 다시 보는 시간**이다. 이 문서를 다 읽었다고 리팩토링부터 시작하지 말고, 며칠 동안 자기 코드를 읽으며 어디가 이 이름들에 해당하는지 관찰하는 시간을 가져라. 그 관찰의 축적이 다음 단계의 학습을 더 단단하게 만든다.
