import { describe, expect, it } from 'vitest';

import type { Comment, CommentWithChildren } from '@/types/comment';

import {
  addCommentToTree,
  buildCommentTree,
  commentExistsInTree,
  removeCommentFromTree,
  updateCommentInTree,
} from './tree';

const MAX_INDENT_DEPTH = 4;

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

/** parent → child → grandchild 3단 트리 (createdAt 오름차순, 부모가 항상 먼저) */
function makeThreeLevelTree(): CommentWithChildren[] {
  return buildCommentTree([
    makeComment({ id: 'root-1' }),
    makeComment({ id: 'root-2' }),
    makeComment({ id: 'child-1', parentId: 'root-1' }),
    makeComment({ id: 'grandchild-1', parentId: 'child-1' }),
  ]);
}

function findById(
  roots: CommentWithChildren[],
  id: string,
): CommentWithChildren | undefined {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findById(root.children, id);
    if (found) return found;
  }
  return undefined;
}

describe('buildCommentTree', () => {
  it('빈 배열이면 빈 트리를 반환한다', () => {
    expect(buildCommentTree([])).toEqual([]);
  });

  it('parentId가 없는 댓글들은 입력 순서대로 루트가 된다', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'a' }),
      makeComment({ id: 'b' }),
      makeComment({ id: 'c' }),
    ]);
    expect(tree.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(tree.every((n) => n.depth === 0)).toBe(true);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it('parentId로 중첩 트리를 만들고 depth를 계산한다', () => {
    const tree = makeThreeLevelTree();

    expect(tree.map((n) => n.id)).toEqual(['root-1', 'root-2']);
    const child = findById(tree, 'child-1')!;
    const grandchild = findById(tree, 'grandchild-1')!;
    expect(child.depth).toBe(1);
    expect(tree[0].children.map((n) => n.id)).toEqual(['child-1']);
    expect(grandchild.depth).toBe(2);
    expect(child.children.map((n) => n.id)).toEqual(['grandchild-1']);
  });

  it('존재하지 않는 parentId를 가진 고아 댓글은 루트로 승격된다', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'a' }),
      makeComment({ id: 'orphan', parentId: 'deleted-parent' }),
    ]);
    expect(tree.map((n) => n.id)).toEqual(['a', 'orphan']);
    const orphan = findById(tree, 'orphan')!;
    expect(orphan.depth).toBe(0);
    // 원본 parentId는 보존된다 (데이터는 그대로, 표시만 루트)
    expect(orphan.parentId).toBe('deleted-parent');
  });

  it('depth는 MAX_INDENT_DEPTH(4)에서 캡된다', () => {
    // 7단 체인: 부모가 먼저 오는 정렬 순서
    const chain: Comment[] = [makeComment({ id: 'd0' })];
    for (let i = 1; i < 7; i += 1) {
      chain.push(makeComment({ id: `d${i}`, parentId: `d${i - 1}` }));
    }
    const tree = buildCommentTree(chain);
    for (let i = 0; i < 7; i += 1) {
      const node = findById(tree, `d${i}`)!;
      expect(node.depth).toBe(Math.min(i, MAX_INDENT_DEPTH));
    }
  });

  // 회귀 테스트: depth 계산이 입력 순서에 의존하던 결함 — 링크 완료 후
  // 루트부터 depth를 부여하도록 수정되어 자식이 조상보다 먼저 와도 결과가 같다
  it('입력 순서와 무관하게 depth가 같아야 한다', () => {
    const tree = buildCommentTree([
      makeComment({ id: 'grandchild', parentId: 'child' }),
      makeComment({ id: 'child', parentId: 'root' }),
      makeComment({ id: 'root' }),
    ]);
    expect(findById(tree, 'grandchild')!.depth).toBe(2);
  });
});

describe('commentExistsInTree', () => {
  it('루트 레벨 댓글을 찾는다', () => {
    expect(commentExistsInTree(makeThreeLevelTree(), 'root-2')).toBe(true);
  });

  it('깊이 중첩된 댓글을 찾는다', () => {
    expect(commentExistsInTree(makeThreeLevelTree(), 'grandchild-1')).toBe(true);
  });

  it('없는 id면 false를 반환한다', () => {
    expect(commentExistsInTree(makeThreeLevelTree(), 'nope')).toBe(false);
  });

  it('빈 트리면 false를 반환한다', () => {
    expect(commentExistsInTree([], 'anything')).toBe(false);
  });
});

