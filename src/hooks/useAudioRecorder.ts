import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface AudioRecorderData {
  state: RecordingState;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number;
  currentTime: number;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
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
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

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
      if (state === 'paused') {
        // Resume existing recording
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
          // Adjust start time to account for paused duration
          const pausedDuration = Date.now() - pausedTimeRef.current;
          startTimeRef.current += pausedDuration;
          
          console.log('Resuming paused recording');
          mediaRecorderRef.current.resume();
          setState('recording');
          startTimer();
          return;
        } else {
          console.error('Cannot resume: MediaRecorder is not in paused state');
          return;
        }
      }

      // Start new recording
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId 
          ? { deviceId: { exact: selectedDeviceId } }
          : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // Set up Web Audio API for real-time analysis
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Ensure audio context is resumed (required for some browsers)
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyserNode = audioCtx.createAnalyser();
      
      // More aggressive settings for better responsiveness
      analyserNode.fftSize = 512;  // Increased for better resolution
      analyserNode.smoothingTimeConstant = 0.3;  // Less smoothing for more responsive data
      analyserNode.minDecibels = -90;
      analyserNode.maxDecibels = -10;
      
      source.connect(analyserNode);
      
      // Keep references
      sourceRef.current = source;
      setAudioContext(audioCtx);
      setAnalyser(analyserNode);
      
      console.log('Audio context state:', audioCtx.state);
      console.log('Analyser setup complete for recording');
      console.log('Stream tracks:', stream.getTracks().map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        label: track.label
      })));
      
      // Configure MediaRecorder with better options
      let options: MediaRecorderOptions = {};
      
      // Try to use the best available codec
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstart = () => {
        console.log('Recording started');
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped, total chunks:', chunksRef.current.length);
        const mimeType = options.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('Created blob with size:', blob.size, 'bytes, type:', blob.type);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setDuration(currentTime);
        
        // Clean up stream and audio context
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
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

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
      };
      
      // Start new recording
      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      setCurrentTime(0);
      // Start recording with a timeslice of 1000ms to ensure continuous recording
      console.log('Starting new recording with timeslice 1000ms');
      mediaRecorder.start(1000);
      
      setState('recording');
      startTimer();
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [selectedDeviceId, state, currentTime, startTimer, audioContext]);

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
    
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    if (audioContext) {
      audioContext.close();
      setAudioContext(null);
      setAnalyser(null);
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
      currentTime,
      audioContext,
      analyser
    } as AudioRecorderData,
    actions: {
      startRecording,
      pauseRecording,
      stopRecording,
      resetRecording
    } as AudioRecorderActions
  };
};
