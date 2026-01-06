'use client';

import { Default_Nav_items } from '@/constants/menu';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

interface MobileMenuProps {
  isOpen: boolean;
  onClick: () => void;
}

function MobileMenu({ isOpen, onClick }: MobileMenuProps) {
  const pathname = usePathname();

  const navWrapperClass = cn(
    'w-250 h-screen bg-white dark:bg-stone-950 absolute right-0 transition-all duration-500 ease-out',
    `${isOpen ? 'translate-x-0' : 'translate-x-full'}`,
  );

  function isActive(pathname: string, path: string) {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  }

  return (
    <section className={navWrapperClass}>
      <button onClick={onClick}>
        <Image src="/icons/x.svg" alt="메뉴 닫기" width={30} height={30} />
      </button>
      <nav className="py-15 w-full mb-15">
        <ul className="text-sm flex flex-col gap-15 items-center">
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
                <li key={name}>
                  <Link
                    href={path}
                    className={cn(
                      `hover:line-through decoration-7 decoration-yellow-300/30`,
                      active &&
                        'line-through decoration-7 decoration-yellow-300/30',
                    )}
                  >
                    {name}
                  </Link>
                </li>
              );
            },
          )}
        </ul>
      </nav>
    </section>
  );
}

export default MobileMenu;
