import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import App from '@/core/App.tsx';
import '@/index.css';
import { ErrorView } from '@/core/ErrorView.tsx';
import { PromptView } from '@/core/PromptView.tsx';
import { HistoryView } from '@/core/HistoryView.tsx';
import EditorView from '@/core/EditorView.tsx';
import { BrainstormView } from '@/features/brainstorm/views/BrainstormView.tsx';
import { BrainstormLayout } from '@/features/brainstorm/layout/BrainstormLayout.tsx';
import { LandingPage } from '@/pages/LandingPage.tsx';
import { LoginPage } from '@/pages/LoginPage.tsx';
import { PrivateRoute } from '@/components/PrivateRoute.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/core/AuthProvider.tsx';
import { Toaster } from '@/ui/toaster.tsx';
import { Toaster as SonnerToaster } from '@/components/ui/toaster.tsx';
import { TooltipProvider } from '@/ui/tooltip.tsx';

const queryClient = new QueryClient();

const router = createBrowserRouter(
  [
    // Public routes
    {
      path: '/',
      element: <LandingPage />,
      errorElement: <ErrorView />,
    },
    {
      path: '/login',
      element: <LoginPage />,
      errorElement: <ErrorView />,
    },
    // Protected app routes (with sidebar)
    {
      path: '/app',
      element: (
        <PrivateRoute>
          <App />
        </PrivateRoute>
      ),
      errorElement: <ErrorView />,
      children: [
        {
          path: '/app',
          element: <PromptView />,
          errorElement: <ErrorView />,
        },
        {
          path: '/app/editor/:id',
          element: <EditorView />,
          errorElement: <ErrorView />,
        },
        {
          path: '/app/history',
          errorElement: <ErrorView />,
          element: <HistoryView />,
        },
      ],
    },
    // Protected brainstorm routes (standalone layout, no sidebar)
    {
      path: '/brainstorm',
      element: (
        <PrivateRoute>
          <BrainstormLayout />
        </PrivateRoute>
      ),
      errorElement: <ErrorView />,
      children: [
        {
          path: '/brainstorm/:sessionId?',
          element: <BrainstormView />,
          errorElement: <ErrorView />,
        },
      ],
    },
    // Catch-all redirect
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future: { v7_relativeSplatPath: true } },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider delayDuration={0}>
          <Toaster />
          <SonnerToaster />
          <RouterProvider
            router={router}
            future={{ v7_startTransition: true }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
