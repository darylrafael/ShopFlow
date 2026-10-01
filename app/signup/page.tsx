'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', organizationName: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create workspace');
      router.replace('/login?signup=check-email');
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : 'Unable to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-mark">S</div>
        <p className="eyebrow">Start your workspace</p>
        <h1>Plan production with ShopFlow</h1>
        <p className="auth-copy">Create an organization workspace for your machines, jobs, and schedules.</p>
        <form onSubmit={submit} className="auth-form">
          <label className="form-label" htmlFor="name">Your name</label>
          <input id="name" className="form-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <label className="form-label" htmlFor="organizationName">Organization name</label>
          <input id="organizationName" className="form-input" value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} required />
          <label className="form-label" htmlFor="email">Work email</label>
          <input id="email" className="form-input" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" className="form-input" type="password" autoComplete="new-password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <p className="password-hint">Use at least 12 characters.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>{loading ? 'Creating workspace...' : 'Create workspace'}</button>
        </form>
        <p className="auth-footnote">Already have an account? <Link href="/login" className="auth-link">Sign in</Link></p>
      </div>
    </main>
  );
}
