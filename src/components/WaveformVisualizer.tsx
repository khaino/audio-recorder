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
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({
  recordingState,
  playbackState,
  currentTime,
  duration,
  analyser,
  onSeek
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isRecordingComplete, setIsRecordingComplete] = useState(false);

  const width = 800;
  const height = 200;
  const cornerRadius = 20;

  // Function to get real audio amplitude from analyser
  const getRealAudioAmplitude = (): number => {
    if (!analyser) {
      return Math.random() * 0.8 + 0.1; // Fallback to random if no analyser
    }

    // Use time domain data for more responsive waveform
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // Calculate RMS (Root Mean Square) for better amplitude representation
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const sample = (dataArray[i] - 128) / 128; // Convert to -1 to 1 range
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Normalize and apply some scaling for better visibility
    const scaled = Math.min(rms * 3, 1); // Scale up for better visibility
    return Math.max(scaled * 0.9 + 0.1, 0.1);
  };


  useEffect(() => {
    if (recordingState === 'recording') {
      setIsRecordingComplete(false);
      // Gradually build waveform data while recording
      const interval = setInterval(() => {
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
    } else if (recordingState === 'stopped' && !isRecordingComplete) {
      // Keep the current waveform data as-is when stopped
      setIsRecordingComplete(true);
    } else if (recordingState === 'idle') {
      setWaveformData([]);
      setIsRecordingComplete(false);
    }
  }, [recordingState, isRecordingComplete, width, analyser]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw rounded rectangle background
      ctx.beginPath();
      // Fallback for browsers that don't support roundRect
      if (ctx.roundRect) {
        ctx.roundRect(0, 0, width, height, cornerRadius);
      } else {
        // Draw regular rectangle as fallback
        ctx.rect(0, 0, width, height);
      }
      ctx.fillStyle = recordingState === 'recording' ? '#fee2e2' : '#f3f4f6';
      ctx.fill();
      ctx.strokeStyle = recordingState === 'recording' ? '#ef4444' : '#d1d5db';
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

          // Determine bar color
          let barColor = '#9ca3af';
          if (recordingState === 'recording') {
            // Add a subtle pulse effect for the most recent bars during recording
            const isRecentBar = index >= waveformData.length - 10;
            const pulseIntensity = isRecentBar ? 0.8 + 0.2 * Math.sin(Date.now() / 200) : 0.8;
            const red = Math.floor(239 * pulseIntensity);
            const green = Math.floor(68 * pulseIntensity);
            const blue = Math.floor(68 * pulseIntensity);
            barColor = `rgb(${red}, ${green}, ${blue})`;
          } else if (playbackState === 'playing' || playbackState === 'paused') {
            const progress = duration > 0 ? currentTime / duration : 0;
            const currentPosition = progress * waveformData.length;
            barColor = index <= currentPosition ? '#22c55e' : '#9ca3af';
          }

          ctx.fillStyle = barColor;
          ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
        });
      } else {
        // Draw placeholder text
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Click Record to start recording...', width / 2, height / 2);
      }

      // Draw progress indicator line
      if (duration > 0 && waveformData.length > 0) {
        const progress = Math.min(currentTime / duration, 1);
        const lineX = 20 + progress * (width - 40);

        ctx.beginPath();
        ctx.moveTo(lineX, 10);
        ctx.lineTo(lineX, height - 10);
        ctx.strokeStyle = playbackState === 'playing' ? '#22c55e' : recordingState === 'recording' ? '#ef4444' : '#9ca3af';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Draw progress indicator circle
        ctx.beginPath();
        ctx.arc(lineX, height / 2, 8, 0, 2 * Math.PI);
        ctx.fillStyle = playbackState === 'playing' ? '#22c55e' : recordingState === 'recording' ? '#ef4444' : '#9ca3af';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
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
  }, [waveformData, recordingState, playbackState, currentTime, duration]);

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

  const formatTime = (time: number) => {
    if (!time || !isFinite(time)) {
      return '0:00';
    }
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleCanvasClick}
          className="cursor-pointer shadow-lg"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>
      
      <div className="flex justify-between items-center w-full max-w-[800px] text-sm text-gray-600">
        <span>{formatTime(currentTime)}</span>
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
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};
