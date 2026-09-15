---
# 📌 기본 메타데이터
title: '효율적인 React 2편 — 상태 설계: 적게, 올바른 자리에, 불가능한 조합 없이'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'State Management', 'Derived State', 'useReducer', 'URL State']
description: 'state는 렌더의 원인이자 버그의 출처다. 최소 상태를 가려내는 세 질문, 파생값 계산, 상태 5분류와 각자의 자리, Colocation, 불가능한 상태를 타입으로 막는 법.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 2

# 📚 SEO용
keywords: ['React', 'State Management', 'Derived State', 'useReducer', 'URL State', '효율적인 React']
---

# 효율적인 React 2편 — 상태 설계

[1편](/posts/efficient-react-1-cost-model)에서 렌더를 일으키는 원인 중 첫 번째가 state 변경이라고 했다. 이 편의 전제는 간단하다.

> **state 하나는 렌더 원인 하나이고, 동기화해야 할 대상 하나다.**

state를 줄이면 렌더 비용과 유지 비용이 함께 줄어든다. 이 편은 "무엇을 state로 둘 것인가", "그 state를 어디에 둘 것인가", "state를 어떤 모양으로 둘 것인가"를 순서대로 다룬다.

---

## 1. state의 조합 수는 곱으로 늘어난다

```tsx
const [isLoading, setIsLoading] = useState(false);
const [isError, setIsError] = useState(false);
const [isSuccess, setIsSuccess] = useState(false);
```

boolean 세 개는 2³ = 8가지 조합을 만든다. 그중 의미 있는 조합은 "대기 / 로딩 / 실패 / 성공" 넷뿐이다. 나머지 넷(`isLoading && isError` 등)은 **표현은 가능하지만 존재해서는 안 되는 상태**다. 이 상태들은 테스트에서 잘 드러나지 않고, 핸들러 하나가 `setIsLoading(false)`를 빠뜨리는 순간 화면에 나타난다.

state를 설계할 때 확인할 것은 두 가지다.

1. **개수**: 정말 state여야 하는 값만 state인가?
2. **모양**: 표현 가능한 조합이 의미 있는 조합과 일치하는가?

---

## 2. 무엇이 state인가: 세 가지 질문

어떤 값을 state로 만들기 전에 순서대로 묻는다. 하나라도 "예"면 state가 아니다.

| 질문 | "예"일 때 |
|---|---|
| 1. 시간이 지나도 변하지 않는가? | 상수. 모듈 스코프에 둔다. |
| 2. 부모가 props로 넘겨주는가? | props를 그대로 쓴다. 복사하지 않는다. |
| 3. 기존 state나 props로 계산할 수 있는가? | 렌더 중에 계산한다(Derived State). |

세 질문을 통과한 값만 state다. 대부분의 과잉 state는 3번에서 걸린다.

---

## 3. Derived State: 계산할 수 있으면 계산한다

### 3-1. 필터 결과를 state로 두는 구조

```tsx
// ❌ 파생값을 state로 복사
function ProductList({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState(products);

  useEffect(() => {
    setFiltered(products.filter(p => p.name.includes(query)));
  }, [products, query]);

  return (/* filtered 렌더 */);
}
```

이 코드의 비용은 세 가지다.

1. **렌더가 두 번 일어난다.** `query` 변경 → 렌더(이전 `filtered`로) → 커밋 → Effect 실행 → `setFiltered` → 다시 렌더.
2. **한 프레임 동안 화면이 틀린다.** 첫 렌더에서 `query`는 새 값인데 `filtered`는 이전 값이다. 입력창과 목록이 순간적으로 어긋난다.
3. **진실의 원천이 둘이다.** `products`와 `filtered`가 따로 존재하므로, 누군가 `setFiltered`를 다른 곳에서 호출하면 둘이 영구히 어긋난다.

```tsx
// ✅ 렌더 중 계산
function ProductList({ products }: { products: Product[] }) {
  const [query, setQuery] = useState('');
  const filtered = products.filter(p => p.name.includes(query));
  return (/* filtered 렌더 */);
}
```

렌더 한 번, 어긋나는 프레임 없음, 진실의 원천 하나.

> 실행 검증(React 19): 부모의 `items`를 한 번 바꿨을 때 Effect로 동기화한 컴포넌트는 2회, 렌더 중 계산한 컴포넌트는 1회 렌더됐다.

### 3-2. 계산이 무거울 때

필터링 대상이 수만 건이거나 정렬·그룹핑이 겹쳐서 계산 자체가 무거울 때만 캐시를 붙인다.

```tsx
const filtered = useMemo(
  () => products.filter(p => p.name.includes(query)),
  [products, query],
);
```

