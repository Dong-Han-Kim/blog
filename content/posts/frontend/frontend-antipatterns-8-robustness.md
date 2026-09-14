---
# 📌 기본 메타데이터
title: '프론트엔드 안티패턴 (8) — 견고함: 거짓 안정감을 만드는 것들'
date: '2026-09-14'
category: 'frontend'
tags: ['Error Handling', 'TypeScript', 'Testing', 'React', 'Anti-Pattern']
description: '에러 바운더리 부재로 인한 흰 화면, catch로 에러 삼키기, as와 any가 만드는 거짓 안정감, 런타임 검증 없는 API 신뢰, 그리고 깨지는데 아무도 안 읽는 테스트.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 안티패턴'
seriesOrder: 8

# 📚 SEO용
keywords: ['Error Handling', 'TypeScript', 'Testing', 'React', 'Anti-Pattern', '프론트엔드 안티패턴']
---

# 프론트엔드 안티패턴 (8) — 견고함

이 편의 주제는 **거짓 안정감**입니다.

타입스크립트를 쓰고 있으니 안전하다고 믿습니다. 테스트가 800개 통과하니 괜찮다고 믿습니다. `try/catch`를 붙였으니 에러 처리를 했다고 믿습니다. 셋 다 실제로는 아무것도 보장하지 않는 경우가 많습니다.

---

# 1부. 에러 처리

## 에러 바운더리 없음 → 흰 화면

React는 렌더 중 예외가 발생하면 **트리 전체를 언마운트합니다.** 에러 바운더리가 하나도 없으면 결과는 완전히 빈 화면입니다.

```tsx
// 어딘가에서 undefined에 접근
<div>{user.profile.name}</div>   // profile이 없으면 전체 앱이 사라진다
```

사용자는 아무 설명 없는 흰 페이지를 보고, 새로고침해도 같으면 떠납니다. 그리고 **그 에러는 어디에도 기록되지 않습니다.**

### 경계를 어디에 둘 것인가

에러 바운더리 하나를 최상단에 두는 것은 없는 것보다 낫지만 충분하지 않습니다. **세 층으로 두는 것이 실용적입니다.**

```tsx
// 1층 — 앱 전역 (최후의 방어선)
<RootErrorBoundary>
  <App />
</RootErrorBoundary>

// 2층 — 라우트 단위 (다른 페이지로는 갈 수 있게)
// Next.js App Router는 error.tsx 파일로 자동 적용
// app/dashboard/error.tsx

// 3층 — 위젯 단위 (차트 하나가 죽어도 나머지는 산다)
<ErrorBoundary fallback={<WidgetError />}>
  <RevenueChart />
</ErrorBoundary>
```

**3층이 핵심입니다.** 5편의 "실패를 격리하라"와 같은 원칙입니다. 대시보드에서 위젯 하나가 실패했다고 페이지 전체가 죽으면 안 됩니다.

```tsx
// app/dashboard/error.tsx
'use client';

export default function Error({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);      // 반드시 기록한다
  }, [error]);

  return (
    <div role="alert">
      <h2>이 페이지를 불러오지 못했습니다</h2>
      <button onClick={reset}>다시 시도</button>
      {error.digest && <p className="text-xs">오류 코드: {error.digest}</p>}
    </div>
  );
}
```

**`digest`를 화면에 노출하는 이유:** 사용자가 문의할 때 이 코드를 말하면 서버 로그에서 정확한 에러를 찾을 수 있습니다. 스택 트레이스를 보여주는 것과는 전혀 다릅니다.

### 에러 바운더리가 잡지 못하는 것

이걸 모르면 "바운더리를 넣었는데 왜 안 잡히지?"로 시간을 씁니다.

| 잡힘 | 안 잡힘 |
|---|---|
| 렌더 중 예외 | **이벤트 핸들러** 안의 예외 |
| 생명주기/이펙트 중 예외 | **비동기 콜백** (`setTimeout`, `.then`) |
| 자식 컴포넌트의 예외 | 서버 사이드 렌더링 (별도 처리) |
| | 에러 바운더리 자기 자신의 예외 |

```tsx
// 🔴 바운더리가 못 잡는다 — 직접 처리해야 함
<button onClick={async () => { await save(); }}>저장</button>

// ✅
<button onClick={async () => {
  try { await save(); }
  catch (e) { reportError(e); toast.error(toUserMessage(e).title); }
}}>저장</button>
```

### 전역 안전망

