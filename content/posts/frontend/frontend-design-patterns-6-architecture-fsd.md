---
# 📌 기본 메타데이터
title: '프론트엔드 디자인 패턴 (6) — 폴더 구조는 의존성 규칙이다: FSD와 기계적 강제'
date: '2026-09-14'
category: 'frontend'
tags: ['Architecture', 'FSD', 'Feature-Sliced Design', 'ESLint', 'Clean Architecture', 'Next.js']
description: '폴더 구조 논쟁을 의존성 규칙 논쟁으로 환원한다. FSD 레이어 설계, 공개 API, 그리고 ESLint와 dependency-cruiser로 그 규칙을 CI에서 강제하는 법.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 디자인 패턴'
seriesOrder: 6

# 📚 SEO용
keywords: ['Architecture', 'FSD', 'Feature-Sliced Design', 'ESLint', 'Clean Architecture', 'Next.js', '프론트엔드 디자인 패턴']
---

# 프론트엔드 디자인 패턴 (6) — 폴더 구조는 의존성 규칙이다

폴더 구조 논쟁은 회의실에서 가장 소모적인 주제 중 하나입니다. `components/`인가 `features/`인가, `utils`인가 `lib`인가, 파일명은 kebab-case인가 PascalCase인가.

이 논쟁이 소모적인 이유는 **잘못된 층위에서 하기 때문**입니다. 진짜 질문은 이것입니다.

> **누가 누구를 import해도 되는가?**

폴더는 그 규칙을 눈에 보이게 만든 장치입니다. 규칙이 먼저고 폴더가 나중입니다. 그리고 2편에서 Rules of Hooks를 보며 확인했던 원리가 여기서 다시 나옵니다 — **정적 검증기가 없는 규칙은 규칙이 아니라 희망사항입니다.**

---

## 1. 구조가 무너지는 순서

### 1단계 — 기술별 분류

```
src/
  components/
  hooks/
  utils/
  api/
  types/
  constants/
```

모든 튜토리얼의 기본값이고, 파일 30개까지는 아무 문제 없습니다. 무너지는 지점은 두 곳입니다.

**첫째, 하나의 변경이 여러 폴더로 흩어집니다.** "주문 취소 기능에 사유 입력을 추가해 주세요"를 하려면 `components/OrderCancelModal.tsx`, `hooks/useOrderCancel.ts`, `api/orders.ts`, `types/order.ts`, `constants/cancelReasons.ts` 다섯 폴더를 오갑니다. **응집도가 폴더 구조와 반대 방향입니다.**

**둘째, 무엇을 지워도 되는지 알 수 없습니다.** `utils/formatCurrency.ts`를 지워도 되나? 전역 검색을 해야 하고, 검색해도 동적 import나 재export를 통한 사용은 놓칩니다. **삭제할 수 없는 코드는 계속 쌓입니다.**

### 2단계 — 기능별 분류

```
src/
  features/
    orders/     { components/, hooks/, api/, types.ts }
    users/
    reports/
  shared/
```

응집도가 맞춰집니다. 기능 하나를 통째로 지울 수 있게 되고, 신규 입사자가 "주문 관련은 여기"라고 이해할 수 있게 됩니다. 큰 진전입니다.

그런데 여섯 달쯤 지나면 이렇게 됩니다.

```typescript
// features/orders/components/OrderRow.tsx
import { UserAvatar } from '../../users/components/UserAvatar';
import { useReportFilter } from '../../reports/hooks/useReportFilter';

// features/users/components/UserDetail.tsx
import { OrderHistory } from '../../orders/components/OrderHistory';   // ← 순환
```

**기능 간 import에 아무 규칙이 없습니다.** `orders → users → orders` 순환이 생기고, 아무도 눈치채지 못합니다. 동작은 하니까요.

### 순환 참조가 실제로 망가뜨리는 것

"순환 참조는 나쁘다"는 말은 많이 듣지만, 구체적으로 뭐가 나빠지는지는 덜 이야기됩니다.

**1) 초기화 순서가 `undefined`를 만듭니다.**

