import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/shared/Nav';
import SideNav from '../components/shared/SideNav';
import type { Viewport } from 'next';
import { ThemeProvider } from 'next-themes';

export const metadata: Metadata = {
  title: 'blog',
  description: 'This is my blog',
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
      <body>
        <ThemeProvider attribute="class" defaultTheme="system">
          <header>
            <Nav />
          </header>
          <main className="flex max-w-7xl mx-auto w-full gap-20 my-55">
            <SideNav />
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
