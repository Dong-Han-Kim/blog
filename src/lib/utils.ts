/**
 * cn 정본 — 이 경로만 신뢰한다 (reuse-audit B-1 / M3).
 * components.json의 aliases.utils = "@/lib/utils" 이므로 shadcn CLI가 컴포넌트를
 * 추가·갱신할 때마다 이 파일을 재생성한다. 다른 경로(과거 lib/utils/cn.ts)를 정본으로
 * 삼으면 CLI를 한 번만 돌려도 중복이 되살아나므로, 정본은 반드시 여기다.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
