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
    let isInitialized = false;

    const getDevices = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Request microphone permission to get real device labels (only on first load)
        if (!isInitialized) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Stop the stream immediately - we just needed permission
            stream.getTracks().forEach(track => track.stop());
          } catch (permissionError) {
            // If permission denied, we'll still try to get devices but with generic labels
            console.warn('Microphone permission denied, using generic device labels');
          }
        }
        
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
        
        // Set default device only on first initialization
        if (!isInitialized && audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0].deviceId);
          isInitialized = true;
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
  }, []); // Remove selectedDeviceId dependency to prevent infinite loop

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    loading,
    error
  };
};
