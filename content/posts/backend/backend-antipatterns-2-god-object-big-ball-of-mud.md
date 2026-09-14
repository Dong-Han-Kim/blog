---
# 📌 기본 메타데이터
title: 'God Object와 Big Ball of Mud — 경계 없는 서버'
date: '2026-09-14'
category: 'backend'
tags: ['Anti-Pattern', 'God Object', 'Big Ball of Mud', 'Cohesion', 'Refactoring', 'TypeScript']
description: '나쁜 커밋 하나 없이 1,800줄 파일이 되는 과정. 응집도·결합도를 형용사가 아닌 기준으로 말하는 법과 이음매를 찾아 경계를 되살리는 순서.'

# 💬 옵션 필드
draft: false
series: '백엔드 안티패턴'
seriesOrder: 2

# 📚 SEO용
keywords: ['Anti-Pattern', 'God Object', 'Big Ball of Mud', 'Cohesion', 'Refactoring', 'TypeScript', '백엔드 안티패턴']
---

# God Object와 Big Ball of Mud — 경계 없는 서버

## 1,800줄이 된 파일에는 나쁜 커밋이 하나도 없다

`services/user.ts`를 열면 1,800줄이 나온다. 이 파일의 이력을 `git log --follow`로 되감으면 커밋 40여 개가 나오는데, 그중 "이건 잘못 짠 커밋"이라고 지목할 만한 건 하나도 없다.

시간 순으로 몇 개만 복원해 보면 이렇다.

| 커밋 | 변경 | 그때의 판단 | 누적 줄 수 |
|---|---|---|---|
| #1 | `createUser`, `findUser` | 사용자 CRUD니까 한 파일 | 80 |
| #7 | `sendWelcomeEmail` 추가 | 가입 직후에만 보내니 가입 로직 옆에 | 210 |
| #12 | `verifyEmail`, `resendToken` | 이메일 관련이니 여기가 맞다 | 380 |
| #19 | `applyReferralCredit` | 추천인 확인에 `findUser`가 필요하다 | 640 |
| #24 | `canAccessFeature` | 권한 판정에 사용자 등급이 필요하다 | 910 |
| #31 | `exportUserDataForGdpr` | 모든 사용자 필드를 아는 곳이 여기뿐이다 | 1,240 |
| #38 | `recalculateLoyaltyTier` | 결제 후 호출되는데 사용자 필드를 수정한다 | 1,620 |
| #41 | `mergeDuplicateAccounts` | 위의 전부를 재사용해야 한다 | 1,800 |

각 커밋의 대안은 "새 파일을 만들고, 필요한 함수를 export하고, import 경로를 정리하는 것"이었다. 그 대안은 매번 더 비쌌다. **God Object(한 클래스가 시스템 상태와 책임 대부분을 쥔 구조)는 나쁜 결정의 결과가 아니라, 각각은 옳았던 결정 40개의 합이다.**

`services/` 디렉터리 전체가 이 상태가 되면 그게 Big Ball of Mud(식별 가능한 구조가 사라진 코드 덩어리)다. 이 이름은 Brian Foote와 Joseph Yoder가 1997년 같은 제목의 논문에서 붙였다. 이들의 관찰 중 가장 자주 인용되지 않는 부분이 핵심이다. Big Ball of Mud는 실패한 아키텍처가 아니라 **가장 널리 쓰이는 아키텍처**이며, 그렇게 된 이유는 그것이 실제로 작동하기 때문이다.

## 경계가 공짜가 아니라, 경계 없음이 공짜였다

1막의 전제를 다시 놓자. 하나의 프로세스, 하나의 DB. 여기서는 모듈 경계를 긋는 데 드는 비용이 전부 선불이고, 긋지 않아서 생기는 비용은 전부 후불이다.

경계를 그으려면 지금 당장 이름을 정해야 한다. `BillingService`인가 `PaymentService`인가, 사용자 등급은 누구 소유인가. 이 질문에 답하려면 도메인이 어느 정도 굳어 있어야 하는데, 커밋 #19 시점의 제품은 그렇지 않았다.

반면 함수를 기존 파일에 붙이는 비용은 0에 수렴한다. import도 필요 없고, 이름 협상도 없고, 이미 열려 있는 트랜잭션과 이미 로드된 사용자 객체를 그대로 쓴다. **같은 프로세스 안에서는 잘못된 경계의 비용이 즉시 청구되지 않는다.** 프로세스가 갈라진 뒤에 같은 실수를 하면 그건 Distributed Monolith가 되고, 그때는 청구서가 배포 시점에 바로 날아온다(9편).