바운더리 밖에서 새는 에러를 잡습니다.

```typescript
// app/providers.tsx
useEffect(() => {
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}, []);
```

**`unhandledrejection`을 등록하지 않으면 `await`을 빠뜨린 Promise의 실패가 완전히 사라집니다.**

---

## `catch`로 에러 삼키기

```typescript
// 🔴 가장 흔한 형태
try {
  await save();
} catch (e) {
  console.error(e);
}
```

**콘솔은 사용자가 안 봅니다. 그리고 프로덕션에서는 개발자도 안 봅니다.** 사용자는 저장이 성공한 줄 알고 창을 닫습니다.

```typescript
// 🔴 더 나쁜 형태
try { await save(); } catch {}
```

### 에러 처리의 세 요소

에러를 잡았으면 **반드시 셋 다** 해야 합니다.

```typescript
try {
  await save();
} catch (error) {
  reportError(error, { context: 'order-save', orderId });   // 1. 기록
  toast.error('저장에 실패했습니다. 다시 시도해 주세요');       // 2. 알림
  setCanRetry(true);                                        // 3. 복구 경로
}
```

셋 중 하나라도 빠지면 미완성입니다.

### 삼켜도 되는 유일한 경우

```typescript
// 의도적으로 무시하는 것임을 코드로 표현한다
try {
  await analytics.track('page_view');
} catch {
  // 분석 실패는 사용자 경험에 영향을 주면 안 된다. 의도적 무시.
}
```

**"왜 무시하는지"가 주석으로 있어야 합니다.** 1편의 "왜에 답할 수 있는가"와 같은 기준입니다.

---

## 과도한 로깅과 개인정보 유출

반대 방향의 안티패턴도 있습니다.

```typescript
// 🔴 전체 객체를 그대로 기록 — 개인정보가 로그 서비스로 전송된다
reportError(error, { user, formData, request });
// user에 이메일, 전화번호, 주소가 들어있다
```

```typescript
// ✅ 필요한 식별자만
reportError(error, {
  userId: user.id,              // 식별자만
  orderId,
  formFields: Object.keys(formData),   // 값이 아니라 필드 이름만
});
```

에러 추적 서비스를 쓴다면 **전송 직전에 마스킹하는 훅**을 반드시 설정하세요. 로그는 한 번 보내면 회수할 수 없습니다.

---

# 2부. 타입의 거짓 안정감

## `as`는 검증이 아니다

```typescript
const user = await res.json() as User;
```

**이 한 줄의 의미는 "컴파일러야, 확인하지 말고 믿어"입니다.** 서버가 실제로 무엇을 줬는지는 아무도 확인하지 않았습니다.

그리고 이렇게 되면 타입스크립트는 **거짓 안정감만 제공합니다.** `user.profile.name`을 자신 있게 쓰지만 런타임에 `profile`이 없을 수 있습니다.

### `as`를 써도 되는 경우

```typescript
// 1. 타입을 좁힐 수 없는 외부 API의 반환값을 검증 후 단언
const parsed = UserSchema.parse(raw);   // 검증했으므로 as가 필요 없다

// 2. DOM 타입 (개발자가 구조를 확신할 수 있음)
const input = e.target as HTMLInputElement;

// 3. 테스트의 부분 목 객체
const mockUser = { id: '1' } as User;
```

**1번이 정상 경로입니다. 검증하면 `as`가 필요 없어집니다.**

### `satisfies` — 타입 검사는 받되 추론은 유지

```typescript
// 🔴 as — 검사를 포기한다
const config = { retries: 3, timeuot: 5000 } as Config;   // 오타를 못 잡는다

// ✅ satisfies — 검사는 받고, 구체 타입은 유지한다
const config = { retries: 3, timeout: 5000 } satisfies Config;
//                            ^^^^^^^ 오타면 컴파일 에러
```

```typescript
const ROUTES = {
  home: '/',
  orders: '/orders',
} satisfies Record<string, string>;

type Route = typeof ROUTES[keyof typeof ROUTES];   // '/' | '/orders' — 리터럴 유지
// as Record<string, string> 이었다면 string으로 넓어졌을 것
```

---

## `any`의 전염

```typescript
// 🔴 하나의 any가 주변으로 퍼진다
function process(data: any) {
  return data.items.map((i: any) => i.value);   // 반환 타입도 any
}
const result = process(x);    // result: any
result.anything.at.all;       // 컴파일 통과
```

