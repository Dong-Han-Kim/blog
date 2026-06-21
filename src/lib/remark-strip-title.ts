/**
 * 본문(mdast)에서 첫 번째 H1을 제거하는 remark 플러그인.
 *
 * 글의 제목은 페이지 레이아웃(`post.frontmatter.title`)이 이미 <h1>으로
 * 렌더링한다. 마크다운 본문 맨 위의 `# 제목`까지 그대로 두면 제목이 화면에
 * 두 번 나오므로, 본문의 첫 H1 하나만 잘라낸다.
 *
 * - 마크다운 파일 자체에는 `# 제목`을 남겨 두어 파일 단독으로도 유효한 문서가 되게 한다.
 * - 첫 번째 H1만 제거하므로, 본문 중간에 의도적으로 쓴 H1(있다면)은 보존된다.
 */
interface MdastNode {
  type: string;
  depth?: number;
}

interface MdastRoot {
  children: MdastNode[];
}

export function remarkStripFirstH1() {
  return (tree: MdastRoot) => {
    const index = tree.children.findIndex(
      (node) => node.type === 'heading' && node.depth === 1
    );
    if (index !== -1) {
      tree.children.splice(index, 1);
    }
  };
}