describe('addCommentToTree', () => {
  it('parentId가 null이면 루트 끝에 추가한다', () => {
    const tree = makeThreeLevelTree();
    const next = addCommentToTree(tree, makeComment({ id: 'new-root' }));
    expect(next.map((n) => n.id)).toEqual(['root-1', 'root-2', 'new-root']);
    expect(findById(next, 'new-root')!.depth).toBe(0);
  });

  it('빈 트리에 루트 댓글을 추가할 수 있다', () => {
    const next = addCommentToTree([], makeComment({ id: 'first' }));
    expect(next.map((n) => n.id)).toEqual(['first']);
  });

  it('대댓글은 부모의 children 끝에 depth+1로 추가한다', () => {
    const tree = makeThreeLevelTree();
    const next = addCommentToTree(
      tree,
      makeComment({ id: 'reply', parentId: 'child-1' }),
    );
    const child = findById(next, 'child-1')!;
    expect(child.children.map((n) => n.id)).toEqual(['grandchild-1', 'reply']);
    expect(findById(next, 'reply')!.depth).toBe(2);
  });

  it('부모가 MAX_INDENT_DEPTH(4)에 있으면 자식 depth는 4로 캡된다', () => {
    const chain: Comment[] = [makeComment({ id: 'd0' })];
    for (let i = 1; i < 6; i += 1) {
      chain.push(makeComment({ id: `d${i}`, parentId: `d${i - 1}` }));
    }
    const tree = buildCommentTree(chain); // d5의 depth는 4 (캡)
    const next = addCommentToTree(
      tree,
      makeComment({ id: 'deep-reply', parentId: 'd5' }),
    );
    const reply = findById(next, 'deep-reply')!;
    expect(reply.depth).toBe(MAX_INDENT_DEPTH);
  });

  it('존재하지 않는 parentId면 트리에 반영되지 않는다', () => {
    const tree = makeThreeLevelTree();
    const next = addCommentToTree(
      tree,
      makeComment({ id: 'lost', parentId: 'no-such-parent' }),
    );
    expect(commentExistsInTree(next, 'lost')).toBe(false);
    expect(next).toEqual(tree);
  });

  it('빈 트리에 parentId 있는 댓글을 넣으면 빈 트리 그대로다', () => {
    const next = addCommentToTree([], makeComment({ id: 'x', parentId: 'ghost' }));
    expect(next).toEqual([]);
  });

  it('원본 트리를 변형하지 않는다 (불변성)', () => {
    const tree = makeThreeLevelTree();
    const snapshot = structuredClone(tree);
    addCommentToTree(tree, makeComment({ id: 'r', parentId: 'grandchild-1' }));
    addCommentToTree(tree, makeComment({ id: 'r2' }));
    expect(tree).toEqual(snapshot);
  });
});

describe('removeCommentFromTree', () => {
  it('루트 댓글 제거 시 서브트리 전체가 사라진다', () => {
    const next = removeCommentFromTree(makeThreeLevelTree(), 'root-1');
    expect(next.map((n) => n.id)).toEqual(['root-2']);
    expect(commentExistsInTree(next, 'child-1')).toBe(false);
    expect(commentExistsInTree(next, 'grandchild-1')).toBe(false);
  });

  it('중간 노드 제거 시 그 서브트리만 사라지고 나머지는 유지된다', () => {
    const next = removeCommentFromTree(makeThreeLevelTree(), 'child-1');
    expect(next.map((n) => n.id)).toEqual(['root-1', 'root-2']);
    expect(findById(next, 'root-1')!.children).toEqual([]);
    expect(commentExistsInTree(next, 'grandchild-1')).toBe(false);
  });

  it('없는 id면 트리가 그대로다', () => {
    const tree = makeThreeLevelTree();
    expect(removeCommentFromTree(tree, 'nope')).toEqual(tree);
  });

  it('빈 트리면 빈 트리를 반환한다', () => {
    expect(removeCommentFromTree([], 'x')).toEqual([]);
  });

  it('원본 트리를 변형하지 않는다 (불변성)', () => {
    const tree = makeThreeLevelTree();
    const snapshot = structuredClone(tree);
    removeCommentFromTree(tree, 'child-1');
    expect(tree).toEqual(snapshot);
  });
});

describe('updateCommentInTree', () => {
  it('루트 댓글의 content와 updatedAt만 갱신한다', () => {
    const tree = makeThreeLevelTree();
    const next = updateCommentInTree(
      tree,
      'root-1',
      'edited',
      '2026-08-09T12:00:00.000Z',
    );
    const updated = findById(next, 'root-1')!;
    expect(updated.content).toBe('edited');
    expect(updated.updatedAt).toBe('2026-08-09T12:00:00.000Z');
    // 자식과 다른 필드는 보존
    expect(updated.children.map((n) => n.id)).toEqual(['child-1']);
    expect(updated.authorName).toBe('tester');
    expect(findById(next, 'root-2')!.content).not.toBe('edited');
  });

  it('중첩 댓글도 갱신한다', () => {
    const next = updateCommentInTree(
      makeThreeLevelTree(),
      'grandchild-1',
      'deep-edit',
      '2026-08-09T13:00:00.000Z',
    );
    const updated = findById(next, 'grandchild-1')!;
    expect(updated.content).toBe('deep-edit');
    expect(updated.updatedAt).toBe('2026-08-09T13:00:00.000Z');
  });

  it('없는 id면 트리가 그대로다', () => {
    const tree = makeThreeLevelTree();
    expect(updateCommentInTree(tree, 'nope', 'x', 'y')).toEqual(tree);
  });

  it('원본 트리를 변형하지 않는다 (불변성)', () => {
    const tree = makeThreeLevelTree();
    const snapshot = structuredClone(tree);
    updateCommentInTree(tree, 'grandchild-1', 'mutated?', 'now');
    expect(tree).toEqual(snapshot);
  });
});
