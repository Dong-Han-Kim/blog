'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { BlinkCursor } from '@/components/terminal/BlinkCursor';
import { cn } from '@/lib/utils/cn';
import { commentFormSchema, type CommentFormData } from '@/lib/validations/comment';
import { createComment } from '@/actions/comment';
import type { Comment } from '@/types/comment';

const CONTENT_MAX = 1000; // 서버 규칙 우선 (설계 D11 — 핸드오버 500자 대신 1000자)
const CONTENT_WARN = 800; // 카운터 accent 전환 지점 (핸드오버 400/500 비율 적용)

interface CommentFormProps {
  postSlug: string;
  parentId?: string;
  onCancel?: () => void;
  /** 성공 시 생성된 댓글 전달 — 허니팟 성공 위장에는 댓글이 없으므로 호출 생략 */
  onSuccess?: (comment: Comment) => void;
}

/**
 * 댓글 입력 폼 (핸드오버 §2 입력 폼 / §10 폼 에러, 설계 §7.6).
 * NEW COMMENT 헤더 바 + NAME·PASS 2열(1px rule-inner 그리드, 모바일 1열) +
 * `>` 프롬프트 textarea + `[ SUBMIT ]` 역상 버튼 + `{n} / 1000` 카운터.
 * 검증 규칙·제출 플로우는 기존 그대로 — 에러 표기(`error: {메시지}`)와
 * 실패 배너(`! FAILED`, 폼 값 보존 + 다시 시도)만 표현 계층에서 추가.
 */
