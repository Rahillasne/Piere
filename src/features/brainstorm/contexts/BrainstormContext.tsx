/**
 * BrainstormContext - Version Control Edition
 *
 * Manages state for brainstorming sessions with version control:
 * - Single design viewport showing latest version
 * - Version history (v1 → v2 → v3...)
 * - Compilation progress for current version
 * - Like CAD software (Fusion 360/SolidWorks)
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { DesignBranch, ViewportLayout } from '@/services/brainstormService';
import { logger } from '@/utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface BranchWithModel extends DesignBranch {
  modelBlob?: Blob; // Compiled STL model
  openscad_code?: string; // OpenSCAD source code
  compilationProgress?: number; // 0-100
  isCompiling?: boolean;
  compilationError?: string;
  version_number?: number; // v1, v2, v3...
  design_lineage_id?: string; // Groups all versions
  is_latest_version?: boolean; // True for current version
}

/**
 * Represents a complete design with its version history
 */
export interface DesignLineage {
  lineageId: string;
  latestVersion: BranchWithModel;
  versionHistory: BranchWithModel[]; // [v1, v2, v3...] ordered
  currentViewedVersion: number; // Which version user is viewing (defaults to latest)
}

interface BrainstormContextValue {
  // Session state
  sessionId: string | null;
  currentDesign: DesignLineage | null; // Single design with version history
  viewportLayout: ViewportLayout; // Fixed 1x1 grid for version control mode

  // Actions - Version Control
  setSessionId: (id: string | null) => void;
  createNewDesign: (branch: BranchWithModel) => void; // Create v1 of new design
  createNextVersion: (branch: BranchWithModel) => void; // Create v2, v3, v4...
  updateCurrentVersion: (updates: Partial<BranchWithModel>) => void; // Update compilation status
  switchToVersion: (versionNumber: number) => void; // View different version
  resetSession: () => void;

  // Legacy compatibility (deprecated, but kept for gradual migration)
  activeBranches: BranchWithModel[]; // Returns [latestVersion] or []
  addBranch: (branch: BranchWithModel) => void; // Maps to createNewDesign/createNextVersion
  updateBranch: (branchId: string, updates: Partial<BranchWithModel>) => void; // Maps to updateCurrentVersion
  removeBranch: (branchId: string) => void; // Removes entire lineage
}

// ============================================================================
// Context
// ============================================================================

const BrainstormContext = createContext<BrainstormContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface BrainstormProviderProps {
  children: ReactNode;
  initialSessionId?: string | null;
}