**`any`는 그 지점에서 타입 시스템을 끄는 게 아니라, 그 값이 흘러가는 모든 경로에서 끕니다.**

```typescript
// ✅ 모르는 값은 unknown — 쓰려면 좁혀야 한다
function process(data: unknown) {
  if (!isDataShape(data)) throw new Error('예상치 못한 형태');
  return data.items.map(i => i.value);   // 여기서는 타입이 확정됨
}
```

```javascript
// 린트로 확산을 막는다
'@typescript-eslint/no-explicit-any': 'error',
'@typescript-eslint/no-unsafe-assignment': 'error',
'@typescript-eslint/no-unsafe-member-access': 'error',
'@typescript-eslint/no-unsafe-return': 'error',
```

---

## non-null 단언(`!`)의 남용

```typescript
// 🔴 "여기는 절대 null이 아니야"라고 주장하지만 근거가 없다
const el = document.getElementById('root')!;
const user = users.find(u => u.id === id)!;
setUser(data!.user!.profile!);
```

`!`가 많은 코드는 **런타임에 `Cannot read properties of undefined`를 던지는 코드**입니다. 타입스크립트는 그걸 막지 않기로 약속했을 뿐입니다.

```typescript
// ✅ 근거를 코드로 만든다
const el = document.getElementById('root');
if (!el) throw new Error('#root 요소를 찾을 수 없습니다');   // 명확한 에러 메시지

const user = users.find(u => u.id === id);
if (!user) return <NotFound />;                            // 처리 경로
```

```json
// 배열 인덱스 접근도 안전하게
{ "compilerOptions": { "noUncheckedIndexedAccess": true } }
// rows[0]의 타입이 Row가 아니라 Row | undefined가 된다
```

---

## 옵셔널 체이닝으로 에러 은폐

```typescript
// 🔴 값이 없는 게 정상인지 버그인지 구분이 안 된다
const name = data?.user?.profile?.name ?? '';
```

이 코드는 **"데이터가 없어도 빈 문자열로 조용히 넘어간다"** 는 뜻입니다. 그런데 `data`가 없는 게 로딩 중인 정상 상태인지, API가 깨진 것인지 알 수 없습니다. 화면에는 빈 칸이 뜨고 아무 로그도 없습니다.

```typescript
// ✅ 상태를 구분한다 (2편의 판별 유니온)
if (state.status === 'loading') return <Skeleton />;
if (state.status === 'error') return <ErrorView />;
const name = state.data.user.profile.name;   // 여기서는 있다고 확신할 수 있다
```

**옵셔널 체이닝은 "정말로 선택적인 필드"에 쓰는 것입니다.** 로딩 상태를 얼버무리는 데 쓰면 버그가 조용해집니다.

---

## 런타임 검증 없이 API 응답 신뢰

가장 큰 구멍입니다. **타입스크립트의 타입은 컴파일 후 사라집니다.** 네트워크 경계에서 오는 데이터는 어떤 모양이든 될 수 있습니다.

```typescript
// 🔴 서버가 필드명을 바꾸면 런타임에 조용히 깨진다
type User = { id: string; name: string; email: string };
const user = await res.json() as User;
```

```typescript
// ✅ 경계에서 한 번 검증
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  createdAt: z.coerce.date(),        // 문자열 → Date 변환까지
});

export type User = z.infer<typeof UserSchema>;   // 타입은 스키마에서 파생

export async function getUser(id: string): Promise<User> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new HttpError(res.status, await res.text());

  const json: unknown = await res.json();
  const parsed = UserSchema.safeParse(json);

  if (!parsed.success) {
    // 계약 위반을 명확히 기록한다 — 서버 배포 사고를 즉시 발견할 수 있다
    reportError(new Error('API 응답이 스키마와 다릅니다'), {
      endpoint: `/api/users/${id}`,
      issues: parsed.error.issues,
    });
    throw new ContractError(parsed.error);
  }
  return parsed.data;
}
```

### 어디에 검증을 둘 것인가

**경계 한 곳에만 둡니다.** 모든 함수에서 검증하면 비용만 늘고 코드가 지저분해집니다.

```
[네트워크] → 검증 ✅ → [앱 내부: 타입을 신뢰] → [렌더]
[localStorage] → 검증 ✅ → ...
[URL 파라미터] → 검증 ✅ → ...
[사용자 입력] → 검증 ✅ → ...
```

