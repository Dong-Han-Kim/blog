---
# 📌 기본 메타데이터
title: '효율적인 React 5편 — 데이터 흐름 설계: 도착 순서를 트리와 함께 설계한다'
date: '2026-09-15'
category: 'frontend'
tags: ['React', 'Data Fetching', 'Suspense', 'Server Components', 'Actions', 'useOptimistic']
description: '사용자가 느끼는 지연의 대부분은 렌더가 아니라 데이터 도착 순서에서 생긴다. Waterfall이 생기는 세 경로, 요청을 위에서 병렬로 시작하는 법, Suspense 경계 배치 기준, 서버 컴포넌트와 클라이언트 캐시의 역할 분담, Actions와 useOptimistic.'

# 💬 옵션 필드
draft: false
series: '효율적인 React'
seriesOrder: 5

# 📚 SEO용
keywords: ['React', 'Data Fetching', 'Suspense', 'Server Components', 'Actions', 'useOptimistic', '효율적인 React']
---

# 효율적인 React 5편 — 데이터 흐름 설계

1\~4편은 "데이터가 이미 있을 때 렌더를 어떻게 줄이는가"를 다뤘다. 그런데 실제 화면에서 사용자가 기다리는 시간을 재 보면, 렌더에 쓰는 수십 ms보다 **데이터를 기다리는 수백 ms\~수 초**가 훨씬 크다.

이 편의 질문은 이것이다.

> **"이 데이터는 언제 요청이 시작되고, 언제 도착하고, 도착 전에는 무엇을 보여주는가?"**

Suspense의 내부 동작(Promise throw, 경계 탐색)과 스트리밍 SSR의 조각 교체 메커니즘은 React 렌더링 Deep Dive 시리즈 [3편](/posts/react-suspense)·[6편](/posts/react-streaming-rendering)에서 다뤘다. 이 편은 그 메커니즘 위에서 **경계와 요청을 어디에 둘지** 정하는 기준을 다룬다.

---

## 1. Waterfall: 병렬로 갈 수 있는 요청이 줄을 선다

서로 의존하지 않는 요청 세 개가 각각 50ms 걸린다고 하자.

```ts
// 순차: 150ms
await getUser();
await getPosts();
await getNotifications();

// 병렬: 50ms
await Promise.all([getUser(), getPosts(), getNotifications()]);
```

> 실행 검증(Node): 50ms 요청 세 개가 순차로 150ms, `Promise.all`로 51ms 걸렸다.

코드에서는 이 차이가 잘 보인다. React 앱에서 Waterfall이 문제인 이유는, **컴포넌트 구조가 순차 실행을 숨기기** 때문이다.

### Waterfall이 생기는 세 경로

**경로 1. 컴포넌트마다 렌더 후 fetch (fetch-on-render)**

```tsx
function ProfilePage({ userId }: { userId: string }) {
  const user = useUser(userId);            // 요청 1 시작
  if (!user) return <Spinner />;
  return <Posts authorId={user.id} />;     // user가 와야 Posts가 마운트 → 요청 2 시작
}
```

`Posts`는 `ProfilePage`가 데이터를 받은 **다음에야** 마운트되고, 마운트된 **다음에야** 요청을 시작한다. `authorId`는 이미 `userId`로 알고 있었는데도 기다린다. 트리가 깊어질수록 한 단계씩 줄이 늘어난다.

**경로 2. 서버 컴포넌트에서 순차 await**

```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser(id);          // 끝나야
  const posts = await getPosts(id);        // 시작
  const stats = await getStats(id);        // 시작
  return (/* ... */);
}
```

서버에서 실행돼도 순차는 순차다. 게다가 가장 느린 요청이 끝날 때까지 **페이지 전체가 응답을 시작하지 못한다.**

**경로 3. 코드 분할 뒤의 fetch**

```tsx
const Chart = lazy(() => import('./Chart'));   // JS 청크 다운로드 →
// Chart가 마운트된 뒤 useEffect에서 데이터 요청 →
```

JS 청크 다운로드와 데이터 요청은 서로 의존하지 않는데 순차로 일어난다.

