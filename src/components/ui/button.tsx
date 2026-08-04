import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// CRT 리스킨 (설계 §4): radius/shadow/transition/ring 제거, 포커스는 1px accent 테두리.
// default = SUBMIT류 채움(primary = text-faint 배경, 호버 accent 인광),
// outline = 터미널 버튼 패턴. 크기는 소비처에서 지정 가능.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-8 whitespace-nowrap border border-transparent outline-none shrink-0 focus-visible:border-accent disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-error [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-accent",
        destructive: "bg-error text-bg hover:bg-accent",
        outline:
          "border-text-faint bg-transparent text-text-muted hover:border-accent hover:text-text-strong",
        secondary: "bg-secondary text-secondary-foreground hover:bg-bg-hover",
        ghost: "text-text-muted hover:bg-bg-hover hover:text-text-strong",
        link: "text-text-muted underline-offset-4 hover:underline",
      },
      size: {
        default: "px-18 py-8 text-[12px]",
        sm: "px-10 py-5 text-[11px]",
        lg: "px-24 py-12 text-[13px]",
        icon: "size-44",
        "icon-sm": "size-32",
        "icon-lg": "size-44",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
