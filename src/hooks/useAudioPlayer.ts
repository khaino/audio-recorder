import { useState, useRef, useCallback, useEffect } from 'react';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'ended';

export interface AudioPlayerData {
  state: PlaybackState;
  currentTime: number;
  duration: number;
  progress: number;
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
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);

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
      
      return () => {
        audio.removeEventListener('loadedmetadata', () => {});
        audio.removeEventListener('ended', () => {});
        audio.removeEventListener('timeupdate', updateTime);
        audio.pause();
        stopTimer();
      };
    } else {
      audioRef.current = null;
      setDuration(0);
      setCurrentTime(0);
      setState('idle');
      stopTimer();
    }
  }, [audioUrl, updateTime, stopTimer]);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
      setState('playing');
      startTimer();
    }
  }, [startTimer]);

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
      progress
    } as AudioPlayerData,
    actions: {
      play,
      pause,
      stop,
      seek
    } as AudioPlayerActions
  };
};