## 응집도와 결합도를 형용사로 말하지 않는 법

"응집도가 낮다"는 말은 반박할 수 없으므로 논쟁을 끝내지 못한다. 측정 가능한 세 가지로 바꾼다.

**LCOM (Lack of Cohesion of Methods).** Chidamber와 Kemerer가 1994년 객체지향 메트릭 모음에서 제시한 지표다. 원형은 단순하다. 클래스의 메서드 쌍을 전부 나열하고, 공유 필드가 하나도 없는 쌍의 수 P와 하나 이상 공유하는 쌍의 수 Q를 세어 `P - Q`(음수면 0)를 쓴다. 이후 변형인 LCOM4는 "메서드-필드 그래프의 연결 요소 개수"로 정의되는데, 실무에서는 이쪽이 직접적이다. **값이 1이면 클래스 하나, 값이 4면 지금 이 클래스는 사실 클래스 4개다.** 위 `UserService`를 이 방식으로 분해하면 인증 / 알림 / 정산 / 데이터 반출이 서로 필드를 거의 공유하지 않는 덩어리로 갈라진다.

**fan-in / fan-out.** 이 모듈을 import하는 모듈 수(fan-in)와 이 모듈이 import하는 모듈 수(fan-out)다. fan-in이 높고 fan-out이 낮으면 안정적인 기반 모듈, 둘 다 높으면 변경이 양방향으로 전파되는 허브다. God Object는 예외 없이 후자다.

**변경 결합도(co-change coupling).** 가장 값싸고 가장 정직한 지표다. 커밋 로그만 있으면 된다. 파일 A와 B가 같은 커밋에 함께 등장한 횟수를 A가 등장한 총 횟수로 나눈다. 커밋 이력에서 설계 문제를 읽어내는 이 접근은 Adam Tornhill이 *Your Code as a Crime Scene*(2015)에서 정리했다.

```bash
# 최근 800개 커밋에서 함께 바뀐 파일 쌍을 센다 (15개 초과 커밋은 제외)
git log -n 800 --name-only --pretty=format:--- \
  | awk '/^---/{if(n>1&&n<15)for(i=1;i<=n;i++)for(j=i+1;j<=n;j++)print f[i]"|"f[j];n=0;next}
         NF{f[++n]=$0}' | sort | uniq -c | sort -rn | head -20
```

한 커밋이 15개 넘는 파일을 건드리면 대개 포맷팅이나 대규모 이동이므로 제외한다. 여기서 상위에 올라오는 쌍이 **파일 경계는 다른데 실제 경계는 같은** 지점이다. 디렉터리가 아무리 깔끔하게 나뉘어 있어도 `orders/service.ts`와 `users/service.ts`가 커밋의 70%에서 함께 바뀐다면, 그 둘 사이의 선은 실제로 존재하지 않는 선이다.

반대 방향으로도 읽어야 한다. 1,800줄 파일 안에서 **서로 다른 커밋에만 등장하는 영역들**이 진짜 경계 후보다. `git log -L`로 줄 범위별 이력을 뽑으면, 6개월 동안 한 번도 같은 커밋에 함께 등장하지 않은 함수 그룹이 드러난다. 그 그룹이 곧 분리 단위다. 이 세 지표는 서로를 검증한다. LCOM4가 가른 덩어리와 변경 결합도가 가른 덩어리가 일치하면 그 경계는 구조와 이력 양쪽에서 확인된 것이고, 어긋나면 아직 관찰이 부족한 것이다.

## 국소 최적해가 어떻게 전역 최악해가 되는가

세 가지 비용이 동시에 오른다. 각각 계산 근거를 붙인다.

**머지 충돌.** 로직이 파일 20개에 분산되어 있고 변경이 대체로 균등하다면, 동시에 열린 두 PR이 같은 파일을 건드릴 확률은 약 1/20 = 5%다. 같은 로직이 파일 하나에 모여 있으면 그 확률은 100%다. **20배.** 여기에 동시 PR 수가 곱해진다. 이 파일을 건드리는 PR이 주당 10건이고 PR 평균 수명이 2일이면 항상 열려 있는 PR은 10 × 2/7 ≈ 2.9건, 충돌 가능 쌍은 C(3,2) = 3쌍이다. 충돌 하나를 푸는 데 15분이면 주당 45분이 사라지고, 이건 기능 개발이 아니라 순수 조정 비용이다.

