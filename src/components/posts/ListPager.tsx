import { buildListHref, buildPageWindow, type ListView } from '@/lib/posts/pagination';
import { TerminalButton } from '@/components/terminal/TerminalButton';
import { TerminalChip } from '@/components/terminal/TerminalChip';
import { PagerLinkPending } from './ListPending';

/**
 * 목록 페이저 (feat-list-pagination 설계서 §8.2–8.3). 이 파일에는 `'use client'`가 없지만
 * **클라이언트 JS가 0인 것은 아니다** (리뷰 L-2 / QA 결함 C — 옛 주석의 "클라이언트 JS 0"은 사실이 아니었다).
 * 서버 컴포넌트인 것은 번호 칩(`TerminalChip`)뿐이고, prev/next가 쓰는 `TerminalButton`이
 * `'use client'`라 페이지당 클라이언트 경계가 2개 생긴다. 여기에 각 링크의 로딩 센서
 * (`PagerLinkPending`)까지 클라이언트다. 이 저장소는 주석을 규범으로 읽으므로(DV-1) 수치는 사실대로 적는다.
 *
 * 기존 `$ ls --more` 블록이 있던 자리를 그대로 이어받는다(같은 조판·같은 여백). 다른 점은
 * 상태가 클라이언트가 아니라 URL에 있다는 것뿐이라, 모든 이동이 진짜 `<a>`다 —
 * 새로고침·뒤로가기·북마크·새 탭이 성립하는 이유가 여기다.
 *
 * ⚠️ href는 **반드시 buildListHref로만** 조립한다. 문자열을 직접 만들면 기본값 생략 규칙
 *    (page=1·sort=newest를 URL에 쓰지 않는다, §3.2)이 두 곳으로 갈라져 한 페이지에 URL이
 *    둘이 된다. 계약 테스트가 "모든 href === buildListHref 출력"을 고정하는 이유다.
 *
 * ⚠️ prev/next에 `aria-label`을 붙이지 않는다. 가시 라벨(`$ ls --prev`)이 통째로 덮여
 *    accessible name에서 사라지면 WCAG 2.5.3(Label in Name) 위반이고, 음성 제어 사용자가
 *    "ls --prev"라고 말해도 그 버튼이 잡히지 않는다. 위치는 라벨을 **덮지 않고 뒤에 덧붙이는**
 *    sr-only span으로 준다 (`SortToggle`의 srHint와 같은 기법 — 그 파일 주석의 방침을 따른다).
 *
 * ⚠️ buildPageWindow에는 반드시 `view.totalPages`를 넘긴다. `totalPages = 0`은 정의돼 있지
 *    않아 조용히 빈 배열이 되고 번호 열이 통째로 사라진다 (ListView.totalPages는 항상 ≥ 1).
 */
interface ListPagerProps {
  /** resolveListView가 만든 확정 뷰. 여기서 재검증하지 않는다 */
  view: ListView;
}

/** 페이지 번호 조판 규칙 — PostRow 인덱스와 같은 2자리 0채움 (`01`…`09`, 세 자리는 그대로) */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 번호 슬롯 공통 폭 — §8.2 "페이저 기하 고정"을 **실제로** 이행하는 장치 (QA 결함 A).
 *
 * 슬롯 **개수**는 §8.3이 7로 고정하지만 개수가 폭을 고정하지는 않았다. 숫자 칩은
 * `px-10` + 1px 보더(실측 36.7px), 생략은 `px-4`짜리 `…` 한 글자(19.0px)라 슬롯 구성이
 * `숫자 6 + 생략 1`(1–4·6–9페이지)에서 `숫자 5 + 생략 2`(가운데 분기)로 바뀌는 순간
 * 번호 열이 17.7px 좁아지고 prev/next가 8.9px씩 안쪽으로 밀렸다 (`totalPages >= 9` 전부에서 재현).
 *
 * 두 종류 슬롯에 같은 최소 폭을 주면 구성이 바뀌어도 번호 열 폭이 변하지 않는다.
 * `tabular-nums`는 그 안쪽의 흔들림을 잡는다 — 비례폭 글꼴이라 `01`(34.8px)과 `04`(36.7px)의
 * 폭이 다르다. 40px는 두 자리(`01`…`99`)까지를 덮는다.
 *
 * ⚠️ 알려진 한계: `totalPages >= 100`이면 세 자리 칩(`100`, 약 44px)이 min-w를 넘어서
 *    두 자리 칩과 다시 폭이 갈라진다. 그때는 이 값을 세 자리가 들어가는 폭(`min-w-48`)으로
 *    올리면 된다 — 슬롯 수(7)와 조판은 그대로다. 현재 목록은 175편 · 9페이지라 해당 없음.
 *
 * ⚠️ `TerminalChip` 쪽을 고치지 않는다. 칩은 태그·검색·스레드 토글 6곳이 공유하는
 *    프리미티브라 폭을 박으면 그 전부가 같이 변한다. 폭은 페이저의 사정이므로 여기서 준다.
 */
const SLOT_WIDTH = 'min-w-40 text-center tabular-nums';

/**
 * prev/next 라벨 뒤에 덧붙는 sr-only 위치 힌트 문구.
 * 비활성(첫 페이지의 prev / 마지막 페이지의 next)이면 **위치를 빼고 방향만** 읽는다 —
 * 존재하지 않는 `(0/9)`·`(10/9)` 페이지를 스크린리더에 불러줄 수는 없다.
 */
const srPosition = (direction: '이전' | '다음', target: number | null, totalPages: number) =>
  target === null ? `${direction} 페이지` : `${direction} 페이지 (${target}/${totalPages})`;

