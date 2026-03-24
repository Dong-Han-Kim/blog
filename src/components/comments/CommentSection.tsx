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

      <div className="mt-32">
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
