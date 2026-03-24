# Phase 3: 댓글 시스템 설계

> 익명 댓글 시스템 — 무제한 깊이 대댓글, Supabase Realtime 실시간 구독, Server Actions 기반

## 1. 아키텍처 개요

**접근 방식: Server Actions + Supabase Realtime**

- **쓰기 경로**: React Hook Form → Server Action → Zod 검증 → 스팸 체크 → bcrypt 해싱 → Drizzle ORM → PostgreSQL
- **읽기 경로**: 초기 SSR(서버 컴포넌트에서 Drizzle 조회) + Supabase Realtime WebSocket 구독
- **삭제 경로**: Dialog 비밀번호 입력 → Server Action → bcrypt.compare → Drizzle DELETE (CASCADE)

```
[클라이언트]                        [서버]                      [DB]
    │                                │                          │
    │  ── 댓글 작성 (form submit) ──→│                          │
    │                                │  Server Action           │
    │                                │  ├─ Zod 검증             │
    │                                │  ├─ 스팸 체크            │
    │                                │  ├─ bcrypt 해싱          │
    │                                │  └─ Drizzle INSERT ─────→│
    │                                │                          │
    │  ←── Supabase Realtime ────────│←── pg_notify ────────────│
    │                                │                          │
    │  ── 댓글 삭제 (password) ─────→│                          │
    │                                │  Server Action           │
    │                                │  ├─ bcrypt.compare()     │
    │                                │  └─ Drizzle DELETE ─────→│
    │                                │                          │
    │  ←── Realtime (DELETE) ────────│←── pg_notify ────────────│
```

### 선택 근거

| 대안 | 기각 이유 |
|------|----------|
| Supabase Client 전용 | bcrypt를 클라이언트에서 실행하면 보안 약화. Drizzle ORM 스키마 활용 불가 |
| Route Handler + Polling | 실시간 요구사항 미충족. 불필요한 네트워크 요청 |

## 2. 컴포넌트 구조

```
PostPage (Server Component)
  └─ CommentSection (Client Component - "use client")
       ├─ CommentForm
       │   ├─ 닉네임, 비밀번호, 내용 입력
       │   ├─ 허니팟 hidden field
       │   └─ React Hook Form + Zod
       │
       └─ CommentList
            └─ CommentItem (재귀)
                 ├─ 닉네임, 내용, 작성일
                 ├─ 답글 버튼 → CommentForm (inline, parent_id 전달)
                 ├─ 삭제 버튼 → DeleteCommentDialog
                 └─ children: CommentItem[] (재귀 렌더링)
```

### 컴포넌트별 책임

| 컴포넌트 | 타입 | 단일 책임 |
|----------|------|----------|
| `CommentSection` | Client | 초기 데이터 수신(props), Realtime 구독 관리, 댓글 상태 보유 |
| `CommentForm` | Client | 폼 입력/검증(React Hook Form + Zod), Server Action 호출, 허니팟 필드 |
| `CommentList` | Client | flat 배열 → 트리 변환, 재귀 렌더링 |
| `CommentItem` | Client | 단일 댓글 표시, 답글/삭제 UI 토글 |
| `DeleteCommentDialog` | Client | shadcn Dialog, 비밀번호 입력 → Server Action 호출 |
| `actions/comment.ts` | Server | `createComment`, `deleteComment` Server Actions |

### SOLID 원칙 적용

- **SRP**: 각 컴포넌트와 모듈이 하나의 책임만 담당. `useCommentRealtime` 훅으로 Realtime 로직 분리.
- **OCP**: 스팸 필터는 독립 모듈(`lib/spam/`)로, 새 필터 추가 시 기존 코드 수정 없이 모듈만 추가.
- **LSP**: `CommentItem`은 depth에 관계없이 동일한 인터페이스로 재귀 렌더링.
- **ISP**: `CommentForm`은 작성 관련 props만, `DeleteCommentDialog`는 삭제 관련 props만 수신.
- **DIP**: Server Action은 스팸 체크 모듈의 구체적 구현이 아닌 검증 함수 인터페이스에 의존.

## 3. 대댓글 트리 구조

**데이터 모델**: `parent_id` 자기참조 (무제한 깊이)

**트리 빌딩 로직** (`lib/comments/tree.ts`):
1. DB에서 `post_slug` 기준 flat 배열 조회 (`created_at ASC`)
2. `Map<id, CommentWithChildren>` 구성
3. `parent_id`가 null인 것은 루트, 아닌 것은 부모의 children에 추가
4. 루트 댓글 배열 반환

**렌더링 깊이 제한**: 데이터는 무제한 저장하되, UI에서 들여쓰기는 최대 **4단계**까지만 적용. 그 이상은 4단계 깊이에서 flat하게 표시.

## 4. Supabase Realtime 구독

**커스텀 훅**: `useCommentRealtime(postSlug, onInsert, onDelete)`

- `post_slug` 필터로 해당 포스트 댓글만 구독
- `INSERT` 이벤트: 새 댓글을 상태에 추가 → 트리 재빌드
- `DELETE` 이벤트: 해당 댓글 + 자식들을 상태에서 제거
- 연결 끊김 시 자동 재연결 (Supabase 내장) → 재연결 시 전체 목록 재조회로 동기화

**사전 요구사항**: Supabase 대시보드에서 `comments` 테이블의 Realtime 기능 활성화 필요.