세 경로의 공통 원인은 같다. **요청의 시작 시점이 컴포넌트가 렌더되는 시점에 묶여 있다.**

---

## 2. 원칙 1 — 요청은 트리 위에서, 병렬로 시작한다

### 2-1. 서버 컴포넌트: 기다리지 않을 요청은 await하지 않는다

```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 세 요청을 동시에 시작한다. 아직 await하지 않는다.
  const userPromise = getUser(id);
  const postsPromise = getPosts(id);
  const statsPromise = getStats(id);

  // 헤더에 반드시 필요한 user만 기다린다
  const user = await userPromise;

  return (
    <>
      <ProfileHeader user={user} />
      <Suspense fallback={<PostsSkeleton />}>
        <Posts postsPromise={postsPromise} />
      </Suspense>
      <Suspense fallback={<StatsSkeleton />}>
        <Stats statsPromise={statsPromise} />
      </Suspense>
    </>
  );
}

async function Posts({ postsPromise }: { postsPromise: Promise<Post[]> }) {
  const posts = await postsPromise;
  return (/* ... */);
}
```

- 세 요청이 **같은 시점에** 시작된다.
- 헤더는 `user`만 오면 보이고, 게시물과 통계는 각자 도착하는 대로 스트리밍된다.
- 느린 `getStats`가 페이지 전체를 막지 않는다.

### 2-2. 클라이언트 컴포넌트로 Promise 넘기기: `use()`

클라이언트 컴포넌트는 `async`일 수 없다. 서버에서 시작한 Promise를 props로 넘기고 `use()`로 읽는다.

```tsx
// 서버 컴포넌트
const commentsPromise = getComments(postId);
return (
  <Suspense fallback={<CommentsSkeleton />}>
    <Comments commentsPromise={commentsPromise} />
  </Suspense>
);
```

```tsx
'use client';
import { use } from 'react';

export function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise);   // 도착 전이면 가장 가까운 Suspense로 중단
  const [sort, setSort] = useState<'new' | 'top'>('new');
  // 상호작용은 클라이언트에서
}
```

주의: **클라이언트 컴포넌트의 렌더 중에 Promise를 새로 만들어 `use()`에 넘기면 안 된다.** 렌더마다 새 Promise가 생겨서 계속 중단된다. `use()`에 넘기는 Promise는 서버 컴포넌트에서 만들었거나, 캐시 라이브러리가 관리하는 안정적인 Promise여야 한다.

### 2-3. 같은 요청의 중복 제거: `cache()`

레이아웃과 페이지, 여러 컴포넌트가 같은 사용자 정보를 필요로 할 때, props로 내려보내는 대신 **각자 부르되 한 요청 안에서는 한 번만 실행**되게 할 수 있다.

```ts
import { cache } from 'react';

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});
```

`cache()`로 감싼 함수는 서버 렌더 **한 번(요청 하나)** 동안 같은 인자에 대해 결과를 공유한다. 요청 간에는 공유하지 않으므로 사용자 데이터가 섞이지 않는다. 이 도구가 있으면 "데이터를 쓰는 컴포넌트가 데이터를 직접 가져온다"는 설계를 Waterfall과 중복 요청 없이 유지할 수 있다.

요청 **간** 캐시(여러 사용자가 같은 결과 공유, 시간 기반 재검증)는 프레임워크의 영역이다. Next.js는 버전마다 캐시 기본값과 설정 방식이 달라졌으므로, 사용하는 버전의 공식 문서를 기준으로 판단한다.

### 2-4. 코드와 데이터를 함께 시작하기

경로 3을 풀려면 청크 다운로드와 데이터 요청을 **같은 이벤트에서** 시작한다.

```tsx
const loadChart = () => import('./Chart');
const Chart = lazy(loadChart);

function ReportButton({ reportId }: { reportId: string }) {
  const queryClient = useQueryClient();

  function prefetch() {
    loadChart();                                     // 청크 다운로드 시작
    queryClient.prefetchQuery(reportQuery(reportId)); // 데이터 요청 시작
  }

  return (
    <Link href={`/reports/${reportId}`} onMouseEnter={prefetch} onFocus={prefetch}>
      보고서 보기
    </Link>
  );
}
```

