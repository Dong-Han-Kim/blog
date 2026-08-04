import type { Metadata, Viewport } from 'next';
import './globals.css';
import { galmuri11, galmuri14 } from '@/lib/fonts';
import { Toaster } from '@/components/ui/sonner';
import { SearchCommand } from '@/components/search/SearchCommand';
import { CrtOverlay } from '@/components/crt/CrtOverlay';
import { TerminalHeader } from '@/components/terminal/TerminalHeader';

// 페인트 전에 localStorage의 CRT off 상태를 <html data-crt>로 반영해
// SSR 플래시를 제거한다 (설계 §3.2). React 상태 아님 — 문자열 스크립트.
const CRT_INIT_SCRIPT = `try{if(localStorage.getItem('crt')==='off')document.documentElement.setAttribute('data-crt','off')}catch(e){}`;

export const metadata: Metadata = {
  title: 'b.log()',
  description: 'This is my blog',
  icons: {
    icon: '/favicon.ico',
  },
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#050705',
  width: 'device-width',
  initialScale: 1,
  // maximumScale/userScalable 제한은 접근성 감점 항목이라 제거 (설계 D14)
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      // data-crt 속성 주입 때문에 계속 필요 — next-themes 제거 후에도 유지 (설계 §3.2)
      suppressHydrationWarning
      className={`${galmuri11.variable} ${galmuri14.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: CRT_INIT_SCRIPT }} />
      </head>
      <body>
        <CrtOverlay />
        <div className="mx-auto max-w-[1120px] px-88 pt-72 pb-60 max-xl:px-56 max-md:px-22 max-md:pt-28 max-md:pb-36">
          <TerminalHeader />
          <main>{children}</main>
        </div>
        <SearchCommand />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
