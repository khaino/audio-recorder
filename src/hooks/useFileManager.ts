import { useCallback } from 'react';
import { Mp3Encoder } from '@breezystack/lamejs';

export const useFileManager = () => {
  // Convert audio blob to WAV format
  const convertToWAV = useCallback(async (audioBlob: Blob): Promise<Blob> => {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Create WAV file
      const wavBuffer = audioBufferToWav(audioBuffer);
      await audioContext.close();
      
      return new Blob([wavBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('Error converting to WAV:', error);
      // Fallback to original blob
      return audioBlob;
    }
  }, []);

  // Helper function to convert AudioBuffer to WAV format
  const audioBufferToWav = useCallback((buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }, []);

  // Convert audio blob to MP3 format
  const convertToMP3 = useCallback(async (audioBlob: Blob): Promise<Blob> => {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const channels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const kbps = 128;
      
      // Create MP3 encoder
      const mp3encoder = new Mp3Encoder(channels, sampleRate, kbps);
      const mp3Data: Uint8Array[] = [];
      
      // Simpler approach: process in larger chunks
      const blockSize = 1152;
      const totalSamples = audioBuffer.length;
      
      
      // Get audio data
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = channels > 1 ? audioBuffer.getChannelData(1) : null;
      
      // Process audio in blocks
      for (let offset = 0; offset < totalSamples; offset += blockSize) {
        const currentBlockSize = Math.min(blockSize, totalSamples - offset);
        
        // Prepare buffers
        const leftBuffer = new Int16Array(blockSize);
        const rightBuffer = channels > 1 ? new Int16Array(blockSize) : undefined;
        
        // Fill buffers with audio data
        for (let i = 0; i < blockSize; i++) {
          const sampleIndex = offset + i;
          
          if (sampleIndex < totalSamples) {
            // Convert float32 [-1, 1] to int16 [-32768, 32767]
            const leftSample = leftChannel[sampleIndex];
            leftBuffer[i] = Math.max(-32768, Math.min(32767, Math.round(leftSample * 32767)));
            
            if (rightBuffer && rightChannel) {
              const rightSample = rightChannel[sampleIndex];
              rightBuffer[i] = Math.max(-32768, Math.min(32767, Math.round(rightSample * 32767)));
            }
          } else {
            // Pad with silence
            leftBuffer[i] = 0;
            if (rightBuffer) rightBuffer[i] = 0;
          }
        }
        
        // Encode this block
        let encoded: Int8Array;
        if (channels === 1) {
          encoded = mp3encoder.encodeBuffer(leftBuffer);
        } else {
          encoded = mp3encoder.encodeBuffer(leftBuffer, rightBuffer);
        }
        
        if (encoded.length > 0) {
          mp3Data.push(new Uint8Array(encoded));
        }
      }
      
      // Flush encoder
      const remaining = mp3encoder.flush();
      if (remaining.length > 0) {
        mp3Data.push(new Uint8Array(remaining));
      }
      
      await audioContext.close();
      
      // Combine all MP3 data
      const totalLength = mp3Data.reduce((sum, chunk) => sum + chunk.length, 0);
      
      if (totalLength === 0) {
        throw new Error('No MP3 data generated');
      }
      
      // Create final MP3 buffer
      const finalBuffer = new Uint8Array(totalLength);
      let position = 0;
      for (const chunk of mp3Data) {
        finalBuffer.set(chunk, position);
        position += chunk.length;
      }
      
      return new Blob([finalBuffer], { type: 'audio/mpeg' });
      
    } catch (error) {
      console.error('MP3 conversion failed:', error);
      // Return original blob as fallback
      return audioBlob;
    }
  }, []);

  const downloadAudio = useCallback(async (
    audioBlob: Blob, 
    filename?: string, 
    format?: 'mp3' | 'wav' | 'webm',
    processBuffer?: (audioBuffer: AudioBuffer, audioContext: AudioContext) => { source: AudioBufferSourceNode, output: AudioNode }
  ) => {
    let processedBlob = audioBlob;
    let defaultFilename = `recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
    
    // Apply audio processing if provided
    if (processBuffer) {
      try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create processed audio buffer using offline rendering
        const offlineContext = new OfflineAudioContext(
          audioBuffer.numberOfChannels,
          audioBuffer.length,
          audioBuffer.sampleRate
        );
        
        // Get processed source and output
        const { source: processedSource, output: processedOutput } = processBuffer(audioBuffer, offlineContext);
        
        // Connect to destination for rendering
        processedOutput.connect(offlineContext.destination);
        
        // Start and render
        processedSource.start(0);
        const renderedBuffer = await offlineContext.startRendering();
        
        // Convert enhanced buffer back to blob
        const wavBuffer = audioBufferToWav(renderedBuffer);
        processedBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        
        await audioContext.close();
      } catch (error) {
        console.error('Error applying enhancement to download:', error);
        // Continue with original blob if processing fails
      }
    }
    
    // Convert audio if needed (unless already processed above)
    if (format === 'wav' && !processBuffer) {
      processedBlob = await convertToWAV(audioBlob);
      filename = filename || `${defaultFilename}.wav`;
    } else if (format === 'wav' && processBuffer) {
      // Already processed to WAV above
      filename = filename || `${defaultFilename}.wav`;
    } else if (format === 'mp3') {
      processedBlob = await convertToMP3(audioBlob);
      filename = filename || `${defaultFilename}.mp3`;
    } else {
      // WebM or default
      if (!filename) {
        const extension = audioBlob.type.includes('webm') ? 'webm' : 
                        audioBlob.type.includes('mp4') ? 'mp4' : 'wav';
        filename = `${defaultFilename}.${extension}`;
      }
    }
    
    const url = URL.createObjectURL(processedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [convertToWAV, convertToMP3]);

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
