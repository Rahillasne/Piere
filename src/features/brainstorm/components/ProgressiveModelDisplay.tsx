/**
 * ProgressiveModelDisplay Component
 *
 * Matches text-to-CAD OpenSCADViewer rendering pattern EXACTLY:
 * - Direct blob → geometry parsing
 * - Component stays mounted during v1 → v2 → v3 transitions
 * - Geometry updates in-place (no remounting, no WebGL context loss)
 * - Same persistent WebGL context as text-to-CAD
 */

import { useEffect, useState } from 'react';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { BufferGeometry } from 'three';
import { ThreeScene } from '@/features/viewer/ThreeScene';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BranchWithModel } from '../contexts/BrainstormContext';

interface ProgressiveModelDisplayProps {
  branch: BranchWithModel;
  className?: string;
}

export function ProgressiveModelDisplay({
  branch,
  className,
}: ProgressiveModelDisplayProps) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);

  // Match OpenSCADViewer: Simple blob → geometry conversion
  // No refs, no complex cleanup - just like text-to-CAD
  useEffect(() => {
    console.log(`[ProgressiveModelDisplay] Branch update:`, {
      hasBlob: !!branch.modelBlob,
      version: branch.version_number,
      isCompiling: branch.isCompiling,
      hasError: !!branch.compilationError,
    });

    if (branch.modelBlob && branch.modelBlob instanceof Blob) {
      console.log(`[ProgressiveModelDisplay] ✅ Loading v${branch.version_number} (${branch.modelBlob.size} bytes)`);

      branch.modelBlob.arrayBuffer().then((buffer) => {
        const loader = new STLLoader();
        const geom = loader.parse(buffer);
        geom.center();
        geom.computeVertexNormals();
        console.log(`[ProgressiveModelDisplay] 🎉 v${branch.version_number} rendered (${geom.attributes.position.count} vertices)`);
        setGeometry(geom);
      }).catch((err) => {
        console.error('[ProgressiveModelDisplay] ❌ STL parse error:', err);
        setGeometry(null);
      });
    } else {
      console.log('[ProgressiveModelDisplay] No blob, clearing geometry');
      setGeometry(null);
    }
  }, [branch.modelBlob, branch.version_number, branch.isCompiling, branch.compilationError]);

  // Match OpenSCADViewer: Simple conditional rendering
  return (
    <div className={cn('relative h-full w-full bg-black', className)}>
      {/* Primary content: Show 3D geometry when available */}
      {geometry ? (
        <div className="h-full w-full">
          <ThreeScene geometry={geometry} />
        </div>
      ) : null}

      {/* Error overlay - shown on top of geometry (if previous version exists) */}
      {branch.compilationError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-500/10 backdrop-blur-sm z-20">
          <div className="bg-red-500/90 text-white p-4 rounded-lg max-w-md">
            <p className="text-sm font-medium mb-2">Compilation Failed</p>
            <p className="text-xs opacity-90">{branch.compilationError}</p>
          </div>
        </div>
      )}

      {/* Loading overlay - matches OpenSCADViewer styling */}
      {branch.isCompiling && (
        <div className="absolute inset-0 flex items-center justify-center bg-pierre-neutral-700/30 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-pierre-blue" />
            <p className="text-xs font-medium text-pierre-text-primary/70">
              Compiling...
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

