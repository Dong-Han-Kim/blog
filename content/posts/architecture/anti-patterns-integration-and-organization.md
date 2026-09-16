---
# 📌 기본 메타데이터
title: '디자인 패턴 전에 알아야 할 안티패턴 — 5편: 통합과 조직'
date: '2026-09-16'
category: 'architecture'
tags: ['Anti-Pattern', 'Architecture', 'Integration', 'ADR', 'TypeScript']
description: 'Stovepipe System, Vendor Lock-In, Single Point of Failure, Architecture by Implication, Design by Committee, Ivory Tower Architecture — 시스템 간 통합과 아키텍처를 결정하는 방식의 안티패턴'

# 💬 옵션 필드
draft: false
series: '디자인 패턴 전에 알아야 할 안티패턴'
seriesOrder: 5

# 📚 SEO용
keywords: ['Anti-Pattern', 'Architecture', 'Integration', 'ADR', 'TypeScript', '안티패턴', '벤더 락인', '단일 장애점', '아키텍처 의사결정']
---

# 디자인 패턴 전에 알아야 할 안티패턴 — 5편: 통합과 조직

## 시작하며

[3편](/posts/anti-patterns-layers-and-modules)은 한 애플리케이션 안의 경계를, [4편](/posts/anti-patterns-distributed-systems)은 서비스 간 경계를 다뤘다. 시리즈의 마지막인 이번 편은 시야를 한 단계 더 넓힌다. **여러 시스템이 어떻게 연결되는가**, 그리고 **아키텍처가 어떻게 결정되는가**의 문제다.

앞의 두 가지는 통합의 문제, 가운데 하나는 운영의 문제, 뒤의 세 가지는 의사결정의 문제다.

26. **Stovepipe System** — 따로 자라서 서로 연결되지 않는 시스템
27. **Vendor Lock-In** — 벤더의 결정이 곧 우리의 결정이 되는 상태
28. **Single Point of Failure** — 하나가 멈추면 전체가 멈추는 구성 요소
29. **Architecture by Implication** — 기록되지 않은 암묵적 설계
30. **Design by Committee** — 결정권자 없는 합의 설계
31. **Ivory Tower Architecture** — 현장과 단절된 설계

---

## 26. Stovepipe System

### 정의

『AntiPatterns』에서 소개된 이름으로, stovepipe는 난로의 연통을 뜻한다. 연통처럼 **각자 수직으로만 뻗어 있고 옆으로는 연결되지 않은 시스템**을 가리킨다. 원전은 이를 두 수준으로 구분한다.

- **Stovepipe System** — 하위 시스템들이 공통 추상화 없이 **그때그때 임시로 연결**되어, 구조가 경직되고 변경이 어려운 상태
- **Stovepipe Enterprise** — 조직 차원의 조율 없이 **부서마다 독자적으로 시스템을 구축**해서 시스템 간 데이터와 기능이 호환되지 않는 상태

### 냄새나는 코드

부서마다 고객을 다르게 식별하는 조직을 생각해 보자. 영업 시스템은 `"C-00123"`, 회계 시스템은 숫자 `123`, 물류 시스템은 사업자등록번호로 고객을 구분한다.

```ts
// 영업 → 회계 연동
function toAccountingCustomerId(salesCode: string): number {
  return Number(salesCode.replace("C-", ""));
}

// 영업 → 물류 연동
async function toLogisticsCustomerId(salesCode: string): Promise<string> {
  const row = await salesDb.query(`SELECT biz_no FROM customers WHERE code = $1`, [salesCode]);
  return row.biz_no.replaceAll("-", "");
}

// 회계 → 물류 연동은 또 다른 팀이 또 다른 방식으로 만들었다...
```

시스템이 N개일 때 1:1로 연결하면 연동 경로는 최대 N(N−1)/2개가 된다. 시스템이 다섯 개면 열 개, 열 개면 마흔다섯 개다. 새 시스템이 하나 추가될 때마다 기존 시스템 전체와의 변환 코드가 필요해진다.

### 처방

- **공통 식별자와 표준 데이터 모델을 정한다.** 고객, 제품, 조직 같은 핵심 데이터는 기준 정보(마스터 데이터)로 한곳에서 관리한다.
- **점대점 연결 대신 통합 계층을 둔다.** 메시지 브로커나 통합 API를 중심에 두면, 각 시스템은 표준 형식으로 한 번만 연결하면 된다.

