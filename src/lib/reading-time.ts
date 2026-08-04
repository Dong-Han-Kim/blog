/**
 * 본문 읽기 시간(분) 산출 유틸.
 *
 * 산출식(설계 §8): 한글 등 CJK는 500자/분, 그 외 단어는 200단어/분.
 * 코드 펜스(```)는 읽기 시간에서 제외하고, 결과는 최소 1분.
 * frontmatter/zod 스키마는 건드리지 않는 파생 필드다.
 */
export function calcReadingTime(content: string): number {
  const body = content.replace(/```[\s\S]*?```/g, '');
  const cjk = (body.match(/[ㄱ-힝]/g) ?? []).length;
  const words = body
    .replace(/[ㄱ-힝]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(cjk / 500 + words / 200));
}