순서가 중요하다. **먼저 state를 제거하고 계산으로 바꾼 다음, 측정해서 무거울 때만 캐시한다.** React Compiler를 쓰는 프로젝트라면 이 캐시도 컴파일러가 자동으로 넣는다(3편). 어느 경우든 "state + Effect"는 답이 아니다.

`useMemo`가 필요한지 판단하는 기준은 대략 이렇다. `console.time`으로 감싸서 CPU 스로틀링 환경에서 **1ms 이상** 걸리면 캐시를 고려한다. 그보다 가벼우면 의존성 비교 비용과 큰 차이가 없다.

### 3-3. 선택된 항목은 객체가 아니라 ID로 저장한다

```tsx
// ❌ 선택된 객체를 복사
const [items, setItems] = useState<Item[]>(initial);
const [selected, setSelected] = useState<Item | null>(null);

// items 안의 항목 이름을 수정해도 selected는 옛 객체를 들고 있다
```

```tsx
// ✅ ID만 state, 객체는 계산
const [items, setItems] = useState<Item[]>(initial);
const [selectedId, setSelectedId] = useState<string | null>(null);
const selected = items.find(i => i.id === selectedId) ?? null;
```

`selected` 객체를 따로 state로 두면 `items`가 바뀔 때마다 `selected`도 갱신해야 한다. ID로 두면 동기화할 대상 자체가 없다. 선택된 항목이 삭제되면 `selected`는 자동으로 `null`이 된다.

같은 원리로, "선택된 개수", "전체 선택 여부", "합계 금액"도 모두 계산값이다.

```tsx
const selectedCount = items.filter(i => checkedIds.has(i.id)).length;
const allChecked = items.length > 0 && selectedCount === items.length;
```

---

## 4. props를 state로 복사하지 않는다

```tsx
// ❌ props → state 복사
function ProfileForm({ user }: { user: User }) {
  const [name, setName] = useState(user.name);
  // user가 바뀌어도 name은 처음 값 그대로
}
```

`useState(initial)`의 인자는 **첫 렌더에서만** 사용된다. 부모가 다른 `user`를 넘겨도 `name`은 바뀌지 않는다. 이걸 고치려고 Effect로 동기화하면 3-1의 문제(이중 렌더, 어긋난 프레임)가 그대로 생긴다.

이 코드가 실제로 원하는 동작은 둘 중 하나다. 어느 쪽인지 먼저 정한다.

### 경우 A. props를 그대로 표시하고 싶다

state가 필요 없다. `user.name`을 바로 쓴다.

### 경우 B. props는 "초기값"이고, 사용자가 편집한다

이름으로 의도를 드러내고, 대상이 바뀌면 컴포넌트를 **리셋**한다.

```tsx
function ProfileForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  // ...
}

// 부모: 편집 대상이 바뀌면 key로 리셋
<ProfileForm key={user.id} initialName={user.name} />
```

`key`가 바뀌면 React는 이전 컴포넌트를 언마운트하고 새로 마운트한다. 새 인스턴스의 `useState`는 새 초기값을 받는다. **동기화 코드가 한 줄도 없다.**

> 실행 검증: `key={userId}`로 렌더한 편집기에 `'hello'`를 입력한 뒤 `userId`를 바꾸자 draft state가 `''`로 초기화됐다.

### 경우 C. props 변경 시 state의 일부만 조정해야 한다 (드묾)

리셋이 너무 과할 때(예: 목록이 바뀌면 선택만 해제하고 스크롤 상태 등은 유지)는 렌더 중에 이전 값과 비교해서 조정할 수 있다.

```tsx
function List({ items }: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prevItems, setPrevItems] = useState(items);

  if (items !== prevItems) {
    setPrevItems(items);
    setSelectedId(null);   // 렌더 중 set → React가 자식 렌더 전에 즉시 다시 실행
  }
  // ...
}
```

Effect보다는 낫지만 읽기 어렵다. 먼저 "ID로 저장하고 계산하면 조정 자체가 필요 없는가?"를 확인한다. 위 예라면 `items.find(i => i.id === selectedId)`로 계산해서, 없으면 선택 없음으로 처리하는 편이 대부분 더 간단하다.

---

## 5. 상태의 다섯 가지 종류와 각자의 자리

"상태 관리 라이브러리를 무엇으로 할까"라는 질문은 대부분 순서가 틀렸다. 먼저 상태를 종류별로 나누면, 전역 스토어에 남는 것은 생각보다 적다.