```typescript
// a.ts
import { b } from './b';
export const a = 'A';
export const combined = a + b;    // b가 아직 초기화 전이면 undefined

// b.ts
import { a } from './a';
export const b = a + 'B';         // a도 아직 초기화 전
```

ESM은 순환을 허용하지만 **평가 순서에 따라 일부가 TDZ이거나 `undefined`** 입니다. 함수 안에서만 쓰면 대부분 괜찮지만, 모듈 최상위에서 값을 계산하는 순간 터집니다. 그리고 이 버그는 **import 순서가 바뀌는 리팩터링에서 갑자기 나타납니다.**

**2) 코드 분할이 실패합니다.** `orders`와 `users`가 서로를 참조하면 번들러는 둘을 분리할 수 없습니다. 하나를 lazy load하려 해도 다른 하나가 딸려옵니다.

**3) 테스트를 격리할 수 없습니다.** `orders`를 테스트하려는데 `users`가 딸려오고, `users`가 인증 컨텍스트를 요구하고, 그래서 테스트마다 앱 전체를 마운트하게 됩니다.

**4) 삭제가 불가능해집니다.** `reports` 기능을 없애려는데 `orders`가 참조하고 있고, 그 참조를 빼려니 `users`가... 결국 죽은 코드가 영구히 남습니다.

### 3단계 — 층에 순서를 매기기

```
app → pages → widgets → features → entities → shared
```

**규칙은 두 줄입니다.**

1. 위 층은 아래 층만 import할 수 있다
2. 같은 층의 다른 슬라이스는 import할 수 없다

이게 **비순환 의존성 원칙(Acyclic Dependencies Principle)** 을 폴더로 표현한 것입니다. 방향이 한쪽으로만 나 있으니 순환이 구조적으로 불가능합니다.

---

## 2. FSD 레이어를 실제로 채워보기

추상적인 정의보다 실제 예가 낫습니다. KPI 대시보드를 예로 들겠습니다.

```
src/
  app/                          # 앱 초기화: 프로바이더, 라우터, 전역 스타일
    providers/
    styles/

  pages/                        # 라우트 단위 조립 (Next.js와 충돌 시 views/로 개명)
    dashboard/
    project-detail/

  widgets/                      # 여러 feature를 조합한 자족적 UI 블록
    kpi-summary-panel/
    project-progress-chart/
    header/

  features/                     # 사용자가 하는 '행위' — 동사
    update-kpi-target/
    export-report/
    filter-by-discipline/
    toggle-project-favorite/

  entities/                     # 도메인 명사 — 데이터 모델 + 그 표현
    project/
    kpi/
    discipline/
    user/

  shared/                       # 도메인을 모르는 것
    ui/                         # Button, Input, Modal
    lib/                        # 날짜 포맷, 숫자 포맷
    api/                        # fetch 클라이언트, 인터셉터
    config/
```

### 레이어별 판별 질문

| 레이어 | 판별 질문 | 예 |
|---|---|---|
| `shared` | 이 프로젝트의 도메인을 몰라도 이해되는가? | `<Button>`, `formatDate`, `apiClient` |
| `entities` | 도메인의 **명사**인가? | `Project`, `KPI`, `ProjectCard` |
| `features` | 사용자가 하는 **동사**인가? | `update-kpi-target`, `export-report` |
| `widgets` | 여러 feature를 조합한 화면 한 덩어리인가? | `kpi-summary-panel` |
| `pages` | 라우트 하나에 대응하는가? | `/dashboard` |
| `app` | 앱 전체에 한 번만 있는 것인가? | Provider 조립, 라우터 |

### 가장 어려운 경계 — entities vs features

실전에서 90%의 혼란이 여기서 나옵니다. 기준을 명확히 하면 이렇습니다.

**`entities`는 데이터와 그 표현을 소유합니다. 변경(mutation)은 소유하지 않습니다.**

