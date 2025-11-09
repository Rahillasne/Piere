/**
 * useParallelCompilation Hook
 *
 * Compiles multiple OpenSCAD models simultaneously using Web Workers.
 * Tracks progress for each compilation and updates the brainstorm context.
 */

import { useCallback, useRef } from 'react';
import { useBrainstorm } from '../contexts/BrainstormContext';
import type { BrainstormVariation } from '@/services/brainstormService';
import { WorkerMessage, WorkerMessageType } from '@/workers/types';
import { logger } from '@/utils/logger';

interface CompilationResult {
  branchId: string;
  blob?: Blob;
  error?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const MAX_COMPILATION_RETRIES = 3;

/**
 * Call backend regeneration endpoint to fix failed code
 */
async function regenerateCode(params: {
  originalCode: string;
  errorMessage: string;
  stderrOutput?: string[];
}): Promise<string | null> {
  try {
    console.log('[Regeneration] Requesting code fix from backend...');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/brainstorm-regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        original_code: params.originalCode,
        error_message: params.errorMessage,
        stderr_output: params.stderrOutput || [],
      }),
    });

    if (!response.ok) {
      console.error('[Regeneration] Failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    console.log('[Regeneration] Successfully received fixed code');
    return data.code;
  } catch (error) {
    console.error('[Regeneration] Error calling endpoint:', error);
    return null;
  }
}

/**
 * Worker manager for compilations - ALWAYS CREATES FRESH WORKER.
 *
 * FIXED: The original approach of reusing workers caused WASM state corruption.
 * Second compilation would always crash with "WASM crashed unexpectedly".
 *
 * ROOT CAUSE: WASM memory/state becomes corrupted after first compilation.
 * When reused, the corrupted state causes crashes on second request.
 *
 * SOLUTION: Always terminate previous worker and create fresh instance.
 * Trade-off: Slightly slower (~50ms WASM init) but 100% reliable (no crashes).
 */
class SingleWorkerManager {
  private worker: Worker | null = null;

  /**
   * Get a FRESH worker instance (terminates previous worker if exists)
   */
  getWorker(): Worker {
    // Always terminate previous worker to ensure clean WASM state
    if (this.worker) {
      console.log('🔧 [SingleWorkerManager] Terminating previous worker for fresh WASM');
      try {
        this.worker.terminate();
      } catch (err) {
        console.warn('[SingleWorkerManager] Failed to terminate previous worker:', err);
      }
      this.worker = null;
    }

    console.log('🔧 [SingleWorkerManager] Creating fresh worker with clean WASM state');
    this.worker = new Worker('/src/workers/worker.ts', { type: 'module' });
    return this.worker;
  }

  /**
   * Terminate the worker (used for cleanup/reset)
   */
  terminateAll() {
    if (this.worker) {
      try {
        console.log('🔧 [SingleWorkerManager] Terminating worker');
        this.worker.terminate();
      } catch (err) {
        console.warn('[SingleWorkerManager] Failed to terminate worker:', err);
      }
      this.worker = null;
    }
  }
}

/**
 * Hook for compilation using single persistent worker (like text-to-CAD)
 */
