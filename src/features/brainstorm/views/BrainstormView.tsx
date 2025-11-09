/**
 * BrainstormView - Voice-to-CAD Interface
 *
 * Main view for voice-driven CAD generation.
 * Layout: Voice Orb | 3D Viewer
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { VoiceChat } from '@/features/voice';
import { BrainstormProvider, useBrainstorm, MultiViewport } from '@/features/brainstorm';
import { useCompileGeneratedVariations } from '../hooks/useParallelCompilation';
import {
  useBrainstormSession,
  useCreateBrainstormSession,
  useGenerateVariations,
  type BrainstormVariation,
} from '@/services/brainstormService';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/core/AuthContext';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Home, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/utils/logger';
import { useQueryClient } from '@tanstack/react-query';

export function BrainstormView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  return (
    <BrainstormProvider initialSessionId={sessionId ?? null}>
      <BrainstormViewContent />
    </BrainstormProvider>
  );
}

function BrainstormViewContent() {
  const {
    sessionId,
    setSessionId,
    currentDesign,
    createNextVersion,
    activeBranches // Legacy compatibility - returns [latestVersion] or []
  } = useBrainstorm();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Track current variation for refinement (single design with versions)
  const [currentVariation, setCurrentVariation] = useState<BrainstormVariation | null>(null);

  // Track generation loading state (for UI feedback during 10-30 second AI generation gap)
  const [isGenerating, setIsGenerating] = useState(false);

  // Use ref to prevent duplicate initialization
  const initStartedRef = useRef(false);

  // Fetch session data if sessionId exists
  const { data: session, isLoading: isLoadingSession } = useBrainstormSession(sessionId || undefined);

  // Mutations
  const createSession = useCreateBrainstormSession();
  const generateVariations = useGenerateVariations();
  const compileVariations = useCompileGeneratedVariations();

  // Sync conversationId from session when it loads
  useEffect(() => {
    if (session?.conversation_id && !conversationId) {
      setConversationId(session.conversation_id);
    }
  }, [session, conversationId]);

  // Create conversation and session if navigating to /brainstorm without an ID
  useEffect(() => {
    async function initializeBrainstorm() {
      // Guard: Prevent duplicate initialization
      if (sessionId || initStartedRef.current) return;

      // Mark initialization as started
      initStartedRef.current = true;
      setIsInitializing(true);
      setInitError(null);

      try {
        // If user is logged in, create conversation and session in database
        if (user?.id) {
          // Step 1: Create a new conversation for this brainstorm session
          const { data: newConversation, error: convError } = await supabase
            .from('conversations')
            .insert({
              user_id: user.id,
              title: 'Voice Brainstorm Session',
            })
            .select()
            .single();

          if (convError) throw convError;
          if (!newConversation) throw new Error('Failed to create conversation');

          setConversationId(newConversation.id);
          logger.info('BrainstormView', `Created conversation: ${newConversation.id}`);

          // Invalidate sidebar queries to show conversation immediately
          queryClient.invalidateQueries({ queryKey: ['sidebar', 'recent'] });
          queryClient.invalidateQueries({ queryKey: ['sidebar', 'voice_sessions'] });

          // Step 2: Create brainstorm session
          createSession.mutate(
            { conversationId: newConversation.id },
            {
              onSuccess: (newSession) => {
                setSessionId(newSession.id);
                navigate(`/brainstorm/${newSession.id}`, { replace: true });
                setIsInitializing(false);
                logger.info('BrainstormView', `Created brainstorm session: ${newSession.id}`);
              },
              onError: (error) => {
                logger.error('BrainstormView', 'Failed to create brainstorm session', error);
                setInitError('Failed to initialize brainstorm session');
                setIsInitializing(false);
                initStartedRef.current = false; // Reset on error
              },
            }
          );
        } else {
          // Guest mode: Use temporary in-memory session
          const tempSessionId = `guest-${Date.now()}`;
          const tempConversationId = `guest-conv-${Date.now()}`;

          setSessionId(tempSessionId);
          setConversationId(tempConversationId);
          setIsInitializing(false);

          logger.info('BrainstormView', 'Created guest session (no login required)');
          logger.debug('BrainstormView', `Session ID: ${tempSessionId}`);
          logger.debug('BrainstormView', `Conversation ID: ${tempConversationId}`);
        }
      } catch (error) {
        logger.error('BrainstormView', 'Failed to initialize brainstorm', error);
        setInitError('Failed to create conversation');
        setIsInitializing(false);
        initStartedRef.current = false; // Reset on error
      }
    }

    initializeBrainstorm();
  }, [sessionId, user?.id, createSession, setSessionId, navigate]);

  // Handle voice-triggered CAD generation (creates v1 of new design)
  const handleGenerateVariations = useCallback(
    async (description: string) => {
      if (!sessionId || !conversationId) {
        const errorMsg = 'Session not initialized. Please refresh the page.';
        logger.error('BrainstormView', 'Session not initialized', { sessionId, conversationId });

        toast({
          title: 'Session Error',
          description: errorMsg,
          variant: 'destructive',
        });

        throw new Error(errorMsg);
      }

      // ✅ FIX: Allow parallel compilations for iterative voice design
      // BrainstormContext handles late-arriving blobs safely (lines 289-307)
      // Removing this check enables users to say "make it bigger" while v1 is still compiling

      // Show loading toast and set generating state
      setIsGenerating(true);

      const loadingToast = toast({
        title: 'Generating CAD Model',
        description: 'AI is creating v1 of your design...',
      });

      try {
        logger.info('BrainstormView', `Generating CAD for conversation: ${conversationId}`);
        logger.debug('BrainstormView', `Description: ${description}`);

        // Create user message
        const userMessageId = crypto.randomUUID();
        const assistantMessageId = crypto.randomUUID();

        // Insert user message to database
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        // 🔧 FIX: Add .select().single() to wait for insert confirmation and prevent race condition
        const { data: insertedMessage, error: insertError } = await supabase
          .from('messages')
          .insert({
            id: userMessageId,
            conversation_id: conversationId,
            role: 'user',
            content: { text: description },
            parent_message_id: null,
          })
          .select()
          .single();

        if (insertError) {
          logger.error('BrainstormView', 'Failed to insert user message', insertError);
          throw new Error(`Failed to insert message: ${insertError.message}`);
        }

        if (!insertedMessage) {
          logger.error('BrainstormView', 'Message insert returned no data');
          throw new Error('Failed to insert message: No data returned');
        }

        logger.info('BrainstormView', `✓ User message inserted and confirmed: ${userMessageId}`);
        logger.debug('BrainstormView', `Message description: "${description}"`);

        // 🔧 DEBUG: Log Edge Function request
        const edgeFunctionRequest = {
          conversationId,
          messageId: userMessageId,
          model: 'metroboomin', // Best model for voice mode (extended thinking)
          newMessageId: assistantMessageId,
        };
        logger.info('BrainstormView', '📤 Calling chat Edge Function...');
        logger.debug('BrainstormView', `Request body: ${JSON.stringify(edgeFunctionRequest)}`);

        // Call the same chat Edge Function as text-to-CAD
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(edgeFunctionRequest),
          }
        );

        if (!response.ok) {
          throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
        }

        logger.info('BrainstormView', 'Chat response received, streaming...');

        // Stream the response (same as text-to-CAD)
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No reader available');
        }

        const decoder = new TextDecoder();
        let leftover = '';
        let finalMessage: any = null;

        loadingToast.update({
          id: loadingToast.id,
          title: 'Compiling Model',
          description: 'Processing OpenSCAD code...',
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          leftover += decoder.decode(value, { stream: true });
          const lines = leftover.split('\n');
          leftover = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            try {
              const data = JSON.parse(line);
              finalMessage = data;
              logger.debug('BrainstormView', `Received message update: ${data.id}`);
            } catch (e) {
              logger.warn('BrainstormView', `Failed to parse line: ${line}`);
            }
          }
        }

        // 🔧 DETAILED RESPONSE LOGGING: Diagnose what Edge Function returned
        logger.info('BrainstormView', '📥 Edge Function response received');

        if (!finalMessage) {
          logger.error('BrainstormView', '❌ No finalMessage returned from chat API');
          throw new Error('No CAD model generated: API returned no message');
        }

        logger.debug('BrainstormView', `finalMessage keys: ${Object.keys(finalMessage).join(', ')}`);
        logger.debug('BrainstormView', `finalMessage.id: ${finalMessage.id}`);
        logger.debug('BrainstormView', `finalMessage.role: ${finalMessage.role}`);

        if (!finalMessage.content) {
          logger.error('BrainstormView', '❌ finalMessage.content is missing');
          logger.error('BrainstormView', `Full finalMessage: ${JSON.stringify(finalMessage).substring(0, 500)}`);
          throw new Error('No CAD model generated: Response has no content');
        }

        logger.debug('BrainstormView', `content keys: ${Object.keys(finalMessage.content).join(', ')}`);

        if (!finalMessage.content.artifact) {
          logger.error('BrainstormView', '❌ finalMessage.content.artifact is MISSING!');
          logger.error('BrainstormView', `This means the Edge Function returned a text response instead of OpenSCAD code`);

          // Log what we got instead
          if (finalMessage.content.text) {
            logger.error('BrainstormView', `Edge Function returned TEXT response (first 500 chars):`);
            logger.error('BrainstormView', finalMessage.content.text.substring(0, 500));
          }

          if (finalMessage.content.model) {
            logger.error('BrainstormView', `Model used: ${finalMessage.content.model}`);
          }

          logger.error('BrainstormView', `Full content object: ${JSON.stringify(finalMessage.content).substring(0, 1000)}`);

          throw new Error('No CAD model generated: Edge Function returned text response instead of artifact. Check if system prompt is being used correctly.');
        }

        logger.info('BrainstormView', '✓ Artifact found in response!');

        // Use the real assistant message ID from the database
        const realAssistantMessageId = finalMessage.id || assistantMessageId;

        logger.info('BrainstormView', 'CAD model generated successfully');
        logger.debug('BrainstormView', `Assistant message ID: ${realAssistantMessageId}`);
        logger.debug('BrainstormView', `Code length: ${finalMessage.content.artifact.code.length}`);
        logger.debug('BrainstormView', `Parameters: ${finalMessage.content.artifact.parameters.length}`);

        // Convert to single variation format
        const variation: BrainstormVariation = {
          variation_index: 0,
          title: finalMessage.content.artifact.title || 'Design',
          code: finalMessage.content.artifact.code,
          parameters: finalMessage.content.artifact.parameters,
        };

        logger.info('BrainstormView', 'Generated variation from API');
        logger.debug('BrainstormView', `Code preview: ${variation.code.substring(0, 100)}...`);

        // Update loading toast
        loadingToast.update({
          id: loadingToast.id,
          title: 'Compiling Model',
          description: 'Compiling v1 of your design...',
        });

        logger.compile('BrainstormView', `Starting compilation for v1`);
        logger.debug('BrainstormView', `Session ID: ${sessionId}`);
        logger.debug('BrainstormView', `Message ID: ${realAssistantMessageId}`);

        // Compile the variation with the real message ID
        await compileVariations([variation], sessionId, realAssistantMessageId);

        logger.compile('BrainstormView', 'Compilation complete for v1');

        // Store the variation for refinement
        setCurrentVariation(variation);

        // Show success toast
        loadingToast.update({
          id: loadingToast.id,
          title: 'Design Created!',
          description: 'v1 is now visible in the viewport',
          variant: 'default',
        });

        logger.info('BrainstormView', 'Generate variations complete - v1 created');

        // Auto-dismiss success toast after 3 seconds
        setTimeout(() => {
          loadingToast.dismiss();
        }, 3000);

        setIsGenerating(false);

      } catch (error) {
        setIsGenerating(false);

        logger.error('BrainstormView', 'Error generating variations', error);
        logger.debug('BrainstormView', `Description: ${description}`);
        logger.debug('BrainstormView', `Session ID: ${sessionId}`);
        logger.debug('BrainstormView', `Conversation ID: ${conversationId}`);

        if (error instanceof Error) {
          logger.debug('BrainstormView', `Error message: ${error.message}`);

          // Check for common error types
          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            logger.error('BrainstormView', 'Network/CORS error - Supabase not responding');
          } else if (error.message.includes('Not authenticated')) {
            logger.error('BrainstormView', 'Authentication error - user not logged in');
          }
        }

        // Dismiss loading toast
        loadingToast.dismiss();

        // Show error toast with specific message
        let errorMessage = error instanceof Error ? error.message : 'Failed to generate variations';

        // Provide user-friendly error messages
        if (errorMessage.includes('Failed to fetch')) {
          errorMessage = 'Cannot connect to AI service. Please check if the backend is running.';
        }

        toast({
          title: 'Generation Failed',
          description: errorMessage,
          variant: 'destructive',
        });

        throw error;
      }
    },
    [sessionId, conversationId, currentDesign, compileVariations]
  );

  // Handle variation refinement (creates v2, v3, v4... of current design)
  const handleRefineVariation = useCallback(
    async (variationIndex: number, modifications: string) => {
      const currentVersion = currentDesign?.latestVersion.version_number || 1;
      const nextVersion = currentVersion + 1;

      logger.info('BrainstormView', `━━━ Refining v${currentVersion} → v${nextVersion} ━━━`);
      logger.info('BrainstormView', `Modifications: "${modifications}"`);

      if (!sessionId || !conversationId) {
        throw new Error('Session not initialized');
      }

      if (!currentVariation) {
        throw new Error('No design to refine. Please generate a design first.');
      }

      if (!currentDesign) {
        throw new Error('No current design. Please generate a design first.');
      }

      // ✅ FIX: Allow parallel compilations for iterative voice design
      // BrainstormContext handles late-arriving blobs safely (lines 289-307)
      // This enables rapid voice iterations: "make it bigger" → "add holes" → "make it taller"

      const originalVariation = currentVariation;

      // Set generating state to show loading indicator
      setIsGenerating(true);

      // Show loading toast
      const loadingToast = toast({
        title: 'Refining Design',
        description: `Creating v${nextVersion} with your modifications...`,
      });

      try {
        logger.info('BrainstormView', `Refining design: v${nextVersion - 1} → v${nextVersion}`);
        logger.debug('BrainstormView', `Modifications: ${modifications}`);

        // Get the current message ID to use as parent
        // The currentDesign has a message_id that we need to link to
        const parentMessageId = currentDesign.latestVersion.message_id || null;

        logger.debug('BrainstormView', `Parent message ID: ${parentMessageId}`);

        // ✅ Match text-to-CAD: Pass user intent directly to backend
        // Backend has complete safety rules in system prompt (chat/index.ts:723-762)
        // No need for duplicate/incomplete rules here
        const refinedDescription = modifications;

        // Create user message with modifications (this creates v2, v3, etc.)
        const userMessageId = crypto.randomUUID();
        const assistantMessageId = crypto.randomUUID();

        // Insert user message to database
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const { error: insertError } = await supabase.from('messages').insert({
          id: userMessageId,
          conversation_id: conversationId,
          role: 'user',
          content: { text: refinedDescription },
          parent_message_id: parentMessageId, // Link to parent version!
        });

        if (insertError) {
          logger.error('BrainstormView', 'Failed to insert user message for refinement', insertError);
          throw new Error(`Failed to insert message: ${insertError.message}`);
        }

        logger.debug('BrainstormView', `User refinement message inserted: ${userMessageId}`);

        // Call the same chat Edge Function (this creates the version chain like text-to-CAD)
        logger.info('BrainstormView', `Calling chat Edge Function for v${nextVersion}`);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              conversationId,
              messageId: userMessageId,
              model: 'pierre', // Use Pierre model
              newMessageId: assistantMessageId,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('BrainstormView', `Chat Edge Function failed (${response.status}): ${errorText}`);
          throw new Error(`Failed to generate v${nextVersion}: ${response.status} ${response.statusText}`);
        }

        logger.info('BrainstormView', `Chat response received for v${nextVersion}, streaming...`);

        // Stream the response (same as text-to-CAD)
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No reader available');
        }

        const decoder = new TextDecoder();
        let leftover = '';
        let finalMessage: any = null;

        loadingToast.update({
          id: loadingToast.id,
          title: `Creating v${nextVersion}`,
          description: 'Processing OpenSCAD code...',
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          leftover += decoder.decode(value, { stream: true });
          const lines = leftover.split('\n');
          leftover = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            try {
              const data = JSON.parse(line);
              finalMessage = data;
              logger.debug('BrainstormView', `Received message update: ${data.id}`);
            } catch (e) {
              logger.warn('BrainstormView', `Failed to parse line: ${line}`);
            }
          }
        }

        if (!finalMessage || !finalMessage.content?.artifact) {
          logger.error('BrainstormView', 'Chat Edge Function returned no artifact');
          throw new Error('No CAD model generated - chat response incomplete');
        }

        if (!finalMessage.content.artifact.code) {
          logger.error('BrainstormView', 'Chat Edge Function returned artifact with no code');
          throw new Error('No CAD code generated - artifact incomplete');
        }

        logger.info('BrainstormView', `v${nextVersion} CAD model generated successfully`);

        // Convert to single variation format
        const refinedVariation: BrainstormVariation = {
          variation_index: 0,
          title: finalMessage.content.artifact.title || `Design v${nextVersion}`,
          code: finalMessage.content.artifact.code,
          parameters: finalMessage.content.artifact.parameters,
        };

        // Update current variation for future refinements
        setCurrentVariation(refinedVariation);

        // Update loading toast
        loadingToast.update({
          id: loadingToast.id,
          title: `Compiling v${nextVersion}`,
          description: 'Compiling your refined design...',
        });

        // Compile the refined variation with the assistant message ID
        logger.info('BrainstormView', `Starting compilation for v${nextVersion}`);

        // ✅ SIMPLIFIED: No retry loop - just compile once
        // If it fails, user can speak again to try a different approach
        try {
          await compileVariations([refinedVariation], sessionId, assistantMessageId, true);
          logger.info('BrainstormView', `v${nextVersion} compilation complete`);
        } catch (compileError) {
          const errorMessage = compileError instanceof Error ? compileError.message : 'Unknown error';
          logger.error('BrainstormView', `v${nextVersion} compilation failed: ${errorMessage}`);

          // 🔍 DIAGNOSTIC: Log code comparison for failed compilations
          console.group(`🔍 [v${currentVersion} → v${nextVersion} Generation Failed]`);
          console.error('User request:', modifications);
          console.error('AI generated code that failed to compile');

          console.group(`📄 Generated v${nextVersion} Code (failed to compile):`);
          console.log(refinedVariation.code);
          console.groupEnd();

          console.group('🔍 Error Details:');
          console.error('Error:', errorMessage);
          console.log('Code length:', refinedVariation.code?.length || 0, 'characters');
          console.log('Parameters:', refinedVariation.parameters?.length || 0);
          console.groupEnd();

          console.groupEnd();

          // Throw error to be caught by outer try-catch
          throw new Error(`Failed to compile v${nextVersion}: ${errorMessage}`);
        }

        // Show success toast
        loadingToast.update({
          id: loadingToast.id,
          title: `v${nextVersion} Created!`,
          description: `Design updated with your modifications`,
          variant: 'default',
        });

        setTimeout(() => loadingToast.dismiss(), 3000);

        logger.info('BrainstormView', `━━━ v${nextVersion} Created Successfully ━━━`);

        // Reset generating state on success
        setIsGenerating(false);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logger.error('BrainstormView', `v${nextVersion} creation failed: ${errorMessage}`);

        // Reset generating state on error
        setIsGenerating(false);

        loadingToast.dismiss();

        toast({
          title: `Failed to Create v${nextVersion}`,
          description: errorMessage,
          variant: 'destructive',
        });

        throw error;
      }
    },
    [sessionId, conversationId, currentVariation, currentDesign, compileVariations]
  );

  // Design comparison and deletion are not needed in version control mode
  // Users navigate through version history instead

  // Loading state
  if (isLoadingSession || isInitializing || createSession.isPending) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-500" />
          <p className="text-sm text-muted-foreground">Initializing brainstorm session...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (initError || (!sessionId && !isInitializing && !createSession.isPending)) {
    return (
      <div className="flex items-center justify-center h-screen p-8">
        <div className="max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              {initError || 'Failed to initialize brainstorm session. Please try again.'}
            </AlertDescription>
          </Alert>
          <Button onClick={() => navigate('/')} className="w-full gap-2">
            <Home className="h-4 w-4" />
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  // Main view - Voice orb and 3D viewer
  return (
    <div className="flex h-screen overflow-hidden bg-black">
      {/* Left Panel: Voice Orb */}
      <div className="w-96 border-r border-neutral-800/50">
        <VoiceChat
          onGenerateVariations={handleGenerateVariations}
          onRefineVariation={handleRefineVariation}
          currentVariations={currentVariation ? [currentVariation] : []}
          isGenerating={isGenerating}
          className="h-full"
          userId={user?.id}
          conversationId={conversationId ?? undefined}
          brainstormSessionId={sessionId ?? undefined}
        />
      </div>

      {/* Right Panel: 3D Viewer - Displays compiled models from BrainstormContext */}
      <div className="flex-1">
        <MultiViewport isGenerating={isGenerating} />
      </div>
    </div>
  );
}
