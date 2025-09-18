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
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <img 
              src={logo} 
              alt="Audio Recorder Logo" 
              className="w-12 h-12"
            />
            <h1 className="text-4xl font-bold text-gray-900">
              Audio Recorder
            </h1>
            <img 
              src={logo} 
              alt="Audio Recorder Logo" 
              className="w-12 h-12 mr-2"
            />
          </div>
          <p className="text-lg text-gray-600">
            Record, enhance, and playback professional-quality audio
          </p>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
          {/* Top Controls Row */}
          <div className="flex justify-between items-center">
            {/* Left: Audio Input Device */}
            <div className="flex items-center space-x-4">
              {/* Audio Input Device - Only show when no recording exists, disable during recording */}
              {!hasRecording && (
                <div className="w-64">
                  <AudioInputSelector 
                    onDeviceChange={handleDeviceChange}
                    disabled={recorderData.state === 'countdown' || recorderData.state === 'recording' || recorderData.state === 'paused'}
                  />
                </div>
              )}
            </div>
            
            {/* Right: Volume Control - Only show when there's a recording for playback */}
            {hasRecording && (
              <div className="flex items-center space-x-3 ml-auto">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Volume</label>
                <select
                  value={selectedVolume}
                  onChange={handleVolumeChange}
                  disabled={playerData.state === 'playing'}
                  className={`px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium w-32 ${
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
            onStartNewRecording={recorderActions.resetRecording}
          />
          </div>

          {/* File Management */}
          {hasRecording && (
            <div className="flex flex-col items-center space-y-4 pt-6 border-t border-gray-200">
              {/* Download Button and Format Selection */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleDownload}
                  disabled={isConverting}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200 shadow-lg"
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
                  className="px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-sm font-medium"
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

      </div>
    </div>
  );
}

export default App
