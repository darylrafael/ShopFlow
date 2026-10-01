'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in');
      router.replace('/schedule');
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-mark">S</div>
        <p className="eyebrow">ShopFlow Operations</p>
        <h1>Sign in to your workspace</h1>
        <p className="auth-copy">Plan production, manage jobs, and keep every machine aligned.</p>
        <form onSubmit={submit} className="auth-form">
          <label className="form-label" htmlFor="email">Work email</label>
          <input id="email" className="form-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" className="form-input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
        <p className="auth-footnote"><Link href="/forgot-password" className="auth-link">Forgot your password?</Link></p>
        <p className="auth-footnote">New to ShopFlow? <Link href="/signup" className="auth-link">Create a workspace</Link></p>
      </div>
    </main>
  );
}