사용자 **의도**(hover, focus)가 보이는 시점에 둘 다 시작하면, 클릭했을 때 이미 둘 다 도착했거나 도착하는 중이다.

---

## 3. 원칙 2 — Suspense 경계는 "함께 나타날 단위"로 둔다

Suspense 경계 하나는 세 가지를 동시에 정한다.

1. **로딩 UI의 단위**: 경계 안의 모든 것이 준비될 때까지 fallback을 보여준다.
2. **스트리밍 절단선**: 서버에서 경계 단위로 HTML 조각을 나눠 보낸다([React 렌더링 Deep Dive 6편](/posts/react-streaming-rendering)).
3. **Selective Hydration 단위**: 경계 단위로 hydration 우선순위가 정해진다.

그래서 경계 위치는 성능 설정이 아니라 **UX 설계**다.

### 3-1. 너무 넓으면: 느린 하나가 전체를 막는다

```tsx
<Suspense fallback={<PageSkeleton />}>
  <Header />          {/* 50ms */}
  <MainContent />     {/* 200ms */}
  <Recommendations /> {/* 2000ms */}
</Suspense>
```

추천 목록 하나 때문에 2초 동안 페이지 전체가 스켈레톤이다.

### 3-2. 너무 촘촘하면: 화면이 조각조각 튄다

```tsx
{posts.map(p => (
  <Suspense key={p.id} fallback={<CardSkeleton />}>
    <PostCard id={p.id} />
  </Suspense>
))}
```

카드 스무 개가 도착 순서대로 제각각 나타나면서 레이아웃이 계속 밀린다(CLS). 사용자는 "다 된 건지"를 판단하기 어렵다.

### 3-3. 배치 기준

| 기준 | 설명 |
|---|---|
| **독립적으로 의미가 있는가** | 그 영역만 먼저 보여도 사용자가 무언가를 할 수 있는가. 헤더·본문·사이드바는 대개 그렇고, 카드 목록의 카드 하나는 아니다. |
| **속도 편차가 큰가** | 느린 데이터(추천, 통계, 외부 API)는 따로 격리한다. 비슷한 속도의 요청은 하나로 묶는다. |
| **fallback 크기를 고정할 수 있는가** | 스켈레톤이 실제 콘텐츠와 같은 크기를 차지해야 CLS가 생기지 않는다. |
| **실패 단위와 일치하는가** | 이 영역만 실패해도 나머지는 동작해야 하는가. 그렇다면 같은 위치에 Error Boundary도 둔다. |

```tsx
<>
  <Header user={user} />                          {/* 필수 데이터, 경계 밖 */}
  <ErrorBoundary fallback={<MainError />}>
    <Suspense fallback={<MainSkeleton />}>
      <MainContent />                             {/* 핵심 콘텐츠 */}
    </Suspense>
  </ErrorBoundary>
  <ErrorBoundary fallback={null}>                 {/* 실패하면 조용히 숨김 */}
    <Suspense fallback={<RecoSkeleton />}>
      <Recommendations />                         {/* 느리고 부가적 */}
    </Suspense>
  </ErrorBoundary>
</>
```

### 3-4. 이미 보이는 화면을 fallback으로 되돌리지 않기

탭 전환이나 필터 변경으로 경계 안의 컴포넌트가 다시 중단되면, 기본 동작은 **이미 보이던 콘텐츠를 fallback으로 교체**하는 것이다. 사용자 입장에서는 화면이 사라졌다가 다시 나타난다.

업데이트를 transition으로 표시하면 React는 새 데이터가 준비될 때까지 **이전 화면을 유지**한다.

```tsx
const [isPending, startTransition] = useTransition();

function selectTab(next: Tab) {
  startTransition(() => setTab(next));
}

return (
  <div style={{ opacity: isPending ? 0.6 : 1 }}>
    <Suspense fallback={<TabSkeleton />}>
      <TabContent tab={tab} />
    </Suspense>
  </div>
);
```

