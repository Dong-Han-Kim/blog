'use client';

import { cn } from '@/lib/cn';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [checked, setChecked] = useState(false);

  const switchClass = cn(
    `flex items-center justify-center align-center rounded-full w-30 h-30 absolute top-0 left-0 transition-transform duration-300 ease-in-out bg-sky-400 dark:bg-sky-700 ${checked ? 'translate-x-30' : 'translate-x-0'}`,
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (resolvedTheme === 'dark') {
      setChecked(true);
    } else {
      setChecked(false);
    }
  }, [resolvedTheme]);

  if (!isMounted) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="테마 변경 버튼"
      className="w-60 h-30 rounded-full relative bg-sky-300 dark:bg-gray-700"
      onClick={() => {
        const nextChecked = !checked;
        setChecked(nextChecked);
        setTheme(nextChecked ? 'dark' : 'light');
      }}
    >
      <span className={switchClass}>{checked ? '🌙' : '☀️'}</span>
    </button>
  );
}

export default ThemeButton;
