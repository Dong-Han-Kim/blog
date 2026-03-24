# Phase 3: 댓글 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MDX 기반 기술 블로그에 익명 댓글 시스템(무제한 대댓글, 실시간 구독, 스팸 방지)을 구현한다.

**Architecture:** Server Actions로 댓글 CRUD를 처리하고, Supabase Realtime으로 실시간 갱신을 구독한다. 초기 데이터는 서버 컴포넌트에서 Drizzle ORM으로 조회하여 SSR하고, 클라이언트에서 Realtime WebSocket으로 이후 변경사항을 수신한다.

**Tech Stack:** Next.js App Router, Drizzle ORM, Supabase Realtime, React Hook Form, Zod, bcryptjs, shadcn/ui (dialog, sonner)

**Spec:** `docs/superpowers/specs/2026-03-24-comment-system-design.md`

---

## 기존 코드 현황

- `src/lib/db/schema.ts` — comments 테이블 스키마 (parentId FK 없음, updatedAt 없음)
- `src/lib/validations/comment.ts` — commentFormSchema, deleteCommentSchema 존재
- `src/lib/supabase/client.ts` — Supabase 클라이언트 (단일)
- `src/components/shared/CreateCommentForm.tsx` — stub (returns null), 삭제 대상
- `src/lib/service.ts` — 빈 파일, 삭제 대상
- `src/components/ui/` — button, input, form, label 존재. dialog, sonner 미설치
- `src/actions/` — 빈 디렉토리
- `src/hooks/` — 미존재
- Drizzle DB connection 인스턴스 파일 미존재 (스키마만 있음)
- 이미 설치된 패키지: react-hook-form, @hookform/resolvers, bcryptjs, @types/bcryptjs, zod, @supabase/supabase-js

---

## File Structure

### 새로 생성

| 파일 | 책임 |
|------|------|
| `src/lib/db/index.ts` | Drizzle DB connection 인스턴스 |
| `src/types/comment.ts` | Comment, CommentWithChildren 타입 정의 |
| `src/lib/comments/tree.ts` | flat 배열 → 트리 변환 유틸 |
| `src/lib/spam/honeypot.ts` | 허니팟 검증 함수 |
| `src/lib/spam/rate-limit.ts` | IP 기반 Rate Limiting |
| `src/lib/spam/banned-words.ts` | 금지어 필터 |
| `src/actions/comment.ts` | createComment, updateComment, deleteComment Server Actions |
| `src/hooks/useCommentRealtime.ts` | Supabase Realtime 구독 커스텀 훅 |
| `src/components/comments/CommentForm.tsx` | 댓글 작성/수정 폼 |
| `src/components/comments/CommentItem.tsx` | 개별 댓글 UI |
| `src/components/comments/CommentList.tsx` | 트리 기반 댓글 목록 렌더링 |
| `src/components/comments/EditCommentDialog.tsx` | 수정 비밀번호 검증 Dialog |
| `src/components/comments/DeleteCommentDialog.tsx` | 삭제 비밀번호 검증 Dialog |
| `src/components/comments/CommentSection.tsx` | 최상위 댓글 영역 (상태 + Realtime) |

### 수정

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/db/schema.ts` | parentId FK 추가, updatedAt 컬럼 추가 |
| `src/lib/validations/comment.ts` | updateCommentSchema 추가 |
| `src/app/posts/[slug]/page.tsx` | CommentSection 추가, 초기 댓글 데이터 조회 |
| `src/app/layout.tsx` | Toaster (sonner) 추가 |

### 삭제

| 파일 | 이유 |
|------|------|
| `src/components/shared/CreateCommentForm.tsx` | stub, CommentForm으로 대체 |
| `src/lib/service.ts` | 빈 파일 |

---

## Task 의존성

```
Task 1 (환경설정) → Task 2 (DB) → Task 3 (타입) → Task 4 (스팸) → Task 5 (Zod)
  → Task 6 (Server Actions) → Task 7 (Realtime 훅)
  → Task 8 (CommentForm) → Task 9 (Dialogs) → Task 10 (CommentItem)
  → Task 11 (CommentList) → Task 12 (CommentSection) → Task 13 (통합) → Task 14 (테스트)
