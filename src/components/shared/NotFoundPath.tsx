'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 404 화면의 요청 경로 표시 (설계 §7.8, R8).
 * 서버는 not-found에서 요청 URL에 접근할 수 없으므로 SSR은 `~` 폴백을 렌더하고,
 * 마운트 후 usePathname()의 실제 경로로 교체한다 (인라인 텍스트 교체 — CLS 없음).
 *
 * ⚠️ 경로는 항상 `<span>`으로 감싸 `overflow-wrap: anywhere`를 건다. `usePathname()`이 주는
 *    값은 **퍼센트 인코딩된 상태**라(`/tags/%EC%84%9C%EB%B2%84%EC%9A%B4%EC%98%81`) 공백도
 *    하이픈도 없는 한 덩어리가 되고, 320px에서 문서가 통째로 가로로 넘쳤다(QA 실측 +125px).
 *    한글 태그는 인코딩되면서 원래 가지고 있던 줄바꿈 기회를 잃는다.
 *    범위 초과 `?page=`가 404로 가는 설계(D-4) 이후 이 화면은 목록 4라우트의 정상 경로다.
 *
 * ⚠️ 이 처리는 **이 컴포넌트 안에서만** 한다. `anywhere`는 min-content 폭까지 줄이므로
 *    전역 유틸리티로 올리면 표 셀의 열 하한이 사라져 데스크톱에서도 식별자가 끊긴다
 *    (globals.css의 `.post-body td code { overflow-wrap: normal }` 주석이 같은 사고의 기록).
 */
export function NotFoundPath() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const text = !mounted || !pathname ? '~' : pathname.replace(/^\//, '') || '~';
  return <span className="[overflow-wrap:anywhere]">{text}</span>;
}
