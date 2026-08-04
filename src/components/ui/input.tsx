import * as React from "react"

import { cn } from "@/lib/utils"

// CRT 리스킨 (설계 §4): radius/shadow/ring/transition 제거, caret accent,
// 포커스 1px accent 테두리. 배경·크기는 소비처에서 지정한다.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 border border-input bg-transparent px-16 py-12 text-[13px] text-text-strong caret-accent outline-none placeholder:text-text-faint selection:bg-bg-selected selection:text-text-strong",
        "focus-visible:border-accent",
        "aria-invalid:border-error",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
