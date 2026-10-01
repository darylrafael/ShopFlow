import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (process.env['NODE_ENV'] !== 'production') return NextResponse.next();

  const pathname = request.nextUrl.pathname;
  const isPublic = pathname === '/login' || pathname === '/signup' || pathname === '/verify-email' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname.startsWith('/api/auth') || pathname === '/api/health' || pathname.startsWith('/_next') || pathname === '/favicon.ico';
  if (isPublic) return NextResponse.next();
  if (request.cookies.get('shopflow_session')?.value) return NextResponse.next();

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.png$).*)'],
};
