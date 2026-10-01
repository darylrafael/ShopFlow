'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';

type AppNavProps = {
  user: { name: string } | null;
};

const links = [
  { href: '/schedule', label: 'Schedule' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/machines', label: 'Machines' },
  { href: '/products', label: 'Products' },
  { href: '/setup-matrix', label: 'Setup Matrix' },
];

export default function AppNav({ user }: AppNavProps) {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Main navigation">
      <Link href="/" className="nav-brand">ShopFlow</Link>
      {user && <div className="nav-links">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return <Link key={link.href} href={link.href} className={`nav-link ${active ? 'nav-link-active' : ''}`} aria-current={active ? 'page' : undefined}>{link.label}</Link>;
        })}
      </div>}
      <div className="nav-account">
        {user ? <><span className="nav-user" title={user.name}>{user.name}</span><LogoutButton /></> : <Link href="/login" className="nav-link">Sign in</Link>}
      </div>
    </nav>
  );
}
