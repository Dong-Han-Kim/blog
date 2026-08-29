import { describe, expect, it } from 'vitest';

import type { Comment, CommentWithChildren } from '@/types/comment';

import { buildCommentTree, countNodes } from './tree';

/**
 * QA 계약 테스트 — countNodes (B-6 / L1).
 * CommentItem.countReplies와 CommentSection.countComments가 이 함수 하나로 합쳐졌다.
 * 두 용법의 의미 차이(자신 포함 여부)가 **인자로만** 결정되므로,
 * 잘못된 인자를 넘기는 회귀는 여기서만 잡을 수 있다.
 */

let seq = 0;
function makeComment(overrides: Partial<Comment> = {}): Comment {
  seq += 1;
  return {
    id: overrides.id ?? `c${seq}`,
    postSlug: 'p',
    authorName: 'tester',
    content: `content-${seq}`,
    parentId: null,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: null,
    ...overrides,
  };
}

/** 루트 r 아래 폭 w × 깊이 d 의 완전 트리 (+ 형제 루트 1개) */
function makeFixture(): CommentWithChildren[] {
  const rows: Comment[] = [makeComment({ id: 'root' }), makeComment({ id: 'sibling' })];
  rows.push(makeComment({ id: 'a', parentId: 'root' }));
  rows.push(makeComment({ id: 'b', parentId: 'root' }));
  rows.push(makeComment({ id: 'a1', parentId: 'a' }));
  rows.push(makeComment({ id: 'a2', parentId: 'a' }));
  rows.push(makeComment({ id: 'a1x', parentId: 'a1' }));
  return buildCommentTree(rows);
}

describe('countNodes — 인자에 따른 의미 분기 (B-6.I1)', () => {
  it('빈 배열은 0 (댓글 0건 화면의 "0개" 표기)', () => {
    expect(countNodes([])).toBe(0);
  });

  it('countNodes(tree) 는 루트를 포함한다 — CommentSection 총 댓글 수 용법', () => {
    // root(1) + sibling(1) + a,b(2) + a1,a2(2) + a1x(1) = 7
    expect(countNodes(makeFixture())).toBe(7);
  });

  it('countNodes(node.children) 는 자신을 제외한다 — CommentItem 답글 수 용법', () => {
    const tree = makeFixture();
    const root = tree[0];
    // a, b, a1, a2, a1x = 5
    expect(countNodes(root.children)).toBe(5);
    // ★ 두 용법의 차이는 정확히 1이어야 한다. 인자를 헷갈리면 전 스레드가 +1 된다.
    expect(countNodes([root])).toBe(countNodes(root.children) + 1);
  });

  it('자식 없는 노드의 답글 수는 0이고, 자신만 세면 1이다', () => {
    const tree = makeFixture();
    const sibling = tree[1];
    expect(countNodes(sibling.children)).toBe(0);
    expect(countNodes([sibling])).toBe(1);
  });

  it('전체 = 각 루트의 (자신 1 + 답글 수) 합 (분해 가능성)', () => {
    const tree = makeFixture();
    const sum = tree.reduce((acc, root) => acc + 1 + countNodes(root.children), 0);
    expect(sum).toBe(countNodes(tree));
  });

  it('형제 루트만 있는 평평한 트리', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'r1' }),
      makeComment({ id: 'r2' }),
      makeComment({ id: 'r3' }),
    ]);
    expect(countNodes(tree)).toBe(3);
    expect(tree.every((n) => countNodes(n.children) === 0)).toBe(true);
  });

  it('depth 캡(4)을 넘는 깊이도 전부 센다 — 표시 depth와 카운트는 별개 축이다', () => {
    const chain: Comment[] = [makeComment({ id: 'd0' })];
    for (let i = 1; i < 12; i += 1) {
      chain.push(makeComment({ id: `d${i}`, parentId: `d${i - 1}` }));
    }
    const tree = buildCommentTree(chain);
    expect(countNodes(tree)).toBe(12);
    expect(countNodes(tree[0].children)).toBe(11);
    // 표시 depth는 4에서 멈춰도 카운트는 멈추지 않는다
    let node = tree[0];
    while (node.children.length) node = node.children[0];
    expect(node.depth).toBe(4);
  });

  it('넓은 트리(루트 1 + 자식 500)를 정확히 센다', () => {
    const rows: Comment[] = [makeComment({ id: 'root' })];
    for (let i = 0; i < 500; i += 1) {
      rows.push(makeComment({ id: `c-${i}`, parentId: 'root' }));
    }
    const tree = buildCommentTree(rows);
    expect(countNodes(tree)).toBe(501);
    expect(countNodes(tree[0].children)).toBe(500);
  });

  it('고아 댓글(부모 미존재)은 루트로 승격되어 총 수에 정확히 1번만 반영된다', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'r' }),
      makeComment({ id: 'orphan', parentId: 'deleted' }),
      makeComment({ id: 'orphan-child', parentId: 'orphan' }),
    ]);
    expect(countNodes(tree)).toBe(3);
  });

  it('입력 순서(자식이 부모보다 먼저)와 무관하게 같은 총 수를 낸다', () => {
    const rows = [
      makeComment({ id: 'g', parentId: 'c' }),
      makeComment({ id: 'c', parentId: 'r' }),
      makeComment({ id: 'r' }),
    ];
    expect(countNodes(buildCommentTree(rows))).toBe(3);
    expect(countNodes(buildCommentTree([...rows].reverse()))).toBe(3);
  });

  it('입력 트리를 변형하지 않는다 (순수 읽기)', () => {
    const tree = makeFixture();
    const snapshot = structuredClone(tree);
    countNodes(tree);
    countNodes(tree[0].children);
    expect(tree).toEqual(snapshot);
  });

  it('직접 조립한 리터럴 트리(buildCommentTree 미경유)에서도 동작한다', () => {
    const node = (id: string, children: CommentWithChildren[] = []): CommentWithChildren => ({
      ...makeComment({ id }),
      children,
      depth: 0,
    });
    expect(countNodes([node('a', [node('b', [node('c')])])])).toBe(3);
  });
});