```typescript
// entities/project/model/types.ts
export type Project = { id: string; name: string; progress: number; disciplineId: string };

// entities/project/api/getProject.ts
export const projectQueries = {
  detail: (id: string) => ({ queryKey: ['project', id], queryFn: () => api.get(`/projects/${id}`) }),
  list: (filter: Filter) => ({ queryKey: ['projects', filter], queryFn: () => api.get('/projects', filter) }),
};

// entities/project/ui/ProjectCard.tsx — 표현만, 행위는 slot으로 받는다
export function ProjectCard({ project, actions }: { project: Project; actions?: ReactNode }) {
  return (
    <article>
      <h3>{project.name}</h3>
      <ProgressBar value={project.progress} />
      <footer>{actions}</footer>      {/* ← feature가 여기 꽂힌다 */}
    </article>
  );
}
```

**`features`는 행위를 소유합니다.**

```typescript
// features/toggle-project-favorite/ui/FavoriteButton.tsx
import { type Project } from '@/entities/project';       // 아래 층 참조 — OK

export function FavoriteButton({ project }: { project: Project }) {
  const mutation = useToggleFavorite(project.id);
  return <IconButton onClick={() => mutation.mutate()} pressed={project.isFavorite} />;
}
```

그리고 **둘을 합치는 건 위층의 일입니다.**

```tsx
// widgets/project-list/ui/ProjectList.tsx
import { ProjectCard, projectQueries } from '@/entities/project';
import { FavoriteButton } from '@/features/toggle-project-favorite';

export function ProjectList({ filter }: { filter: Filter }) {
  const { data } = useQuery(projectQueries.list(filter));
  return (
    <ul>
      {data?.map(p => (
        <li key={p.id}>
          <ProjectCard project={p} actions={<FavoriteButton project={p} />} />
        </li>
      ))}
    </ul>
  );
}
```

> **주목할 점:** `ProjectCard`가 `actions`를 slot으로 받는 구조는 3편의 **제어의 역전** 그대로입니다. entity는 "무엇을 할 수 있는지" 몰라야 하고, 그래서 결정을 위층에 위임합니다. **아키텍처 레이어와 컴포넌트 API 설계가 같은 원리를 씁니다.**

### 같은 층끼리 못 부르면 어떻게 하나

`features/export-report`가 `features/filter-by-discipline`의 현재 필터 값이 필요하다면? 세 가지 길이 있습니다.

1. **공통 부분을 아래 층으로 내린다.** 필터 상태를 `entities/discipline`이나 `shared`의 스토어로 옮기고 둘 다 거기서 읽습니다.
2. **위층이 연결한다.** `widget`이 `filter`의 값을 받아 `export`에 prop으로 넘깁니다.
3. **애초에 한 feature였던 것 아닌가 다시 본다.** 두 feature가 서로를 계속 필요로 하면 경계가 잘못 그어진 것입니다.

**대부분 2번이 정답입니다.** 그리고 이 제약 덕분에 "이 feature는 혼자서도 말이 되는가"를 계속 점검하게 됩니다.

---

## 3. 공개 API — 슬라이스의 경계선

각 슬라이스는 `index.ts`로만 외부에 노출합니다.

```typescript
// entities/project/index.ts
export { ProjectCard } from './ui/ProjectCard';
export { projectQueries } from './api/queries';
export type { Project } from './model/types';
// ProjectCard 내부에서 쓰는 것들은 내보내지 않는다
```

```typescript
import { ProjectCard } from '@/entities/project';                    // ✅
import { ProjectCard } from '@/entities/project/ui/ProjectCard';     // ❌ 내부 침투
```

**이게 왜 중요한가:** 공개 API가 없으면 **리팩터링이 불가능**합니다. 누군가 `ui/ProjectCard`를 직접 import하고 있으면 파일을 옮길 수 없습니다. 공개 API는 "이 안쪽은 내 마음대로 바꾼다"는 선언입니다.

### 배럴 파일의 함정과 대응

`index.ts`(배럴 파일)에는 실제 비용이 있습니다.

**1) 트리셰이킹이 안 될 수 있습니다.** 배럴 하나를 import하면 그 안의 모든 모듈이 평가됩니다. 부수효과가 있는 모듈이 섞여 있으면 번들러가 제거하지 못합니다.