| 종류 | 진실의 원천 | 알맞은 자리 | 잘못 둔 신호 |
|---|---|---|---|
| **서버 상태** | 서버 DB | 서버 컴포넌트, TanStack Query·SWR 같은 서버 캐시 | `useState` + `useEffect(fetch)`, 전역 스토어에 API 응답 복사 |
| **URL 상태** | 주소창 | `searchParams`, 경로 파라미터 | 새로고침하면 필터가 사라짐, 링크 공유 불가 |
| **폼 상태** | 입력 필드 | 비제어 입력 + `FormData`, 폼 라이브러리, Actions | 키 입력마다 폼 전체 렌더 |
| **UI 로컬 상태** | 컴포넌트 | 그 컴포넌트의 `useState` | 모달 열림 여부가 전역 스토어에 있음 |
| **전역 클라이언트 상태** | 브라우저 세션 | Context(드물게 바뀌는 값), 외부 스토어(자주 바뀌는 값) | 위 네 종류가 섞여 들어와 스토어가 비대함 |

### 5-1. 서버 상태는 "상태"가 아니라 "캐시"다

서버 데이터를 `useState`에 넣는 순간, 클라이언트가 **서버 데이터의 복사본을 소유**하게 된다. 복사본은 다음 질문에 모두 답해야 한다.

- 언제 오래된 데이터로 볼 것인가?
- 같은 데이터를 쓰는 다른 컴포넌트와 어떻게 공유하나?
- 수정 후 어떤 복사본을 무효화하나?
- 요청이 겹치면 어느 응답을 믿나(Race Condition)?
- 창에 다시 포커스가 오면 다시 가져오나?

이 질문들에 답하는 코드를 직접 짜면 작은 캐시 라이브러리를 새로 만드는 셈이다. 그래서 서버 상태는 **캐시 계층에 위임**한다.

- Next.js App Router라면 1순위는 **서버 컴포넌트에서 직접 읽기**다. 클라이언트에 복사본이 생기지 않는다.
- 클라이언트에서 읽어야 한다면(무한 스크롤, 실시간성, 사용자 상호작용에 따른 조회) 서버 캐시 라이브러리를 쓴다.

```tsx
// 클라이언트에서 서버 상태를 읽을 때
function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: ({ signal }) => fetchProduct(id, { signal }),
    staleTime: 60_000,
  });
}
```

`queryKey`가 캐시의 주소 역할을 한다. 같은 키를 쓰는 컴포넌트는 요청 하나를 공유하고, 수정 후에는 키 단위로 무효화한다. 자세한 흐름은 5편에서 다룬다.

### 5-2. URL 상태: 공유되고 새로고침에 살아남아야 하는 값

필터, 정렬, 페이지 번호, 선택된 탭, 검색어처럼 <strong>"이 화면을 링크로 보내면 상대도 같은 화면을 봐야 하는 값"</strong>은 URL에 둔다.

```tsx
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

function SortSelect() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sort = params.get('sort') ?? 'latest';   // URL이 진실의 원천

  function onChange(next: string) {
    const sp = new URLSearchParams(params);
    sp.set('sort', next);
    sp.delete('page');                            // 정렬 바뀌면 페이지 초기화
    router.replace(`${pathname}?${sp}`, { scroll: false });
  }

  return (/* select */);
}
```

URL에 두면 새로고침, 뒤로 가기, 링크 공유, 서버 컴포넌트에서의 조회가 모두 공짜로 따라온다. `useState`에 두고 URL과 동기화하면 진실의 원천이 두 개가 된다.

기준은 "뒤로 가기를 눌렀을 때 이 값이 이전으로 돌아가야 하는가?"다. 탭 전환은 대개 그렇고, 드롭다운 열림 여부는 아니다. 검색 입력처럼 키 입력마다 바뀌는 값은 `push` 대신 `replace`를 쓰고, 입력은 로컬 state로 즉시 반영하면서 URL 갱신은 transition이나 디바운스로 늦춘다(6편).

### 5-3. 폼 상태: 모든 입력을 제어할 필요는 없다

```tsx
// ❌ 필드마다 state → 키 입력마다 폼 전체 렌더
const [title, setTitle] = useState('');
const [body, setBody] = useState('');
const [tags, setTags] = useState('');
```

제출 시점에만 값이 필요하다면 입력 필드가 이미 진실의 원천이다. 비제어 입력과 `FormData`를 쓴다.

```tsx
function PostForm() {
  const [state, formAction, isPending] = useActionState(createPost, { error: null });

  return (
    <form action={formAction}>
      <input name="title" required />
      <textarea name="body" />
      <button disabled={isPending}>저장</button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

async function createPost(prev: { error: string | null }, formData: FormData) {
  const title = String(formData.get('title') ?? '');
  // 검증 → 서버 호출 → 결과 반환
  return { error: null };
}
```

