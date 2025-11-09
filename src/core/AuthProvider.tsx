import { useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { User as FirebaseUser, signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { supabase } from '@/lib/supabase';
import { auth, googleProvider } from '@/utils/firebase/client';
import { AuthContext } from './AuthContext';

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : 'http://127.0.0.1:54321/functions/v1';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Link Firebase user to Supabase using backend
  const linkFirebaseToSupabase = async (fbUser: FirebaseUser) => {
    try {
      console.log('🔗 Linking Firebase user to Supabase:', fbUser.email);

      // Get Firebase ID token
      const idToken = await fbUser.getIdToken();

      // Call backend auth-link function
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/auth-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || ''
        },
        body: JSON.stringify({ firebaseIdToken: idToken })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Auth link failed:', errorData);
        throw new Error(errorData.error || 'Authentication failed');
      }

      const { session: newSession, isNewUser } = await response.json();

      if (!newSession) {
        throw new Error('No session returned from auth-link');
      }

      // Set the session in Supabase client (this will auto-store in localStorage)
      const { data: { session: setSessionData }, error: setSessionError } = await supabase.auth.setSession({
        access_token: newSession.access_token,
        refresh_token: newSession.refresh_token
      });

      if (setSessionError) {
        console.error('❌ Error setting session:', setSessionError);
        throw setSessionError;
      }

      console.log(`✅ ${isNewUser ? 'New user created' : 'Existing user logged in'}:`, fbUser.email);

      // Don't set session/user here - let the Supabase auth listener handle it
      // This prevents duplicate state updates that can cause infinite loops

    } catch (error) {
      console.error('❌ Error linking Firebase to Supabase:', error);
      throw error;
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      setIsLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      // Firebase auth state listener will handle the rest
      console.log('✅ Google sign-in successful:', result.user.email);
    } catch (error) {
      console.error('❌ Google sign-in failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      // Sign out from Firebase
      await firebaseSignOut(auth);

      // Sign out from Supabase
      await supabase.auth.signOut();

      // Clear state
      setFirebaseUser(null);
      setSession(null);
      setUser(null);

      console.log('✅ Sign out successful');
    } catch (error) {
      console.error('❌ Sign out failed:', error);
      throw error;
    }
  };

  // Initialize auth state - check for existing sessions on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // First, try to restore Supabase session from localStorage
        const { data: { session: existingSession } } = await supabase.auth.getSession();

        if (existingSession) {
          console.log('✅ Restored Supabase session from storage');
          setSession(existingSession);
          setUser(existingSession.user);
        }
      } catch (error) {
        console.error('❌ Error restoring session:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        // User is signed in with Firebase
        console.log('🔥 Firebase user detected:', fbUser.email);
        setIsLoading(true);

        try {
          // Link Firebase user to Supabase (or restore existing link)
          await linkFirebaseToSupabase(fbUser);
        } catch (error) {
          console.error('❌ Failed to link Firebase to Supabase:', error);

          // IMPROVEMENT: Don't clear existing Supabase session if linking fails
          // Only clear if we're certain the session is invalid
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (!currentSession) {
            console.warn('⚠️ No valid Supabase session found, clearing state');
            setSession(null);
            setUser(null);
          } else {
            console.log('✅ Keeping existing Supabase session despite link failure');
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        // No Firebase user
        console.log('👤 No Firebase user detected');

        // Check if there's a standalone Supabase session (non-Firebase)
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (!currentSession) {
          // No session at all - user is logged out
          setSession(null);
          setUser(null);
        }

        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Supabase auth state listener - handles token refresh and session changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      console.log('🔄 Supabase auth event:', event);

      // Update local state when Supabase session changes
      // This handles automatic token refresh, sign out, etc.
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Demo mode: Auto-login disabled - SSO only shows when user clicks sign-in button
  // useEffect(() => {
  //   const isDemoMode = import.meta.env.VITE_DEMO_AUTO_LOGIN === 'true';

  //   if (isDemoMode && !isLoading && !firebaseUser && !session) {
  //     console.log('🎭 Demo mode: Auto-login enabled, triggering sign-in...');
  //     // Small delay to ensure everything is initialized
  //     const timer = setTimeout(() => {
  //       signInWithGoogle().catch((error) => {
  //         console.error('❌ Demo auto-login failed:', error);
  //       });
  //     }, 500);

  //     return () => clearTimeout(timer);
  //   }
  // }, [isLoading, firebaseUser, session]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        firebaseUser,
        accessToken: session?.access_token ?? null,
        signInWithGoogle,
        signOut,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
