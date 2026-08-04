import { BlinkCursor } from '@/components/terminal/BlinkCursor';
import { PromptLine } from '@/components/terminal/PromptLine';
import { Skeleton } from '@/components/ui/skeleton';

// 폭 랜덤은 SSR 결정성을 위해 고정 배열로 의사난수 (설계 §7.9).
// 제목 58–72% / 보조 38–62% — 핸드오버 8d 범위.
const TITLE_WIDTHS = [58, 72, 64, 69, 61, 66, 71, 59, 63, 67];
const SUB_WIDTHS = [42, 55, 48, 60, 38, 51, 45, 58, 40, 53];

/**
 * 목록 로딩 공용 스켈레톤 (설계 §7.9, 핸드오버 8d).
 * 프롬프트 3줄(`ls posts/` → `reading index ...` → blink 커서) + 정지 스켈레톤
 * 행 10개(요청 개수와 일치, 실제 행 높이 근사로 CLS 억제). 애니메이션 없음.
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