export function useParallelCompilation() {
  const { updateBranch } = useBrainstorm();
  const managerRef = useRef<SingleWorkerManager | null>(null);

  // Initialize manager on first use
  if (!managerRef.current) {
    managerRef.current = new SingleWorkerManager();
  }

  /**
   * Compile a single branch with automatic retry on failure
   * @param branchId - Branch identifier
   * @param code - OpenSCAD code to compile
   * @param retryAttempt - Current retry attempt (1-based)
   * @param originalCode - Original code before any regeneration (for retry context)
   */
  const compileBranch = useCallback(
    (branchId: string, code: string, retryAttempt = 1, originalCode?: string): Promise<CompilationResult> => {
      return new Promise(async (resolve, reject) => {
        // 🔍 DIAGNOSTIC: Log compilation start with retry info
        console.log(`🔧 [useParallelCompilation] Starting compilation for branch: ${branchId} (Attempt ${retryAttempt}/${MAX_COMPILATION_RETRIES})`);
        console.log(`🔧 [useParallelCompilation] Code length: ${code.length}`);

        const worker = managerRef.current!.getWorker();
        let cleanupCalled = false; // ✅ Track if cleanup was already called
        let timeoutId: NodeJS.Timeout | null = null;

        // 🔍 DIAGNOSTIC: Capture branch ID at start for validation
        const startBranchId = branchId;

        // Set initial state
        console.log(`🔧 [useParallelCompilation] Setting isCompiling=true for branch: ${branchId}`);
        updateBranch(branchId, {
          isCompiling: true,
          compilationProgress: 0,
          compilationError: undefined,
        });

        // ✅ REAL TIMEOUT: Kill worker if compilation exceeds 30 seconds
        const COMPILATION_TIMEOUT_MS = 30000;
        timeoutId = setTimeout(() => {
          logger.error('Compilation', `Timeout after ${COMPILATION_TIMEOUT_MS}ms for branch ${branchId}`);

          updateBranch(branchId, {
            isCompiling: false,
            compilationProgress: 0,
            compilationError: 'Compilation timed out after 30 seconds. The design may be too complex.',
          });

          cleanup();

          // Note: Single worker persists even after timeout - will be reused for next compilation
          // This matches text-to-CAD behavior and maintains WASM instance persistence

          reject(new Error('Compilation timed out after 30 seconds. The design may be too complex.'));
        }, COMPILATION_TIMEOUT_MS);

        // ✅ CLEANUP: Remove event listeners (worker persists for reuse)
        const cleanup = () => {
          if (cleanupCalled) return; // Prevent double cleanup
          cleanupCalled = true;

          // Clear timeout
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          try {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            // Worker persists - will be reused for next compilation (like text-to-CAD)
          } catch (err) {
            console.warn(`Failed to cleanup listeners for branch ${branchId}:`, err);
          }
        };

        // Handle messages from worker
        const handleMessage = async (e: MessageEvent) => {
          try {
            // Worker sends back: { err?: Error, data: OpenSCADWorkerResponseData }
            if (e.data.err) {
              // Compilation failed - Enhanced error logging
              logger.error('Compilation', e.data.err.message || 'Compilation failed');

              // 🔍 DIAGNOSTIC: Log detailed error information for OpenSCAD failures
              if (e.data.err.name === 'OpenSCADError') {
                console.group('🔍 [OpenSCAD Compilation Error Details]');
                console.error('Branch ID:', branchId);
                console.error('Error Message:', e.data.err.message);

                // Show stderr output with better handling for empty arrays
                if (e.data.err.stdErr && Array.isArray(e.data.err.stdErr)) {
                  if (e.data.err.stdErr.length > 0) {
                    console.error('OpenSCAD stderr output:');
                    e.data.err.stdErr.forEach((line: string, i: number) => {
                      console.error(`  ${i + 1}: ${line}`);
                    });
                  } else {
                    console.error('OpenSCAD stderr output: (empty)');
                  }
                } else {
                  console.error('OpenSCAD stderr output: (not available)');
                }

                // Show code complexity analysis if this is a complexity error
                if (e.data.err.message?.includes('Code complexity error')) {
                  const code = e.data.err.code || '';
                  const hullCount = (code.match(/hull\s*\(/g) || []).length;
                  const sphereCount = (code.match(/sphere\s*\(/g) || []).length;
                  const cylinderCount = (code.match(/cylinder\s*\(/g) || []).length;
                  const scaleCount = (code.match(/scale\s*\(/g) || []).length;
                  const unionCount = (code.match(/union\s*\(/g) || []).length;
                  const differenceCount = (code.match(/difference\s*\(/g) || []).length;

                  console.error('📊 Code Complexity Analysis:');
                  console.error(`  - hull() operations: ${hullCount} (max: 6)`);
                  console.error(`  - Primitives: ${sphereCount + cylinderCount} (spheres: ${sphereCount}, cylinders: ${cylinderCount}) (max: 30)`);
                  console.error(`  - scale() operations: ${scaleCount} (max with hull: 10)`);
                  console.error(`  - Boolean operations: ${unionCount + differenceCount} (union: ${unionCount}, difference: ${differenceCount}) (max: 10)`);
                }

                // 🚨 PATTERN DETECTION: Check for known crash patterns
                if (e.data.err.code) {
                  const code = e.data.err.code;

                  // Detect linear_extrude with center=true (known crash pattern)
                  const hasLinearExtrudeCenter = /linear_extrude\s*\([^)]*center\s*=\s*true[^)]*\)/.test(code);
                  const hasRotate = /rotate\s*\(/.test(code);
                  const hasPolygon = /polygon\s*\(/.test(code);

                  if (hasLinearExtrudeCenter && hasRotate) {
                    console.error('⚠️ DETECTED: linear_extrude with center=true + rotate() - known crash pattern');
                    console.error('   This combination causes CGAL crashes due to coordinate misalignment');
                    console.error('   Fix: Use center=false and adjust position with translate()');
                  }

                  if (hasLinearExtrudeCenter && hasPolygon) {
                    console.error('⚠️ DETECTED: linear_extrude(center=true) with polygon() - crash pattern');
                    console.error('   This creates non-manifold geometry that CGAL cannot handle');
                    console.error('   Fix: For roofs, use rotated cube() instead of extruded polygon()');
                  }

                  // Check for complex polygon definitions
                  const polygonMatch = code.match(/polygon\s*\(\s*\[([^\]]+)\]\s*\)/);
                  if (polygonMatch) {
                    const points = polygonMatch[1];
                    const arrayDepth = (points.match(/\[/g) || []).length;
                    if (arrayDepth > 12) {
                      console.error(`⚠️ DETECTED: Complex polygon with ${arrayDepth} points - may exceed WASM limits`);
                      console.error('   Simplify polygon to max 12 points or use simpler geometry');
                    }
                  }

                  // Check for linear_extrude excessive height
                  const extrudeHeightMatch = code.match(/linear_extrude\s*\(\s*height\s*=\s*([^,)]+)/);
                  if (extrudeHeightMatch) {
                    const heightExpr = extrudeHeightMatch[1].trim();
                    // Try to extract numeric value if it's a simple number
                    const heightValue = parseFloat(heightExpr);
                    if (!isNaN(heightValue) && heightValue > 200) {
                      console.error(`⚠️ DETECTED: Excessive extrusion height (${heightValue}) - crash risk`);
                      console.error('   Reduce height to ≤ 200 units to prevent WASM memory issues');
                    }
                  }
                }

                if (e.data.err.code) {
                  console.error('Failed OpenSCAD code:');
                  console.error(e.data.err.code);
                }

                console.groupEnd();
              }

              // 🔄 RETRY LOGIC: Attempt regeneration if retries remain
              if (retryAttempt < MAX_COMPILATION_RETRIES) {
                console.log(`🔄 [Retry ${retryAttempt + 1}/${MAX_COMPILATION_RETRIES}] Attempting to regenerate failed code...`);

                cleanup(); // Clean up current attempt

                // Request code regeneration from backend
                const regeneratedCode = await regenerateCode({
                  originalCode: originalCode || code, // Use original code from first attempt
                  errorMessage: e.data.err.message || 'Compilation failed',
                  stderrOutput: e.data.err.stdErr,
                });

                if (regeneratedCode) {
                  console.log(`✅ [Retry ${retryAttempt + 1}/${MAX_COMPILATION_RETRIES}] Received regenerated code, retrying compilation...`);

                  // Retry compilation with regenerated code
                  try {
                    const result = await compileBranch(
                      branchId,
                      regeneratedCode,
                      retryAttempt + 1,
                      originalCode || code // Pass original code for context
                    );
                    resolve(result);
                    return; // Exit this promise chain
                  } catch (retryError) {
                    // Retry failed, will fall through to error handling below
                    console.error(`❌ [Retry ${retryAttempt + 1}/${MAX_COMPILATION_RETRIES}] Retry failed:`, retryError);
                  }
                } else {
                  console.error(`❌ [Retry ${retryAttempt + 1}/${MAX_COMPILATION_RETRIES}] Regeneration failed, no new code received`);
                }
              }

              // Final failure: all retries exhausted or regeneration failed
              const errorMsg = retryAttempt >= MAX_COMPILATION_RETRIES
                ? `Compilation failed after ${MAX_COMPILATION_RETRIES} attempts: ${e.data.err.message || 'Unknown error'}`
                : e.data.err.message || 'Compilation failed';

              console.error(`❌ [Final Error] ${errorMsg}`);

              updateBranch(branchId, {
                isCompiling: false,
                compilationProgress: 0,
                compilationError: errorMsg,
              });
              reject(new Error(errorMsg));
            } else if (e.data.data && typeof e.data.data === 'object' && 'output' in e.data.data) {
              // Compilation succeeded
              const responseData = e.data.data as { output: Uint8Array; fileType: string };

              // 🔍 DIAGNOSTIC: Validate branch ID hasn't changed
              if (branchId !== startBranchId) {
                console.error(`❌ [useParallelCompilation] Branch ID mismatch!`);
                console.error(`   Expected: ${startBranchId}`);
                console.error(`   Got: ${branchId}`);
              } else {
                console.log(`✅ [useParallelCompilation] Branch ID validated: ${branchId}`);
              }

              const blob = new Blob([responseData.output], {
                type: responseData.fileType === 'stl' ? 'model/stl' : 'image/svg+xml',
              });

              // 🔍 DIAGNOSTIC: Log blob creation
              console.log(`🎉 [useParallelCompilation] Compilation succeeded for branch: ${branchId}`);
              console.log(`🎉 [useParallelCompilation] Blob created - size: ${blob.size} bytes, type: ${blob.type}`);
              console.log(`🎉 [useParallelCompilation] Calling updateBranch with blob...`);

              updateBranch(branchId, {
                isCompiling: false,
                compilationProgress: 100,
                modelBlob: blob,
              });

              console.log(`✅ [useParallelCompilation] updateBranch called successfully`);

              resolve({ branchId, blob });
            } else {
              // Unexpected response format
              logger.error('Compilation', 'Unexpected worker response format');
              updateBranch(branchId, {
                isCompiling: false,
                compilationProgress: 0,
                compilationError: 'Unexpected worker response format',
              });
              reject(new Error('Unexpected worker response format'));
            }
          } finally {
            // ✅ ALWAYS cleanup, even if handler throws
            cleanup();
          }
        };

        // Handle worker errors
        const handleError = (error: ErrorEvent) => {
          try {
            logger.error('Compilation', `Worker crashed: ${error.message}`);
            updateBranch(branchId, {
              isCompiling: false,
              compilationProgress: 0,
              compilationError: error.message || 'Worker crashed',
            });
            reject(new Error(error.message || 'Worker crashed'));
          } finally {
            // ✅ ALWAYS cleanup, even if handler throws
            cleanup();
          }
        };

        // Attach listeners
        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        // ✅ SAFE COMPILATION: Wrap in try/catch to handle immediate errors
        try {
          const message: WorkerMessage = {
            type: WorkerMessageType.PREVIEW,
            data: {
              code,
              params: [],
              fileType: 'stl',
            },
          };

          worker.postMessage(message);
        } catch (err: any) {
          logger.error('Compilation', `Failed to start: ${err.message}`);
          updateBranch(branchId, {
            isCompiling: false,
            compilationProgress: 0,
            compilationError: `Failed to start compilation: ${err.message}`,
          });
          cleanup();
          reject(new Error(`Failed to start compilation: ${err.message}`));
        }
      });
    },
    [updateBranch]
  );

  /**
   * Compile multiple branches in parallel
   */
  const compileVariations = useCallback(
    async (variations: Array<{ branchId: string; code: string }>) => {
      const compilations = variations.map(({ branchId, code }) =>
        compileBranch(branchId, code)
      );

      return Promise.all(compilations);
    },
    [compileBranch]
  );

  /**
   * Cancel all ongoing compilations and reset worker
   */
  const cancelAll = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.terminateAll();
      managerRef.current = new SingleWorkerManager();
    }
  }, []);

  /**
   * Cleanup on unmount
   */
  const cleanup = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.terminateAll();
      managerRef.current = null;
    }
  }, []);

  return {
    compileBranch,
    compileVariations,
    cancelAll,
    cleanup,
  };
}

