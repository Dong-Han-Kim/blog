---
# 📌 기본 메타데이터
title: '프론트엔드 안티패턴 (6) — 번들과 경계: 트리셰이킹은 왜 실패하는가'
date: '2026-09-14'
category: 'frontend'
tags: ['Bundling', 'Tree Shaking', 'Code Splitting', 'Next.js', 'RSC', 'Anti-Pattern']
description: '번들을 한 번도 열어보지 않는 것에서 시작해, 트리셰이킹이 실패하는 다섯 가지 이유, 코드 분할의 잘못된 단위, use client 커트라인, 그리고 환경변수를 통한 비밀 유출까지.'

# 💬 옵션 필드
draft: false
series: '프론트엔드 안티패턴'
seriesOrder: 6

# 📚 SEO용
keywords: ['Bundling', 'Tree Shaking', 'Code Splitting', 'Next.js', 'RSC', 'Anti-Pattern', '프론트엔드 안티패턴']
---

# 프론트엔드 안티패턴 (6) — 번들과 경계

4편에서 성능 병목 2순위가 JS 번들이라고 했습니다. 번들 문제가 특히 교활한 이유는 **한 번에 나빠지지 않기 때문**입니다. 매 스프린트 20~30KB씩 늘어나고, 아무도 그 순간을 문제로 인식하지 않습니다. 1년 뒤 초기 번들이 1.5MB가 되어 있습니다.

---

## 시작점 — 번들을 한 번도 열어보지 않음

다른 모든 것에 앞서는 안티패턴입니다.

```bash
# Next.js
npm i -D @next/bundle-analyzer
ANALYZE=true npm run build

# Vite
npm i -D rollup-plugin-visualizer
```

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer({ /* ... */ });
```

처음 돌려보면 예상과 다른 경우가 많습니다. 흔히 발견되는 것들:

- 한 화면에서만 쓰는 차트 라이브러리가 **초기 번들**에 있음
- 아이콘 세트 전체(수천 개)가 들어있는데 실제로 쓰는 건 12개
- 같은 라이브러리가 **두 버전** 들어있음
- 이미 지운 기능의 의존성이 남아있음
- 로케일 파일 300개

**"무엇이 들어있는지 모르는 채로 최적화하는 것"은 불가능합니다.**

---

## 라이브러리를 통째로 끌어오기

### 전형적인 사례들

```typescript
// 🔴 lodash 전체 — 약 70KB
import _ from 'lodash';
_.debounce(fn, 300);

// ✅ 필요한 것만 (ESM 빌드)
import debounce from 'lodash-es/debounce';
// 또는 애초에 직접 구현 (debounce는 10줄입니다)
```

```typescript
// 🔴 moment — 로케일 포함 시 300KB 이상, 트리셰이킹 불가 구조
import moment from 'moment';

// ✅ 대안들
import { format } from 'date-fns';            // 필요한 함수만
import { DateTime } from 'luxon';             // 더 작음
// Intl.DateTimeFormat — 번들 0KB, 브라우저 내장
new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date);
```

**포맷만 필요하다면 `Intl`이 거의 언제나 정답입니다.** 로케일 데이터가 브라우저에 이미 있으므로 번들 비용이 0입니다.

```typescript
// 🔴 아이콘 세트 전체
import * as Icons from 'react-icons/fa';

