import Link from 'next/link';
import { Default_Nav_items } from '@/constants/menu';

interface CategoryTabsProps {
  /** 'ALL' 또는 카테고리 slug (예: 'til') */
  active: string;
}

/**
 * 카테고리 탭 (핸드오버 2a/7a): ALL, Frontend, Backend, DevOps, Database,
 * Projects, TIL — `Default_Nav_items` 순서 그대로. 활성 항목은 text-strong +
 * 2px accent 밑줄. 탭은 라우트 이동(`/`, `/categories/{slug}`) — 클라이언트
 * 필터 기각 (설계 §7.1). 모바일은 가로 스크롤 + 하단 rule-weak 보더.
 */
export function CategoryTabs({ active }: CategoryTabsProps) {
  return (
    <nav
      aria-label="카테고리"
      className="scrollbar-none mb-40 flex flex-wrap gap-26 max-md:mb-24 max-md:flex-nowrap max-md:gap-18 max-md:overflow-x-auto max-md:border-b max-md:border-rule-weak max-md:pb-12 max-md:whitespace-nowrap"
    >
      {Default_Nav_items.map((item) => {
        const isActive =
          active === 'ALL'
            ? item.path === '/'
            : item.path === `/categories/${active.toLowerCase()}`;

        return (
          <Link
            key={item.path}
            href={item.path}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'shrink-0 border-b-2 border-accent pb-4 text-[13px] text-text-strong max-md:text-[12px]'
                : 'shrink-0 pb-4 text-[13px] text-text-muted hover:text-text-strong max-md:text-[12px]'
            }
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
