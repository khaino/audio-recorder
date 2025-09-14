import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface AudioRecorderData {
  state: RecordingState;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number;
  currentTime: number;
}

export interface AudioRecorderActions {
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  stopRecording: () => void;
  resetRecording: () => void;
}

export const useAudioRecorder = (selectedDeviceId?: string) => {
  const [state, setState] = useState<RecordingState>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);

  const updateTimer = useCallback(() => {
    if (state === 'recording') {
      const elapsed = Date.now() - startTimeRef.current;
      setCurrentTime(elapsed / 1000);
    }
  }, [state]);

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(updateTimer, 100);
  }, [updateTimer]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId } }
          : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setDuration(currentTime);
        
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };
      
      if (state === 'paused') {
        // Resume recording - adjust start time to account for paused duration
        const pausedDuration = Date.now() - pausedTimeRef.current;
        startTimeRef.current += pausedDuration;
        mediaRecorder.resume();
      } else {
        // Start new recording
        startTimeRef.current = Date.now();
        pausedTimeRef.current = 0;
        setCurrentTime(0);
        mediaRecorder.start();
      }
      
      setState('recording');
      startTimer();
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [selectedDeviceId, state, currentTime, startTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === 'recording') {
      mediaRecorderRef.current.pause();
      setState('paused');
      stopTimer();
      // Track when we paused
      pausedTimeRef.current = Date.now();
    }
  }, [state, stopTimer]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && (state === 'recording' || state === 'paused')) {
      mediaRecorderRef.current.stop();
      setState('stopped');
      stopTimer();
    }
  }, [state, stopTimer]);

  const resetRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    stopTimer();
    setState('idle');
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setCurrentTime(0);
    startTimeRef.current = 0;
    pausedTimeRef.current = 0;
    chunksRef.current = [];
  }, [audioUrl, stopTimer]);

  return {
    data: {
      state,
      audioBlob,
      audioUrl,
      duration,
      currentTime
    } as AudioRecorderData,
    actions: {
      startRecording,
      pauseRecording,
      stopRecording,
      resetRecording
    } as AudioRecorderActions
  };
};