**테스트 시간.** 단위 테스트가 모듈 하나를 import하면 그 모듈의 import 그래프 전체가 로드된다. `UserService`가 결제 SDK, 메일 클라이언트, 통계 집계를 import하고 있으면 "사용자 이름 변경" 테스트 하나가 결제 SDK를 로드한다. 모듈 로드가 300ms이고 이 파일을 건드리는 테스트 파일이 200개면 60초, 로드가 30ms면 6초다. 이 차이는 하루에 수십 번 반복된다.

**변경 영향 범위.** fan-in이 30인 모듈의 시그니처를 바꾸면 최소 30곳을 확인해야 한다. 타입 시스템이 컴파일 에러로 29곳을 잡아줘도, 런타임 의미가 바뀐 경우는 잡아주지 못한다. "이 사용자 조회에 삭제된 계정을 포함시킨다"는 변경은 타입이 그대로이므로 컴파일러가 침묵하고, 30개 호출 지점을 사람이 하나씩 읽어야 한다. 읽는 데 지점당 4분이면 2시간이고, 이 2시간은 리뷰어가 아니라 작성자 한 사람에게만 청구되므로 대개 생략된다.

세 비용의 공통점은 **줄 수가 아니라 참여자 수에 비례한다**는 것이다. 그래서 같은 1,800줄이 1인 프로젝트에서는 아무 문제도 일으키지 않고 8인 팀에서는 스프린트를 잡아먹는다. God Object는 코드의 속성이 아니라 코드와 조직의 관계다.

> 붙이기의 비용은 이번 커밋에 청구되고, 붙이기의 비용의 합은 다음 분기에 청구된다. 청구 시점이 다르면 사람은 매번 붙이기를 고른다.

## 이음매를 먼저 찾는다

Michael Feathers가 *Working Effectively with Legacy Code*(2004)에서 정의한 이음매(seam)는 **그 자리를 편집하지 않고도 동작을 바꿀 수 있는 지점**이다. 함수 인자, 생성자 파라미터, 모듈 경계가 모두 이음매다. 이음매가 하나도 없는 코드는 테스트할 수 없고, 테스트할 수 없으면 분해할 수 없다.

순서가 중요하다. Strangler Fig(Martin Fowler, 2004)는 프로세스를 새로 띄우는 전략인데, 그 전에 할 일이 프로세스 안에서 경계를 긋는 것이다. **한 프로세스 안에서 지킬 수 없는 경계는 프로세스를 나눠도 지켜지지 않는다.**

Before는 상태와 의존성을 클래스가 전부 쥐고 있어 이음매가 없다.

```ts
// services/user.ts — Before
export class UserService {
  constructor(private db: Pool, private mailer: Mailer, private stripe: Stripe) {}

  async signUp(input: SignUpInput) {
    const dup = await this.db.query('select 1 from users where email=$1', [input.email])
    if (dup.rowCount) throw new Error('duplicate')
    const hash = await bcrypt.hash(input.password, 12)
    const { rows } = await this.db.query(
      'insert into users(email, pw) values($1,$2) returning *', [input.email, hash])
    await this.mailer.send(rows[0].email, 'welcome', { name: rows[0].name })
    await this.applyReferralCredit(rows[0].id, input.referrer) // 정산
    await this.recalculateLoyaltyTier(rows[0].id)              // 등급
    return rows[0]
  }
  // ... applyReferralCredit, recalculateLoyaltyTier, exportUserDataForGdpr, 외 30개
}
```

After는 유스케이스 하나를 함수 하나로 만들고, 필요한 것만 인자로 받는다. 인자가 이음매가 된다.

```ts
// usecases/sign-up.ts — After
type Deps = {
  findByEmail: (email: string) => Promise<User | null>
  insertUser: (email: string, pwHash: string) => Promise<User>
  publish: (e: DomainEvent) => Promise<void>   // 알림·정산·등급은 구독자가 처리
}

export async function signUp(deps: Deps, input: SignUpInput): Promise<User> {
  if (await deps.findByEmail(input.email)) throw new DuplicateEmail(input.email)
  const user = await deps.insertUser(input.email, await bcrypt.hash(input.password, 12))
  await deps.publish({ type: 'UserSignedUp', userId: user.id, referrer: input.referrer })
  return user
}
```