입력 중 렌더는 0회다. 제어 컴포넌트가 필요한 경우는 따로 있다.

- 입력값에 따라 **즉시** 다른 UI가 바뀐다(글자 수 표시, 실시간 검증, 조건부 필드).
- 입력값을 **변형**해야 한다(전화번호 하이픈 자동 삽입).

이때도 해당 필드만 제어하거나, 그 필드와 파생 UI를 작은 컴포넌트로 분리해서 렌더 범위를 좁힌다. 필드가 많고 검증 규칙이 복잡하면 폼 라이브러리가 이 문제(필드 단위 구독)를 이미 풀어 두었다.

### 5-4. 전역 클라이언트 상태에 남는 것

앞의 네 종류를 걸러내면 전역에 남는 것은 보통 이 정도다.

- 테마, 언어 설정
- 로그인 세션 요약(사용자 ID, 권한). 프로필 상세는 서버 상태다.
- 여러 화면에 걸친 임시 작업(다단계 마법사 진행 상태, 오프라인 편집 버퍼)
- 토스트·알림 큐

**드물게 바뀌는 값**은 Context로 충분하다. **자주 바뀌고 일부만 구독해야 하는 값**은 외부 스토어와 selector를 쓴다(3편).

---

## 6. 어디에 둘 것인가: Colocation

state의 종류를 정했으면 위치를 정한다. 규칙은 하나다.

> **state는 그 state를 읽거나 쓰는 컴포넌트들의 가장 가까운 공통 조상에 둔다. 그보다 위로 올리지 않는다.**

```
Page
├─ Header
├─ Sidebar
│   └─ FilterPanel     ← 필터 열림 여부를 쓰는 곳
└─ Content
    ├─ Toolbar         ← 정렬 값을 쓰는 곳
    └─ Table           ← 정렬 값을 쓰는 곳
```

- 필터 패널 열림 여부: `FilterPanel` 안에 둔다.
- 정렬 값: `Toolbar`와 `Table`의 공통 조상인 `Content`에 둔다. `Page`에 둘 이유가 없다. (URL 상태라면 URL에 둔다.)

"나중에 다른 곳에서도 쓸 것 같아서" 미리 `Page`나 전역에 올리면, 그 state가 바뀔 때마다 `Header`와 `Sidebar`까지 렌더된다(1편 전파 규칙). **올리는 것은 필요해진 시점에 하면 된다.** 끌어올리기(Lifting State Up)는 되돌리기 쉬운 변경이지만, 전역에 올라간 state를 다시 내리는 것은 사용처를 전부 찾아야 하므로 비싸다.

### Prop Drilling이 신호일 때와 아닐 때

state를 공통 조상에 두면 중간 컴포넌트들이 props를 전달만 하는 경우가 생긴다. 2\~3단계는 문제가 아니다. 오히려 데이터 흐름이 코드에 그대로 드러난다. 문제가 되는 경우는 다음과 같다.

- 중간 컴포넌트가 5단계 이상이고, 그중 누구도 그 값을 쓰지 않는다.
- 같은 prop 묶음이 여러 경로로 반복된다.

이때 Context를 꺼내기 전에 **Composition**을 먼저 확인한다. 중간 컴포넌트가 `children`이나 slot을 받도록 바꾸면 데이터를 쓰는 컴포넌트를 상위에서 직접 만들어 넘길 수 있다. 3편에서 자세히 다룬다.

---

## 7. 어떤 모양으로 둘 것인가: 불가능한 상태를 표현 불가능하게

### 7-1. boolean 묶음 → Discriminated Union

```tsx
// ✅ 조합 수 = 의미 있는 상태 수
type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'success'; data: T };

const [req, setReq] = useState<RequestState<User>>({ status: 'idle' });
```

`status === 'success'`일 때만 `data`에 접근할 수 있으므로, TypeScript가 "로딩 중인데 데이터를 읽는" 코드를 컴파일 단계에서 막는다.

```tsx
switch (req.status) {
  case 'idle':    return null;
  case 'loading': return <Spinner />;
  case 'error':   return <ErrorMessage text={req.error} />;
  case 'success': return <UserCard user={req.data} />;
}
```

### 7-2. 전이 규칙이 있으면 `useReducer`

상태가 "어떤 상태에서 어떤 상태로 갈 수 있는가"라는 규칙을 가지면, 그 규칙을 한곳에 모은다.

