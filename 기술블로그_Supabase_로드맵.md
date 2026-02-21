# 기술 블로그 프로젝트 로드맵 (Supabase 기반)

## 수정된 기술 스택

| 영역 | 기술 | 변경사항 |
|------|------|----------|
| **Application** | Next.js (App Router), TypeScript, RSC, Server Actions | 유지 |
| **UI / Form** | shadcn/ui, Tailwind CSS, React Hook Form, Zod | 유지 |
| **DB** | Supabase (PostgreSQL) | ~~PostgreSQL 직접 설치~~ → Supabase 호스팅 |
| **ORM/Client** | Supabase Client (`@supabase/ssr`) | ~~Drizzle ORM~~ → Supabase Client |
| **인증** | Supabase Auth | ~~NextAuth.js v5~~ → Supabase Auth |
| **스토리지** | Supabase Storage | 신규 추가 (이미지 업로드용) |
| **배포** | Vercel | ~~Docker + VPS + Nginx~~ → Vercel |
| **콘텐츠** | Markdown in DB → react-markdown | 유지 |
| **코드 하이라이팅** | shiki 또는 rehype-pretty-code | 유지 |
| **SEO** | Next.js Metadata API | 유지 |

---

## Phase 1: 환경 구축 + Supabase 기초 (4~5일)

### 1-1. 프로젝트 초기화 (1일)

```
작업 내용
├── Next.js + TypeScript 프로젝트 생성
├── ESLint, Prettier 설정
├── 폴더 구조 잡기
├── Git 초기화 + .gitignore 설정
└── 환경변수 파일 구성 (.env.local)
```

**프로젝트 구조:**
```
blog-project/
├── src/
│   ├── app/
│   │   ├── (blog)/              # 공개 페이지 그룹
│   │   │   ├── page.tsx         # 홈 (글 목록)
│   │   │   ├── posts/[slug]/    # 글 상세
│   │   │   └── categories/[slug]/
│   │   ├── (admin)/             # 관리자 페이지 그룹
│   │   │   ├── admin/
│   │   │   └── write/
│   │   ├── auth/                # 인증 관련 페이지
│   │   │   ├── login/
│   │   │   └── callback/        # Supabase OAuth callback
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                  # shadcn 컴포넌트
│   │   ├── blog/                # 블로그 전용 컴포넌트
│   │   └── admin/               # 관리자 전용 컴포넌트
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts        # 브라우저용 Supabase 클라이언트
│   │   │   ├── server.ts        # 서버용 Supabase 클라이언트
│   │   │   └── middleware.ts    # 세션 갱신용
│   │   └── utils/
│   ├── actions/                 # Server Actions
│   └── types/                   # TypeScript 타입 정의
├── supabase/
│   └── migrations/              # SQL 마이그레이션 파일
├── public/
└── middleware.ts                # Next.js 미들웨어 (세션 갱신)
```

### 1-2. Supabase 프로젝트 설정 (1일)

```
작업 내용
├── Supabase 프로젝트 생성 (dashboard)
├── @supabase/supabase-js, @supabase/ssr 설치
├── Supabase 클라이언트 설정 (브라우저 / 서버 / 미들웨어)
├── Next.js 미들웨어에서 세션 갱신 설정
└── 연결 테스트
```

**학습 포인트:**
- Supabase 프로젝트 구조 이해 (Dashboard, API, Auth, Storage)
- 서버/클라이언트 환경별 Supabase 클라이언트 분리 이유
- `NEXT_PUBLIC_SUPABASE_URL` vs `SUPABASE_SERVICE_ROLE_KEY` 차이

### 1-3. DB 스키마 설계 + RLS (1~2일)

```
작업 내용
├── Supabase Dashboard 또는 SQL Editor로 테이블 생성
├── 테이블: posts, categories, tags, post_tags
├── Row Level Security(RLS) 정책 설정
├── 테스트 데이터 삽입
└── Supabase CLI 설치 + 로컬 개발 환경 설정 (선택)
```