**Realtime 미활성화 감지**: `useCommentRealtime` 훅에서 구독 상태를 모니터링하고, `CHANNEL_ERROR` 발생 시 콘솔에 경고 로그를 출력하여 개발자가 인지할 수 있도록 한다. Realtime이 비활성화된 경우에도 초기 SSR 데이터는 정상 표시되므로, 실시간 갱신만 동작하지 않는 graceful degradation.

## 5. 스팸 방지 시스템

3개의 독립 레이어:

### 5-1. 허니팟 (`lib/spam/honeypot.ts`)
- CSS로 숨긴 `website` 필드 (`tabindex="-1"`, `aria-hidden="true"`, `autocomplete="off"`)
- 봇이 채우면 서버에서 조용히 성공 응답 반환 (봇에게 실패를 알리지 않음)

### 5-2. Rate Limiting (`lib/spam/rate-limit.ts`)
- IP + 시간 기반: 동일 IP에서 1분당 최대 3개 댓글
- 서버 메모리 `Map<ip, { count, resetTime }>` 방식
- 초과 시 사용자 친화적 메시지와 함께 거부
- **한계**: 서버 메모리 기반이므로 재배포 시 초기화됨. 단일 인스턴스 배포(Vercel Serverless)에서는 인스턴스 간 상태가 공유되지 않지만, 개인 블로그 트래픽 규모에서는 충분. 추후 필요 시 Redis/Upstash로 업그레이드 가능.
- **비밀번호 규칙**: 최소 4자 (기존 Zod 스키마 `commentFormSchema`와 동일)

### 5-3. 금지어 필터 (`lib/spam/banned-words.ts`)
- 금지어 배열 + 정규식 매칭
- 매칭 시 사용자 친화적 에러 메시지 반환

## 6. 에러 처리

사용자 친화적 메시지 원칙:
- 기술적 용어 대신 일상 언어 사용
- 문제가 무엇인지 + 어떻게 해결할 수 있는지 안내
- 부드러운 톤 유지

| 상황 | 처리 방식 | 사용자 메시지 |
|------|----------|-------------|
| 폼 검증 실패 | 인라인 에러 (React Hook Form) | `"닉네임은 2~20자로 입력해주세요"` 등 필드별 안내 |
| 스팸 감지 (허니팟) | 성공한 척 응답 | (봇 대상이므로 메시지 없음) |
| Rate Limit 초과 | toast 알림 | `"잠시 후에 다시 시도해주세요 (N초 후 작성 가능)"` |
| 금지어 감지 | 인라인 에러 | `"부적절한 표현이 포함되어 있어요. 내용을 수정해주세요"` |
| 삭제 비밀번호 불일치 | Dialog 내 에러 | `"비밀번호가 일치하지 않아요. 다시 확인해주세요"` |
| Realtime 연결 끊김 | 자동 재연결 | (Supabase 내장, 사용자 인지 불필요) |
| Server Action 실패 | toast 에러 | `"일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요"` |

## 7. 파일 구조

### 새로 추가되는 파일

```
src/
├── actions/
│   └── comment.ts                # createComment, deleteComment Server Actions
├── components/
│   └── comments/
│       ├── CommentSection.tsx     # Realtime 구독 + 상태 관리
│       ├── CommentForm.tsx        # 작성 폼 (React Hook Form)
│       ├── CommentList.tsx        # flat → tree 변환 + 재귀 렌더링
│       ├── CommentItem.tsx        # 개별 댓글 UI
│       └── DeleteCommentDialog.tsx # 삭제 비밀번호 모달
├── hooks/
│   └── useCommentRealtime.ts     # Supabase Realtime 구독 커스텀 훅
├── lib/
│   ├── spam/
│   │   ├── honeypot.ts           # 허니팟 검증
│   │   ├── rate-limit.ts         # Rate Limiting (IP 기반)
│   │   └── banned-words.ts       # 금지어 목록 + 필터
│   └── comments/
│       └── tree.ts               # flat → tree 변환 유틸
├── types/
│   └── comment.ts                # Comment, CommentTree 타입 정의
```

### 기존 파일 수정

- `src/app/posts/[slug]/page.tsx` — `CommentSection` 추가, 초기 댓글 데이터 Drizzle 조회
- `src/lib/db/schema.ts` — 기존 `parentId: uuid('parent_id')` 컬럼에 `.references(() => comments.id, { onDelete: 'cascade' })` 외래키 제약 조건 추가

### 추가 패키지

```bash
# npm 패키지
npm install bcryptjs react-hook-form @hookform/resolvers
npm install -D @types/bcryptjs

# shadcn/ui 컴포넌트
npx shadcn@latest add dialog
npx shadcn@latest add sonner
```

- `bcryptjs` — 비밀번호 해싱 (pure JS, Edge 호환)
- `react-hook-form` + `@hookform/resolvers` — 폼 관리 + Zod 연동
- shadcn `sonner` — toast 알림 UI (에러/성공 알림)
- shadcn `dialog` — 삭제 비밀번호 모달

## 8. DB 스키마 변경

현재 `src/lib/db/schema.ts`의 `comments` 테이블은 `parentId` 컬럼이 있지만 외래키 참조가 없음. self-reference 추가:

```typescript
parentId: uuid('parent_id').references(() => comments.id, { onDelete: 'cascade' }),
```

Supabase 대시보드에서 Realtime 활성화 필요:
- Database → Replication → `comments` 테이블 활성화
