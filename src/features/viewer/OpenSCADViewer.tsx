import { useOpenSCAD } from '@/hooks/useOpenSCAD';
import { useCallback, useEffect, useState } from 'react';
import { ThreeScene } from '@/features/viewer/ThreeScene';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { BufferGeometry } from 'three';
import { Loader2, CircleAlert, Wrench } from 'lucide-react';
import { Button } from '@/ui/button';
import OpenSCADError from '@/lib/OpenSCADError';
import { cn } from '@/lib/utils';
import { useConversation } from '@/services/conversationService';
import { useCurrentMessage } from '@/core/CurrentMessageContext';
import { Content } from '@shared/types';
import { useSendContentMutation } from '@/services/messageService';
import { useBlob } from '@/core/BlobContext';

export function OpenSCADViewer() {
  const { conversation } = useConversation();
  const { currentMessage } = useCurrentMessage();
  const { setBlob } = useBlob();
  const { compileScad, isCompiling, output, isError, error } = useOpenSCAD();
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null);
  const { mutate: sendMessage } = useSendContentMutation({ conversation });

  const scadCode = currentMessage?.content.artifact?.code;

  // Log component mount
  useEffect(() => {
    console.log('[OpenSCADViewer] Component mounted');
    return () => console.log('[OpenSCADViewer] Component unmounted');
  }, []);

  // Log current message and artifact status
  useEffect(() => {
    console.log('[OpenSCADViewer] Current message:', currentMessage?.id);
    console.log('[OpenSCADViewer] Has artifact:', !!currentMessage?.content.artifact);
    console.log('[OpenSCADViewer] Has code:', !!scadCode);
    if (scadCode) {
      console.log('[OpenSCADViewer] Code length:', scadCode.length);
      console.log('[OpenSCADViewer] Code preview:', scadCode.substring(0, 150));
    }
  }, [currentMessage, scadCode]);

  // Compile when code changes
  useEffect(() => {
    if (scadCode) {
      console.log('[OpenSCADViewer] 🚀 Starting compilation...');
      compileScad(scadCode);
    } else {
      console.log('[OpenSCADViewer] ⚠️ No code to compile');
    }
  }, [scadCode, compileScad]);

  // Handle compilation output
  useEffect(() => {
    console.log('[OpenSCADViewer] Compilation output changed:', {
      hasOutput: !!output,
      isBlob: output instanceof Blob,
      isError,
      error: error?.message,
    });

    setBlob(output ?? null);

    if (output && output instanceof Blob) {
      console.log('[OpenSCADViewer] ✅ Compilation successful, loading STL...');
      console.log('[OpenSCADViewer] Blob size:', output.size, 'bytes');

      output.arrayBuffer().then((buffer) => {
        console.log('[OpenSCADViewer] ArrayBuffer size:', buffer.byteLength, 'bytes');
        const loader = new STLLoader();
        const geom = loader.parse(buffer);
        geom.center();
        geom.computeVertexNormals();
        console.log('[OpenSCADViewer] 🎉 Geometry loaded successfully');
        console.log('[OpenSCADViewer] Vertices:', geom.attributes.position.count);
        setGeometry(geom);
      }).catch((err) => {
        console.error('[OpenSCADViewer] ❌ Error loading STL:', err);
      });
    } else {
      console.log('[OpenSCADViewer] No output or not a Blob, clearing geometry');
      setGeometry(null);
    }
  }, [output, setBlob, isError, error]);

  const fixError = useCallback(
    async (error: OpenSCADError) => {
      const newContent: Content = {
        text: 'Fix with AI',
        error: error.stdErr.join('\n'),
      };

      sendMessage(newContent);
    },
    [sendMessage],
  );

  const isLastMessage =
    conversation.current_message_leaf_id === currentMessage?.id;

  return (
    <div className="relative h-full w-full bg-pierre-neutral-700/50 shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out">
      <div className="h-full w-full">
        {geometry ? (
          <div className="h-full w-full">
            <ThreeScene geometry={geometry} />
          </div>
        ) : (
          <>
            {isError && (
              <div className="flex h-full items-center justify-center">
                <FixWithAIButton
                  error={error}
                  fixError={isLastMessage ? fixError : undefined}
                />
              </div>
            )}
          </>
        )}
        {isCompiling && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-pierre-neutral-700/30 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-pierre-blue" />
              <p className="text-xs font-medium text-pierre-text-primary/70">
                Compiling...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FixWithAIButton({
  error,
  fixError,
}: {
  error?: OpenSCADError | Error;
  fixError?: (error: OpenSCADError) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-pierre-blue/20" />
          <CircleAlert className="h-8 w-8 text-pierre-blue" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-pierre-blue">
            Error Compiling Model
          </p>
          <p className="mt-1 text-xs text-pierre-text-primary/60">
            Pierre encountered an error while compiling
          </p>
        </div>
      </div>
      {fixError && error && error.name === 'OpenSCADError' && (
        <Button
          variant="ghost"
          className={cn(
            'group relative flex items-center gap-2 rounded-lg border',
            'bg-gradient-to-br from-pierre-blue/20 to-pierre-neutral-800/70 p-3',
            'border-pierre-blue/30 text-pierre-text-primary',
            'transition-all duration-300 ease-in-out',
            'hover:border-pierre-blue/70 hover:bg-pierre-blue/50 hover:text-white',
            'hover:shadow-[0_0_25px_rgba(249,115,184,0.4)]',
            'focus:outline-none focus:ring-2 focus:ring-pierre-blue/30',
          )}
          onClick={() => {
            if (error && error.name === 'OpenSCADError') {
              fixError?.(error as OpenSCADError);
            }
          }}
        >
          <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-pierre-blue/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <Wrench className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
          <span className="relative text-sm font-medium">Fix with AI</span>
        </Button>
      )}
    </div>
  );
}
