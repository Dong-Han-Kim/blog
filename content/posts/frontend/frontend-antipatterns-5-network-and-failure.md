---
# 📌 기본 메타데이터
title: '프론트엔드 안티패턴 (5) — 네트워크와 실패 경로: 정상 경로만 짜고 배포하기'
date: '2026-09-14'
category: 'frontend'
tags: ['Networking', 'Data Fetching', 'Error Handling', 'React', 'Anti-Pattern']
description: '워터폴이 생기는 네 가지 경로, N+1 요청, 그리고 대부분의 코드에 빠져 있는 것 — 재시도, 타임아웃, 취소, 롤백. 실패 경로가 없는 코드는 완성된 것이 아니다.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 안티패턴'
seriesOrder: 5

# 📚 SEO용
keywords: ['Networking', 'Data Fetching', 'Error Handling', 'React', 'Anti-Pattern', '프론트엔드 안티패턴']
---

# 프론트엔드 안티패턴 (5) — 네트워크와 실패 경로

4편에서 성능 병목 1순위가 네트워크라고 했습니다. 그리고 네트워크 코드의 안티패턴은 두 종류로 나뉩니다.

- **느린 것** — 워터폴, N+1, 과도한 페이로드
- **깨지는 것** — 실패 경로를 설계하지 않은 것

후자가 더 위험합니다. 느린 건 티가 나지만, **실패 경로 부재는 대부분의 사용자에게 안 보이다가 일부에게만 치명적으로 터집니다.**

---

# 1부. 느린 것 — 워터폴

## 워터폴이 생기는 네 가지 경로

### 경로 1 — 순차 `await`

```typescript
// 🔴 총 900ms
const user = await getUser(id);           // 300ms
const posts = await getPosts(id);         // 300ms
const settings = await getSettings(id);   // 300ms

// ✅ 총 300ms
const [user, posts, settings] = await Promise.all([
  getUser(id), getPosts(id), getSettings(id),
]);
```

가장 알아보기 쉬운 형태입니다. **단, 정말 의존 관계가 있는지 확인하세요.**

```typescript
// 이건 진짜 의존이다 — 병렬화 불가
const user = await getUser(id);
const team = await getTeam(user.teamId);   // user가 있어야 teamId를 안다

// 하지만 이건 부분 병렬화 가능
const userPromise = getUser(id);
const settingsPromise = getSettings(id);         // user와 무관 — 먼저 시작
const user = await userPromise;
const team = await getTeam(user.teamId);
const settings = await settingsPromise;
```

**요청을 시작하는 시점과 기다리는 시점을 분리하면** 의존이 있어도 상당 부분 겹칠 수 있습니다.

### 경로 2 — 컴포넌트 계층 워터폴

가장 흔하고 가장 잘 안 보이는 형태입니다.

```tsx
// 🔴 3단계 워터폴
function Page() {
  const { data: user } = useQuery(['user'], getUser);
  if (!user) return <Skeleton />;
  return <Dashboard user={user} />;          // user가 있어야 렌더됨
}

function Dashboard({ user }) {
  const { data: projects } = useQuery(['projects', user.id], () => getProjects(user.id));
  if (!projects) return <Skeleton />;
  return <>{projects.map(p => <ProjectCard key={p.id} project={p} />)}</>;
}

function ProjectCard({ project }) {
  const { data: stats } = useQuery(['stats', project.id], () => getStats(project.id));
  // ...
}
```

`user` 요청이 끝나야 `Dashboard`가 렌더되고, 그제서야 `projects` 요청이 시작됩니다. **왕복 3번 + 렌더 3번**입니다.

**해법 (a) — 상위에서 병렬로 시작**

```tsx
function Page() {
  // 세 요청이 동시에 출발한다
  const user = useQuery(['user'], getUser);
  const projects = useQuery(['projects'], getProjects);
  const stats = useQuery(['stats'], getStats);
  // ...
}
```

**해법 (b) — 라우트 진입 시 프리페치**

