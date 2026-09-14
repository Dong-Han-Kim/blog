---
# 📌 기본 메타데이터
title: '프론트엔드 안티패턴 (3) — 컴포넌트 설계: 성급한 추상화가 중복보다 비싼 이유'
date: '2026-09-14'
category: 'frontend'
tags: ['React', 'Component Design', 'Abstraction', 'Anti-Pattern', 'Refactoring']
description: '잘못된 추상화의 비용 곡선, God Component를 쪼개는 순서, 컴포넌트 안에서 컴포넌트를 정의할 때 입력값이 사라지는 이유, key={index}가 만드는 정체성 혼란.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 안티패턴'
seriesOrder: 3

# 📚 SEO용
keywords: ['React', 'Component Design', 'Abstraction', 'Anti-Pattern', 'Refactoring', '프론트엔드 안티패턴']
---

# 프론트엔드 안티패턴 (3) — 컴포넌트 설계

컴포넌트 설계의 안티패턴은 두 방향으로 갈립니다.

- **너무 일찍 추상화해서** 아무도 건드릴 수 없는 컴포넌트가 되거나
- **끝까지 추상화하지 않아서** 700줄짜리 페이지가 되거나

둘 다 흔하고, 둘 중에서는 **첫 번째가 훨씬 비쌉니다.** 이유부터 보겠습니다.

---

## 성급한 추상화

### 어떻게 발생하는가

전형적인 경로입니다. 각 단계는 전부 합리적입니다.

**1주차** — 주문 목록과 상품 목록에 비슷한 카드가 있습니다. `<ItemCard>`를 만듭니다. 좋은 판단으로 보입니다.

**3주차** — 사용자 목록에도 씁니다. 그런데 아바타가 필요합니다. `avatar?: ReactNode`를 추가합니다.

**6주차** — 대시보드에 씁니다. 클릭이 안 되어야 합니다. `disabled?: boolean`을 추가합니다.

**10주차** — 모바일에서 다른 레이아웃이 필요합니다. `variant?: 'default' | 'compact'`를 추가합니다.

**6개월차** — prop이 23개입니다. 컴포넌트 안에 `if`가 40개입니다. 새 요구가 오면 사람들이 이렇게 말합니다.

> "ItemCard는 건드리지 말고 새로 하나 만들죠."

이 문장이 나오는 순간 그 추상화는 **실패했습니다.** 그리고 이제 `ItemCard`와 `ItemCard2`가 공존합니다.

### 비용 곡선

1편의 프레임으로 보면 명확합니다.

| | 중복 | 잘못된 추상화 |
|---|---|---|
| 비용 증가 | 선형 (N곳 = N배) | 지수 (조합 폭발) |
| 되돌리기 | 쉬움 (언제든 합칠 수 있음) | 매우 어려움 |
| 위험 | 한 곳 고치고 다른 곳 깜빡 | 한 곳 고치다 모든 곳 파손 |
| 인지 부하 | 낮음 (각각 독립적) | 높음 (전체를 이해해야 함) |

> "duplication is far cheaper than the wrong abstraction."
> — Sandi Metz

**중복을 제거하려다 결합을 만드는 것이 핵심 실수입니다.** 세 개의 카드가 각자 존재하면 서로 독립적이지만, 하나로 합치면 셋이 영원히 묶입니다. 그중 하나의 요구가 바뀔 때마다 나머지 둘이 영향을 받습니다.

### AHA 원칙

> **AHA — Avoid Hasty Abstractions.** 성급한 추상화를 피하라.
> "잘못된 추상화보다 중복을 택하고, 변화에 최적화하기 전에 변화를 기다려라." (Kent C. Dodds)

실용 규칙은 **3의 규칙**입니다.

- **1번째** — 그냥 씁니다
- **2번째** — 복사합니다. 아직 공통점이 뭔지 모릅니다
- **3번째** — 이제 **변하는 축이 보입니다.** 그때 추상화합니다

두 개로는 무엇이 본질이고 무엇이 우연인지 구분할 수 없습니다. 세 개가 되어야 패턴이 드러납니다.

### 잘못된 추상화의 진단 신호