```

**중요**: Task 6은 Task 3(타입)과 Task 5(Zod 스키마)에 의존하므로 반드시 순서대로 진행할 것.

---

## Task 1: 환경 설정 — shadcn 컴포넌트 설치 + 스텁 정리

**Files:**
- Install: shadcn `dialog`, `sonner`, `textarea`
- Delete: `src/components/shared/CreateCommentForm.tsx`
- Delete: `src/lib/service.ts`

- [ ] **Step 1: shadcn 컴포넌트 설치**

```bash
npx shadcn@latest add dialog sonner textarea
```

- [ ] **Step 2: 스텁 파일 삭제**

```bash
rm src/components/shared/CreateCommentForm.tsx
rm src/lib/service.ts
```

- [ ] **Step 3: CreateCommentForm import가 다른 곳에서 사용되는지 확인**

```bash
grep -r "CreateCommentForm" src/ --include="*.tsx" --include="*.ts"
```

사용처가 있으면 해당 import 제거. 없으면 다음으로.

- [ ] **Step 4: Toaster를 root layout에 추가**

Modify: `src/app/layout.tsx`

`<body>` 태그 안 최하단에 Toaster 추가:

```tsx
import { Toaster } from '@/components/ui/sonner';

// ... 기존 코드 ...

<body>
  {/* 기존 children */}
  <Toaster position="bottom-right" />
</body>
```

- [ ] **Step 5: 빌드 확인**

```bash
npm run build
```

정상 빌드 확인.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: shadcn dialog/sonner/textarea 설치 및 스텁 파일 정리"
```

---

## Task 2: DB 스키마 업데이트 + Drizzle 연결

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/index.ts`

- [ ] **Step 1: DB connection 인스턴스 생성**

Create: `src/lib/db/index.ts`

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

export const db = drizzle(client, { schema });
```

- [ ] **Step 2: comments 스키마 업데이트**

Modify: `src/lib/db/schema.ts`

```ts
import { pgTable, uuid, text, varchar, timestamp, index } from 'drizzle-orm/pg-core';

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postSlug: text('post_slug').notNull(),
    authorName: varchar('author_name', { length: 50 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    content: text('content').notNull(),
    parentId: uuid('parent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_comments_post_slug').on(table.postSlug),
    index('idx_comments_created_at').on(table.createdAt),
  ],
);
```

참고: `parentId`의 self-reference FK는 Drizzle에서 같은 테이블 참조 시 순환 문제가 발생할 수 있으므로, Supabase SQL Editor에서 직접 FK constraint를 추가한다:

```sql
ALTER TABLE comments
ADD CONSTRAINT fk_comments_parent
FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
```

- [ ] **Step 3: 마이그레이션 생성 및 적용**

```bash
npm run db:generate
npm run db:migrate
```

또는 schema만 push:

```bash
npm run db:push
```

- [ ] **Step 4: Supabase SQL Editor에서 FK 추가 + Realtime 활성화**

