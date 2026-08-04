"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

// CRT 리스킨 (설계 §4): next-themes 제거(단일 테마 — 항상 dark), radius 0,
// 토큰 색. 아이콘은 sonner 기본값 사용 (lucide 스피너의 animate-spin 제거).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