다음 중 두 개 이상이면 이미 잘못된 추상화입니다.

- [ ] prop 이름에 `variant`, `type`, `mode`, `kind`가 있고 값이 4개 이상
- [ ] boolean prop이 5개 이상
- [ ] 컴포넌트 안에서 `if (props.isX)` 분기가 prop마다 존재
- [ ] 어떤 prop 조합은 아무 의미가 없는데 타입이 막지 않음
- [ ] 사용처마다 서로 다른 prop 집합만 씀 (공통으로 쓰는 prop이 거의 없음)
- [ ] 팀에 "그건 건드리면 안 되는 컴포넌트" 라는 합의가 있음

### 되돌리는 법

잘못된 추상화를 고치는 방법은 **더 많은 prop을 추가하는 게 아닙니다.** 반대로 갑니다.

```
1. 인라인화 — 각 사용처에 컴포넌트 내용을 복사해 넣는다 (일시적으로 중복 발생)
2. 각 사용처에서 그 자리에 필요 없는 코드를 지운다
3. 남은 것들을 나란히 놓고 본다 — 이제 진짜 공통점이 보인다
4. 진짜 공통점만 다시 추출한다 (보통 처음보다 훨씬 작다)
```

**2단계가 핵심입니다.** 각 사용처에서 자기와 무관한 분기를 지우고 나면, 세 개의 컴포넌트가 사실 거의 안 닮았다는 걸 발견하는 경우가 많습니다. 그러면 추상화를 되살리지 않는 게 정답입니다.

---

## God Component

반대 방향의 안티패턴입니다. 범용 스멜 **God Object**의 프론트엔드 판본이고, 전형적으로 페이지 컴포넌트에서 나타납니다.

```tsx
export default function DashboardPage() {
  // 상태 12개
  const [filters, setFilters] = useState(...);
  const [sort, setSort] = useState(...);
  const [selected, setSelected] = useState(...);
  const [isModalOpen, setModalOpen] = useState(...);
  // ...

  // 훅 8개
  const { data: rows } = useQuery(...);
  const { data: summary } = useQuery(...);
  // ...

  // 핸들러 15개
  function handleFilterChange() { /* 30줄 */ }
  function handleExport() { /* 50줄 */ }
  // ...

  // 렌더 400줄
  return <div>{/* ... */}</div>;
}
```

### 왜 이렇게 되는가

**컴포넌트를 추가하는 것보다 기존 컴포넌트에 줄을 더하는 게 항상 쉽기 때문**입니다. 새 파일을 만들고, 이름을 정하고, prop 타입을 쓰고, import하는 것보다 그냥 아래에 20줄 붙이는 게 30초 빠릅니다. 그 30초가 200번 쌓입니다.

### 쪼개는 순서

무작정 200줄씩 자르면 응집도가 낮은 조각이 나옵니다. **축을 정해서 잘라야 합니다.**

**1단계 — 로직을 훅으로 뽑는다 (렌더는 건드리지 않음)**

```typescript
function useDashboardFilters() {
  // 필터 관련 상태와 핸들러만
  return { filters, setFilter, resetFilters };
}
function useRowSelection(rows: Row[]) {
  return { selected, toggle, selectAll, clear };
}
```

**이 단계만으로 400줄이 150줄이 되는 경우가 흔합니다.** 그리고 훅은 독립적으로 테스트할 수 있습니다.

**2단계 — 렌더를 "화면 영역"으로 자른다**

레이아웃의 시각적 덩어리와 코드의 덩어리를 일치시킵니다.

```tsx
return (
  <PageLayout>
    <DashboardHeader onExport={handleExport} />
    <FilterBar filters={filters} onChange={setFilter} />
    <SummaryCards data={summary} />
    <DataTable rows={rows} selection={selection} />
  </PageLayout>
);
```

**3단계 — 반복되는 것을 추출한다**

여기서만 3의 규칙을 적용합니다. 2단계까지는 "재사용"이 목적이 아니라 **읽을 수 있게 만드는 것**이 목적이므로, 한 번만 쓰이는 컴포넌트를 만들어도 괜찮습니다.

### 추출 판단 기준

