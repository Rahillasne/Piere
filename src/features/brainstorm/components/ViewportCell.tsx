/**
 * ViewportCell Component - Clean Version Control Edition
 *
 * Minimal viewport showing a single CAD model with version badge.
 * Matches text-to-CAD's clean OpenSCADViewer aesthetic.
 */

import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { Progress } from '@/ui/progress';
import { cn } from '@/lib/utils';
import { Download, FileCode } from 'lucide-react';
import { downloadSTLFile, downloadOpenSCADFile } from '@/utils/downloadUtils';
import { type BranchWithModel } from '../contexts/BrainstormContext';
import { ProgressiveModelDisplay } from './ProgressiveModelDisplay';

interface ViewportCellProps {
  branch: BranchWithModel;
  index: number;
  className?: string;
  isGenerating?: boolean; // ✅ Track AI generation phase (before WASM compilation)
}

export function ViewportCell({ branch, index, className, isGenerating = false }: ViewportCellProps) {
  // Determine display state
  const getDisplayState = () => {
    if (branch.compilationError) return 'error';
    if (branch.isCompiling) return 'compiling';
    if (branch.modelBlob) return 'complete';
    return 'idle';
  };

  const displayState = getDisplayState();

  // Get version number (use version_number if available, fallback to index + 1)
  const versionNumber = branch.version_number ?? index + 1;

  // Download handlers
  const handleDownloadSTL = () => {
    if (branch.modelBlob) {
      downloadSTLFile(branch.modelBlob);
    }
  };

  const handleDownloadSCAD = () => {
    if (branch.openscad_code) {
      downloadOpenSCADFile(branch.openscad_code);
    }
  };

  // Check if downloads are available
  const canDownloadSTL = !!branch.modelBlob && !branch.isCompiling;
  const canDownloadSCAD = !!branch.openscad_code;

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-black',
        className
      )}
    >
      {/* Version Badge & Download Buttons - Top-right corner */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Badge
          variant="secondary"
          className="bg-black/60 backdrop-blur-sm border border-white/10 text-white/90 px-2 py-1 text-xs font-medium"
        >
          v{versionNumber}
        </Badge>

        {/* Download Buttons */}
        <div className="flex items-center gap-1">
          {/* Download SCAD Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-black/60 backdrop-blur-sm border border-white/10 hover:bg-white/10 text-white/90"
            onClick={handleDownloadSCAD}
            disabled={!canDownloadSCAD}
            title="Download OpenSCAD file"
          >
            <FileCode className="h-3.5 w-3.5" />
          </Button>

          {/* Download STL Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-black/60 backdrop-blur-sm border border-white/10 hover:bg-white/10 text-white/90"
            onClick={handleDownloadSTL}
            disabled={!canDownloadSTL}
            title="Download STL file"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Compilation Progress Bar - Bottom, minimal */}
      {branch.isCompiling && branch.compilationProgress !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-black/60 backdrop-blur-sm p-3">
          <Progress value={branch.compilationProgress} className="h-1 mb-2" />
          <p className="text-xs text-white/70 text-center">
            Compiling... {Math.round(branch.compilationProgress)}%
          </p>
        </div>
      )}

      {/* Model Display - Full viewport */}
      <div className="h-full w-full">
        {/* Match text-to-CAD: Stable component, geometry updates in-place
            - v1 compiles → Component mounts, geometry updates
            - v2 compiling → Same component, shows v1 geometry + loading overlay
            - v2 succeeds → Same component, geometry updates to v2
            - No remounting = persistent WebGL context = no crashes */}
        <ProgressiveModelDisplay
          key="viewport-display"
          branch={branch}
        />
      </div>

      {/* ✅ FIX: AI Generation Overlay - Shown during AI code generation (prevents unmount) */}
      {isGenerating && !branch.isCompiling && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <p className="text-sm font-medium text-white">
              Creating v{versionNumber + 1}...
            </p>
          </div>
        </div>
      )}

      {/* Error Message - Bottom overlay */}
      {branch.compilationError && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-500/90 text-white p-4 z-10">
          <p className="text-sm font-medium mb-1">Compilation Failed</p>
          <p className="text-xs opacity-90">{branch.compilationError}</p>
        </div>
      )}
    </div>
  );
}
