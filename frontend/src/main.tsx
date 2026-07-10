import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, createRoute, createRootRoute, RouterProvider } from '@tanstack/react-router';
import './i18n';
import './styles.css';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { PartsPage } from './pages/PartsPage';
import { LocationsPage } from './pages/LocationsPage';
import { StockPage } from './pages/StockPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: PartsPage,
});

const partsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/parts',
  component: PartsPage,
});

const locationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/locations',
  component: LocationsPage,
});

const stockRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/stock',
  component: StockPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const routeTree = rootRoute.addChildren([indexRoute, partsRoute, locationsRoute, stockRoute, loginRoute]);

const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
