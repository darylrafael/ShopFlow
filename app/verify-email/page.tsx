'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Suspense } from 'react';

function VerifyEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState('Verifying your email address...');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setError('This verification link is missing its token.'); setMessage(''); return; }
    fetch('/api/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to verify email'); return result; })
      .then(() => { setMessage('Email verified. Redirecting to your workspace...'); setTimeout(() => { router.replace('/schedule'); router.refresh(); }, 700); })
      .catch((verificationError: unknown) => { setMessage(''); setError(verificationError instanceof Error ? verificationError.message : 'Unable to verify email'); });
  }, [params, router]);

  return <main className="auth-shell"><div className="auth-card"><div className="auth-mark">S</div><p className="eyebrow">ShopFlow account</p><h1>{error ? 'Verification failed' : 'Verify your email'}</h1>{message && <p className="auth-copy">{message}</p>}{error && <div className="alert alert-error">{error}</div>}<p className="auth-footnote"><Link href="/login" className="auth-link">Return to sign in</Link></p></div></main>;
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="auth-shell"><div className="auth-card"><p className="auth-copy">Loading verification...</p></div></main>}><VerifyEmailContent /></Suspense>;
}
