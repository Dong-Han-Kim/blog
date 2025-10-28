'use client';

import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

interface MobileNavContentProps {
  onClick: () => void;
}

function MenuToggleBtn({ onClick }: MobileNavContentProps) {
  const { theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;
  return (
    <button type="button" onClick={onClick}>
      {theme === 'dark' ? (
        <Image src={'/menu-white.svg'} alt="Menu" width={30} height={30} />
      ) : (
        <Image src={'/menu.svg'} alt="Menu" width={30} height={30} />
      )}
    </button>
  );
}

export default MenuToggleBtn;
