import { useState, useCallback } from 'react';
import { AudioInputSelector } from './components/AudioInputSelector';
import { AudioControls } from './components/AudioControls';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useFileManager } from './hooks/useFileManager';

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<'mp3' | 'wav' | 'webm'>('mp3');
  const [isConverting, setIsConverting] = useState(false);
  
  const { data: recorderData, actions: recorderActions } = useAudioRecorder(selectedDeviceId);
  const { data: playerData, actions: playerActions } = useAudioPlayer(recorderData.audioUrl);
  const { downloadAudio } = useFileManager();

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  const handleDownload = useCallback(async () => {
    if (recorderData.audioBlob && !isConverting) {
      setIsConverting(true);
      try {
        const filename = `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${selectedFormat}`;
        await downloadAudio(recorderData.audioBlob, filename, selectedFormat);
      } catch (error) {
        console.error('Download failed:', error);
      } finally {
        setIsConverting(false);
      }
    }
  }, [recorderData.audioBlob, downloadAudio, selectedFormat, isConverting]);

  const handleFormatChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFormat(event.target.value as 'mp3' | 'wav' | 'webm');
  }, []);

  const hasRecording = recorderData.audioBlob !== null;
  
  // Current time logic: use recorder time when recording/paused, player time during playback
  const currentTime = (recorderData.state === 'recording' || recorderData.state === 'paused') 
    ? recorderData.currentTime 
    : playerData.currentTime;
  
  // Duration logic: 
  // - During recording: use current recording time as duration (it grows as we record)
  // - After recording/playback: always show the total recorded duration
  const duration = (recorderData.state === 'recording' || recorderData.state === 'paused')
    ? recorderData.currentTime  // Duration grows with recording time
    : recorderData.duration > 0 ? recorderData.duration : 0;  // Use recorded duration, fallback to 0
  
  // Enhanced debug logging
  if (recorderData.state === 'recording') {
    console.log('🔴 RECORDING - currentTime:', recorderData.currentTime, 'duration passed to visualizer:', duration);
  }

  // Debug logging for timestamp issues
  console.log('App.tsx time values:', {
    recorderState: recorderData.state,
    playerState: playerData.state,
    recorderCurrentTime: recorderData.currentTime,
    recorderDuration: recorderData.duration,
    playerCurrentTime: playerData.currentTime,
    playerDuration: playerData.duration,
    calculatedCurrentTime: currentTime,
    calculatedDuration: duration
  });

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
            onStartNewRecording={recorderActions.resetRecording}
          />
          </div>

          {/* File Management */}
          {hasRecording && (
            <div className="flex flex-col items-center space-y-4 pt-6 border-t border-gray-200">
              {/* Format Selection */}
              <div className="flex items-center space-x-3">
                <label htmlFor="format-select" className="text-sm font-medium text-gray-700">
                  Format:
                </label>
                <select
                  id="format-select"
                  value={selectedFormat}
                  onChange={handleFormatChange}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm font-medium"
                >
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                  <option value="webm">WebM</option>
                </select>
              </div>
              
              {/* Download Button */}
              <button
                onClick={handleDownload}
                disabled={isConverting}
                className="flex items-center space-x-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200 shadow-lg"
              >
                {isConverting ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    <span>Download as {selectedFormat.toUpperCase()}</span>
                  </>
                )}
              </button>
              
              {/* Format Information */}
              {selectedFormat === 'mp3' && (
                <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                  <span className="font-medium">⚠</span> MP3 conversion is experimental. If playback fails, try WAV or WebM format.
                </div>
              )}
              
              {selectedFormat === 'wav' && (
                <div className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                  <span className="font-medium">✓</span> WAV format provides uncompressed audio quality.
                </div>
              )}
              
              {selectedFormat === 'webm' && (
                <div className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                  <span className="font-medium">ℹ</span> WebM is the original recorded format (smallest file size).
                </div>
              )}
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