export function BrainstormProvider({
  children,
  initialSessionId = null,
}: BrainstormProviderProps) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [currentDesign, setCurrentDesign] = useState<DesignLineage | null>(null);

  /**
   * Create v1 of a new design (replaces current design if exists)
   */
  const createNewDesign = useCallback((branch: BranchWithModel) => {
    const lineageId = branch.design_lineage_id || crypto.randomUUID();

    const newDesign: DesignLineage = {
      lineageId,
      latestVersion: {
        ...branch,
        version_number: 1,
        design_lineage_id: lineageId,
        is_latest_version: true,
      },
      versionHistory: [{
        ...branch,
        version_number: 1,
        design_lineage_id: lineageId,
        is_latest_version: true,
      }],
      currentViewedVersion: 1,
    };

    setCurrentDesign(newDesign);
    logger.info('BrainstormContext', `Created v1 (branch: ${branch.id})`);
  }, []);

  /**
   * Create next version (v2, v3, v4...) of current design
   */
  const createNextVersion = useCallback((branch: BranchWithModel) => {
    setCurrentDesign(prev => {
      if (!prev) {
        // No current design - create v1
        logger.warn('BrainstormContext', 'No current design, creating v1 instead');
        const lineageId = branch.design_lineage_id || crypto.randomUUID();
        return {
          lineageId,
          latestVersion: { ...branch, version_number: 1, design_lineage_id: lineageId, is_latest_version: true },
          versionHistory: [{ ...branch, version_number: 1, design_lineage_id: lineageId, is_latest_version: true }],
          currentViewedVersion: 1,
        };
      }

      const nextVersionNumber = prev.latestVersion.version_number! + 1;
      const newVersion: BranchWithModel = {
        ...branch,
        version_number: nextVersionNumber,
        design_lineage_id: prev.lineageId,
        is_latest_version: true,
        parent_branch_id: prev.latestVersion.id,
        // ✅ FIX: Preserve previous version's blob until new version compiles
        // This keeps WebGL context stable during compilation and on failures
        modelBlob: prev.latestVersion.modelBlob,
      };

      // Mark previous version as no longer latest
      const updatedHistory = prev.versionHistory.map(v => ({
        ...v,
        is_latest_version: false,
      }));

      logger.info('BrainstormContext', `Created v${nextVersionNumber} (branch: ${newVersion.id}) - preserving v${prev.latestVersion.version_number} blob`);

      return {
        lineageId: prev.lineageId,
        latestVersion: newVersion,
        versionHistory: [...updatedHistory, newVersion],
        currentViewedVersion: nextVersionNumber,
      };
    });
  }, []);

  /**
   * Update compilation status of current version
   */
  const updateCurrentVersion = useCallback((updates: Partial<BranchWithModel>) => {
    setCurrentDesign(prev => {
      if (!prev) {
        logger.warn('BrainstormContext', 'No current design - update skipped');
        return null;
      }

      const updatedLatest = { ...prev.latestVersion, ...updates };
      const updatedHistory = prev.versionHistory.map(v =>
        v.version_number === prev.latestVersion.version_number
          ? updatedLatest
          : v
      );

      // Log when compilation completes (blob received)
      if (updates.modelBlob && !prev.latestVersion.modelBlob) {
        logger.info('BrainstormContext', `v${updatedLatest.version_number} compiled (${(updates.modelBlob.size / 1024).toFixed(1)} KB)`);
      }

      return {
        ...prev,
        latestVersion: updatedLatest,
        versionHistory: updatedHistory,
      };
    });
  }, []);

  /**
   * Switch to viewing a different version
   */
  const switchToVersion = useCallback((versionNumber: number) => {
    setCurrentDesign(prev => {
      if (!prev) return null;

      const targetVersion = prev.versionHistory.find(v => v.version_number === versionNumber);
      if (!targetVersion) {
        logger.warn('BrainstormContext', `Version ${versionNumber} not found`);
        return prev;
      }

      logger.info('BrainstormContext', `Switched to viewing v${versionNumber}`);

      return {
        ...prev,
        currentViewedVersion: versionNumber,
      };
    });
  }, []);

  /**
   * Reset entire session
   */
  const resetSession = useCallback(() => {
    setSessionId(null);
    setCurrentDesign(null);
    logger.info('BrainstormContext', 'Session reset');
  }, []);

  // ============================================================================
  // Legacy Compatibility Methods
  // ============================================================================

  /**
   * Legacy: activeBranches (returns array with latest version or empty)
   */
  const activeBranches = currentDesign ? [currentDesign.latestVersion] : [];

  /**
   * Legacy: addBranch (decides whether to create new design or next version)
   */
  const addBranch = useCallback((branch: BranchWithModel) => {
    if (!currentDesign) {
      createNewDesign(branch);
    } else if (branch.design_lineage_id === currentDesign.lineageId) {
      createNextVersion(branch);
    } else {
      // Different lineage - create new design
      createNewDesign(branch);
    }
  }, [currentDesign, createNewDesign, createNextVersion]);

  /**
   * Legacy: updateBranch (updates current version if ID matches)
   * FIXED: Use functional update form to avoid stale closure issues
   */
  const updateBranch = useCallback((branchId: string, updates: Partial<BranchWithModel>) => {
    // 🔍 DIAGNOSTIC: Log updateBranch call
    console.log(`📥 [BrainstormContext] updateBranch called for branch: ${branchId}`);
    console.log(`📥 [BrainstormContext] Updates:`, {
      hasBlob: !!updates.modelBlob,
      blobSize: updates.modelBlob?.size,
      isCompiling: updates.isCompiling,
      compilationProgress: updates.compilationProgress,
      compilationError: updates.compilationError,
    });

    // 🛡️ DEFENSIVE: Validate blob if present
    if (updates.modelBlob) {
      if (!(updates.modelBlob instanceof Blob)) {
        console.error('❌ [BrainstormContext] modelBlob is not a Blob instance!', typeof updates.modelBlob);
        logger.error('BrainstormContext', 'Invalid blob type - expected Blob instance');
        return; // Don't update with invalid blob
      }

      if (updates.modelBlob.size === 0) {
        console.error('❌ [BrainstormContext] modelBlob has zero size!');
        logger.error('BrainstormContext', 'Invalid blob - size is 0');
        return; // Don't update with empty blob
      }

      console.log(`✅ [BrainstormContext] Blob validation passed (${updates.modelBlob.size} bytes)`);
    }

    // Use functional update to get fresh currentDesign value
    setCurrentDesign(prev => {
      if (!prev) {
        console.error('❌ [BrainstormContext] No current design exists - cannot update');
        logger.warn('BrainstormContext', `updateBranch: No current design`);
        return prev;
      }

      console.log(`📥 [BrainstormContext] Current design state:`);
      console.log(`   - Lineage ID: ${prev.lineageId}`);
      console.log(`   - Latest version ID: ${prev.latestVersion.id}`);
      console.log(`   - Latest version number: ${prev.latestVersion.version_number}`);
      console.log(`   - Has existing blob: ${!!prev.latestVersion.modelBlob}`);

      if (prev.latestVersion.id !== branchId) {
        console.error(`❌ [BrainstormContext] Branch ID mismatch!`);
        console.error(`   Expected: ${prev.latestVersion.id}`);
        console.error(`   Got: ${branchId}`);
        console.error(`   Update will be DROPPED!`);

        // 🛡️ DEFENSIVE: Check if this is a late blob arrival for a previous version
        const oldVersion = prev.versionHistory.find(v => v.id === branchId);
        if (oldVersion && updates.modelBlob) {
          console.warn(`⚠️  [BrainstormContext] Late blob arrival for old version v${oldVersion.version_number}`);
          console.warn(`⚠️  [BrainstormContext] Current version is v${prev.latestVersion.version_number}`);
          console.warn(`⚠️  [BrainstormContext] Storing blob in version history for v${oldVersion.version_number}`);

          // Update the old version in history with the blob
          const updatedHistory = prev.versionHistory.map(v =>
            v.id === branchId
              ? { ...v, ...updates, modelBlob: updates.modelBlob }
              : v
          );

          return {
            ...prev,
            versionHistory: updatedHistory,
          };
        }

        logger.error('BrainstormContext', `updateBranch: Branch ID mismatch (expected: ${prev.latestVersion.id}, got: ${branchId})`);
        return prev; // No change
      }

      console.log(`✅ [BrainstormContext] Branch ID matches - proceeding with update`);

      const updatedLatest = { ...prev.latestVersion, ...updates };
      const updatedHistory = prev.versionHistory.map(v =>
        v.version_number === prev.latestVersion.version_number
          ? updatedLatest
          : v
      );

      // Log when compilation completes (blob received)
      if (updates.modelBlob && !prev.latestVersion.modelBlob) {
        console.log(`🎉 [BrainstormContext] Blob received and stored!`);
        console.log(`🎉 [BrainstormContext] v${updatedLatest.version_number} compiled (${(updates.modelBlob.size / 1024).toFixed(1)} KB)`);
        logger.info('BrainstormContext', `v${updatedLatest.version_number} compiled (${(updates.modelBlob.size / 1024).toFixed(1)} KB)`);
      }

      // 🔍 DIAGNOSTIC: Log final state
      console.log(`📦 [BrainstormContext] Updated state:`);
      console.log(`   - Has blob now: ${!!updatedLatest.modelBlob}`);
      console.log(`   - Is compiling: ${updatedLatest.isCompiling}`);
      console.log(`   - Compilation progress: ${updatedLatest.compilationProgress}`);

      return {
        ...prev,
        latestVersion: updatedLatest,
        versionHistory: updatedHistory,
      };
    });
  }, []); // No dependencies - uses functional update

  /**
   * Legacy: removeBranch (removes entire lineage)
   */
  const removeBranch = useCallback((branchId: string) => {
    if (currentDesign && currentDesign.latestVersion.id === branchId) {
      setCurrentDesign(null);
      logger.info('BrainstormContext', 'Removed design lineage');
    }
  }, [currentDesign]);

  const value: BrainstormContextValue = {
    // State
    sessionId,
    currentDesign,
    activeBranches,
    viewportLayout: { columns: 1, rows: 1 }, // Single viewport for version control

    // Actions - Version Control
    setSessionId,
    createNewDesign,
    createNextVersion,
    updateCurrentVersion,
    switchToVersion,
    resetSession,

    // Legacy compatibility
    addBranch,
    updateBranch,
    removeBranch,
  };

  return (
    <BrainstormContext.Provider value={value}>
      {children}
    </BrainstormContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useBrainstorm() {
  const context = useContext(BrainstormContext);
  if (!context) {
    throw new Error('useBrainstorm must be used within BrainstormProvider');
  }
  return context;
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Get current version being viewed
 */
export function useCurrentVersion() {
  const { currentDesign } = useBrainstorm();
  if (!currentDesign) return null;

  const viewedVersion = currentDesign.versionHistory.find(
    v => v.version_number === currentDesign.currentViewedVersion
  );

  return viewedVersion || currentDesign.latestVersion;
}

/**
 * Get version history for current design
 */
export function useVersionHistory() {
  const { currentDesign } = useBrainstorm();
  return currentDesign?.versionHistory || [];
}

/**
 * Get compilation status for current version
 */
export function useCompilationStatus() {
  const { currentDesign } = useBrainstorm();

  if (!currentDesign) {
    return {
      isCompiling: false,
      progress: 0,
      hasError: false,
      error: undefined,
      isComplete: false,
    };
  }

  const latest = currentDesign.latestVersion;

  return {
    isCompiling: latest.isCompiling || false,
    progress: latest.compilationProgress || 0,
    hasError: !!latest.compilationError,
    error: latest.compilationError,
    isComplete: !!latest.modelBlob && !latest.isCompiling,
  };
}

/**
 * Check if can navigate to previous/next version
 */
export function useVersionNavigation() {
  const { currentDesign, switchToVersion } = useBrainstorm();

  if (!currentDesign) {
    return {
      canGoPrevious: false,
      canGoNext: false,
      currentVersion: 0,
      totalVersions: 0,
      goToPrevious: () => {},
      goToNext: () => {},
      goToVersion: () => {},
    };
  }

  const currentVersion = currentDesign.currentViewedVersion;
  const totalVersions = currentDesign.versionHistory.length;

  return {
    canGoPrevious: currentVersion > 1,
    canGoNext: currentVersion < totalVersions,
    currentVersion,
    totalVersions,
    goToPrevious: () => {
      if (currentVersion > 1) {
        switchToVersion(currentVersion - 1);
      }
    },
    goToNext: () => {
      if (currentVersion < totalVersions) {
        switchToVersion(currentVersion + 1);
      }
    },
    goToVersion: switchToVersion,
  };
}

// Legacy exports for backwards compatibility
export function useBranch(branchId: string | undefined) {
  const { activeBranches } = useBrainstorm();
  return activeBranches.find(b => b.id === branchId);
}

export function useSelectedBranches() {
  return []; // Deprecated in version control mode
}

export function useIsBranchSelected(branchId: string) {
  return false; // Deprecated in version control mode
}