`signUp`의 fan-out은 3이 되고, 테스트는 Stripe도 SMTP도 없이 객체 리터럴 하나로 끝난다. 정산과 등급은 자기 모듈로 옮겨가고, 그 모듈이 언제 실행되는지는 이벤트 이름 하나가 말해준다.

이 분해의 대가는 분명하다. 첫째, 호출 흐름이 더 이상 한 파일에서 읽히지 않는다. `UserSignedUp` 구독자가 어디 있는지는 grep으로 찾아야 한다. 둘째, `Deps` 타입이 늘어나면 그 자체가 새로운 보일러플레이트가 된다. 셋째, 그리고 가장 큰 위험은 **경계를 잘못 그은 채 굳히는 것**이다. 도메인이 확정되기 전에 그은 추상화는 나중에 되돌리기가 God Object보다 어렵다. 잘못 그은 경계를 지우려면 두 모듈을 합치는 게 아니라 세 모듈로 다시 쪼개야 하는 경우가 대부분이기 때문이다.

## 이게 오히려 정답인 경우

1편의 판별 조건 중 "시간축 순손실"이 핵심이다. 시간축이 짧으면 순손실이 성립하지 않는다.

- **수명이 짧은 코드.** 한 번 쓰고 버리는 마이그레이션 스크립트, 이벤트성 캠페인 API. 3주 뒤 삭제될 코드에 경계를 긋는 건 회수되지 않는 투자다.
- **도메인이 불확실한 초기 제품.** 아직 `Order`가 무엇인지 합의되지 않은 시점에 `OrderService`와 `FulfillmentService`를 가르면, 그 경계선은 다음 달에 틀린 것으로 판명될 확률이 높다. 이때는 한 파일에서 뭉쳐 두고 커밋 로그에 변경 결합도가 쌓이기를 기다리는 편이 낫다. **경계는 설계하는 것보다 관찰하는 쪽이 정확하다.**
- **탐색적 프로토타입.** 목적이 "이게 되는지 확인"이라면 구조는 답을 얻는 속도를 늦출 뿐이다.
- **1인 코드베이스.** 위의 머지 충돌 계산에서 동시 PR 수가 1이면 충돌 비용 항이 0으로 떨어진다. 다만 테스트 시간과 변경 영향 범위 항은 그대로 남는다.

경계를 긋기 시작할 신호는 줄 수가 아니다. 같은 파일이 **서로 다른 이유로** 주 3회 이상 변경되고, 그 변경들이 서로 다른 사람에게서 오기 시작할 때다.

## 요약

| 항목 | 내용 |
|---|---|
| 증상 | 한 파일·한 클래스가 무관한 책임 다수를 흡수. LCOM4 > 1, fan-in·fan-out 동시 상승 |
| 출처 | Big Ball of Mud — Brian Foote & Joseph Yoder (1997) |
| 발생 기전 | 경계를 긋는 비용은 선불, 긋지 않는 비용은 후불. 같은 프로세스 안에서는 후불이 보이지 않는다 |
| 측정 | LCOM4(연결 요소 개수), fan-in/fan-out, 커밋 로그 기반 변경 결합도 |
| 비용 | 충돌 확률 20배(1/20 → 1), 테스트 로드 60초 vs 6초, fan-in 수만큼의 변경 확인 |
| 탈출 | 이음매(Michael Feathers, 2004) 확보 → 유스케이스 단위 함수 분해 → 그 다음이 Strangler Fig |
| 탈출의 대가 | 흐름 추적 비용, Deps 보일러플레이트, 성급한 경계를 굳힐 위험 |
| 정답인 경우 | 수명 짧은 코드, 도메인 미확정 초기 제품, 프로토타입, 1인 코드베이스 |

---

**다음 편 — 3편. Anemic Domain Model과 비대해진 Transaction Script**

2편에서 1,800줄 클래스를 함수로 분해했다. 그런데 그 분해를 끝까지 밀면 데이터는 `interface`에, 행위는 `service.ts`에 남는 구조가 된다. Martin Fowler가 2003년에 이것을 Anemic Domain Model이라고 부르며 안티패턴으로 지목했지만, 이 지목은 지금도 합의되지 않았다. 3편은 양쪽 논거를 모두 놓고, 불변식이 새어 나가는 지점을 TypeScript의 타입 시스템으로 막는 방법까지 간다.
