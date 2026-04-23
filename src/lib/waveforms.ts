import { strFromU8, unzipSync } from 'fflate';

// 波形帧：[编码频率, 强度(0-100)]
export type WaveFrame = [number, number];

export interface WaveformDefinition {
  id: string;
  name: string;
  description: string;
  frames: WaveFrame[];
  custom?: boolean;  // true for user-imported waveforms
}

// 内置波形
export const BUILTIN_WAVEFORMS: WaveformDefinition[] = [
  {
    id: 'breath',
    name: '呼吸',
    description: '渐强渐弱，最温柔的铺垫波形',
    frames: [
      [10, 0], [10, 20], [10, 40], [10, 60], [10, 80], [10, 100],
      [10, 100], [10, 100], [10, 0], [10, 0], [10, 0], [10, 0],
    ],
  },
  {
    id: 'tide',
    name: '潮汐',
    description: '波浪般起伏的慢节奏',
    frames: [
      [10, 0], [11, 16], [13, 33], [14, 50], [16, 66], [18, 83],
      [19, 100], [21, 92], [22, 84], [24, 76], [26, 68], [26, 0],
      [27, 16], [29, 33], [30, 50], [32, 66], [34, 83], [35, 100],
      [37, 92], [38, 84], [40, 76], [42, 68],
    ],
  },
  {
    id: 'pulse_low',
    name: '低脉冲',
    description: '轻柔的规律节奏',
    frames: Array.from({ length: 10 }, () => [10, 30] as WaveFrame),
  },
  {
    id: 'pulse_mid',
    name: '中脉冲',
    description: '中等强度的规律节奏',
    frames: Array.from({ length: 10 }, () => [10, 60] as WaveFrame),
  },
  {
    id: 'pulse_high',
    name: '高脉冲',
    description: '强烈的规律节奏',
    frames: Array.from({ length: 10 }, () => [10, 100] as WaveFrame),
  },
  {
    id: 'tap',
    name: '敲击',
    description: '带节奏停顿的点触感',
    frames: [
      [10, 100], [10, 0], [10, 0], [10, 100], [10, 0], [10, 0],
    ],
  },
];

// 频率编码（数值→编码值）
function encodeFreq(value: number): number {
  if (value <= 10) return 10;
  if (value <= 100) return value;
  if (value <= 600) return Math.round((value - 100) / 5 + 100);
  if (value <= 1000) return Math.round((value - 600) / 10 + 200);
  return 240;
}

// Dungeonlab+pulse 格式导入
const FREQ_DATASET = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const DURATION_DATASET = [1, 2, 3, 4, 5, 8, 10, 15, 20, 30, 40, 50, 60];

export function parsePulseFile(content: string): WaveformDefinition | null {
  const trimmed = content.trim().replace(/^﻿/, '');
  if (!/^Dungeonlab\+pulse:/i.test(trimmed)) return null;

  const cleanData = trimmed.replace(/^Dungeonlab\+pulse:/i, '');
  const sectionParts = cleanData.split('+section+');
  if (sectionParts.length === 0 || !sectionParts[0]) return null;

  const firstPart = sectionParts[0];
  const equalIndex = firstPart.indexOf('=');
  if (equalIndex === -1) return null;

  const firstSectionData = firstPart.substring(equalIndex + 1);
  const allSectionData = [firstSectionData, ...sectionParts.slice(1)];

  const allFrames: WaveFrame[] = [];

  for (const sectionData of allSectionData) {
    if (!sectionData) continue;

    const slashIndex = sectionData.indexOf('/');
    if (slashIndex === -1) continue;

    const headerPart = sectionData.substring(0, slashIndex);
    const shapePart = sectionData.substring(slashIndex + 1);
    const headerValues = headerPart.split(',');

    const freqRange1Index = Number(headerValues[0]) || 0;
    const freqRange2Index = Number(headerValues[1]) || 0;
    const durationIndex = Number(headerValues[2]) || 0;
    const freqMode = Number(headerValues[3]) || 1;
    const enabled = headerValues[4] !== '0';

    if (!enabled) continue;

    const freq1 = FREQ_DATASET[freqRange1Index] ?? 10;
    const freq2 = FREQ_DATASET[freqRange2Index] ?? 10;
    const duration = DURATION_DATASET[durationIndex] ?? 1;

    const intensities: number[] = [];
    for (const item of shapePart.split(',')) {
      if (!item) continue;
      const [strengthStr] = item.split('-');
      const strength = Math.round(Number(strengthStr) || 0);
      intensities.push(Math.max(0, Math.min(100, strength)));
    }

    if (intensities.length < 2) continue;

    const shapeCount = intensities.length;
    const pulseElementCount = Math.max(1, Math.ceil(duration / shapeCount));
    const actualDuration = pulseElementCount * shapeCount;

    for (let elementIndex = 0; elementIndex < pulseElementCount; elementIndex++) {
      for (let shapeIndex = 0; shapeIndex < shapeCount; shapeIndex++) {
        const strength = intensities[shapeIndex]!;
        const currentTime = elementIndex * shapeCount + shapeIndex;
        const sectionProgress = currentTime / actualDuration;
        const elementProgress = shapeIndex / shapeCount;

        let rawFreq: number;
        switch (freqMode) {
          case 2:
            rawFreq = freq1 + (freq2 - freq1) * sectionProgress;
            break;
          case 3:
            rawFreq = freq1 + (freq2 - freq1) * elementProgress;
            break;
          case 4: {
            const progress = pulseElementCount > 1 ? elementIndex / (pulseElementCount - 1) : 0;
            rawFreq = freq1 + (freq2 - freq1) * progress;
            break;
          }
          default:
            rawFreq = freq1;
        }

        allFrames.push([encodeFreq(rawFreq), strength]);
      }
    }
  }

  if (allFrames.length === 0) return null;

  return {
    id: `custom-${Date.now().toString(36)}`,
    name: '导入波形',
    description: '从 .pulse 文件导入',
    frames: allFrames,
    custom: true,
  };
}

export async function parseImportFile(file: File): Promise<WaveformDefinition[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const results: WaveformDefinition[] = [];

  if (/\.zip$/i.test(file.name)) {
    const entries = unzipSync(bytes);
    for (const [entryName, content] of Object.entries(entries)) {
      if (!/\.pulse$/i.test(entryName)) continue;
      const text = strFromU8(content);
      const wf = parsePulseFile(text);
      if (wf) {
        const name = entryName.replace(/^.*[\\/]/, '').replace(/\.pulse$/i, '') || '导入波形';
        wf.name = name;
        wf.id = `custom-${name.replace(/\W/g, '')}-${Date.now().toString(36)}-${results.length}`;
        results.push(wf);
      }
    }
  } else {
    const text = new TextDecoder().decode(bytes);
    const wf = parsePulseFile(text);
    if (wf) {
      const name = file.name.replace(/\.pulse$/i, '') || '导入波形';
      wf.name = name;
      wf.id = `custom-${name.replace(/\W/g, '')}-${Date.now().toString(36)}`;
      results.push(wf);
    }
  }

  return results;
}

// localStorage persistence for custom waveforms
const STORAGE_KEY = 'dg-chat-custom-waveforms';

export function loadCustomWaveforms(): WaveformDefinition[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as WaveformDefinition[];
  } catch {
    return [];
  }
}

export function saveCustomWaveforms(waveforms: WaveformDefinition[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(waveforms));
}