**2) 개발 서버가 느려집니다.** Next.js가 `optimizePackageImports` 설정을 만든 이유입니다.

**대응:**

```typescript
// package.json — 부수효과 없음을 선언하면 번들러가 안전하게 제거한다
{ "sideEffects": false }
```

```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['@/entities/project', '@/shared/ui'],
  },
};
```

그리고 **배럴에서는 `export *`를 쓰지 마세요.** 명시적으로 나열하면 무엇이 공개 API인지 코드에 남고, 번들러도 분석하기 쉽습니다.

---

## 4. 기계적으로 강제하기

여기가 이 편의 핵심입니다. **문서에 적힌 규칙은 3개월이면 무너집니다.** 린터가 막아야 합니다.

### ESLint — 레이어 규칙

```javascript
// eslint.config.js (flat config)
import boundaries from 'eslint-plugin-boundaries';

const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

export default [
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': LAYERS.map(layer => ({
        type: layer,
        pattern: `src/${layer}/*`,
        capture: ['slice'],
      })),
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          // 각 레이어는 자기보다 아래 레이어만 허용
          { from: 'app',      allow: ['pages', 'widgets', 'features', 'entities', 'shared'] },
          { from: 'pages',    allow: ['widgets', 'features', 'entities', 'shared'] },
          { from: 'widgets',  allow: ['features', 'entities', 'shared'] },
          { from: 'features', allow: ['entities', 'shared'] },
          { from: 'entities', allow: ['shared'] },
          { from: 'shared',   allow: ['shared'] },
        ],
      }],

      // 같은 레이어의 다른 슬라이스 금지 (shared 제외)
      'boundaries/no-private': ['error', { allowUncles: false }],
    },
  },
];
```

플러그인 없이 내장 규칙만으로도 가능합니다.

```javascript
// eslint-plugin-import만으로
'import/no-restricted-paths': ['error', {
  zones: [
    { target: './src/shared',   from: './src/entities' },
    { target: './src/shared',   from: './src/features' },
    { target: './src/entities', from: './src/features' },
    { target: './src/entities', from: './src/widgets' },
    { target: './src/features', from: './src/widgets' },
    { target: './src/features', from: './src/pages' },
    { target: './src/widgets',  from: './src/pages' },
  ],
}],
```

### 슬라이스 내부 침투 금지

```javascript
'no-restricted-imports': ['error', {
  patterns: [
    {
      group: ['@/entities/*/*', '@/features/*/*', '@/widgets/*/*'],
      message: '슬라이스 내부를 직접 import하지 마세요. 공개 API(index.ts)를 사용하세요.',
    },
  ],
}],
```

### 순환 참조 검출 — dependency-cruiser

ESLint의 `import/no-cycle`은 큰 프로젝트에서 매우 느립니다. 전용 도구가 낫습니다.

```javascript
// .dependency-cruiser.cjs
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '순환 의존성은 초기화 순서 버그와 코드 분할 실패를 만듭니다.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: '아무도 참조하지 않는 모듈 — 삭제 후보입니다.',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)app/'] },
      to: {},
    },
    {
      name: 'layers-downward-only',
      severity: 'error',
      from: { path: '^src/entities' },
      to: { path: '^src/(features|widgets|pages|app)' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
  },
};
```

```json
{
  "scripts": {
    "arch:check": "depcruise src --config .dependency-cruiser.cjs",
    "arch:graph": "depcruise src --config .dependency-cruiser.cjs --output-type dot | dot -T svg > deps.svg"
  }
}
```

**`arch:graph`로 의존성 그래프를 SVG로 뽑아 보세요.** 처음 실행하면 대부분 충격을 받습니다. 머릿속 구조와 실제 import 그래프는 거의 항상 다릅니다.

### CI에 걸기

```yaml
# .github/workflows/ci.yml
- name: 아키텍처 규칙 검사
  run: |
    npm run lint
    npm run arch:check