```tsx
type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'done'; url: string }
  | { status: 'failed'; reason: string };

type UploadEvent =
  | { type: 'START' }
  | { type: 'PROGRESS'; progress: number }
  | { type: 'SUCCESS'; url: string }
  | { type: 'FAIL'; reason: string }
  | { type: 'RESET' };

function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  switch (state.status) {
    case 'idle':
      return event.type === 'START' ? { status: 'uploading', progress: 0 } : state;
    case 'uploading':
      if (event.type === 'PROGRESS') return { ...state, progress: event.progress };
      if (event.type === 'SUCCESS') return { status: 'done', url: event.url };
      if (event.type === 'FAIL') return { status: 'failed', reason: event.reason };
      return state;
    case 'done':
    case 'failed':
      return event.type === 'RESET' ? { status: 'idle' } : state;
  }
}
```

이 구조의 효과는 세 가지다.

- **허용되지 않은 전이가 무시된다.** 업로드 완료 후 늦게 도착한 `PROGRESS` 이벤트는 `done` 상태에서 아무 일도 일으키지 않는다.
- **reducer는 순수 함수라서 React 없이 테스트할 수 있다.**
- **`dispatch`는 참조가 항상 안정적이다.** 자식에게 넘겨도 `memo`를 깨지 않고, Effect 의존성에 넣어도 재실행을 일으키지 않는다.

`useState` 여러 개를 한 핸들러에서 함께 set하고 있다면 `useReducer`로 옮길 신호다.

### 7-3. 이전 값에 의존하는 업데이트는 함수형으로

```tsx
setCount(count + 1);       // 클로저에 잡힌 count 기준
setCount(c => c + 1);      // 큐에 쌓인 최신 값 기준
```

같은 핸들러에서 여러 번 호출하거나, 비동기 콜백에서 호출할 때 첫 번째 형태는 옛 값을 기준으로 계산한다. 함수형 업데이트를 쓰면 `count`를 의존성 배열에 넣을 필요도 없어져서 콜백 참조가 안정된다.

---

## 8. 정리: state를 추가하기 전 확인 순서

```
새 값이 필요하다
  ├─ 변하지 않는가?                 → 상수
  ├─ props로 오는가?                → props 그대로
  ├─ 기존 값으로 계산되는가?         → 렌더 중 계산 (무거우면 캐시)
  ├─ 서버 데이터인가?               → 서버 컴포넌트 / 서버 캐시
  ├─ 링크로 공유·새로고침 유지?      → URL
  ├─ 제출 시점에만 필요한 입력?      → 비제어 + FormData
  └─ 진짜 state
       ├─ 위치: 사용하는 컴포넌트들의 가장 가까운 공통 조상
       └─ 모양: 조합 수 = 의미 있는 상태 수 (union / reducer)
```

---

## 9. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| Derived State, props → state 복사 | [2편 — useEffect 4대 오용, props→state 복사](/posts/frontend-antipatterns-2-state-and-data-flow) |
| Discriminated Union, reducer | [2편 — boolean 상태 머신](/posts/frontend-antipatterns-2-state-and-data-flow) |
| 서버 상태를 캐시로 다루기 | [5편 — Waterfall, 재시도·취소·롤백](/posts/frontend-antipatterns-5-network-and-failure) |
| Colocation | [2편 — 성급한 Context 전역화](/posts/frontend-antipatterns-2-state-and-data-flow) |

---

## 자가진단 체크리스트

- [ ] `useEffect` 안에서 다른 state를 set해 파생값을 만드는 코드가 없다.
- [ ] 선택된 항목을 객체가 아니라 ID로 저장한다.
- [ ] `useState(props.x)` 형태가 있다면 이름이 `initialX`이고, 리셋이 필요할 때 `key`를 쓴다.
- [ ] API 응답을 `useState`나 전역 스토어에 복사하지 않는다.
- [ ] 필터·정렬·페이지는 URL에 있어서 새로고침과 링크 공유에 살아남는다.
- [ ] 제출 시점에만 필요한 입력은 제어하지 않는다.
- [ ] boolean 두 개 이상이 하나의 흐름을 표현하고 있지 않다.
- [ ] 각 state가 사용처의 가장 가까운 공통 조상에 있다.

---

## 다음 편

state를 최소로 줄이고 올바른 자리에 두어도, 자주 바뀌는 state가 넓은 트리 위에 있어야 하는 경우는 남는다. [3편](/posts/efficient-react-3-render-scope)에서는 1편의 bail-out 조건을 설계 도구로 써서 **`memo` 없이 렌더 반경을 좁히는 방법**(state 내리기, Composition, Context 분할, selector 구독)과, React Compiler가 이 그림을 어떻게 바꾸는지 다룬다.
