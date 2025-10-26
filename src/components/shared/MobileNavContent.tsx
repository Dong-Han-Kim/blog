'use client';

import Image from 'next/image';
import clsx from 'clsx';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import ThemeButton from './ThemeButton';

function MobileNavContent() {
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
    <>
      <h3 className="text-xl font-extrabold">
        {theme === 'dark' ? (
          <Image
            src="/blog-text-white.png"
            alt="Blog Logo"
            width={100}
            height={80}
          />
        ) : (
          <Image
            src="/blog-logo-white.png"
            alt="Blog Logo"
            width={100}
            height={80}
          />
        )}
      </h3>
      <div className="flex items-center gap-15">
        <ThemeButton />
        <button>
          {theme === 'dark' ? (
            <Image src={'/menu-white.svg'} alt="Menu" width={30} height={30} />
          ) : (
            <Image src={'/menu.svg'} alt="Menu" width={30} height={30} />
          )}
        </button>
      </div>
    </>
  );
}

export default MobileNavContent;