/**
 * Helper hook for compiling variations from the brainstorm-generate API response
 */
export function useCompileGeneratedVariations() {
  const { createNewDesign, createNextVersion, updateCurrentVersion, currentDesign } = useBrainstorm();
  const { compileVariations } = useParallelCompilation();

  return useCallback(
    async (
      variations: BrainstormVariation[],
      sessionId: string,
      messageId: string,
      isRefinement: boolean = false
    ) => {
      try {
        // Validate inputs
        if (!variations || variations.length === 0) {
          throw new Error('No variations provided for compilation');
        }

        if (isRefinement && !currentDesign) {
          throw new Error('Cannot refine: No current design exists');
        }

        // For refinements, we're creating the next version of the current design
        // For new designs, we're creating v1 of a new lineage
        const branchesToCompile = variations.map((variation, index) => {
          // ✅ STABLE BRANCH IDS: Generate stable UUID upfront to prevent component unmount
          // This keeps the same branch ID for v1 → v2 → v3 transitions
          const stableLineageId = isRefinement && currentDesign
            ? currentDesign.lineageId  // ✅ Existing lineage: Use same ID for v2, v3, v4...
            : crypto.randomUUID();     // ✅ New lineage: Generate real UUID (not temp string)

          // 🔍 DIAGNOSTIC: Log branch ID generation
          console.log(`🆔 [useCompileGeneratedVariations] Generated branch ID: ${stableLineageId}`);
          console.log(`🆔 [useCompileGeneratedVariations] Is refinement: ${isRefinement}`);
          console.log(`🆔 [useCompileGeneratedVariations] Session ID: ${sessionId}`);
          if (isRefinement && currentDesign) {
            console.log(`🆔 [useCompileGeneratedVariations] Current lineage: ${currentDesign.lineageId}`);
            console.log(`🆔 [useCompileGeneratedVariations] Current version: ${currentDesign.latestVersion.version_number}`);
          }

          const branch = {
            id: stableLineageId,              // ✅ Use stable UUID for branch ID
            brainstorm_session_id: sessionId,
            message_id: messageId,
            branch_index: index,
            parent_branch_id: isRefinement && currentDesign ? currentDesign.latestVersion.id : null,
            viewport_position: index,
            metrics: {},
            created_at: new Date().toISOString(),
            openscad_code: variation.code,
            isCompiling: true,
            compilationProgress: 0,
            design_lineage_id: stableLineageId,  // ✅ Use same stable UUID for lineage
          };

          // Directly call the appropriate method based on whether this is a refinement
          if (isRefinement && currentDesign) {
            const nextVersionNumber = currentDesign.latestVersion.version_number! + 1;
            logger.info('Compilation', `Starting v${nextVersionNumber} compilation`);
            createNextVersion(branch);
          } else {
            logger.info('Compilation', 'Starting v1 compilation');
            createNewDesign(branch);
          }

          return {
            branchId: stableLineageId,
            code: variation.code,
          };
        });

        // Compile all in parallel
        await compileVariations(branchesToCompile);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown compilation error';
        logger.error('Compilation', `Failed to compile variations: ${errorMsg}`);
        throw error;
      }
    },
    [createNewDesign, createNextVersion, updateCurrentVersion, compileVariations, currentDesign]
  );
}
