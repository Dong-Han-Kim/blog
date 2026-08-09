'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteComment } from '@/actions/comment';

interface DeleteCommentDialogProps {
  commentId: string;
  /** 삭제 성공 시 호출 — Realtime 없이도 트리에서 즉시 제거 */
  onDeleted?: () => void;
  children: React.ReactNode;
}

export function DeleteCommentDialog({ commentId, onDeleted, children }: DeleteCommentDialogProps) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    setError('');
    setIsLoading(true);

    const result = await deleteComment({ commentId, password });

    if (result.success) {
      setOpen(false);
      setPassword('');
      toast.success('댓글이 삭제되었어요.');
      onDeleted?.();
    } else {
      setError(result.error ?? '일시적인 오류가 발생했어요.');
    }

    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>댓글 삭제</DialogTitle>
          <DialogDescription>
            삭제하면 되돌릴 수 없어요. 댓글 작성 시 입력한 비밀번호를 입력해주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-20">
          <div className="space-y-6">
            <Label htmlFor="delete-password">비밀번호</Label>
            <Input
              id="delete-password"
              type="password"
              className="h-44"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
              placeholder="비밀번호를 입력하세요"
            />
            {error && <p className="mt-6 text-[11px] text-error">error: {error}</p>}
          </div>
          <div className="flex justify-end gap-10">
            <Button variant="ghost" className="h-44 px-20" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              className="h-44 px-24"
              onClick={handleDelete}
              disabled={isLoading || password.length < 4}
            >
              {isLoading ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
