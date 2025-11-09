/**
 * useRealtimeSession Hook
 *
 * Manages OpenAI Realtime API session for voice-driven CAD brainstorming.
 * Handles WebRTC connection, audio streaming, and function calling.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import OpenAI from 'openai';
import * as voiceSessionService from '@/services/voiceSessionService';
import { logger } from '@/utils/logger';
import audioWorkletUrl from '../worklets/audio-input-processor.js?url';

// ============================================================================
// Types
// ============================================================================

export type VoiceState =
  | 'idle'           // Not connected
  | 'connecting'     // Establishing connection
  | 'listening'      // User is speaking
  | 'thinking'       // AI is processing
  | 'speaking'       // AI is responding
  | 'generating'     // CAD models are being generated
  | 'error';         // Error state

export interface RealtimeSessionConfig {
  apiKey: string;
  voice?: 'alloy' | 'echo' | 'shimmer';
  instructions?: string;
  onFunctionCall?: (functionName: string, args: any) => Promise<any>;

  // Database persistence (optional)
  conversationId?: string;
  brainstormSessionId?: string;
  userId?: string;
  enablePersistence?: boolean; // Default: true if userId is provided
}

export interface TranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

// ============================================================================
// Hook
// ============================================================================

export function useRealtimeSession(config: RealtimeSessionConfig) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  // Refs
  const clientRef = useRef<OpenAI | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBufferSourceNode[]>([]);
  const isPlayingAudioRef = useRef(false);
  const audioStartTimeRef = useRef(0);
  const isReceivingAudioRef = useRef(false); // Track if AI is actively sending audio

  // Function call accumulator for streaming function arguments
  const functionCallAccumulatorRef = useRef<{
    callId: string | null;
    name: string | null;
    arguments: string;
  }>({
    callId: null,
    name: null,
    arguments: '',
  });

  // Voice session persistence
  const voiceSessionIdRef = useRef<string | null>(null);
  const audioMetricsRef = useRef<voiceSessionService.AudioQualityMetrics>({
    maxQueueSize: 0,
    avgQueueSize: 0,
    chunksReceived: 0,
    chunksPlayed: 0,
    audioDropouts: 0,
    avgLatencyMs: 0,
    networkIssues: 0,
  });

  // Track message IDs for conversation threading
  const currentMessageLeafIdRef = useRef<string | null>(null);
  const lastUserMessageIdRef = useRef<string | null>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null);

  // Audio input streaming (microphone → OpenAI)
  const audioInputContextRef = useRef<AudioContext | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const isMicrophoneMutedRef = useRef(false); // Client-side mute during AI speech

  // ✅ FIX: Store handleRealtimeEvent in ref to avoid stale closure in WebSocket
  const handleRealtimeEventRef = useRef<((event: any) => void) | null>(null);

  // Check browser support
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'RTCPeerConnection' in window &&
      navigator.mediaDevices &&
      'getUserMedia' in navigator.mediaDevices;

    setIsSupported(supported);

    if (!supported) {
      setError('Your browser does not support WebRTC. Please use a modern browser.');
    }
  }, []);

  /**
   * Add transcript item
   */
  const addTranscript = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript(prev => [...prev, {
      id: Date.now().toString(),
      role,
      text,
      timestamp: new Date(),
    }]);
  }, []);

  /**
   * Start the Realtime session
   */
  const startSession = useCallback(async () => {
    if (!isSupported) {
      setError('WebRTC not supported');
      return;
    }

    try {
      setState('connecting');
      setError(null);

      // Initialize OpenAI client
      const client = new OpenAI({
        apiKey: config.apiKey,
        dangerouslyAllowBrowser: true, // Note: In production, use a backend proxy
      });
      clientRef.current = client;

      // Initialize audio context early
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      // Resume audio context (required for browsers)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('✅ AudioContext resumed');
      }

      // Get microphone permission and stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;
      console.log('🎤 Microphone access granted');

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Add audio track to connection
      const audioTrack = stream.getAudioTracks()[0];
      pc.addTrack(audioTrack);

      // Note: WebRTC track-based audio is not used with OpenAI Realtime API
      // Audio is received via WebSocket as PCM chunks (see response.audio.delta handler)
      // Keeping RTCPeerConnection for potential future use, but audio playback
      // is handled through Web Audio API queue system below

      // Create data channel for events
      const dataChannel = pc.createDataChannel('oai-events');
      dataChannelRef.current = dataChannel;

      // Handle data channel messages
      dataChannel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleRealtimeEvent(message);
        } catch (err) {
          console.error('Error parsing data channel message:', err);
        }
      };

      // Create SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Connect to OpenAI Realtime API via WebSocket
      // Note: Using model gpt-4o-realtime-preview-2024-10-01
      const model = 'gpt-4o-realtime-preview-2024-10-01';
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=${model}`,
        ['realtime', `openai-insecure-api-key.${config.apiKey}`]
      );
      wsRef.current = ws;

      // Wait for WebSocket connection
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          console.log('✅ WebSocket connected to OpenAI Realtime API');
          console.log('🔑 Using model: gpt-4o-realtime-preview-2024-10-01');
          resolve();
        };
        ws.onerror = (error) => {
          console.error('❌ WebSocket connection failed:', error);
          reject(new Error('WebSocket connection failed'));
        };
      });

      // Send session configuration
      const sessionConfig = {
        type: 'session.update',
        session: {
          type: 'realtime',
          output_modalities: ['audio'], // Audio mode includes transcript automatically
          instructions: config.instructions || 'You are a helpful AI assistant for CAD design brainstorming. IMPORTANT: Always respond in English. Help users explore design ideas and generate 3D models. Be conversational and helpful.',
          max_output_tokens: 1000,  // Allow ~60-80 seconds for complete brainstorming responses (prevents audio cutoff)
          audio: {
            input: {
              format: {
                type: 'audio/pcm',
                rate: 24000,
              },
              transcription: {
                model: 'whisper-1',
                language: 'en',  // Transcribe audio to English
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.6,                // Less sensitive to background noise
                prefix_padding_ms: 500,        // Capture full words at start
                silence_duration_ms: 1200,     // Wait 1200ms before responding to ensure AI audio fully completes
                create_response: true,         // Auto-respond when user finishes
                interrupt_response: false,     // Prevent user interruption - AI must finish speaking
              },
            },
            output: {
              format: {
                type: 'audio/pcm',
                rate: 24000,
              },
              voice: config.voice || 'alloy',
            },
          },
          // Tool calling strategy: 'auto' lets AI decide when to call functions
          // The system instructions explicitly force function calls for design requests
          // This balance allows natural greeting/conversation while ensuring functions are called when needed
          tool_choice: 'auto',
          tools: [
            {
              type: 'function',
              name: 'generate_cad_variations',
              description: `Generate a parametric CAD design based on user description. Call this when the user describes a NEW design they want to create.