```ts
// 표준 이벤트 — 모든 시스템이 이 형식 하나만 이해하면 된다
interface CustomerUpdated {
  customerId: string;           // 전사 공통 식별자
  legacyIds: {
    sales?: string;
    accounting?: number;
    logistics?: string;
  };
  name: string;
  updatedAt: string;
}
```

- 기존 시스템을 당장 바꿀 수 없다면, 변환 로직을 **각 시스템의 경계에 있는 어댑터(Anti-Corruption Layer)** 한곳에 모은다. 변환 코드가 비즈니스 로직 곳곳에 흩어지는 것을 막는 것이 우선이다.

### 판단 기준

> "새 시스템 하나를 연동하려면 몇 개의 연동 코드를 새로 만들어야 하는가?"

---

## 27. Vendor Lock-In

### 정의

『AntiPatterns』의 아키텍처 범주에 속한다. **특정 벤더의 제품이나 서비스에 과도하게 의존해서, 벤더의 가격 정책·기능 변경·서비스 종료가 곧 우리 시스템의 운명이 되는 상태**다.

주의할 점이 있다. 특정 벤더를 깊게 쓰는 것 자체는 합리적인 선택일 수 있다. 관리형 서비스를 쓰면 운영 부담이 크게 줄어든다. 안티패턴이 되는 것은 **종속을 의식하지 못한 채**, 벤더의 SDK와 개념이 도메인 코드 전체에 퍼진 상태다.

### 냄새나는 코드

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export async function issueInvoice(order: Order) {
  const pdf = await renderInvoicePdf(order);

  // 비즈니스 로직 한가운데 벤더 SDK가 있다
  await s3.send(new PutObjectCommand({
    Bucket: "invoices-prod",
    Key: `${order.id}.pdf`,
    Body: pdf,
    ContentType: "application/pdf",
  }));

  await markInvoiceIssued(order.id);
}
```

이런 코드가 서른 곳에 있다면, 저장소를 바꾸는 일은 서른 곳의 비즈니스 로직을 수정하는 일이 된다.

### 처방

**벤더 의존을 경계(어댑터)에 가둔다.** 3편 Swiss Army Knife에서 본 것처럼 역할 단위의 좁은 인터페이스를 쓴다.

```ts
// 도메인이 정의하는 포트
export interface InvoiceStorage {
  save(orderId: string, pdf: Buffer): Promise<void>;
}

// 벤더 의존은 어댑터 한 파일에만
export class S3InvoiceStorage implements InvoiceStorage {
  constructor(private readonly s3: S3Client, private readonly bucket: string) {}

  async save(orderId: string, pdf: Buffer) {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `${orderId}.pdf`,
      Body: pdf,
      ContentType: "application/pdf",
    }));
  }
}

