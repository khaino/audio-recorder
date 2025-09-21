import { useState, useCallback } from 'react';
import { AudioInputSelector } from './components/AudioInputSelector';
import { AudioControls } from './components/AudioControls';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useFileManager } from './hooks/useFileManager';
import { useAudioEnhancement } from './hooks/useAudioEnhancement';
import logo from './assets/logo.png';

function App() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<'mp3' | 'wav' | 'webm'>('mp3');
  const [selectedVolume, setSelectedVolume] = useState<'low' | 'standard' | 'high'>('standard');
  const [isConverting, setIsConverting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  
  // Audio enhancement hook
  const { actions: enhancementActions } = useAudioEnhancement();
  
  const { data: recorderData, actions: recorderActions } = useAudioRecorder(selectedDeviceId);
  const { data: playerData, actions: playerActions } = useAudioPlayer(recorderData.audioUrl, true, selectedVolume); // Enable auto-enhancement with volume
  const { downloadAudio } = useFileManager();

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId);
  }, []);

  const handleDownload = useCallback(async () => {
    if (recorderData.audioBlob && !isConverting) {
      setIsConverting(true);
      try {
        const filename = `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${selectedFormat}`;
        await downloadAudio(
          recorderData.audioBlob, 
          filename, 
          selectedFormat,
          (audioBuffer, audioContext) => enhancementActions.processBuffer(audioBuffer, audioContext, selectedVolume) // Apply current enhancement settings with volume
        );
      } catch (error) {
        console.error('Download failed:', error);
      } finally {
        setIsConverting(false);
      }
    }
  }, [recorderData.audioBlob, downloadAudio, selectedFormat, selectedVolume, isConverting, enhancementActions.processBuffer]);

  const handleFormatChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFormat(event.target.value as 'mp3' | 'wav' | 'webm');
  }, []);

  const handleVolumeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedVolume(event.target.value as 'low' | 'standard' | 'high');
  }, []);

  const handleStartNewRecording = useCallback(() => {
    setShowConfirmDialog(true);
  }, []);

  const handleConfirmNewRecording = useCallback(() => {
    setShowConfirmDialog(false);
    recorderActions.resetRecording();
  }, [recorderActions.resetRecording]);

  const handleCancelNewRecording = useCallback(() => {
    setShowConfirmDialog(false);
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
  


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="text-center mb-6 sm:mb-12">
          <div className="flex items-center justify-center mb-2 sm:mb-4">
            <img 
              src={logo} 
              alt="Audio Recorder Logo" 
              className="w-10 h-10 sm:w-12 sm:h-12"
            />
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mx-2 sm:mx-4">
              Audio Recorder
            </h1>
            <img 
              src={logo} 
              alt="Audio Recorder Logo" 
              className="w-10 h-10 sm:w-12 sm:h-12"
            />
          </div>
          <p className="text-base sm:text-lg text-gray-600">
            Record, enhance, and playback professional-quality audio
          </p>
        </header>

        {/* Social Sharing Bar */}

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Top Controls Row */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
            {/* Left: Audio Input Device or Start New Recording */}
            <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
              {/* Audio Input Device - Only show when no recording exists, disable during recording */}
              {!hasRecording && (
                <div className="w-full sm:w-80 lg:w-auto lg:min-w-80">
                  <AudioInputSelector 
                    onDeviceChange={handleDeviceChange}
                    disabled={recorderData.state === 'countdown' || recorderData.state === 'recording' || recorderData.state === 'paused'}
                  />
                </div>
              )}
              
              {/* Start New Recording Button - Only show when there's a recording */}
              {hasRecording && (
                <button
                  onClick={handleStartNewRecording}
                  disabled={recorderData.state === 'countdown' || playerData.state === 'playing'}
                  className={`flex items-center justify-center space-x-2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium w-full sm:w-32 ${
                    (recorderData.state === 'countdown' || playerData.state === 'playing')
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed border-gray-300'
                      : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 hover:text-orange-800'
                  }`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <span>New</span>
                </button>
              )}
            </div>
            
            {/* Right: Volume Control - Only show when there's a recording for playback */}
            {hasRecording && (
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 w-full sm:w-auto sm:ml-auto">
                <label className="text-sm font-medium text-gray-700 sm:whitespace-nowrap">Volume</label>
                <select
                  value={selectedVolume}
                  onChange={handleVolumeChange}
                  disabled={playerData.state === 'playing'}
                  className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium w-full sm:w-32 ${
                    playerData.state === 'playing'
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : 'bg-white text-gray-900'
                  }`}
                >
                  <option value="low">Low</option>
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
              </div>
            )}
          </div>


          {/* Waveform Visualizer */}
          <div className="flex justify-center">
            <WaveformVisualizer
              recordingState={recorderData.state}
              playbackState={playerData.state}
              currentTime={currentTime}
              duration={duration}
              audioContext={
                (recorderData.state === 'recording' || recorderData.state === 'paused') 
                  ? recorderData.audioContext 
                  : playerData.audioContext
              }
              analyser={
                (recorderData.state === 'recording' || recorderData.state === 'paused') 
                  ? recorderData.analyser 
                  : playerData.analyser
              }
              onSeek={playerActions.seek}
              countdownValue={recorderData.countdownValue}
              onCutAudio={recorderActions.cutAudio}
              audioBlob={recorderData.audioBlob}
              canUndo={recorderData.canUndo}
              onUndo={recorderActions.undo}
              isAudioLoading={playerData.isLoading}
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
          />
          </div>

          {/* File Management */}
          {hasRecording && (
            <div className="flex flex-col items-center space-y-4 pt-6 border-t border-gray-200">
              {/* Download Button and Format Selection */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center space-y-3 sm:space-y-0 sm:space-x-3 w-full max-w-md">
                <button
                  onClick={handleDownload}
                  disabled={isConverting}
                  className="flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200 shadow-lg w-full sm:w-auto text-sm"
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
                      <span>Download</span>
                    </>
                  )}
                </button>
                
                <select
                  value={selectedFormat}
                  onChange={handleFormatChange}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm font-medium w-full sm:w-auto sm:min-w-24"
                >
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                  <option value="webm">WebM</option>
                </select>
              </div>
              
              {/* Enhancement Status */}
              <div className="text-xs text-purple-600 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                <span className="font-medium">🎛️</span> Audio enhanced with professional processing • Volume: {selectedVolume.charAt(0).toUpperCase() + selectedVolume.slice(1)}
              </div>

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

        </div>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <div className="max-w-4xl mx-auto border-t border-gray-200 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              {/* Copyright */}
              <div className="text-sm text-gray-500">
                <p>&copy; 2025 AudioRecorder.ai. All rights reserved.</p>
                <p className="mt-1">Professional audio recording made simple.</p>
              </div>
              
              {/* Contact */}
              <div className="text-sm text-gray-600">
                <p className="mb-2">Have feedback or need help?</p>
                <a 
                  href="mailto:hello@audiorecorder.ai" 
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors duration-200"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                  </svg>
                  <span>hello@audiorecorder.ai</span>
                </a>
              </div>
            </div>
            
          </div>
        </footer>

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
    </div>
  );
}

export default App
