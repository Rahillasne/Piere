import { createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { User as FirebaseUser } from 'firebase/auth';

interface AuthContextType {
  // Supabase auth (for database operations)
  session: Session | null;
  user: User | null;

  // Firebase auth (for Google SSO)
  firebaseUser: FirebaseUser | null;

  // JWT token for demo purposes
  accessToken: string | null;

  // Auth methods
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;

  // Loading state
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