```typescript
// 라우트 로더 / 서버에서 미리 채워두기
await queryClient.prefetchQuery({ queryKey: ['projects'], queryFn: getProjects });
```

**해법 (c) — 서버 컴포넌트에서 병렬 + Suspense**

```tsx
// 🔴 RSC에서도 같은 실수가 가능하다
async function Page() {
  const user = await getUser();
  const projects = await getProjects();     // user를 기다린 뒤 시작
  return <Dashboard user={user} projects={projects} />;
}

// ✅ 병렬로 시작
async function Page() {
  const userPromise = getUser();
  const projectsPromise = getProjects();
  const [user, projects] = await Promise.all([userPromise, projectsPromise]);
  return <Dashboard user={user} projects={projects} />;
}

// ✅✅ 더 나은 방법 — 준비되는 대로 스트리밍
function Page() {
  return (
    <>
      <Suspense fallback={<UserSkeleton />}>
        <UserSection />          {/* 각자 자기 데이터를 가져온다 */}
      </Suspense>
      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsSection />      {/* 병렬로 진행, 먼저 끝나는 게 먼저 표시 */}
      </Suspense>
    </>
  );
}
```

**Suspense 경계는 "여기까지는 먼저 보여줘도 된다"는 선언입니다.** 경계가 없으면 가장 느린 요청이 전체를 붙잡습니다.

### 경로 3 — 인증 후 데이터

```typescript
// 🔴 세션 확인 → 그 다음 데이터
const session = await getSession();        // 200ms
if (!session) redirect('/login');
const data = await getData();              // 300ms
```

인증이 필요한 모든 페이지에 500ms가 붙습니다. 미들웨어에서 토큰을 검증하거나, 세션 확인과 데이터 요청을 병렬로 보내고 실패 시 리다이렉트하는 방식으로 줄일 수 있습니다.

### 경로 4 — 번들 워터폴

```typescript
// 🔴 청크 안에서 또 다른 동적 import
const Editor = lazy(() => import('./Editor'));
// Editor.tsx 안에서
const Plugin = lazy(() => import('./Plugin'));
// → Editor 청크를 받고 실행해야 Plugin 요청이 시작된다
```

**해법: 필요할 것을 미리 힌트로 알린다.**

```tsx
// 사용자가 버튼에 마우스를 올리는 순간 미리 로드
<button onMouseEnter={() => import('./Editor')} onClick={openEditor}>
  편집
</button>
```

```html
<link rel="modulepreload" href="/chunks/editor.js">
```

---

## N+1 요청

```tsx
// 🔴 100개 행 × 각각 요청
{rows.map(row => <RowWithOwner key={row.id} row={row} />)}

function RowWithOwner({ row }) {
  const { data: owner } = useQuery(['user', row.ownerId], () => getUser(row.ownerId));
  // 100개의 개별 요청
}
```

브라우저는 동시 연결 수가 제한되어 있으므로(HTTP/1.1 기준 호스트당 6개) 100개 요청은 순차적으로 밀립니다. HTTP/2라도 서버 부하는 그대로입니다.

**해법 (a) — 배치 엔드포인트**

```typescript
const ownerIds = [...new Set(rows.map(r => r.ownerId))];
const { data: owners } = useQuery({
  queryKey: ['users', ownerIds],
  queryFn: () => getUsers(ownerIds),     // 한 번의 요청
});
```

**해법 (b) — 서버에서 조인해서 내려주기**

가장 단순하고 대개 가장 좋습니다. `GET /rows?include=owner`.

**해법 (c) — 자동 배칭 레이어**

```typescript
// DataLoader 패턴 — 같은 틱의 요청을 모아서 한 번에
const userLoader = new DataLoader(async (ids: readonly string[]) => {
  const users = await getUsers([...ids]);
  return ids.map(id => users.find(u => u.id === id));
});
```

---

## 오버페칭과 과도한 페이로드

```typescript
// 🔴 표에 이름만 쓰는데 전체 프로필을 받는다
const users = await api.get('/users');   // 각 사용자당 5KB × 200명 = 1MB
```

