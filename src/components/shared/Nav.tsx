'use client';

import ThemeButton from './ThemeButton';
import ToggleMenu from './ToggleMenu';

function Nav() {
  return (
    <nav className="flex justify-between w-full items-center p-25 xl:hidden">
      <h3 className="text-xl font-extrabold">Hello World</h3>
      <div className="flex items-center gap-15">
        <ThemeButton />
        <ToggleMenu />
      </div>
    </nav>
  );
}

export default Nav;
