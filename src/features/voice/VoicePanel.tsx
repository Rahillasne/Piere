import { useState, useEffect, useRef } from 'react';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Mic, MicOff, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TranscriptItem } from './hooks/useRealtimeSession';

interface VoicePanelProps {
  // External OpenAI state (controlled mode)
  voiceState?: 'idle' | 'listening' | 'thinking' | 'speaking';
  isActive?: boolean;
  transcript?: TranscriptItem[];
  error?: string | null;
  isGenerating?: boolean; // CAD generation in progress

  // External OpenAI controls (controlled mode)
  onStart?: () => void;
  onStop?: () => void;
  onInterrupt?: () => void;

  // CAD update callback
  onCADUpdate?: (design: { type: string; params: any; description: string }) => void;
}

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function VoicePanel({
  // External OpenAI state (controlled mode)
  voiceState: externalVoiceState,
  isActive: externalIsActive,
  transcript: externalTranscript,
  error: externalError,
  isGenerating = false,
  // External OpenAI controls
  onStart,
  onStop,
  onInterrupt,
  // CAD callback
  onCADUpdate,
}: VoicePanelProps) {
  // Internal state (used in uncontrolled mode / fallback)
  const [internalVoiceState, setInternalVoiceState] = useState<VoiceState>('idle');
  const [internalTranscript, setInternalTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [internalError, setInternalError] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [useTextMode, setUseTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Use external state if provided (controlled mode), otherwise use internal state
  const isControlled = externalVoiceState !== undefined;
  const voiceState = isControlled ? externalVoiceState : internalVoiceState;
  const isActive = isControlled ? (externalIsActive || false) : isRecording;
  const error = isControlled ? (externalError || '') : internalError;

  // Get latest transcript text
  const currentTranscript = isControlled
    ? (externalTranscript && externalTranscript.length > 0
        ? externalTranscript[externalTranscript.length - 1].text
        : '')
    : internalTranscript;

  useEffect(() => {
    // Only initialize browser speech recognition in uncontrolled mode
    if (isControlled) return;

    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setInternalVoiceState('listening');
        setInternalError('');
        setPermissionGranted(true);
      };

      recognitionRef.current.onresult = (event: any) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript;
        setInternalTranscript(transcript);

        if (event.results[current].isFinal) {
          handleVoiceCommand(transcript);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setInternalVoiceState('idle');
        setIsRecording(false);

        if (event.error === 'not-allowed') {
          setInternalError('Microphone access denied');
        } else if (event.error === 'no-speech') {
          setInternalError('No speech detected');
        } else {
          setInternalError(`Error: ${event.error}`);
        }
      };

      recognitionRef.current.onend = () => {
        setIsRecording(false);
      };
    } else {
      setInternalError('Speech not supported');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, [isControlled]);

  const generateCADResponse = (userMessage: string): { response: string; design: { type: string; params: any; description: string } } => {
    const lowerMsg = userMessage.toLowerCase();

    if (lowerMsg.includes('house') || lowerMsg.includes('building')) {
      return {
        response: "I've created a simple house design for you.",
        design: {
          type: 'house',
          params: { width: 200, height: 150, roofHeight: 80 },
          description: 'Simple house with roof',
        },
      };
    }

    if (lowerMsg.includes('table') || lowerMsg.includes('desk')) {
      return {
        response: "Here's a table design with a rectangular top and four legs.",
        design: {
          type: 'table',
          params: { width: 180, depth: 100, height: 80, legWidth: 10 },
          description: 'Rectangular table',
        },
      };
    }

    if (lowerMsg.includes('chair') || lowerMsg.includes('seat')) {
      return {
        response: "I've designed a chair with a seat, backrest, and four legs.",
        design: {
          type: 'chair',
          params: { width: 80, depth: 80, height: 120, backHeight: 60 },
          description: 'Simple chair',
        },
      };
    }

    if (lowerMsg.includes('box') || lowerMsg.includes('cube') || lowerMsg.includes('container')) {
      return {
        response: "Here's a box design.",
        design: {
          type: 'box',
          params: { width: 150, height: 150, depth: 150 },
          description: 'Cubic container',
        },
      };
    }

    if (lowerMsg.includes('bigger') || lowerMsg.includes('larger') || lowerMsg.includes('increase')) {
      return {
        response: "I've increased the size by 30%.",
        design: {
          type: 'modify',
          params: { scale: 1.3 },
          description: 'Scaled up design',
        },
      };
    }

    if (lowerMsg.includes('smaller') || lowerMsg.includes('decrease') || lowerMsg.includes('reduce')) {
      return {
        response: "I've reduced the size by 25%.",
        design: {
          type: 'modify',
          params: { scale: 0.75 },
          description: 'Scaled down design',
        },
      };
    }

    return {
      response: "I can help you design houses, tables, chairs, and boxes. Just describe what you'd like.",
      design: {
        type: 'default',
        params: {},
        description: 'Default view',
      },
    };
  };

  const handleVoiceCommand = (command: string) => {
    setInternalVoiceState('thinking');
    setInternalTranscript('');

    setTimeout(() => {
      const { response, design } = generateCADResponse(command);
      setAiResponse(response);
      if (onCADUpdate) {
        onCADUpdate(design);
      }
      speakResponse(response);
    }, 800);
  };

  const speakResponse = (text: string) => {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setInternalVoiceState('speaking');
    };

    utterance.onend = () => {
      setInternalVoiceState('idle');
      setAiResponse('');
    };

    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const toggleRecording = async () => {
    // Controlled mode: use OpenAI callbacks
    if (isControlled) {
      if (isActive) {
        // Stop OpenAI session
        if (onStop) {
          onStop();
        }
      } else {
        // Start OpenAI session
        if (onStart) {
          onStart();
        }
      }
      return;
    }

    // Uncontrolled mode: use browser speech recognition
    if (!recognitionRef.current) {
      setInternalError('Speech not supported');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      setInternalVoiceState('idle');
    } else {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        setInternalError('');
        window.speechSynthesis.cancel();
        setInternalTranscript('');
        setAiResponse('');
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Microphone permission error:', err);
        setInternalError('Microphone access denied');
      }
    }
  };

  const handleTextSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim()) return;

    const command = textInput;
    setTextInput('');
    setInternalTranscript(command);
    setInternalVoiceState('thinking');

    setTimeout(() => {
      const { response, design } = generateCADResponse(command);
      setAiResponse(response);
      if (onCADUpdate) {
        onCADUpdate(design);
      }
      setInternalVoiceState('idle');
    }, 800);
  };

  const handleQuickCommand = (command: string) => {
    setTextInput(command);
    setInternalTranscript(command);
    setInternalVoiceState('thinking');

    setTimeout(() => {
      const { response, design } = generateCADResponse(command);
      setAiResponse(response);
      if (onCADUpdate) {
        onCADUpdate(design);
      }
      setInternalVoiceState('idle');
    }, 800);
  };

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center overflow-hidden">
      {/* Main content container */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-10 px-6 w-full">

        {/* 3D Orb visualization - LARGE AND VISIBLE */}
        <div className="relative flex items-center justify-center flex-shrink-0" style={{ height: '320px', width: '320px' }}>
          <AnimatePresence mode="wait">
            {/* IDLE STATE - BLUE ORB */}
            {voiceState === 'idle' && !isGenerating && (
              <motion.div
                key="idle"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="absolute"
              >
                {/* Ambient blue glow */}
                <motion.div
                  className="absolute inset-0 w-64 h-64 rounded-full bg-blue-500/20 blur-3xl"
                  animate={{
                    scale: [1.5, 1.8, 1.5],
                    opacity: [0.3, 0.5, 0.3],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />

                {/* Main blue sphere - 48px size */}
                <motion.div
                  className="relative w-48 h-48"
                  animate={{
                    scale: [1, 1.08, 1],
                    y: [0, -20, 0],
                    x: [0, 8, 0],
                    rotateY: [0, 15, 0, -15, 0],
                    rotateX: [0, 8, 0, -8, 0],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  style={{
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-200 via-blue-300 to-blue-500 shadow-2xl"
                    style={{
                      boxShadow: '0 30px 80px rgba(59, 130, 246, 0.6), inset 0 0 60px rgba(255,255,255,0.2)'
                    }}
                  />
                  <motion.div
                    className="absolute top-8 left-8 w-28 h-28 rounded-full bg-gradient-to-br from-white/60 to-transparent blur-2xl"
                    animate={{
                      opacity: [0.6, 0.9, 0.6],
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  <motion.div
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-40 h-6 rounded-full bg-blue-900/40 blur-xl"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0.4, 0.3],
                    }}
                    transition={{
                      duration: 5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </motion.div>
              </motion.div>
            )}

            {/* LISTENING STATE - PURPLE ORB */}
            {voiceState === 'listening' && !isGenerating && (
              <motion.div
                key="listening"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="absolute flex items-center justify-center"
              >
                {/* Ambient purple glow */}
                <motion.div
                  className="absolute inset-0 w-72 h-72 rounded-full bg-purple-500/30 blur-3xl"
                  animate={{
                    scale: [1.3, 1.6, 1.3],
                    opacity: [0.4, 0.6, 0.4],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />

                {/* Purple ripple rings */}
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-48 h-48 rounded-full border-2 border-purple-500/40"
                    style={{
                      boxShadow: '0 0 30px rgba(147, 51, 234, 0.4)'
                    }}
                    animate={{
                      scale: [1, 2.5 + i * 0.4],
                      opacity: [0.6, 0],
                      rotate: [0, 180],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      delay: i * 0.4,
                      ease: "easeOut"
                    }}
                  />
                ))}

                {/* Main purple sphere */}
                <motion.div
                  className="relative w-48 h-48"
                  animate={{
                    scale: [1, 1.15, 1],
                    y: [0, -25, 0],
                    x: [0, 10, 0],
                    rotateX: [0, 20, -15, 0],
                    rotateY: [0, -15, 12, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  style={{
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-300 via-purple-400 to-purple-600 shadow-2xl"
                    style={{
                      boxShadow: '0 30px 80px rgba(147, 51, 234, 0.7), inset 0 0 60px rgba(255,255,255,0.25)'
                    }}
                  />
                  <motion.div
                    className="absolute top-8 left-8 w-28 h-28 rounded-full bg-gradient-to-br from-white/70 to-transparent blur-2xl"
                    animate={{
                      opacity: [0.6, 0.95, 0.6],
                      x: [0, 6, 0],
                      y: [0, 6, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  <motion.div
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-48 h-6 rounded-full bg-purple-900/50 blur-xl"
                    animate={{
                      scale: [1, 1.25, 1],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </motion.div>
              </motion.div>
            )}

            {/* THINKING STATE - ORANGE ORB */}
            {/* Show orange orb when AI is thinking OR when CAD is being generated */}
            {(voiceState === 'thinking' || voiceState === 'generating' || (isGenerating && voiceState !== 'speaking')) && (
              <motion.div
                key="thinking"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="absolute"
              >
                {/* Ambient orange glow */}
                <motion.div
                  className="absolute inset-0 w-64 h-64 rounded-full bg-orange-500/20 blur-3xl"
                  animate={{
                    scale: [1.5, 1.7, 1.5],
                    opacity: [0.3, 0.45, 0.3],
                  }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />

                {/* Rotating orange rings */}
                {[...Array(2)].map((_, i) => (
                  <motion.div
                    key={`ring-${i}`}
                    className="absolute w-60 h-60 rounded-full border border-orange-400/20"
                    style={{
                      boxShadow: '0 0 20px rgba(249, 115, 22, 0.15)'
                    }}
                    animate={{
                      rotate: [0, 360],
                      scale: [1, 1.05, 1],
                    }}
                    transition={{
                      rotate: {
                        duration: 12 + i * 4,
                        repeat: Infinity,
                        ease: "linear"
                      },
                      scale: {
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 3
                      }
                    }}
                  />
                ))}

                {/* Main orange sphere */}
                <motion.div
                  className="relative w-48 h-48"
                  animate={{
                    scale: [1, 1.06, 1],
                    y: [0, -18, 0],
                    x: [0, 6, 0],
                    rotateY: [0, 12, 0, -12, 0],
                    rotateX: [0, 6, 0, -6, 0],
                  }}
                  transition={{
                    duration: 7,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  style={{
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-200 via-orange-300 to-orange-500 shadow-2xl"
                    style={{
                      boxShadow: '0 30px 80px rgba(249, 115, 22, 0.5), inset 0 0 60px rgba(255,255,255,0.2)'
                    }}
                  />
                  <motion.div
                    className="absolute top-8 left-8 w-28 h-28 rounded-full bg-gradient-to-br from-white/65 to-transparent blur-2xl"
                    animate={{
                      opacity: [0.6, 0.85, 0.6],
                      scale: [1, 1.15, 1],
                    }}
                    transition={{
                      duration: 5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                  <motion.div
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-40 h-6 rounded-full bg-orange-900/35 blur-xl"
                    animate={{
                      scale: [1, 1.15, 1],
                      opacity: [0.3, 0.4, 0.3],
                    }}
                    transition={{
                      duration: 7,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </motion.div>

                {/* Gentle orange particles */}
                {[...Array(3)].map((_, i) => {
                  const angle = (i * 120);
                  return (
                    <motion.div
                      key={`particle-${i}`}
                      className="absolute w-2 h-2 rounded-full bg-orange-300/60"
                      style={{
                        left: '50%',
                        top: '50%',
                        boxShadow: '0 0 10px rgba(251, 146, 60, 0.6)'
                      }}
                      animate={{
                        x: [
                          Math.cos(angle * Math.PI / 180) * 70,
                          Math.cos((angle + 40) * Math.PI / 180) * 85,
                          Math.cos((angle + 80) * Math.PI / 180) * 70,
                        ],
                        y: [
                          Math.sin(angle * Math.PI / 180) * 70,
                          Math.sin((angle + 40) * Math.PI / 180) * 85,
                          Math.sin((angle + 80) * Math.PI / 180) * 70,
                        ],
                        opacity: [0.5, 0.8, 0.5],
                        scale: [1, 1.3, 1],
                      }}
                      transition={{
                        duration: 8,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 2.5,
                      }}
                    />
                  );
                })}
              </motion.div>
            )}

            {/* SPEAKING STATE - GREEN ORB */}
            {voiceState === 'speaking' && (
              <motion.div
                key="speaking"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="absolute flex items-center justify-center"
              >
                {/* Ambient green glow */}
                <motion.div
                  className="absolute inset-0 w-80 h-80 rounded-full bg-emerald-500/30 blur-3xl"
                  animate={{
                    scale: [1.3, 1.7, 1.3],
                    opacity: [0.5, 0.7, 0.5],
                  }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />

                {/* Green pulsing rings */}
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-48 h-48 rounded-full border-2 border-emerald-500/50"
                    style={{
                      boxShadow: '0 0 35px rgba(16, 185, 129, 0.4)'
                    }}
                    animate={{
                      scale: [1, 3 + i * 0.4],
                      opacity: [0.7, 0],
                      rotate: [0, 180],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeOut"
                    }}
                  />
                ))}

                {/* Main green sphere with dynamic movement */}
                <motion.div
                  className="relative w-48 h-48"
                  animate={{
                    scale: [1, 1.25, 1.1, 1.22, 1.15, 1.2, 1],
                    y: [0, -35, -10, -40, -5, -30, 0],
                    x: [0, 18, -15, 22, -18, 12, 0],
                    rotateY: [0, 35, -30, 40, -35, 25, 0],
                    rotateX: [0, -20, 18, -25, 15, -12, 0],
                    rotateZ: [0, 12, -12, 15, -15, 8, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: [0.34, 1.56, 0.64, 1],
                  }}
                  style={{
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-300 via-emerald-400 to-emerald-600 shadow-2xl"
                    style={{
                      boxShadow: '0 35px 90px rgba(16, 185, 129, 0.8), inset 0 0 70px rgba(255,255,255,0.3)'
                    }}
                  />
                  <motion.div
                    className="absolute top-6 left-6 w-32 h-32 rounded-full bg-gradient-to-br from-white/80 to-transparent blur-2xl"
                    animate={{
                      opacity: [0.7, 1, 0.7],
                      scale: [1, 1.4, 1],
                      x: [0, 12, 0],
                      y: [0, 12, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: [0.34, 1.56, 0.64, 1],
                    }}
                  />
                  <motion.div
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-52 h-8 rounded-full bg-emerald-900/50 blur-xl"
                    animate={{
                      scale: [1, 1.4, 1.2, 1.45, 1.25, 1.35, 1],
                      opacity: [0.4, 0.65, 0.5, 0.7, 0.55, 0.65, 0.4],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: [0.34, 1.56, 0.64, 1],
                    }}
                  />
                </motion.div>

                {/* Green radiating particles */}
                {[...Array(15)].map((_, i) => {
                  const angle = (i * 360) / 15;
                  return (
                    <motion.div
                      key={`particle-${i}`}
                      className="absolute w-3 h-3 rounded-full bg-emerald-400"
                      style={{
                        left: '50%',
                        top: '50%',
                        boxShadow: '0 0 12px rgba(52, 211, 153, 0.9)'
                      }}
                      animate={{
                        x: [0, Math.cos(angle * Math.PI / 180) * 90],
                        y: [0, Math.sin(angle * Math.PI / 180) * 90],
                        opacity: [1, 0.8, 0],
                        scale: [1, 1.5, 0],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        delay: i * 0.06,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  );
                })}

                {/* Orbiting green trails */}
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={`trail-${i}`}
                    className="absolute w-64 h-64 rounded-full border border-emerald-400/30"
                    animate={{
                      rotate: [0, 360],
                      scale: [1, 1.15, 1],
                    }}
                    transition={{
                      rotate: {
                        duration: 3 + i * 0.5,
                        repeat: Infinity,
                        ease: "linear"
                      },
                      scale: {
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.3
                      }
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Text content */}
        <div className="text-center space-y-3 min-h-[120px] flex flex-col items-center justify-center w-full flex-shrink-0">
          <AnimatePresence mode="wait">
            {/* Determine which single child to render - ensures only ONE child at a time */}
            {error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <p className="text-neutral-400 text-sm">{error}</p>
                <Button
                  onClick={() => {
                    if (!isControlled) {
                      setInternalError('');
                    }
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-neutral-500 hover:text-white hover:bg-neutral-900"
                >
                  Dismiss
                </Button>
              </motion.div>
            ) : isGenerating ? (
              <motion.p
                key="generating"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-orange-400 text-sm max-w-xs font-medium"
              >
                {currentTranscript || 'Generating CAD model...'}
              </motion.p>
            ) : voiceState === 'listening' && currentTranscript ? (
              <motion.p
                key="listening"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-white text-sm max-w-xs"
              >
                {currentTranscript}
              </motion.p>
            ) : voiceState === 'speaking' && aiResponse ? (
              <motion.p
                key="speaking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-neutral-300 text-sm leading-relaxed max-w-xs"
              >
                {aiResponse}
              </motion.p>
            ) : voiceState === 'idle' && aiResponse ? (
              <motion.p
                key="response"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-neutral-400 text-sm max-w-xs"
              >
                {aiResponse}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 w-full max-w-sm flex-shrink-0">
          {useTextMode ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-3"
            >
              <form onSubmit={handleTextSubmit} className="flex gap-2">
                <Input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Type command..."
                  className="bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-600 h-9 text-sm"
                />
                <Button
                  type="submit"
                  className="bg-white text-black hover:bg-neutral-200 h-9 px-4 text-sm"
                >
                  Send
                </Button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleQuickCommand('Create a house')}
                  variant="outline"
                  size="sm"
                  className="border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs"
                >
                  House
                </Button>
                <Button
                  onClick={() => handleQuickCommand('Design a table')}
                  variant="outline"
                  size="sm"
                  className="border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs"
                >
                  Table
                </Button>
                <Button
                  onClick={() => handleQuickCommand('Create a chair')}
                  variant="outline"
                  size="sm"
                  className="border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs"
                >
                  Chair
                </Button>
                <Button
                  onClick={() => handleQuickCommand('Make it bigger')}
                  variant="outline"
                  size="sm"
                  className="border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs"
                >
                  Bigger
                </Button>
              </div>

              <Button
                onClick={() => setUseTextMode(false)}
                variant="ghost"
                size="sm"
                className="w-full text-neutral-600 hover:text-neutral-400 text-xs"
              >
                <Mic className="w-3 h-3 mr-2" />
                Voice Mode
              </Button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.div
                whileHover={voiceState !== 'speaking' ? { scale: 1.05 } : undefined}
                whileTap={voiceState !== 'speaking' ? { scale: 0.95 } : undefined}
              >
                <Button
                  onClick={toggleRecording}
                  size="lg"
                  disabled={voiceState === 'speaking'}
                  className={`w-12 h-12 rounded-full transition-all ${
                    voiceState === 'speaking'
                      ? 'bg-neutral-800 cursor-not-allowed opacity-50'
                      : isActive
                      ? 'bg-neutral-700 hover:bg-neutral-600'
                      : 'bg-white hover:bg-neutral-200 text-black'
                  }`}
                >
                  {isActive ? (
                    <MicOff className="w-6 h-6 text-black" />
                  ) : (
                    <Mic className="w-6 h-6 text-black" />
                  )}
                </Button>
              </motion.div>

              <Button
                onClick={() => {
                  setUseTextMode(true);
                  if (!isControlled) {
                    setInternalError('');
                  }
                }}
                variant="ghost"
                size="sm"
                className="text-neutral-600 hover:text-neutral-400 text-xs"
              >
                <Keyboard className="w-3 h-3 mr-2" />
                Text Mode
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