Examples of when to call:
- "design a phone holder" → Call with description: "phone holder"
- "create a cable organizer for my desk" → Call with description: "cable organizer for desk"
- "I need a custom bracket to mount my camera" → Call with description: "custom camera mounting bracket"
- "make a simple cube" → Call with description: "cube"

This will generate a single parametric 3D model with adjustable parameters. The model will be compiled and displayed in the viewport, just like the text-to-CAD interface.`,
              parameters: {
                type: 'object',
                properties: {
                  description: {
                    type: 'string',
                    description: 'Complete description of the design to create. Include purpose, dimensions, constraints, and any specific requirements mentioned by the user.',
                  },
                },
                required: ['description'],
              },
            },
            {
              type: 'function',
              name: 'refine_variation',
              description: `Refine a specific design variation based on user feedback. Call this when user wants to MODIFY an existing design that's currently displayed.

Examples of when to call:
- "make variation 1 taller" → variation_index: 0, modifications: "increase height"
- "add rounded corners to the second design" → variation_index: 1, modifications: "add rounded corners"
- "make the first one thicker" → variation_index: 0, modifications: "increase wall thickness"
- "can you make design 3 have a wider base?" → variation_index: 2, modifications: "wider base"

NOTE: variation_index is 0-based (0=first, 1=second, 2=third, 3=fourth). When user says "variation 1" or "first design", use index 0. When they say "variation 2" or "second design", use index 1, etc.

