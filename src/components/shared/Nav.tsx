import Image from 'next/image';

function Nav() {
  return (
    <nav className="flex justify-between w-full items-center p-25 mb-55">
      <h3 className="text-xl font-extrabold">Hello World</h3>{' '}
      <button>
        <Image src={'/menu.svg'} alt="Menu" width={30} height={30} />
      </button>
    </nav>
  );
}

export default Nav;