Supabase 대시보드에서:
1. SQL Editor → FK constraint 쿼리 실행
2. Database → Replication → `comments` 테이블 Realtime 활성화

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/
git commit -m "feat: Drizzle DB 연결 인스턴스 생성 및 comments 스키마 업데이트"
```

---

## Task 3: 타입 정의 + 트리 유틸리티

**Files:**
- Create: `src/types/comment.ts`
- Create: `src/lib/comments/tree.ts`

- [ ] **Step 1: Comment 타입 정의**

Create: `src/types/comment.ts`

```ts
export interface Comment {
  id: string;
  postSlug: string;
  authorName: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface CommentWithChildren extends Comment {
  children: CommentWithChildren[];
  depth: number;
}
```

- [ ] **Step 2: 트리 빌딩 유틸리티 구현**

Create: `src/lib/comments/tree.ts`

```ts
import type { Comment, CommentWithChildren } from '@/types/comment';

const MAX_INDENT_DEPTH = 4;

export function buildCommentTree(comments: Comment[]): CommentWithChildren[] {
  const map = new Map<string, CommentWithChildren>();
  const roots: CommentWithChildren[] = [];

  // 1. 모든 댓글을 Map에 등록
  for (const comment of comments) {
    map.set(comment.id, { ...comment, children: [], depth: 0 });
  }

  // 2. 부모-자식 관계 연결
  for (const comment of comments) {
    const node = map.get(comment.id)!;

    if (comment.parentId && map.has(comment.parentId)) {
      const parent = map.get(comment.parentId)!;
      node.depth = Math.min(parent.depth + 1, MAX_INDENT_DEPTH);
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function addCommentToTree(
  roots: CommentWithChildren[],
  newComment: Comment,
): CommentWithChildren[] {
  const node: CommentWithChildren = { ...newComment, children: [], depth: 0 };

  if (!newComment.parentId) {
    return [...roots, node];
  }

  return roots.map((root) => insertIntoTree(root, node));
}

function insertIntoTree(
  current: CommentWithChildren,
  node: CommentWithChildren,
): CommentWithChildren {
  if (current.id === node.parentId) {
    node.depth = Math.min(current.depth + 1, MAX_INDENT_DEPTH);
    return { ...current, children: [...current.children, node] };
  }

  return {
    ...current,
    children: current.children.map((child) => insertIntoTree(child, node)),
  };
}

export function removeCommentFromTree(
  roots: CommentWithChildren[],
  commentId: string,
): CommentWithChildren[] {
  return roots
    .filter((root) => root.id !== commentId)
    .map((root) => ({
      ...root,
      children: removeCommentFromTree(root.children, commentId),
    }));
}

export function updateCommentInTree(
  roots: CommentWithChildren[],
  commentId: string,
  content: string,
  updatedAt: string,
): CommentWithChildren[] {
  return roots.map((root) => {
    if (root.id === commentId) {
      return { ...root, content, updatedAt };
    }
    return {
      ...root,
      children: updateCommentInTree(root.children, commentId, content, updatedAt),
    };
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/comment.ts src/lib/comments/
git commit -m "feat: Comment 타입 정의 및 트리 빌딩 유틸리티 구현"
```

---

## Task 4: 스팸 방지 모듈

**Files:**
- Create: `src/lib/spam/honeypot.ts`
- Create: `src/lib/spam/rate-limit.ts`
- Create: `src/lib/spam/banned-words.ts`

- [ ] **Step 1: 허니팟 검증 구현**

Create: `src/lib/spam/honeypot.ts`

```ts
export function isHoneypotFilled(honeypotValue: string | undefined): boolean {
  return !!honeypotValue && honeypotValue.length > 0;
}
```

- [ ] **Step 2: Rate Limiting 구현**

Create: `src/lib/spam/rate-limit.ts`

```ts
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const MAX_REQUESTS = 3;
const WINDOW_MS = 60 * 1000; // 1분

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // 만료된 엔트리 정리
  if (entry && now > entry.resetTime) {
    rateLimitMap.delete(ip);
  }

  const current = rateLimitMap.get(ip);

  if (!current) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true };
  }

  if (current.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((current.resetTime - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  current.count += 1;
  return { allowed: true };
}
```

- [ ] **Step 3: 금지어 필터 구현**

Create: `src/lib/spam/banned-words.ts`

```ts
const BANNED_PATTERNS: RegExp[] = [
  // 기본 스팸/광고 패턴
  /카지노/gi,
  /도박/gi,
  /대출/gi,
  /성인/gi,
  /porn/gi,
  /casino/gi,
  /gambling/gi,
];

export function containsBannedWord(content: string): boolean {
  return BANNED_PATTERNS.some((pattern) => pattern.test(content));
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/spam/
git commit -m "feat: 스팸 방지 모듈 구현 (허니팟, Rate Limit, 금지어)"
```

---

## Task 5: Zod 검증 스키마 업데이트

**Files:**
- Modify: `src/lib/validations/comment.ts`

- [ ] **Step 1: updateCommentSchema 추가**

기존 파일에 추가:

```ts
export const updateCommentSchema = z.object({
  commentId: z.string().uuid({ error: '유효한 UUID 형식이어야 합니다.' }),
  password: z.string().min(4, '비밀번호는 4자 이상이어야 합니다.'),
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(1000, '댓글은 1000자 이하여야 합니다.'),
});

export type UpdateCommentData = z.infer<typeof updateCommentSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validations/comment.ts
git commit -m "feat: updateCommentSchema 추가"
```

---

## Task 6: Server Actions (댓글 CRUD)

**Files:**
- Create: `src/actions/comment.ts`

- [ ] **Step 1: createComment Server Action 구현**

Create: `src/actions/comment.ts`

```ts
'use server';

import { headers } from 'next/headers';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { db } from '@/lib/db';
import { comments } from '@/lib/db/schema';
import { commentFormSchema, deleteCommentSchema, updateCommentSchema } from '@/lib/validations/comment';
import { isHoneypotFilled } from '@/lib/spam/honeypot';
import { checkRateLimit } from '@/lib/spam/rate-limit';
import { containsBannedWord } from '@/lib/spam/banned-words';

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function createComment(formData: {
  authorName: string;
  password: string;
  content: string;
  parentId?: string;
  honeypot?: string;
  postSlug: string;
}): Promise<ActionResult> {
  // 1. 허니팟 체크 — 봇에게는 성공한 척
  if (isHoneypotFilled(formData.honeypot)) {
    return { success: true };
  }

  // 2. Rate Limiting
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown';
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return {
      success: false,
      error: `잠시 후에 다시 시도해주세요 (${rateCheck.retryAfterSeconds}초 후 작성 가능)`,
    };
  }

  // 3. Zod 검증
  const parsed = commentFormSchema.safeParse({
    authorName: formData.authorName,
    password: formData.password,
    content: formData.content,
    parentId: formData.parentId,
  });

  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? '입력값을 확인해주세요.';
    return { success: false, error: firstError };
  }

  // 4. 금지어 체크
  if (containsBannedWord(parsed.data.content)) {
    return { success: false, error: '부적절한 표현이 포함되어 있어요. 내용을 수정해주세요.' };
  }

  // 5. 비밀번호 해싱 + DB 저장
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await db.insert(comments).values({
    postSlug: formData.postSlug,
    authorName: parsed.data.authorName,
    passwordHash,
    content: parsed.data.content,
    parentId: parsed.data.parentId ?? null,
  });

  return { success: true };
}

export async function updateComment(formData: {
  commentId: string;
  password: string;
  content: string;
}): Promise<ActionResult> {
  // 1. Zod 검증
  const parsed = updateCommentSchema.safeParse(formData);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? '입력값을 확인해주세요.';
    return { success: false, error: firstError };
  }

  // 2. 금지어 체크
  if (containsBannedWord(parsed.data.content)) {
    return { success: false, error: '부적절한 표현이 포함되어 있어요. 내용을 수정해주세요.' };
  }

  // 3. 댓글 조회 + 비밀번호 검증
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, parsed.data.commentId))
    .limit(1);

  if (!comment) {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }

  const isPasswordValid = await bcrypt.compare(parsed.data.password, comment.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: '비밀번호가 일치하지 않아요. 다시 확인해주세요.' };
  }

  // 4. 업데이트
  await db
    .update(comments)
    .set({
      content: parsed.data.content,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, parsed.data.commentId));

  return { success: true };
}

export async function deleteComment(formData: {
  commentId: string;
  password: string;
}): Promise<ActionResult> {
  // 1. Zod 검증
  const parsed = deleteCommentSchema.safeParse(formData);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? '입력값을 확인해주세요.';
    return { success: false, error: firstError };
  }

  // 2. 댓글 조회 + 비밀번호 검증
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, parsed.data.commentId))
    .limit(1);

  if (!comment) {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }

  const isPasswordValid = await bcrypt.compare(parsed.data.password, comment.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: '비밀번호가 일치하지 않아요. 다시 확인해주세요.' };
  }

  // 3. 삭제 (CASCADE로 대댓글도 삭제됨)
  await db.delete(comments).where(eq(comments.id, parsed.data.commentId));

  return { success: true };
}