| 기준 | 추출한다 | 두고 본다 |
|---|---|---|
| 길이 | 렌더가 100줄 넘음 | 30줄 이하 |
| 관심사 | 독립적으로 설명 가능 | 위아래와 얽혀 있음 |
| 상태 | 자기만의 상태가 있음 | 부모 상태만 읽음 |
| 테스트 | 단독 테스트가 의미 있음 | 의미 없음 |
| 이름 | 좋은 이름이 바로 떠오름 | `Section2` 같은 이름밖에 안 나옴 |

**마지막 줄이 의외로 강력한 기준입니다.** 좋은 이름이 안 떠오르면 경계를 잘못 그은 것입니다.

---

## 컴포넌트 안에서 컴포넌트 정의하기

버그의 원인을 찾기 가장 어려운 안티패턴 중 하나입니다.

### 코드

```tsx
function OrderTable({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState('');

  // 🔴 매 렌더마다 새로 정의된다
  function Row({ order }: { order: Order }) {
    const [memo, setMemo] = useState('');
    return (
      <tr>
        <td>{order.id}</td>
        <td><input value={memo} onChange={e => setMemo(e.target.value)} /></td>
      </tr>
    );
  }

  return (
    <>
      <input value={filter} onChange={e => setFilter(e.target.value)} />
      <table><tbody>
        {orders.map(o => <Row key={o.id} order={o} />)}
      </tbody></table>
    </>
  );
}
```

### 무슨 일이 일어나는가

React의 재조정(reconciliation)은 **엘리먼트의 `type`이 같은지**로 "같은 컴포넌트인가"를 판단합니다.

```javascript
// 렌더 1회차
<Row key="1" />   // type: function Row(...) — 참조 A

// 렌더 2회차 (filter에 한 글자 입력)
<Row key="1" />   // type: function Row(...) — 참조 B (새 함수!)
```

`A !== B` 이므로 React는 **다른 종류의 컴포넌트라고 판단하고 서브트리를 통째로 파괴한 뒤 새로 만듭니다.** `key`가 같아도 소용없습니다 — `key`는 같은 타입 안에서의 정체성이지 타입 자체를 대체하지 않습니다.

### 실제 증상

- **입력 중이던 값이 사라진다** — `memo` 상태가 매번 초기화됨
- **포커스가 풀린다** — DOM 노드가 교체되므로
- **애니메이션이 계속 처음부터 다시 시작한다**
- **스크롤 위치가 튄다**
- **성능이 나쁘다** — 매번 전체 마운트

가장 흔한 신고 형태는 **"필터 입력창에 타이핑하면 표 안의 메모가 지워져요"** 입니다. 원인과 증상이 멀어서 찾기 어렵습니다.

### 수정

```tsx
// 바깥으로 꺼낸다 — 참조가 안정적이다
function Row({ order }: { order: Order }) { /* ... */ }

function OrderTable({ orders }: { orders: Order[] }) { /* ... */ }
```

### 같은 뿌리의 변종들

```tsx
function Page() {
  // 🔴 렌더마다 새 styled 컴포넌트 생성 (클래스도 매번 새로 만들어짐)
  const Wrapper = styled.div`padding: 16px;`;

  // 🔴 렌더마다 새 HOC 적용
  const Enhanced = withAuth(SomeComponent);

  // 🔴 렌더마다 새 memo 래퍼 — memo가 아무 효과 없음
  const Memoized = React.memo(Child);

  // 🔴 렌더마다 새 lazy 컴포넌트 — 매번 다시 로딩
  const Lazy = React.lazy(() => import('./Heavy'));
}
```

**전부 같은 병입니다. 컴포넌트 타입을 렌더 중에 만들면 안 됩니다.**

### 예외 — 이건 괜찮습니다

```tsx
// 함수가 아니라 "엘리먼트"를 만드는 건 문제없다
const header = <Header title={title} />;

// 렌더 프롭도 문제없다 — 컴포넌트 타입이 아니라 호출되는 함수다
<List renderItem={(item) => <Row item={item} />} />
```

**차이는 "React가 그것을 컴포넌트 타입으로 쓰는가"입니다.** `renderItem`은 그냥 호출되는 함수이고, 그 반환값인 `<Row>`의 타입은 안정적입니다.