export function ListPager({ view }: ListPagerProps) {
  // 1페이지뿐이면 페이저 자체가 없다 — 기존 LoadMore의 `total <= PAGE_SIZE → null`과 같은 자리의 규칙
  if (view.totalPages <= 1) return null;

  const { page, totalPages, total, sort, start, end, basePath } = view;
  const slots = buildPageWindow(page, totalPages);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav aria-label="페이지 매김" className="mt-40 flex flex-col items-center gap-14">
      <div className="flex items-center justify-center gap-24 max-md:w-full max-md:justify-between max-md:gap-12">
        {/*
         * 첫/마지막 페이지에서도 **숨기지 않고 disabled로 렌더**한다. 버튼이 사라지면
         * 번호 열이 좌우로 밀려 페이지를 넘길 때마다 페이저 기하가 흔들린다.
         * TerminalButton은 disabled면 href를 무시하고 <button disabled> + pointer-events-none으로 떨어진다.
         */}
        <TerminalButton
          href={hasPrev ? buildListHref(basePath, { page: page - 1, sort }) : undefined}
          disabled={!hasPrev}
          className="gap-10 px-24 py-12 text-[13px] max-md:px-16 max-md:py-10 max-md:text-[12px]"
        >
          <span className="text-text-faint">$</span>
          {/* 모바일 축약 — SortToggle의 shortLabel과 같은 기법 (320px에 `ls `가 들어갈 자리가 없다) */}
          <span className="max-md:hidden">ls --prev</span>
          <span className="hidden max-md:inline">--prev</span>
          {/* 라벨을 덮지 않고 뒤에 덧붙인다 — 어느 폭에서든 가시 텍스트가 accessible name에 남는다 */}
          <span className="sr-only"> {srPosition('이전', hasPrev ? page - 1 : null, totalPages)}</span>
          {/*
           * 전환 중 목록 스켈레톤을 띄우는 센서 (ListPending). useLinkStatus는 **가장 가까운
           * 조상 Link의 상태**를 보므로 반드시 링크 **안**에 둔다. 렌더 결과는 없다(null).
           * disabled면 TerminalButton이 <button>으로 떨어져 조상 Link가 없지만,
           * useLinkStatus는 그때 기본값 {pending:false}를 돌려주므로 안전하다.
           */}
          <PagerLinkPending />
        </TerminalButton>

        {/*
         * 번호 열은 모바일(≤767px)에서 통째로 숨긴다. 320px에 칩 7개 + 버튼 2개는 들어가지 않는다.
         * prev/next로 모든 페이지에 도달할 수 있으므로 기능 손실은 없다
         * (PostRow가 모바일에서 태그를 숨기는 것과 같은 축약 원칙).
         */}
        <ol className="flex items-center gap-8 max-md:hidden">
          {slots.map((slot, i) =>
            slot === 'ellipsis' ? (
              <li key={`ellipsis-${i}`} className={SLOT_WIDTH}>
                <span aria-hidden className="text-[11px] text-text-faint">
                  …
                </span>
                <span className="sr-only">생략된 페이지</span>
              </li>
            ) : (
              <li key={slot}>
                {slot === page ? (
                  // 현재 페이지는 링크가 아니다 — 자기 자신으로 가는 <a>는 SR에 잡음이고,
                  // aria-current가 "여기"를 말하는 유일한 신호다 (href 없음 → <span> 분기)
                  <TerminalChip variant="filled" ariaCurrent="page" className={SLOT_WIDTH}>
                    {pad(slot)}
                  </TerminalChip>
                ) : (
                  <TerminalChip
                    href={buildListHref(basePath, { page: slot, sort })}
                    className={SLOT_WIDTH}
                  >
                    {pad(slot)}
                    <PagerLinkPending />
                  </TerminalChip>
                )}
              </li>
            ),
          )}
        </ol>
        {/*
         * 숨긴 번호 열을 대신하는 모바일 전용 위치 표기.
         * `05 / 09`만 있으면 스크린리더에 "05 슬래시 09"로 떨어져 무엇의 05인지 알 수 없다 —
         * sr-only 접두로 "페이지 05 / 09"가 되게 한다. 시각적 표기는 그대로 `05 / 09`.
         */}
        <p className="hidden text-[11px] text-text-dim max-md:block">
          <span className="sr-only">페이지 </span>
          {pad(page)} / {pad(totalPages)}
        </p>

        <TerminalButton
          href={hasNext ? buildListHref(basePath, { page: page + 1, sort }) : undefined}
          disabled={!hasNext}
          className="gap-10 px-24 py-12 text-[13px] max-md:px-16 max-md:py-10 max-md:text-[12px]"
        >
          <span className="text-text-faint">$</span>
          <span className="max-md:hidden">ls --next</span>
          <span className="hidden max-md:inline">--next</span>
          <span className="sr-only"> {srPosition('다음', hasNext ? page + 1 : null, totalPages)}</span>
          <PagerLinkPending />
        </TerminalButton>
      </div>

      {/* 기존 `{표시}/{전체} 표시 중`의 문형을 유지한다 (start는 0-base라 +1) */}
      <p className="text-[11px] text-text-dim">
        {start + 1} – {end} / {total} 표시 중
      </p>

      {/*
       * 진행 바는 240×4px 그대로지만 의미가 "로드 진행률"에서 "페이지 위치"로 바뀌었다.
       * role="progressbar"를 걷어내고 aria-hidden으로 내린 이유: 페이지 이동은 진행률이 아니고,
       * 같은 정보를 바로 위 텍스트가 이미 접근 가능한 형태로 준다. 시각적 연속성만 남긴다.
       */}
      <div aria-hidden className="h-4 w-240 max-w-full bg-track">
        <div
          className="h-full bg-text-faint"
          style={{ width: `${(page / totalPages) * 100}%` }}
        />
      </div>
    </nav>
  );
}