```

**규칙이 CI를 빨갛게 만들지 않으면 그건 규칙이 아니라 위키 문서입니다.**

---

## 5. Next.js App Router와 어떻게 공존하나

실무에서 가장 자주 막히는 지점입니다. App Router는 `app/` 디렉터리로 **라우팅을 강제**하는데, FSD에도 `app`과 `pages` 레이어가 있습니다. 이름이 둘 다 충돌합니다.

**정착된 해법:**

```
app/                          # Next.js 라우팅 전용 — 얇게 유지
  layout.tsx
  dashboard/page.tsx          # src/views/dashboard를 렌더하기만 한다
  projects/[id]/page.tsx

src/
  views/                      # FSD의 pages 레이어를 개명
    dashboard/
    project-detail/
  widgets/
  features/
  entities/
  shared/
```

```tsx
// app/dashboard/page.tsx — 라우팅 어댑터일 뿐
import { DashboardPage } from '@/views/dashboard';

export const metadata = { title: 'KPI 대시보드' };
export default function Page() {
  return <DashboardPage />;
}
```

**`app/`은 프레임워크에 속한 어댑터 층으로 취급하고, 실제 구조는 `src/` 안에 둡니다.** 이렇게 하면 라우팅 규약 변경(Pages Router → App Router 같은)이 앱 구조 전체를 흔들지 않습니다. 헥사고날 아키텍처에서 말하는 **어댑터** 그 자체입니다.

**RSC 경계와의 관계도 챙겨야 합니다.** 1편에서 `"use client"`가 의존성 그래프의 커트라인이라고 했죠. FSD 레이어와 겹쳐 보면:

- `entities`의 순수 표현 컴포넌트, `shared/lib`의 포맷터 → 서버에서도 돌아감
- `features`의 상호작용 컴포넌트 → 대체로 `"use client"`
- `shared/ui`의 Button 같은 것 → 클라이언트 (이벤트 핸들러 때문에)

**`"use client"`를 `widgets`나 `views`에 붙이면 그 아래 전부가 클라이언트 번들로 끌려갑니다.** 가능한 한 `features`와 `shared/ui`의 잎 수준에 붙이세요. 레이어 구조가 있으면 이 판단이 훨씬 쉬워집니다.

---

## 6. 언제 FSD가 과한가

솔직하게 말하면, **대부분의 프로젝트에는 FSD가 과합니다.**

### 도입 신호

- 파일 200개 이상
- 개발자 3명 이상이 동시에 작업
- 수명 1년 이상
- "이거 지워도 되나요?"라는 질문이 주에 한 번 이상 나옴
- 같은 컴포넌트의 변종이 세 개 이상 존재

### 과잉 신호

- 슬라이스마다 파일이 두 개뿐인데 폴더가 네 겹
- `index.ts`가 실제 코드보다 많음
- 새 기능 추가에 "이건 entity인가 feature인가" 30분 토론
- 혼자 하는 사이드 프로젝트

### 점진적 도입 경로

전부 한 번에 하지 마세요. 값하는 순서가 있습니다.

**1단계 — `shared`만 분리한다.** 도메인을 모르는 것들을 밖으로 빼고, `shared`가 위쪽을 import하지 못하게 막습니다. 이것만으로도 순환의 상당수가 사라집니다.

**2단계 — 기능별 폴더로 재배치한다.** 기술별 → 기능별. 아직 레이어는 없습니다.

**3단계 — 순환을 CI에서 막는다.** `dependency-cruiser`의 `no-circular`만 켭니다. 기존 순환은 목록으로 남기고 새로 생기는 것만 막는 식으로 시작할 수 있습니다.

**4단계 — 레이어를 도입한다.** 여기까지 왔는데도 아프면 그때 합니다.

**대부분의 팀은 3단계에서 충분합니다.**

---

## 7. Clean Architecture를 프론트에 얹을 때

1편에서 짧게 언급한 것을 확장합니다.

백엔드 클린 아키텍처의 핵심은 **의존성 역전**입니다. 도메인이 DB를 모르게 하려고 인터페이스를 도메인 쪽에 두고, 구현을 바깥에 둡니다.

```typescript
// 프론트엔드에서 이걸 그대로 하면
interface ProjectRepository { findById(id: string): Promise<Project>; }
class HttpProjectRepository implements ProjectRepository { /* ... */ }
class GetProjectUseCase {
  constructor(private repo: ProjectRepository) {}
  async execute(id: string) { return this.repo.findById(id); }
}
class ProjectDTO { static toDomain(dto: unknown): Project { /* ... */ } }
```

**버튼 하나 만드는 데 파일 여섯 개**가 됩니다.

### 왜 과잉이 되는가

**프론트엔드에서 "가장 안쪽"이 무엇인지가 불분명하기 때문입니다.**

백엔드에서 가장 안쪽(비즈니스 규칙)은 진짜로 오래 삽니다. 그런데 프론트엔드에서는:

- 가장 자주 바뀌는 것 = UI
- 가장 안 바뀌는 것 = **서버 API 계약**

바깥에 있어야 할 것이 실질적으로 가장 안정적입니다. 그래서 의존성을 역전시켜 봐야 보호할 대상이 없습니다. **레이어를 쌓았는데 안쪽이 비어 있는 셈입니다.**

### 값하는 경우

프론트엔드에도 진짜 도메인 로직이 있는 제품이 있습니다.

- 오프라인 우선 앱 (서버 없이도 완결된 규칙이 돌아감)
- 협업 편집기 (CRDT, 충돌 해결, 히스토리)
- 캔버스/CAD 툴 (기하 연산, undo 스택, 제약 해결)
- 복잡한 계산기 (세금, 견적, 시뮬레이션)

**판별 질문:** 이 앱에 **서버가 없어도 의미가 있는 로직**이 있는가? 있다면 그걸 `entities`나 별도 `domain` 레이어로 격리할 값이 있습니다. 없다면 FSD의 여섯 레이어로 충분합니다.

### 모노레포로 올라가면

팀이 더 커지면 폴더 대신 **패키지 경계**로 강제할 수 있습니다.

```json
// packages/features/package.json
{
  "name": "@app/features",
  "dependencies": {
    "@app/entities": "workspace:*",
    "@app/shared": "workspace:*"
  }
}
```

`features`의 `package.json`에 `widgets`가 없으면 **import 자체가 해석되지 않습니다.** 린터가 아니라 모듈 해석기가 막습니다. 가장 강한 강제이고, 그래서 규칙이 절대 무너지지 않습니다. 대신 패키지 관리 비용이 붙으므로 팀 규모가 정당화해야 합니다.

---

## 요약

| 강제 수준 | 수단 | 깨질 수 있나 |
|---|---|---|
| 없음 | 위키 문서, 코드 리뷰 컨벤션 | 3개월 |
| 약함 | 폴더 구조만 | 사람이 마음먹으면 언제든 |
| 중간 | ESLint 규칙 | `eslint-disable` 한 줄 |
| 강함 | CI에서 dependency-cruiser | PR을 막음 |
| 최강 | 패키지 경계 (모노레포) | 모듈 해석 자체가 실패 |

**관통하는 원리 셋:**

1. **폴더는 의존성 규칙의 물리적 표현이다.** 구조를 정하기 전에 "누가 누구를 부를 수 있는가"를 먼저 정하세요.
2. **정적 검증기가 없는 규칙은 규칙이 아니다.** 2편의 Rules of Hooks가 ESLint 없이 성립하지 않듯, 레이어 규칙도 CI 없이는 성립하지 않습니다.
3. **구조의 비용은 팀 규모와 수명이 정당화해야 한다.** FSD를 혼자 하는 사이드 프로젝트에 넣으면 순수한 비용입니다.

---

## 다음 편

**7편 — GoF 패턴의 프론트엔드 번역 (시리즈 완결)**

1편에서 "GoF 23개 중 극소수만 살아남았다"고 했습니다. 마지막 편에서 그 목록을 하나씩 검증합니다. 실제 라이브러리 코드 — React, Redux, Radix, TanStack Query, Zod, Vite — 안에서 고전 패턴이 어떤 모습으로 나타나는지 추적하고, **사라진 패턴들은 왜 사라졌는지**까지 봅니다.
