import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center">
      <Image
        src="/404.png"
        alt="잘못된 경로 접근"
        width={220}
        height={130}
        className="rounded-2xl"
      />
      <h2 className="my-15 font-extrabold">잘못된 경로로 접근하셨네요.</h2>
      <Link
        href="/"
        className="bg-bg-dark text-white dark:bg-bg-light dark:text-bg-dark p-10 rounded-md"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
