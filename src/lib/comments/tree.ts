import type { Comment, CommentWithChildren } from '@/types/comment';

const MAX_INDENT_DEPTH = 4;

export function buildCommentTree(comments: Comment[]): CommentWithChildren[] {
  const map = new Map<string, CommentWithChildren>();
  const roots: CommentWithChildren[] = [];

  for (const comment of comments) {
    map.set(comment.id, { ...comment, children: [], depth: 0 });
  }

  // 1단계: 링크만 수행 — depth는 전체 연결이 끝난 뒤 계산해야
  // 자식이 부모보다 먼저 오는 입력에서도 결과가 같다 (입력 순서 무관)
  for (const comment of comments) {
    const node = map.get(comment.id)!;
    if (comment.parentId && map.has(comment.parentId)) {
      map.get(comment.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 2단계: 루트부터 재귀로 depth 부여 (MAX_INDENT_DEPTH 캡 유지)
  assignDepth(roots, 0);

  return roots;
}

function assignDepth(nodes: CommentWithChildren[], depth: number): void {
  for (const node of nodes) {
    node.depth = depth;
    assignDepth(node.children, Math.min(depth + 1, MAX_INDENT_DEPTH));
  }
}

/** 트리 전체에서 해당 id의 댓글 존재 여부 — 로컬 삽입과 Realtime INSERT 중복 방지용 */
export function commentExistsInTree(
  roots: CommentWithChildren[],
  commentId: string,
): boolean {
  return roots.some(
    (root) => root.id === commentId || commentExistsInTree(root.children, commentId),
  );
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

/**
 * 노드 배열의 전체 노드 수(자손 포함) — reuse-audit B-6 / L1.
 * ⚠️ "자기 자신 포함 여부"는 **인자로 결정된다.**
 *   - 답글 수: countNodes(comment.children)  → 자신 제외
 *   - 전체 댓글 수: countNodes(tree)         → 루트 포함
 * 인자를 잘못 넘기면 모든 스레드 카운트가 +1 된다.
 */
export function countNodes(nodes: CommentWithChildren[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
}
