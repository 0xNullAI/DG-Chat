// P2P 消息协议类型定义。
// 公共类型（UI 使用）保持长字段名；wire 格式（在 use-peer-room 内部）使用短键以减小 payload。

export interface ChatMessage {
  id: string;
  fromSelf: boolean;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
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

/**
 * 设备命令。`target` 由 topic 携带（cmd/{peerId}），不进 payload。
 * 所有参数扁平到顶层，避免双重 JSON 编解码。
 */
export interface DeviceCommand {
  action: CmdAction;
  /** channel: 'A' | 'B' */
  c?: 'A' | 'B';
  /** numeric value: strength / targetStrength / restoreStrength */
  v?: number;
  /** waveform id */
  w?: string;
  /** generic data: alert text, bg color */
  d?: string;
}

export interface WaveformTransfer {
  /** waveform id */
  wid: string;
  /** waveform display name */
  wn: string;
  /** waveform frames [strength, frequency][] */
  fr: [number, number][];
}

export interface WaveformCatalogEntry {
  id: string;
  name: string;
  custom: boolean;
}

/**
 * 完整 MemberState（UI 消费）。
 * Wire 上拆成 fast（每次变化即时广播，节流 200ms）和 slow（5 秒心跳兜底）两个 topic。
 */
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

/** 高频字段：强度 + 当前波形 ID。任一变化触发立即广播。 */
export interface StateFast {
  strengthA: number;
  strengthB: number;
  waveA: string | null;
  waveB: string | null;
}

/** 低频字段：名字、设备连接、电量、波形目录。5 秒心跳。 */
export interface StateSlow {
  displayName: string;
  deviceConnected: boolean;
  battery: number | null;
  waveformCatalog?: WaveformCatalogEntry[];
}
