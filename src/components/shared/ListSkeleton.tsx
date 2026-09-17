import { BlinkCursor } from '@/components/terminal/BlinkCursor';
import { PromptLine } from '@/components/terminal/PromptLine';
import { Skeleton } from '@/components/ui/skeleton';

// 폭 랜덤은 SSR 결정성을 위해 고정 배열로 의사난수 (설계 §7.9).
// 제목 58–72% / 보조 38–62% — 핸드오버 8d 범위.
// 행 개수는 PAGE_SIZE(20)와 일치해야 한다 — 아래 주석 참고.
const TITLE_WIDTHS = [
  58, 72, 64, 69, 61, 66, 71, 59, 63, 67, 70, 60, 65, 68, 62, 71, 59, 66, 63,
  69,
];
const SUB_WIDTHS = [
  42, 55, 48, 60, 38, 51, 45, 58, 40, 53, 62, 44, 57, 39, 50, 46, 59, 41, 54,
  47,
];

/**
 * 목록 로딩 공용 스켈레톤 (설계 §7.9, 핸드오버 8d).
 * 프롬프트 3줄(`ls posts/` → `reading index ...` → blink 커서) + 정지 스켈레톤
 * 행 20개(페이지당 요청 개수와 일치, 실제 행 높이 근사로 CLS 억제). 애니메이션 없음.
 *
 * 행 개수를 20으로 맞추는 이유: 페이지네이션 도입 후 한 페이지가 20편이므로
 * 10행만 그리면 스켈레톤 → 실제 목록 전환에서 목록 높이가 두 배로 튄다(CLS).
 * PAGE_SIZE를 바꾸면 위 두 배열 길이도 함께 바꿔야 한다.
 */
export function ListSkeleton() {
  return (
    <div aria-label="로딩 중" className="mt-40">
      <div className="text-[13px] leading-[2.3]">
        <PromptLine
          command="ls posts/"
          className="text-[13px] leading-[2.3]"
        />
        <p className="text-text-dim">reading index ...</p>
        <BlinkCursor />
      </div>

      <div className="mt-40 flex flex-col gap-18">
        {TITLE_WIDTHS.map((titleWidth, i) => (
          <div
            key={i}
            className="grid grid-cols-[88px_1fr] gap-24 border-t border-rule-weak pt-22"
          >
            <Skeleton className="h-22 w-56" />
            <div className="flex flex-col gap-12">
              <Skeleton className="h-16" style={{ width: `${titleWidth}%` }} />
              <Skeleton
                className="h-12"
                style={{ width: `${SUB_WIDTHS[i]}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
