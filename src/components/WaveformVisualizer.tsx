import React, { useEffect, useRef, useState } from 'react';
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
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  recordingState,
  playbackState,
  currentTime,
  duration,
  audioContext,
  analyser,
  onSeek,
  countdownValue
}) => {
  const formatTime = (time: number) => {
    // Handle null, undefined, NaN, or negative values
    if (time == null || !isFinite(time) || time < 0) {
      return '0:00';
    }
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isRecordingComplete, setIsRecordingComplete] = useState(false);
  const [playbackStartTime, setPlaybackStartTime] = useState<number | null>(null);

  const width = 1200;
  const height = 240;
  const cornerRadius = 24;

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

      // Draw waveform
      if (waveformData.length > 0) {
        const barWidth = (width - 40) / waveformData.length;
        const centerY = height / 2;

        waveformData.forEach((amplitude, index) => {
          const barHeight = amplitude * (height - 40);
          const x = 20 + index * barWidth;
          const y = centerY - barHeight / 2;

          // Determine bar color with soft, light colors
          let barColor: string | CanvasGradient = '#6b7280'; // Default soft gray
          if (recordingState === 'recording') {
            // Soft cyan/blue gradient for recording with pulse effect
            const isRecentBar = index >= waveformData.length - 10;
            const pulseIntensity = isRecentBar ? 0.7 + 0.3 * Math.sin(Date.now() / 300) : 0.6;
            const opacity = 0.8 + 0.2 * pulseIntensity;
            
            // Create gradient for each bar
            const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            barGradient.addColorStop(0, `rgba(56, 189, 248, ${opacity})`); // Light blue
            barGradient.addColorStop(1, `rgba(14, 165, 233, ${opacity * 0.8})`); // Slightly darker blue
            barColor = barGradient;
          } else if (playbackState === 'playing') {
            // Soft green/cyan gradient for playback with pulse for recent bars
            const isRecentBar = index >= waveformData.length - 10;
            const pulseIntensity = isRecentBar ? 0.7 + 0.3 * Math.sin(Date.now() / 300) : 0.6;
            const opacity = 0.8 + 0.2 * pulseIntensity;
            
            const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            barGradient.addColorStop(0, `rgba(52, 211, 153, ${opacity})`); // Light green
            barGradient.addColorStop(1, `rgba(16, 185, 129, ${opacity * 0.8})`); // Slightly darker green
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
  }, [waveformData, recordingState, playbackState, currentTime, duration, countdownValue]);

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || duration === 0 || waveformData.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const clickProgress = Math.max(0, Math.min(1, (x - 20) / (width - 40)));
    const seekTime = clickProgress * duration;

    onSeek(seekTime);
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleCanvasClick}
          className="cursor-pointer shadow-lg rounded-3xl"
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
      
    </div>
  );
};