Next.js App Router의 `<Link>` 이동과 `router.push`는 내부적으로 transition이다. 그래서 페이지 이동 중에는 이전 페이지가 유지된다. 처음 보이는 경계는 fallback을 보여주고, 이미 보인 경계는 이전 콘텐츠를 유지하는 것이 기본 전략이다. 우선순위 자체는 6편에서 다룬다.

---

## 4. 서버 컴포넌트와 클라이언트 캐시의 역할 분담

"서버 컴포넌트가 있으니 클라이언트 fetch 라이브러리는 필요 없다"도, "익숙하니 전부 클라이언트에서 가져온다"도 한쪽만 본 결론이다. 역할이 다르다.

| 필요 | 서버 컴포넌트 | 클라이언트 서버-캐시 |
|---|---|---|
| 첫 화면에 보일 데이터 | ✅ HTML에 포함, 번들에 fetch 코드 없음 | 첫 렌더 후 요청 → 늦음 |
| 비밀 키, DB 직접 접근 | ✅ | ❌ |
| 사용자 입력에 따라 즉시 재조회(검색 자동완성) | 서버 왕복 + 트리 재렌더 | ✅ |
| 무한 스크롤, 페이지네이션 누적 | 까다로움 | ✅ |
| 폴링, 창 포커스 시 재검증 | ❌ | ✅ |
| 여러 화면에 걸친 캐시 공유와 낙관적 수정 | 제한적 | ✅ |

실용적인 기본값은 다음과 같다.

1. **읽기의 기본은 서버 컴포넌트.** 페이지를 구성하는 데이터는 서버에서 가져와 HTML과 함께 보낸다.
2. **상호작용이 계속되는 영역은 클라이언트 캐시.** 서버에서 첫 데이터를 미리 가져와 클라이언트 캐시의 초기값으로 넘기면(TanStack Query의 dehydrate/hydrate 방식) 첫 화면은 빠르고 이후 상호작용은 캐시가 처리한다.
3. **쓰기는 Actions**(6절). 쓰기 후에는 관련 캐시를 무효화한다.

---

## 5. 클라이언트 캐시를 쓸 때의 설계 포인트

### 5-1. Query Key는 캐시의 주소 체계다

```ts
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: ProductFilters) => [...productKeys.lists(), filters] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
};

export const productListQuery = (filters: ProductFilters) => ({
  queryKey: productKeys.list(filters),
  queryFn: ({ signal }: { signal: AbortSignal }) => fetchProducts(filters, { signal }),
  staleTime: 30_000,
});
```

계층형 키를 쓰면 무효화 범위를 정확히 지정할 수 있다.

```ts
queryClient.invalidateQueries({ queryKey: productKeys.lists() });   // 모든 목록만
queryClient.invalidateQueries({ queryKey: productKeys.detail(id) }); // 상세 하나만
```

키에 들어간 값이 요청의 **모든 입력**이어야 한다. `queryFn`이 키에 없는 값(예: 클로저로 읽은 정렬 옵션)을 쓰면, 그 값이 바뀌어도 캐시는 같은 데이터를 돌려준다.

### 5-2. staleTime은 "얼마나 자주 다시 물어볼까"를 정한다

- `staleTime`: 이 시간 동안은 캐시를 신선하다고 보고 다시 요청하지 않는다. 기본값 0은 "마운트나 포커스 때마다 백그라운드로 재검증"을 뜻한다.
- `gcTime`: 아무도 구독하지 않는 캐시를 메모리에서 지우기까지의 시간.

데이터 성격에 따라 정한다. 거의 바뀌지 않는 카테고리 목록은 길게, 재고 수량은 짧게 둔다. 전역 기본값을 0으로 두면 화면 전환마다 요청이 발생한다.

### 5-3. 캐시 라이브러리가 대신 해 주는 것

4편에서 Effect로 직접 짠 fetch에 없던 것들이다.

- 같은 키의 동시 요청 **중복 제거**
- 키가 바뀌면 이전 요청 결과를 무시(**Race Condition** 방지)와 `AbortSignal` 전달
- **재시도**(기본적으로 지수 백오프)
- 이전 데이터를 보여주면서 새 데이터 로딩(`placeholderData`)
- 오프라인·포커스·재연결 시 재검증

