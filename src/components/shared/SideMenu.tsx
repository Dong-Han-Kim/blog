'use client';

import { Default_Nav_items } from '@/constants/menu';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';
import Image from 'next/image';

interface SideMenuProps {
  isOpen: boolean;
  onClick: () => void;
}

function SideMenu({ isOpen, onClick }: SideMenuProps) {
  const pathname = usePathname();

  const navWrapperClass = clsx(
    'w-250 h-screen bg-white dark:bg-stone-950 absolute right-0 transition-all duration-500 ease-out',
    `${isOpen ? 'translate-x-0' : 'translate-x-full'}`,
  );

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
              if (!state) return null;
              return (
                <li
                  key={name}
                  className={clsx(
                    `hover:line-through`,
                    `${pathname === path && 'line-through'}`,
                  )}
                >
                  <Link href={path}>{name}</Link>
                </li>
              );
            },
          )}
        </ul>
      </nav>
    </section>
  );
}

export default SideMenu;
