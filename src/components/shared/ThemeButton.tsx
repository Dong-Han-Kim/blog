'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="p-6 text-muted-foreground hover:text-foreground transition-colors"
      aria-label={resolvedTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-18 h-18" />
      ) : (
        <Moon className="w-18 h-18" />
      )}
    </button>
  );
}

export default ThemeButton;