---

## 6. 쓰기: Actions와 낙관적 업데이트

### 6-1. Actions: 폼 제출의 대기·에러·순서를 React가 관리한다

React 19의 Actions는 **transition 안에서 실행되는 비동기 함수**다. `<form action>`에 넘기면 대기 상태, 에러, 제출 순서를 React가 추적한다.

```tsx
// app/todos/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const TodoInput = z.object({ title: z.string().trim().min(1).max(100) });

export async function addTodo(prev: { error?: string }, formData: FormData) {
  const session = await getSession();
  if (!session) return { error: '로그인이 필요합니다' };        // 서버 함수는 공개 엔드포인트

  const parsed = TodoInput.safeParse({ title: formData.get('title') });
  if (!parsed.success) return { error: '제목을 1~100자로 입력하세요' };

  await db.todo.create({ data: { title: parsed.data.title, userId: session.userId } });
  revalidatePath('/todos');
  return {};
}
```

```tsx
'use client';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { addTodo } from './actions';

export function AddTodoForm() {
  const [state, formAction] = useActionState(addTodo, {});
  return (
    <form action={formAction}>
      <input name="title" />
      <SubmitButton />
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();           // 가장 가까운 부모 form의 상태
  return <button disabled={pending}>{pending ? '추가 중…' : '추가'}</button>;
}
```

`'use server'` 함수는 클라이언트에서 호출할 수 있는 **공개 HTTP 엔드포인트**라는 점을 잊으면 안 된다. 인증·권한 확인과 입력 검증을 함수 안에서 반드시 한다(안티패턴 시리즈 [6편](/posts/frontend-antipatterns-6-bundle-and-boundaries)·[8편](/posts/frontend-antipatterns-8-robustness)).

### 6-2. `useOptimistic`: 서버 응답 전에 결과를 먼저 보여준다

```tsx
'use client';
import { useOptimistic, startTransition } from 'react';

export function LikeButton({ liked, count, postId }: { liked: boolean; count: number; postId: string }) {
  const [optimistic, setOptimistic] = useOptimistic(
    { liked, count },
    (current, nextLiked: boolean) => ({
      liked: nextLiked,
      count: current.count + (nextLiked ? 1 : -1),
    }),
  );

  function toggle() {
    startTransition(async () => {
      setOptimistic(!optimistic.liked);          // 즉시 반영
      await toggleLike(postId, !optimistic.liked); // 서버 함수, 성공 시 revalidate
    });
  }

  return (
    <button onClick={toggle} aria-pressed={optimistic.liked}>
      ♥ {optimistic.count}
    </button>
  );
}
```

동작 원리는 이렇다.

1. transition이 진행되는 동안 `optimistic`은 **낙관적 값**을 보여준다.
2. transition이 끝나면 `optimistic`은 **props로 받은 실제 값**(`liked`, `count`)으로 돌아간다.
3. 서버가 성공해서 revalidate로 새 props가 오면 → 새 실제 값이 표시된다.
4. 서버가 실패해서 props가 그대로면 → **이전 값으로 자동 롤백**된다.

롤백 코드를 따로 쓰지 않아도 되는 이유는 **낙관적 값이 실제 state를 덮어쓰지 않고, 위에 잠시 겹쳐 보여질 뿐**이기 때문이다. 직접 구현할 때 흔히 생기는 "실패했는데 UI는 성공 상태로 남는" 문제가 구조적으로 사라진다.

> 실행 검증(순수 로직): 이전 값을 보관하고 낙관적 값을 적용한 뒤 서버 실패 시 복원하는 흐름에서 표시값은 `true`, 실패 후 최종값은 `false`로 돌아왔다. `useOptimistic`은 이 보관·복원을 "실제 값 위에 겹치기" 방식으로 대체한다.

실패를 사용자에게 알리는 일은 여전히 필요하다. 실패 시 토스트를 띄우거나 에러를 Error Boundary로 던진다.

### 6-3. 낙관적 업데이트를 쓰면 안 되는 경우

