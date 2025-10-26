'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;
  return (
    <button
      className="w-100 h-50"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? 'lightmode' : 'darkmode'}
    </button>
  );
}

export default ThemeButton;
