import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/shared/Nav';
import SideNav from '../components/shared/SideNav';

export const metadata: Metadata = {
  title: 'blog',
  description: 'This is my blog',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <header>
          <Nav />
        </header>
        <main className="flex max-w-7xl mx-auto w-full gap-20">
          <SideNav />
          {children}
        </main>
      </body>
    </html>
  );
}