This takes an existing variation and applies the requested modifications while maintaining the core design concept.`,
              parameters: {
                type: 'object',
                properties: {
                  variation_index: {
                    type: 'integer',
                    description: 'Which variation to refine (0-based index: 0=first, 1=second, 2=third, 3=fourth)',
                    minimum: 0,
                    maximum: 3,
                  },
                  modifications: {
                    type: 'string',
                    description: 'Detailed description of what to change. Be specific about dimensions, features to add/remove, or properties to adjust (e.g., "make it 10cm taller", "add rounded corners with 2mm radius", "increase wall thickness to 3mm")',
                  },
                },
                required: ['variation_index', 'modifications'],
              },
            },
            {
              type: 'function',
              name: 'compare_designs',
              description: `Compare specific design variations side-by-side. Call this when user wants to SEE DIFFERENCES or COMPARE multiple variations that are currently displayed.

Examples of when to call:
- "compare designs 1 and 3" → variation_indices: [0, 2]
- "what's different between them?" (referring to 2 designs) → variation_indices: [0, 1]
- "show me variations 2 and 4 side by side" → variation_indices: [1, 3]
- "compare all of them" → variation_indices: [0, 1, 2, 3]

NOTE: Indices are 0-based (0=first, 1=second, 2=third, 3=fourth). When user says "design 1" or "first variation", use index 0.

After calling this, you should verbally explain the key differences between the selected variations (structural differences, aesthetic choices, trade-offs, use cases).`,
              parameters: {
                type: 'object',
                properties: {
                  variation_indices: {
                    type: 'array',
                    items: { type: 'integer', minimum: 0, maximum: 3 },
                    description: 'Array of 0-based indices for variations to compare. Must include at least 2 variations (e.g., [0, 2] compares first and third designs)',
                    minItems: 2,
                    maxItems: 4,
                  },
                },
                required: ['variation_indices'],
              },
            },
            {
              type: 'function',
              name: 'delete_variation',
              description: `Delete a specific design variation from the viewport. Call this when user wants to REMOVE or DELETE a design they don't want anymore.

Examples of when to call:
- "delete variation 1" → variation_index: 0
- "remove the first design" → variation_index: 0
- "get rid of design 3" → variation_index: 2
- "delete the second one" → variation_index: 1

NOTE: variation_index is 0-based (0=first, 1=second, 2=third, 3=fourth). When user says "variation 1" or "first design", use index 0.

