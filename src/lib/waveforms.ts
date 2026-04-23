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
  const prefix = 'Dungeonlab+pulse:';
  if (!content.startsWith(prefix)) return null;

  const body = content.slice(prefix.length);
  const sections = body.split('+section+');
  const allFrames: WaveFrame[] = [];

  for (const section of sections) {
    const parts = section.split('=');
    if (parts.length < 2) continue;

    const headerStr = parts[0]!;
    const shapeStr = parts[1]!;

    const headerParts = headerStr.split(',');
    if (headerParts.length < 5) continue;

    const freqRange1Index = parseInt(headerParts[0]!, 10);
    const freqRange2Index = parseInt(headerParts[1]!, 10);
    const durationIndex = parseInt(headerParts[2]!, 10);
    const frequencyMode = parseInt(headerParts[3]!, 10);
    const enabled = parseInt(headerParts[4]!, 10);

    if (!enabled) continue;

    const freq1 = FREQ_DATASET[freqRange1Index] ?? 10;
    const freq2 = FREQ_DATASET[freqRange2Index] ?? 10;
    const duration = DURATION_DATASET[durationIndex] ?? 1;

    const intensities = shapeStr.split(',').map(s => {
      const val = parseInt(s.split('-')[0]!, 10);
      return isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
    });

    if (intensities.length === 0) continue;

    // Generate frames based on frequency mode
    for (let i = 0; i < intensities.length * duration; i++) {
      const intensityIndex = Math.floor(i / duration) % intensities.length;
      const intensity = intensities[intensityIndex]!;

      let freq: number;
      if (frequencyMode === 1) {
        // constant
        freq = freq1;
      } else {
        // sweep: interpolate between freq1 and freq2
        const t = intensities.length > 1 ? intensityIndex / (intensities.length - 1) : 0;
        freq = Math.round(freq1 + (freq2 - freq1) * t);
      }

      allFrames.push([encodeFreq(freq), intensity]);
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
