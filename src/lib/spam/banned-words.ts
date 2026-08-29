/**
 * 금지어 패턴.
 *
 * `g` 플래그를 붙이지 말 것. `RegExp.prototype.test()`는 `g`가 있으면 매치 후
 * `lastIndex`를 전진시키고 다음 호출을 그 위치부터 검색한다. 아래 배열은 모듈
 * 레벨 싱글턴이라 그 상태가 서버 프로세스의 모든 요청에 걸쳐 누적되고, 결과가
 * 요청마다 true/false로 진동한다(= 스팸이 그냥 통과한다).
 * `test()`는 존재 여부만 보므로 `g`로 얻는 이득도 없다.
 */
const BANNED_PATTERNS: RegExp[] = [
  /카지노/i,
  /도박/i,
  /대출/i,
  /성인/i,
  /porn/i,
  /casino/i,
  /gambling/i,
];

export function containsBannedWord(content: string): boolean {
  return BANNED_PATTERNS.some((pattern) => pattern.test(content));
}
