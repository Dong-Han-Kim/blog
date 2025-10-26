'use client';

import clsx from 'clsx';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [checked, setChecked] = useState(false);

  const switchClass = clsx(
    `flex items-center justify-center align-center rounded-full w-30 h-30 absolute top-0 left-0 transition-transform duration-300 ease-in-out bg-sky-400 dark:bg-sky-700 ${checked ? 'translate-x-30' : 'translate-x-0'}`,
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;
  return (
    <button
      className="w-60 h-30 rounded-full relative bg-sky-300 dark:bg-gray-700"
      onClick={() => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
        setChecked(!checked);
      }}
    >
      <span className={switchClass}>{theme === 'dark' ? '☀️' : '🌙'}</span>
    </button>
  );
}

export default ThemeButton;
