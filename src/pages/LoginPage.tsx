import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '@/core/AuthContext';
import { toast } from 'sonner';
import { AnimatedCube } from '@/components/AnimatedCube';
import { FloatingGrid } from '@/components/FloatingGrid';
import { Button } from '@/ui/button';

export function LoginPage() {
  const navigate = useNavigate();
  const { signInWithGoogle, firebaseUser, session, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Redirect to app if already authenticated
  useEffect(() => {
    if (!authLoading && (firebaseUser || session)) {
      navigate('/app', { replace: true });
    }
  }, [authLoading, firebaseUser, session, navigate]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      toast.success('Successfully signed in!');
      // Navigation will be handled automatically by the useEffect above
    } catch (error: any) {
      console.error('Google login error:', error);

      // Handle specific Firebase errors
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Sign-in cancelled');
      } else if (error.code === 'auth/popup-blocked') {
        toast.error('Popup blocked. Please allow popups for this site.');
      } else {
        toast.error('Failed to sign in with Google. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="dark min-h-screen relative overflow-hidden flex items-center justify-center">
        <FloatingGrid />
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* Background layers */}
      <FloatingGrid />
      <AnimatedCube />

      {/* Vignette effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, oklch(0.15 0.08 296) 100%)'
        }}
      />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-16"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-6"
        >
          {/* Geometric logo icon */}
          <motion.div
            animate={{
              rotateY: [0, 360],
              rotateX: [0, 15, 0]
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear"
            }}
            className="relative"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div className="w-20 h-20 relative">
              {/* Multiple layered squares creating depth */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="absolute inset-0 border-2 rounded-lg"
                  style={{
                    borderColor: `oklch(${0.656 - i * 0.1} ${0.243 - i * 0.05} 296 / ${0.8 - i * 0.15})`,
                    transform: `translateZ(${i * 8}px) scale(${1 - i * 0.1})`,
                    transformStyle: 'preserve-3d'
                  }}
                />
              ))}
            </div>
          </motion.div>

          {/* Brand name */}
          <motion.h1
            initial={{ opacity: 0, letterSpacing: '0.5em' }}
            animate={{ opacity: 1, letterSpacing: '0.2em' }}
            transition={{ duration: 1, delay: 0.4 }}
            className="text-6xl tracking-[0.2em] uppercase"
            style={{
              background: 'linear-gradient(135deg, oklch(0.985 0.01 296) 0%, oklch(0.656 0.243 296) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: 300
            }}
          >
            Pierre
          </motion.h1>

          {/* Minimal tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-muted-foreground tracking-widest uppercase text-sm"
          >
            Voice → CAD
          </motion.p>
        </motion.div>

        {/* SSO Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="flex flex-col items-center gap-4"
        >
          <Button
            onClick={handleGoogleSignIn}
            disabled={isLoading || authLoading}
            size="lg"
            className="group relative overflow-hidden px-8 py-6 rounded-full bg-primary text-black hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20"
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{
                x: ['-200%', '200%']
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear"
              }}
            />
            <span className="relative flex items-center gap-3">
              {isLoading || authLoading ? (
                <div className="w-5 h-5 border-2 border-current/20 border-t-current rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              <span className="tracking-wide">
                {isLoading || authLoading ? 'Signing in...' : 'Continue with Google'}
              </span>
            </span>
          </Button>

          {/* Subtle hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="text-xs text-muted-foreground/50 tracking-wider"
          >
            SINGLE SIGN-ON
          </motion.p>
        </motion.div>

        {/* Decorative bottom element */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.2, delay: 1.2 }}
          className="h-px w-64 bg-gradient-to-r from-transparent via-muted-foreground/20 to-transparent"
        />
      </motion.div>

      {/* Corner accent lines */}
      <div className="absolute top-0 left-0 w-32 h-32 border-l-2 border-t-2 border-muted-foreground/10" />
      <div className="absolute bottom-0 right-0 w-32 h-32 border-r-2 border-b-2 border-muted-foreground/10" />
    </div>
  );
}
