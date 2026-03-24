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
