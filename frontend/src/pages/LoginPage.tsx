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
      qc.setQueryData(['me'], { user: result.user });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await navigate({ to: '/parts' });
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
    <div className="max-w-md mx-auto mt-16">
      <h1 className="font-serif text-4xl tracking-tight mb-1">
        {mode === 'login' ? t('auth.login') : t('auth.register')}
      </h1>
      <p className="text-sm text-muted italic mb-8 font-serif">
        {mode === 'login'
          ? 'Quản lý kho linh kiện điện tử.'
          : 'Tạo tài khoản đầu tiên sẽ là quản trị viên.'}
      </p>

      <form className="space-y-5" onSubmit={submit}>
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
        {err && <div className="text-sm text-warn pt-1">{err}</div>}
        <div className="pt-3 flex items-center gap-4">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '...' : t('auth.submit')}
          </button>
          <button
            type="button"
            className="text-sm text-muted hover:text-ink transition"
            onClick={() => {
              setErr(null);
              setMode(mode === 'login' ? 'register' : 'login');
            }}
          >
            {mode === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>
        </div>
      </form>
    </div>
  );
}
