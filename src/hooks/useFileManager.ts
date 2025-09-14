import { useCallback } from 'react';

export const useFileManager = () => {
  const downloadAudio = useCallback((audioBlob: Blob, filename?: string) => {
    const url = URL.createObjectURL(audioBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const saveToLocalStorage = useCallback((audioBlob: Blob, key?: string) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const storageKey = key || `audio_recording_${Date.now()}`;
      localStorage.setItem(storageKey, base64data);
    };
    reader.readAsDataURL(audioBlob);
  }, []);

  const loadFromLocalStorage = useCallback((key: string): Blob | null => {
    try {
      const base64data = localStorage.getItem(key);
      if (!base64data) return null;

      const byteCharacters = atob(base64data.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: 'audio/wav' });
    } catch (error) {
      console.error('Error loading audio from localStorage:', error);
      return null;
    }
  }, []);

  const getStoredRecordings = useCallback((): string[] => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('audio_recording_')) {
        keys.push(key);
      }
    }
    return keys.sort().reverse(); // Most recent first
  }, []);

  const deleteRecording = useCallback((key: string) => {
    localStorage.removeItem(key);
  }, []);

  return {
    downloadAudio,
    saveToLocalStorage,
    loadFromLocalStorage,
    getStoredRecordings,
    deleteRecording
  };
};
