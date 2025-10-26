import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

function ToggleMenu() {
  const { theme } = useTheme();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;
  return (
    <button>
      {theme === 'dark' ? (
        <Image src={'/menu-white.svg'} alt="Menu" width={30} height={30} />
      ) : (
        <Image src={'/menu.svg'} alt="Menu" width={30} height={30} />
      )}
    </button>
  );
}

export default ToggleMenu;
