import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/api';
import { setLang } from '../i18n';

type Me = { user: { id: string; email: string; name: string; role: string } };

export function Layout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';

  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await apiGet<Me>('/api/auth/me');
      } catch (e) {
        if (e instanceof Error && 'status' in e && (e as { status: number }).status === 401) {
          return null;
        }
        throw e;
      }
    },
  });

  const logout = async () => {
    try {
      await apiPost('/api/auth/logout');
    } catch {
      // ignore — server may have already expired the session
    }
    qc.clear();
    qc.setQueryData(['me'], null);
    await navigate({ to: '/login' });
  };

  const isAuthed = !!meQ.data;
  const isLoginPage = path === '/login';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="font-semibold text-lg">
            {t('app.title')}
          </Link>
          <span className="text-xs text-zinc-500 hidden md:inline">{t('app.tagline')}</span>
          <nav className="flex items-center gap-1 ml-4">
            {isAuthed && !isLoginPage && (
              <>
                <NavLink to="/parts" label={t('nav.parts')} active={path.startsWith('/parts')} />
                <NavLink to="/locations" label={t('nav.locations')} active={path.startsWith('/locations')} />
                <NavLink to="/stock" label={t('nav.stock')} active={path.startsWith('/stock')} />
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <select
              aria-label={t('app.language')}
              className="input w-auto py-1 text-xs"
              value={i18n.language}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
            {isAuthed && (
              <>
                <span className="text-xs text-zinc-400 hidden sm:inline">{meQ.data?.user.name}</span>
                <button type="button" className="btn-ghost text-xs" onClick={logout}>
                  {t('app.logout')}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-border py-3 text-center text-xs text-zinc-500">
        MIT · self-hosted · your data, your server
      </footer>
    </div>
  );
}

function NavLink({ to, label, active }: { to: '/parts' | '/locations' | '/stock'; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-md text-sm transition ${
        active ? 'bg-accent/15 text-accent' : 'text-zinc-300 hover:bg-surface'
      }`}
    >
      {label}
    </Link>
  );
}
