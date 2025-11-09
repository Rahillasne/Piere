/**
 * MultiViewport Component - Version Control Edition
 *
 * Displays a single CAD design in full-screen viewport.
 * Shows current version with clean, centered display like text-to-CAD.
 */

import { useBrainstorm } from '../contexts/BrainstormContext';
import { ViewportCell } from './ViewportCell';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface MultiViewportProps {
  className?: string;
  isGenerating?: boolean; // ✅ Track if AI is generating designs
}

export function MultiViewport({ className, isGenerating = false }: MultiViewportProps) {
  const { activeBranches } = useBrainstorm();

  // Version control mode: Show only the current version (activeBranches contains [latestVersion] or [])
  const currentBranch = activeBranches[0];

  return (
    <div className={cn('flex flex-col h-full bg-black', className)}>
      {/* Single Full-Screen Viewport - Matches text-to-CAD aesthetic */}
      <div className="flex-1 overflow-hidden">
        {!currentBranch ? (
          // ✅ FIX: Only show full-screen loading when no model exists yet
          // This prevents ViewportCell from unmounting during v1→v2 transitions
          isGenerating ? <GeneratingLoadingState /> : <EmptyViewportState />
        ) : (
          // ✅ FIX: Keep ViewportCell mounted during AI generation (prevents WebGL context loss)
          // Pass isGenerating to show overlay instead of unmounting
          <ViewportCell
            key="viewport-main"
            branch={currentBranch}
            index={0}
            isGenerating={isGenerating}
            className="h-full w-full"
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Loading State - Shown During AI Generation (10-30 seconds)
// ============================================================================

function GeneratingLoadingState() {
  return (
    <div className="flex items-center justify-center h-full bg-pierre-neutral-700">
      <div className="flex flex-col items-center justify-center">
        <div className="relative h-32 w-32">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-pierre-neutral-800 border-t-pierre-blue" />
          </div>
        </div>
        <p className="mt-4 text-base text-pierre-text-primary">
          Generating model
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.3 }}
          >
            .
          </motion.span>
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.3, repeatDelay: 0.3 }}
          >
            .
          </motion.span>
          <motion.span
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.6, repeatDelay: 0.3 }}
          >
            .
          </motion.span>
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Empty State - Figma Design
// ============================================================================

function EmptyViewportState() {
  return (
    <div className="flex items-center justify-center h-full">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-6 max-w-md px-8"
      >
        {/* Animated Icon with floating effect */}
        <motion.div
          className="relative"
          animate={{
            y: [0, -8, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-neutral-800 to-neutral-900 flex items-center justify-center shadow-2xl border border-neutral-700">
            <svg className="w-10 h-10 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
            </svg>
          </div>
          {/* Animated shadow */}
          <motion.div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-2 rounded-full bg-neutral-800/40 blur-md"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.4, 0.3],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </motion.div>

        {/* Text */}
        <div className="text-center space-y-3">
          <h3 className="text-white text-lg">Design Variations</h3>
          <p className="text-neutral-500 text-sm leading-relaxed">
            Your generated CAD designs will appear here as you brainstorm. Each variation will be saved for comparison and iteration.
          </p>
        </div>

        {/* Status indicator with animated dot */}
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-neutral-600"
            animate={{
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <span>Ready to generate</span>
        </div>
      </motion.div>
    </div>
  );
}
