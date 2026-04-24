// P2P 消息协议类型定义

export interface ChatMessage {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface DeviceCommand {
  target: string;
  action: CmdAction;
  data?: string;
}

export type CmdAction =
  | 'adjust_strength'
  | 'change_wave'
  | 'start'
  | 'stop'
  | 'stop_wave'
  | 'fire'
  | 'fire_stop'
  | 'burst'
  | 'vibrate'
  | 'alert'
  | 'bg'
  | 'shake'
  | 'beep';

export interface WaveformTransfer {
  waveform: {
    id: string;
    name: string;
    description: string;
    frames: [number, number][];
  };
  fromName: string;
}

export interface WaveformCatalogEntry {
  id: string;
  name: string;
  custom: boolean;
}

export interface MemberState {
  peerId: string;
  displayName: string;
  deviceConnected: boolean;
  strengthA: number;
  strengthB: number;
  waveA: string | null;
  waveB: string | null;
  battery: number | null;
  waveformCatalog?: WaveformCatalogEntry[];
}