**스키마:**
```sql
-- categories
create table categories (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  slug text not null unique,
  created_at timestamptz default now()
);

-- posts
create table posts (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  slug text not null unique,
  content text not null,           -- 마크다운 문자열
  excerpt text,
  cover_image text,                -- Supabase Storage URL
  category_id uuid references categories(id),
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- tags
create table tags (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  slug text not null unique
);

-- post_tags (M:N)
create table post_tags (
  post_id uuid references posts(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (post_id, tag_id)
);
```

**RLS 정책 예시:**
```sql
-- posts: 누구나 published=true인 글 읽기 가능
alter table posts enable row level security;

create policy "공개 글 읽기" on posts
  for select using (published = true);

-- 관리자만 글 생성/수정/삭제 (인증된 특정 사용자)
create policy "관리자 전체 접근" on posts
  for all using (auth.uid() = '관리자-uuid');
```

**학습 포인트:**
- PostgreSQL UUID, timestamptz 타입
- RLS 개념과 정책 설계 (DB 레벨 보안)
- `auth.uid()` 함수 활용

### 1-4. UI 기반 설정 (1일)

```
작업 내용
├── Tailwind CSS 설정
├── shadcn/ui 설치 + 테마 커스터마이징
├── 기본 레이아웃 컴포넌트 (Header, Footer)
├── 다크모드 설정 (next-themes)
└── 반응형 기본 구조
```

### Phase 1 완료 시 결과물
- [x] Next.js + Supabase 연결 완료
- [x] DB 스키마 + RLS 정책 설정 완료
- [x] 기본 UI 레이아웃 완성
- [x] 환경변수 관리 체계 확립

---

## Phase 2: 읽기 기능 (5~7일)

### 2-1. 글 목록 페이지 (2일)

```
작업 내용
├── Supabase에서 글 목록 조회 (RSC)
├── 글 목록 UI 구현 (카드 형태)
├── 페이지네이션 (Supabase의 .range() 활용)
├── 카테고리별 필터링
└── 최신순/인기순 정렬
```

**데이터 페칭 예시:**
```tsx
// app/(blog)/page.tsx (React Server Component)
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('posts')
    .select('id, title, slug, excerpt, cover_image, created_at, categories(name, slug)')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .range(0, 9)  // 페이지네이션

  return <PostList posts={posts} />
}
```

**학습 포인트:**
- RSC에서 데이터 페칭 패턴
- Supabase Query Builder (select, eq, order, range)
- 관계 데이터 조회 (posts + categories JOIN)

### 2-2. 글 상세 페이지 (2~3일)

```
작업 내용
├── 동적 라우팅 (/posts/[slug])
├── 마크다운 렌더링 (react-markdown)
├── 코드 하이라이팅 (rehype-pretty-code + shiki)
├── 목차(TOC) 자동 생성
├── 태그 표시
└── 이전글/다음글 네비게이션
```

**학습 포인트:**
- Next.js 동적 라우팅 + generateStaticParams
- react-markdown 커스텀 컴포넌트
- rehype/remark 플러그인 생태계

### 2-3. 카테고리 & 태그 (1~2일)

```
작업 내용
├── 카테고리별 글 목록 (/categories/[slug])
├── 태그별 글 목록 (/tags/[slug])
├── 사이드바 네비게이션 (카테고리 목록)
└── 태그 클라우드
```

**학습 포인트:**
- Supabase에서 M:N 관계 데이터 조회
- 라우트 그룹과 레이아웃 중첩

### Phase 2 완료 시 결과물
- [x] 글 목록 + 페이지네이션 동작
- [x] 마크다운 렌더링 + 코드 하이라이팅
- [x] 카테고리/태그 필터링

---

## Phase 3: 인증 + 쓰기 기능 (7~10일)

### 3-1. Supabase Auth 설정 (2~3일)

```
작업 내용
├── 로그인 페이지 UI
├── OAuth 로그인 (GitHub 권장, Google 선택)
├── 이메일/패스워드 로그인 (선택)
├── 세션 관리 (미들웨어에서 갱신)
├── 관리자 판별 로직
└── 보호된 라우트 설정
```

**인증 흐름:**
```
사용자 → 로그인 페이지 → Supabase Auth (OAuth/Email)
                              ↓
                     callback 라우트에서 세션 설정
                              ↓
                     미들웨어에서 세션 검증 + 갱신
                              ↓
                     관리자 → admin 페이지 접근 허용
                     비관리자 → 리다이렉트
```

