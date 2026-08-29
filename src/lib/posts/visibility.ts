/**
 * 초안(draft) 글이 URL 직접 접근으로 보여도 되는지 판정한다.
 *
 * ⚠️ 목록·피드·사이트맵·검색의 draft 필터는 여기 없다 — 그쪽은 환경과 무관하게
 * 항상 감추는 정책이라 mdx.ts의 getPublishedPosts/filterSeriesPosts와
 * 태그·카테고리 페이지가 각자 처리한다. 이 함수는 환경 의존 판정만 담당한다.
 *
 * mdx.ts의 getPostBySlug는 draft 글도 그대로 돌려준다 —
 * "노출 판단은 호출부 몫"이 명시된 계약이며(mdx.contract.test.ts), 그 판단 규칙을
 * 라우트에 흩어 두지 않고 이 순수 함수 한 곳에 모은다.
 * fs·next/navigation 의존이 없어 단위 테스트에서 환경변수 조작 없이 양쪽 환경을 고정할 수 있다.
 *
 * 정책: 프로덕션에서만 감춘다.
 * ① 프로덕션(빌드/배포 산출물)에서는 URL을 아는 사람도 초안 본문·제목에 닿지 못한다.
 *    Vercel 프리뷰 배포도 NODE_ENV가 'production'이라 같이 닫힌다.
 * ② 개발 환경(npm run dev, NODE_ENV='development')에서는 열어 둔다 — 저자가 초안을
 *    확인하려고 frontmatter의 draft를 매번 뒤집었다 되돌리는 워크플로를 막기 위함이다.
 * 테스트(NODE_ENV='test')도 프로덕션이 아니므로 열려 있다 — 판정은 항상
 * nodeEnv를 명시적으로 넘겨 검증한다.
 *
 * 참고: Next는 process.env.NODE_ENV를 빌드 타임에 인라인하므로 프로덕션
 * 번들에서는 기본 인자가 리터럴 'production'으로 굳는다. 런타임에 NODE_ENV를
 * 비우거나 바꿔도 닫힌 채로 남는다. 다만 이 함수를 Next 번들 밖(스크립트·CLI)에서
 * 재사용하면 그때는 런타임 값을 읽으므로 nodeEnv를 명시적으로 넘겨라.
 */
export function isPostViewable(
  post: { draft?: boolean },
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!post.draft) return true;
  return nodeEnv !== 'production';
}
