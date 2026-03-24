'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Comment } from '@/types/comment';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseCommentRealtimeOptions {
  postSlug: string;
  onInsert: (comment: Comment) => void;
  onUpdate: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
  onReconnect: () => void;
}

export function useCommentRealtime({
  postSlug,
  onInsert,
  onUpdate,
  onDelete,
  onReconnect,
}: UseCommentRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`comments:${postSlug}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `post_slug=eq.${postSlug}`,
        },
        (payload) => {
          const newComment = mapPayloadToComment(payload.new);
          onInsert(newComment);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comments',
          filter: `post_slug=eq.${postSlug}`,
        },
        (payload) => {
          const updatedComment = mapPayloadToComment(payload.new);
          onUpdate(updatedComment);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comments',
          filter: `post_slug=eq.${postSlug}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          onDelete(deletedId);
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn(
            '[CommentRealtime] Supabase Realtime 연결 실패. ' +
              'Supabase 대시보드에서 comments 테이블의 Realtime이 활성화되어 있는지 확인하세요.',
          );
        }
        if (status === 'SUBSCRIBED') {
          if (channelRef.current) {
            onReconnect();
          }
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [postSlug]); // eslint-disable-line react-hooks/exhaustive-deps
}

function mapPayloadToComment(raw: Record<string, unknown>): Comment {
  return {
    id: raw.id as string,
    postSlug: raw.post_slug as string,
    authorName: raw.author_name as string,
    content: raw.content as string,
    parentId: (raw.parent_id as string) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: (raw.updated_at as string) ?? null,
  };
}