// ✅ 개별 import
import { FaUser } from 'react-icons/fa';
// 또는 SVG를 직접 컴포넌트화 (12개뿐이라면 이게 최선)
```

### 도입 전에 크기를 확인하기

새 의존성을 추가할 때 **번들 크기를 확인하는 습관**이 없는 것 자체가 안티패턴입니다.

```bash
npx bundlephobia <package-name>
# 또는 https://bundlephobia.com 에서 확인
```

특히 주의해야 할 범주:

| 범주 | 무거운 선택 | 가벼운 대안 |
|---|---|---|
| 날짜 | moment (300KB+) | `Intl`, date-fns, dayjs |
| 차트 | Chart.js + 어댑터, ECharts 전체 | 필요한 차트만 등록, Recharts, 직접 SVG |
| 애니메이션 | 전체 애니메이션 라이브러리 | CSS transition, Web Animations API |
| 유틸 | lodash 전체 | 개별 함수, 직접 구현 |
| 폼 | 무거운 폼 프레임워크 | React Hook Form(경량) |
| UUID | uuid 패키지 | `crypto.randomUUID()` (내장) |

**"직접 구현"이 의외로 자주 정답입니다.** `debounce`, `throttle`, `groupBy`, `uniqBy`는 각각 5~15줄입니다.

---

## 트리셰이킹이 실패하는 다섯 가지 이유

"ESM을 쓰니까 트리셰이킹이 될 것"이라는 기대가 자주 배신당합니다.

### 1. `sideEffects`를 선언하지 않음

```json
// package.json
{
  "sideEffects": false
}
```

이 선언이 없으면 번들러는 **"이 모듈을 평가하는 것 자체에 부수효과가 있을 수 있다"** 고 가정하고 제거를 포기합니다.

CSS import가 있다면 예외를 명시해야 합니다.

```json
{
  "sideEffects": ["*.css", "*.scss", "./src/polyfills.ts"]
}
```

### 2. CommonJS 모듈

```javascript
// CJS는 정적 분석이 어렵다 — 런타임에 exports가 바뀔 수 있으므로
module.exports = { a, b, c };
```

**패키지가 ESM 빌드를 제공하는지 확인하세요.** `package.json`의 `"module"` 또는 `"exports"` 필드에 ESM 진입점이 있어야 합니다.

### 3. 배럴 파일

```typescript
// src/shared/ui/index.ts
export * from './Button';
export * from './Modal';
export * from './DatePicker';   // 무거운 의존성을 가짐
```

```typescript
// 이 한 줄이 DatePicker까지 끌어올 수 있다
import { Button } from '@/shared/ui';
```

번들러가 완벽히 분석하면 제거되지만, 위의 1·2번 조건이 안 맞거나 중간에 부수효과가 섞이면 실패합니다. 그리고 **개발 서버 속도도 느려집니다** — 모듈 하나를 위해 배럴 전체를 해석해야 하니까요.

```javascript
// next.config.js — 배럴 import를 개별 import로 자동 변환
module.exports = {
  experimental: {
    optimizePackageImports: ['@/shared/ui', 'lucide-react', 'date-fns'],
  },
};
```

**그리고 배럴에서 `export *`를 쓰지 마세요.** 명시적으로 나열하면 무엇이 공개 API인지 코드에 남고 분석도 쉬워집니다.

### 4. 클래스의 정적 초기화

```typescript
// 사용하지 않아도 클래스 정의만으로 부수효과가 발생할 수 있다
class Analytics {
  static instance = new Analytics();   // 모듈 평가 시 실행
}
```

### 5. 동적 접근

```typescript
// 🔴 번들러가 무엇이 쓰일지 알 수 없다 → 전부 포함
const icons = { user: FaUser, home: FaHome, ... };
const Icon = icons[name];
```

정적으로 분석 가능한 형태로 쓰거나, 동적 import로 나누어야 합니다.

---

## 코드 분할의 잘못된 단위

### 안티패턴 1 — 분할 안 함

모든 화면의 코드가 첫 진입 시 다운로드됩니다. 관리자 화면, 설정 화면, 리포트 화면까지 전부.

### 안티패턴 2 — 라우트 단위로만

라우트 분할은 기본이지만 충분하지 않습니다. **한 페이지 안에 무거운 것이 있으면 그것도 나눠야 합니다.**

```tsx
// 무거운데 처음엔 안 보이는 것들
const RichTextEditor = dynamic(() => import('@/features/editor'), { ssr: false });
const DataChart = dynamic(() => import('@/widgets/chart'));
const PdfViewer = dynamic(() => import('@/features/pdf-viewer'), { ssr: false });
```

**분할 후보 판별:**

- [ ] 모달 안에만 있는가 (열기 전엔 필요 없음)
- [ ] 탭 안에만 있는가
- [ ] 특정 권한에서만 보이는가
- [ ] 스크롤해야 나오는가
- [ ] 무거운 서드파티에 의존하는가 (에디터, 차트, 지도, PDF)

### 안티패턴 3 — 너무 잘게 쪼개기

```tsx
// 🔴 버튼 하나를 lazy로
const SaveButton = lazy(() => import('./SaveButton'));
```

청크 하나당 HTTP 요청 하나입니다. 작은 청크가 50개면 요청 오버헤드가 이득을 넘습니다. **일반적인 기준: 20KB 이하 청크는 합치는 게 낫습니다.**

### 안티패턴 4 — 렌더 중에 lazy 정의

```tsx
// 🔴 3편의 그 문제 — 매 렌더 새 lazy 컴포넌트 → 매번 다시 로드
function Page() {
  const Editor = lazy(() => import('./Editor'));
  return <Suspense><Editor /></Suspense>;
}

