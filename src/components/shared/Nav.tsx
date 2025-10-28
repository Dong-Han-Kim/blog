import MobileNavContent from './MobileNavContent';

function Nav() {
  return (
    <nav className="flex justify-between w-full items-center p-25 xl:hidden">
      <MobileNavContent />
    </nav>
  );
}

export default Nav;
