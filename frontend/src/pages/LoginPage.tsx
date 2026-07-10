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
      if (mode === 'register') {
        await apiPost('/api/auth/register', { email, name, password });
      }
      const result = await apiPost<{ user: { id: string; email: string; name: string; role: string } }>(
        '/api/auth/login',
        { email, password },
      );
      // Seed the ['me'] cache so route guards see us as authed immediately.
      qc.setQueryData(['me'], { user: result.user });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await navigate({ to: '/parts' });
    } catch (e) {
      if (e instanceof AppError) {
        if (e.code === 'UNAUTHORIZED') setErr(t('auth.errors.invalid'));
        else if (e.code === 'VALIDATION_ERROR') setErr(t('auth.errors.weak'));
        else if (e.code === 'CONFLICT') setErr('Email đã được đăng ký');
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
            minLength={12}
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
