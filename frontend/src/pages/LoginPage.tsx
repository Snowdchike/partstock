import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, AppError } from '../lib/api';

export function LoginPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      // Register endpoint creates the user AND signs them in (sets the session
      // cookie). No second login round-trip — that race was causing the blank
      // page bug after sign-up.
      const result = await apiPost<{ user: { id: string; email: string; name: string; role: string } }>(
        mode === 'register' ? '/api/auth/register' : '/api/auth/login',
        mode === 'register' ? { email, name, password } : { email, password },
      );
      qc.setQueryData(['me'], { user: result.user });
      // Navigate FIRST. Invalidate ['me'] only after the route transition so the
      // browser has had a chance to persist the Set-Cookie. Invalidating
      // immediately races against the cookie store and the refetch comes back
      // 401, wiping our seeded cache and triggering the route guard to bounce
      // us back to /login (the "blank page" bug).
      await navigate({ to: '/parts' });
      void qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[auth submit] failed:', e);
      if (e instanceof AppError) {
        if (e.code === 'UNAUTHORIZED') setErr(t('auth.errors.invalid'));
        else if (e.code === 'VALIDATION_ERROR') {
          const detail = (e.details as Array<{ message?: string }> | undefined)?.[0]?.message;
          setErr(detail ?? t('auth.errors.weak'));
        } else if (e.code === 'CONFLICT') setErr(t('auth.errors.conflict'));
        else setErr(e.message);
      } else {
        setErr(t('auth.errors.generic'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-12 card">
      <h1 className="text-lg font-semibold mb-4">
        {mode === 'login' ? t('auth.login') : t('auth.register')}
      </h1>
      <form className="space-y-3" onSubmit={submit}>
        {mode === 'register' && (
          <div>
            <label className="label">{t('auth.name')}</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label className="label">{t('auth.email')}</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label">{t('auth.password')}</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? '...' : t('auth.submit')}
        </button>
      </form>
      <div className="mt-4 text-center text-sm">
        {mode === 'login' ? (
          <button type="button" className="text-accent hover:underline" onClick={() => setMode('register')}>
            {t('auth.switchToRegister')}
          </button>
        ) : (
          <button type="button" className="text-accent hover:underline" onClick={() => setMode('login')}>
            {t('auth.switchToLogin')}
          </button>
        )}
      </div>
    </div>
  );
}
