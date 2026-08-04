import * as React from "react"

import { cn } from "@/lib/utils"

// CRT 리스킨 (설계 §4): radius/shadow/ring/transition 제거, caret accent,
// 포커스 1px accent 테두리. 크기는 소비처에서 지정한다.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content w-full resize-y border border-input bg-transparent px-16 py-12 text-[13px] leading-[2] text-text-body caret-accent outline-none placeholder:text-text-faint",
        "focus-visible:border-accent",
        "aria-invalid:border-error",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