export async function verifyCommentPassword(formData: {
  commentId: string;
  password: string;
}): Promise<ActionResult> {
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, formData.commentId))
    .limit(1);

  if (!comment) {
    return { success: false, error: '댓글을 찾을 수 없어요.' };
  }

  const isPasswordValid = await bcrypt.compare(formData.password, comment.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: '비밀번호가 일치하지 않아요. 다시 확인해주세요.' };
  }

  return { success: true };
}
```

참고: `verifyCommentPassword`는 수정 플로우에서 비밀번호만 먼저 검증할 때 사용 (EditCommentDialog에서 호출).

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

Server Action이 정상 컴파일되는지 확인.

- [ ] **Step 3: Commit**

```bash
git add src/actions/comment.ts
git commit -m "feat: 댓글 CRUD Server Actions 구현"
```

---

## Task 7: Supabase Realtime 커스텀 훅

**Files:**
- Create: `src/hooks/useCommentRealtime.ts`

- [ ] **Step 1: useCommentRealtime 훅 구현**

Create: `src/hooks/useCommentRealtime.ts`

```ts
'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Comment } from '@/types/comment';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseCommentRealtimeOptions {
  postSlug: string;
  onInsert: (comment: Comment) => void;
  onUpdate: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
  onReconnect: () => void;
}

