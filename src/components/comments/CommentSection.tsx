'use client';

import { useState, useCallback, useMemo } from 'react';

import { CommentForm } from './CommentForm';
import { CommentList } from './CommentList';
import { DottedRule } from '@/components/terminal/DottedRule';
import { SortToggle } from '@/components/terminal/SortToggle';
import { useCommentRealtime } from '@/hooks/useCommentRealtime';
import {
  buildCommentTree,
  addCommentToTree,
  commentExistsInTree,
  countNodes,
  removeCommentFromTree,
  updateCommentInTree,
} from '@/lib/comments/tree';
import {
  DEFAULT_COMMENT_SORT,
  sortRootComments,
  type CommentSortOrder,
} from '@/lib/comments/sort';
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
  const [sortOrder, setSortOrder] = useState<CommentSortOrder>(DEFAULT_COMMENT_SORT);

  // 로컬 삽입(뮤테이션 성공 콜백)과 Realtime INSERT가 같은 댓글로 두 번 들어와도
  // id 존재 가드로 한 번만 반영된다
  const handleInsert = useCallback((comment: Comment) => {
    setCommentTree((prev) =>
      commentExistsInTree(prev, comment.id) ? prev : addCommentToTree(prev, comment),
    );
  }, []);

  const handleUpdate = useCallback((comment: Comment) => {
    setCommentTree((prev) =>
      updateCommentInTree(prev, comment.id, comment.content, comment.updatedAt ?? new Date().toISOString()),
    );
  }, []);

  // DELETE 구독은 무필터라 타 게시글 삭제 이벤트도 들어온다 — 트리에 있는 id만
  // 반영해 무관한 이벤트로 인한 전체 리렌더를 피한다
  const handleDelete = useCallback((commentId: string) => {
    setCommentTree((prev) =>
      commentExistsInTree(prev, commentId) ? removeCommentFromTree(prev, commentId) : prev,
    );
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

  const commentCount = countNodes(commentTree);
  const oldest = sortOrder === 'oldest';

  // 저장 상태(commentTree)는 createdAt asc 불변식 유지 — 정렬은 파생값만 (설계 §3.4).
  // NEWEST 상태에서 새 댓글이 append돼도 파생 정렬이 맨 위로 올린다
  const sortedTree = useMemo(
    () => sortRootComments(commentTree, sortOrder),
    [commentTree, sortOrder],
  );

  return (
    <section className="mt-64">
      <DottedRule
        left={`COMMENTS (${commentCount})`}
        right={
          <SortToggle
            label={oldest ? 'OLDEST ↑' : 'NEWEST ↓'}
            srHint={oldest ? '누르면 최신순으로 정렬' : '누르면 등록순으로 정렬'}
            onToggle={() =>
              setSortOrder((order) => (order === 'oldest' ? 'newest' : 'oldest'))
            }
          />
        }
      />

      <CommentList
        comments={sortedTree}
        postSlug={postSlug}
        editingCommentId={editingState?.commentId ?? null}
        editingPassword={editingState?.password ?? null}
        onStartEditing={handleStartEditing}
        onStopEditing={handleStopEditing}
        onCommentCreated={handleInsert}
        onCommentUpdated={handleUpdate}
        onCommentDeleted={handleDelete}
        collapsedThreads={collapsedThreads}
        onToggleThread={handleToggleThread}
      />

      {/* 핸드오버 구조: 목록 → NEW COMMENT 폼 (설계 §7.6) */}
      <div className="mt-40">
        <CommentForm postSlug={postSlug} onSuccess={handleInsert} />
      </div>
    </section>
  );
}
