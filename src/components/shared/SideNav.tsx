'use client';

import Image from 'next/image';
import Link from 'next/link';
import ThemeButton from './ThemeButton';
import { usePathname } from 'next/navigation';
import { Default_Nav_items } from '@/constants/menu';
import { cn } from '@/lib/utils/cn';
import { SearchTrigger } from '@/components/search/SearchTrigger';

function SideNav() {
  const pathname = usePathname();

  function isActive(pathname: string, path: string) {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  return (
    <header className="flex flex-col items-center min-w-90 py-15">
      <h3 className="mb-15 rounded-sm overflow-hidden">
        <Link href="/">
          <Image
            src="/blog-logo-black.png"
            alt="Blog Logo"
            width={90}
            height={90}
          />
        </Link>
      </h3>
      <nav className="flex justify-center items-center border-y-1 border-gray-400 border-solid py-15 w-full mb-15 mx-auto max-w-7xl">
        <ul className="text-sm flex gap-7 items-center">
          {Default_Nav_items.map(
            ({
              name,
              path,
              state,
            }: {
              name: string;
              path: string;
              state: boolean;
            }) => {
              const active = isActive(pathname, path);
              if (!state) return null;
              return (
                <li
                  key={name}
                  className={cn(
                    `hover:line-through decoration-7 decoration-yellow-300/30`,
                    active &&
                      'line-through decoration-7 decoration-yellow-300/30',
                  )}
                >
                  <Link href={path}>{name}</Link>
                </li>
              );
            },
          )}
        </ul>
      </nav>
      <SearchTrigger />
      {/* <ThemeButton /> */}
    </header>
  );
}

export default SideNav;