**`localStorage`와 URL 파라미터를 잊기 쉽습니다.** 둘 다 사용자가 자유롭게 조작할 수 있고, 이전 버전의 앱이 저장한 낡은 형태일 수도 있습니다.

```typescript
// 🔴 이전 버전 형식이 남아있으면 런타임 에러
const prefs = JSON.parse(localStorage.getItem('prefs')!) as Prefs;

// ✅
function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem('prefs');
    if (!raw) return DEFAULT_PREFS;
    const parsed = PrefsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;   // 손상된 데이터도 앱을 죽이면 안 된다
  }
}
```

---

# 3부. 테스트

## 깨지는데 아무도 안 읽는 테스트

```tsx
// 🔴 스냅샷 도배
it('renders correctly', () => {
  expect(render(<OrderTable rows={rows} />)).toMatchSnapshot();
});
```

**무엇을 보장하는지 아무도 설명할 수 없는 테스트입니다.** 클래스 이름 하나 바꾸면 40개가 깨지고, 사람들은 내용을 안 보고 `-u`로 갱신합니다. 그 순간부터 그 테스트는 **아무것도 막지 않으면서 CI 시간만 씁니다.**

### 좋은 테스트의 판별 기준

> **리팩터링에는 안 깨지고, 버그에는 깨진다.**

이 기준으로 보면 무엇이 잘못됐는지 명확해집니다.

| | 리팩터링에 깨지나 | 버그를 잡나 |
|---|---|---|
| 스냅샷 | **깨짐** | 잘 못 잡음 |
| 내부 상태 검사 | **깨짐** | 잘 못 잡음 |
| 사용자 관점 동작 검사 | 안 깨짐 | **잡음** |

```tsx
// 🔴 구현 세부 — 훅 이름이 바뀌면 깨진다
expect(wrapper.find('OrderRow').at(0).state('isEditing')).toBe(true);

// ✅ 사용자가 보는 것 — 구현이 바뀌어도 안 깨진다
await user.click(screen.getByRole('button', { name: '수정' }));
expect(screen.getByRole('textbox', { name: '주문명' })).toHaveValue('기존 이름');
```

**`getByRole`을 쓰면 접근성 검증이 덤으로 따라옵니다.** `getByTestId`로만 찾는 테스트는 통과하지만, 그 버튼을 스크린 리더가 못 읽어도 모릅니다.

---

## 모킹 과잉

```typescript
// 🔴 전부 모킹 — 무엇을 테스트하는지 불분명해진다
vi.mock('./api');
vi.mock('./hooks/useUser');
vi.mock('./hooks/useOrders');
vi.mock('./utils/format');
vi.mock('next/navigation');
```

모킹이 많을수록 **테스트가 실제 코드가 아니라 모킹 설정을 검증하게 됩니다.** 그리고 실제 구현이 바뀌어도 모킹은 그대로라 테스트는 계속 통과합니다 — 가장 나쁜 실패 모드입니다.

```typescript
// ✅ 네트워크 경계만 모킹 (MSW)
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get('/api/orders', () => HttpResponse.json([{ id: '1', name: '주문 1' }]))
);
```

**경계에서 한 겹만 모킹하면** 그 안쪽 코드는 전부 실제로 실행됩니다. 훅, 상태 관리, 렌더가 모두 진짜로 동작하므로 테스트가 실제를 반영합니다.

---

## 커버리지 숫자를 목표로 삼기

```
커버리지 80% 달성! 🎉
```

**커버리지는 "실행된 줄"을 셀 뿐 "검증된 동작"을 세지 않습니다.**

```typescript
// 커버리지 100%인데 아무것도 검증하지 않는 테스트
it('works', () => {
  render(<ComplexComponent />);
  expect(true).toBe(true);
});
```

그리고 커버리지 목표가 있으면 **쉬운 곳을 채우게 됩니다.** 순수 유틸 함수는 100%가 되고, 정작 복잡한 상태 전이와 에러 처리는 0%로 남습니다.

**커버리지는 목표가 아니라 진단 도구로 쓰세요.** "이 중요한 모듈이 20%네"를 발견하는 데는 유용하고, "전사 80% 달성"은 무의미합니다.

---

## 테스트하기 어렵게 짜기

```typescript
// 🔴 시간에 의존 — 테스트에서 제어 불가
function isExpired(order: Order) {
  return Date.now() > order.expiresAt;
}

// ✅ 주입 가능하게
function isExpired(order: Order, now = Date.now()) {
  return now > order.expiresAt;
}
// 테스트: isExpired(order, new Date('2026-01-01').getTime())
```

