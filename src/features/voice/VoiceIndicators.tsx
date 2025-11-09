/**
 * VoiceIndicators Component - Premium Voice UI
 *
 * Unified orb-based visual feedback inspired by OpenAI's ChatGPT and Claude's voice interfaces.
 * Features glassmorphism, smooth animations, and audio-reactive waveforms.
 */

import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VoiceState } from './hooks/useRealtimeSession';

interface VoiceIndicatorsProps {
  state: VoiceState;
  transcript?: string;
  progress?: number; // 0-100 for generation progress
  audioLevel?: number; // 0-1 for real-time audio visualization
}

export function VoiceIndicators({
  state,
  transcript,
  progress,
  audioLevel = 0,
}: VoiceIndicatorsProps) {
  if (state === 'idle') {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 lg:gap-4 p-3 lg:p-4 max-h-full">
      {/* Unified Voice Orb */}
      <VoiceOrb state={state} audioLevel={audioLevel} progress={progress} />

      {/* State Label */}
      <div className="flex flex-col items-center gap-1.5 lg:gap-2">
        <StateLabel state={state} />
        {state === 'speaking' && transcript && (
          <LiveTranscript transcript={transcript} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Unified Voice Orb - The centerpiece of the voice UI
// ============================================================================

interface VoiceOrbProps {
  state: VoiceState;
  audioLevel?: number;
  progress?: number;
}

function VoiceOrb({ state, audioLevel = 0, progress }: VoiceOrbProps) {
  const [waveformHeights, setWaveformHeights] = useState<number[]>(
    Array(20).fill(0.3)
  );
  const [orbTransform, setOrbTransform] = useState({ x: 0, y: 0 });

  // Animate waveform bars based on state and audio level
  useEffect(() => {
    if (state === 'listening' || state === 'speaking') {
      const interval = setInterval(() => {
        setWaveformHeights(prev =>
          prev.map((_, i) => {
            const base = audioLevel || 0.3;
            const variation = Math.sin(Date.now() / 200 + i * 0.5) * 0.3;
            return Math.max(0.1, Math.min(1, base + variation));
          })
        );
      }, 50);
      return () => clearInterval(interval);
    } else if (state === 'thinking' || state === 'generating') {
      // Gentle pulse for thinking/generating
      const interval = setInterval(() => {
        setWaveformHeights(prev =>
          prev.map((_, i) => {
            const pulse = Math.sin(Date.now() / 500 + i * 0.3) * 0.15;
            return 0.4 + pulse;
          })
        );
      }, 50);
      return () => clearInterval(interval);
    }
  }, [state, audioLevel]);

  // Animate orb floating movement (Figma spec: large 20-40px movements)
  useEffect(() => {
    let animationFrame: number;

    const animate = () => {
      const time = Date.now();

      if (state === 'listening') {
        // Energetic movement (30px range)
        setOrbTransform({
          x: Math.sin(time / 300) * 30,
          y: Math.cos(time / 300) * 30,
        });
      } else if (state === 'thinking') {
        // Meditative movement (20px range)
        setOrbTransform({
          x: Math.sin(time / 500) * 20,
          y: Math.cos(time / 500) * 20,
        });
      } else if (state === 'speaking') {
        // Dynamic movement (40px range)
        setOrbTransform({
          x: Math.sin(time / 200) * 40,
          y: Math.cos(time / 200) * 40,
        });
      } else {
        // Idle - gentle float
        setOrbTransform({
          x: Math.sin(time / 1000) * 5,
          y: Math.cos(time / 1000) * 5,
        });
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [state]);

  // State-specific colors
  const colorConfig = getColorConfig(state);

  return (
    <div className="relative flex items-center justify-center">
      {/* Outermost glow ring (largest) - Huge movements for Figma design */}
      <div
        className={cn(
          'absolute inset-0 rounded-full transition-all duration-700 ease-out',
          state === 'connecting' && 'animate-ping opacity-20',
          state === 'listening' && 'animate-pulse-slow opacity-30',
          state === 'thinking' && 'animate-pulse-slow opacity-25',
          state === 'speaking' && 'animate-pulse opacity-30',
          state === 'generating' && 'animate-pulse-slow opacity-25'
        )}
        style={{
          width: '180px',
          height: '180px',
          background: `radial-gradient(circle, ${colorConfig.glow} 0%, transparent 70%)`,
          filter: 'blur(40px)',
          transform: state === 'listening' ? 'scale(1.3)' : state === 'thinking' ? 'scale(1.2)' : state === 'speaking' ? 'scale(1.4)' : 'scale(1)',
        }}
      />

      {/* Third ring (outer border glow) */}
      <div
        className="absolute rounded-full transition-all duration-500 border opacity-20"
        style={{
          width: '140px',
          height: '140px',
          borderColor: colorConfig.border,
          boxShadow: `0 0 25px ${colorConfig.glow}`,
        }}
      />

      {/* Second ring (middle) */}
      <div
        className="absolute rounded-full transition-all duration-500 border"
        style={{
          width: '110px',
          height: '110px',
          borderColor: colorConfig.border,
          background: `radial-gradient(circle, ${colorConfig.secondary} 0%, transparent 70%)`,
          opacity: 0.4,
        }}
      />

      {/* Inner ring (closest to main orb) */}
      <div
        className="absolute rounded-full transition-all duration-300 border-2"
        style={{
          width: '90px',
          height: '90px',
          borderColor: colorConfig.border,
          opacity: 0.3,
        }}
      />

      {/* Main orb container - 48px Figma spec - Glassmorphism */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full',
          'backdrop-blur-xl border shadow-2xl',
          state === 'error' && 'animate-shake',
          state === 'idle' && 'animate-[breathing_4s_ease-in-out_infinite]'
        )}
        style={{
          width: '48px',
          height: '48px',
          background: colorConfig.background,
          borderColor: colorConfig.border,
          boxShadow: `0 0 ${20 + (audioLevel || 0) * 50}px ${colorConfig.glow}, 0 8px 32px rgba(0, 0, 0, 0.4)`,
          transform: `translate(${orbTransform.x}px, ${orbTransform.y}px)`,
          transition: 'background 0.5s, border-color 0.5s, box-shadow 0.5s',
        }}
      >
        {/* Circular waveform visualization */}
        {(state === 'listening' || state === 'speaking') && (
          <CircularWaveform
            heights={waveformHeights}
            color={colorConfig.primary}
          />
        )}

        {/* Particle effect for thinking/generating */}
        {(state === 'thinking' || state === 'generating') && (
          <ParticleOrb color={colorConfig.primary} />
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="text-4xl">⚠️</div>
        )}

        {/* Connecting state */}
        {state === 'connecting' && (
          <div className="flex items-center justify-center">
            <div
              className="w-3 h-3 rounded-full animate-ping"
              style={{ background: colorConfig.primary }}
            />
          </div>
        )}

        {/* Progress indicator for generating */}
        {state === 'generating' && progress !== undefined && (
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-32">
            <div className="h-1 bg-black/20 rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-300 ease-out rounded-full"
                style={{
                  width: `${progress}%`,
                  background: colorConfig.primary,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Circular Waveform Visualization
// ============================================================================

interface CircularWaveformProps {
  heights: number[];
  color: string;
}

function CircularWaveform({ heights, color }: CircularWaveformProps) {
  const barCount = heights.length;
  const radius = 18; // Smaller radius for 48px orb

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {heights.map((height, i) => {
        const angle = (i / barCount) * 2 * Math.PI;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const barHeight = 3 + height * 12; // Scaled down for smaller orb

        return (
          <div
            key={i}
            className="absolute transition-all duration-100 ease-out rounded-full"
            style={{
              width: '1.5px',
              height: `${barHeight}px`,
              background: `linear-gradient(to top, ${color}, transparent)`,
              transform: `translate(${x}px, ${y}px) rotate(${angle}rad)`,
              transformOrigin: 'center',
              opacity: 0.7 + height * 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Particle Orb - For thinking/generating states
// ============================================================================

interface ParticleOrbProps {
  color: string;
}

function ParticleOrb({ color }: ParticleOrbProps) {
  const particleCount = 12;

  return (
    <div className="absolute inset-0">
      {[...Array(particleCount)].map((_, i) => {
        const angle = (i / particleCount) * 2 * Math.PI;
        const radius = 14; // Smaller radius for 48px orb
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        return (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full animate-pulse"
            style={{
              background: color,
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              animationDelay: `${i * 0.1}s`,
              animationDuration: '2s',
              opacity: 0.6,
            }}
          />
        );
      })}
      {/* Center core */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full animate-pulse"
        style={{
          background: `radial-gradient(circle, ${color}, transparent)`,
          animationDuration: '1.5s',
        }}
      />
    </div>
  );
}

// ============================================================================
// State Label
// ============================================================================

function StateLabel({ state }: { state: VoiceState }) {
  const config = getColorConfig(state);

  const labels = {
    connecting: 'Connecting...',
    listening: 'I\'m Listening',
    thinking: 'Thinking...',
    speaking: 'Pierre is Speaking',
    generating: 'Generating Models',
    error: 'Error',
    idle: '',
  };

  const descriptions = {
    connecting: 'Establishing voice connection',
    listening: '🎤 Start speaking - I can hear you!',
    thinking: 'Processing your request...',
    speaking: '🔊 Listen to my response - then you can speak again',
    generating: 'Creating your design variations',
    error: 'Something went wrong',
    idle: '',
  };

  return (
    <div className="flex flex-col items-center gap-1 lg:gap-1.5 px-2">
      <h3
        className="text-base lg:text-lg font-bold transition-colors duration-300"
        style={{ color: config.text }}
      >
        {labels[state]}
      </h3>
      {descriptions[state] && (
        <p className="text-[10px] lg:text-xs font-medium text-pierre-text-secondary px-2 lg:px-3 py-1 lg:py-1.5 rounded-full bg-black/20 text-center">
          {descriptions[state]}
        </p>
      )}

      {/* Extra visual cue for listening state */}
      {state === 'listening' && (
        <div className="flex items-center gap-1.5 lg:gap-2 mt-0.5 lg:mt-1">
          <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] lg:text-[10px] font-bold text-red-400 uppercase tracking-wider">
            LIVE - Speak Now
          </span>
          <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-red-500 animate-pulse" />
        </div>
      )}

      {/* Extra visual cue for speaking state */}
      {state === 'speaking' && (
        <div className="flex items-center gap-1.5 lg:gap-2 mt-0.5 lg:mt-1">
          <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] lg:text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
            AI Speaking - Listen
          </span>
          <div className="w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Live Transcript Display
// ============================================================================

function LiveTranscript({ transcript }: { transcript: string }) {
  return (
    <div className="mt-1.5 lg:mt-2 max-w-xs lg:max-w-sm w-full px-2">
      <div
        className="relative p-2 lg:p-3 rounded-lg lg:rounded-xl border backdrop-blur-md"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="flex items-start gap-1.5 lg:gap-2">
          <Volume2 className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] lg:text-xs text-pierre-text-primary leading-relaxed">
            {transcript}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Color Configuration for Each State
// ============================================================================

function getColorConfig(state: VoiceState) {
  const configs = {
    // Figma spec: Blue (idle), Purple (listening), Cyan (thinking), Green (speaking)
    idle: {
      primary: '#00A6FF', // pierre-blue (Figma: Blue idle)
      secondary: 'rgba(0, 166, 255, 0.2)',
      background: 'linear-gradient(135deg, rgba(0, 166, 255, 0.15) 0%, rgba(0, 166, 255, 0.1) 100%)',
      border: 'rgba(0, 166, 255, 0.3)',
      glow: 'rgba(0, 166, 255, 0.4)',
      text: '#00A6FF',
    },
    connecting: {
      primary: '#00A6FF', // pierre-blue
      secondary: 'rgba(0, 166, 255, 0.2)',
      background: 'linear-gradient(135deg, rgba(0, 166, 255, 0.15) 0%, rgba(0, 166, 255, 0.1) 100%)',
      border: 'rgba(0, 166, 255, 0.3)',
      glow: 'rgba(0, 166, 255, 0.4)',
      text: '#00A6FF',
    },
    listening: {
      primary: '#A855F7', // purple-500 (Figma: Purple listening)
      secondary: 'rgba(168, 85, 247, 0.2)',
      background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(233, 213, 255, 0.1) 100%)',
      border: 'rgba(168, 85, 247, 0.3)',
      glow: 'rgba(168, 85, 247, 0.4)',
      text: '#C084FC', // purple-400
    },
    thinking: {
      primary: '#06B6D4', // cyan-500 (Figma: Cyan thinking)
      secondary: 'rgba(6, 182, 212, 0.2)',
      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(103, 232, 249, 0.1) 100%)',
      border: 'rgba(6, 182, 212, 0.3)',
      glow: 'rgba(6, 182, 212, 0.4)',
      text: '#22D3EE', // cyan-400
    },
    speaking: {
      primary: '#10B981', // emerald-500 (Figma: Green speaking)
      secondary: 'rgba(16, 185, 129, 0.2)',
      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(167, 243, 208, 0.1) 100%)',
      border: 'rgba(16, 185, 129, 0.3)',
      glow: 'rgba(16, 185, 129, 0.4)',
      text: '#34D399', // emerald-400
    },
    generating: {
      primary: '#F59E0B', // amber-500
      secondary: 'rgba(245, 158, 11, 0.2)',
      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(252, 211, 77, 0.1) 100%)',
      border: 'rgba(245, 158, 11, 0.3)',
      glow: 'rgba(245, 158, 11, 0.4)',
      text: '#FBBF24', // amber-400
    },
    error: {
      primary: '#EF4444', // red-500
      secondary: 'rgba(239, 68, 68, 0.2)',
      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(252, 165, 165, 0.1) 100%)',
      border: 'rgba(239, 68, 68, 0.3)',
      glow: 'rgba(239, 68, 68, 0.4)',
      text: '#F87171', // red-400
    },
  };

  return configs[state];
}

// ============================================================================
// Waveform Component (Linear, for other uses)
// ============================================================================

interface WaveformProps {
  audioLevel?: number; // 0-1
  bars?: number;
  className?: string;
  color?: string;
}

export function Waveform({
  audioLevel = 0.5,
  bars = 15,
  className,
  color = '#3B82F6',
}: WaveformProps) {
  return (
    <div className={cn('flex items-center gap-1 h-12', className)}>
      {[...Array(bars)].map((_, i) => {
        const height = 8 + audioLevel * 40 * Math.sin(i * 0.5 + Date.now() / 200);
        return (
          <div
            key={i}
            className="w-1 rounded-full transition-all duration-100"
            style={{
              height: `${Math.max(8, height)}px`,
              background: `linear-gradient(to top, ${color}, transparent)`,
              opacity: 0.7,
            }}
          />
        );
      })}
    </div>
  );
}
