function SideNav() {
  return (
    <aside className="flex flex-col items-start">
      <h3 className="font-bold text-5xl mb-30">Blog.</h3>
      <nav className="border-y-1 border-gray-400 border-solid py-15 w-full">
        <ul className="text-sm flex flex-col gap-5 items-start">
          <li>All</li>
          <li>HTML</li>
          <li>CSS</li>
          <li>JavaScript</li>
          <li>TypeScript</li>
          <li>React.js</li>
          <li>Next.js</li>
          <li>상태관리</li>
          <li>Projects</li>
        </ul>
      </nav>
    </aside>
  );
}

export default SideNav;
