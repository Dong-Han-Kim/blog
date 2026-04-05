'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Menu, X } from 'lucide-react';
import { Default_Nav_items } from '@/constants/menu';
import { cn } from '@/lib/utils/cn';
import { SearchTrigger } from '@/components/search/SearchTrigger';
import ThemeButton from './ThemeButton';
import MobileNavPortal from './MobileNavPortal';
import MobileMenu from './MobileMenu';
import { usePostCategory } from '@/hooks/usePostCategory';

export default function TopNav() {
  const pathname = usePathname();
  const postCategory = usePostCategory();
  const { resolvedTheme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showPortal, setShowPortal] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setShowPortal(true);
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
      const timeout = setTimeout(() => setShowPortal(false), 500);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  function isActive(currentPath: string, path: string) {
    if (path === '/') return currentPath === '/' && !postCategory;
    if (postCategory && path === `/categories/${postCategory}`) return true;
    return currentPath === path || currentPath.startsWith(`${path}/`);
  }

  return (
    <nav className="w-full border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-16 md:px-24">
        {/* Desktop nav */}
        <div className="flex items-center justify-between h-64">
          {/* Logo */}
          <Link
            href="/"
            className="font-mono text-lg font-semibold tracking-tight text-foreground hover:opacity-70 transition-opacity"
          >
            b.log()
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-24">
            <ul className="flex items-center gap-20 text-sm">
              {Default_Nav_items.map(({ name, path, state }) => {
                if (!state) return null;
                const active = isActive(pathname, path);
                return (
                  <li key={name}>
                    <Link
                      href={path}
                      className={cn(
                        'relative py-20 text-muted-foreground hover:text-foreground transition-colors',
                        active && 'text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-foreground',
                      )}
                    >
                      {name}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center gap-8 ml-8 border-l border-gray-200 dark:border-gray-800 pl-16">
              <SearchTrigger />
              <ThemeButton />
            </div>
          </div>

          {/* Mobile controls */}
          <div className="flex md:hidden items-center gap-12">
            <SearchTrigger />
            <ThemeButton />
            {isMounted && (
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="p-4 text-foreground"
                aria-label="메뉴 열기"
              >
                <Menu className="w-24 h-24" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu portal */}
      {showPortal && (
        <MobileNavPortal isOpen={isOpen} onClose={() => setIsOpen(false)}>
          <MobileMenu isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
        </MobileNavPortal>
      )}
    </nav>
  );
}
