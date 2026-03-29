import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/shared/Nav';
import SideNav from '../components/shared/SideNav';
import type { Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import 'prism-themes/themes/prism-material-dark.css';
import localFont from 'next/font/local';
import { Toaster } from '@/components/ui/sonner';

const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'blog92',
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
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={pretendard.className}>
        <ThemeProvider attribute="class" defaultTheme="system">
          <header>
            <Nav />
            <SideNav />
          </header>
          <main className="flex max-w-7xl mx-auto w-full gap-20 my-25">
            {children}
          </main>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
