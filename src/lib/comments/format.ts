/**
 * 댓글 시각 포맷 (설계 §7.6): 데스크톱 `YYYY-MM-DD HH:mm`, 모바일 `MM-DD HH:mm`.
 *
 * KST(UTC+9) 고정 오프셋으로 포맷한다 (리뷰 M-1): 상세 페이지는 force-dynamic
 * SSR이라 서버 로컬 TZ로 포맷하면 프로덕션(UTC 서버)에서 클라이언트 재계산 값과
 * 달라져 React 하이드레이션 텍스트 미스매치가 난다. 고정 오프셋은 실행 환경
 * TZ와 무관하게 서버/클라이언트 출력이 항상 동일하다 (mounted 패턴은 댓글 행마다
 * 마운트 후 텍스트 교체 깜빡임이 생겨 기각).
 * 파싱 실패 시 원문을 그대로 반환한다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function formatCommentTime(iso: string, mobile = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  const short = `${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
  return mobile ? short : `${kst.getUTCFullYear()}-${short}`;
}