This removes the variation from the viewport and frees up space for new designs.`,
              parameters: {
                type: 'object',
                properties: {
                  variation_index: {
                    type: 'integer',
                    description: 'Which variation to delete (0-based index: 0=first, 1=second, 2=third, 3=fourth)',
                    minimum: 0,
                    maximum: 3,
                  },
                },
                required: ['variation_index'],
              },
            },
          ],
        },
      };

      console.log('📤 Sending session.update:', JSON.stringify(sessionConfig, null, 2));
      ws.send(JSON.stringify(sessionConfig));

      // Create voice session in database (if persistence enabled)
      const shouldPersist = config.enablePersistence !== false && config.userId;
      if (shouldPersist && config.conversationId) {
        const session = await voiceSessionService.createVoiceSession({
          conversationId: config.conversationId,
          brainstormSessionId: config.brainstormSessionId,
          userId: config.userId!,
          modelUsed: model,
          voiceUsed: config.voice || 'alloy',
        });

        if (session) {
          voiceSessionIdRef.current = session.id;
          console.log('💾 Voice session persisted:', session.id);
        }
      }

      // ========================================================================
      // Setup Audio Input Streaming (Microphone → OpenAI)
      // ========================================================================
      // Create audio input pipeline to capture microphone and send to OpenAI
      const audioInputContext = new AudioContext({ sampleRate: 24000 });
      const micSource = audioInputContext.createMediaStreamSource(stream);

      // Using AudioWorkletNode for real-time audio capture (replaces deprecated ScriptProcessorNode)
      try {
        // Load AudioWorklet processor module
        // Using Vite's ?url import to correctly bundle and transpile the worklet
        await audioInputContext.audioWorklet.addModule(audioWorkletUrl);

        // Create AudioWorkletNode
        const workletNode = new AudioWorkletNode(audioInputContext, 'audio-input-processor');

        // Handle messages from the worklet (audio data)
        workletNode.port.onmessage = (event) => {
          // Only send audio if WebSocket is open AND microphone is not muted
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
          }

          // CRITICAL: Don't send microphone audio when AI is speaking
          // This prevents echo, feedback, and accidental VAD triggers during AI responses
          if (isMicrophoneMutedRef.current) {
            return;
          }

          if (event.data.type === 'audio') {
            const pcm16: Int16Array = event.data.data;

            // Convert PCM16 to base64 for WebSocket transmission
            const uint8Array = new Uint8Array(pcm16.buffer);
            let binary = '';
            const len = uint8Array.byteLength;
            for (let i = 0; i < len; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const base64Audio = btoa(binary);

            // Send to OpenAI Realtime API
            try {
              wsRef.current.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64Audio,
              }));
            } catch (err) {
              console.error('❌ Error sending audio to OpenAI:', err);
            }
          }
        };

        // Connect audio pipeline (don't connect to destination - we don't want to hear ourselves)
        micSource.connect(workletNode);
        workletNode.connect(audioInputContext.destination); // Required for worklet to process

        // Store refs for cleanup
        audioInputContextRef.current = audioInputContext;
        audioWorkletNodeRef.current = workletNode;

        console.log('🎤 Microphone audio streaming to OpenAI started (using AudioWorklet)');
      } catch (err) {
        console.error('❌ Failed to initialize AudioWorklet:', err);
        throw new Error('Failed to initialize audio worklet. Please refresh the page.');
      }

      // Handle WebSocket messages
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // ✅ FIX: Use ref to always call latest event handler (avoids stale closure)
          handleRealtimeEventRef.current?.(message);

          // Handle SDP answer for WebRTC
          if (message.type === 'session.created') {
            console.log('✅ OpenAI Realtime session created successfully');
          }

          if (message.type === 'session.updated') {
            console.log('✅ Session configuration updated');

            // Send initial greeting to make AI speak first
            console.log('👋 Triggering initial AI greeting...');
            ws.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'user',
                content: [{
                  type: 'input_text',
                  text: 'Hello! Please introduce yourself briefly. I\'m ready to start designing.',
                }],
              },
            }));

            // Trigger AI response
            ws.send(JSON.stringify({
              type: 'response.create',
            }));
          }

          // Log errors from API
          if (message.type === 'error') {
            console.error('❌ API Error:', message.error);
            setError(`API Error: ${message.error?.message || 'Unknown error'}`);
            setState('error');
          }
        } catch (err) {
          console.error('❌ Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setError('Voice connection error');
        setState('error');
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        if (state !== 'error' && state !== 'idle') {
          setState('idle');
        }
      };

      setState('listening');
    } catch (err: any) {
      console.error('Error starting session:', err);
      setError(err.message || 'Failed to start voice session');
      setState('error');
      stopSession();
    }
  }, [isSupported, config.apiKey, config.voice, config.instructions]);

  /**
   * Play audio chunk with adaptive buffering to prevent queue buildup
   */
  const playAudioChunk = useCallback(async (audioBuffer: AudioBuffer) => {
    if (!audioContextRef.current) {
      console.error('❌ AudioContext not initialized');
      return;
    }

    const audioContext = audioContextRef.current;

    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log('✅ AudioContext resumed for playback');
      } catch (err) {
        console.error('❌ Failed to resume AudioContext:', err);
        setError('Audio playback blocked. Please click to enable audio.');
        return;
      }
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    // Calculate when to start this chunk with adaptive buffering
    const currentTime = audioContext.currentTime;
    let startTime = audioStartTimeRef.current;

    // Adaptive buffering based on queue health
    if (audioQueueRef.current.length === 0) {
      // First chunk: Start with 200ms buffer for smooth playback
      startTime = currentTime + 0.2;
    } else if (startTime < currentTime) {
      // Queue fell behind - use adaptive catch-up buffer
      const queueSize = audioQueueRef.current.length;

      // Dynamic buffer: smaller queue = shorter buffer, larger queue = more buffer
      const bufferTime = queueSize < 5
        ? 0.1  // Low queue - minimal 100ms buffer
        : queueSize < 15
          ? 0.15 // Medium queue - 150ms buffer
          : 0.2; // High queue - 200ms buffer for stability

      startTime = currentTime + bufferTime;
    }

    // Schedule playback
    source.start(startTime);

    // Update start time for next chunk
    audioStartTimeRef.current = startTime + audioBuffer.duration;

    // Clean up when done
    source.onended = () => {
      const index = audioQueueRef.current.indexOf(source);
      if (index > -1) {
        audioQueueRef.current.splice(index, 1);
      }

      // Update metrics
      audioMetricsRef.current.chunksPlayed++;

      // If queue is empty and AI finished sending, return to listening
      if (audioQueueRef.current.length === 0) {
        isPlayingAudioRef.current = false;

        // If AI has finished sending audio, wait for ALL audio to finish playing
        if (!isReceivingAudioRef.current) {
          // Calculate when the last scheduled audio will actually finish playing
          const currentTime = audioContextRef.current?.currentTime || 0;
          const lastAudioEndTime = audioStartTimeRef.current;
          const remainingPlaybackTime = Math.max(0, lastAudioEndTime - currentTime);

          // Wait for actual audio playback to complete, then add 1000ms buffer to prevent audio cutoff
          const totalDelay = (remainingPlaybackTime * 1000) + 1000;

          setTimeout(() => {
            // Double-check we're still done (user didn't interrupt)
            if (!isReceivingAudioRef.current && audioQueueRef.current.length === 0) {
              isMicrophoneMutedRef.current = false;
              audioStartTimeRef.current = 0;
              setState('listening');
            }
          }, totalDelay);
        } else {
          // AI still sending, just reset the start time
          audioStartTimeRef.current = 0;
        }
      }
    };

    // Add to queue
    audioQueueRef.current.push(source);
    isPlayingAudioRef.current = true;

    // Update audio quality metrics
    const currentQueueSize = audioQueueRef.current.length;
    const metrics = audioMetricsRef.current;
    metrics.chunksReceived++;
    metrics.maxQueueSize = Math.max(metrics.maxQueueSize, currentQueueSize);
    // Calculate running average queue size
    metrics.avgQueueSize = ((metrics.avgQueueSize * (metrics.chunksReceived - 1)) + currentQueueSize) / metrics.chunksReceived;
  }, []);

  /**
   * Handle realtime events from OpenAI
   */
  const handleRealtimeEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'conversation.item.created':
        if (event.item.role === 'user') {
          setState('thinking');
        }
        break;

      case 'response.created':
        setState('thinking');
        break;

      case 'response.audio.started':
      case 'response.output_audio.started':
      case 'response.output_item.added':
        setState('speaking');
        isReceivingAudioRef.current = true;
        isMicrophoneMutedRef.current = true;
        break;

      case 'response.audio.done':
      case 'response.output_audio.done':
        // Mark that AI has finished sending audio chunks
        isReceivingAudioRef.current = false;
        break;

      case 'response.done':
        // Full response is complete
        isReceivingAudioRef.current = false;
        break;

      case 'response.audio_transcript.delta':
      case 'response.output_audio_transcript.delta':
      case 'response.text.delta':
        if (event.delta) {
          // Update transcript with partial text from AI
          setTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { ...last, text: last.text + event.delta },
              ];
            } else {
              return [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                text: event.delta,
                timestamp: new Date(),
              }];
            }
          });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech has been transcribed
        if (event.transcript) {
          setTranscript(prev => [...prev, {
            id: Date.now().toString(),
            role: 'user',
            text: event.transcript,
            timestamp: new Date(),
          }]);

          // Save transcript AND create message in messages table
          if (voiceSessionIdRef.current && config.conversationId) {
            // Use current message leaf as parent (for conversation threading)
            const parentId = currentMessageLeafIdRef.current || lastAssistantMessageIdRef.current;

            voiceSessionService.saveTranscriptWithMessage({
              voiceSessionId: voiceSessionIdRef.current,
              conversationId: config.conversationId,
              role: 'user',
              transcript: event.transcript,
              isPartial: false,
              parentMessageId: parentId,
            }).then(({ message }) => {
              if (message) {
                console.log('💾 Saved user transcript + message:', message.id);
                // Track this as the last user message for threading
                lastUserMessageIdRef.current = message.id;
                currentMessageLeafIdRef.current = message.id;
              }
            }).catch(err => {
              console.error('Failed to save user transcript:', err);
            });
          }

          // Note: AI response is automatically triggered by create_response: true in turn_detection
        }
        break;

      case 'response.audio_transcript.done':
      case 'response.output_audio_transcript.done':
        // AI finished speaking, transcript is complete
        if (event.transcript) {
          setTranscript(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { ...last, text: event.transcript },
              ];
            } else {
              return [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                text: event.transcript,
                timestamp: new Date(),
              }];
            }
          });

          // Save transcript AND create message in messages table
          if (voiceSessionIdRef.current && config.conversationId) {
            // Use last user message as parent (for conversation threading)
            const parentId = lastUserMessageIdRef.current;

            voiceSessionService.saveTranscriptWithMessage({
              voiceSessionId: voiceSessionIdRef.current,
              conversationId: config.conversationId,
              role: 'assistant',
              transcript: event.transcript,
              isPartial: false,
              parentMessageId: parentId,
              // NOTE: CAD artifacts are handled separately by handleGenerateVariations/handleRefineVariation
              // These functions create their own messages with artifacts
            }).then(({ message }) => {
              if (message) {
                console.log('💾 Saved AI transcript + message:', message.id);
                // Track this as the last assistant message for threading
                lastAssistantMessageIdRef.current = message.id;
                currentMessageLeafIdRef.current = message.id;
              }
            }).catch(err => {
              console.error('Failed to save AI transcript:', err);
            });
          }
        }
        break;

      case 'response.audio.delta':
      case 'response.output_audio.delta':
        // Handle audio chunks from WebSocket
        if (event.delta) {
          try {
            // Decode base64 audio
            const audioData = atob(event.delta);
            const audioArray = new Uint8Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
              audioArray[i] = audioData.charCodeAt(i);
            }

            // Initialize audio context if needed
            if (!audioContextRef.current) {
              audioContextRef.current = new AudioContext({ sampleRate: 24000 });
            }

            // Create audio buffer
            const audioContext = audioContextRef.current;
            const audioBuffer = audioContext.createBuffer(1, audioArray.length / 2, 24000);
            const channelData = audioBuffer.getChannelData(0);

            // Fast PCM16 to Float32 conversion using DataView (10x faster)
            const dataView = new DataView(audioArray.buffer);
            for (let i = 0; i < audioArray.length / 2; i++) {
              const sample = dataView.getInt16(i * 2, true); // true = little-endian
              channelData[i] = sample / 32768; // Normalized to [-1, 1]
            }

            // Play using queue system for proper timing
            playAudioChunk(audioBuffer);
          } catch (err) {
            console.error('❌ Error processing audio delta:', err);
            setError('Audio playback error. Check console for details.');
          }
        }
        break;

      case 'response.function_call_arguments.delta':
        // Reset accumulator when starting a NEW function call
        if (event.call_id && event.call_id !== functionCallAccumulatorRef.current.callId) {
          functionCallAccumulatorRef.current = {
            callId: event.call_id,
            name: null,
            arguments: '',
          };
        }

        // Accumulate function arguments as they stream in
        if (event.delta) {
          functionCallAccumulatorRef.current.arguments += event.delta;
        }
        if (event.call_id) {
          functionCallAccumulatorRef.current.callId = event.call_id;
        }
        if (event.name) {
          functionCallAccumulatorRef.current.name = event.name;
        }
        break;

      case 'response.function_call_arguments.done':
        // Function arguments streaming complete
        // Actual execution happens in response.output_item.done
        break;

      case 'response.output_item.done':
        // Execute function from complete output item
        if (event.item?.type === 'function_call' && config.onFunctionCall) {
          const callId = event.item.call_id;
          const functionName = event.item.name;
          const argsString = event.item.arguments;

          // Reset accumulator
          functionCallAccumulatorRef.current = {
            callId: null,
            name: null,
            arguments: '',
          };

          if (functionName) {
            setState('generating');
            logger.info('Voice', `Executing function: ${functionName}`);

            try {
              const args = JSON.parse(argsString);

              config.onFunctionCall(functionName, args)
                .then((result) => {
                  logger.info('Voice', `Function ${functionName} completed`);

                  // Send result back to OpenAI
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'conversation.item.create',
                      item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify(result),
                      },
                    }));

                    // ✅ Trigger AI to describe the result - Server VAD won't auto-respond to function outputs
                    wsRef.current.send(JSON.stringify({
                      type: 'response.create',
                    }));
                  }
                })
                .catch((err) => {
                  logger.error('Voice', `Function ${functionName} failed: ${err.message}`);

                  // Send error to OpenAI
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'conversation.item.create',
                      item: {
                        type: 'function_call_output',
                        call_id: callId,
                        output: JSON.stringify({
                          error: true,
                          message: err.message,
                        }),
                      },
                    }));

                    // Trigger AI response to explain error
                    wsRef.current.send(JSON.stringify({
                      type: 'response.create',
                    }));
                  }
                });
            } catch (parseErr) {
              logger.error('Voice', `Failed to parse function arguments: ${parseErr}`);
              setState('listening');
            }
          }
        }
        break;

      case 'error':
        console.error('Realtime API error:', event.error);
        setError(event.error.message || 'An error occurred');
        setState('error');
        break;
    }
  }, [config.onFunctionCall, playAudioChunk]);

  // ✅ FIX: Update ref when handleRealtimeEvent changes to avoid stale closures
  useEffect(() => {
    handleRealtimeEventRef.current = handleRealtimeEvent;
  }, [handleRealtimeEvent]);

  /**
   * Stop the session and clean up
   */
  const stopSession = useCallback(async () => {
    // End voice session in database
    if (voiceSessionIdRef.current) {
      await voiceSessionService.endVoiceSession(
        voiceSessionIdRef.current,
        audioMetricsRef.current
      );
      voiceSessionIdRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop audio tracks
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    // Stop all queued audio sources
    audioQueueRef.current.forEach(source => {
      try {
        source.stop();
      } catch (err) {
        // Source may already be stopped
      }
    });
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    audioStartTimeRef.current = 0;

    // Disconnect and cleanup audio input worklet
    if (audioWorkletNodeRef.current) {
      try {
        audioWorkletNodeRef.current.disconnect();
        audioWorkletNodeRef.current.port.close();
      } catch (err) {
        // May already be disconnected
      }
      audioWorkletNodeRef.current = null;
    }

    // Close audio input context
    if (audioInputContextRef.current) {
      try {
        await audioInputContextRef.current.close();
      } catch (err) {
        // May already be closed
      }
      audioInputContextRef.current = null;
    }

    // Stop and cleanup audio element
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Close data channel
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    // Close peer connection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    clientRef.current = null;
    setState('idle');
  }, []);

  /**
   * Send a text message to the AI
   */
  const sendMessage = useCallback(async (text: string) => {
    if (state === 'idle' || !wsRef.current) {
      throw new Error('Session not active');
    }

    // GUARD: Prevent user input while AI is speaking
    if (state === 'speaking' || isMicrophoneMutedRef.current) {
      return;
    }

    addTranscript('user', text);

    // Send message via WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text,
        }],
      },
    }));

    // Trigger response
    wsRef.current.send(JSON.stringify({
      type: 'response.create',
    }));

    setState('thinking');
  }, [state, addTranscript]);

  /**
   * Interrupt the current response
   */
  const interrupt = useCallback(() => {
    if (!wsRef.current) return;

    // Cancel the AI response via WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'response.cancel',
    }));

    // Clear the entire audio queue to stop playback immediately
    audioQueueRef.current.forEach(source => {
      try {
        source.stop();
      } catch (err) {
        // Source may already be stopped
      }
    });
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    audioStartTimeRef.current = 0;
    isReceivingAudioRef.current = false;

    // UNMUTE: Allow user to speak after interrupting
    isMicrophoneMutedRef.current = false;
    setState('listening');
  }, []);

  /**
   * Manually trigger AI response (useful for manual turn-taking control)
   */
  const triggerResponse = useCallback(() => {
    if (!wsRef.current) {
      return;
    }

    // GUARD: Prevent triggering response while AI is speaking
    if (state === 'speaking' || isMicrophoneMutedRef.current) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'response.create',
    }));

    setState('thinking');
  }, [state]);

  /**
   * Clear transcript
   */
  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  return {
    // State
    state,
    transcript,
    error,
    isSupported,

    // Actions
    startSession,
    stopSession,
    sendMessage,
    interrupt,
    triggerResponse,
    clearTranscript,

    // Helpers
    isActive: state !== 'idle' && state !== 'error',
    isConnecting: state === 'connecting',
    isListening: state === 'listening',
    isSpeaking: state === 'speaking',
    isGenerating: state === 'generating',
  };
}
