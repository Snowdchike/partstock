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
      // ignore
    }
    qc.clear();
    qc.setQueryData(['me'], null);
    await navigate({ to: '/login' });
  };

  const isAuthed = !!meQ.data;
  const isLoginPage = path === '/login';

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-ink">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-baseline gap-8">
          <Link to="/" className="font-serif text-2xl tracking-tight">
            PartStock
          </Link>
          <nav className="flex items-baseline gap-6 text-sm">
            {isAuthed && !isLoginPage && (
              <>
                <NavLink to="/parts" label={t('nav.parts')} active={path.startsWith('/parts')} />
                <NavLink
                  to="/locations"
                  label={t('nav.locations')}
                  active={path.startsWith('/locations')}
                />
                <NavLink to="/stock" label={t('nav.stock')} active={path.startsWith('/stock')} />
              </>
            )}
          </nav>
          <div className="ml-auto flex items-baseline gap-4 text-sm">
            <select
              aria-label={t('app.language')}
              className="bg-transparent text-xs text-muted border-0 focus:outline-none cursor-pointer"
              value={i18n.language}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="vi">VI</option>
              <option value="en">EN</option>
            </select>
            {isAuthed && (
              <>
                <span className="text-muted hidden sm:inline">{meQ.data?.user.name}</span>
                <button
                  type="button"
                  className="text-muted hover:text-ink transition"
                  onClick={logout}
                >
                  {t('app.logout')}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({
  to,
  label,
  active,
}: {
  to: '/parts' | '/locations' | '/stock';
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`pb-0.5 border-b-2 transition ${
        active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {label}
    </Link>
  );
}
