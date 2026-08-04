'use client';

import { useState, useCallback } from 'react';

import { CommentForm } from './CommentForm';
import { CommentList } from './CommentList';
import { DottedRule } from '@/components/terminal/DottedRule';
import { useCommentRealtime } from '@/hooks/useCommentRealtime';
import {
  buildCommentTree,
  addCommentToTree,
  removeCommentFromTree,
  updateCommentInTree,
} from '@/lib/comments/tree';
import { getCommentsByPostSlug } from '@/actions/comment';
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
  // 접힌 스레드(루트 댓글 id) — 기본 빈 집합 = 전부 펼침 (핸드오버 State Management)
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set());

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

  const handleReconnect = useCallback(async () => {
    try {
      const fresh = await getCommentsByPostSlug(postSlug);
      setCommentTree(buildCommentTree(fresh));
    } catch (err) {
      console.warn('[CommentSection] 댓글 재조회 실패:', err);
    }
  }, [postSlug]);

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

  const handleToggleThread = useCallback((commentId: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }, []);

  const commentCount = countComments(commentTree);

  return (
    <section className="mt-64">
      <DottedRule
        left={`COMMENTS (${commentCount})`}
        right={<span className="text-text-faint">OLDEST ↑</span>}
      />

      <CommentList
        comments={commentTree}
        postSlug={postSlug}
        editingCommentId={editingState?.commentId ?? null}
        editingPassword={editingState?.password ?? null}
        onStartEditing={handleStartEditing}
        onStopEditing={handleStopEditing}
        collapsedThreads={collapsedThreads}
        onToggleThread={handleToggleThread}
      />

      {/* 핸드오버 구조: 목록 → NEW COMMENT 폼 (설계 §7.6) */}
      <div className="mt-40">
        <CommentForm postSlug={postSlug} />
      </div>
    </section>
  );
}

function countComments(tree: CommentWithChildren[]): number {
  return tree.reduce((sum, node) => sum + 1 + countComments(node.children), 0);
}
