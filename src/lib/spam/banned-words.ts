const BANNED_PATTERNS: RegExp[] = [
  /카지노/gi,
  /도박/gi,
  /대출/gi,
  /성인/gi,
  /porn/gi,
  /casino/gi,
  /gambling/gi,
];

export function containsBannedWord(content: string): boolean {
  return BANNED_PATTERNS.some((pattern) => pattern.test(content));
}