체크할 것:

- **필드 선택** — `?fields=id,name,status` 또는 GraphQL
- **페이지네이션** — 전체를 받지 않기
- **압축** — gzip/brotli가 켜져 있는지 (의외로 안 켜진 경우가 있습니다)
- **불필요한 중첩** — 목록 응답에 각 항목의 전체 관계 트리가 들어있지 않은지

**측정 방법:** DevTools Network 탭에서 크기순 정렬. 상위 5개가 대체로 문제입니다.

---

# 2부. 깨지는 것 — 실패 경로

## 정상 경로만 짜고 배포하기

이것이 이 편의 핵심 안티패턴입니다.

```typescript
async function handleSave() {
  const result = await api.post('/orders', data);
  toast.success('저장되었습니다');
  router.push(`/orders/${result.id}`);
}
```

이 코드에 없는 것들:

- [ ] 실패 시 사용자에게 알리기
- [ ] 실패 시 재시도 기회
- [ ] 타임아웃
- [ ] 중복 제출 방지
- [ ] 네트워크 끊김 처리
- [ ] 에러 로깅

**실패 경로가 없는 코드는 미완성입니다.** "일단 배포하고 나중에"가 되면, 실패는 사용자가 발견하게 됩니다.

---

## 재시도 — 하는 법과 하면 안 되는 것

### 순진한 재시도의 문제

```typescript
// 🔴 즉시 3번 재시도
for (let i = 0; i < 3; i++) {
  try { return await fetch(url); } catch {}
}
```

서버가 과부하라서 실패했다면, **모든 클라이언트가 동시에 즉시 재시도해서 상황을 악화시킵니다.** 이걸 thundering herd라고 합니다.

### 지수 백오프 + 지터

```typescript
type RetryOptions = {
  retries?: number;
  baseDelay?: number;
  maxDelay?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

async function withRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  {
    retries = 3,
    baseDelay = 300,
    maxDelay = 8000,
    signal,
    shouldRetry = defaultShouldRetry,
  }: RetryOptions = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (attempt === retries || !shouldRetry(error, attempt)) throw error;

      // 지수 증가 + 지터(무작위 분산)로 동시 재시도를 흩는다
      const exponential = Math.min(baseDelay * 2 ** attempt, maxDelay);
      const delay = exponential * (0.5 + Math.random() * 0.5);
      await sleep(delay, signal);
    }
  }
  throw lastError;
}

function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof HttpError) {
    // 4xx는 재시도해도 똑같다 — 단 408(타임아웃), 429(레이트 리밋)는 예외
    if (error.status >= 400 && error.status < 500) {
      return error.status === 408 || error.status === 429;
    }
    return true;   // 5xx는 일시적일 수 있다
  }
  return true;     // 네트워크 에러
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
```

### 재시도하면 안 되는 것

**멱등하지 않은 요청**입니다.

```typescript
// 🔴 결제 요청을 재시도하면 두 번 결제될 수 있다
await withRetry(() => api.post('/payments', { amount }));
```

응답을 못 받은 것과 요청이 처리되지 않은 것은 **다릅니다.** 서버가 처리하고 응답만 유실됐을 수 있습니다.

```typescript
// ✅ 멱등성 키를 함께 보낸다
const idempotencyKey = useRef(crypto.randomUUID());
await withRetry(() =>
  api.post('/payments', { amount }, {
    headers: { 'Idempotency-Key': idempotencyKey.current },
  })
);
```

**규칙: GET/PUT/DELETE는 대체로 재시도 가능, POST는 멱등성 키가 있을 때만.**

---

## 타임아웃 — 없으면 영원히 기다린다

`fetch`에는 기본 타임아웃이 없습니다. 네트워크가 끊기면 사용자는 **무한히 도는 스피너**를 봅니다.

```typescript
// ✅ AbortSignal.timeout
const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

// ✅ 여러 신호 결합 (타임아웃 + 사용자 취소)
const res = await fetch(url, {
  signal: AbortSignal.any([
    AbortSignal.timeout(10_000),
    userAbortController.signal,
  ]),
});
```