export function CommentForm({ postSlug, parentId, onCancel, onSuccess }: CommentFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CommentFormData>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { authorName: '', password: '', content: '' },
  });

  // 전송 실패 배너 메시지 — 실패 시 reset() 금지, 폼 값 절대 보존 (핸드오버 §10)
  const [failure, setFailure] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  // isSubmitting은 리렌더 후에야 반영되므로, 리렌더 전 연속 진입(키 리핏)까지
  // 막는 동기 in-flight 가드 (리뷰 M-2)
  const inFlightRef = useRef(false);
  const fieldId = useId();

  const contentLength = watch('content')?.length ?? 0;
  const hasErrors = Object.keys(errors).length > 0;

  const onSubmit = async (data: CommentFormData) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    // 서버 액션이 throw하는 실패(네트워크/500)도 배너로 수렴 — 폼 값은 보존
    try {
      const result = await createComment({
        ...data,
        parentId,
        postSlug,
        honeypot: honeypotRef.current?.value,
      });

      if (result.success) {
        setFailure(null);
        reset();
        // Realtime 없이도 즉시 화면 반영 — 허니팟 성공 위장(comment 없음)은
        // 콜백을 생략해 봇에게 성공한 척을 유지한다
        if (result.comment) {
          onSuccess?.(result.comment);
        }
      } else {
        setFailure(result.error ?? '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      }
    } catch {
      setFailure('POST /comments — 요청이 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      inFlightRef.current = false;
    }
  };

  // ⌘↵ / Ctrl+↵ 전송 (핸드오버 Interactions).
  // 키 리핏이 handleSubmit에 재진입해 중복 댓글을 만들지 않도록 전송 중엔 무시 (리뷰 M-2)
  const handleContentKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (isSubmitting) return;
      handleSubmit(onSubmit)();
    }
  };

  const counterClass =
    contentLength >= CONTENT_MAX
      ? 'text-error'
      : contentLength > CONTENT_WARN
        ? 'text-accent'
        : 'text-text-dim';

  const submitDisabled = hasErrors || isSubmitting;

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} className="border border-rule bg-bg-raised">
        {/* 허니팟 필드 (스팸 대응 로직 유지) */}
        <div
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
        >
          <input
            ref={honeypotRef}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* 헤더 바 */}
        <div className="flex items-center justify-between border-b border-rule-inner px-16 py-10 text-[11px]">
          <span className="tracking-[2px] text-text-dim">
            {parentId ? 'REPLY' : 'NEW COMMENT'}
          </span>
          <span className={counterClass}>
            {contentLength} / {CONTENT_MAX}
          </span>
        </div>

        {/* NAME · PASS 2열 — 1px rule-inner 간격이 구분선 역할, 모바일 1열 */}
        <div className="grid grid-cols-2 gap-1 bg-rule-inner max-md:grid-cols-1">
          <div className="bg-bg-field p-[12px_16px]">
            <div
              className={cn(
                'flex items-center gap-10',
                errors.authorName && 'border-b border-error pb-6'
              )}
            >
              <label htmlFor={`${fieldId}-name`} className="text-[11px] text-text-dim">
                NAME
              </label>
              <input
                id={`${fieldId}-name`}
                type="text"
                spellCheck={false}
                placeholder="닉네임"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-text-strong caret-accent outline-none placeholder:text-text-faint"
                {...register('authorName')}
              />
            </div>
            {errors.authorName && (
              <p className="mt-8 text-[11px] text-error">
                error: {errors.authorName.message}
              </p>
            )}
          </div>
          <div className="bg-bg-field p-[12px_16px]">
            <div
              className={cn(
                'flex items-center gap-10',
                errors.password && 'border-b border-error pb-6'
              )}
            >
              <label htmlFor={`${fieldId}-password`} className="text-[11px] text-text-dim">
                PASS
              </label>
              <input
                id={`${fieldId}-password`}
                type="password"
                placeholder="수정/삭제 시 필요"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-text-strong caret-accent outline-none placeholder:text-text-faint"
                {...register('password')}
              />
            </div>
            {errors.password && (
              <p className="mt-8 text-[11px] text-error">
                error: {errors.password.message}
              </p>
            )}
          </div>
        </div>

        {/* 본문 — `>` 프롬프트, 에러 시 프롬프트 error 색 전환 (핸드오버 §10) */}
        <div className="grid grid-cols-[24px_1fr] gap-8 border-t border-rule-inner p-16">
          <span
            aria-hidden
            className={cn(
              'text-[13px] leading-[1.9]',
              errors.content ? 'text-error' : 'text-accent'
            )}
          >
            &gt;
          </span>
          <textarea
            id={`${fieldId}-content`}
            rows={4}
            maxLength={CONTENT_MAX}
            spellCheck={false}
            placeholder="댓글을 입력하세요..."
            aria-label="댓글"
            className="w-full resize-y bg-transparent text-[13px] leading-[2] text-text-body caret-accent outline-none placeholder:text-text-faint"
            {...register('content')}
            onKeyDown={handleContentKeyDown}
          />
        </div>
        {errors.content && (
          <p className="px-16 pb-12 text-[11px] text-error">
            error: {errors.content.message}
          </p>
        )}

        {/* 푸터 — ⌘↵ 힌트 + SUBMIT (마크다운 미지원이라 힌트 표기 안 함, 설계 §7.6) */}
        <div className="flex items-center justify-between border-t border-rule-inner px-16 py-12">
          <span className="text-[10px] text-text-faint">⌘↵ 전송</span>
          <div className="flex items-center gap-14">
            {isSubmitting && (
              <span className="text-[12px] text-text-dim">
                전송 중 <BlinkCursor size="sm" />
              </span>
            )}
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="border border-text-faint px-16 py-8 text-[12px] text-text-muted hover:border-accent hover:text-text-strong"
              >
                취소
              </button>
            )}
            <button
              type="submit"
              disabled={submitDisabled}
              className={cn(
                'px-18 py-8 text-[12px]',
                submitDisabled
                  ? 'pointer-events-none bg-track text-text-dim'
                  : 'bg-text-dim text-bg hover:bg-accent'
              )}
            >
              {isSubmitting ? '[ SENDING ]' : '[ SUBMIT ]'}
            </button>
          </div>
        </div>
      </form>

      {/* 전송 실패 배너 — 입력 값 보존 + 다시 시도 (핸드오버 §10) */}
      {failure && (
        <div className="mt-26 border border-error bg-error-bg p-[16px_18px]">
          <p className="text-[11px] text-error">! FAILED</p>
          <p className="mt-6 text-[12px] leading-[2] text-text-body">{failure}</p>
          <p className="mt-4 text-[11px] text-text-dim">
            입력한 내용은 유지됩니다.{' '}
            <button
              type="button"
              onClick={() => {
                // 전송 중 재클릭으로 인한 이중 제출 차단 (리뷰 M-2)
                if (isSubmitting) return;
                handleSubmit(onSubmit)();
              }}
              className="border-b border-text-faint text-text-muted hover:text-text-strong"
            >
              다시 시도
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
