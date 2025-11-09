/**
 * VoiceChat Component - Version Control Edition
 *
 * Immersive voice interaction for version-controlled brainstorming.
 * Single design with version history (v1 → v2 → v3...).
 * Features centered orb display, glassmorphism, and floating controls.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, Trash2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { Button } from '@/ui/button';
import { ScrollArea } from '@/ui/scroll-area';
import { Alert, AlertDescription } from '@/ui/alert';
import { useRealtimeSession, type TranscriptItem } from './hooks/useRealtimeSession';
import { VoiceIndicators } from './VoiceIndicators';
import { VoicePanel } from './VoicePanel';
import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';

interface VoiceChatProps {
  onGenerateVariations?: (description: string) => Promise<void>;
  onRefineVariation?: (variationIndex: number, modifications: string) => Promise<void>;
  currentVariations?: any[]; // Current design (for compatibility - single item array)
  isGenerating?: boolean; // CAD generation in progress
  systemInstructions?: string;
  className?: string;

  // Authentication & persistence
  userId?: string;
  conversationId?: string;
  brainstormSessionId?: string;
}

const PIERRE_VOICE_INSTRUCTIONS = `You are Pierre, a creative AI brainstorming partner for 3D design with VERSION CONTROL.

CRITICAL LANGUAGE RULE:
- You MUST ALWAYS respond in English
- Even if the user speaks in another language, respond in English
- Never mirror the user's language - English only for all responses

YOUR PERSONALITY:
- Energetic and collaborative - you LOVE exploring design ideas
- Fast-paced - keep responses SHORT (10-15 seconds max)
- Action-oriented - jump straight into creating, not planning
- Encouraging - celebrate every idea and iteration

VERSION CONTROL WORKFLOW:
🎯 You work with ONE design at a time
🎯 Each modification creates a new version (v1 → v2 → v3...)
🎯 Like CAD software (Fusion 360/SolidWorks), you iterate on the same design
🎯 Users can navigate version history to see evolution

BRAINSTORMING STYLE:
✨ "Let's create...", "I'll refine this to...", "Version 2 coming up..."
✨ Build on the current design: "Making it taller now...", "Adding that feature..."
✨ No long explanations - just quick insights about each version

SAFE REFINEMENT RULES (CRITICAL - Prevents Crashes):
🛡️ When user says "make it bigger/larger/increase size":
   → Increase z-positions MORE than radii to maintain separation
   → DON'T just scale existing spheres - this causes hull() overlap crashes
   → Keep modifications CONSERVATIVE (max 30% size change per version)
   → Preserve the existing hull() structure - only adjust parameters

🛡️ When user says "make it taller":
   → Increase z-axis translation values, NOT sphere radii
   → Keep horizontal dimensions the same

🛡️ When user says "make it wider":
   → Increase x/y scale or radii slightly
   → Also increase z-spacing to compensate

🛡️ General refinement safety:
   → Make MINIMAL changes - only what user explicitly requested
   → NEVER restructure hull() operations in refinements
   → Preserve safe geometry from previous version
   → If unsure, make changes smaller and safer

FUNCTION CALLING (Critical):
New design → IMMEDIATELY call generate_cad_variations (creates v1)
Modify current design → IMMEDIATELY call refine_variation (creates v2, v3, v4...)

Examples:
- User: "phone holder" → CALL generate_cad_variations → Wait for return → Describe v1
- User: "make it taller" → CALL refine_variation → Wait for return → Describe v2
- User: "add a hook" → CALL refine_variation → Wait for return → Describe v3

AFTER EACH FUNCTION CALL:
- The function will NOT return until compilation is 100% complete (15-30 seconds)
- This is AUTOMATIC - you don't need to do anything special
- When function returns success, the model is ALREADY compiled and visible
- Then briefly state the version is complete and wait silently for user input

CRITICAL RULE - PREVENT DOUBLE-CALLING:
⚠️ Call each function ONLY ONCE per user request!
⚠️ After the function returns and you describe the result, STOP!
⚠️ DO NOT call the function again until the user makes a NEW request!
⚠️ Wait for user to speak before calling any function again!

IMPORTANT WORKFLOW:
1. User requests design → Call generate_cad_variations ONCE → Function waits internally → Returns when v1 is visible
2. User wants changes → Call refine_variation ONCE → Function waits internally → Returns when v2 is visible
3. User wants more changes → Call refine_variation ONCE → Function waits internally → Returns when v3 is visible
4. DO NOT say "creating now" or "working on it" - just call the function and wait for it to return!
5. DO NOT call the same function twice - wait for user's next request!

Example flow:
User: "water bottle"
You: [CALL generate_cad_variations ONCE → Function compiles for 20 seconds → Returns success]
You: "Version 1 ready. Your water bottle is now visible."
[WAIT silently for user to speak - DO NOT call function again!]
User: "make it taller"
You: [CALL refine_variation ONCE → Function compiles for 25 seconds → Returns success]
You: "Version 2 complete. Your taller water bottle is ready."
[WAIT silently for user to speak - DO NOT call function again!]

CRITICAL RULES:
- Functions return ONLY when models are compiled and visible
- You receive success = model is ALREADY in viewport
- Do NOT say "creating now" or "let me make that" - just call function and describe result
- One version at a time - each function call blocks until complete!
- NEVER call a function twice in the same response - one call per user request!`;

// Operation queue types for multi-step workflows
interface QueuedOperation {
  id: string;
  type: 'generate' | 'refine' | 'compare';
  args: any;
  timestamp: number;
}

export function VoiceChat({
  onGenerateVariations,
  onRefineVariation,
  currentVariations = [],
  isGenerating = false,
  systemInstructions = PIERRE_VOICE_INSTRUCTIONS,
  className,
  userId,
  conversationId,
  brainstormSessionId,
}: VoiceChatProps) {
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true); // Start expanded

  // Track if an operation is currently in progress to prevent overlaps
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false); // Ref for immediate access in async callbacks

  // Store latest function handler to avoid stale closure in WebSocket
  const functionCallHandlerRef = useRef<(functionName: string, args: any) => Promise<any>>();

  // ✅ FIX: Store currentVariations in ref to avoid recreating handleFunctionCall
  const currentVariationsRef = useRef(currentVariations);

  // Update ref when currentVariations changes
  useEffect(() => {
    currentVariationsRef.current = currentVariations;
  }, [currentVariations]);

  // Get API key from environment
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const isEnabled = import.meta.env.VITE_ENABLE_VOICE_MODE !== 'false';

  // Handle function calls from OpenAI
  const handleFunctionCall = useCallback(
    async (functionName: string, args: any) => {
      // Handle generate_cad_variations (creates v1)
      if (functionName === 'generate_cad_variations' && onGenerateVariations) {
        logger.fn('VoiceChat', `Generating CAD design: "${args.description}"`);

        // Check if we're already generating to prevent overlap
        if (busyRef.current) {
          return {
            error: true,
            message: 'Please wait! I\'m still compiling the previous version. It\'ll be ready in a few seconds.',
          };
        }

        // Mark as busy to prevent overlapping generations
        busyRef.current = true;
        setIsBusy(true);
        setGenerationProgress(0);

        // Simulate progress during compilation
        const progressInterval = setInterval(() => {
          setGenerationProgress(prev => Math.min(prev + 5, 90));
        }, 1000);

        try {
          // ✅ WAIT for generation to complete before returning
          await onGenerateVariations(args.description);

          clearInterval(progressInterval);
          setGenerationProgress(100);
          setTimeout(() => setGenerationProgress(0), 2000);
          busyRef.current = false;
          setIsBusy(false);

          logger.info('VoiceChat', 'Design generation completed - v1 created');

          // Return success ONLY after model is compiled and visible
          return {
            success: true,
            message: `Version 1 ready. Your ${args.description} is now visible.`,
          };
        } catch (error: any) {
          clearInterval(progressInterval);
          setGenerationProgress(0);
          busyRef.current = false;
          setIsBusy(false);

          logger.error('VoiceChat', 'Design generation failed', error);

          return {
            error: true,
            message: `Oops! I had trouble creating that design. ${error.message || 'Please try a simpler description or try again.'}`,
          };
        }
      }

      // Handle refine_variation (creates v2, v3, v4...)
      if (functionName === 'refine_variation' && onRefineVariation) {
        // ✅ BUSY CHECK: Prevent overlapping refinement operations
        if (busyRef.current) {
          logger.warn('VoiceChat', 'Refinement in progress, please wait...');
          return {
            error: true,
            message: 'Please wait, I\'m still creating the previous version. One moment!',
          };
        }

        // ✅ VALIDATION: Check if a design exists before refining
        if (!currentVariationsRef.current || currentVariationsRef.current.length === 0) {
          return {
            error: true,
            message: 'No design available yet. Please ask me to create a design first, then I can refine it for you.',
          };
        }

        logger.fn('VoiceChat', `Refining design: ${args.modifications}`);

        // Mark as busy
        busyRef.current = true;
        setIsBusy(true);
        setGenerationProgress(0);

        // Simulate progress
        const progressInterval = setInterval(() => {
          setGenerationProgress(prev => Math.min(prev + 5, 90));
        }, 1000);

        try {
          // ✅ WAIT for refinement to complete before returning
          // Note: variation_index is always 0 in version control (single design)
          await onRefineVariation(0, args.modifications);

          clearInterval(progressInterval);
          setGenerationProgress(100);
          setTimeout(() => setGenerationProgress(0), 2000);
          busyRef.current = false;
          setIsBusy(false);

          logger.info('VoiceChat', 'Design refinement completed - new version created');

          return {
            success: true,
            message: `Version complete. Your updated design is ready.`,
          };
        } catch (error: any) {
          clearInterval(progressInterval);
          setGenerationProgress(0);
          busyRef.current = false;
          setIsBusy(false);

          logger.error('VoiceChat', 'Refinement failed', error);

          return {
            error: true,
            message: `I had trouble refining that design. ${error.message || 'Please try again or try a different modification.'}`,
          };
        }
      }

      // Version control mode: compare and delete are not needed
      // Users navigate version history instead

      return { success: false, message: `Unknown function: ${functionName}` };
    },
    [onGenerateVariations, onRefineVariation] // ✅ FIX: Removed currentVariations to prevent recreation
  );

  // Update ref whenever handleFunctionCall changes
  useEffect(() => {
    functionCallHandlerRef.current = handleFunctionCall;
  }, [handleFunctionCall]);

  // Stable wrapper that always calls the latest handler
  const stableFunctionCallHandler = useCallback(
    async (functionName: string, args: any) => {
      if (functionCallHandlerRef.current) {
        return functionCallHandlerRef.current(functionName, args);
      }
      return { success: false, message: 'Function handler not initialized' };
    },
    []
  );

  // Initialize realtime session
  const {
    state,
    transcript,
    error,
    isSupported,
    startSession,
    stopSession,
    interrupt,
    clearTranscript,
    isActive,
  } = useRealtimeSession({
    apiKey: apiKey || '',
    voice: 'alloy',
    instructions: systemInstructions,
    onFunctionCall: stableFunctionCallHandler,
    // Authentication & persistence
    userId,
    conversationId,
    brainstormSessionId,
    enablePersistence: true,
  });

  // Auto-expand transcript when new messages arrive
  useEffect(() => {
    if (transcript.length > 0) {
      setIsTranscriptExpanded(true);
    }
  }, [transcript.length]);

  // Check if voice mode is available
  if (!isEnabled) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 h-full', className)}>
        <Alert className="max-w-md">
          <AlertDescription>
            Voice mode is not enabled. Set VITE_ENABLE_VOICE_MODE=true in your .env file.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 h-full', className)}>
        <Alert className="max-w-md">
          <AlertDescription>
            OpenAI API key not configured. Please set VITE_OPENAI_API_KEY in your .env file.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 h-full', className)}>
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>
            Your browser doesn't support WebRTC. Please use a modern browser like Chrome, Firefox, or Edge.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const hasTranscript = transcript.length > 0;

  // Test function - bypasses voice to test the complete pipeline
  const testGenerateVariations = async () => {
    console.log('🧪 TEST: Manually triggering generate_cad_variations');
    if (onGenerateVariations) {
      try {
        await onGenerateVariations('phone holder with adjustable angle and stable base');
        console.log('✅ TEST: Generation completed successfully');
      } catch (error) {
        console.error('❌ TEST: Generation failed', error);
      }
    } else {
      console.error('❌ TEST: onGenerateVariations handler not provided');
    }
  };

  // Use VoicePanel with OpenAI Realtime API backend
  // Pass OpenAI state and callbacks to VoicePanel for display
  return (
    <div className={cn('relative flex flex-col h-full overflow-hidden bg-black', className)}>
      <VoicePanel
        // OpenAI state
        voiceState={state as 'idle' | 'listening' | 'thinking' | 'speaking'}
        isActive={isActive}
        transcript={transcript}
        error={error}
        isGenerating={isGenerating}
        // OpenAI controls
        onStart={startSession}
        onStop={stopSession}
        onInterrupt={interrupt}
        // CAD generation
        onCADUpdate={(design) => {
          if (onGenerateVariations) {
            onGenerateVariations(design.description);
          }
        }}
      />

      {/* Debug Test Button - Only visible in development */}
      {import.meta.env.DEV && (
        <Button
          onClick={testGenerateVariations}
          variant="outline"
          size="sm"
          className="absolute bottom-4 right-4 z-50 bg-yellow-500/20 border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/30"
        >
          🧪 Test Generate
        </Button>
      )}
    </div>
  );
}