타임아웃 값은 **화면의 성격에 따라 달라야 합니다.** 자동완성은 2초, 일반 조회는 10초, 대용량 리포트 생성은 60초. 일괄로 30초를 주면 자동완성이 30초간 멈춘 것처럼 보입니다.

---

## 취소 — 컴포넌트가 사라져도 요청은 살아있다

2편에서 본 경쟁 상태의 근본 원인입니다.

```typescript
// ✅ 언마운트/파라미터 변경 시 취소
useEffect(() => {
  const controller = new AbortController();
  load(controller.signal);
  return () => controller.abort();
}, [id]);
```

서버 상태 도구를 쓰면 `queryFn`에 `signal`이 자동으로 전달됩니다.

```typescript
useQuery({
  queryKey: ['search', q],
  queryFn: ({ signal }) => api.search(q, { signal }),   // 자동 취소
});
```

---

## 부분 실패 — 셋 중 하나만 실패했을 때

```typescript
// 🔴 하나가 실패하면 전부 버려진다
const [a, b, c] = await Promise.all([getA(), getB(), getC()]);
// getC가 실패하면 a, b도 못 쓴다 → 화면 전체가 에러
```

```typescript
// ✅ 각각의 결과를 따로 다룬다
const results = await Promise.allSettled([getA(), getB(), getC()]);

const [a, b, c] = results.map(r =>
  r.status === 'fulfilled' ? r.value : null
);

// 실패한 것만 에러 표시, 나머지는 정상 렌더
```

**사용자 입장에서는 "차트 하나가 안 뜨는 것"과 "페이지 전체가 에러인 것"은 완전히 다릅니다.** 대시보드처럼 독립적인 위젯이 모인 화면에서는 반드시 위젯 단위로 실패를 격리해야 합니다.

---

## 낙관적 업데이트에 롤백이 없음

```typescript
// 🔴 미리 반영만 하고 실패를 처리하지 않음
function toggleFavorite(id: string) {
  setItems(prev => prev.map(i => i.id === id ? { ...i, fav: !i.fav } : i));
  api.toggleFavorite(id);   // 실패하면? 화면은 이미 바뀌어 있다
}
```

사용자는 즐겨찾기가 됐다고 믿고, 새로고침하면 사라져 있습니다. **데이터가 아니라 신뢰를 잃습니다.**

```typescript
// ✅ 다섯 단계 전부
const mutation = useMutation({
  mutationFn: (id: string) => api.toggleFavorite(id),

  onMutate: async (id) => {
    // 1. 진행 중인 refetch 취소 — 안 하면 옛 데이터가 낙관 업데이트를 덮어쓴다
    await queryClient.cancelQueries({ queryKey: ['items'] });

    // 2. 롤백용 스냅샷
    const previous = queryClient.getQueryData<Item[]>(['items']);

    // 3. 미리 반영
    queryClient.setQueryData<Item[]>(['items'], old =>
      old?.map(i => i.id === id ? { ...i, fav: !i.fav } : i) ?? []
    );

    return { previous };
  },

  // 4. 실패 시 되돌리기
  onError: (_err, _id, context) => {
    queryClient.setQueryData(['items'], context?.previous);
    toast.error('변경에 실패했습니다');
  },

  // 5. 성공/실패 관계없이 서버 기준으로 재동기화
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
  },
});
```

**1번을 빼먹는 것이 가장 흔한 버그입니다.** 증상은 "추가했는데 잠깐 사라졌다가 다시 나타남"입니다.

---

## 로딩 UI 안티패턴

### 전체 화면 스피너

```tsx
// 🔴 데이터 하나 때문에 페이지 전체를 가린다
if (isLoading) return <FullPageSpinner />;
```

이미 보였던 헤더, 내비게이션, 사이드바까지 사라집니다. 스크롤이 초기화되고, 사용자는 문맥을 잃습니다.

