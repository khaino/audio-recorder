import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'countdown' | 'recording' | 'paused' | 'stopped';

export interface AudioRecorderData {
  state: RecordingState;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number;
  currentTime: number;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  countdownValue: number;
  canUndo: boolean;
}

export interface AudioRecorderActions {
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  stopRecording: () => void;
  resetRecording: () => void;
  cutAudio: (startTime: number, endTime: number) => Promise<void>;
  undo: () => void;
}

export const useAudioRecorder = (selectedDeviceId?: string) => {
  const [state, setState] = useState<RecordingState>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [countdownValue, setCountdownValue] = useState(0);
  
  // Undo system - store up to 3 previous states
  const [undoHistory, setUndoHistory] = useState<Array<{
    blob: Blob;
    duration: number;
  }>>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const intervalRef = useRef<number | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  const updateTimer = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    const elapsedSeconds = elapsed / 1000;
    setCurrentTime(elapsedSeconds);
  }, []);

  const startTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = window.setInterval(updateTimer, 100);
  }, [updateTimer]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCountdown = useCallback(async () => {
    setState('countdown');
    setCountdownValue(3);

    return new Promise<void>((resolve) => {
      let count = 3;
      setCountdownValue(count);

      const countdownInterval = setInterval(() => {
        count -= 1;
        setCountdownValue(count);

        if (count <= 0) {
          clearInterval(countdownInterval);
          countdownTimerRef.current = null;
          resolve();
        }
      }, 1000);

      countdownTimerRef.current = countdownInterval;
    });
  }, []);

  const startRecording = useCallback(async () => {
    try {
      if (state === 'paused') {
        // Resume existing recording
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
          // Adjust start time to account for paused duration
          const pausedDuration = Date.now() - pausedTimeRef.current;
          startTimeRef.current += pausedDuration;
          
          mediaRecorderRef.current.resume();
          setState('recording');
          startTimer();
          return;
        } else {
          console.error('Cannot resume: MediaRecorder is not in paused state');
          return;
        }
      }

      // Start countdown before new recording
      if (state === 'idle') {
        await startCountdown();
      }

      // Start new recording with enhanced audio constraints
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId 
          ? {
              deviceId: { exact: selectedDeviceId },
              // Enhanced audio quality settings
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1
            }
          : {
              // Enhanced audio quality settings
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1
            }
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
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstart = () => {
      };

      mediaRecorder.onstop = () => {
        const mimeType = options.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        
        // Duration is already set in stopRecording function
        
        // Clean up stream and audio context
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        if (sourceRef.current) {
          sourceRef.current.disconnect();
          sourceRef.current = null;
        }
        
        // Don't close the audio context immediately - let it be cleaned up later
        // This prevents interference with the audio player
        if (audioContext) {
          // Just disconnect and clear references, but don't close the context
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
      mediaRecorder.start(1000);
      
      setState('recording');
      startTimer();
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  }, [selectedDeviceId, state, currentTime, startTimer, audioContext, startCountdown]);

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
      // Capture the final recording duration before stopping
      const finalDuration = (Date.now() - startTimeRef.current) / 1000;
      
      mediaRecorderRef.current.stop();
      setState('stopped');
      stopTimer();
      
      // Set the final duration
      setDuration(finalDuration);
      setCurrentTime(finalDuration);
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
      // Don't close the audio context aggressively
      setAudioContext(null);
      setAnalyser(null);
    }
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    
    stopTimer();
    setState('idle');
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setCurrentTime(0);
    setCountdownValue(0);
    startTimeRef.current = 0;
    pausedTimeRef.current = 0;
    chunksRef.current = [];
    
    // Clear undo history to prevent memory leaks
    setUndoHistory([]);
  }, [audioUrl, stopTimer]);

  // Save current state to undo history before making changes
  const saveToUndoHistory = useCallback(() => {
    if (!audioBlob) return;
    
    setUndoHistory(prev => {
      const newHistory = [
        {
          blob: audioBlob,
          duration: duration
        },
        ...prev.slice(0, 2) // Keep only the last 2 items (total 3 with new one)
      ];
      return newHistory;
    });
  }, [audioBlob, duration]);

  // Undo the last operation
  const undo = useCallback(() => {
    if (undoHistory.length === 0) return;

    const [previousState, ...remainingHistory] = undoHistory;
    
    // Clean up current URL
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    // Create new URL for the restored blob
    const newUrl = URL.createObjectURL(previousState.blob);
    
    // Restore previous state
    setAudioBlob(previousState.blob);
    setAudioUrl(newUrl);
    setDuration(previousState.duration);
    setCurrentTime(0); // Reset playback position
    
    // Update undo history
    setUndoHistory(remainingHistory);
    
    console.log('Undo completed - restored previous audio state');
  }, [undoHistory, audioUrl]);

  const cutAudio = useCallback(async (startTime: number, endTime: number) => {
    if (!audioBlob) {
      console.error('No audio to cut');
      return;
    }

    // Save current state to undo history before cutting
    saveToUndoHistory();

    try {
      // Create audio context for processing
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      const sampleRate = audioBuffer.sampleRate;
      const numberOfChannels = audioBuffer.numberOfChannels;
      
      // Calculate sample positions
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.floor(endTime * sampleRate);
      
      // Calculate new buffer length (original length minus cut section)
      const originalLength = audioBuffer.length;
      const cutLength = endSample - startSample;
      const newLength = originalLength - cutLength;
      
      if (newLength <= 0) {
        console.error('Cannot cut entire audio');
        return;
      }
      
      // Create new audio buffer
      const newAudioBuffer = audioCtx.createBuffer(numberOfChannels, newLength, sampleRate);
      
      // Copy audio data, skipping the cut section
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const originalData = audioBuffer.getChannelData(channel);
        const newData = newAudioBuffer.getChannelData(channel);
        
        // Copy data before cut point
        for (let i = 0; i < startSample; i++) {
          newData[i] = originalData[i];
        }
        
        // Copy data after cut point
        for (let i = endSample; i < originalLength; i++) {
          newData[i - cutLength] = originalData[i];
        }
      }
      
      // Convert back to WAV blob
      const wavBuffer = audioBufferToWav(newAudioBuffer);
      const newBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      
      // Update state with cut audio
      setAudioBlob(newBlob);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioUrl(URL.createObjectURL(newBlob));
      
      // Update duration
      const newDuration = newAudioBuffer.length / sampleRate;
      setDuration(newDuration);
      
      // Reset current time if it's beyond the new duration
      if (currentTime > newDuration) {
        setCurrentTime(newDuration);
      }
      
      await audioCtx.close();
      
    } catch (error) {
      console.error('Error cutting audio:', error);
    }
  }, [audioBlob, audioUrl, currentTime, saveToUndoHistory]);

  // Helper function to convert AudioBuffer to WAV
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

  return {
    data: {
      state,
      audioBlob,
      audioUrl,
      duration,
      currentTime,
      audioContext,
      analyser,
      countdownValue,
      canUndo: undoHistory.length > 0
    } as AudioRecorderData,
    actions: {
      startRecording,
      pauseRecording,
      stopRecording,
      resetRecording,
      cutAudio,
      undo
    } as AudioRecorderActions
  };
};
