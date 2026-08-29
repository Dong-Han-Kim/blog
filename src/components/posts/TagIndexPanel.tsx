'use client';

import { useState } from 'react';
import Link from 'next/link';

import { tagHref } from '@/lib/routes';

/** 접힌 상태에서 보여줄 태그 칩 상한 (핸드오버 8c) */
const VISIBLE_LIMIT = 16;

export interface TagIndexEntry {
  name: string;
  count: number;
}

interface TagIndexPanelProps {
  /** 사용 빈도순으로 정렬된 전체 태그 (서버에서 집계) */
  tags: TagIndexEntry[];
  /** 현재 페이지의 태그 이름 (디코딩된 원본) */
  current: string;
}

/**
 * 전체 태그 인덱스 패널 (핸드오버 8c): bg-raised 박스 + `ALL TAGS · {n}` 라벨 +
 * 태그 칩. 현재 태그는 역상 accent 칩(카운트 opacity .6), 나머지는 테두리 칩.
 * 상한 16개 초과분은 `+{n} more` 칩 클릭으로 전체 펼침 (즉시, 무전환).
 */
export function TagIndexPanel({ tags, current }: TagIndexPanelProps) {
  const [expanded, setExpanded] = useState(false);

  let visible = expanded ? tags : tags.slice(0, VISIBLE_LIMIT);
  // 현재 태그가 빈도 순위에서 상한 밖이면 접힌 목록의 마지막 자리에 대신 노출한다
  // (현재 페이지의 태그가 패널에 없으면 역상 칩 스펙 자체가 성립하지 않음)
  if (!expanded && !visible.some((tag) => tag.name === current)) {
    const currentEntry = tags.find((tag) => tag.name === current);
    if (currentEntry) {
      visible = [...visible.slice(0, VISIBLE_LIMIT - 1), currentEntry];
    }
  }
  const hiddenCount = tags.length - visible.length;

  return (
    <section className="mb-40 border border-rule bg-bg-raised px-20 py-18">
      <h2 className="mb-14 text-[10px] leading-none tracking-[2px] text-text-faint">
        ALL TAGS · {tags.length}
      </h2>
      <ul className="flex flex-wrap gap-8">
        {visible.map((tag) =>
          tag.name === current ? (
            <li key={tag.name}>
              <span
                aria-current="page"
                className="inline-block bg-accent px-10 py-5 text-[11px] leading-none text-bg"
              >
                #{tag.name} <span className="opacity-60">{tag.count}</span>
              </span>
            </li>
          ) : (
            <li key={tag.name}>
              <Link
                href={tagHref(tag.name)}
                // 24px 히트영역(WCAG 2.5.8) — 칩은 보더가 칠해지므로 09ccfcb의
                // min-h+음수마진 기법을 쓸 수 없다. 투명 ::after로 포인터 타깃만 넓힌다.
                className="relative inline-block border border-text-faint px-9 py-4 text-[11px] leading-none text-text-muted after:absolute after:inset-x-0 after:top-1/2 after:h-24 after:-translate-y-1/2 after:content-[''] hover:border-accent hover:text-text-strong"
              >
                #{tag.name} <span className="text-text-faint">{tag.count}</span>
              </Link>
            </li>
          )
        )}
        {hiddenCount > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              // 24px 히트영역(WCAG 2.5.8) — 위 태그 칩과 동일 기법
              className="relative border border-text-faint px-9 py-4 text-[11px] leading-none text-text-muted after:absolute after:inset-x-0 after:top-1/2 after:h-24 after:-translate-y-1/2 after:content-[''] hover:border-accent hover:text-text-strong"
            >
              +{hiddenCount} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