- **되돌리기 비용이 큰 작업**: 결제, 송금, 발송. 사용자가 "완료"를 보고 창을 닫았는데 실패하면 복구할 방법이 없다.
- **서버가 결과를 결정하는 작업**: 재고 차감, 좌석 예약, 중복 검사.
- **실패율이 높은 작업**: 롤백이 자주 보이면 낙관적 UI가 오히려 신뢰를 떨어뜨린다.

좋아요, 북마크, 체크박스, 순서 변경처럼 **성공률이 높고 되돌려도 피해가 없는 작업**에 쓴다.

---

## 7. 로딩 UI의 원칙

| 상황 | 보여줄 것 |
|---|---|
| 처음 보이는 영역 | 실제 레이아웃과 같은 크기의 스켈레톤 |
| 이미 보인 영역의 갱신 | 이전 콘텐츠 유지 + 흐리게 또는 작은 진행 표시(transition) |
| 사용자가 누른 버튼의 처리 중 | 버튼 자체의 pending 상태(`useFormStatus`, `isPending`) |
| 짧게 끝나는 요청(수백 ms 이하) | 아무것도 표시하지 않거나 지연 표시. 스피너가 번쩍 나타났다 사라지면 더 느리게 느껴진다. |

스켈레톤은 **CLS 방지 장치**이기도 하다. 콘텐츠와 크기가 다른 스켈레톤은 도착 시점에 레이아웃을 밀어낸다.

---

## 8. 짝이 되는 안티패턴

| 이 편의 개념 | 안티패턴 시리즈 |
|---|---|
| Waterfall 세 경로, 병렬화 | [5편 — Waterfall 4경로, N+1](/posts/frontend-antipatterns-5-network-and-failure) |
| 캐시 라이브러리의 재시도·취소 | [5편 — 재시도·타임아웃·취소·롤백](/posts/frontend-antipatterns-5-network-and-failure) |
| Suspense 경계와 로딩 UI | [5편 — 로딩 UI](/posts/frontend-antipatterns-5-network-and-failure), [4편 — CLS](/posts/frontend-antipatterns-4-rendering-performance) |
| Error Boundary 배치 | [8편 — 에러 바운더리 3층](/posts/frontend-antipatterns-8-robustness) |
| 서버 함수 인증·검증 | [6편 — `NEXT_PUBLIC_` 비밀 유출](/posts/frontend-antipatterns-6-bundle-and-boundaries), [8편 — 런타임 검증](/posts/frontend-antipatterns-8-robustness) |

---

## 자가진단 체크리스트

- [ ] 서로 의존하지 않는 요청이 순차 `await`로 연결되어 있지 않다.
- [ ] 자식이 부모 데이터 도착 후에야 요청을 시작하는 구조가 아니다(필요한 ID를 이미 알고 있다면).
- [ ] 여러 컴포넌트가 같은 데이터를 읽을 때 `cache()`나 캐시 라이브러리로 중복을 제거한다.
- [ ] Suspense 경계는 "독립적으로 의미 있는 영역" 단위이고, 느린 데이터는 격리되어 있다.
- [ ] 스켈레톤이 실제 콘텐츠와 같은 크기다.
- [ ] 이미 보인 콘텐츠의 갱신은 transition으로 처리해 fallback으로 되돌리지 않는다.
- [ ] Query Key에 요청의 모든 입력이 들어 있다.
- [ ] 서버 함수 안에서 인증과 입력 검증을 한다.
- [ ] 낙관적 업데이트는 되돌려도 피해가 없는 작업에만 쓴다.

---

## 다음 편

데이터가 도착한 뒤에도 느린 경우가 남는다. 결과 목록 렌더가 무거워서 입력이 끊기거나, 수천 개 행이 스크롤을 막는 경우다. [6편](/posts/efficient-react-6-responsiveness)에서는 `useTransition`과 `useDeferredValue`로 **긴급한 업데이트와 급하지 않은 업데이트를 나누는 기준**, 긴 목록 가상화의 대가, 그리고 `<Activity>`로 숨긴 화면의 상태를 보존하는 법을 다룬다.
