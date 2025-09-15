import { useState, useRef, useCallback, useEffect } from 'react';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended';

export interface AudioPlayerData {
  state: PlaybackState;
  currentTime: number;
  duration: number;
  progress: number;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
}

export interface AudioPlayerActions {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
}

export const useAudioPlayer = (
  audioUrl: string | null,
  autoEnhance: boolean = true,
  volumeLevel: 'low' | 'standard' | 'high' = 'standard'
) => {
  const [state, setState] = useState<PlaybackState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [, setIsProcessing] = useState(false);
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);
  const [lastProcessedUrl, setLastProcessedUrl] = useState<string | null>(null);
  const [lastProcessedVolume, setLastProcessedVolume] = useState<'low' | 'standard' | 'high' | null>(null);
  const [forceRecreation, setForceRecreation] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Volume level to gain multiplier mapping
  const getVolumeMultiplier = useCallback((volume: 'low' | 'standard' | 'high'): number => {
    switch (volume) {
      case 'low': return 1.5;      // +3.5dB
      case 'standard': return 3.0; // +9.5dB
      case 'high': return 4.5;     // +13dB
      default: return 3.0;
    }
  }, []);

  const updateTime = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(updateTime, 100);
  }, [updateTime]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Auto-enhancement processing
  const processAudio = useCallback(async (url: string): Promise<string | null> => {
    if (!autoEnhance) return null;
    
    
    try {
      setIsProcessing(true);
      
      // Load audio as buffer
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      // Create offline context for processing
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      
      // Apply automatic enhancement filters
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Apply the enhancement chain with volume level
      const chain = createEnhancementChain(offlineContext, source, volumeLevel);
      
      // Connect to destination
      const lastNode = chain[chain.length - 1];
      lastNode.connect(offlineContext.destination);
      
      // Start and render
      source.start(0);
      const renderedBuffer = await offlineContext.startRendering();
      
      // Convert to WAV blob
      const wavBuffer = audioBufferToWav(renderedBuffer);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const processedUrl = URL.createObjectURL(blob);
      
      await audioCtx.close();
      setIsProcessing(false);
      
      return processedUrl;
    } catch (error) {
      console.error('Audio processing failed:', error);
      setIsProcessing(false);
      return null;
    }
  }, [autoEnhance, volumeLevel]);

  // Enhanced processing chain - simplified but powerful
  const createEnhancementChain = useCallback((audioContext: AudioContext | OfflineAudioContext, source: AudioBufferSourceNode, volumeLevel: 'low' | 'standard' | 'high' = 'standard') => {
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
  }, [getVolumeMultiplier, volumeLevel]);

  // Helper to convert AudioBuffer to WAV
  const audioBufferToWav = useCallback((buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;
    
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  }, []);

  // Setup audio analysis for real-time waveform during playback
  const setupAudioAnalysis = useCallback(async (audioElement: HTMLAudioElement) => {
    try {
      // Create or reuse audio context
      let audioCtx = audioContext;
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(audioCtx);
      }

      // Ensure audio context is resumed
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Create media element source and analyser for this specific audio element
      const source = audioCtx.createMediaElementSource(audioElement);
      const analyserNode = audioCtx.createAnalyser();
      
      // Configure analyser for responsive waveform visualization
      analyserNode.fftSize = 512;
      analyserNode.smoothingTimeConstant = 0.3;
      analyserNode.minDecibels = -90;
      analyserNode.maxDecibels = -10;
      
      // Connect source -> analyser -> destination
      source.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);
      
      // Store references
      sourceRef.current = source;
      setAnalyser(analyserNode);
      
    } catch (error) {
      console.error('Failed to setup audio analysis:', error);
      // Continue without analysis if it fails
    }
  }, [audioContext]);

  useEffect(() => {
    // Skip if we already have the right audio element for this URL
    // But don't skip if forceRecreation was triggered (after stop during playback)
    if (audioRef.current && audioRef.current.src === audioUrl && audioRef.current.src !== '' && forceRecreation === 0) {
      return;
    }

    // Clean up any existing audio element first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeEventListener('loadedmetadata', () => {});
      audioRef.current.removeEventListener('ended', () => {});
      audioRef.current.removeEventListener('timeupdate', updateTime);
      audioRef.current = null;
    }

    // Clean up audio analysis from previous audio element
    if (sourceRef.current) {
      const currentSource = sourceRef.current;
      currentSource.disconnect();
      sourceRef.current = null;
    }
    if (audioContext) {
      // Don't close the context, just reset the analyser
      setAnalyser(null);
    }

    if (audioUrl) {
      // Auto-process audio when loaded
      if (autoEnhance) {
        // Check if we already processed this URL with the same volume level
        if (lastProcessedUrl === audioUrl && lastProcessedVolume === volumeLevel && processedAudioUrl) {
          // Reuse existing processed audio
          const audio = new Audio(processedAudioUrl);
          audioRef.current = audio;
          
          audio.addEventListener('loadedmetadata', () => {
            setDuration(audio.duration);
            // Setup audio analysis once metadata is loaded
            setTimeout(() => setupAudioAnalysis(audio), 100); // Small delay to ensure audio is ready
          });
          
          audio.addEventListener('ended', () => {
            setState('ended');
            stopTimer();
            setCurrentTime(0);
          });
          
          audio.addEventListener('timeupdate', updateTime);
        } else {
          // Process new audio
          setLastProcessedUrl(audioUrl);
          setLastProcessedVolume(volumeLevel);
          processAudio(audioUrl).then(processedUrl => {
          if (processedUrl) {
            setProcessedAudioUrl(processedUrl);
            // Create audio element with processed URL
            const audio = new Audio(processedUrl);
            audioRef.current = audio;
            
            audio.addEventListener('loadedmetadata', () => {
              setDuration(audio.duration);
              // Setup audio analysis once metadata is loaded
              setTimeout(() => setupAudioAnalysis(audio), 100); // Small delay to ensure audio is ready
            });
            
            audio.addEventListener('ended', () => {
              setState('ended');
              stopTimer();
              setCurrentTime(0);
            });
            
            audio.addEventListener('timeupdate', updateTime);
          } else {
            // Fallback to original audio if processing fails
            // Make sure any previous audio is cleaned up
            if (audioRef.current) {
              audioRef.current.pause();
            }
            audioRef.current = null;
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            
            audio.addEventListener('loadedmetadata', () => {
              setDuration(audio.duration);
              // Setup audio analysis once metadata is loaded
              setTimeout(() => setupAudioAnalysis(audio), 100); // Small delay to ensure audio is ready
            });
            
            audio.addEventListener('ended', () => {
              setState('ended');
              stopTimer();
              setCurrentTime(0);
            });
            
            audio.addEventListener('timeupdate', updateTime);
          }
        });
        }
      } else {
        // Use original audio without processing
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
      
        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration);
          // Setup audio analysis once metadata is loaded
          setTimeout(() => setupAudioAnalysis(audio), 100); // Small delay to ensure audio is ready
        });
        
        audio.addEventListener('ended', () => {
          setState('ended');
          stopTimer();
          setCurrentTime(0);
        });
        
        audio.addEventListener('timeupdate', updateTime);
      }
    } else {
      // Clean up any existing audio element
      stopTimer();
      
      // Clean up processed URL
      if (processedAudioUrl) {
        URL.revokeObjectURL(processedAudioUrl);
        setProcessedAudioUrl(null);
      }
      
      audioRef.current = null;
      setDuration(0);
      setCurrentTime(0);
      setState('idle');
      stopTimer();
      
      // Clean up audio analysis
      if (sourceRef.current) {
        (sourceRef.current as MediaElementAudioSourceNode).disconnect();
        sourceRef.current = null;
      }
      
      if (audioContext) {
        audioContext.close();
        setAudioContext(null);
        setAnalyser(null);
      }
    }
  }, [audioUrl, autoEnhance, volumeLevel, processAudio, forceRecreation]);

  const play = useCallback(async () => {
    if (audioRef.current) {
      try {
        // Ensure we're starting from the current position
        if (state === 'paused') {
          // Resume from current position
          await audioRef.current.play();
        } else {
          // Start from beginning or current position
          await audioRef.current.play();
        }
        setState('playing');
        startTimer();
      } catch (error) {
        console.error('Audio playback failed:', error);
        setState('idle');
      }
    } else {
      console.error('Cannot play: audio element is not available');
    }
  }, [startTimer, state]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState('paused');
      stopTimer();
      // Ensure current time is synced
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [stopTimer]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    setState('idle');
    stopTimer();
    setCurrentTime(0);
    
    // Clean up audio analysis and force audio element recreation
    if (sourceRef.current) {
      const currentSource = sourceRef.current;
      currentSource.disconnect();
      sourceRef.current = null;
      
      // Force recreation of audio element and its audio analysis
      // This ensures we can create a new MediaElementAudioSourceNode next time
      setForceRecreation(prev => prev + 1);
    }
  }, [stopTimer]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return {
    data: {
      state,
      currentTime,
      duration,
      progress,
      audioContext,
      analyser
    } as AudioPlayerData,
    actions: {
      play,
      pause,
      stop,
      seek
    } as AudioPlayerActions
  };
};
