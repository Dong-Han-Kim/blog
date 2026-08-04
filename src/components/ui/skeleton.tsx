import { cn } from "@/lib/utils"

// CRT 리스킨 (설계 §4): 정지 스켈레톤 — 펄스 애니메이션·radius 없음, skeleton 토큰 색.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-skeleton", className)}
      {...props}
    />
  )
}

export { Skeleton }
