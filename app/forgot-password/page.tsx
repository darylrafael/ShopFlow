'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setMessage('');
    try { const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to request recovery'); setMessage(result.message); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to request recovery'); } finally { setLoading(false); }
  };
  return <main className="auth-shell"><div className="auth-card"><div className="auth-mark">S</div><p className="eyebrow">Account recovery</p><h1>Reset your password</h1><p className="auth-copy">We will send a one-time recovery link to your work email.</p><form onSubmit={submit} className="auth-form"><label className="form-label" htmlFor="email">Work email</label><input id="email" className="form-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />{error && <div className="alert alert-error">{error}</div>}{message && <div className="alert alert-success">{message}</div>}<button className="btn btn-primary auth-submit" type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send recovery link'}</button></form><p className="auth-footnote"><Link href="/login" className="auth-link">Return to sign in</Link></p></div></main>;
}