// ✅ 모듈 스코프
const Editor = lazy(() => import('./Editor'));
```

### 안티패턴 5 — fallback 없이, 또는 레이아웃이 튀는 fallback

```tsx
// 🔴 로딩 중 아무것도 없다가 갑자기 나타남 → CLS
<Suspense fallback={null}><Chart /></Suspense>

// ✅ 최종 크기와 같은 공간을 잡는다
<Suspense fallback={<div className="h-[320px] animate-pulse rounded bg-slate-100" />}>
  <Chart />
</Suspense>
```

### 프리로드로 지연 숨기기

```tsx
// 사용자가 의도를 드러내는 순간 미리 받는다
<button
  onMouseEnter={() => import('./Editor')}
  onFocus={() => import('./Editor')}
  onClick={open}
>
  편집
</button>
```

**클릭과 로딩 사이의 200ms를 마우스가 이동하는 시간으로 숨기는 것**입니다. 체감 성능에 큰 차이를 만듭니다.

---

## 브라우저 타깃과 폴리필

### 타깃을 설정하지 않음

```json
// package.json — 없으면 번들러가 보수적으로 잡아 불필요한 트랜스파일이 발생
{
  "browserslist": [
    "> 0.5%",
    "last 2 versions",
    "not dead",
    "not op_mini all"
  ]
}
```

**`browserslist` 설정 하나로 번들이 10~20% 줄어드는 경우가 흔합니다.** async/await, 옵셔널 체이닝, 클래스 필드를 ES5로 변환하면 코드가 크게 불어나는데, 이제 그럴 필요가 없는 환경이 대부분입니다.

### 폴리필 전체 주입

```javascript
// 🔴 core-js 전부
import 'core-js';

// ✅ 타깃에 따라 필요한 것만 (babel preset-env + useBuiltIns: 'usage')
```

더 나은 방법은 **modern/legacy 이중 빌드**입니다. 최신 브라우저에는 폴리필 없는 번들을, 구형에는 폴리필 포함 번들을 서빙합니다.

```html
<script type="module" src="/modern.js"></script>
<script nomodule src="/legacy.js"></script>
```

### 레거시 지원을 근거 없이 유지

"혹시 모르니까 IE도"가 수년간 유지되는 경우가 있습니다. **실제 사용자 통계를 확인하세요.** 0.1%를 위해 나머지 99.9%가 30% 큰 번들을 받는 게 맞는지 계산해 볼 문제입니다.

---

## 중복 의존성

```bash
npm ls react
# └─┬ some-ui-lib@2.0.0
#   └── react@17.0.2 deduped 안 됨   ← React가 두 벌 들어있다
```

증상: 번들이 두 배, 훅 관련 에러("Invalid hook call"), Context가 공유되지 않음.

```json
// package.json — 하나로 강제
{
  "overrides": {
    "react": "$react",
    "react-dom": "$react-dom"
  }
}
```

```bash
# 중복 확인
npx npm-why react
npm dedupe
```

**라이브러리가 `peerDependencies`로 선언해야 할 것을 `dependencies`로 선언한 경우**가 주된 원인입니다.

---

## RSC 경계 — `"use client"`를 어디에 긋는가

Next.js App Router에서 가장 비용이 큰 판단입니다.

### 안티패턴 — 트리 위쪽에 붙이기

```tsx
// 🔴 app/dashboard/layout.tsx
'use client';
// → 이 아래 모든 컴포넌트가 클라이언트 번들에 들어간다
```

레이아웃이나 페이지에 붙이면 그 아래 import 트리 전체가 클라이언트로 딸려갑니다. **서버 컴포넌트를 쓰는 의미가 사라집니다.**

### 정상 — 잎 쪽으로 밀어내기

```tsx
// app/dashboard/page.tsx — 서버 컴포넌트
import { InteractiveFilter } from './InteractiveFilter';   // 이것만 클라이언트

