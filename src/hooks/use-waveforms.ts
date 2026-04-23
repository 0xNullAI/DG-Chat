import { useState, useCallback, useEffect } from 'react';
import {
  BUILTIN_WAVEFORMS,
  loadCustomWaveforms,
  saveCustomWaveforms,
  parsePulseFile,
  type WaveformDefinition,
} from '../lib/waveforms';

export function useWaveforms() {
  const [customWaveforms, setCustomWaveforms] = useState<WaveformDefinition[]>(() =>
    loadCustomWaveforms()
  );

  // All waveforms = builtin + custom
  const allWaveforms = [...BUILTIN_WAVEFORMS, ...customWaveforms];

  // Save to localStorage whenever customWaveforms changes
  useEffect(() => {
    saveCustomWaveforms(customWaveforms);
  }, [customWaveforms]);

  // Import from .pulse file
  const importPulseFile = useCallback(async (file: File): Promise<string | null> => {
    const text = await file.text();
    const waveform = parsePulseFile(text);
    if (!waveform) return '无法解析文件格式';

    // Use filename (without extension) as name
    const name = file.name.replace(/\.pulse$/i, '') || '导入波形';
    waveform.name = name;
    waveform.id = `custom-${name.replace(/\W/g, '')}-${Date.now().toString(36)}`;

    setCustomWaveforms(prev => [...prev, waveform]);
    return null; // no error
  }, []);

  // Remove a custom waveform
  const removeWaveform = useCallback((id: string) => {
    setCustomWaveforms(prev => prev.filter(w => w.id !== id));
  }, []);

  // Rename a custom waveform
  const renameWaveform = useCallback((id: string, newName: string) => {
    setCustomWaveforms(prev =>
      prev.map(w => (w.id === id ? { ...w, name: newName } : w))
    );
  }, []);

  // Get waveform by ID (from any source)
  const getWaveform = useCallback(
    (id: string): WaveformDefinition | undefined => {
      return allWaveforms.find(w => w.id === id);
    },
    [allWaveforms]
  );

  return {
    allWaveforms,
    builtinWaveforms: BUILTIN_WAVEFORMS,
    customWaveforms,
    importPulseFile,
    removeWaveform,
    renameWaveform,
    getWaveform,
  };
}
