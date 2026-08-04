import {
  SearchTrigger,
  SearchTriggerMobile,
} from '@/components/search/SearchTrigger';
import { HeaderMobileLeft } from './HeaderMobileLeft';

/**
 * 사이트 공용 헤더 (설계 §5): 워드마크 26px(모바일 19px) + blink 커서(11×20),
 * 우측 검색 트리거. baseline 정렬, 하단 1px rule, padding-bottom 20px.
 * 모바일 상세의 `← posts/` 분기는 HeaderMobileLeft(클라이언트)가 담당.
 */
export function TerminalHeader() {
  return (
    <header className="flex items-baseline justify-between border-b border-rule pb-20">
      <HeaderMobileLeft />
      <SearchTrigger />
      <SearchTriggerMobile />
    </header>
  );
}
