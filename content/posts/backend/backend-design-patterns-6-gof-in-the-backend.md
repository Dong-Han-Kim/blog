---
# 📌 기본 메타데이터
title: '변하는 것을 갈아끼우기 — 백엔드에서 살아남은 GoF'
date: '2026-09-15'
category: 'backend'
tags: ['GoF', 'Design Pattern', 'Strategy', 'Decorator', 'TypeScript']
description: 'GoF 23개 중 백엔드에서 살아남은 여덟 개의 서식지. Strategy와 Decorator를 클래스와 함수로 나란히 써 보고, 함수 버전이 사는 컴파일 타임 검사와 파는 발견 가능성을 비교한다.'

# 💬 옵션 필드
draft: false
series: '백엔드 디자인 패턴'
seriesOrder: 6

# 📚 SEO용
keywords: ['GoF', 'Design Pattern', 'Strategy', 'Decorator', 'TypeScript', '백엔드 디자인 패턴']
---

# 변하는 것을 갈아끼우기 — 백엔드에서 살아남은 GoF

이 편은 두 가지 주장 위에 서 있다.

첫째, **GoF 23개 중 백엔드 서버 코드에서 실제로 값을 하는 것은 소수다.** 나머지가 열등해서가 아니다. 『Design Patterns』(1994)가 상정한 맥락 — C++와 Smalltalk, GUI 툴킷, 문서 편집기, 컴파일러 — 은 요청 하나를 받아 처리하고 떠나는 오늘의 백엔드와 다르다. 그 시절의 문제 중 상당수는 지금 GC와 데이터베이스와 프로세스 경계가 대신 풀고 있다.

둘째, **TypeScript에서는 여러 GoF 패턴이 클래스 없이 함수와 타입으로 더 짧게 표현된다.** 일급 함수와 클로저가 있으면 Strategy는 함수 인자이고, 구조적 타이핑이 있으면 Adapter는 객체 리터럴이다. GoF의 구조 다이어그램 상당수는 "함수를 값으로 다룰 수 없는 언어에서 함수를 값처럼 쓰는 방법"이었다.

## switch 문이 다섯 갈래가 됐을 때

결제 처리는 대개 이렇게 자란다.

```ts
// services/payment.ts — Before: 분기가 결제 수단 수만큼 늘어난다
export async function pay(order: Order, method: string) {
  if (method === 'card') {
    const r = await pg.charge(order.total, order.card!)
    return { ok: r.approved, txId: r.id }
  } else if (method === 'vbank') {
    const r = await vbank.issue(order.total, order.buyerName)
    return { ok: true, txId: r.accountNo, dueAt: r.dueAt }
  } else if (method === 'point') {
    // ... 포인트 차감, 잔액 검증
  }
  throw new Error('unsupported method')
}
```

세 갈래일 때는 읽을 만하다. 문제는 결제 수단이 다섯 개가 되고 각 갈래에 환불·부분취소·정산 조회가 붙을 때다. 같은 `if` 사다리가 `refund`, `cancel`, `settle`에도 복제되고, 결제 수단 하나를 추가하는 작업이 **네 개 파일의 네 개 사다리에 각각 한 갈래를 더하는 일**이 된다.

무너지는 지점은 하나다. 변하는 축(결제 수단)이 여러 곳에 흩어져 있어 축 하나를 추가하는 변경이 국소적이지 않고, 컴파일러가 빠진 갈래를 알려주지도 않는다.

## 살아남은 여덟 개와 그 서식지

카탈로그 순서 대신 **백엔드에서 실제로 서식하는 자리**를 기준으로 추린다.

