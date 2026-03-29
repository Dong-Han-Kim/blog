'use client';

import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SearchTriggerProps {
  className?: string;
}

export function SearchTrigger({ className }: SearchTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
        );
      }}
      aria-label="검색"
    >
      <Search className="h-18 w-18" />
    </Button>
  );
}
