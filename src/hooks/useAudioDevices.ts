import { useState, useEffect } from 'react';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export const useAudioDevices = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getDevices = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Try to get devices without requesting permission first
        // This avoids triggering the browser's recording indicator
        
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = deviceList
          .filter(device => device.kind === 'audioinput')
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${index + 1}`
          }));
        
        // If we don't have any devices, add a default option
        if (audioInputs.length === 0) {
          audioInputs.push({ deviceId: 'default', label: 'Default Microphone' });
        }
        
        setDevices(audioInputs);
        
        // Set default device if none selected
        if (audioInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(audioInputs[0].deviceId);
        }
      } catch (err) {
        setError('Failed to access audio devices. Please grant microphone permission.');
        console.error('Error getting audio devices:', err);
      } finally {
        setLoading(false);
      }
    };

    getDevices();

    // Listen for device changes
    const handleDeviceChange = () => {
      getDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [selectedDeviceId]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    loading,
    error
  };
};
