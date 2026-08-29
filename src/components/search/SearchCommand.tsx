'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandClose,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  filterPosts,
  topTags,
  type PaletteCommand,
  type SearchPost,
} from '@/lib/search';
import { CRT_CHANGE_EVENT, getCrtEnabled, toggleCrt } from '@/lib/crt';
import { TerminalChip } from '@/components/terminal/TerminalChip';

/**
 * ⌘K 커맨드 팔레트 (설계 §7.7, 핸드오버 6a/7c/8a).
 * 검색은 lib/search.ts 순수 함수(부분 문자열), 커맨드 3종, TAB 자동완성,
 * 0건 상태 + TRY 태그 칩. CRT 커맨드는 실행 후 팔레트를 닫지 않고 라벨만 갱신.
 */
export function SearchCommand() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [crtOn, setCrtOn] = useState(true);
  // cmdk 선택 항목 (controlled) — 인덱스 비동기 도착 시 초기 선택 보정용 (QA-L1)
  const [selected, setSelected] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K 토글 (기존 로직 유지)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // 닫힘 경로 일원화 (리뷰 L-1): ESC·백드롭·⌘K 토글·항목 선택 어느 쪽으로
  // 닫혀도 질의를 리셋한다
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // 초기 선택 보정 (QA-L1): 오픈 시점에 인덱스가 아직/이미 도착했든,
  // 첫 표시 항목(POSTS 첫 행)을 선택한다. 인덱스 도착 전엔 cmdk 기본
  // (COMMANDS 첫 행)이었다가 도착 즉시 보정된다
  useEffect(() => {
    if (open && posts.length > 0) {
      setSelected(`post:${posts[0].slug}`);
    }
  }, [open, posts]);

  // CRT 라벨 동기화: 열려 있는 동안 crtchange 이벤트 구독 (설계 §3.3)
  useEffect(() => {
    setCrtOn(getCrtEnabled());
    const sync = () => setCrtOn(getCrtEnabled());
    window.addEventListener(CRT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(CRT_CHANGE_EVENT, sync);
  }, []);

  // 검색 인덱스 fetch (기존 로직 유지). 실패 시 posts 빈 목록 —
  // 커맨드 3종은 posts와 독립이라 항상 동작 (설계 §12.1)
  useEffect(() => {
    if (open && posts.length === 0) {
      fetch('/search-index.json')
        .then((res) => res.json())
        .then(setPosts)
        .catch(() => {});
    }
  }, [open, posts.length]);

  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: 'go-home', label: 'cd ~', hint: 'G H', run: (r) => r.push('/') },
      {
        id: 'go-categories',
        label: 'ls categories/',
        hint: 'G C',
        run: (r) => r.push('/categories'),
      },
      {
        id: 'toggle-crt',
        label: `export CRT=${crtOn ? 'off' : 'on'}`,
        hint: '⇧ C',
        run: () => {
          toggleCrt();
        },
      },
    ],
    [crtOn]
  );

  const filteredPosts = useMemo(
    () => filterPosts(posts, query),
    [posts, query]
  );

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => {
      if (cmd.label.toLowerCase().includes(q)) return true;
      // 토글 직후 라벨이 on↔off로 바뀌어도 항목이 사라지지 않도록 양쪽 라벨 허용
      // (질의가 이전 라벨 전체일 때 갱신된 라벨을 계속 보여줘야 함 — 인수조건 "라벨 반영")
      if (cmd.id === 'toggle-crt') {
        return (
          'export crt=off'.includes(q) || 'export crt=on'.includes(q)
        );
      }
      return false;
    });
  }, [commands, query]);

  const suggestedTags = useMemo(() => topTags(posts, 4), [posts]);

  const isEmpty =
    query.trim() !== '' &&
    filteredPosts.length === 0 &&
    filteredCommands.length === 0;

  const close = useCallback(() => {
    setOpen(false); // 질의 리셋은 open 이펙트가 담당 (닫힘 경로 일원화)
  }, []);

  const handleSelectPost = useCallback(
    (slug: string) => {
      close();
      router.push(`/posts/${slug}`);
    },
    [close, router]
  );

  const handleSelectCommand = useCallback(
    (cmd: PaletteCommand) => {
      if (cmd.id === 'toggle-crt') {
        // 토글 확인이 가능하도록 팔레트를 닫지 않는다 — 라벨만 갱신 (설계 §7.7)
        cmd.run(router);
        return;
      }
      close();
      cmd.run(router);
    },
    [close, router]
  );

  // TAB 자동완성: 질의가 커맨드 라벨의 prefix면 라벨로 완성 (설계 §7.7 ③)
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Tab') return;
      const q = query.trim().toLowerCase();
      if (!q) return;
      const match = commands.find((cmd) =>
        cmd.label.toLowerCase().startsWith(q)
      );
      if (match) {
        e.preventDefault();
        setQuery(match.label);
      }
    },
    [commands, query]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      value={selected}
      onValueChange={setSelected}
    >
      {/* 입력 행: `>` accent + 네이티브 caret 입력 + {n} RESULTS 카운터 */}
      <div className="flex items-center gap-12 border-b border-rule-inner px-22 py-18 max-md:border max-md:border-accent max-md:px-14 max-md:py-5">
        <span aria-hidden className="text-[15px] text-accent">
          &gt;
        </span>
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleInputKeyDown}
          aria-label="검색"
          className="max-md:py-12"
        />
        <span className="shrink-0 text-[11px] text-text-faint">
          {filteredPosts.length} RESULTS
        </span>
        <CommandClose className="md:hidden" />
      </div>

      <CommandList>
        {isEmpty ? (
          /* 팔레트 0건 (핸드오버 8a) */
          <div className="px-22 pt-40 pb-34 text-center">
            <p className="text-[13px] leading-[2.1] text-error">
              grep: {query}: 일치하는 글이 없습니다
            </p>
            <p className="mt-12 text-[11px] text-text-dim">
              제목 · 태그 · 파일명을 검색합니다.
            </p>
            {suggestedTags.length > 0 && (
              <div className="mt-24 border-t border-code-inline-bg pt-20">
                <div className="flex flex-wrap items-center justify-center gap-12">
                  <span className="text-[10px] tracking-[2px] text-text-faint">
                    TRY
                  </span>
                  {suggestedTags.map((tag) => (
                    <TerminalChip
                      key={tag}
                      onClick={() => {
                        setQuery(tag);
                        // 칩 클릭으로 포커스가 버튼에 남으면 ↑↓/↵가 불능 —
                        // 입력창으로 복귀시켜 키보드 흐름 유지 (QA-M1)
                        inputRef.current?.focus();
                      }}
                    >
                      {tag}
                    </TerminalChip>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {filteredPosts.length > 0 && (
              <CommandGroup heading="POSTS">
                {filteredPosts.map((post) => (
                  <CommandItem
                    key={post.slug}
                    value={`post:${post.slug}`}
                    onSelect={() => handleSelectPost(post.slug)}
                  >
                    <span aria-hidden className="text-[13px] text-text-faint">
                      ↳
                    </span>
                    <span className="truncate text-[13px] text-text-body max-md:text-[12px]">
                      {post.title}
                    </span>
                    <span className="text-right text-[10px] text-text-dim max-md:hidden">
                      {post.category}
                    </span>
                    <span className="col-start-2 text-[10px] text-text-dim md:hidden">
                      {post.category}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {filteredCommands.length > 0 && (
              <CommandGroup
                heading="COMMANDS"
                className={
                  // 그룹 사이 구분선 (핸드오버: 1px solid #0d2411 = code-inline-bg 토큰)
                  filteredPosts.length > 0
                    ? 'border-t border-code-inline-bg'
                    : undefined
                }
              >
                {filteredCommands.map((cmd) => (
                  <CommandItem
                    key={cmd.id}
                    value={`cmd:${cmd.id}`}
                    onSelect={() => handleSelectCommand(cmd)}
                  >
                    <span aria-hidden className="text-[13px] text-text-faint">
                      $
                    </span>
                    <span className="truncate text-[13px] text-text-body max-md:text-[12px]">
                      {cmd.label}
                    </span>
                    <span className="text-right text-[10px] text-text-dim max-md:hidden">
                      {cmd.hint}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>

      {/* 푸터 키 힌트 (데스크톱 전용) */}
      <div className="flex items-center gap-16 border-t border-rule-inner px-22 py-12 text-[10px] text-text-faint max-md:hidden">
        <span>↑↓ 이동</span>
        <span>↵ 열기</span>
        <span>TAB 자동완성</span>
        <span className="ml-auto">ESC 닫기</span>
      </div>
    </CommandDialog>
  );
}