// 도메인 로직은 벤더를 모른다
export async function issueInvoice(order: Order, storage: InvoiceStorage) {
  const pdf = await renderInvoicePdf(order);
  await storage.save(order.id, pdf);
  await markInvoiceIssued(order.id);
}
```

그 밖에 고려할 것들은 다음과 같다.

- **표준 프로토콜과 포맷을 선호한다.** 여러 제품이 지원하는 S3 호환 API, 표준 SQL, OpenTelemetry 같은 선택은 교체 비용을 낮춘다.
- **탈출 비용을 기록해 둔다.** 벤더를 바꾸려면 무엇을 해야 하는지 알고 선택하는 것과 모르고 선택하는 것은 다르다.
- **과잉 추상화를 경계한다.** 모든 벤더를 지원하려고 공통분모만 남긴 추상화를 만들면, 각 벤더의 강점을 하나도 쓰지 못하게 된다. 3편 Leaky Abstraction에서 본 것처럼 완벽한 추상화는 없다.

### 판단 기준

> "벤더가 가격을 두 배로 올린다면, 우리의 선택지는 무엇이고 비용은 얼마인가?"

---

## 28. Single Point of Failure

### 정의

**그것 하나가 멈추면 시스템 전체가 멈추는 구성 요소**다. 흔히 서버나 데이터베이스 같은 인프라만 떠올리지만, 실제 장애는 훨씬 다양한 곳에서 시작된다.

- 세션·캐시·작업 큐를 모두 떠맡은 **Redis 인스턴스 하나**
- 갱신을 잊은 **TLS 인증서**
- 모든 서비스가 시작할 때 읽는 **중앙 설정 서버**
- 배포 스크립트를 이해하는 **단 한 명의 개발자**

마지막 항목은 흔히 **버스 팩터**(bus factor)라는 이름으로 불린다. 몇 명이 갑자기 사라지면 프로젝트가 멈추는가를 뜻하며, 그 숫자가 1이면 사람이 단일 장애점이다.

### 냄새나는 코드

```ts
export async function getProduct(id: string) {
  const cached = await redis.get(`product:${id}`); // Redis가 죽으면 여기서 예외
  if (cached) return JSON.parse(cached);

  const product = await productRepository.findById(id);
  await redis.set(`product:${id}`, JSON.stringify(product), "EX", 60);
  return product;
}
```

캐시는 성능을 위한 **보조** 수단이다. 그런데 이 코드에서는 캐시 장애가 곧 상품 조회 장애가 된다. 보조 수단이 필수 의존성으로 승격된 것이다.

### 처방

**보조 의존성은 실패해도 요청이 성공하도록 설계한다(graceful degradation).**

```ts
export async function getProduct(id: string) {
  try {
    const cached = await withTimeout(redis.get(`product:${id}`), 50);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    logger.warn("캐시 조회 실패 — 원본 조회로 진행", { id, error: e });
  }

  const product = await productRepository.findById(id);

  // 캐시 저장 실패는 응답을 막지 않는다
  redis.set(`product:${id}`, JSON.stringify(product), "EX", 60)
    .catch((e) => logger.warn("캐시 저장 실패", { id, error: e }));

  return product;
}
```

그 밖의 처방은 다음과 같다.

- 필수 구성 요소는 **이중화**한다.
- 외부 호출에는 반드시 **타임아웃**을 두고, 반복 실패 시 **서킷 브레이커**로 호출을 차단한다.
- 인증서, 도메인, 라이선스처럼 **만료되는 것**의 목록과 갱신 알림을 관리한다.
- 사람이 단일 장애점이라면 **문서화, 페어 작업, 운영 업무 순환**으로 지식을 분산한다.

### 판단 기준

시스템 구성도를 펼쳐 놓고, 모든 구성 요소에 대해 "**이게 멈추면 어떻게 되는가?**"를 묻는다. 답이 "전부 멈춘다"인 항목이 단일 장애점 목록이다.

---

## 29. Architecture by Implication

### 정의

『AntiPatterns』의 아키텍처 범주에 속한다. **명시적인 아키텍처 결정이나 문서 없이, "다들 알잖아"라는 암묵적 합의로 시스템을 만드는 상태**다. 과거 프로젝트의 성공 경험에 기대어 "이번에도 비슷하게 하면 되겠지"라고 가정할 때 흔히 발생한다.

### 증상

- "이건 왜 이렇게 만들었어요?"라는 질문에 답할 수 있는 사람이 없거나, 퇴사했다
- 신규 입사자가 코드를 읽으며 설계 의도를 **추리**해야 한다
- 성능 목표, 가용성 목표, 보안 요구사항 같은 **비기능 요구사항**이 어디에도 정의되어 있지 않다
- 같은 문제를 팀마다 다른 방식으로 풀고 있다

### 처방 1 — ADR로 결정을 기록한다

Michael Nygard가 2011년에 제안한 **ADR**(Architecture Decision Record)은 아키텍처 결정 하나를 짧은 문서 하나로 남기는 방식이다. 핵심은 **무엇을 결정했는지보다 왜 그렇게 결정했는지**를 남기는 것이다.

```markdown
# ADR-007: 서비스 간 비동기 통신에 메시지 브로커 도입

## 상태
승인됨 (2026-09-10)

## 맥락
주문 완료 시 정산·알림·포인트 서비스를 동기 호출하고 있어,
알림 서비스 장애가 주문 실패로 이어지는 사례가 월 2회 발생했다.

## 결정
주문 완료는 이벤트로 발행하고, 후속 서비스는 구독하여 처리한다.
DB 저장과 발행의 원자성은 Transactional Outbox로 보장한다.

