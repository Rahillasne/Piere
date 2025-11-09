/**
 * AudioWorklet Processor for Microphone Input
 *
 * Replaces deprecated ScriptProcessorNode with modern AudioWorkletNode.
 * Captures microphone audio and converts Float32 to PCM16 for OpenAI Realtime API.
 */

class AudioInputProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  /**
   * Process audio samples
   * @param {Float32Array[][]} inputs - Array of input audio buffers
   * @param {Float32Array[][]} outputs - Array of output audio buffers (not used)
   * @param {Object} parameters - Audio parameters (not used)
   * @returns {boolean} true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Check if we have valid input
    if (!input || !input[0]) {
      return true;
    }

    const samples = input[0]; // First channel (mono)

    // Convert Float32 samples to PCM16
    const pcm16 = this.float32ToPCM16(samples);

    // Send PCM16 data to main thread
    this.port.postMessage({
      type: 'audio',
      data: pcm16
    });

    return true; // Keep processor alive
  }

  /**
   * Convert Float32 audio samples to PCM16 format
   * @param {Float32Array} float32Array - Input samples in Float32 format (-1.0 to 1.0)
   * @returns {Int16Array} Int16Array in PCM16 format
   */
  float32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);

    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range
      const sample = Math.max(-1, Math.min(1, float32Array[i]));

      // Convert to 16-bit integer
      // Multiply by 32767 (max value for signed 16-bit int)
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    return pcm16;
  }
}

// Register the processor
registerProcessor('audio-input-processor', AudioInputProcessor);
