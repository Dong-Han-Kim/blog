'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

/**
 * 목차 (핸드오버 §2 목차, 설계 §7.5).
 * - 데스크톱(lg+): sticky top 32px, `CONTENTS` 라벨, IntersectionObserver로 현재
 *   섹션 text-strong, 하단 32px 아래 `posts/` + `{slug}.md`.
 * - max-lg: `CONTENTS (n) ▼` 접힘 바 — 즉시 토글(무전환).
 * page.tsx에서 그리드 첫 자식으로 배치되고 데스크톱에서 lg:order-2로 재배치된다.
 */
export function TableOfContents() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

  const pathname = usePathname();
  const slug = decodeURIComponent(pathname.split('/').filter(Boolean).pop() ?? '');

  useEffect(() => {
    const article = document.querySelector('article');
    if (!article) return;

    const elements = Array.from(article.querySelectorAll('h2, h3'));

    setHeadings(
      elements.map((el) => ({
        id: el.id,
        text: el.textContent ?? '',
        level: Number(el.tagName.charAt(1)),
      }))
    );

    if (elements.length === 0) return;

    // 상단 30% 지점 진입 기준으로 현재 섹션 추적 (설계: rootMargin -70% 계열)
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }

        const current = elements.find((el) => visible.has(el.id));
        if (current) {
          setActiveId(current.id);
          return;
        }

        // 관찰 영역에 헤딩이 없으면 뷰포트 상단 위로 지나간 마지막 헤딩을 활성으로
        const passed = elements.filter(
          (el) => el.getBoundingClientRect().top < window.innerHeight * 0.3
        );
        setActiveId(passed.length > 0 ? passed[passed.length - 1].id : elements[0].id);
      },
      { rootMargin: '0px 0px -70% 0px' }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length === 0) return null;

  const items = (onNavigate?: () => void) =>
    headings.map((heading) => (
      <li key={heading.id} style={{ paddingLeft: (heading.level - 2) * 12 }}>
        <a
          href={`#${heading.id}`}
          onClick={onNavigate}
          className={cn(
            'block text-[12px] leading-[1.8]',
            activeId === heading.id
              ? 'text-text-strong'
              : 'text-text-dim hover:text-text-strong'
          )}
        >
          {heading.text}
        </a>
      </li>
    ));

  return (
    <nav
      aria-label="목차"
      className="mb-40 lg:sticky lg:top-32 lg:order-2 lg:mb-0 lg:self-start"
    >
      {/* max-lg: 접힘 바 (본문 위) */}
      <div className="lg:hidden">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          // min-h-44: 터치 타깃 44px 확보 (QA-L2 — 시각 스펙 p-[12px_14px] 유지, 부족분만 세로 중앙 정렬로 흡수)
          className="flex min-h-44 w-full items-center justify-between border border-rule p-[12px_14px] text-[11px] tracking-[2px] text-text-dim"
        >
          <span>CONTENTS ({headings.length})</span>
          <span aria-hidden>{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && (
          <ul className="flex flex-col gap-12 border border-t-0 border-rule p-[14px_16px]">
            {items(() => setExpanded(false))}
          </ul>
        )}
      </div>

      {/* lg+: sticky 사이드 목차 */}
      <div className="hidden lg:block">
        <p className="mb-16 text-[11px] tracking-[2px] text-text-faint">CONTENTS</p>
        <ul className="flex flex-col gap-14 border-l border-rule pl-16">{items()}</ul>
        <div className="mt-32 text-[11px] leading-[2] text-text-faint">
          <p>posts/</p>
          <p className="break-all">{slug}.md</p>
        </div>
      </div>
    </nav>
  );
}
