/**
 * useUploadCADFile Hook
 *
 * Handles uploading and processing of STL and SCAD files.
 * - Uploads files to Supabase storage
 * - For STL: Returns blob directly
 * - For SCAD: Compiles to STL using OpenSCAD worker
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { WorkerMessage, WorkerMessageType } from '@/workers/types';

export interface UploadedCADFile {
  fileId: string;
  fileName: string;
  fileType: 'stl' | 'scad';
  modelBlob?: Blob;
  error?: string;
}

export interface UploadProgress {
  phase: 'uploading' | 'compiling' | 'complete' | 'error';
  progress: number; // 0-100
  message?: string;
}

export function useUploadCADFile() {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  /**
   * Compile SCAD file to STL using OpenSCAD worker
   */
  const compileSCADFile = useCallback(async (scadCode: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker('/src/workers/worker.ts', { type: 'module' });

      const cleanup = () => {
        try {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          worker.terminate();
        } catch (err) {
          console.warn('Failed to cleanup SCAD compilation worker:', err);
        }
      };

      const handleMessage = (e: MessageEvent) => {
        try {
          if (e.data.err) {
            console.error('SCAD compilation error:', e.data.err);
            reject(new Error(e.data.err.message || 'SCAD compilation failed'));
          } else if (e.data.data?.output) {
            console.log('✅ SCAD file compiled successfully');
            const blob = new Blob([e.data.data.output], { type: 'model/stl' });
            resolve(blob);
          }
        } finally {
          cleanup();
        }
      };

      const handleError = (error: ErrorEvent) => {
        console.error('SCAD compilation worker error:', error);
        cleanup();
        reject(new Error(error.message || 'Worker crashed during SCAD compilation'));
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);

      try {
        const message: WorkerMessage = {
          type: WorkerMessageType.PREVIEW,
          data: {
            code: scadCode,
            params: [],
            fileType: 'stl',
          },
        };

        worker.postMessage(message);
      } catch (err: any) {
        console.error('Failed to send message to SCAD worker:', err);
        cleanup();
        reject(new Error(`Failed to start SCAD compilation: ${err.message}`));
      }
    });
  }, []);

  /**
   * Upload and process CAD file
   */
  const uploadCADFile = useCallback(
    async (
      file: File,
      userId: string,
      sessionId: string
    ): Promise<UploadedCADFile> => {
      const fileId = crypto.randomUUID();
      const fileName = file.name;
      const fileType = fileName.toLowerCase().endsWith('.scad') ? 'scad' : 'stl';

      try {
        // Phase 1: Upload to Supabase Storage
        setUploadProgress({
          phase: 'uploading',
          progress: 0,
          message: `Uploading ${fileName}...`,
        });

        const filePath = `${userId}/${sessionId}/${fileId}`;
        const { error: uploadError } = await supabase.storage
          .from('cad-files')
          .upload(filePath, file);

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        setUploadProgress({
          phase: 'uploading',
          progress: 100,
          message: 'Upload complete',
        });

        // Phase 2: Process file based on type
        let modelBlob: Blob | undefined;

        if (fileType === 'stl') {
          // STL files can be used directly
          modelBlob = file;
          setUploadProgress({
            phase: 'complete',
            progress: 100,
            message: 'STL file ready',
          });
        } else {
          // SCAD files need compilation
          setUploadProgress({
            phase: 'compiling',
            progress: 0,
            message: 'Compiling SCAD file...',
          });

          const scadCode = await file.text();
          modelBlob = await compileSCADFile(scadCode);

          setUploadProgress({
            phase: 'complete',
            progress: 100,
            message: 'SCAD file compiled',
          });
        }

        return {
          fileId,
          fileName,
          fileType,
          modelBlob,
        };
      } catch (err: any) {
        const errorMessage = err.message || 'File upload failed';
        console.error('CAD file upload error:', err);

        setUploadProgress({
          phase: 'error',
          progress: 0,
          message: errorMessage,
        });

        return {
          fileId,
          fileName,
          fileType,
          error: errorMessage,
        };
      } finally {
        // Clear progress after a delay
        setTimeout(() => {
          setUploadProgress(null);
        }, 3000);
      }
    },
    [compileSCADFile]
  );

  /**
   * Clear upload progress
   */
  const clearProgress = useCallback(() => {
    setUploadProgress(null);
  }, []);

  return {
    uploadCADFile,
    uploadProgress,
    clearProgress,
  };
}
