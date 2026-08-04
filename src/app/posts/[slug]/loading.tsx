import { BlinkCursor } from '@/components/terminal/BlinkCursor';
import { PromptLine } from '@/components/terminal/PromptLine';

/**
 * 상세 로딩 (설계 §7.9): loading에서는 slug 취득이 불가하므로 `cat posts/` 고정
 * 프리픽스 + `…`. 진행 바·ASCII 게이지는 실제 크기 미상이라 미구현 (핸드오버 허용).
 */
export default function PostLoading() {
  return (
    <div aria-label="로딩 중" className="mt-40 text-[13px] leading-[2.3]">
      <PromptLine command="cat posts/….md" className="text-[13px] leading-[2.3]" />
      <p className="flex items-center gap-8 text-text-dim">
        loading ...
        <BlinkCursor />
      </p>
    </div>
  );
}
