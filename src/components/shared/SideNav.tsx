import Image from 'next/image';
import Link from 'next/link';
import ThemeButton from './ThemeButton';

function SideNav() {
  return (
    <aside className="hidden xl:flex flex-col items-start min-w-80">
      <h3 className="mb-15 rounded-sm overflow-hidden">
        <Link href="/">
          <Image src="/blog-logo.png" alt="Blog Logo" width={80} height={80} />
        </Link>
      </h3>
      <nav className="border-y-1 border-gray-400 border-solid py-15 w-full mb-15">
        <ul className="text-sm flex flex-col gap-5 items-start">
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/">All</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/html">HTML</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/css">CSS</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/javascript">JavaScript</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/typescript">TypeScript</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/react">React.js</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/nextjs">Next.js</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/state-management">상태관리</Link>
          </li>
          <li className="hover:line-through transition-all duration-500 ease-in-out">
            <Link href="/blog/projects">Projects</Link>
          </li>
        </ul>
      </nav>
      <ThemeButton />
    </aside>
  );
}

export default SideNav;