```tsx
// ✅ 낡은 데이터를 유지하며 갱신 표시만
const { data, isFetching } = useQuery({
  queryKey: ['orders', filters],
  queryFn: () => getOrders(filters),
  placeholderData: keepPreviousData,     // 필터 바뀌어도 이전 결과 유지
});

return (
  <div className={isFetching ? 'opacity-60 transition-opacity' : ''}>
    <OrderTable rows={data} />
  </div>
);
```

### 스켈레톤이 실제 레이아웃과 다름

```tsx
// 🔴 스켈레톤은 3줄인데 실제는 5줄 → 데이터 도착 시 레이아웃이 튄다 (CLS)
```

**스켈레톤의 목적은 "기다리는 느낌을 줄이는 것"과 "최종 레이아웃의 공간을 미리 잡는 것" 두 가지입니다.** 크기가 다르면 두 번째 목적을 배신하고 오히려 CLS를 만듭니다.

### 깜빡임 — 너무 빨리 끝나는 로딩

100ms 만에 끝나는 요청에 스피너를 보여주면 **깜빡임**만 남습니다.

```typescript
// 일정 시간 이상 걸릴 때만 로딩 표시
function useDelayedLoading(isLoading: boolean, delay = 200) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isLoading) { setShow(false); return; }
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, [isLoading, delay]);
  return show;
}
```

---

## 요청 폭풍 — 디바운스 없는 입력

```typescript
// 🔴 키 누를 때마다 요청
<input onChange={e => search(e.target.value)} />
// "안녕하세요" = 요청 5번 (한글은 조합 중에도 이벤트가 발생)
```

```typescript
// ✅ 디바운스 + 취소
const [query, setQuery] = useState('');
const deferredQuery = useDeferredValue(query);

const { data } = useQuery({
  queryKey: ['search', deferredQuery],
  queryFn: ({ signal }) => api.search(deferredQuery, { signal }),
  enabled: deferredQuery.length >= 2,     // 너무 짧으면 요청하지 않는다
});
```

**한글 입력은 특히 주의해야 합니다.** IME 조합 중에도 `onChange`가 발생하므로 `compositionstart`/`compositionend`를 고려하거나 디바운스 시간을 넉넉히 잡아야 합니다.

---

## 폴링 안티패턴

```typescript
// 🔴 탭이 백그라운드여도, 화면을 안 봐도 계속
useEffect(() => {
  const id = setInterval(() => refetch(), 3000);
  return () => clearInterval(id);
}, []);
```

사용자가 탭 20개를 열어두면 서버에 초당 수 회씩 요청이 갑니다. 배터리도 먹습니다.

```typescript
// ✅ 포커스 있을 때만, 실패 시 간격 늘리기
useQuery({
  queryKey: ['status'],
  queryFn: getStatus,
  refetchInterval: (query) => {
    if (query.state.error) return 30_000;         // 실패 중이면 느리게
    return document.hidden ? false : 5_000;       // 백그라운드면 중단
  },
  refetchIntervalInBackground: false,
});
```

**더 나은 선택지를 먼저 검토하세요.** 서버 전송 이벤트(SSE)나 웹소켓이 가능하면 폴링보다 거의 언제나 낫습니다.

---

## 에러를 사용자 언어로 번역하지 않기

```tsx
// 🔴 사용자가 이걸 보고 무엇을 할 수 있나
{error && <div>{error.message}</div>}
// "Request failed with status code 422"
// "Cannot read properties of undefined (reading 'data')"
```

```typescript
// ✅ 에러를 분류하고, 각각에 행동 가능한 메시지를 준다
function toUserMessage(error: unknown): { title: string; action?: string } {
  if (error instanceof HttpError) {
    switch (error.status) {
      case 401: return { title: '로그인이 만료되었습니다', action: '다시 로그인' };
      case 403: return { title: '이 작업을 수행할 권한이 없습니다' };
      case 404: return { title: '요청하신 항목을 찾을 수 없습니다' };
      case 409: return { title: '다른 사용자가 먼저 수정했습니다', action: '새로고침' };
      case 422: return { title: '입력값을 다시 확인해 주세요' };
      case 429: return { title: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요' };
      default:  return { title: '일시적인 오류가 발생했습니다', action: '다시 시도' };
    }
  }
  if (!navigator.onLine) return { title: '인터넷 연결을 확인해 주세요', action: '다시 시도' };
  return { title: '알 수 없는 오류가 발생했습니다', action: '다시 시도' };
}
```

