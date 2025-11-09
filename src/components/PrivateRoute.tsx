import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/core/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

export function PrivateRoute({ children }: PrivateRouteProps) {
  const { firebaseUser, session, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !firebaseUser && !session) {
      // Save the current location so we can redirect back after login
      navigate('/login', { state: { from: location }, replace: true });
    }
  }, [isLoading, firebaseUser, session, navigate, location]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-pierre-bg-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // If not authenticated, show loading while redirect happens
  if (!firebaseUser && !session) {
    return (
      <div className="min-h-screen bg-pierre-bg-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
}
