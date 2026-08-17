import { describe, expect, it } from 'vitest';

import type { Comment, CommentWithChildren } from '@/types/comment';

import { buildCommentTree } from './tree';
import { DEFAULT_COMMENT_SORT, sortRootComments } from './sort';

let seq = 0;
function makeComment(overrides: Partial<Comment> = {}): Comment {
  seq += 1;
  return {
    id: overrides.id ?? `c${seq}`,
    postSlug: 'test-post',
    authorName: 'tester',
    content: `content-${seq}`,
    parentId: null,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: null,
    ...overrides,
  };
}

function ids(roots: CommentWithChildren[]): string[] {
  return roots.map((n) => n.id);
}

/** 루트 3건(등록순 r1→r2→r3) + r1에 답글 2건(등록순 a→b) */
function makeTree(): CommentWithChildren[] {
  return buildCommentTree([
    makeComment({ id: 'r1', createdAt: '2026-08-09T01:00:00.000Z' }),
    makeComment({ id: 'r2', createdAt: '2026-08-09T02:00:00.000Z' }),
    makeComment({ id: 'r3', createdAt: '2026-08-09T03:00:00.000Z' }),
    makeComment({
      id: 'reply-a',
      parentId: 'r1',
      createdAt: '2026-08-09T04:00:00.000Z',
    }),
    makeComment({
      id: 'reply-b',
      parentId: 'r1',
      createdAt: '2026-08-09T05:00:00.000Z',
    }),
  ]);
}

