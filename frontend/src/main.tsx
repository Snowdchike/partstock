import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  redirect,
} from '@tanstack/react-router';
import './i18n';
import './styles.css';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { PartsPage } from './pages/PartsPage';
import { LocationsPage } from './pages/LocationsPage';
import { StockPage } from './pages/StockPage';
import { BomsPage } from './pages/BomsPage';
import { BuildsPage } from './pages/BuildsPage';
import { LabelsPage } from './pages/LabelsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

// Auth check via TanStack Query cache: synchronous so route guards can use it.
function isAuthed(): boolean {
  const state = queryClient.getQueryData(['me']) as
    | { user: { id: string; email: string; name: string; role: string } }
    | null
    | undefined;
  return !!state?.user;
}

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    if (!isAuthed()) throw redirect({ to: '/login' });
  },
  component: PartsPage,
});

const partsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/parts',
  beforeLoad: () => {
    if (!isAuthed()) throw redirect({ to: '/login' });
  },
  component: PartsPage,
});

const locationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/locations',
  beforeLoad: () => {
    if (!isAuthed()) throw redirect({ to: '/login' });
  },
  component: LocationsPage,
});

const stockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stock',
  beforeLoad: () => {
    if (!isAuthed()) throw redirect({ to: '/login' });
  },
  component: StockPage,
});

const bomsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boms',
  beforeLoad: () => {
    if (!isAuthed()) throw redirect({ to: '/login' });
  },
  component: BomsPage,
});

const buildsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/builds',
  beforeLoad: () => {
    if (!isAuthed()) throw redirect({ to: '/login' });
  },
  component: BuildsPage,
});

const labelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/labels',
  beforeLoad: () => {
    if (!isAuthed()) throw redirect({ to: '/login' });
  },
  component: LabelsPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  partsRoute,
  locationsRoute,
  stockRoute,
  bomsRoute,
  buildsRoute,
  labelsRoute,
  loginRoute,
]);

const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('UI error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="card max-w-md text-center space-y-3">
            <h1 className="text-lg font-semibold text-red-400">Đã có lỗi</h1>
            <p className="text-sm text-zinc-300">{this.state.error.message}</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.href = '/login';
              }}
            >
              Về trang đăng nhập
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
