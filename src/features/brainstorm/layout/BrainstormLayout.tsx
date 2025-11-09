import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { useAuth } from '@/core/AuthContext';
import { Button } from '@/ui/button';
import { ErrorBoundary } from '@/core/ErrorBoundary';

/**
 * BrainstormLayout - Standalone layout for voice brainstorm mode
 *
 * This layout is independent from the main app layout (no sidebar),
 * providing a clean, immersive experience for voice-driven CAD brainstorming.
 */
export function BrainstormLayout() {
  const { isLoading } = useAuth();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pierre-bg-secondary-dark">
        <Loader2 className="h-8 w-8 animate-spin text-pierre-blue" />
      </div>
    );
  }

  return (
    <div className="h-dvh overflow-hidden bg-gradient-to-br from-pierre-bg-dark via-pierre-bg-secondary-dark to-pierre-bg-dark">
      {isMobile ? (
        <div className="flex h-dvh w-full items-center justify-center bg-pierre-bg-dark text-pierre-text-primary">
          Please use a desktop browser to access Voice Brainstorm mode.
        </div>
      ) : (
        <div className="flex h-dvh flex-col">
          {/* Header - Figma design: Clean navigation bar with user avatar */}
          <header className="relative z-10 flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-4 py-3.5 h-14 flex-shrink-0">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/app')}
                className="gap-2 text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Exit Brainstorm
              </Button>
              <div className="h-6 w-px bg-neutral-700" />
              <h1 className="text-white">Voice Brainstorm</h1>
            </div>

            {/* User Avatar - Figma design */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                P
              </div>
            </div>
          </header>

          {/* Main content area - Full height, no sidebar */}
          <div className="relative flex-1 overflow-hidden">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}
