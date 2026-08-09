'use client';

import type { Comment, CommentWithChildren } from '@/types/comment';
import { CommentItem } from './CommentItem';

interface CommentListProps {
  comments: CommentWithChildren[];
  postSlug: string;
  editingCommentId: string | null;
  editingPassword: string | null;
  onStartEditing: (commentId: string, password: string) => void;
  onStopEditing: () => void;
  /** 답글 작성 성공 시 트리 즉시 삽입 (Realtime 미의존) */
  onCommentCreated: (comment: Comment) => void;
  /** 수정 성공 시 트리 즉시 반영 */
  onCommentUpdated: (comment: Comment) => void;
  /** 삭제 성공 시 트리에서 즉시 제거 */
  onCommentDeleted: (commentId: string) => void;
  /** 접힌 루트 스레드 id 집합 (설계 §7.6) */
  collapsedThreads: Set<string>;
  onToggleThread: (commentId: string) => void;
}

export function CommentList({
  comments,
  postSlug,
  editingCommentId,
  editingPassword,
  onStartEditing,
  onStopEditing,
  onCommentCreated,
  onCommentUpdated,
  onCommentDeleted,
  collapsedThreads,
  onToggleThread,
}: CommentListProps) {
  if (comments.length === 0) {
    return (
      <div className="mt-20 border-y border-rule py-52 text-center">
        <p className="text-[12px] text-text-dim">
          아직 댓글이 없어요. 첫 번째 댓글을 남겨주세요!
        </p>
      </div>
    );
  }

  return (
    <div className="mt-20">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postSlug={postSlug}
          editingCommentId={editingCommentId}
          editingPassword={editingCommentId === comment.id ? editingPassword : null}
          onStartEditing={onStartEditing}
          onStopEditing={onStopEditing}
          onCommentCreated={onCommentCreated}
          onCommentUpdated={onCommentUpdated}
          onCommentDeleted={onCommentDeleted}
          collapsed={collapsedThreads.has(comment.id)}
          onToggleThread={onToggleThread}
        />
      ))}
      {/* 마지막 댓글 아래 닫는 룰 (핸드오버 §2 댓글) */}
      <div aria-hidden className="border-t border-rule" />
    </div>
  );
}
