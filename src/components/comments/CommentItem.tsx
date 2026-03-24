'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EditCommentDialog } from './EditCommentDialog';
import { DeleteCommentDialog } from './DeleteCommentDialog';
import { CommentForm } from './CommentForm';
import { updateComment } from '@/actions/comment';
import type { CommentWithChildren } from '@/types/comment';

const editContentSchema = z.object({
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(1000, '댓글은 1000자 이하여야 합니다.'),
});

interface CommentItemProps {
  comment: CommentWithChildren;
  postSlug: string;
  editingCommentId: string | null;
  editingPassword: string | null;
  onStartEditing: (commentId: string, password: string) => void;
  onStopEditing: () => void;
}

export function CommentItem({
  comment,
  postSlug,
  editingCommentId,
  editingPassword,
  onStartEditing,
  onStopEditing,
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

    const result = await updateComment({
      commentId: comment.id,
      password: editingPassword,
      content: data.content,
    });

    if (result.success) {
      onStopEditing();
      toast.success('댓글이 수정되었어요.');
    } else {
      toast.error(result.error ?? '일시적인 오류가 발생했어요.');
    }

    setIsSubmittingEdit(false);
  };

  const handleCancelEdit = () => {
    onStopEditing();
  };

  const indentPx = comment.depth * 24;
  const isUpdated = !!comment.updatedAt;

  const formattedDate = new Date(comment.createdAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div style={{ marginLeft: `${indentPx}px` }}>
      <div className="py-20 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-8 mb-10">
          <span className="font-semibold text-sm">{comment.authorName}</span>
          <span className="text-xs text-gray-400">{formattedDate}</span>
          {isUpdated && (
            <span className="text-xs text-gray-400 italic">(수정됨)</span>
          )}
        </div>

        {isEditing ? (
          <form onSubmit={handleSubmit(handleEditSubmit)} className="space-y-12">
            <Textarea className="min-h-24" {...register('content')} rows={3} />
            {errors.content && (
              <p className="text-sm text-red-500">{errors.content.message}</p>
            )}
            <div className="flex gap-10">
              <Button type="submit" size="default" disabled={isSubmittingEdit}>
                {isSubmittingEdit ? '수정 중...' : '수정 완료'}
              </Button>
              <Button type="button" size="default" variant="ghost" onClick={handleCancelEdit}>
                취소
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {comment.content}
          </p>
        )}

        {!isEditing && (
          <div className="flex gap-12 mt-12">
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors py-4 px-2"
              onClick={() => setShowReplyForm(!showReplyForm)}
            >
              답글
            </button>
            <EditCommentDialog commentId={comment.id} onVerified={handleEditVerified}>
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors py-4 px-2"
              >
                수정
              </button>
            </EditCommentDialog>
            <DeleteCommentDialog commentId={comment.id}>
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-red-500 transition-colors py-4 px-2"
              >
                삭제
              </button>
            </DeleteCommentDialog>
          </div>
        )}

        {showReplyForm && (
          <div className="mt-16 pl-16 border-l-2 border-gray-200 dark:border-gray-700">
            <CommentForm
              postSlug={postSlug}
              parentId={comment.id}
              onCancel={() => setShowReplyForm(false)}
              onSuccess={() => setShowReplyForm(false)}
            />
          </div>
        )}
      </div>

      {comment.children.map((child) => (
        <CommentItem
          key={child.id}
          comment={child}
          postSlug={postSlug}
          editingCommentId={editingCommentId}
          editingPassword={editingCommentId === child.id ? editingPassword : null}
          onStartEditing={onStartEditing}
          onStopEditing={onStopEditing}
        />
      ))}
    </div>
  );
}
