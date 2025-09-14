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
  autoEnhance: boolean = true
) => {
  const [state, setState] = useState<PlaybackState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedAudioUrl, setProcessedAudioUrl] = useState<string | null>(null);
  const [lastProcessedUrl, setLastProcessedUrl] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

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
      
      // Apply the enhancement chain (imported from useAudioEnhancement logic)
      const chain = createEnhancementChain(offlineContext, source);
      
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
  }, [autoEnhance]);

  // Enhancement chain (same as in useAudioEnhancement)
  const createEnhancementChain = useCallback((audioContext: AudioContext | OfflineAudioContext, source: AudioBufferSourceNode) => {
    const chain: AudioNode[] = [source];
    
    // 1. Noise Reduction - Remove background and non-voice frequencies
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

    // 2. Remove Sharp Voice - De-esser
    const deEsser = audioContext.createBiquadFilter();
    deEsser.type = 'peaking';
    deEsser.frequency.setValueAtTime(6500, audioContext.currentTime);
    deEsser.Q.setValueAtTime(3, audioContext.currentTime);
    deEsser.gain.setValueAtTime(-4, audioContext.currentTime);
    chain.push(deEsser);

    // 3. Voice Optimization
    const voiceClarity = audioContext.createBiquadFilter();
    voiceClarity.type = 'peaking';
    voiceClarity.frequency.setValueAtTime(2800, audioContext.currentTime);
    voiceClarity.Q.setValueAtTime(1.2, audioContext.currentTime);
    voiceClarity.gain.setValueAtTime(3, audioContext.currentTime);
    chain.push(voiceClarity);

    // 4. Warm Tone
    const warmth = audioContext.createBiquadFilter();
    warmth.type = 'lowshelf';
    warmth.frequency.setValueAtTime(400, audioContext.currentTime);
    warmth.gain.setValueAtTime(1.5, audioContext.currentTime);
    chain.push(warmth);

    // 5. Smooth Voice - Gentle compression
    const smoothCompressor = audioContext.createDynamicsCompressor();
    smoothCompressor.threshold.setValueAtTime(-24, audioContext.currentTime);
    smoothCompressor.knee.setValueAtTime(6, audioContext.currentTime);
    smoothCompressor.ratio.setValueAtTime(3, audioContext.currentTime);
    smoothCompressor.attack.setValueAtTime(0.01, audioContext.currentTime);
    smoothCompressor.release.setValueAtTime(0.25, audioContext.currentTime);
    chain.push(smoothCompressor);

    // 6. Final Noise Gate
    const noiseGate = audioContext.createDynamicsCompressor();
    noiseGate.threshold.setValueAtTime(-45, audioContext.currentTime);
    noiseGate.knee.setValueAtTime(2, audioContext.currentTime);
    noiseGate.ratio.setValueAtTime(10, audioContext.currentTime);
    noiseGate.attack.setValueAtTime(0.002, audioContext.currentTime);
    noiseGate.release.setValueAtTime(0.1, audioContext.currentTime);
    chain.push(noiseGate);

    // Connect the chain
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].connect(chain[i + 1]);
    }

    return chain;
  }, []);

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

  // Commented out complex Web Audio API setup - using simple playback instead
  /*
  const setupAudioAnalysis = useCallback(async () => {
    // ... complex setup code removed for reliability
  }, [audioUrl, audioContext, stopTimer]);
  */

  useEffect(() => {
    // Clean up any existing audio element first
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeEventListener('loadedmetadata', () => {});
      audioRef.current.removeEventListener('ended', () => {});
      audioRef.current.removeEventListener('timeupdate', updateTime);
      audioRef.current = null;
    }

    if (audioUrl) {
      // Auto-process audio when loaded
      if (autoEnhance) {
        // Check if we already processed this URL
        if (lastProcessedUrl === audioUrl && processedAudioUrl) {
          // Reuse existing processed audio
          const audio = new Audio(processedAudioUrl);
          audioRef.current = audio;
          
          audio.addEventListener('loadedmetadata', () => {
            setDuration(audio.duration);
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
          processAudio(audioUrl).then(processedUrl => {
          if (processedUrl) {
            setProcessedAudioUrl(processedUrl);
            // Create audio element with processed URL
            const audio = new Audio(processedUrl);
            audioRef.current = audio;
            
            audio.addEventListener('loadedmetadata', () => {
              setDuration(audio.duration);
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
              audioRef.current = null;
            }
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            
            audio.addEventListener('loadedmetadata', () => {
              setDuration(audio.duration);
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
        // Make sure any previous audio is cleaned up
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
      
        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration);
        });
        
        audio.addEventListener('ended', () => {
          setState('ended');
          stopTimer();
          setCurrentTime(0);
        });
        
        audio.addEventListener('timeupdate', updateTime);
        
        return () => {
          audio.removeEventListener('loadedmetadata', () => {});
          audio.removeEventListener('ended', () => {});
          audio.removeEventListener('timeupdate', updateTime);
          audio.pause();
          stopTimer();
          
          // Clean up processed URL
          if (processedAudioUrl) {
            URL.revokeObjectURL(processedAudioUrl);
            setProcessedAudioUrl(null);
          }
          
          // Clean up audio analysis
          if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
          }
          
          if (audioContext) {
            audioContext.close();
            setAudioContext(null);
            setAnalyser(null);
          }
        };
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
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      
      if (audioContext) {
        audioContext.close();
        setAudioContext(null);
        setAnalyser(null);
      }
    }
  }, [audioUrl, updateTime, stopTimer, audioContext, autoEnhance, processAudio, processedAudioUrl, lastProcessedUrl]);

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
        // Silently handle playback errors
        setState('idle');
      }
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
    
    // Clean up audio analysis
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
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