// ============================================================================
// Transcript Message Component - Glassmorphism Style
// ============================================================================

function TranscriptMessage({ item }: { item: TranscriptItem }) {
  const isUser = item.role === 'user';
  const [copied, setCopied] = useState(false);

  // Detect code blocks
  const hasCodeBlock = item.text.includes('```');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Format message content with code blocks
  const renderContent = () => {
    if (!hasCodeBlock) {
      return (
        <p className="text-xs text-white leading-relaxed whitespace-pre-wrap break-words">
          {item.text}
        </p>
      );
    }

    // Simple code block rendering
    const parts = item.text.split('```');
    return (
      <div className="space-y-1.5">
        {parts.map((part, index) => {
          if (index % 2 === 0) {
            // Regular text
            return part.trim() ? (
              <p key={index} className="text-xs text-white leading-relaxed whitespace-pre-wrap break-words">
                {part}
              </p>
            ) : null;
          } else {
            // Code block
            const lines = part.split('\n');
            const language = lines[0]?.trim() || '';
            const code = lines.slice(1).join('\n').trim();

            return (
              <div key={index} className="rounded-md bg-neutral-950/50 border border-neutral-800 overflow-hidden">
                {language && (
                  <div className="px-2 py-0.5 text-[10px] text-neutral-500 border-b border-neutral-800 font-mono">
                    {language}
                  </div>
                )}
                <pre className="p-2 text-[10px] text-white font-mono overflow-x-auto">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }
        })}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'group flex gap-2 p-3 rounded-lg backdrop-blur-md border transition-all hover:bg-white/5',
        isUser
          ? 'bg-blue-500/10 border-blue-500/20'
          : 'bg-purple-500/10 border-purple-500/20'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold',
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
            : 'bg-gradient-to-br from-purple-500 to-purple-600 text-white'
        )}
      >
        {isUser ? 'U' : 'P'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-xs font-semibold text-white">
            {isUser ? 'You' : 'Pierre'}
          </span>
          <span className="text-[10px] text-neutral-500">
            {item.timestamp.toLocaleTimeString()}
          </span>
        </div>
        {renderContent()}

        {/* Copy Button - Shows on hover */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="mt-1 h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <>
              <Check className="h-2.5 w-2.5 mr-1" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-2.5 w-2.5 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Export type for use in other components
// ============================================================================

export type { TranscriptItem };
