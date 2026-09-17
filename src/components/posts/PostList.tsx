import type { PostMeta } from '@/types/common';
import { buildListHref, type ListView } from '@/lib/posts/pagination';
import { sortPostsByDate } from '@/lib/posts/sort';
import { DottedRule } from '@/components/terminal/DottedRule';
import { SortToggle } from '@/components/terminal/SortToggle';
import { ListPager } from './ListPager';
import { ListPendingBoundary, ListPendingSlot } from './ListPending';
import { PostRow } from './PostRow';

interface PostListProps {
  /** 필터만 끝난 **전체** 목록. 정렬·슬라이스는 이 컴포넌트가 한다 */
  posts: PostMeta[];
  /**
   * resolveListView가 만든 확정 뷰.
   * ⚠️ 불변식: `view.total === posts.length`. 타입으로 강제되지 않으므로 **페이지가 개수를 잰
   *    바로 그 배열**을 넘길 것. 어긋나면 헤더의 ENTRIES·페이지 수와 실제 목록이 조용히 갈라진다.
   */
  view: ListView;
  showFilename?: boolean;
}

/** 헤더의 `PAGE 02/09` 조판 — 페이저 칩·PostRow 인덱스와 같은 2자리 0채움 */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 목록 헤더 줄 + 포스트 행들 + 닫는 룰 + 페이저 (설계 §7.1–7.2 / feat-list-pagination §6.3·§8).
 * 홈·전체글·카테고리·태그 페이지 공용.
 *
 * ⚠️ **서버 컴포넌트다 — 클라이언트 지시어가 없다 (D-3).** 정렬과 페이지가 둘 다 URL로 올라가면서
 *    목록 자체에는 클라이언트 상태가 하나도 남지 않았고, 매 요청 20건이 HTML에 그대로 실린다
 *    (기존 "초기 10건은 SSR" 인수조건보다 강하다. QA 실측: flight 페이로드 83KB 감소).
 *    클라이언트 JS가 0은 아니다 — 페이저의 TerminalButton과 로딩 센서(ListPending)가 경계를
 *    만든다. 다만 그 경계들은 **목록 데이터를 직렬화하지 않는다**는 것이 이 불변식의 핵심이다.
 *    여기에 useState를 다시 들이면 `useSearchParams` CSR 바일아웃으로 목록이 HTML에서
 *    사라지는 경로(설계서 실측 E5)가 열린다 — 상태가 필요해 보이면 URL을 먼저 의심할 것.
 *
 * 정렬은 props의 posts 순서에 의존하지 않고 정본 함수(lib/posts/sort.ts)로 매번 수행한다.
 */
export function PostList({ posts, view, showFilename = true }: PostListProps) {
  const sortedPosts = sortPostsByDate(posts, view.sort);
  const visiblePosts = sortedPosts.slice(view.start, view.end);
  const newest = view.sort === 'newest';

  // 0건·1페이지에서는 `175 ENTRIES` 한 덩이 그대로 — 페이지가 하나뿐인데 `PAGE 01/01`은 잡음이다
  const headerLeft =
    view.totalPages > 1
      ? `${view.total} ENTRIES · PAGE ${pad(view.page)}/${pad(view.totalPages)}`
      : `${view.total} ENTRIES`;

  return (
    /*
     * 페이저 클릭 중 로딩 스켈레톤(ListPending). 경계는 **얇은 클라이언트 셸일 뿐**이고
     * children은 서버에서 렌더된 엘리먼트 그대로 내려간다 — 위 D-3 주석의 불변식
     * (이 파일에 클라이언트 지시어 없음 / 목록 20건은 HTML에 그대로)은 유지된다.
     * ⚠️ 이 파일에 그 지시어 문자열을 주석으로도 적지 말 것 — 완료 조건이 grep으로 0건을 센다.
     */
    <ListPendingBoundary>
      <section>
        {/*
         * ⚠️ 슬롯은 **헤더 + 포스트 행들까지만** 감싼다. 페이저를 안에 넣으면 pending일 때
         *    페이저가 언마운트되고 → PagerLinkPending의 cleanup이 pending을 false로 되돌리고
         *    → 페이저가 다시 마운트되는 **진동**이 생긴다. 센서(useLinkStatus)가 링크 안에
         *    살아 있어야 하므로 페이저는 항상 마운트돼 있어야 한다.
         * 헤더를 슬롯에 넣는 이유: ListSkeleton이 자체 프롬프트 3줄(`$ ls posts/` …)을 갖고 있어
         *    `175 ENTRIES ···` 줄이 남아 있으면 두 프롬프트가 겹쳐 보인다.
         */}
        <ListPendingSlot>
          <DottedRule
            left={headerLeft}
            right={
              <SortToggle
                label={newest ? 'SORTED BY DATE ↓' : 'SORTED BY DATE ↑'}
                shortLabel={newest ? 'DATE ↓' : 'DATE ↑'}
                srHint={newest ? '누르면 오래된순으로 정렬' : '누르면 최신순으로 정렬'}
                // page를 싣지 않는다 (§3.4): 최신순 2페이지와 오래된순 2페이지는 아무 관계가 없는
                // 집합이라, 번호를 유지하면 "위치가 보존된 것처럼 보이지만 내용은 전혀 다른" 화면이 된다.
                href={buildListHref(view.basePath, { sort: newest ? 'oldest' : 'newest' })}
                className="max-md:text-[10px]"
              />
            }
            className="mb-2 max-md:gap-10 max-md:text-[10px]"
          />
          <div className="flex flex-col">
            {visiblePosts.map((post, i) => (
              <PostRow
                key={post.slug}
                post={post}
                // 목록 내 **전역 연번** — 페이지마다 01로 재시작하지 않는다 (§8.4).
                // 헤더의 `175 ENTRIES`와 짝이 맞아야 `[ 21 ]`이 글 하나를 가리키는 식별자가 된다.
                index={view.start + i + 1}
                showFilename={showFilename}
              />
            ))}
            {/* 마지막 행 아래 닫는 1px rule (핸드오버 2a) */}
            <div aria-hidden className="border-t border-rule" />
          </div>
        </ListPendingSlot>
        <ListPager view={view} />
      </section>
    </ListPendingBoundary>
  );
}
