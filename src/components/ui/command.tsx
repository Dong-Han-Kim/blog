"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// ⌘K 팔레트 전용 재스타일 (설계 §7.7, U11). shadcn 원형은 포기하고 cmdk
// 프리미티브(키보드 순환·ARIA·그룹핑)만 유지한다. 유일 소비처: SearchCommand.

/**
 * 팔레트 모달 (핸드오버 6a/7c): 데스크톱 720px·상단 96px·1px accent 테두리·
 * bg-field 배경·핸드오버 그림자(팔레트만 허용). 배경 blur는 오버레이의
 * backdrop-filter로 처리 (설계 D6 — 본문 filter 방식 기각).
 * 모바일(≤767px): 풀스크린 시트, blur 없음. 포커스 트랩·스크롤 잠금·ESC는 radix가 담당.
 */
function CommandDialog({
  title = "커맨드 팔레트",
  description = "글 검색과 커맨드 실행",
  value,
  onValueChange,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & {
  title?: string
  description?: string
} & Pick<
    React.ComponentProps<typeof CommandPrimitive>,
    "value" | "onValueChange"
  >) {
  return (
    <DialogPrimitive.Root data-slot="command-dialog" {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-backdrop backdrop-blur-[1.5px] max-md:backdrop-blur-none" />
        <DialogPrimitive.Content
          data-slot="command-dialog-content"
          className={cn(
            "fixed left-1/2 top-96 z-50 w-720 max-w-[calc(100vw-44px)] -translate-x-1/2 border border-accent bg-bg-field outline-none",
            "shadow-[0_0_0_1px_var(--color-code-inline-bg),0_24px_60px_rgba(0,0,0,0.7)]",
            "max-md:inset-0 max-md:left-0 max-md:top-0 max-md:flex max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:flex-col max-md:border-0 max-md:px-22 max-md:pt-28 max-md:pb-22 max-md:shadow-none"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          <CommandPrimitive
            loop
            shouldFilter={false}
            value={value}
            onValueChange={onValueChange}
            className="flex h-full w-full flex-col overflow-hidden max-md:min-h-0 max-md:flex-1"
          >
            {children}
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** 모바일 입력 행 우측의 탭 가능한 닫기 (ESC 대체, ≥44px 히트영역) */
function CommandClose({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close
      className={cn(
        "inline-flex min-h-44 min-w-44 shrink-0 items-center justify-center text-[11px] text-text-dim outline-none hover:text-text-strong focus-visible:text-text-strong",
        className
      )}
    >
      닫기
    </DialogPrimitive.Close>
  )
}

/** 네이티브 caret(블록 아님) 허용 — 핸드오버 명시. caret-accent + 15px text-strong */
function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <CommandPrimitive.Input
      data-slot="command-input"
      className={cn(
        "w-full min-w-0 bg-transparent text-[15px] text-text-strong caret-accent outline-none placeholder:text-text-faint disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-[420px] overflow-x-hidden overflow-y-auto max-md:max-h-none max-md:flex-1",
        className
      )}
      {...props}
    />
  )
}

/** 그룹 라벨(POSTS/COMMANDS): 10px text-faint, letter-spacing 2px */
function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "pb-6 [&_[cmdk-group-heading]]:px-22 [&_[cmdk-group-heading]]:pt-14 [&_[cmdk-group-heading]]:pb-6 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-[2px] [&_[cmdk-group-heading]]:text-text-faint max-md:[&_[cmdk-group-heading]]:px-10",
        className
      )}
      {...props}
    />
  )
}

/**
 * 결과 행 3열 [26px_1fr_92px] (핸드오버 6a). 선택/호버 = bg-selected, 무전환.
 * 모바일(7c): 3열 해체 → [26px_1fr] 2줄, padding 14px 10px(≥44px 확보).
 */
function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "grid cursor-default grid-cols-[26px_1fr_92px] items-center gap-x-14 px-22 py-11 outline-hidden select-none",
        "data-[selected=true]:bg-bg-selected data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        "max-md:grid-cols-[26px_1fr] max-md:px-10 max-md:py-14",
        className
      )}
      {...props}
    />
  )
}

export {
  CommandDialog,
  CommandClose,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
}
