import localFont from 'next/font/local';

// Galmuri (SIL OFL 1.1, public/fonts/OFL-Galmuri.txt 동봉) self-host.
// 한글 커버리지가 필요해 subset 하지 않는다 (설계 §2.2, R1 수용).

export const galmuri11 = localFont({
  src: '../../public/fonts/Galmuri11.woff2',
  display: 'swap',
  weight: '400',
  variable: '--font-galmuri11',
  fallback: ['ui-monospace', 'monospace'],
  // 본문 폰트 — preload 유지(기본 true)
});

export const galmuri14 = localFont({
  src: '../../public/fonts/Galmuri14.woff2',
  display: 'swap',
  weight: '400',
  variable: '--font-galmuri14',
  fallback: ['ui-monospace', 'monospace'],
  preload: false, // 제목/숫자 전용 — preload 1종만 (R1 대응)
});
