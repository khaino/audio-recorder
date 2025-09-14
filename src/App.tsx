import { useState, useCallback } from 'react';
import { AudioInputSelector } from './components/AudioInputSelector';
import { AudioControls } from './components/AudioControls';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useFileManager } from './hooks/useFileManager';

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  const { data: recorderData, actions: recorderActions } = useAudioRecorder(selectedDeviceId);
  const { data: playerData, actions: playerActions } = useAudioPlayer(recorderData.audioUrl);
  const { downloadAudio, saveToLocalStorage } = useFileManager();

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  const handleDownload = useCallback(() => {
    if (recorderData.audioBlob) {
      downloadAudio(recorderData.audioBlob);
    }
  }, [recorderData.audioBlob, downloadAudio]);

  const handleSave = useCallback(() => {
    if (recorderData.audioBlob) {
      saveToLocalStorage(recorderData.audioBlob);
    }
  }, [recorderData.audioBlob, saveToLocalStorage]);

  const hasRecording = recorderData.audioBlob !== null;
  const currentTime = recorderData.state === 'recording' || recorderData.state === 'paused' 
    ? recorderData.currentTime 
    : playerData.currentTime;
  const duration = recorderData.state === 'recording' || recorderData.state === 'paused'
    ? recorderData.currentTime
    : (recorderData.duration > 0 ? recorderData.duration : playerData.duration);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Audio Recorder
          </h1>
          <p className="text-lg text-gray-600">
            Record, visualize, and playback high-quality audio
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-8">
          {/* Audio Input Selector */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <AudioInputSelector onDeviceChange={handleDeviceChange} />
            </div>
          </div>

          {/* Waveform Visualizer */}
          <div className="flex justify-center">
            <WaveformVisualizer
              recordingState={recorderData.state}
              playbackState={playerData.state}
              currentTime={currentTime}
              duration={duration}
              audioContext={recorderData.audioContext || playerData.audioContext}
              analyser={recorderData.analyser || playerData.analyser}
              onSeek={playerActions.seek}
            />
          </div>

          {/* Audio Controls */}
          <div className="flex justify-center">
            <AudioControls
              recordingState={recorderData.state}
              playbackState={playerData.state}
              hasRecording={hasRecording}
              onRecord={recorderActions.startRecording}
              onPauseRecording={recorderActions.pauseRecording}
              onStopRecording={recorderActions.stopRecording}
              onPlay={playerActions.play}
              onPausePlayback={playerActions.pause}
              onStopPlayback={playerActions.stop}
              onReset={recorderActions.resetRecording}
            />
          </div>

          {/* File Management */}
          {hasRecording && (
            <div className="flex justify-center space-x-4 pt-6 border-t border-gray-200">
              <button
                onClick={handleDownload}
                className="flex items-center space-x-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span>Download</span>
              </button>
              
              <button
                onClick={handleSave}
                className="flex items-center space-x-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                </svg>
                <span>Save to Browser</span>
              </button>
            </div>
          )}

          {/* Recording Info */}
          {hasRecording && (
            <div className="text-center text-sm text-gray-500 pt-4">
              Recording duration: {Math.floor((recorderData.duration || 0) / 60)}:{Math.floor((recorderData.duration || 0) % 60).toString().padStart(2, '0')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Built with React, TypeScript, and Tailwind CSS</p>
        </div>
      </div>
    </div>
  );
}

export default App
