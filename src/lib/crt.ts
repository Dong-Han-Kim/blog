'use client';

/**
 * CRT 오버레이 상태 유틸 (설계 §3).
 *
 * 상태의 단일 출처는 `<html data-crt>` 속성이다. React 상태를 두지 않아
 * 하이드레이션 미스매치가 구조적으로 없다. localStorage에는 'off'일 때만
 * 키를 저장한다 (기본 on = 키 부재). 팔레트(U11)가 라벨 동기화를 위해
 * CRT_CHANGE_EVENT를 구독한다.
 */
export const CRT_STORAGE_KEY = 'crt';
export const CRT_CHANGE_EVENT = 'crtchange';

export function getCrtEnabled(): boolean {
  if (typeof document === 'undefined') return true;
  return document.documentElement.dataset.crt !== 'off';
}

export function setCrtEnabled(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-crt', on ? 'on' : 'off');
  try {
    // 저장 실패(사파리 프라이빗 등)해도 속성 반영은 유지된다 (설계 §12.1)
    if (on) {
      localStorage.removeItem(CRT_STORAGE_KEY);
    } else {
      localStorage.setItem(CRT_STORAGE_KEY, 'off');
    }
  } catch {
    // localStorage 접근 불가 — 세션 한정 토글로 동작
  }
  window.dispatchEvent(
    new CustomEvent(CRT_CHANGE_EVENT, { detail: { enabled: on } })
  );
}

export function toggleCrt(): boolean {
  const next = !getCrtEnabled();
  setCrtEnabled(next);
  return next;
}