| 패턴 | 생존 | 백엔드에서의 서식지 | TS다운 대안 |
|---|---|---|---|
| Strategy | 높음 | 결제 수단, 요금 정책, 재시도 정책, 정렬 규칙 | 함수 맵 (`Record<K, Fn>`) |
| Adapter | 높음 | 외부 SDK를 도메인 인터페이스로 감싸기 | 객체 리터럴 + 구조적 타이핑 |
| Decorator | 높음 | 로깅·캐싱·재시도·타임아웃 겹치기 | 고차 함수, 미들웨어 체인 |
| Factory | 중간 | 환경별 구현체 선택(로컬 인메모리 / 운영 S3) | 팩토리 함수, DI 컨테이너 |
| Observer | 중간 | 도메인 이벤트 디스패치 | `EventEmitter`, 핸들러 배열 |
| Command | 중간 | 큐 작업, 재시도, 감사 로그 | 판별 유니온 + 리듀서 |
| Singleton | 낮음 | 커넥션 풀, 설정, 로거 | 모듈 스코프 변수 (이미 싱글턴) |
| Template Method | 낮음 | 드묾. 대부분 함수 조합으로 대체 | 함수 합성, 콜백 인자 |

**Strategy**는 앞의 `if` 사다리가 가리키던 자리다. 변하는 축을 인터페이스로 뽑아 구현체를 갈아끼운다. TypeScript에서는 함수 맵으로 충분한 경우가 많고, **클래스가 이기는 조건은 전략이 상태를 가질 때다.** 재시도 전략이 시도 횟수와 대기 시간을 들고 있어야 한다면 그렇다.

**Factory**는 "어떤 구현체를 쓸지"를 호출부에서 떼어내는 자리다. 로컬은 인메모리, 운영은 S3가 대표적이다. DI 컨테이너는 사실상 Factory를 설정으로 외부화한 것이라, 둘 다 넣으면 같은 일을 두 겹으로 한다.

**Adapter**는 외부 SDK의 타입과 예외 체계를 도메인 인터페이스로 번역하는 자리다. **Anticorruption Layer(9편)는 Adapter를 시스템 경계 규모로 키운 것이다.** Adapter가 클래스 하나를 감싼다면 Anticorruption Layer는 모델 전체를 감싼다. 목적은 같다. 남의 어휘가 내 도메인에 스며들지 않게 하기.

**Decorator**는 구현을 건드리지 않고 로깅·캐싱·재시도를 겹치는 자리다. `(req, res, next)`로 받아 다음으로 넘기는 Express의 미들웨어 체인이 사실상 Decorator다. 핸들러를 같은 시그니처의 핸들러로 감싸는 것이기 때문이다.

**Observer**는 도메인 이벤트(5편)의 구조 그 자체이고, 계보가 하나 더 있다. **프로세스 경계를 넘는 순간 Observer는 Publish-Subscribe(8편)가 된다.** 통지가 메모리 참조가 아니라 네트워크를 타면 전달 보장·순서·중복이 전부 따라 들어온다. 이 차이를 무시하고 인메모리 Observer를 그대로 분산으로 옮기는 것이 [안티패턴 7편](/posts/backend-antipatterns-7-fallacies-of-distributed-computing)이 다룬 오해다.

**Command**는 작업을 데이터로 만드는 자리다. 큐에 넣거나 재시도하거나 감사 로그로 남겨야 할 때 값을 한다. 함수는 직렬화되지 않지만 `{ type: 'RefundOrder', orderId, amount }`는 직렬화된다. 이 구조가 Event Sourcing(12편)으로 이어진다.

**Singleton**은 정직하게 다룰 필요가 있다. 커넥션 풀·설정·로거처럼 **수명이 프로세스와 같은 것**에는 여전히 맞다. 다만 Node.js에서는 모듈 캐시가 이미 싱글턴이라 별도 구현이 필요 없다. `export const pool = new Pool(...)`이면 끝이고, `getInstance()`와 `private static instance`는 다른 언어의 관용구를 옮겨온 것이다. 문제는 두 곳에서 나온다. 테스트에서 모듈 상태를 리셋하려면 모듈 레지스트리를 만져야 하고, 서버리스에서는 인스턴스마다 별도 프로세스라 "하나"라는 전제가 깨진다. 인스턴스 100개가 각자 풀 10개를 열면 1,000 커넥션인데 PostgreSQL의 기본 `max_connections`는 100이다([안티패턴 13편](/posts/backend-antipatterns-13-stateless-function-serverless)).

