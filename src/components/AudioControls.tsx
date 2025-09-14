import React from 'react';
import type { RecordingState } from '../hooks/useAudioRecorder';
import type { PlaybackState } from '../hooks/useAudioPlayer';

interface AudioControlsProps {
  recordingState: RecordingState;
  playbackState: PlaybackState;
  hasRecording: boolean;
  onRecord: () => void;
  onPauseRecording: () => void;
  onStopRecording: () => void;
  onPlay: () => void;
  onPausePlayback: () => void;
  onReset: () => void;
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  recordingState,
  playbackState,
  hasRecording,
  onRecord,
  onPauseRecording,
  onStopRecording,
  onPlay,
  onPausePlayback,
  onReset
}) => {
  const getRecordButtonContent = () => {
    switch (recordingState) {
      case 'recording':
        return (
          <>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Pause
          </>
        );
      case 'paused':
        return (
          <>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            Resume
          </>
        );
      default:
        return (
          <>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
            Record
          </>
        );
    }
  };

  const getPlayButtonContent = () => {
    if (playbackState === 'playing') {
      return (
        <>
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Pause
        </>
      );
    }
    return (
      <>
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
        </svg>
        Play
      </>
    );
  };

  const handleRecordClick = () => {
    if (recordingState === 'recording') {
      onPauseRecording();
    } else {
      onRecord();
    }
  };

  const handlePlayClick = () => {
    if (playbackState === 'playing') {
      onPausePlayback();
    } else {
      onPlay();
    }
  };

  const isRecordingActive = recordingState === 'recording' || recordingState === 'paused';
  const canPlay = hasRecording && !isRecordingActive;

  return (
    <div className="flex items-center justify-center space-x-4">
      {/* Record/Pause Button */}
      <button
        onClick={handleRecordClick}
        disabled={playbackState === 'playing'}
        className={`
          flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-200
          ${recordingState === 'recording' 
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg' 
            : recordingState === 'paused'
            ? 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg'
            : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {getRecordButtonContent()}
      </button>

      {/* Stop Button */}
      <button
        onClick={onStopRecording}
        disabled={recordingState === 'idle'}
        className="
          flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-200
          bg-gray-500 hover:bg-gray-600 text-white shadow-lg hover:shadow-xl
          disabled:opacity-50 disabled:cursor-not-allowed
        "
      >
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
        </svg>
        Stop
      </button>

      {/* Play/Pause Button */}
      <button
        onClick={handlePlayClick}
        disabled={!canPlay}
        className="
          flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-200
          bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl
          disabled:opacity-50 disabled:cursor-not-allowed
        "
      >
        {getPlayButtonContent()}
      </button>

      {/* Reset Button */}
      <button
        onClick={onReset}
        disabled={recordingState === 'recording' || playbackState === 'playing'}
        className="
          flex items-center space-x-2 px-4 py-3 rounded-full font-medium transition-all duration-200
          bg-red-100 hover:bg-red-200 text-red-700 border border-red-300
          disabled:opacity-50 disabled:cursor-not-allowed
        "
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
        Reset
      </button>
    </div>
  );
};
