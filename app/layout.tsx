import type { Metadata } from 'next';
import './globals.css';
import { getAuthenticatedUser } from '@/lib/auth/session';
import AppNav from '@/components/AppNav';

export const metadata: Metadata = {
  title: 'ShopFlow | Production Planning',
  description: 'Production scheduling system for HMLV CNC job shops',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthenticatedUser();
  return (
    <html lang="en">
      <body>
        <AppNav user={user ? { name: user.name } : null} />
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