**Template Method**는 상속으로 확장점을 여는데, 확장점이 둘을 넘으면 하위 클래스가 상위 클래스의 호출 순서를 암묵적으로 알아야 한다. 같은 일을 고차 함수 인자로 넘기면 확장점이 시그니처에 드러난다. **상속 기반 확장의 대안이 언어 차원에서 싸진 것이 직접 원인이다.**

나머지는 한 문단이면 된다. Flyweight는 메모리 공유가 목적인데 GC와 서버 메모리 가격이 그 문제를 없앴다. Memento의 상태 스냅숏 역할은 DB 행과 이벤트 로그가 한다. Visitor는 판별 유니온과 exhaustive `switch`가 더 짧게 같은 안전성을 준다. Bridge는 구조적 타이핑과 제네릭이 있으면 별도 계층이 필요 없다. **GoF가 클래스 계층으로 풀던 문제를 지금은 타입 시스템과 런타임과 인프라가 풀고 있다.**

## 클래스 29줄과 함수 17줄이 같은 일을 한다

Strategy를 두 가지로 써서 나란히 놓는다. 요구사항은 같다. 결제 수단별 승인 처리, 그리고 새 수단 추가가 국소적일 것.

```ts
// payments/strategy-class.ts — After(클래스): GoF 원형에 가까운 구현
export interface PaymentStrategy {
  charge(order: Order): Promise<PaymentResult>
}

export class CardPayment implements PaymentStrategy {
  constructor(private pg: PgClient) {}
  async charge(order: Order) {
    const r = await this.pg.charge(order.total, order.card!)
    return { ok: r.approved, txId: r.id }
  }
}

export class VbankPayment implements PaymentStrategy {
  constructor(private vbank: VbankClient) {}
  async charge(order: Order) {
    const r = await this.vbank.issue(order.total, order.buyerName)
    return { ok: true, txId: r.accountNo }
  }
}

export class PaymentContext {
  constructor(private strategies: Map<string, PaymentStrategy>) {}
  async pay(order: Order, method: string) {
    const s = this.strategies.get(method)
    if (!s) throw new Error(`unsupported: ${method}`)
    return s.charge(order)
  }
}
```

```ts
// payments/strategy-fn.ts — After(함수): 같은 요구사항, 타입이 누락을 잡는다
export type PaymentMethod = 'card' | 'vbank' | 'point'
export type ChargeFn = (order: Order) => Promise<PaymentResult>

export const charges: Record<PaymentMethod, ChargeFn> = {
  card: async (o) => {
    const r = await pg.charge(o.total, o.card!)
    return { ok: r.approved, txId: r.id }
  },
  vbank: async (o) => {
    const r = await vbank.issue(o.total, o.buyerName)
    return { ok: true, txId: r.accountNo }
  },
  point: async (o) => point.deduct(o.buyerId, o.total),
}

export const pay = (o: Order, method: PaymentMethod) => charges[method](o)
```

줄 수 차이보다 중요한 것이 두 가지 있다.

첫째, 함수 버전에는 **`unsupported method` 런타임 예외가 없다.** `Record<PaymentMethod, ChargeFn>`은 키가 하나라도 빠지면 컴파일되지 않으므로, 유니온에 결제 수단을 추가하는 순간 컴파일러가 구현이 빠진 자리를 지목한다. 서두의 Before가 가졌던 "빠진 갈래를 런타임에야 안다"가 사라진다. 클래스 버전의 `Map`은 이 검사를 못 한다.

둘째, 클래스 버전이 이기는 조건도 분명하다. 전략이 **의존성을 주입받아 들고 있어야 할 때**다. 위 함수 버전은 `pg`와 `vbank`를 모듈 스코프에서 직접 참조하므로 테스트에서 교체하기 어렵다. 다만 이때의 대안도 클래스가 아니라 고차 함수다. `const makeCardCharge = (pg: PgClient): ChargeFn => async (o) => ...`면 생성자 주입과 같은 일을 한 줄로 한다.

