import type { Comment, CommentWithChildren } from '@/types/comment';

const MAX_INDENT_DEPTH = 4;

export function buildCommentTree(comments: Comment[]): CommentWithChildren[] {
  const map = new Map<string, CommentWithChildren>();
  const roots: CommentWithChildren[] = [];

  for (const comment of comments) {
    map.set(comment.id, { ...comment, children: [], depth: 0 });
  }

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
