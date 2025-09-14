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

export const useAudioPlayer = (audioUrl: string | null) => {
  const [state, setState] = useState<PlaybackState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  
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

  // Commented out complex Web Audio API setup - using simple playback instead
  /*
  const setupAudioAnalysis = useCallback(async () => {
    // ... complex setup code removed for reliability
  }, [audioUrl, audioContext, stopTimer]);
  */

  useEffect(() => {
    if (audioUrl) {
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
      
      // Also manually update time every 100ms as a fallback
      const timeUpdateInterval = setInterval(() => {
        if (audio && !audio.paused && !audio.ended) {
          setCurrentTime(audio.currentTime);
        }
      }, 100);
      
      // Store interval for cleanup
      (audio as any).timeUpdateInterval = timeUpdateInterval;
      
      console.log('Audio element created for:', audioUrl);
      
      return () => {
        audio.removeEventListener('loadedmetadata', () => {});
        audio.removeEventListener('ended', () => {});
        audio.removeEventListener('timeupdate', updateTime);
        audio.pause();
        stopTimer();
        
        // Clean up manual time update interval
        if ((audio as any).timeUpdateInterval) {
          clearInterval((audio as any).timeUpdateInterval);
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
    } else {
      // Clean up any existing audio element and its intervals
      if (audioRef.current && (audioRef.current as any).timeUpdateInterval) {
        clearInterval((audioRef.current as any).timeUpdateInterval);
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
  }, [audioUrl, updateTime, stopTimer, audioContext]);

  const play = useCallback(async () => {
    console.log('Starting simple, reliable playback...');
    
    if (audioRef.current) {
      try {
        // Clean up any existing Web Audio setup that might be interfering
        if (sourceRef.current) {
          sourceRef.current.disconnect();
          sourceRef.current = null;
        }
        
        if (audioContext) {
          audioContext.close();
          setAudioContext(null);
          setAnalyser(null);
        }
        
        // Simple, reliable audio playback
        await audioRef.current.play();
        setState('playing');
        startTimer();
        console.log('Simple playback started successfully - audio should be audible');
        console.log('Using simulated waveform for visualization during playback');
      } catch (error) {
        console.error('Playback failed:', error);
      }
    } else {
      console.error('No audio element available for playback');
    }
  }, [startTimer, audioContext]);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setState('paused');
      stopTimer();
    }
  }, [stopTimer]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState('idle');
      stopTimer();
      setCurrentTime(0);
      
      // Clean up audio analysis when stopping
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
  }, [stopTimer, audioContext]);

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
