'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ResetPasswordForm() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setLoading(true); setError(''); setMessage(''); try { const response = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to reset password'); setMessage(result.message); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to reset password'); } finally { setLoading(false); } };
  return <main className="auth-shell"><div className="auth-card"><div className="auth-mark">S</div><p className="eyebrow">Account recovery</p><h1>Choose a new password</h1><p className="auth-copy">Use at least 12 characters. Recovery links expire after one hour.</p><form onSubmit={submit} className="auth-form"><label className="form-label" htmlFor="password">New password</label><input id="password" className="form-input" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <div className="alert alert-error">{error}</div>}{message && <div className="alert alert-success">{message}</div>}<button className="btn btn-primary auth-submit" type="submit" disabled={loading || !token}>{loading ? 'Updating...' : 'Update password'}</button></form><p className="auth-footnote"><Link href="/login" className="auth-link">Return to sign in</Link></p></div></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-shell"><div className="auth-card"><p className="auth-copy">Loading recovery form...</p></div></main>}><ResetPasswordForm /></Suspense>;
}
