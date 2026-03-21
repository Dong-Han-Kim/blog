import { z } from 'zod';

export const commentFormSchema = z.object({
  authorName: z
    .string()
    .min(2, '닉네임은 2자 이상이어야 합니다.')
    .max(20, '닉네임은 20자 이하여야 합니다.'),
  password: z
    .string()
    .min(4, '비밀번호는 4자 이상이어야 합니다.'),
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(1000, '댓글은 1000자 이하여야 합니다.'),
  parentId: z.string().uuid({ error: '유효한 UUID 형식이어야 합니다.' }).optional(),
});

export type CommentFormData = z.infer<typeof commentFormSchema>;

export const deleteCommentSchema = z.object({
  commentId: z.string().uuid({ error: '유효한 UUID 형식이어야 합니다.' }),
  password: z.string().min(4, '비밀번호는 4자 이상이어야 합니다.'),
});

export type DeleteCommentData = z.infer<typeof deleteCommentSchema>;