describe('sortRootComments (설계 §3.3 댓글 루트 정렬 정본)', () => {
  it('기본값(DEFAULT_COMMENT_SORT)은 oldest다', () => {
    expect(DEFAULT_COMMENT_SORT).toBe('oldest');
  });

  it('oldest면 createdAt 오름차순, newest면 내림차순', () => {
    const tree = makeTree();
    expect(ids(sortRootComments(tree, 'oldest'))).toEqual(['r1', 'r2', 'r3']);
    expect(ids(sortRootComments(tree, 'newest'))).toEqual(['r3', 'r2', 'r1']);
  });

  it('루트만 재정렬되고 children의 순서·참조는 그대로다', () => {
    const tree = makeTree();
    const sorted = sortRootComments(tree, 'newest');
    const r1 = sorted.find((n) => n.id === 'r1')!;
    // 답글은 항상 스레드 내 시간순 유지 (설계 §3.2)
    expect(ids(r1.children)).toEqual(['reply-a', 'reply-b']);
    // 노드는 새로 만들지 않는다 — 배열만 복사, 참조 동일
    expect(r1).toBe(tree[0]);
    expect(r1.children).toBe(tree[0].children);
  });

  it('`Z`와 `+00:00` 혼합 포맷도 시간값 기준으로 정렬한다', () => {
    // 문자열 비교라면 'Z'(0x5A) < '+'(0x2B) 관계가 시간과 무관하게 끼어든다
    const tree = buildCommentTree([
      makeComment({ id: 'late-z', createdAt: '2026-08-09T03:00:00.000Z' }),
      makeComment({ id: 'early-offset', createdAt: '2026-08-09T01:00:00.000+00:00' }),
      makeComment({ id: 'mid-offset', createdAt: '2026-08-09T02:00:00.000+00:00' }),
    ]);
    expect(ids(sortRootComments(tree, 'oldest'))).toEqual([
      'early-offset',
      'mid-offset',
      'late-z',
    ]);
    expect(ids(sortRootComments(tree, 'newest'))).toEqual([
      'late-z',
      'mid-offset',
      'early-offset',
    ]);
  });

  it('동시각이면 id 오름차순 tie-break (결정성)', () => {
    const same = '2026-08-09T00:00:00.000Z';
    const tree = buildCommentTree([
      makeComment({ id: 'bbb', createdAt: same }),
      makeComment({ id: 'aaa', createdAt: same }),
      // 포맷이 달라도 같은 시각이면 동시각 취급
      makeComment({ id: 'ccc', createdAt: '2026-08-09T00:00:00.000+00:00' }),
    ]);
    expect(ids(sortRootComments(tree, 'oldest'))).toEqual(['aaa', 'bbb', 'ccc']);
    expect(ids(sortRootComments(tree, 'newest'))).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('원본 배열을 변형하지 않는다 (복사 정렬)', () => {
    const tree = makeTree();
    const snapshot = [...tree];
    sortRootComments(tree, 'newest');
    expect(tree).toEqual(snapshot);
    expect(ids(tree)).toEqual(['r1', 'r2', 'r3']);
  });

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(sortRootComments([], 'oldest')).toEqual([]);
    expect(sortRootComments([], 'newest')).toEqual([]);
  });

  // --- QA 보강 케이스 (sort-controls §5) ---

  it('`Z`/`+00:00` 혼합 포맷에서 밀리초 1ms 차이를 구분한다', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'plus-1ms', createdAt: '2026-08-09T00:00:00.001+00:00' }),
      makeComment({ id: 'z-0ms', createdAt: '2026-08-09T00:00:00.000Z' }),
      makeComment({ id: 'z-2ms', createdAt: '2026-08-09T00:00:00.002Z' }),
    ]);
    expect(ids(sortRootComments(tree, 'oldest'))).toEqual([
      'z-0ms',
      'plus-1ms',
      'z-2ms',
    ]);
    expect(ids(sortRootComments(tree, 'newest'))).toEqual([
      'z-2ms',
      'plus-1ms',
      'z-0ms',
    ]);
  });

  it('비UTC 오프셋(+09:00)도 절대 시각 기준으로 비교한다', () => {
    const tree = buildCommentTree([
      // 09:00+09:00 == 00:00Z (동일 순간) → id tie-break
      makeComment({ id: 'kst-same', createdAt: '2026-08-09T09:00:00+09:00' }),
      makeComment({ id: 'utc-same', createdAt: '2026-08-09T00:00:00.000Z' }),
      // 08:00+09:00 == 23:00Z(전날) → 가장 이른 순간
      makeComment({ id: 'kst-earlier', createdAt: '2026-08-09T08:00:00+09:00' }),
    ]);
    expect(ids(sortRootComments(tree, 'oldest'))).toEqual([
      'kst-earlier',
      'kst-same',
      'utc-same',
    ]);
  });

  it('잘못된 createdAt 문자열이 섞여도 던지지 않고 전 요소를 보존한다 (방어 동작)', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'valid-late', createdAt: '2026-08-09T03:00:00.000Z' }),
      makeComment({ id: 'broken', createdAt: 'not-a-date' }),
      makeComment({ id: 'empty', createdAt: '' }),
      makeComment({ id: 'valid-early', createdAt: '2026-08-09T01:00:00.000Z' }),
    ]);
    let sorted: CommentWithChildren[] = [];
    expect(() => {
      sorted = sortRootComments(tree, 'oldest');
    }).not.toThrow();
    expect(sorted).toHaveLength(4);
    expect([...ids(sorted)].sort()).toEqual([
      'broken',
      'empty',
      'valid-early',
      'valid-late',
    ]);
    // 원본 트리도 변형되지 않는다
    expect(ids(tree)).toEqual(['valid-late', 'broken', 'empty', 'valid-early']);
  });

  it('children이 빈 배열인 루트만으로 구성된 트리도 정상 정렬한다', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'b', createdAt: '2026-08-09T02:00:00.000Z' }),
      makeComment({ id: 'a', createdAt: '2026-08-09T01:00:00.000Z' }),
    ]);
    const sorted = sortRootComments(tree, 'newest');
    expect(ids(sorted)).toEqual(['b', 'a']);
    // 빈 children은 그대로 빈 배열·동일 참조
    expect(sorted[0].children).toEqual([]);
    expect(sorted[0].children).toBe(tree[0].children);
  });

  it('NEWEST 파생 정렬에서 append된 새 루트 댓글이 맨 앞으로 온다 (설계 §3.4 시나리오)', () => {
    // 저장 상태는 asc append 불변식: 새 댓글은 항상 배열 끝에 붙는다
    const tree = makeTree();
    const appended = [
      ...tree,
      ...buildCommentTree([
        makeComment({ id: 'fresh', createdAt: '2026-08-09T09:00:00.000Z' }),
      ]),
    ];
    expect(ids(sortRootComments(appended, 'newest'))[0]).toBe('fresh');
    expect(ids(sortRootComments(appended, 'oldest')).at(-1)).toBe('fresh');
  });

  it('대량(500건) 무작위 시각 입력에서도 정렬 불변식을 만족한다', () => {
    const base = Date.parse('2026-08-09T00:00:00.000Z');
    const roots = buildCommentTree(
      Array.from({ length: 500 }, (_, i) =>
        makeComment({
          id: `id-${String((i * 197) % 500).padStart(3, '0')}`,
          // 시각을 50종으로 압축해 동시각 tie-break 경로도 대량으로 태운다
          createdAt: new Date(base + ((i * 31) % 50) * 60_000).toISOString(),
        }),
      ),
    );

    const assertInvariant = (
      sorted: CommentWithChildren[],
      newestFirst: boolean,
    ) => {
      expect(sorted).toHaveLength(500);
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = Date.parse(sorted[i - 1].createdAt);
        const curr = Date.parse(sorted[i].createdAt);
        if (prev === curr) {
          expect(
            sorted[i - 1].id.localeCompare(sorted[i].id),
          ).toBeLessThanOrEqual(0);
        } else if (newestFirst) {
          expect(prev).toBeGreaterThan(curr);
        } else {
          expect(prev).toBeLessThan(curr);
        }
      }
    };

    assertInvariant(sortRootComments(roots, 'oldest'), false);
    assertInvariant(sortRootComments(roots, 'newest'), true);
  });
});
