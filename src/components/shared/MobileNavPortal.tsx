import clsx from 'clsx';
import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface MobileNavPortalProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

function MobileNavPortal({ children, isOpen, onClose }: MobileNavPortalProps) {
  const portalClass = clsx(
    'w-full h-screen absolute top-0 left-0 z-98 transition-all duration-900 ease-in-out',
    `${isOpen ? 'bg-black/30 opacity-100' : 'bg-black/0 opacity-0 pointer-events-none'}`,
  );

  return createPortal(
    <div className={portalClass} onClick={onClose}>
      {children}
    </div>,
    document.body,
  );
}

export default MobileNavPortal;