---

## `key={index}`

### 무엇이 깨지는가

```tsx
{todos.map((todo, i) => (
  <TodoItem key={i} todo={todo} />   // 🔴
))}
```

`key`는 **"이 자리에 있던 게 그것과 같은 것인가"** 를 판단하는 근거입니다. 인덱스를 쓰면 "0번 자리에 있는 것"이 곧 정체성이 됩니다.

목록 맨 앞에 항목을 추가하면:

```
이전: [A(key=0), B(key=1), C(key=2)]
이후: [Z(key=0), A(key=1), B(key=2), C(key=3)]
```

React는 "0번은 내용만 바뀌었고, 1번도 내용만 바뀌었고..."로 해석합니다. **모든 항목의 DOM이 재사용되면서 내용만 갈아끼워집니다.** 그 결과:

- `TodoItem` 내부 상태(편집 중인 텍스트, 체크 여부)가 **한 칸씩 밀립니다**
- 입력 포커스가 엉뚱한 항목으로 옮겨갑니다
- 애니메이션이 잘못된 항목에 적용됩니다

### index가 괜찮은 경우

다음 **세 조건을 모두** 만족할 때만 안전합니다.

1. 목록이 절대 재정렬되지 않음
2. 항목이 추가/삭제되지 않음 (또는 끝에만 추가됨)
3. 항목에 내부 상태가 없음

정적인 표시용 목록 정도입니다. 조건이 하나라도 깨질 가능성이 있으면 안정적인 ID를 쓰세요.

### ID가 없는 데이터라면

```typescript
// 데이터를 받을 때 한 번 부여한다
const withIds = useMemo(
  () => rawItems.map(item => ({ ...item, _key: crypto.randomUUID() })),
  [rawItems]
);
```

**절대 렌더 중에 `Math.random()`이나 `crypto.randomUUID()`를 `key`로 쓰지 마세요.** 매 렌더 새 key가 되어 모든 항목이 매번 재생성됩니다. `key={index}`보다 나쁩니다.

---

## 조건부 렌더 스파게티

```tsx
{isLoading ? <Spinner /> : error ? <Error /> : data?.length ? (
  isAdmin ? (
    isEditMode ? <AdminEditTable data={data} /> : <AdminTable data={data} />
  ) : <Table data={data} />
) : <Empty />}
```

### 해법 1 — 조기 반환

```tsx
function OrderList({ ... }) {
  if (isLoading) return <Spinner />;
  if (error) return <ErrorView error={error} />;
  if (!data?.length) return <Empty />;
  if (!isAdmin) return <Table data={data} />;
  return isEditMode ? <AdminEditTable data={data} /> : <AdminTable data={data} />;
}
```

중첩이 사라지고 각 조건이 독립적으로 읽힙니다. **조기 반환은 중첩을 선형으로 바꾸는 가장 값싼 도구입니다.**

### 해법 2 — 상태 머신 (2편 연결)

로딩 계열은 판별 유니온으로 `switch` 하나에 담습니다.

### 해법 3 — 컴포넌트로 분리

조건이 **권한**이나 **역할** 같은 축이면 컴포넌트 경계로 삼는 게 낫습니다.

```tsx
{isAdmin ? <AdminOrderList data={data} /> : <OrderList data={data} />}
```

한 컴포넌트에서 `isAdmin`으로 20군데 분기하는 것보다, 두 컴포넌트가 공통 부분을 합성하는 편이 읽기도 고치기도 쉽습니다.

---

## prop 폭발과 boolean 플래그

```tsx
<Button primary secondary large small outlined ghost disabled loading fullWidth rounded />
```

`primary`와 `secondary`를 동시에 줄 수 있습니다. 조합이 2¹⁰ = 1024개인데 유효한 건 스무 개쯤입니다.

```tsx
// 상호배타적인 것은 유니온으로
type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  state?: 'idle' | 'loading' | 'disabled';
  fullWidth?: boolean;   // 이건 정말 독립적이므로 boolean이 맞다
};
```

