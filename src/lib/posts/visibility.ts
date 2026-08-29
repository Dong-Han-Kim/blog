/**
 * 초안(draft) 글의 노출 정책 정본.
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
 */
export function isPostViewable(
  post: { draft?: boolean },
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (!post.draft) return true;
  return nodeEnv !== 'production';
}
