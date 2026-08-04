/**
 * CRT 3레이어 오버레이 (설계 §3.2). 서버 컴포넌트 — 상태 무관 항상 렌더하고,
 * 표시 여부는 CSS(`[data-crt="off"] .crt-layer`)가 제어한다.
 * 강도 값은 핸드오버 수치 고정 (globals.css의 .crt-* 참조).
 */
export function CrtOverlay() {
  return (
    <>
      <div
        aria-hidden
        className="crt-layer crt-scanlines pointer-events-none fixed inset-0 z-[2]"
      />
      <div
        aria-hidden
        className="crt-layer crt-noise pointer-events-none fixed -inset-[20%] z-[3]"
      />
      <div
        aria-hidden
        className="crt-layer crt-vignette pointer-events-none fixed inset-0 z-[5]"
      />
    </>
  );
}