**좋은 에러 메시지의 조건 세 가지:** 무엇이 잘못됐는지, 사용자 잘못인지 아닌지, 이제 무엇을 하면 되는지.

---

## 캐시 무효화 — 양극단

```typescript
// 🔴 아무것도 무효화하지 않음 — 저장했는데 목록이 안 바뀜
await api.updateOrder(id, data);

// 🔴 전부 무효화 — 화면의 모든 데이터를 다시 받음
queryClient.invalidateQueries();
```

```typescript
// ✅ 영향 범위만 정확히
await api.updateOrder(id, data);
queryClient.invalidateQueries({ queryKey: ['orders'] });        // 목록
queryClient.invalidateQueries({ queryKey: ['order', id] });     // 상세
// 하지만 ['users']나 ['settings']는 건드리지 않는다
```

**쿼리 키 설계가 곧 무효화 정책 설계입니다.** 일반적인 것에서 구체적인 것 순으로 배열을 구성하면(`['orders', filters]`) 계층적 무효화가 자연스럽게 됩니다.

---

## 요약

| 안티패턴 | 증상 | 해법 |
|---|---|---|
| 순차 await | 응답 시간이 합산됨 | `Promise.all`, 시작/대기 분리 |
| 컴포넌트 계층 워터폴 | 스켈레톤이 순차로 채워짐 | 상위 병렬 시작, prefetch, Suspense |
| N+1 요청 | Network 탭에 같은 요청 100개 | 배치 API, 서버 조인, DataLoader |
| 재시도 없음 | 일시적 오류가 최종 실패로 | 지수 백오프 + 지터 |
| 무분별한 재시도 | 중복 결제, 서버 과부하 | 멱등성 키, `shouldRetry` |
| 타임아웃 없음 | 무한 스피너 | `AbortSignal.timeout` |
| 취소 없음 | 경쟁 상태, 옛 데이터 표시 | `AbortController` |
| 부분 실패 미처리 | 위젯 하나 때문에 페이지 전체 에러 | `Promise.allSettled` |
| 롤백 없는 낙관 업데이트 | 새로고침하면 사라짐 | `onMutate`/`onError` 5단계 |
| 전체 화면 스피너 | 문맥 상실, 스크롤 초기화 | `keepPreviousData` |
| 디바운스 없는 검색 | 요청 폭풍 | `useDeferredValue`, 최소 길이 |
| 무제한 폴링 | 서버 부하, 배터리 | 포커스 기반, 백오프, SSE 검토 |
| 날것의 에러 메시지 | 사용자가 뭘 할지 모름 | 분류 + 행동 가능한 문구 |

**관통하는 원리 세 개**

1. **요청을 시작하는 시점과 기다리는 시점을 분리하라.** 워터폴 대부분이 여기서 해결됩니다.
2. **실패 경로가 없는 코드는 미완성이다.** 재시도·타임아웃·취소·롤백 중 하나라도 빠지면 검토가 덜 된 것입니다.
3. **실패는 격리하라.** 위젯 하나의 실패가 페이지 전체를 무너뜨리면 안 됩니다.

---

## 다음 편

**6편 — 번들·빌드·경계의 안티패턴**

병목 2순위인 번들을 다룹니다. 트리셰이킹이 실패하는 이유, 라이브러리를 통째로 끌어오는 문제, 코드 분할의 잘못된 단위, `"use client"` 커트라인을 어디에 그어야 하는지, 그리고 가장 조용하고 위험한 것 — 환경변수를 통한 비밀 유출.
