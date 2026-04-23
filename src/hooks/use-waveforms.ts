import { useState, useCallback, useEffect } from 'react';
import {
  BUILTIN_WAVEFORMS,
  loadCustomWaveforms,
  saveCustomWaveforms,
  parseImportFile,
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

  const importFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      const waveforms = await parseImportFile(file);
      if (waveforms.length === 0) return '无法解析文件格式';
      setCustomWaveforms(prev => [...prev, ...waveforms]);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : '导入失败';
    }
  }, []);

  const addRemoteWaveform = useCallback((waveform: WaveformDefinition) => {
    setCustomWaveforms(prev => {
      if (prev.some(w => w.id === waveform.id)) return prev;
      return [...prev, { ...waveform, custom: true }];
    });
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
    importFile,
    addRemoteWaveform,
    removeWaveform,
    renameWaveform,
    getWaveform,
  };
}