**판별 기준: 다른 값과 동시에 참일 수 있으면 boolean, 아니면 유니온.**

### render prop이 네 개를 넘어가면

```tsx
// 안티패턴
<Table renderHeader={...} renderRow={...} renderFooter={...} renderEmpty={...} />

// 합성으로
<Table>
  <Table.Header>...</Table.Header>
  <Table.Body>...</Table.Body>
  <Table.Empty>결과 없음</Table.Empty>
</Table>
```

**기준: 항목마다 반복되며 인자가 필요하면 함수, 한 번만 나오는 영역이면 합성.**

---

## 인라인 객체·배열 prop

```tsx
// 🔴 매 렌더 새 참조 → memo가 무력화된다
<Chart options={{ responsive: true, legend: { position: 'top' } }} />
<List items={rows.filter(r => r.active)} />
<Button style={{ marginTop: 8 }} />
```

`React.memo`로 감싼 자식이라도 prop 참조가 매번 바뀌면 항상 리렌더됩니다. 자식이 무거우면 실제 비용이 됩니다.

```tsx
// 모듈 스코프로 올리거나 (상수라면)
const CHART_OPTIONS = { responsive: true, legend: { position: 'top' } } as const;

// useMemo로 (계산이 필요하면)
const activeRows = useMemo(() => rows.filter(r => r.active), [rows]);
```

다만 **이걸 모든 prop에 기계적으로 적용하지는 마세요.** 자식이 가벼우면 `useMemo` 비용이 더 큽니다. 4편에서 이 판단을 다룹니다.

---

## "재사용 가능하게" 강박

```tsx
// 한 곳에서만 쓰는데 이렇게 만든다
type GenericDataDisplayProps<T, K extends keyof T> = {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  errorState?: (error: Error) => ReactNode;
  onItemClick?: (item: T, index: number) => void;
  // ...
};
```

**아직 존재하지 않는 요구사항을 위해 지금 복잡도를 지불하는 것**입니다. 그리고 실제로 두 번째 사용처가 생기면 대개 예상과 다른 모양이어서, 이 제네릭이 맞지 않습니다.

> **YAGNI — You Aren't Gonna Need It.**

한 곳에서만 쓰는 컴포넌트는 그 자리에 맞게 구체적으로 쓰세요. 재사용은 **두 번째 사용처가 실제로 나타난 뒤에** 고민하는 것입니다.

---

## 요약

| 안티패턴 | 증상 | 해법 |
|---|---|---|
| 성급한 추상화 | prop 23개, 아무도 안 건드림 | 3의 규칙, 인라인화 후 재추출 |
| God Component | 700줄 페이지 | 훅 추출 → 영역 분할 → 반복 추출 |
| 컴포넌트 안 컴포넌트 | 입력값이 사라짐, 포커스 풀림 | 바깥으로 꺼내기 |
| `key={index}` | 상태가 한 칸씩 밀림 | 안정적 ID |
| 조건부 렌더 스파게티 | 읽을 수 없음 | 조기 반환, 상태 머신, 분리 |
| boolean 플래그 폭발 | 무의미한 조합이 타입 통과 | 유니온 |
| 인라인 객체 prop | memo 무력화 | 상수화 또는 useMemo |
| 과잉 제네릭 | 한 곳에서 쓰는데 타입이 20줄 | YAGNI |

**관통하는 원리 세 개**

1. **추상화는 되돌리기 어렵고 중복은 쉽다.** 확신이 없으면 중복을 택하세요.
2. **컴포넌트의 정체성은 타입 참조로 결정된다.** 렌더 중에 타입을 만들면 정체성이 매번 바뀝니다.
3. **좋은 이름이 안 떠오르면 경계가 틀린 것이다.** `Section2`는 경계를 다시 그으라는 신호입니다.

---

## 다음 편

**4편 — 렌더링과 성능의 안티패턴**

`React.memo` 도배와 측정 없는 방치 — 양극단이 왜 같은 병인지, 실제 성능 병목의 순서는 어떻게 되는지, 레이아웃 스래싱과 컴포지팅처럼 React 바깥에서 벌어지는 일들, 그리고 무엇을 어떤 도구로 측정할지를 다룹니다.
