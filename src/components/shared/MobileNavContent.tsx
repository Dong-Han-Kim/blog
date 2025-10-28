'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import ThemeButton from './ThemeButton';
import MobileNavPortal from './MobileNavPortal';
import MobileMenu from './MobileMenu';
import MenuToggleBtn from './MenuToggleBtn';
import Link from 'next/link';

function MobileNavContent() {
  const { theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
  }, [isOpen]);

  if (!isMounted) return null;
  return (
    <>
      <h3>
        <Link href="/">
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
        </Link>
      </h3>
      <div className="flex items-center gap-15">
        <ThemeButton />
        <MenuToggleBtn onClick={() => setIsOpen(!isOpen)} />
      </div>

      <MobileNavPortal isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <MobileMenu isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
      </MobileNavPortal>
    </>
  );
}

export default MobileNavContent;
