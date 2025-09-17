import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { RecordingState } from '../hooks/useAudioRecorder';
import type { PlaybackState } from '../hooks/useAudioPlayer';

interface WaveformVisualizerProps {
  recordingState: RecordingState;
  playbackState: PlaybackState;
  currentTime: number;
  duration: number;
  audioContext?: AudioContext | null;
  analyser?: AnalyserNode | null;
  onSeek?: (time: number) => void;
  countdownValue?: number;
  onCutAudio?: (startTime: number, endTime: number) => void;
  audioBlob?: Blob | null;
  canUndo?: boolean;
  onUndo?: () => void;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  recordingState,
  playbackState,
  currentTime,
  duration,
  audioContext,
  analyser,
  onSeek,
  countdownValue,
  onCutAudio,
  audioBlob,
  canUndo,
  onUndo
}) => {
  const formatTime = (time: number) => {
    // Handle null, undefined, NaN, or negative values
    if (time == null || !isFinite(time) || time < 0) {
      return '0:00:0';
    }
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const tenths = Math.floor((time % 1) * 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}:${tenths}`;
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [preloadedWaveform, setPreloadedWaveform] = useState<number[]>([]);
  const [isWaveformLoaded, setIsWaveformLoaded] = useState(false);
  const [isRecordingComplete, setIsRecordingComplete] = useState(false);
  const [playbackStartTime, setPlaybackStartTime] = useState<number | null>(null);
  
  // Selection state
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  
  // Dragging state for current time indicator
  const [isDraggingCurrentTime, setIsDraggingCurrentTime] = useState(false);
  const [isHoveringCurrentTime, setIsHoveringCurrentTime] = useState(false);
  
  // Track initial click position and previous selection for deselection logic
  const [initialClickX, setInitialClickX] = useState<number | null>(null);
  const [previousSelectionStart, setPreviousSelectionStart] = useState<number | null>(null);
  const [previousSelectionEnd, setPreviousSelectionEnd] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, visible: boolean}>({x: 0, y: 0, visible: false});
  
  // Mode state: 'seek' (default) or 'select'
  const [interactionMode, setInteractionMode] = useState<'seek' | 'select'>('seek');
  
  // Reset to seek mode when not in playback states
  useEffect(() => {
    if (!(playbackState === 'playing' || playbackState === 'paused' || 
          (recordingState === 'stopped' && duration > 0))) {
      setInteractionMode('seek');
      // Also clear any selections when buttons are hidden
      setSelectionStart(null);
      setSelectionEnd(null);
    }
  }, [playbackState, recordingState, duration]);

  const width = 1200;
  const height = 240;
  const cornerRadius = 24;

  // Convert canvas x position to time (accounting for CSS scaling)
  const canvasXToTime = (x: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    
    // Get the actual rendered dimensions vs canvas dimensions
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    
    // Scale the mouse x coordinate to match canvas coordinate system
    const scaledX = x * scaleX;
    
    
    const progress = Math.max(0, Math.min(1, (scaledX - 20) / (width - 40)));
    return progress * duration;
  };

  // Convert time to canvas x position for drawing (unscaled canvas coordinates)
  const timeToCanvasX = (time: number): number => {
    const progress = duration > 0 ? time / duration : 0;
    return 20 + progress * (width - 40);
  };

  // Convert time to rendered x position for mouse interactions (scaled coordinates)  
  const timeToRenderedX = (time: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 20;
    
    const progress = duration > 0 ? time / duration : 0;
    const canvasX = 20 + progress * (width - 40);
    
    // Get the actual rendered dimensions vs canvas dimensions
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / width;
    
    // Scale the canvas coordinate to match rendered coordinate system
    return canvasX * scaleX;
  };

  // Check if mouse is near current time indicator (within 15px)
  const isNearCurrentTimeIndicator = (mouseX: number): boolean => {
    if (duration === 0) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;
    
    // Get rendered position of current time indicator
    const renderedIndicatorX = timeToRenderedX(currentTime);
    
    // Get the actual rendered dimensions vs canvas dimensions
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / width;
    
    // Scale the threshold as well
    const threshold = 15 * scaleX;
    
    return Math.abs(mouseX - renderedIndicatorX) <= threshold;
  };

  // Check if the initial click was inside the previous selection
  const wasClickInsidePreviousSelection = (): boolean => {
    if (previousSelectionStart === null || previousSelectionEnd === null || initialClickX === null) return false;
    const startX = timeToRenderedX(Math.min(previousSelectionStart, previousSelectionEnd));
    const endX = timeToRenderedX(Math.max(previousSelectionStart, previousSelectionEnd));
    return initialClickX >= startX && initialClickX <= endX;
  };

  // Generate preloaded waveform from audio blob
  const generatePreloadedWaveform = useCallback(async (blob: Blob) => {
    try {
      console.log('Generating preloaded waveform...');
      setIsWaveformLoaded(false);
      
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      const samples = audioBuffer.getChannelData(0); // Use first channel
      const targetPoints = Math.floor((width - 40) / 2); // One point per 2 pixels
      const blockSize = Math.floor(samples.length / targetPoints);
      
      const waveform: number[] = [];
      
      for (let i = 0; i < targetPoints; i++) {
        const start = i * blockSize;
        const end = Math.min(start + blockSize, samples.length);
        
        // Calculate RMS for this block
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += samples[j] * samples[j];
        }
        const rms = Math.sqrt(sum / (end - start));
        
        // Apply the same scaling as real-time waveform
        const normalized = rms * 4; // Same as current scaling
        const responsive = Math.pow(normalized, 0.6);
        const scaled = Math.min(responsive, 0.85);
        const finalAmplitude = Math.max(scaled, 0.08);
        
        waveform.push(finalAmplitude);
      }
      
      setPreloadedWaveform(waveform);
      setIsWaveformLoaded(true);
      console.log(`Preloaded waveform generated: ${waveform.length} points`);
      
      await audioCtx.close();
    } catch (error) {
      console.error('Error generating preloaded waveform:', error);
    }
  }, [width]);

  // Function to get real audio amplitude from analyser
  const getRealAudioAmplitude = (): number => {
    // For playback, we need to get real amplitude from the audio player's analyser
    // This will be handled by the audio player hook's analyser
    if (playbackState === 'playing') {
      // Reset playback start time tracking since we're using real audio analysis
      if (playbackStartTime) {
        setPlaybackStartTime(null);
      }
    }

    if (!analyser || !audioContext) {
      // Return a very low amplitude when no analyser available
      return 0.05;
    }

    // Check if audio context is still running
    if (audioContext.state !== 'running') {
      console.warn('Audio context is not running:', audioContext.state);
      // Try to resume if suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
        }).catch((err: any) => {
          console.error('Failed to resume audio context:', err);
        });
      }
      return 0.05; // Return minimum amplitude
    }

    try {
      const bufferLength = analyser.fftSize;
      const timeDataArray = new Uint8Array(bufferLength);
      
      analyser.getByteTimeDomainData(timeDataArray);

      // Calculate RMS (Root Mean Square) amplitude - this is the most accurate representation
      let sum = 0;
      let hasValidData = false;
      
      for (let i = 0; i < bufferLength; i++) {
        // Convert from 0-255 range to -1 to 1 range
        const sample = (timeDataArray[i] - 128) / 128;
        
        // Check if we have actual audio data (not just silence at 128)
        if (timeDataArray[i] !== 128) {
          hasValidData = true;
        }
        
        // Square the sample for RMS calculation
        sum += sample * sample;
      }

      if (!hasValidData) {
        return 0.05; // Return very low amplitude for silence
      }

      // Calculate RMS amplitude
      const rms = Math.sqrt(sum / bufferLength);
      
      // Audio analysis is working correctly
      
      // Calibrated amplitude scaling for proper dynamic range
      // Target: RMS 0.005 → ~8% height, RMS 0.01 → ~12% height, RMS 0.02+ → ~20% height
      
      // Minimal amplification (10% of original)
      const normalized = rms * 4; // Reduced from 40 to 4 (10% of original)
      const responsive = Math.pow(normalized, 0.6); // Power scaling (between sqrt and linear)
      
      // Gentle final scaling
      const scaled = Math.min(responsive, 0.85);
      
      // Minimum threshold for any valid audio
      const finalAmplitude = Math.max(scaled, hasValidData ? 0.08 : 0.05);
      
      // Amplitude scaling is working correctly
      
      return finalAmplitude;

    } catch (error) {
      console.error('Error getting audio amplitude:', error);
      return 0.05;
    }
  };

  // Generate preloaded waveform when audio blob changes
  useEffect(() => {
    if (audioBlob && recordingState === 'stopped') {
      generatePreloadedWaveform(audioBlob);
    } else if (recordingState === 'idle') {
      setPreloadedWaveform([]);
      setIsWaveformLoaded(false);
    }
  }, [audioBlob, recordingState, generatePreloadedWaveform]);

  useEffect(() => {
    if (recordingState === 'recording') {
      setIsRecordingComplete(false);
      // Gradually build waveform data while recording
      const interval = setInterval(() => {
        // Periodic check to ensure audio context is still running
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch((err: any) => {
            console.error('Failed to resume audio context during recording:', err);
          });
        }

        setWaveformData(prev => {
          // Dynamic max points based on available width
          const maxPoints = Math.floor((width - 40) / 2); // Adjust based on canvas width
          const newAmplitude = getRealAudioAmplitude();
          
          if (prev.length < maxPoints) {
            // Still building up the waveform
            return [...prev, newAmplitude];
          } else {
            // Sliding window - remove first, add new at end
            return [...prev.slice(1), newAmplitude];
          }
        });
      }, 100); // Slightly slower update for better performance

      return () => clearInterval(interval);
    } else if (playbackState === 'playing') {
      // Show real-time waveform during playback too
      const interval = setInterval(() => {
        // Periodic check to ensure audio context is still running
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch((err: any) => {
            console.error('Failed to resume audio context during playback:', err);
          });
        }

        setWaveformData(prev => {
          const maxPoints = Math.floor((width - 40) / 2);
          const newAmplitude = getRealAudioAmplitude();
          
          if (prev.length < maxPoints) {
            return [...prev, newAmplitude];
          } else {
            return [...prev.slice(1), newAmplitude];
          }
        });
      }, 100);

      return () => clearInterval(interval);
    } else if (recordingState === 'stopped' && !isRecordingComplete) {
      // Keep the current waveform data as-is when stopped
      setIsRecordingComplete(true);
    } else if (recordingState === 'idle' && playbackState === 'idle') {
      setWaveformData([]);
      setIsRecordingComplete(false);
    }
  }, [recordingState, playbackState, isRecordingComplete, width, analyser, audioContext, playbackStartTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);
      
      // Enable high-quality rendering for smooth curves
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) {
        ctx.imageSmoothingQuality = 'high';
      }

      // Helper function to draw a proper rounded rectangle
      const drawRoundedRect = (x: number, y: number, w: number, h: number, radius: number) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      };

      // Draw rounded rectangle background with dark, cool gradient
      drawRoundedRect(0, 0, width, height, cornerRadius);
      
      // Create dark gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      if (recordingState === 'recording') {
        gradient.addColorStop(0, '#1f2937'); // Dark blue-gray
        gradient.addColorStop(1, '#374151'); // Slightly lighter blue-gray
      } else {
        gradient.addColorStop(0, '#111827'); // Very dark blue-gray
        gradient.addColorStop(1, '#1f2937'); // Dark blue-gray
      }
      
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Subtle border with cool color - draw the rounded rect again for stroke
      drawRoundedRect(0, 0, width, height, cornerRadius);
      ctx.strokeStyle = recordingState === 'recording' ? '#60a5fa' : '#4b5563';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw waveform - use preloaded waveform when available, otherwise real-time data
      const currentWaveformData = isWaveformLoaded ? preloadedWaveform : waveformData;
      
      if (currentWaveformData.length > 0) {
        const barWidth = (width - 40) / currentWaveformData.length;
        const centerY = height / 2;

        currentWaveformData.forEach((amplitude, index) => {
          const barHeight = amplitude * (height - 40);
          const x = 20 + index * barWidth;
          const y = centerY - barHeight / 2;

          // Determine bar color with soft, light colors
          let barColor: string | CanvasGradient = '#6b7280'; // Default soft gray
          if (recordingState === 'recording' && !isWaveformLoaded) {
            // Soft cyan/blue gradient for recording with pulse effect (only for real-time)
            const isRecentBar = index >= currentWaveformData.length - 10;
            const pulseIntensity = isRecentBar ? 0.7 + 0.3 * Math.sin(Date.now() / 300) : 0.6;
            const opacity = 0.8 + 0.2 * pulseIntensity;
            
            // Create gradient for each bar
            const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            barGradient.addColorStop(0, `rgba(56, 189, 248, ${opacity})`); // Light blue
            barGradient.addColorStop(1, `rgba(14, 165, 233, ${opacity * 0.8})`); // Slightly darker blue
            barColor = barGradient;
          } else if (playbackState === 'playing' && isWaveformLoaded) {
            // For preloaded waveform during playback, show different colors based on progress
            const progressPosition = (currentTime / duration) * currentWaveformData.length;
            const isPlayed = index < progressPosition;
            
            const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            if (isPlayed) {
              // Already played - green
              barGradient.addColorStop(0, 'rgba(52, 211, 153, 0.8)'); // Light green
              barGradient.addColorStop(1, 'rgba(16, 185, 129, 0.6)'); // Darker green
            } else {
              // Not yet played - gray
              barGradient.addColorStop(0, 'rgba(156, 163, 175, 0.6)'); // Light gray
              barGradient.addColorStop(1, 'rgba(107, 114, 128, 0.4)'); // Darker gray
            }
            barColor = barGradient;
          } else if (playbackState === 'paused') {
            // Soft static green for paused state
            const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            barGradient.addColorStop(0, 'rgba(52, 211, 153, 0.7)'); // Light green
            barGradient.addColorStop(1, 'rgba(16, 185, 129, 0.5)'); // Darker green
            barColor = barGradient;
          } else {
            // Soft gray gradient for idle state
            const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            barGradient.addColorStop(0, 'rgba(156, 163, 175, 0.6)'); // Light gray
            barGradient.addColorStop(1, 'rgba(107, 114, 128, 0.4)'); // Darker gray
            barColor = barGradient;
          }

          ctx.fillStyle = barColor;
          ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
        });
      } else {
        // Draw countdown or placeholder text
        if (recordingState === 'countdown' && countdownValue !== undefined && countdownValue > 0) {
          // Draw countdown
          ctx.fillStyle = '#ef4444'; // Red color for countdown
          ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          // Add glow effect for countdown
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 20;
          
          ctx.fillText(countdownValue.toString(), width / 2, height / 2);
          
          // Reset shadow
          ctx.shadowBlur = 0;
          
          // Add smaller text below countdown
          ctx.fillStyle = '#f87171'; // Lighter red
          ctx.font = '18px system-ui, -apple-system, sans-serif';
          ctx.fillText('Get ready to record...', width / 2, height / 2 + 50);
        } else {
          // Draw placeholder text with light color for dark background
          ctx.fillStyle = '#d1d5db';
          ctx.font = '18px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Click Record to start recording...', width / 2, height / 2);
        }
      }

      // Draw selection overlay
      if (selectionStart !== null && selectionEnd !== null && duration > 0) {
        const startX = timeToCanvasX(selectionStart);
        const endX = timeToCanvasX(selectionEnd);
        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        
        // Draw selection background
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // Blue with transparency
        ctx.fillRect(minX, 15, maxX - minX, height - 30);
        
        // Draw selection borders
        ctx.strokeStyle = '#3b82f6'; // Blue border
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(minX, 15);
        ctx.lineTo(minX, height - 15);
        ctx.moveTo(maxX, 15);
        ctx.lineTo(maxX, height - 15);
        ctx.stroke();
        
        // Draw start and end time timestamps above selection borders
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        
        // Start time timestamp
        const startTimeText = formatTime(Math.min(selectionStart, selectionEnd));
        const startTextWidth = ctx.measureText(startTimeText).width;
        const startTextX = Math.max(startTextWidth / 2 + 4, Math.min(width - startTextWidth / 2 - 4, minX));
        ctx.fillText(startTimeText, startTextX, 10);
        
        // End time timestamp
        const endTimeText = formatTime(Math.max(selectionStart, selectionEnd));
        const endTextWidth = ctx.measureText(endTimeText).width;
        const endTextX = Math.max(endTextWidth / 2 + 4, Math.min(width - endTextWidth / 2 - 4, maxX));
        ctx.fillText(endTimeText, endTextX, 10);
      }

      // Draw progress indicator line with soft glow effect
      if (duration > 0 && waveformData.length > 0) {
        const progress = Math.min(currentTime / duration, 1);
        const lineX = 20 + progress * (width - 40);

        // Create glow effect
        ctx.shadowColor = playbackState === 'playing' ? '#34d399' : recordingState === 'recording' ? '#60a5fa' : '#9ca3af';
        ctx.shadowBlur = 8;
        
        ctx.beginPath();
        ctx.moveTo(lineX, 15);
        ctx.lineTo(lineX, height - 15);
        ctx.strokeStyle = playbackState === 'playing' ? '#34d399' : recordingState === 'recording' ? '#60a5fa' : '#9ca3af';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw progress indicator circle with glow
        ctx.beginPath();
        ctx.arc(lineX, height / 2, 10, 0, 2 * Math.PI);
        ctx.fillStyle = playbackState === 'playing' ? '#34d399' : recordingState === 'recording' ? '#60a5fa' : '#9ca3af';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
        
        // Draw current time timestamp above the progress indicator
        ctx.fillStyle = playbackState === 'playing' ? '#059669' : recordingState === 'recording' ? '#2563eb' : '#6b7280';
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        const currentTimeText = formatTime(currentTime);
        const currentTextWidth = ctx.measureText(currentTimeText).width;
        const currentTextX = Math.max(currentTextWidth / 2 + 4, Math.min(width - currentTextWidth / 2 - 4, lineX));
        ctx.fillText(currentTimeText, currentTextX, 10);
      }
    };

    draw();

    if (recordingState === 'recording' || playbackState === 'playing') {
      const animate = () => {
        draw();
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animate();
    }

    return () => {
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [waveformData, recordingState, playbackState, currentTime, duration, countdownValue, selectionStart, selectionEnd, timeToCanvasX]);

  const handleCanvasMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration === 0) return;

    // Ignore right-clicks - don't start new selection
    if (event.button === 2) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = canvasXToTime(x);

    // Hide context menu
    setContextMenu(prev => ({ ...prev, visible: false }));

    // Check if clicking on current time indicator (always draggable regardless of mode)
    if (isNearCurrentTimeIndicator(x)) {
      console.log('Starting to drag current time indicator');
      setIsDraggingCurrentTime(true);
      return;
    }

    // Handle different interaction modes
    if (interactionMode === 'seek') {
      // In seek mode, clicking seeks to that position
      if (onSeek) {
        onSeek(time);
      }
      // Clear any existing selection
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    // Selection mode behavior
    if (interactionMode === 'select') {
      // Only start selection if we have waveform data
      if (waveformData.length === 0 && !isWaveformLoaded) return;

      // Store previous selection and initial click position for deselection logic
      setPreviousSelectionStart(selectionStart);
      setPreviousSelectionEnd(selectionEnd);
      setInitialClickX(x);

      // Start new selection (this will be refined in mouse up if it's just a click)
      setSelectionStart(time);
      setSelectionEnd(time);
      setIsSelecting(true);
    }
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = canvasXToTime(x);

    // Handle dragging current time indicator
    if (isDraggingCurrentTime) {
      console.log('Dragging current time to:', time);
      if (onSeek) {
        onSeek(Math.max(0, Math.min(time, duration)));
      }
      return;
    }

    // Update hover state for current time indicator
    setIsHoveringCurrentTime(isNearCurrentTimeIndicator(x));

    // Handle selection (only in select mode)
    if (interactionMode === 'select' && isSelecting) {
      setSelectionEnd(time);
    }
  };

  const handleCanvasMouseUp = () => {
    // Handle ending drag of current time indicator
    if (isDraggingCurrentTime) {
      console.log('Finished dragging current time indicator');
      setIsDraggingCurrentTime(false);
      return;
    }

    // Only handle selection logic in select mode
    if (interactionMode !== 'select' || !isSelecting) return;

    setIsSelecting(false);

    // If it's just a click (no drag), handle deselection logic
    if (selectionStart !== null && selectionEnd !== null) {
      const timeDiff = Math.abs(selectionEnd - selectionStart);
      if (timeDiff < 0.1) { // Less than 0.1 second difference = click
        // Check if the click was outside the previous selection
        if (previousSelectionStart !== null && previousSelectionEnd !== null && !wasClickInsidePreviousSelection()) {
          // Clicked outside previous selection - deselect (no seeking in select mode)
          console.log('Clicked outside selection - deselecting');
          setSelectionStart(null);
          setSelectionEnd(null);
        } else if (previousSelectionStart === null && previousSelectionEnd === null) {
          // No previous selection - just clear (no seeking in select mode)
          console.log('Single click with no previous selection - clearing');
          setSelectionStart(null);
          setSelectionEnd(null);
        } else {
          // Clicked inside previous selection - restore the previous selection
          console.log('Clicked inside selection - restoring previous selection');
          setSelectionStart(previousSelectionStart);
          setSelectionEnd(previousSelectionEnd);
        }
      }
    }

    // Clean up tracking state
    setInitialClickX(null);
    setPreviousSelectionStart(null);
    setPreviousSelectionEnd(null);
  };

  const handleCanvasRightClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Right click detected', {
      selectionStart,
      selectionEnd,
      hasSelection: selectionStart !== null && selectionEnd !== null,
      selectionLength: selectionStart !== null && selectionEnd !== null ? Math.abs(selectionEnd - selectionStart) : 0
    });
    
    // Show context menu only if there's a valid selection
    if (selectionStart !== null && selectionEnd !== null && Math.abs(selectionEnd - selectionStart) > 0.1) {
      console.log('Showing context menu for valid selection');
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        visible: true
      });
    } else {
      console.log('No valid selection - not showing context menu');
    }
  };

  const handleCutSelection = () => {
    if (selectionStart !== null && selectionEnd !== null && onCutAudio) {
      const startTime = Math.min(selectionStart, selectionEnd);
      const endTime = Math.max(selectionStart, selectionEnd);
      onCutAudio(startTime, endTime);
      
      // Clear selection and hide context menu
      setSelectionStart(null);
      setSelectionEnd(null);
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
  };

  // Hide context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Don't hide if clicking on the context menu itself
      if (target.closest('.fixed.bg-white')) return;
      
      // Don't hide if clicking on the canvas (let canvas handle its own events)
      if (target.closest('canvas')) return;
      
      // Hide context menu for any other clicks
      console.log('Click outside detected, hiding context menu');
      setContextMenu(prev => ({ ...prev, visible: false }));
    };

    // Only listen for left clicks to avoid interfering with right-clicks elsewhere
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  return (
    <div className="flex flex-col items-center space-y-2">
      {/* Mode Toggle Buttons - Reserve space to prevent layout shift */}
      <div className="flex items-center space-x-2 self-start ml-4 h-6">
        {(playbackState === 'playing' || playbackState === 'paused' || 
          (recordingState === 'stopped' && duration > 0)) ? (
          <>
            <button
              onClick={() => {
                setInteractionMode('seek');
                // Clear selection when switching to seek mode
                setSelectionStart(null);
                setSelectionEnd(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 ${
                interactionMode === 'seek'
                  ? 'bg-slate-100 text-slate-900 border border-slate-300'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center space-x-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                <span>Seek</span>
              </div>
            </button>
            <button
              onClick={() => setInteractionMode('select')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 ${
                interactionMode === 'select'
                  ? 'bg-slate-100 text-slate-900 border border-slate-300'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <div className="flex items-center space-x-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zM12 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1V4zM12 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-3z" clipRule="evenodd" />
                </svg>
                <span>Select</span>
              </div>
            </button>
            
            {/* Undo Button - Only show when there's something to undo */}
            {canUndo && (
              <button
                onClick={onUndo}
                disabled={recordingState === 'recording' || recordingState === 'paused' || playbackState === 'playing'}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-200 ${
                  (recordingState === 'recording' || recordingState === 'paused' || playbackState === 'playing')
                    ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <div className="flex items-center space-x-1">
                  <span className="text-sm">↶</span>
                  <span>Undo</span>
                </div>
              </button>
            )}
          </>
        ) : null}
      </div>
      
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onContextMenu={handleCanvasRightClick}
          onMouseLeave={() => {
            setIsSelecting(false);
            setIsDraggingCurrentTime(false);
            setIsHoveringCurrentTime(false);
          }}
          className={`shadow-lg rounded-3xl ${
            isDraggingCurrentTime 
              ? 'cursor-grabbing' 
              : isHoveringCurrentTime 
                ? 'cursor-grab' 
                : interactionMode === 'select'
                  ? 'cursor-crosshair' 
                  : 'cursor-pointer'
          }`}
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
      
      <div className="flex justify-between items-center w-full max-w-[1200px] text-sm text-gray-600">
        {/* Left timestamp - only show during playback */}
        {(playbackState === 'playing' || playbackState === 'paused') && (
          <span>{formatTime(currentTime)}</span>
        )}
        
        {/* Spacer for when left timestamp is hidden */}
        {!(playbackState === 'playing' || playbackState === 'paused') && (
          <span></span>
        )}
        
        <div className="flex items-center space-x-2">
          {recordingState === 'recording' && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-red-600 font-medium">Recording...</span>
            </div>
          )}
          {recordingState === 'paused' && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-yellow-600 font-medium">Paused</span>
            </div>
          )}
          {playbackState === 'playing' && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-600 font-medium">Playing</span>
            </div>
          )}
        </div>
        
        {/* Right timestamp - show during recording (growing) or after recording (total) */}
        {(recordingState === 'recording' || recordingState === 'paused' || 
          (recordingState === 'stopped' || recordingState === 'idle') && duration > 0) && (
          <span>{formatTime(duration)}</span>
        )}
        
        {/* Spacer for when right timestamp is hidden */}
        {!(recordingState === 'recording' || recordingState === 'paused' || 
          (recordingState === 'stopped' || recordingState === 'idle') && duration > 0) && (
          <span></span>
        )}
      </div>
      
      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log('Cut button clicked');
              handleCutSelection();
            }}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm text-gray-700 flex items-center"
          >
            <span className="mr-2">✂️</span>
            Cut Selection
          </button>
          <div className="px-4 py-1 text-xs text-gray-500 border-t">
            Debug: Menu visible at ({contextMenu.x}, {contextMenu.y})
          </div>
        </div>
      )}
      
      {/* Selection timestamps */}
      {selectionStart !== null && selectionEnd !== null && (
        <div className="text-sm text-gray-700 mt-2 bg-blue-50 px-3 py-2 rounded-lg border">
          <div className="flex items-center justify-center space-x-4">
            <span className="font-medium text-blue-800">Selection:</span>
            <span className="text-blue-700">
              {formatTime(Math.min(selectionStart, selectionEnd))} - {formatTime(Math.max(selectionStart, selectionEnd))}
            </span>
            <span className="text-blue-600 text-xs">
              Duration: {formatTime(Math.abs(selectionEnd - selectionStart))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
