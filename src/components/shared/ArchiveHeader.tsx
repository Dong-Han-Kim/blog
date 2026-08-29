import type { ReactNode } from 'react';

interface ArchiveHeaderProps {
  /** h1 내용. 태그 상세는 `#{태그명}`, 카테고리 상세는 content?.name ?? category */
  title: ReactNode;
  /**
   * h1 타이포. **필수 prop이다** — 두 상세 페이지의 타이포 축은 의도적으로 분기 유지한다
   * (결정 D-2 축②). 카테고리는 `text-cat-title uppercase`, 태그는 `text-[40px] leading-[1.3]`.
   * 태그명은 한글이 흔해 uppercase가 무의미하고 `#태그` 표기를 훼손하므로 통일하지 않는다.
   * 기본값을 두지 않는 이유: 새 소비처가 잘못된 타이포를 조용히 물려받는 것을 막기 위해서다.
   */
  titleClassName: string;
  /** 설명문. 없으면 <p> 자체를 렌더하지 않는다 (D-4.4) */
  description?: string;
  /** 우측 메타 상단 `{n} ENTRIES` 의 n. 산출식은 페이지마다 다르다 (D-4.I4) */
  entryCount: number;
  /** 우측 메타 하단 경로 표기 (예: `tags/linux/`, `categories/devops/`) */
  path: string;
}

/**
 * 카테고리/태그 상세 공통 헤더 (reuse-audit D-4 / C4).
 * 두 페이지가 같은 구조를 복제하며 3축이 드리프트했다 → 결정 D-2로 다음과 같이 수렴:
 *   ① header 여백  mb-44 / mb-40  → **mb-44** (인덱스 4곳·IndexPageShell과 일치)
 *   ② h1 타이포                    → **분기 유지** (titleClassName prop)
 *   ③ 설명문 크기  13px / 12px     → **text-[13px]** (본문 계열 크기와 일치)
 * 'use client'를 두지 않는다 (D-4.5).
 */
export function ArchiveHeader({
  title,
  titleClassName,
  description,
  entryCount,
  path,
}: ArchiveHeaderProps) {
  return (
    <header className="mb-44 flex items-end justify-between gap-32">
      <div>
        {/*
          cn(twMerge)을 쓰지 않고 문자열로 이어 붙인다. `text-cat-title`은 폰트 크기
          토큰(globals.css:49 `--text-cat-title`)이지만 tailwind-merge는 t-shirt size가
          아닌 `text-*`를 **색상** 그룹으로 분류해 base의 `text-text-strong`을 제거한다
          (실측: 카테고리 h1 색이 #EAFFEF → #CFEEDB로 회귀). 설계 §4.21의 확정 전문은
          cn을 쓰지만 그대로 두면 D-4.3의 "카테고리 변화 없음"을 깨므로 이 한 줄만 바꾼다.
        */}
        <h1 className={`font-display text-text-strong ${titleClassName}`}>
          {title}
        </h1>
        {description && (
          <p className="mt-12 text-[13px] leading-[2] text-text-muted">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right text-[11px] leading-[2] text-text-dim">
        <div>{entryCount} ENTRIES</div>
        <div className="text-text-faint">{path}</div>
      </div>
    </header>
  );
}
