'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';

import TextareaAutosize from 'react-textarea-autosize';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { commentFormSchema, type CommentFormData } from '@/lib/validations/comment';
import { createComment } from '@/actions/comment';

interface CommentFormProps {
  postSlug: string;
  parentId?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function CommentForm({ postSlug, parentId, onCancel, onSuccess }: CommentFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormData>({
    resolver: zodResolver(commentFormSchema),
  });

  const onSubmit = async (data: CommentFormData) => {
    const result = await createComment({
      ...data,
      parentId,
      postSlug,
      honeypot: (document.getElementById('website') as HTMLInputElement)?.value,
    });

    if (result.success) {
      reset();
      onSuccess?.();
    } else {
      toast.error(result.error ?? '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-16">
      {/* 허니팟 필드 */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
      >
        <input
          type="text"
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="flex gap-12">
        <div className="flex-1 space-y-6">
          <Label htmlFor="authorName">닉네임</Label>
          <Input
            id="authorName"
            className="h-44"
            placeholder="닉네임을 입력하세요"
            {...register('authorName')}
          />
          {errors.authorName && (
            <p className="text-sm text-red-500 mt-4">{errors.authorName.message}</p>
          )}
        </div>
        <div className="flex-1 space-y-6">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            type="password"
            className="h-44"
            placeholder="수정/삭제 시 필요해요"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-sm text-red-500 mt-4">{errors.password.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <Label htmlFor="content">댓글</Label>
        <TextareaAutosize
          id="content"
          className={cn(
            'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 resize-none',
          )}
          placeholder="댓글을 남겨주세요"
          minRows={3}
          maxRows={10}
          {...register('content')}
        />
        {errors.content && (
          <p className="text-sm text-red-500 mt-4">{errors.content.message}</p>
        )}
      </div>

      <div className="flex justify-end gap-10">
        {onCancel && (
          <Button type="button" variant="ghost" className="h-44 px-20" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="submit" className="h-44 px-24" disabled={isSubmitting}>
          {isSubmitting ? '작성 중...' : parentId ? '답글 작성' : '댓글 작성'}
        </Button>
      </div>
    </form>
  );
}
