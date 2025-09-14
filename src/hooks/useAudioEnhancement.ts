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
  processBuffer: (audioBuffer: AudioBuffer, audioContext: AudioContext, volumeLevel?: 'low' | 'standard' | 'high') => { source: AudioBufferSourceNode, output: AudioNode };
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

  // Volume level to gain multiplier mapping
  const getVolumeMultiplier = useCallback((volume: 'low' | 'standard' | 'high'): number => {
    switch (volume) {
      case 'low': return 1.5;      // +3.5dB
      case 'standard': return 3.0; // +9.5dB
      case 'high': return 4.5;     // +13dB
      default: return 3.0;
    }
  }, []);

  const createProcessingChain = useCallback((audioContext: AudioContext, source: AudioBufferSourceNode, volumeLevel: 'low' | 'standard' | 'high' = 'standard') => {
    const chain: AudioNode[] = [source];
    
    // 1. Initial cleanup filters
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(85, audioContext.currentTime);
    highpass.Q.setValueAtTime(0.7, audioContext.currentTime);
    chain.push(highpass);
    
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(8000, audioContext.currentTime);
    lowpass.Q.setValueAtTime(0.7, audioContext.currentTime);
    chain.push(lowpass);

    // 2. De-esser (gentle)
    const deEsser = audioContext.createBiquadFilter();
    deEsser.type = 'peaking';
    deEsser.frequency.setValueAtTime(6500, audioContext.currentTime);
    deEsser.Q.setValueAtTime(2, audioContext.currentTime);
    deEsser.gain.setValueAtTime(-2, audioContext.currentTime);
    chain.push(deEsser);

    // 3. AGGRESSIVE VOICE-OPTIMIZED COMPRESSOR (replaces multi-band)
    const voiceCompressor = audioContext.createDynamicsCompressor();
    voiceCompressor.threshold.setValueAtTime(-18, audioContext.currentTime); // Lower threshold for more compression
    voiceCompressor.knee.setValueAtTime(8, audioContext.currentTime); // Soft knee
    voiceCompressor.ratio.setValueAtTime(6, audioContext.currentTime); // Aggressive compression for loudness
    voiceCompressor.attack.setValueAtTime(0.003, audioContext.currentTime); // Very fast attack
    voiceCompressor.release.setValueAtTime(0.1, audioContext.currentTime); // Quick release
    chain.push(voiceCompressor);
    
    // 4. Voice Enhancement EQ - Multiple bands for maximum impact
    const lowMidBoost = audioContext.createBiquadFilter();
    lowMidBoost.type = 'peaking';
    lowMidBoost.frequency.setValueAtTime(800, audioContext.currentTime); // Body/warmth
    lowMidBoost.Q.setValueAtTime(1, audioContext.currentTime);
    lowMidBoost.gain.setValueAtTime(2, audioContext.currentTime);
    chain.push(lowMidBoost);
    
    const voiceClarity = audioContext.createBiquadFilter();
    voiceClarity.type = 'peaking';
    voiceClarity.frequency.setValueAtTime(2800, audioContext.currentTime); // Voice clarity
    voiceClarity.Q.setValueAtTime(1.2, audioContext.currentTime);
    voiceClarity.gain.setValueAtTime(5, audioContext.currentTime); // Strong boost
    chain.push(voiceClarity);
    
    const presence = audioContext.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.setValueAtTime(4500, audioContext.currentTime); // Presence
    presence.Q.setValueAtTime(1.5, audioContext.currentTime);
    presence.gain.setValueAtTime(3, audioContext.currentTime);
    chain.push(presence);
    
    // 5. Warm Tone
    const warmth = audioContext.createBiquadFilter();
    warmth.type = 'lowshelf';
    warmth.frequency.setValueAtTime(300, audioContext.currentTime);
    warmth.gain.setValueAtTime(2.5, audioContext.currentTime); // More warmth
    chain.push(warmth);
    
    // 6. High-frequency air
    const airFilter = audioContext.createBiquadFilter();
    airFilter.type = 'highshelf';
    airFilter.frequency.setValueAtTime(6000, audioContext.currentTime);
    airFilter.gain.setValueAtTime(2.5, audioContext.currentTime); // More presence
    chain.push(airFilter);
    
    // 7. Gentle noise gate
    const noiseGate = audioContext.createDynamicsCompressor();
    noiseGate.threshold.setValueAtTime(-32, audioContext.currentTime); // Less aggressive
    noiseGate.knee.setValueAtTime(6, audioContext.currentTime);
    noiseGate.ratio.setValueAtTime(3, audioContext.currentTime); // Gentler
    noiseGate.attack.setValueAtTime(0.01, audioContext.currentTime);
    noiseGate.release.setValueAtTime(0.2, audioContext.currentTime);
    chain.push(noiseGate);
    
    // 8. Dynamic makeup gain based on user volume preference
    const makeupGain = audioContext.createGain();
    const volumeMultiplier = getVolumeMultiplier(volumeLevel);
    makeupGain.gain.setValueAtTime(volumeMultiplier, audioContext.currentTime);
    chain.push(makeupGain);
    
    // 9. Safety limiter
    const finalLimiter = audioContext.createDynamicsCompressor();
    finalLimiter.threshold.setValueAtTime(-0.5, audioContext.currentTime); // Prevent clipping
    finalLimiter.knee.setValueAtTime(0, audioContext.currentTime); // Hard knee
    finalLimiter.ratio.setValueAtTime(20, audioContext.currentTime); // Hard limiting
    finalLimiter.attack.setValueAtTime(0.001, audioContext.currentTime);
    finalLimiter.release.setValueAtTime(0.03, audioContext.currentTime);
    chain.push(finalLimiter);
    
    // Connect the chain serially (much simpler and reliable)
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].connect(chain[i + 1]);
    }

    return chain;
  }, [getVolumeMultiplier]);

  const processBuffer = useCallback((audioBuffer: AudioBuffer, audioContext: AudioContext, volumeLevel: 'low' | 'standard' | 'high' = 'standard'): { source: AudioBufferSourceNode, output: AudioNode } => {
    try {
      // Create buffer source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Create processing chain starting from the source with volume level
      const chain = createProcessingChain(audioContext, source, volumeLevel);
      
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