export function useCommentRealtime({
  postSlug,
  onInsert,
  onUpdate,
  onDelete,
  onReconnect,
}: UseCommentRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`comments:${postSlug}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `post_slug=eq.${postSlug}`,
        },
        (payload) => {
          const newComment = mapPayloadToComment(payload.new);
          onInsert(newComment);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comments',
          filter: `post_slug=eq.${postSlug}`,
        },
        (payload) => {
          const updatedComment = mapPayloadToComment(payload.new);
          onUpdate(updatedComment);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comments',
          filter: `post_slug=eq.${postSlug}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          onDelete(deletedId);
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn(
            '[CommentRealtime] Supabase Realtime 연결 실패. ' +
            'Supabase 대시보드에서 comments 테이블의 Realtime이 활성화되어 있는지 확인하세요.',
          );
        }
        if (status === 'SUBSCRIBED') {
          // 재연결 시 전체 목록 재조회
          if (channelRef.current) {
            onReconnect();
          }
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [postSlug]); // eslint-disable-line react-hooks/exhaustive-deps
}

function mapPayloadToComment(raw: Record<string, unknown>): Comment {
  return {
    id: raw.id as string,
    postSlug: raw.post_slug as string,
    authorName: raw.author_name as string,
    content: raw.content as string,
    parentId: (raw.parent_id as string) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: (raw.updated_at as string) ?? null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCommentRealtime.ts
git commit -m "feat: Supabase Realtime 댓글 구독 커스텀 훅 구현"
```

---

## Task 8: CommentForm 컴포넌트

**Files:**
- Create: `src/components/comments/CommentForm.tsx`

- [ ] **Step 1: CommentForm 구현**

Create: `src/components/comments/CommentForm.tsx`

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { commentFormSchema, type CommentFormData } from '@/lib/validations/comment';
import { createComment } from '@/actions/comment';

interface CommentFormProps {
  postSlug: string;
  parentId?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function CommentForm({ postSlug, parentId, onCancel, onSuccess }: CommentFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormData>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: {
      parentId: parentId,
    },
  });

  const onSubmit = async (data: CommentFormData) => {
    const result = await createComment({
      ...data,
      postSlug,
      honeypot: (document.getElementById('website') as HTMLInputElement)?.value,
    });

    if (result.success) {
      reset();
      onSuccess?.();
    } else {
      toast.error(result.error ?? '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-16">
      {/* 허니팟 필드 — 봇 전용, 사용자에게 보이지 않음 */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
      >
        <input
          type="text"
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="flex gap-12">
        <div className="flex-1">
          <Label htmlFor="authorName">닉네임</Label>
          <Input
            id="authorName"
            placeholder="닉네임을 입력하세요"
            {...register('authorName')}
          />
          {errors.authorName && (
            <p className="text-sm text-red-500 mt-4">{errors.authorName.message}</p>
          )}
        </div>
        <div className="flex-1">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            type="password"
            placeholder="수정/삭제 시 필요해요"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-sm text-red-500 mt-4">{errors.password.message}</p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="content">댓글</Label>
        <Textarea
          id="content"
          placeholder="댓글을 남겨주세요"
          rows={4}
          {...register('content')}
        />
        {errors.content && (
          <p className="text-sm text-red-500 mt-4">{errors.content.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-8">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '작성 중...' : parentId ? '답글 작성' : '댓글 작성'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/comments/CommentForm.tsx
git commit -m "feat: CommentForm 컴포넌트 구현"
```

---

## Task 9: EditCommentDialog + DeleteCommentDialog

**Files:**
- Create: `src/components/comments/EditCommentDialog.tsx`
- Create: `src/components/comments/DeleteCommentDialog.tsx`

- [ ] **Step 1: EditCommentDialog 구현**

Create: `src/components/comments/EditCommentDialog.tsx`

비밀번호 검증 → 성공 시 인라인 수정 모드 활성화를 트리거하는 Dialog.

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { verifyCommentPassword } from '@/actions/comment';

interface EditCommentDialogProps {
  commentId: string;
  onVerified: (password: string) => void;
  children: React.ReactNode;
}

export function EditCommentDialog({ commentId, onVerified, children }: EditCommentDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    setError('');
    setIsLoading(true);

    const result = await verifyCommentPassword({ commentId, password });

    if (result.success) {
      setOpen(false);
      onVerified(password);
      setPassword('');
    } else {
      setError(result.error ?? '일시적인 오류가 발생했어요.');
    }

    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>댓글 수정</DialogTitle>
          <DialogDescription>
            댓글 작성 시 입력한 비밀번호를 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-16">
          <div>
            <Label htmlFor="edit-password">비밀번호</Label>
            <Input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              placeholder="비밀번호를 입력하세요"
            />
            {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
          </div>
          <div className="flex justify-end gap-8">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={handleVerify} disabled={isLoading || password.length < 4}>
              {isLoading ? '확인 중...' : '확인'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: DeleteCommentDialog 구현**

Create: `src/components/comments/DeleteCommentDialog.tsx`

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteComment } from '@/actions/comment';

interface DeleteCommentDialogProps {
  commentId: string;
  children: React.ReactNode;
}

export function DeleteCommentDialog({ commentId, children }: DeleteCommentDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    setError('');
    setIsLoading(true);

    const result = await deleteComment({ commentId, password });

    if (result.success) {
      setOpen(false);
      setPassword('');
      toast.success('댓글이 삭제되었어요.');
    } else {
      setError(result.error ?? '일시적인 오류가 발생했어요.');
    }

    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>댓글 삭제</DialogTitle>
          <DialogDescription>
            삭제하면 되돌릴 수 없어요. 댓글 작성 시 입력한 비밀번호를 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-16">
          <div>
            <Label htmlFor="delete-password">비밀번호</Label>
            <Input
              id="delete-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
              placeholder="비밀번호를 입력하세요"
            />
            {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
          </div>
          <div className="flex justify-end gap-8">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading || password.length < 4}
            >
              {isLoading ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/comments/EditCommentDialog.tsx src/components/comments/DeleteCommentDialog.tsx
git commit -m "feat: EditCommentDialog 및 DeleteCommentDialog 구현"
```

---

## Task 10: CommentItem 컴포넌트

**Files:**
- Create: `src/components/comments/CommentItem.tsx`

- [ ] **Step 1: CommentItem 구현**

Create: `src/components/comments/CommentItem.tsx`

개별 댓글을 표시하고, 답글/수정/삭제 토글을 관리한다. 수정 모드일 때 인라인 수정 폼을 표시한다.

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EditCommentDialog } from './EditCommentDialog';
import { DeleteCommentDialog } from './DeleteCommentDialog';
import { CommentForm } from './CommentForm';
import { updateComment } from '@/actions/comment';
import type { CommentWithChildren } from '@/types/comment';
import { z } from 'zod';

const editContentSchema = z.object({
  content: z.string().min(1, '댓글 내용을 입력해주세요.').max(1000, '댓글은 1000자 이하여야 합니다.'),
});

interface CommentItemProps {
  comment: CommentWithChildren;
  postSlug: string;
  editingCommentId: string | null;
  editingPassword: string | null;
  onStartEditing: (commentId: string, password: string) => void;
  onStopEditing: () => void;
}

export function CommentItem({
  comment,
  postSlug,
  editingCommentId,
  editingPassword,
  onStartEditing,
  onStopEditing,
}: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const isEditing = editingCommentId === comment.id;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(editContentSchema),
    defaultValues: { content: comment.content },
  });

  const handleEditVerified = (password: string) => {
    onStartEditing(comment.id, password);
  };

  const handleEditSubmit = async (data: { content: string }) => {
    if (!editingPassword) return;
    setIsSubmittingEdit(true);

    const result = await updateComment({
      commentId: comment.id,
      password: editingPassword,
      content: data.content,
    });

    if (result.success) {
      onStopEditing();
      toast.success('댓글이 수정되었어요.');
    } else {
      toast.error(result.error ?? '일시적인 오류가 발생했어요.');
    }

    setIsSubmittingEdit(false);
  };

  const handleCancelEdit = () => {
    onStopEditing();
  };

  const indentPx = comment.depth * 24;
  const isUpdated = !!comment.updatedAt;

  const formattedDate = new Date(comment.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div style={{ marginLeft: `${indentPx}px` }}>
      <div className="py-16 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-8 mb-8">
          <span className="font-medium text-sm">{comment.authorName}</span>
          <span className="text-xs text-gray-400">{formattedDate}</span>
          {isUpdated && <span className="text-xs text-gray-400">(수정됨)</span>}
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit(handleEditSubmit)} className="space-y-8">
            <Textarea {...register('content')} rows={3} />
            {errors.content && (
              <p className="text-sm text-red-500">{errors.content.message}</p>
            )}
            <div className="flex gap-8">
              <Button type="submit" size="sm" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? '수정 중...' : '수정 완료'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleCancelEdit}>
                취소
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {comment.content}
          </p>
        )}

        {!isEditing && (
          <div className="flex gap-8 mt-8">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-400 h-auto p-0"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              답글
            </Button>
            <EditCommentDialog
              commentId={comment.id}
              onVerified={handleEditVerified}
            >
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 h-auto p-0"
              >
                수정
              </Button>
            </EditCommentDialog>
            <DeleteCommentDialog commentId={comment.id}>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 h-auto p-0"
              >
                삭제
              </Button>
            </DeleteCommentDialog>
          </div>
        )}

        {showReplyForm && (
          <div className="mt-12">
            <CommentForm
              postSlug={postSlug}
              parentId={comment.id}
              onCancel={() => setShowReplyForm(false)}
              onSuccess={() => setShowReplyForm(false)}
            />
          </div>
        )}
      </div>

      {comment.children.map((child) => (
        <CommentItem
          key={child.id}
          comment={child}
          postSlug={postSlug}
          editingCommentId={editingCommentId}
          editingPassword={editingCommentId === child.id ? editingPassword : null}
          onStartEditing={onStartEditing}
          onStopEditing={onStopEditing}
        />
      ))}
    </div>
  );
}
```

참고: 수정 플로우는 `CommentSection`에서 `editingState`(commentId + password)를 관리한다. `EditCommentDialog`에서 검증 성공 시 `onStartEditing(commentId, password)`를 호출하여 상태를 올리고, 해당 댓글의 `CommentItem`만 `isEditing = true`가 된다. 비밀번호는 해당 댓글에만 전달되므로 다른 `CommentItem`에 노출되지 않는다.

- [ ] **Step 2: Commit**

```bash
git add src/components/comments/CommentItem.tsx
git commit -m "feat: CommentItem 컴포넌트 구현 (답글/수정/삭제)"
```

---

## Task 11: CommentList 컴포넌트

**Files:**
- Create: `src/components/comments/CommentList.tsx`

- [ ] **Step 1: CommentList 구현**

Create: `src/components/comments/CommentList.tsx`

```tsx
'use client';

import type { CommentWithChildren } from '@/types/comment';
import { CommentItem } from './CommentItem';

interface CommentListProps {
  comments: CommentWithChildren[];
  postSlug: string;
  editingCommentId: string | null;
  editingPassword: string | null;
  onStartEditing: (commentId: string, password: string) => void;
  onStopEditing: () => void;
}

export function CommentList({
  comments,
  postSlug,
  editingCommentId,
  editingPassword,
  onStartEditing,
  onStopEditing,
}: CommentListProps) {
  if (comments.length === 0) {
    return (
      <p className="text-center text-gray-400 py-32">
        아직 댓글이 없어요. 첫 번째 댓글을 남겨주세요!
      </p>
    );
  }

  return (
    <div>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postSlug={postSlug}
          editingCommentId={editingCommentId}
          editingPassword={editingCommentId === comment.id ? editingPassword : null}
          onStartEditing={onStartEditing}
          onStopEditing={onStopEditing}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/comments/CommentList.tsx
git commit -m "feat: CommentList 컴포넌트 구현"
```

---

## Task 12: CommentSection (최상위 조합 컴포넌트)

**Files:**
- Create: `src/components/comments/CommentSection.tsx`

- [ ] **Step 1: CommentSection 구현**

Create: `src/components/comments/CommentSection.tsx`

```tsx
'use client';

import { useState, useCallback } from 'react';

import { CommentForm } from './CommentForm';
import { CommentList } from './CommentList';
import { useCommentRealtime } from '@/hooks/useCommentRealtime';
import {
  buildCommentTree,
  addCommentToTree,
  removeCommentFromTree,
  updateCommentInTree,
} from '@/lib/comments/tree';
import type { Comment, CommentWithChildren } from '@/types/comment';

interface CommentSectionProps {
  postSlug: string;
  initialComments: Comment[];
}

export function CommentSection({ postSlug, initialComments }: CommentSectionProps) {
  const [commentTree, setCommentTree] = useState<CommentWithChildren[]>(
    () => buildCommentTree(initialComments),
  );
  const [editingState, setEditingState] = useState<{
    commentId: string;
    password: string;
  } | null>(null);

  const handleInsert = useCallback((comment: Comment) => {
    setCommentTree((prev) => addCommentToTree(prev, comment));
  }, []);

  const handleUpdate = useCallback((comment: Comment) => {
    setCommentTree((prev) =>
      updateCommentInTree(prev, comment.id, comment.content, comment.updatedAt ?? new Date().toISOString()),
    );
  }, []);

  const handleDelete = useCallback((commentId: string) => {
    setCommentTree((prev) => removeCommentFromTree(prev, commentId));
  }, []);

  const handleReconnect = useCallback(() => {
    // Realtime 재연결 시 전체 목록 재조회 — 서버 컴포넌트 리프레시 필요
    // 현재는 간단히 window.location.reload()로 처리
    // 추후 별도 API Route로 개선 가능
    window.location.reload();
  }, []);

  useCommentRealtime({
    postSlug,
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
    onReconnect: handleReconnect,
  });

  const handleStartEditing = (commentId: string, password: string) => {
    setEditingState({ commentId, password });
  };

  const handleStopEditing = () => {
    setEditingState(null);
  };

  const commentCount = countComments(commentTree);

  return (
    <section className="mt-48 pt-32 border-t border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-bold mb-20">댓글 {commentCount > 0 && `(${commentCount})`}</h2>

      <CommentForm postSlug={postSlug} />

      <div className="mt-24">
        <CommentList
          comments={commentTree}
          postSlug={postSlug}
          editingCommentId={editingState?.commentId ?? null}
          editingPassword={editingState?.password ?? null}
          onStartEditing={handleStartEditing}
          onStopEditing={handleStopEditing}
        />
      </div>
    </section>
  );
}

function countComments(tree: CommentWithChildren[]): number {
  return tree.reduce((sum, node) => sum + 1 + countComments(node.children), 0);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/comments/CommentSection.tsx
git commit -m "feat: CommentSection 컴포넌트 구현 (상태 관리 + Realtime 통합)"
```

---

## Task 13: PostPage에 CommentSection 통합

**Files:**
- Modify: `src/app/posts/[slug]/page.tsx`

- [ ] **Step 1: 초기 댓글 조회 + CommentSection 추가**

`src/app/posts/[slug]/page.tsx`의 `PostPage` 함수에 다음을 추가:

1. 파일 상단에 import 추가:

```tsx
import { db } from '@/lib/db';
import { comments } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { CommentSection } from '@/components/comments/CommentSection';
import type { Comment } from '@/types/comment';
```

2. `PostPage` 함수 내부, `getAdjacentPosts` 호출 후에 댓글 조회 추가:

```tsx
  const rawComments = await db
    .select({
      id: comments.id,
      postSlug: comments.postSlug,
      authorName: comments.authorName,
      content: comments.content,
      parentId: comments.parentId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
    })
    .from(comments)
    .where(eq(comments.postSlug, slug))
    .orderBy(asc(comments.createdAt));

  const initialComments: Comment[] = rawComments.map((c) => ({
    ...c,
    parentId: c.parentId ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt?.toISOString() ?? null,
  }));
```

3. JSX에서 `</nav>` 닫는 태그 다음, `</article>` 닫는 태그 이전에 추가:

```tsx
          <CommentSection postSlug={slug} initialComments={initialComments} />
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: 개발 서버에서 수동 테스트**

```bash
npm run dev
```

브라우저에서 아무 포스트 상세 페이지 접속 → 댓글 영역 표시 확인.

- [ ] **Step 4: Commit**

```bash
git add src/app/posts/[slug]/page.tsx
git commit -m "feat: PostPage에 CommentSection 통합 — 댓글 시스템 연동 완료"
```

---

## Task 14: E2E 수동 테스트 + 최종 정리

- [ ] **Step 1: 댓글 작성 테스트**

개발 서버에서:
1. 포스트 상세 페이지 접속
2. 닉네임, 비밀번호, 댓글 내용 입력 → 작성 버튼 클릭
3. 댓글이 목록에 나타나는지 확인

- [ ] **Step 2: 대댓글 테스트**

1. 기존 댓글의 "답글" 버튼 클릭
2. 답글 폼에 내용 입력 → 작성
3. 부모 댓글 아래에 들여쓰기로 표시되는지 확인

- [ ] **Step 3: 댓글 수정 테스트**

1. 댓글의 "수정" 버튼 클릭
2. 비밀번호 입력 → 확인
3. 인라인 수정 폼으로 전환되는지 확인
4. 내용 수정 후 저장
5. "(수정됨)" 표시 확인

- [ ] **Step 4: 댓글 삭제 테스트**

1. 댓글의 "삭제" 버튼 클릭
2. 비밀번호 입력 → 삭제
3. 댓글이 사라지는지 확인
4. 대댓글이 있는 댓글 삭제 시 대댓글도 함께 삭제되는지 확인

- [ ] **Step 5: 스팸 방지 테스트**

1. 금지어가 포함된 댓글 작성 시도 → 에러 메시지 확인
2. 빠르게 3개 이상 댓글 연속 작성 → Rate Limit 메시지 확인

- [ ] **Step 6: 에러 케이스 테스트**

1. 삭제 시 틀린 비밀번호 입력 → 에러 메시지 확인
2. 빈 내용으로 작성 시도 → 폼 검증 에러 확인

- [ ] **Step 7: 최종 Commit**

```bash
git add -A
git commit -m "feat: Phase 3 댓글 시스템 구현 완료"
```
