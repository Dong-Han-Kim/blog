'use client';

import { cn } from '@/lib/utils';

/** 라벨 끝 화살표 → sr-only 방향 설명. 화살표 문자 자체는 aria-hidden 처리 */
const ARROW_SR_TEXT: Record<string, string> = {
  '↑': '오름차순',
  '↓': '내림차순',
};

interface SortToggleProps {
  /** 현재 상태를 나타내는 가시 라벨 (예: 'SORTED BY DATE ↓') */
  label: string;
  /** 모바일 축약 라벨 — 미지정 시 label 사용 (예: 'DATE ↓') */
  shortLabel?: string;
  /** sr-only 보조 텍스트 — 클릭 결과 설명 (예: '누르면 오래된순으로 정렬') */
  srHint: string;
  onToggle: () => void;
  className?: string;
}

/** 가시 라벨을 그대로 노출하되 화살표만 sr-only 방향 텍스트로 치환한다 */
function LabelText({ label }: { label: string }) {
  const arrow = label.slice(-1);
  const srText = ARROW_SR_TEXT[arrow];
  if (!srText) return <>{label}</>;
  return (
    <>
      {label.slice(0, -1)}
      <span aria-hidden>{arrow}</span>
      <span className="sr-only">{srText}</span>
    </>
  );
}

/**
 * DottedRule right 슬롯용 정렬 토글 (설계 §3.3).
 * 기존 정적 라벨과 동일한 타이포(11px dim)에 hover만 강조 — TerminalButton은
 * 보더+패딩이 룰 행에 과중해 별도 프리미티브. 터치 타깃은 태그 칩과 같은
 * 음수 마진 기법으로 24px 확보 (WCAG 2.5.8, 시각 리듬 유지).
 * 가시 라벨이 accessible name에 그대로 포함된다 (label-in-name — 별도 aria-label 금지).
 * aria-pressed 미사용: 상태마다 라벨 자체가 바뀌는 토글이라 pressed를 붙이면
 * 스크린리더에 모순된 이중 신호가 간다 (APG 토글 버튼 패턴 근거).
 */
export function SortToggle({
  label,
  shortLabel,
  srHint,
  onToggle,
  className,
}: SortToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        // relative z-10: 음수 마진으로 확장된 히트 영역이 인접 PostRow 오버레이 링크에 가로채이지 않게 (태그 칩과 동일)
        'relative z-10 -my-6 inline-flex min-h-24 items-center text-[11px] text-text-dim hover:text-text-strong',
        className,
      )}
    >
      <span className="max-md:hidden">
        <LabelText label={label} />
      </span>
      <span className="hidden max-md:inline">
        <LabelText label={shortLabel ?? label} />
      </span>
      <span className="sr-only"> {srHint}</span>
    </button>
  );
}
