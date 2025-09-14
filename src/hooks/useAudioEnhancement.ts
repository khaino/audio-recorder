import { useState, useRef, useCallback, useEffect } from 'react';

// Fixed settings - always applied
export interface AudioEnhancementSettings {
  enabled: boolean; // Always true
}

export interface AudioEnhancementData {
  settings: AudioEnhancementSettings;
  isActive: boolean;
  processingChain: AudioNode[] | null;
}

export interface AudioEnhancementActions {
  updateSettings: (settings: Partial<AudioEnhancementSettings>) => void;
  processBuffer: (audioBuffer: AudioBuffer, audioContext: AudioContext) => { source: AudioBufferSourceNode, output: AudioNode };
  cleanup: () => void;
}

export const useAudioEnhancement = () => {
  const [settings, setSettings] = useState<AudioEnhancementSettings>({
    enabled: true
  });
  
  const [isActive, setIsActive] = useState(false);
  const processingChainRef = useRef<AudioNode[]>([]);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const updateSettings = useCallback((newSettings: Partial<AudioEnhancementSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const createProcessingChain = useCallback((audioContext: AudioContext, source: AudioBufferSourceNode) => {
    const chain: AudioNode[] = [source];
    
    // 1. Noise Reduction - Remove background and non-voice frequencies
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(85, audioContext.currentTime); // Remove low rumble
    highpass.Q.setValueAtTime(0.7, audioContext.currentTime);
    chain.push(highpass);
    
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(8000, audioContext.currentTime); // Remove high-frequency noise
    lowpass.Q.setValueAtTime(0.7, audioContext.currentTime);
    chain.push(lowpass);

    // 2. Remove Sharp Voice - De-esser to reduce harsh sibilants
    const deEsser = audioContext.createBiquadFilter();
    deEsser.type = 'peaking';
    deEsser.frequency.setValueAtTime(6500, audioContext.currentTime); // Target sibilant frequencies
    deEsser.Q.setValueAtTime(3, audioContext.currentTime);
    deEsser.gain.setValueAtTime(-4, audioContext.currentTime); // Reduce harshness
    chain.push(deEsser);

    // 3. Voice Optimization - Enhance vocal clarity and presence
    const voiceClarity = audioContext.createBiquadFilter();
    voiceClarity.type = 'peaking';
    voiceClarity.frequency.setValueAtTime(2800, audioContext.currentTime); // Voice clarity frequency
    voiceClarity.Q.setValueAtTime(1.2, audioContext.currentTime);
    voiceClarity.gain.setValueAtTime(3, audioContext.currentTime); // Boost presence
    chain.push(voiceClarity);

    // 4. Warm Tone - Add warmth to the voice
    const warmth = audioContext.createBiquadFilter();
    warmth.type = 'lowshelf';
    warmth.frequency.setValueAtTime(400, audioContext.currentTime);
    warmth.gain.setValueAtTime(1.5, audioContext.currentTime); // Add warmth without muddiness
    chain.push(warmth);

    // 5. Smooth Voice - Gentle compression for smoothness
    const smoothCompressor = audioContext.createDynamicsCompressor();
    smoothCompressor.threshold.setValueAtTime(-24, audioContext.currentTime); // Gentle threshold
    smoothCompressor.knee.setValueAtTime(6, audioContext.currentTime); // Soft knee
    smoothCompressor.ratio.setValueAtTime(3, audioContext.currentTime); // Light compression
    smoothCompressor.attack.setValueAtTime(0.01, audioContext.currentTime); // Quick attack
    smoothCompressor.release.setValueAtTime(0.25, audioContext.currentTime); // Smooth release
    chain.push(smoothCompressor);

    // 6. Final Noise Gate - Remove background noise during quiet moments
    const noiseGate = audioContext.createDynamicsCompressor();
    noiseGate.threshold.setValueAtTime(-45, audioContext.currentTime); // Gate threshold
    noiseGate.knee.setValueAtTime(2, audioContext.currentTime);
    noiseGate.ratio.setValueAtTime(10, audioContext.currentTime); // Strong gating
    noiseGate.attack.setValueAtTime(0.002, audioContext.currentTime);
    noiseGate.release.setValueAtTime(0.1, audioContext.currentTime);
    chain.push(noiseGate);

    // Connect the chain
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].connect(chain[i + 1]);
    }

    return chain;
  }, []);

  const processBuffer = useCallback((audioBuffer: AudioBuffer, audioContext: AudioContext): { source: AudioBufferSourceNode, output: AudioNode } => {
    try {
      // Create buffer source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create processing chain starting from the source
      const chain = createProcessingChain(audioContext, source);
      
      // Store processing chain reference for cleanup
      processingChainRef.current = chain;
      setIsActive(true);
      
      // Return both the source (for control) and the last node in chain (for connection)
      const outputNode = chain[chain.length - 1];
      return { source, output: outputNode };
    } catch (error) {
      console.error('Error processing audio buffer:', error);
      setIsActive(false);
      // Return unprocessed source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      return { source, output: source };
    }
  }, [createProcessingChain, settings]);


  const cleanup = useCallback(() => {
    // Disconnect all nodes in the processing chain
    processingChainRef.current.forEach(node => {
      try {
        node.disconnect();
      } catch (e) {
        // Node might already be disconnected
      }
    });
    
    processingChainRef.current = [];
    processedStreamRef.current = null;
    destinationRef.current = null;
    setIsActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    data: {
      settings,
      isActive,
      processingChain: processingChainRef.current
    } as AudioEnhancementData,
    actions: {
      updateSettings,
      processBuffer,
      cleanup
    } as AudioEnhancementActions
  };
};