**관리자 판별 방식 (택 1):**
```
옵션 A: 특정 이메일로 판별
  → auth.uid()가 지정된 관리자 UUID인지 확인

옵션 B: 사용자 메타데이터 활용
  → Supabase Dashboard에서 사용자에 role: 'admin' 메타데이터 추가

옵션 C: 별도 profiles 테이블
  → profiles 테이블에 role 컬럼 추가
```

**학습 포인트:**
- OAuth 인증 흐름 (Authorization Code Flow)
- 쿠키 기반 세션 관리
- 미들웨어를 통한 인증 상태 유지
- RLS와 Auth의 연동

### 3-2. 글 작성/수정 (3~4일)

```
작업 내용
├── 마크다운 에디터 UI (textarea + 미리보기)
├── 실시간 미리보기 (split view)
├── Server Action으로 글 저장
├── 이미지 업로드 (Supabase Storage)
├── 폼 검증 (React Hook Form + Zod)
├── slug 자동 생성
└── 임시저장 / 발행 상태 관리
```

**이미지 업로드 (Supabase Storage):**
```tsx
// 이미지 업로드 예시
const { data, error } = await supabase.storage
  .from('blog-images')
  .upload(`posts/${slug}/${fileName}`, file, {
    cacheControl: '3600',
    upsert: false
  })

// 공개 URL 가져오기
const { data: { publicUrl } } = supabase.storage
  .from('blog-images')
  .getPublicUrl(`posts/${slug}/${fileName}`)
```

**학습 포인트:**
- Server Actions를 활용한 폼 처리
- Supabase Storage 파일 업로드/관리
- React Hook Form + Zod 서버 사이드 검증
- 낙관적 업데이트(Optimistic Update) 패턴

### 3-3. 글 관리 (2~3일)

```
작업 내용
├── 관리자 대시보드 (글 목록, 통계)
├── 글 수정 / 삭제 기능
├── 카테고리 / 태그 CRUD
├── 발행 상태 토글 (draft ↔ published)
└── 커버 이미지 관리
```

### Phase 3 완료 시 결과물
- [x] OAuth 로그인 + 세션 관리
- [x] 관리자 전용 글 작성/수정/삭제
- [x] 이미지 업로드 (Supabase Storage)
- [x] 완전한 CRUD 동작

---

## Phase 4: 부가 기능 + SEO (5~7일)

### 4-1. 검색 기능 (1~2일)

```
작업 내용
├── PostgreSQL Full-Text Search 설정
├── Supabase에서 textSearch 함수 활용
├── 검색 UI (검색바 + 결과 페이지)
└── 디바운싱 적용
```

**Full-Text Search 설정:**
```sql
-- posts 테이블에 tsvector 컬럼 추가
alter table posts add column fts tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored;

-- 인덱스 생성
create index posts_fts on posts using gin(fts);
```

```tsx
// Supabase에서 검색
const { data } = await supabase
  .from('posts')
  .select()
  .textSearch('fts', searchQuery)
  .eq('published', true)
```

**학습 포인트:**
- PostgreSQL Full-Text Search 원리 (tsvector, tsquery)
- 검색 가중치(weight) 활용
- 클라이언트 사이드 디바운싱

### 4-2. SEO 최적화 (2일)

```
작업 내용
├── Metadata API (title, description, OG tags)
├── 동적 OG 이미지 생성 (next/og)
├── sitemap.xml 자동 생성
├── robots.txt
├── JSON-LD 구조화 데이터
└── RSS 피드 생성
```

**학습 포인트:**
- Next.js Metadata API (정적 + 동적)
- Open Graph 프로토콜
- 사이트맵/RSS 자동 생성

### 4-3. UX 개선 (2~3일)

```
작업 내용
├── 로딩 상태 (Suspense + Skeleton UI)
├── 에러 처리 (error.tsx, not-found.tsx)
├── 조회수 카운터 (Supabase RPC 함수)
├── 댓글 기능 (giscus 연동 — 간편 / 또는 Supabase로 직접 구현)
└── 무한 스크롤 또는 더보기 버튼
```

