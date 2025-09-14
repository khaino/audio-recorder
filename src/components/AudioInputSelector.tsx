import React from 'react';
import { useAudioDevices } from '../hooks/useAudioDevices';

interface AudioInputSelectorProps {
  onDeviceChange?: (deviceId: string) => void;
}

export const AudioInputSelector: React.FC<AudioInputSelectorProps> = ({ 
  onDeviceChange 
}) => {
  const { devices, selectedDeviceId, setSelectedDeviceId, loading, error } = useAudioDevices();

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    onDeviceChange?.(deviceId);
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-gray-600">Loading audio devices...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-2 text-red-600">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2">
      <label htmlFor="audio-input-select" className="text-sm font-medium text-gray-700">
        Audio Input Device
      </label>
      <select
        id="audio-input-select"
        value={selectedDeviceId}
        onChange={(e) => handleDeviceChange(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </div>
  );
};