Decorator는 차이가 더 크다. 고차 함수로 겹치면 순서까지 호출부 한 줄에서 읽힌다.

```ts
// lib/wrap.ts — After: 재시도와 로깅을 고차 함수로 겹친다
type Fn<A extends unknown[], R> = (...args: A) => Promise<R>

export const withRetry = <A extends unknown[], R>(n: number, f: Fn<A, R>): Fn<A, R> =>
  async (...args) => {
    for (let i = 0; ; i++) {
      try { return await f(...args) } catch (e) {
        if (i >= n) throw e
        await sleep(100 * 2 ** i)   // 지수 백오프
      }
    }
  }

export const withLog = <A extends unknown[], R>(name: string, f: Fn<A, R>): Fn<A, R> =>
  async (...args) => {
    const t = Date.now()
    try { return await f(...args) } finally { logger.info({ name, ms: Date.now() - t }) }
  }

// 조합 — 로그가 바깥이므로 재시도 전체가 한 번으로 측정된다
export const charge = withLog('charge', withRetry(3, charges.card))
```

클래스 Decorator로 같은 것을 쓰면 인터페이스 1개 + 데코레이터 클래스 2개가 필요하고, 메서드가 다섯 개인 인터페이스를 감쌀 때 **관심 없는 메서드 네 개까지 위임 코드를 써야 한다.** 고차 함수는 감쌀 함수 하나만 본다. 대신 잃는 것이 있다. 클래스 버전은 감싼 대상이 같은 인터페이스라는 사실이 타입에 남지만, 함수 조합은 "이것이 무엇을 감싼 것인가"를 타입으로 말해주지 않는다. `withLog(withRetry(f))`와 `withRetry(withLog(f))`는 다른 프로그램인데 그 차이도 타입에 없다.

## 청구서 — 발견 가능성이라는 항목

간접성 자체의 비용은 1편에서 세 통화 중 하나로 정리했으므로 다시 설명하지 않는다. GoF 패턴에만 붙는 항목 둘을 적는다.

**패턴 이름을 클래스 이름에 박는 비용.** `PaymentStrategyFactoryImpl` 같은 이름은 세 가지를 동시에 잃는다. 첫째, 이름이 도메인 어휘가 아니라 구현 기법을 말한다. 이 클래스가 결제에 대해 무엇을 아는지는 이름에서 알 수 없다. 둘째, 패턴을 바꾸면 이름을 바꿔야 하는데 대개 안 바꾸므로 이름이 거짓말이 된다. 셋째, `Impl` 접미사는 구현체가 하나뿐이라는 사실을 문서화한다 — 그 인터페이스가 필요 없다는 증거다. **구현체가 하나이고 이름이 `XxxImpl`이라면 그 인터페이스는 지우는 쪽이 맞는 경우가 많다.**

**함수 버전의 발견 가능성 손실.** 이것이 함수 대 클래스 교환의 핵심이다. 클래스 버전에서는 새 결제 수단을 추가하려는 사람이 `implements PaymentStrategy`를 검색해 구현체 목록과 확장 지점을 한 번에 찾는다. 함수 맵에는 검색할 키워드가 없다. `charges`라는 이름을 이미 알고 있어야 하고 그 객체가 어느 파일에 있는지도 알아야 한다. 확장 지점을 찾는 시간이 검색 한 번에서 코드 탐색 몇 분으로 늘어난다.

완화 수단은 있지만 공짜가 아니다. 타입 별칭(`ChargeFn`)에 이름을 주고 그것을 검색 지점으로 삼기, 확장 지점을 `payments/` 한 디렉터리에 모으기, 레지스트리 파일 하나를 관문으로 두기. 세 가지 모두 **규약이지 언어가 강제하는 구조가 아니다.** `implements`는 컴파일러가 아는 관계이고 디렉터리 규약은 사람만 아는 관계다. 이 차이는 팀이 커질수록 벌어진다.