```typescript
// 🔴 랜덤에 의존
const id = crypto.randomUUID();

// ✅ 생성기를 주입하거나 경계 밖으로
function createOrder(data: OrderInput, genId = crypto.randomUUID) { /* ... */ }
```

**"테스트하기 어렵다"는 대개 설계 신호입니다.** 의존성이 숨어 있거나, 함수가 너무 많은 일을 하거나, 부수효과가 섞여 있다는 뜻입니다.

---

## 테스트 간 상태 누수

```typescript
// 🔴 모듈 전역 상태가 테스트 사이에 남는다
// store.ts
export const cartStore = createStore();   // 모든 테스트가 공유

// 결과: 테스트를 단독으로 돌리면 통과, 전체로 돌리면 실패
//       순서를 바꾸면 결과가 달라짐
```

```typescript
// ✅ 테스트마다 초기화
beforeEach(() => {
  cartStore.setState(initialState, true);
  queryClient.clear();
  localStorage.clear();
});
```

**"내 컴퓨터에서는 통과하는데 CI에서 실패"의 상당수가 이것입니다.** 테스트 러너의 실행 순서나 병렬 처리가 다르기 때문입니다.

---

## 테스트 피라미드의 양극단

```
🔴 유닛 테스트만 800개
→ 각 부품은 완벽하지만 조립하면 안 돌아감

🔴 E2E 테스트만 50개
→ 느리고, 불안정하고(flaky), 실패해도 어디가 문제인지 모름
```

**실용적 배분:**

| 종류 | 비중 | 대상 |
|---|---|---|
| 유닛 | 많이 | 순수 로직 — 계산, 변환, 검증, 상태 전이 |
| 통합 | **가장 중요** | 컴포넌트 + 훅 + API 모킹 (사용자 흐름 단위) |
| E2E | 적게 | 핵심 경로만 — 로그인, 결제, 주문 생성 |

**프론트엔드에서는 통합 테스트가 투자 대비 효과가 가장 큽니다.** 컴포넌트와 훅과 상태가 함께 동작하는 지점이 실제 버그가 사는 곳이기 때문입니다.

---

## 요약

| 안티패턴 | 만드는 거짓 안정감 | 해법 |
|---|---|---|
| 에러 바운더리 없음 | "에러 나면 알겠지" | 3층 경계 + 전역 리스너 |
| `catch` 삼키기 | "처리했다" | 기록 + 알림 + 복구 경로 |
| 전체 객체 로깅 | "많이 기록할수록 좋다" | 식별자만, 마스킹 |
| `as` 단언 | "타입이 맞다" | 런타임 검증 → `satisfies` |
| `any` | "일단 넘어가자" | `unknown` + 좁히기, 린트 |
| `!` 남용 | "여긴 없을 리 없다" | 명시적 검사 + 처리 경로 |
| 옵셔널 체이닝 은폐 | "안전하게 처리했다" | 상태를 판별 유니온으로 |
| 런타임 검증 없음 | "타입스크립트가 막아준다" | 경계에서 스키마 검증 |
| 스냅샷 도배 | "커버리지가 높다" | 사용자 관점 동작 검사 |
| 모킹 과잉 | "테스트가 통과한다" | 네트워크 경계만 모킹 |
| 커버리지 목표 | "80% 달성" | 진단 도구로만 사용 |
| 테스트 간 누수 | "로컬에선 통과한다" | `beforeEach` 초기화 |

**관통하는 원리 세 개**

1. **타입은 컴파일 후 사라진다.** 경계를 넘어오는 모든 데이터는 런타임 검증이 필요합니다.
2. **에러를 잡았으면 기록·알림·복구 세 가지를 하라.** 하나라도 빠지면 삼킨 것과 같습니다.
3. **좋은 테스트는 리팩터링에 안 깨지고 버그에 깨진다.** 이 기준에 안 맞는 테스트는 세금입니다.

---

## 다음 편

**9편 — 조직과 프로세스의 안티패턴 (완결)**

코드 안에 없지만 코드를 만드는 것들입니다. Cargo Cult, 이력서 주도 개발, "임시" 코드가 영원해지는 구조, 리팩터링 예산이 없는 팀, 그리고 기술부채가 복리로 늘어나는 메커니즘. 마지막으로 시리즈 전체를 하나의 체크리스트로 정리합니다.
