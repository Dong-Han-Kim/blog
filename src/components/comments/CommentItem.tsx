'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ErrorLine } from '@/components/shared/ErrorLine';
import { TerminalChip } from '@/components/terminal/TerminalChip';
import { CommentAvatar } from './CommentAvatar';
import { EditCommentDialog } from './EditCommentDialog';
import { DeleteCommentDialog } from './DeleteCommentDialog';
import { CommentForm } from './CommentForm';
import { updateComment } from '@/actions/comment';
import { formatCommentTime } from '@/lib/comments/format';
import { countNodes } from '@/lib/comments/tree';
import { updateCommentSchema } from '@/lib/validations/comment';
import { SITE_OWNER_NAME } from '@/constants/site';
import { cn } from '@/lib/utils';
import type { Comment, CommentWithChildren } from '@/types/comment';

const editContentSchema = updateCommentSchema.pick({ content: true });

interface CommentItemProps {
  comment: CommentWithChildren;
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
  /** 루트 댓글 전용 — 접힌 스레드 여부 (설계 §7.6) */
  collapsed?: boolean;
  /** 루트 댓글 전용 — 스레드 토글 핸들러 */
  onToggleThread?: (commentId: string) => void;
}

export function CommentItem({
  comment,
  postSlug,
  editingCommentId,
  editingPassword,
  onStartEditing,
  onStopEditing,
  onCommentCreated,
  onCommentUpdated,
  onCommentDeleted,
  collapsed = false,
  onToggleThread,
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

    // 서버 액션이 throw하는 실패(네트워크/500)도 토스트로 수렴하고,
    // 어떤 경로든 전송 중 상태를 반드시 해제한다 (CommentForm의 catch 패턴)
    try {
      const result = await updateComment({
        commentId: comment.id,
        password: editingPassword,
        content: data.content,
      });

      if (result.success) {
        onStopEditing();
        // 서버가 돌려준 갱신 결과를 즉시 트리에 반영 (Realtime 미의존)
        if (result.comment) {
          onCommentUpdated(result.comment);
        }
        toast.success('댓글이 수정되었어요.');
      } else {
        toast.error(result.error ?? '일시적인 오류가 발생했어요.');
      }
    } catch {
      toast.error('요청이 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    onStopEditing();
  };

  const isAuthor = comment.authorName === SITE_OWNER_NAME;
  const isReply = comment.depth > 0;
  const isUpdated = !!comment.updatedAt;
  const replyCount = countNodes(comment.children);

  return (
    <div>
      <div
        className={cn(
          'grid grid-cols-[44px_1fr] items-start gap-20 py-26 max-md:grid-cols-[26px_1fr] max-md:gap-14 max-md:py-20',
          isReply ? 'border-t border-rule-weak' : 'border-t border-rule'
        )}
        // 답글 들여쓰기 44px × depth (핸드오버 §2 댓글, 설계 §7.6: 24px → 44px)
        style={comment.depth > 0 ? { paddingLeft: comment.depth * 44 } : undefined}
      >
        <CommentAvatar
          name={comment.authorName}
          variant={isAuthor ? 'outline' : 'filled'}
        />

        <div className="min-w-0">
          {/* 메타 행: 이름 · AUTHOR 배지 · 시각 · (수정됨) · 우측 액션 */}
          <div className="flex flex-wrap items-baseline gap-14 text-[11px] text-text-dim max-md:gap-10">
            <span className="text-[13px] text-text-strong">{comment.authorName}</span>
            {isAuthor && (
              <span className="border border-text-faint px-6 py-2 text-[10px] text-text-muted">
                AUTHOR
              </span>
            )}
            <span>
              <span className="max-md:hidden">{formatCommentTime(comment.createdAt)}</span>
              <span className="md:hidden">{formatCommentTime(comment.createdAt, true)}</span>
            </span>
            {isUpdated && <span className="text-text-faint">(수정됨)</span>}

            {!isEditing && (
              <span className="ml-auto flex shrink-0 gap-12 text-text-faint">
                <button
                  type="button"
                  className="hover:text-text-strong"
                  onClick={() => setShowReplyForm(!showReplyForm)}
                >
                  답글
                </button>
                <EditCommentDialog commentId={comment.id} onVerified={handleEditVerified}>
                  <button type="button" className="hover:text-text-strong">
                    수정
                  </button>
                </EditCommentDialog>
                <DeleteCommentDialog
                  commentId={comment.id}
                  onDeleted={() => onCommentDeleted(comment.id)}
                >
                  <button type="button" className="hover:text-error">
                    삭제
                  </button>
                </DeleteCommentDialog>
              </span>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={handleSubmit(handleEditSubmit)} className="mt-12 space-y-12">
              <Textarea {...register('content')} rows={3} />
              {errors.content && <ErrorLine message={errors.content.message} />}
              <div className="flex gap-10">
                <Button type="submit" disabled={isSubmittingEdit}>
                  {isSubmittingEdit ? '[ SENDING ]' : '수정 완료'}
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancelEdit}>
                  취소
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-12 text-[13px] leading-[2.05] whitespace-pre-wrap text-text-body">
              {comment.content}
            </p>
          )}

          {/* 스레드 토글 — 답글 있는 루트 댓글만, 즉시 토글 (핸드오버 §2 댓글) */}
          {!isReply && replyCount > 0 && onToggleThread && (
            <TerminalChip
              onClick={() => onToggleThread(comment.id)}
              className="mt-14 inline-flex items-center gap-8"
            >
              <span className="text-accent">{collapsed ? '[+]' : '[−]'}</span>
              <span>
                답글 {replyCount}개 {collapsed ? '펼치기' : '접기'}
              </span>
            </TerminalChip>
          )}

          {showReplyForm && (
            <div className="mt-16">
              <CommentForm
                postSlug={postSlug}
                parentId={comment.id}
                onCancel={() => setShowReplyForm(false)}
                onSuccess={(created) => {
                  onCommentCreated(created);
                  setShowReplyForm(false);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 접힌 스레드는 답글 서브트리를 DOM에서 제거 (무전환 즉시 토글) */}
      {!collapsed &&
        comment.children.map((child) => (
          <CommentItem
            key={child.id}
            comment={child}
            postSlug={postSlug}
            editingCommentId={editingCommentId}
            editingPassword={editingCommentId === child.id ? editingPassword : null}
            onStartEditing={onStartEditing}
            onStopEditing={onStopEditing}
            onCommentCreated={onCommentCreated}
            onCommentUpdated={onCommentUpdated}
            onCommentDeleted={onCommentDeleted}
          />
        ))}
    </div>
  );
}