## 결과
- 후속 서비스 장애가 주문 성공에 영향을 주지 않는다.
- 최종 일관성을 수용해야 하며, 정산 반영까지 수 초의 지연이 생긴다.
- 메시지 브로커 운영 부담이 추가된다.

## 검토한 대안
- 동기 호출 + 재시도: 장애 전파 문제를 해결하지 못해 기각.
```

"결과"에 **단점까지 적는 것**이 중요하다. 트레이드오프를 알고 한 선택이라는 증거가 된다.

### 처방 2 — 규칙을 코드로 검증한다

문서는 읽히지 않으면 효력이 없다. 중요한 구조 규칙은 **테스트로 강제**한다. 이런 테스트를 아키텍처 적합도 함수(fitness function)라고 부른다.

```js
// .dependency-cruiser.js
module.exports = {
  forbidden: [
    {
      name: "domain-must-not-depend-on-infra",
      comment: "도메인 계층은 인프라 계층을 import할 수 없다 (ADR-003)",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^src/infra" },
    },
  ],
};
```

규칙 설명에 ADR 번호를 적어 두면, 위반한 사람이 **왜 안 되는지**를 바로 찾아볼 수 있다.

### 판단 기준

> "이 시스템의 핵심 결정 다섯 가지와 그 이유를, 사람에게 묻지 않고 문서에서 찾을 수 있는가?"

---

## 30. Design by Committee

### 정의

『AntiPatterns』에 등장하는 안티패턴으로, **명확한 결정권자 없이 위원회의 합의로 설계를 진행한 결과, 모든 이해관계자의 요구를 빠짐없이 담았지만 일관성 없고 지나치게 복잡한 설계가 나오는 상태**다.

### 증상

- 회의는 길고 잦지만 결론이 나지 않는다
- 결론이 나면 "모두의 의견을 반영한" 옵션이 늘어나 있다
- 설계 문서에 "A 또는 B", "필요 시 C도 지원" 같은 표현이 많다
- 누구도 설계 전체를 설명하지 못한다

### 냄새나는 코드

```ts
interface ReportOptions {
  format: "pdf" | "xlsx" | "csv" | "hwp" | "docx";
  legacyLayout?: boolean;        // 기획팀 요청
  includeTeamBColumns?: boolean; // B팀 요청
  compactMode?: boolean;         // C팀 요청
  compactModeV2?: boolean;       // C팀 요청이 바뀜
  useOldDateFormat?: boolean;    // 임원 보고용
  splitBySheet?: boolean;        // xlsx에서만 동작
  // ... 옵션 20개 더
}
```

옵션 조합의 수가 폭발하고, 어떤 조합이 실제로 동작하는지 아무도 모른다. 이런 모습은 1편 God Object나 3편 Swiss Army Knife로 나타나는 경우가 많지만, 원인은 코드가 아니라 **결정 방식**에 있다.

### 처방

- **결정권자를 명확히 한다.** 의견은 넓게 듣되, 결정은 한 사람(또는 아주 작은 그룹)이 내리고 책임진다.
- **대안과 기각 사유를 기록한다.** 29번의 ADR이 여기서도 효과적이다. 의견이 반영되지 않은 사람도 "고려되었다"는 사실을 확인할 수 있다.
- **말보다 프로토타입으로 논쟁한다.** 추상적인 토론보다 동작하는 초안 두 개를 비교하는 편이 훨씬 빠르게 수렴한다.
- **요구사항을 거절하는 것도 설계다.** 모든 요청을 옵션으로 흡수하는 대신, 핵심 사용 사례를 정하고 나머지는 명시적으로 범위에서 제외한다.

---

## 31. Ivory Tower Architecture

### 정의

**구현 현장과 단절된 아키텍트가 이론적으로 이상적인 설계를 만들어 위에서 아래로 전달하는 상태**다. 상아탑(ivory tower)이라는 이름처럼, 설계는 우아하지만 팀의 역량·일정·운영 환경 같은 현실의 제약을 반영하지 못한다. 여러 소프트웨어 아키텍처 서적에서 "상아탑 아키텍트"를 경계해야 할 모습으로 다룬다.

### 증상

- 아키텍처 문서와 실제 코드가 전혀 다르다
- 개발팀이 설계를 따르지 않고 **조용히 우회로**를 만든다
- 아키텍트가 코드 리뷰에 참여하지 않고, 프로덕션 장애를 겪어본 적이 없다
- "이 설계대로 하면 일정 안에 못 끝난다"는 피드백이 전달될 통로가 없다

### 처방

- **아키텍트도 코드를 작성한다.** 적어도 핵심 결정은 직접 PoC로 검증한다.
- **결정의 근거를 공유한다.** "이렇게 하라"가 아니라 "이런 문제 때문에 이렇게 결정했다"를 전달하면, 팀이 예외 상황에서 스스로 올바른 판단을 내릴 수 있다.
- **피드백 루프를 만든다.** 설계가 현실에서 어떻게 작동하는지 주기적으로 회고하고, 틀린 결정은 새 ADR로 뒤집는다.
- **규칙은 문서가 아니라 적합도 함수로 강제한다.** 29번에서 본 것처럼, 지켜야 할 규칙이라면 CI가 검사하게 한다. 지킬 수 없는 규칙이라면 규칙 쪽이 틀렸을 가능성을 먼저 의심한다.

### 세 가지 의사결정 안티패턴의 관계

29~31번은 서로 반대 방향의 실패다.

| 안티패턴 | 문제의 성격 |
|---|---|
| Architecture by Implication | 결정이 **기록되지 않음** |
| Design by Committee | 결정권이 **너무 분산됨** |
| Ivory Tower Architecture | 결정권이 **너무 집중되고 현실과 단절됨** |

건강한 상태는 그 사이에 있다. **결정권은 명확하되, 근거는 기록되고, 현장의 피드백으로 계속 수정된다.**

---

## 시리즈를 마치며

다섯 편에 걸쳐 서른한 가지 안티패턴을 다뤘다. 영향 범위를 기준으로 정리하면 다음과 같다.

| 편 | 수준 | 다룬 안티패턴 |
|---|---|---|
| 1편 | 함수·파일 | Magic Number, God Object, Long Method, Feature Envy, Shotgun Surgery, Primitive Obsession, Cargo Cult |
| 2편 | 시스템·프로세스 | Spaghetti Code, Big Ball of Mud, Lava Flow, Golden Hammer, Premature Optimization, Reinventing the Wheel |
| 3편 | 계층·모듈 | Architecture Sinkhole, Cyclic Dependency, Leaky Abstraction, Anemic Domain Model, Inner-Platform Effect, Swiss Army Knife |
| 4편 | 분산 시스템 | Distributed Monolith, Shared Database, Chatty Services, Nanoservices, Entity Service, Death Star |
| 5편 | 통합·조직 | Stovepipe System, Vendor Lock-In, Single Point of Failure, Architecture by Implication, Design by Committee, Ivory Tower Architecture |

### 이 시리즈에서 다루지 않은 원전의 안티패턴

『AntiPatterns』 아키텍처·관리 범주에는 이 밖에도 몇 가지가 더 있다. 실무에서 이름으로 불리는 일은 드물지만 참고로 남긴다.

- **Jumble** — 범용 요소(수평)와 도메인 특화 요소(수직)가 뒤섞여 구조가 불안정해진 상태
- **Autogenerated Stovepipe** — 기존 설계를 분산 환경으로 옮기면서 인터페이스를 기계적으로 생성해, 분산에 맞지 않는 인터페이스가 만들어진 상태
- **Wolf Ticket** — 표준을 준수한다고 주장하지만 실제 적합성은 검증되지 않은 제품에 의존하는 상태
- **Cover Your Assets** — 결정을 피하기 위해 모든 대안을 나열한 방대한 문서만 만드는 상태
- **Warm Bodies** — 문제를 투입 인원을 늘려 해결하려는 상태

### 마지막으로

안티패턴의 목록을 외우는 것보다 중요한 것은 **공통된 뿌리**를 보는 눈이다. 서른한 가지를 관통하는 원인은 결국 몇 가지로 모인다. 경계가 흐려졌거나, 비용을 측정하지 않았거나, 결정의 이유를 잃어버렸다.

이제 드디어 디자인 패턴을 볼 준비가 됐다. 패턴은 이런 실패들을 반복하지 않기 위해 선배 개발자들이 남긴 **이름 붙은 해법**이기 때문이다.
