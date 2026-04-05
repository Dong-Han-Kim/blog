'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SearchTriggerProps {
  className?: string;
}

export function SearchTrigger({ className }: SearchTriggerProps) {
  return (
    <button
      type="button"
      className={cn(
        'hidden md:flex items-center gap-8 text-sm text-muted-foreground hover:text-foreground transition-colors px-12 py-6 border border-border rounded-md',
        className,
      )}
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
        );
      }}
      aria-label="검색"
    >
      <Search className="w-14 h-14" />
      <span className="text-xs">검색...</span>
      <kbd className="ml-8 text-[10px] text-muted-foreground border border-border rounded px-4 py-1">
        ⌘K
      </kbd>
    </button>
  );
}

export function SearchTriggerMobile({ className }: SearchTriggerProps) {
  return (
    <button
      type="button"
      className={cn(
        'p-6 text-muted-foreground hover:text-foreground transition-colors md:hidden',
        className,
      )}
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
        );
      }}
      aria-label="검색"
    >
      <Search className="w-18 h-18" />
    </button>
  );
}
