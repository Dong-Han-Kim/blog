# blog92

MDX 기반 한국어 기술 블로그. Next.js App Router + Supabase 익명 댓글 시스템.

> https://blog92.vercel.app

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 언어 | TypeScript |
| 스타일링 | Tailwind CSS v4 + shadcn/ui |
| 콘텐츠 | MDX (next-mdx-remote + gray-matter) |
| 코드 하이라이팅 | rehype-pretty-code + shiki |
| 댓글 DB | Supabase (PostgreSQL) + Drizzle ORM |
| 폼 검증 | React Hook Form + Zod |
| 검색 | cmdk (커맨드 팔레트) + 자체 부분 문자열 매칭 |
| 배포 | Vercel |

## 주요 기능

- MDX 파일 기반 포스트 관리 (카테고리/태그 분류)
- 코드 하이라이팅 + 목차(TOC) 자동 생성
- 시리즈(연재) 내비게이션 — frontmatter `series`/`seriesOrder`로 묶고, 글 상세에서 편 목록과 이전/다음 편 이동
- 익명 댓글 시스템 (대댓글, 비밀번호 기반 수정/삭제, Realtime 동기화, 허니팟·레이트 리밋 스팸 방지)
  - 비밀번호 해시는 별도 `comment_secrets` 테이블에 격리해 Realtime 브로드캐스트에 노출되지 않음
- 커맨드 팔레트 검색 (`Ctrl+K` / `⌘+K`) — 제목·slug·태그 부분 문자열 매칭
- 레트로 CRT 터미널 테마 (그린 인광 단일 테마, 팔레트 커맨드로 CRT 효과 on/off)
- SEO (sitemap.xml, robots.txt, RSS 피드, 동적 메타데이터)
- 접근성 — WCAG AA 명도 대비 충족, `prefers-reduced-motion` 대응
- 페이지별 Skeleton Loading UI

## 프로젝트 구조

```
blog/
├── content/posts/           # MDX 콘텐츠 (카테고리별 폴더)
│   ├── devops/
│   ├── frontend/
│   ├── projects/
│   └── til/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── page.tsx         # 홈 (최신 글 목록)
│   │   ├── posts/           # 전체 글 목록 + [slug] 글 상세 (시리즈/TOC/댓글)
│   │   ├── categories/      # 카테고리별 글 목록
│   │   ├── tags/            # 태그별 글 목록
│   │   ├── about/           # 소개
│   │   ├── api/slug-map/    # slug → 카테고리 매핑 JSON
│   │   ├── search-index.json/ # 검색 인덱스 (제목·설명·태그 등 메타데이터만)
│   │   ├── sitemap.ts       # 동적 sitemap 생성
│   │   ├── robots.ts        # robots.txt
│   │   └── feed.xml/        # RSS 2.0 피드
│   ├── components/
│   │   ├── ui/              # shadcn/ui 컴포넌트
│   │   ├── terminal/        # 터미널 UI (헤더, 프롬프트, 배지 등)
│   │   ├── crt/             # CRT 오버레이 (스캔라인/노이즈/비네트)
│   │   ├── comments/        # 댓글 시스템
│   │   ├── search/          # 커맨드 팔레트 검색
│   │   ├── mdx/             # MDX 커스텀 컴포넌트
│   │   ├── posts/           # 글 목록, 목차(TOC), 시리즈 내비게이션
│   │   └── shared/          # 스켈레톤, 404 경로 표시
│   ├── lib/
│   │   ├── mdx.ts           # MDX 파싱 + 시리즈 그룹핑 유틸
│   │   ├── search.ts        # 팔레트 검색 매칭/커맨드
│   │   ├── db/              # Drizzle ORM 스키마 + 연결
│   │   ├── supabase/        # Supabase 클라이언트
│   │   ├── comments/        # 댓글 트리/포맷 유틸
│   │   ├── spam/            # 허니팟, 레이트 리밋, 금칙어
│   │   └── validations/     # Zod 스키마 (frontmatter, 댓글)
│   ├── hooks/               # useCommentRealtime 등
│   └── actions/             # Server Actions (댓글 CRUD)
└── public/                  # 정적 에셋
```

## 시작하기

### 필수 조건

- Node.js 20.9+ (Next.js 16 요구사항)
- Supabase 프로젝트 (댓글 기능용)

### 설치

```bash
git clone https://github.com/Dong-Han-Kim/blog.git
cd blog
npm install
```

### 환경변수

`.env.local` 파일을 생성하고 다음 변수를 설정합니다:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
DATABASE_URL=your_postgresql_connection_string
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### 데이터베이스 설정

```bash
npm run db:push      # 스키마를 DB에 반영
```

### 개발 서버

```bash
npm run dev          # http://localhost:3000
```

### 기타 명령어

```bash
npm run build        # 프로덕션 빌드 (Turbopack)
npm run lint         # ESLint
npm run storybook    # Storybook (포트 6006)
npm run db:studio    # Drizzle Studio
```

## 글 작성 방법

1. `content/posts/{category}/` 폴더에 `.md` 파일 생성 (파일명이 URL slug가 됨)
2. frontmatter 작성:

```yaml
---
title: "글 제목"
date: "2026-03-29"
category: "til"
tags: ["javascript"]
description: "글 설명"
draft: false
keywords: ["키워드"]
# 시리즈로 묶을 때만 (옵션)
series: "시리즈 이름"
seriesOrder: 1
---
```

3. 본문 작성 (마크다운 + MDX 컴포넌트)
4. `git push` → Vercel 자동 배포