## 쓰지 말아야 할 때

**구현체가 하나인데 Strategy를 넣는 경우.** 가장 흔한 과잉이다. 인터페이스 하나, 구현 클래스 하나, 고르는 컨텍스트 하나 — 파일 3개가 생기고 갈아끼울 대상은 없다. 1편의 손익 계산을 그대로 적용하면 된다. **"나중에 바뀔 수 있으니까"는 확률 × 이득으로 환산되기 전에는 근거가 아니다.** 결제 수단이 다섯 개인 것은 사실이고 두 번째 결제 대행사가 생길 가능성은 가설이다. 사실에는 지금 투자하고 가설에는 투자하지 않는다.

**변형 가능성이 가설인 단계의 Factory.** "언젠가 S3 대신 다른 스토리지를 쓸 수도 있다"로 Factory를 넣으면, 그 언젠가가 오지 않는 동안 모든 호출이 한 단계씩 더 돈다. 반대로 **로컬 개발에 인메모리 구현이 지금 필요하다면 구현체는 이미 두 개다.** 그때는 가설이 아니라 현재의 요구사항이고 Factory가 값을 한다.

**추상화의 근거가 타입이 아니라 이름일 때.** 세 결제 수단의 `charge`가 반환하는 것이 각각 다른데(카드는 승인번호, 가상계좌는 계좌번호와 입금기한, 포인트는 잔액) 공통 인터페이스를 맞추려고 반환 타입을 옵셔널 필드 덩어리나 `Record<string, unknown>`으로 넓히고 있다면, 그 셋은 같은 연산이 아니다. **인터페이스를 맞추려고 타입을 넓히는 순간 Strategy가 사는 값을 이미 잃은 것이다.** 각각을 별도 유스케이스로 두고 호출부에서 판별 유니온으로 분기하는 편이 정보를 더 보존한다.

**Singleton을 다중 인스턴스 환경에 그대로 옮기는 경우.** 커넥션 수 문제 외에, "프로세스당 하나"를 "시스템에 하나"로 착각하면 인메모리 캐시·중복 방지 플래그·스케줄러 잠금이 전부 인스턴스 수만큼 복제된다. 시스템 전체에 하나여야 하는 것은 프로세스 밖 — Redis나 DB 잠금, 혹은 Leader Election(15편) — 으로 나가야 한다.

## 요약

| 항목 | 내용 |
|---|---|
| 논지 1 | GoF 23개 중 백엔드에서 값을 하는 것은 소수. 1994년의 맥락이 지금과 다르다 |
| 논지 2 | TS에서는 여러 패턴이 클래스 없이 함수와 타입으로 더 짧아진다 |
| 생존 상위 | Strategy, Adapter, Decorator — 각각 함수 맵, 객체 리터럴, 고차 함수로 축약 |
| 계보 | Adapter → Anticorruption Layer(9편), Observer → Publish-Subscribe(8편) |
| 함수 버전의 이득 | `Record<Union, Fn>`이 누락된 갈래를 컴파일 시점에 잡는다 |
| 함수 버전의 대가 | 발견 가능성 손실. `implements` 검색이 규약으로 대체된다 |
| 클래스가 이길 때 | 전략이 상태나 주입 의존성을 들고 있을 때(단, 고차 함수도 대안) |
| 쓰지 말 때 | 구현체가 하나일 때, 변형이 가설일 때, 인터페이스를 맞추려 타입을 넓힐 때 |

---

**다음 편 — [7편. 원격 경계의 문법 — Remote Facade, DTO, API Composition, BFF](/posts/backend-design-patterns-7-remote-boundary-patterns)**

여기까지가 1막이다. 하나의 프로세스 안에서는 경계를 긋는 비용이 함수 호출 한 번이었다. 7편부터의 2막에서는 그 경계가 네트워크를 타면서 호출 하나의 가격이 마이크로초에서 밀리초로 바뀌고, 그 가격표 위에서 다시 설계해야 하는 패턴들을 다룬다.
