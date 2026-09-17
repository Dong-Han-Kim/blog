import Link from 'next/link';

import { cn } from '@/lib/utils';

/** 라벨 끝 화살표 → sr-only 방향 설명. 화살표 문자 자체는 aria-hidden 처리 */
const ARROW_SR_TEXT: Record<string, string> = {
  '↑': '오름차순',
  '↓': '내림차순',
};

interface SortToggleBaseProps {
  /** 현재 상태를 나타내는 가시 라벨 (예: 'SORTED BY DATE ↓') */
  label: string;
  /** 모바일 축약 라벨 — 미지정 시 label 사용 (예: 'DATE ↓') */
  shortLabel?: string;
  /** sr-only 보조 텍스트 — 누른 결과 설명 (예: '누르면 오래된순으로 정렬') */
  srHint: string;
  className?: string;
}

/**
 * 정렬 상태가 URL에 있으면 `href`(링크), 클라이언트 상태면 `onToggle`(버튼).
 * 둘 중 정확히 하나만 지정한다 — 동시에 주면 어느 쪽이 실제 동작인지 읽을 수 없다.
 */
type SortToggleProps = SortToggleBaseProps &
  (
    | { href: string; onToggle?: never }
    | { href?: never; onToggle: () => void }
  );

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
 *
 * 렌더 형태가 두 갈래인 이유 — 소비처의 정렬 상태가 사는 곳이 다르다
 * (feat-list-pagination D-5, `TerminalChip`과 동일한 분기 패턴):
 *   - `href`  : 목록(`PostList`)의 `?sort=`. 정렬이 URL이라 **링크**여야 새로고침·
 *               뒤로가기·북마크·새 탭이 성립한다. `srHint`는 링크 맥락에서도
 *               "누르면 ~로 정렬"이라는 결과 설명 그대로 의미가 통한다.
 *   - `onToggle`: 댓글(`CommentSection`)의 정렬. 실시간으로 갱신되는 클라이언트
 *               상태라 URL로 올릴 대상이 아니다 → **버튼**을 유지한다.
 *
 * ⚠️ 이 컴포넌트에는 'use client'가 없다 (`TerminalChip`과 같은 이유 — 서버 컴포넌트인
 *    목록에서 클라이언트 경계를 만들지 않기 위해). `onToggle`은 **클라이언트 컴포넌트에서만**
 *    넘길 것. 서버 컴포넌트에서 함수를 넘기면 Next가 직렬화 오류를 낸다.
 */
export function SortToggle({
  label,
  shortLabel,
  srHint,
  href,
  onToggle,
  className,
}: SortToggleProps) {
  const toggleClass = cn(
    // relative z-10: 음수 마진으로 확장된 히트 영역이 인접 PostRow 오버레이 링크에 가로채이지 않게 (태그 칩과 동일)
    'relative z-10 -my-6 inline-flex min-h-24 items-center text-[11px] text-text-dim hover:text-text-strong',
    className,
  );

  const content = (
    <>
      <span className="max-md:hidden">
        <LabelText label={label} />
      </span>
      <span className="hidden max-md:inline">
        <LabelText label={shortLabel ?? label} />
      </span>
      <span className="sr-only"> {srHint}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={toggleClass}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onToggle} className={toggleClass}>
      {content}
    </button>
  );
}