export default async function DashboardPage() {
  const data = await getData();                 // 서버에서 직접 DB 접근
  return (
    <>
      <h1>대시보드</h1>
      <InteractiveFilter />                     {/* 'use client' */}
      <DataTable rows={data} />                 {/* 서버 컴포넌트 유지 */}
    </>
  );
}
```

### 클라이언트 컴포넌트 안에 서버 컴포넌트 넣기

상태가 필요한 래퍼 때문에 전체를 클라이언트로 만들 필요는 없습니다.

```tsx
// ✅ children은 부모(서버)에서 이미 렌더된 결과로 전달된다
// app/page.tsx (서버)
<ClientTabs>
  <ServerHeavyContent />       {/* 서버에서 렌더됨 */}
</ClientTabs>

// ClientTabs.tsx
'use client';
export function ClientTabs({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState(0);
  return <div>{/* ... */}{children}</div>;
}
```

### 서버 전용 코드가 클라이언트로 새는 것 막기

```typescript
// lib/db.ts
import 'server-only';        // 클라이언트에서 import하면 빌드 에러

export const db = createConnection(process.env.DATABASE_URL!);
```

```typescript
// lib/browser-utils.ts
import 'client-only';        // 서버에서 import하면 빌드 에러
```

**이 두 패키지는 비용이 0이고 효과가 확실합니다.** 데이터 접근 레이어에는 반드시 `server-only`를 넣으세요.

---

## 환경변수를 통한 비밀 유출

**이 목록에서 가장 조용하고 가장 위험한 안티패턴입니다.**

```bash
# .env
NEXT_PUBLIC_API_SECRET=sk_live_abc123      # 🔴 전 세계에 공개됨
NEXT_PUBLIC_ADMIN_TOKEN=...                # 🔴
```

`NEXT_PUBLIC_` 접두사가 붙은 값은 **빌드 시 클라이언트 번들에 문자열로 박힙니다.** 누구나 DevTools에서 볼 수 있습니다. Vite의 `VITE_`, CRA의 `REACT_APP_`도 동일합니다.

### 왜 이런 일이 생기는가

```typescript
// 개발 중: 클라이언트에서 API를 직접 호출하고 싶다
const res = await fetch('https://api.thirdparty.com/data', {
  headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_API_KEY}` },
});
```

동작합니다. 그래서 넘어갑니다. **에러도 경고도 없습니다.**

### 정상 — 서버를 경유

```typescript
// app/api/thirdparty/route.ts — 서버에서만 실행
export async function GET() {
  const res = await fetch('https://api.thirdparty.com/data', {
    headers: { Authorization: `Bearer ${process.env.API_KEY}` },   // 접두사 없음
  });
  return Response.json(await res.json());
}
```

```typescript
// 클라이언트는 자기 서버만 호출
const res = await fetch('/api/thirdparty');
```

### 검출하기

```bash
# 빌드 결과에서 비밀 패턴 검색
grep -rE "(sk_live|AKIA[0-9A-Z]{16}|-----BEGIN)" .next/static/ && echo "유출 의심!" && exit 1
```

CI에 `gitleaks`나 `trufflehog` 같은 시크릿 스캐너를 넣는 것이 확실합니다.

**공개해도 되는 것과 아닌 것:**

| 공개 가능 | 공개 불가 |
|---|---|
| 공개 API 베이스 URL | API 시크릿 키 |
| 분석 도구 공개 키 | DB 연결 문자열 |
| 기능 플래그 (민감하지 않은) | 서명 키, JWT 시크릿 |
| 공개 지도 키 (도메인 제한 걸린) | 서드파티 서버 토큰 |

---

## 프로덕션 소스맵 노출

```javascript
// next.config.js
module.exports = {
  productionBrowserSourceMaps: false,   // 기본값
};
```

소스맵을 공개 배포하면 **원본 코드 전체가 공개됩니다.** 주석, 내부 변수명, 미사용 코드, 때로는 주석 처리된 자격증명까지.

**정상적인 방법:** 소스맵은 생성하되 **에러 추적 서비스에만 업로드**하고 공개 서버에는 올리지 않습니다.

---

## 빌드 재현성

```bash
# 🔴 CI에서 npm install — lockfile을 무시하고 버전을 올릴 수 있다
npm install

# ✅ lockfile 그대로
npm ci
```

```json
// 🔴 범위 지정 — 빌드할 때마다 다른 버전이 들어올 수 있다
{ "dependencies": { "some-lib": "^2.0.0" } }
```

**"어제는 됐는데 오늘 빌드가 깨졌다"의 상당수가 여기서 옵니다.** 앱(라이브러리가 아닌)에서는 lockfile을 커밋하고 `npm ci`로 설치하는 것이 기본입니다.

---

## 캐싱 설정

```
# 🔴 해시 없는 파일명 + 긴 캐시 → 배포해도 사용자가 옛 파일을 본다
/static/app.js       Cache-Control: max-age=31536000

# ✅ 내용 해시가 붙은 파일은 영구 캐시
/static/app.a1b2c3.js   Cache-Control: public, max-age=31536000, immutable

# ✅ HTML은 항상 재검증
/index.html             Cache-Control: no-cache
```

**규칙: 파일명에 내용 해시가 있으면 영구 캐시, 없으면 `no-cache`.** 최신 번들러는 해시를 자동으로 붙이므로, 문제는 대개 정적 자산(이미지, 폰트)이나 커스텀 배포 설정에서 생깁니다.

---

## 설정이 여러 곳에 흩어짐

범용 스멜 **Shotgun Surgery**의 빌드 층위 변형입니다.

```
브라우저 타깃이 정의된 곳:
- package.json의 browserslist
- .babelrc의 targets
- tsconfig.json의 target/lib
- next.config.js의 swcMinify 옵션
→ 네 곳이 서로 다른 값을 가리킨다
```

증상: "왜 이 문법이 트랜스파일되지?" 또는 "왜 이 브라우저에서 깨지지?"의 원인을 찾는 데 반나절.

**단일 소유권 원칙을 빌드 설정에도 적용하세요.** 브라우저 타깃은 `browserslist` 한 곳에서 정의하고 나머지는 그걸 참조하게 합니다.

---

## 요약

| 안티패턴 | 비용 | 해법 |
|---|---|---|
| 번들 미확인 | 무엇이 문제인지 모름 | analyzer + CI 크기 예산 |
| 라이브러리 통째 import | 수십~수백 KB | 개별 import, 내장 API, 직접 구현 |
| `sideEffects` 미선언 | 트리셰이킹 실패 | `"sideEffects": false` |
| `export *` 배럴 | 트리셰이킹 실패, 개발 느림 | 명시적 export, `optimizePackageImports` |
| 라우트 단위로만 분할 | 무거운 위젯이 초기 번들에 | 모달·탭·에디터 단위 분할 |
| 렌더 중 lazy 정의 | 매번 재로딩 | 모듈 스코프로 |
| `browserslist` 미설정 | 불필요한 트랜스파일 | 실제 사용자 통계 기반 설정 |
| 중복 의존성 | 번들 두 배, 훅 에러 | `overrides`, `npm dedupe` |
| `"use client"` 상단 배치 | RSC 이점 상실 | 잎 쪽으로, children 주입 |
| `NEXT_PUBLIC_` 비밀 | **자격증명 전면 공개** | 서버 경유 + 시크릿 스캔 |
| 프로덕션 소스맵 | 원본 코드 공개 | 에러 추적 서비스에만 업로드 |
| `npm install` in CI | 빌드 비재현성 | `npm ci` |
| 해시 없는 파일 + 영구 캐시 | 배포가 반영 안 됨 | 해시 + immutable / HTML은 no-cache |

**관통하는 원리 세 개**

1. **측정하지 않으면 번들은 반드시 자란다.** CI의 크기 예산이 유일하게 효과 있는 방어선입니다.
2. **경계를 명시적으로 만들어라.** `server-only`, `client-only`, `"use client"`의 위치가 곧 번들의 모양입니다.
3. **빌드 설정에도 단일 소유권이 필요하다.** 같은 값이 네 곳에 있으면 반드시 어긋납니다.

---

## 다음 편

**7편 — CSS와 접근성의 안티패턴**

`!important`가 왜 문제의 해결이 아니라 증거인지, z-index 인플레이션을 멈추는 법, 컴포넌트가 자기 바깥 여백을 소유하면 안 되는 이유, 그리고 `<div onClick>`부터 포커스 관리까지 — 조용히 실패하는 접근성 문제들을 다룹니다.
