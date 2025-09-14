import React, { useState } from 'react';
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
  onStopPlayback: () => void;
  onStartNewRecording: () => void;
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
  onStopPlayback,
  onStartNewRecording
}) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
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

  const handleStopClick = () => {
    // Stop recording if active
    if (recordingState === 'recording' || recordingState === 'paused') {
      onStopRecording();
    }
    // Stop playback if active
    if (playbackState === 'playing' || playbackState === 'paused') {
      onStopPlayback();
    }
  };

  const handleStartNewRecording = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmNewRecording = () => {
    setShowConfirmDialog(false);
    onStartNewRecording();
  };

  const handleCancelNewRecording = () => {
    setShowConfirmDialog(false);
  };

  const isRecordingActive = recordingState === 'recording' || recordingState === 'paused';
  const canPlay = hasRecording && !isRecordingActive;
  const showPlaybackControls = hasRecording && !isRecordingActive;

  return (
    <>
      {/* Main Controls Container */}
      <div className="flex flex-col items-center space-y-4">
        {/* Initial State: Record/Pause and Stop buttons in center */}
        {!showPlaybackControls && (
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
              onClick={handleStopClick}
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
          </div>
        )}

        {/* After Recording State: Responsive layout */}
        {showPlaybackControls && (
          <>
            {/* Desktop layout: Play/Pause, Stop in center, Start New Recording on right */}
            <div className="hidden sm:flex sm:items-center sm:justify-center sm:space-x-4">
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

              {/* Stop Button */}
              <button
                onClick={handleStopClick}
                disabled={playbackState === 'idle' && recordingState === 'idle'}
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

              {/* Start New Recording Button - Right position on desktop */}
              <button
                onClick={handleStartNewRecording}
                disabled={recordingState === 'recording' || playbackState === 'playing'}
                className="
                  flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-200
                  bg-orange-500 hover:bg-orange-600 text-white shadow-lg hover:shadow-xl
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Start New Recording
              </button>
            </div>

            {/* Mobile layout: Play/Pause and Stop on first row, Start New Recording on second row */}
            <div className="sm:hidden flex flex-col items-center space-y-4">
              {/* First row: Play/Pause and Stop */}
              <div className="flex items-center space-x-4">
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

                {/* Stop Button */}
                <button
                  onClick={handleStopClick}
                  disabled={playbackState === 'idle' && recordingState === 'idle'}
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
              </div>

              {/* Second row: Start New Recording */}
              <div className="flex justify-center">
                <button
                  onClick={handleStartNewRecording}
                  disabled={recordingState === 'recording' || playbackState === 'playing'}
                  className="
                    flex items-center space-x-2 px-6 py-3 rounded-full font-medium transition-all duration-200
                    bg-orange-500 hover:bg-orange-600 text-white shadow-lg hover:shadow-xl
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Start New Recording
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Start New Recording?
            </h3>
            <p className="text-gray-600 mb-6">
              This will clear all current recording data and start fresh. This action cannot be undone.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                onClick={handleCancelNewRecording}
                className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmNewRecording}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                Start New Recording
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
