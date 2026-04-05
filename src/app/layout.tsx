import type { Metadata } from 'next';
import './globals.css';
import TopNav from '@/components/shared/TopNav';
import type { Viewport } from 'next';
import { ThemeProvider } from 'next-themes';
import 'prism-themes/themes/prism-material-dark.css';
import localFont from 'next/font/local';
import { Toaster } from '@/components/ui/sonner';
import { SearchCommand } from '@/components/search/SearchCommand';

const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
  weight: '100 900',
});

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
          <TopNav />
          <main className="max-w-7xl mx-auto w-full py-40">
            {children}
          </main>
          <SearchCommand />
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