**조회수 카운터 (RPC 함수):**
```sql
-- 원자적 조회수 증가 함수
create or replace function increment_view_count(post_slug text)
returns void as $$
  update posts set view_count = view_count + 1 where slug = post_slug;
$$ language sql;
```

```tsx
// 호출
await supabase.rpc('increment_view_count', { post_slug: slug })
```

**학습 포인트:**
- Supabase RPC (Database Functions)
- Next.js Streaming + Suspense
- 에러 바운더리 패턴

### Phase 4 완료 시 결과물
- [x] 풀텍스트 검색 동작
- [x] SEO 메타데이터 + 사이트맵 + RSS
- [x] 조회수, 로딩/에러 처리 등 UX 완성

---

## Phase 5: 배포 + 운영 (2~3일)

### 5-1. Vercel 배포 (1일)

```
작업 내용
├── Vercel 프로젝트 연결 (GitHub 연동)
├── 환경변수 설정 (Supabase URL, Key 등)
├── 빌드 + 배포 확인
├── 커스텀 도메인 연결
└── SSL 자동 설정 (Vercel 제공)
```

**기존 대비 간소화된 부분:**
```
기존 (Docker + VPS)              → 현재 (Vercel)
─────────────────────────────     ─────────────────
서버 초기 설정 (Ubuntu)            Git push → 자동 배포
Docker 설치 + Dockerfile 작성      환경변수 설정만
Nginx 리버스 프록시 설정            자동 처리
SSL 인증서 (Let's Encrypt)         자동 처리
docker-compose.yml 구성            불필요
PM2 / 프로세스 관리                 불필요
```

### 5-2. 운영 설정 (1~2일)

```
작업 내용
├── Supabase 데이터 백업 전략 (자동 백업 확인)
├── Supabase Storage 버킷 정책 설정
├── Vercel Analytics 설정 (선택)
├── 에러 모니터링 (Sentry 등 — 선택)
├── 환경변수 관리 체계 정리
└── README / 프로젝트 문서화
```

### Phase 5 완료 시 결과물
- [x] 프로덕션 배포 완료 (Vercel + 커스텀 도메인)
- [x] 운영 가능한 상태

---

## 전체 일정 요약

```
Phase 1: 환경 구축 + Supabase    ██░░░░░░░░  4~5일
Phase 2: 읽기 기능               ███░░░░░░░  5~7일
Phase 3: 인증 + 쓰기             █████░░░░░  7~10일
Phase 4: 부가 기능 + SEO         ███░░░░░░░  5~7일
Phase 5: 배포 + 운영             █░░░░░░░░░  2~3일
──────────────────────────────────────────────
총 예상:                         약 3.5~4.5주
```

> 기존 4~5주에서 **약 1주 단축** — Docker/VPS 인프라 작업이 Vercel 배포로 대체되면서 절약

---

## 기존 대비 학습 포인트 변화

| 줄어드는 학습 | 추가되는 학습 |
|--------------|-------------|
| Docker / Dockerfile 작성 | Supabase 플랫폼 전반 이해 |
| docker-compose 구성 | Row Level Security (RLS) 설계 |
| Nginx 리버스 프록시 | Supabase Auth (OAuth 흐름) |
| SSL 인증서 수동 설정 | Supabase Storage (파일 관리) |
| Linux 서버 관리 | Supabase RPC (DB 함수) |
| PM2 프로세스 관리 | Vercel 배포 + CI/CD |

> **핵심:** 인프라 운영 → 애플리케이션/데이터 설계 중심으로 학습 초점 이동

---

## 진행 팁

| 팁 | 이유 |
|----|------|
| **Supabase Dashboard를 적극 활용** | SQL Editor, Table Editor로 빠르게 데이터 확인 |
| **RLS 정책은 초기에 꼼꼼히 설계** | 나중에 바꾸면 전체 로직에 영향 |
| **Phase 2부터 실제 글 작성** | 본인이 사용자가 되어 불편한 점 발견 |
| **Git 커밋 자주** | 각 기능별 히스토리 관리 + 포트폴리오 |
| **Supabase 무료 티어 제한 확인** | DB 500MB, Storage 1GB, Auth 50K MAU |
| **막히면 단순화** | 완성 우선, 리팩토링은 나중에 |
