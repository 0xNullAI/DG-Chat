/**
 * DG-Lab Coyote v2/v3 蓝牙协议实现
 * 支持 47L121 (v3) 和 D-LAB ESTIM (v2) 两代设备
 */

// ============================================================
// 常量与 UUID 定义
// ============================================================

/** v3 设备 (47L121) 蓝牙 UUID */
const V3_UUIDS = {
  PRIMARY_SERVICE: '0000180c-0000-1000-8000-00805f9b34fb',
  WRITE_CHAR: '0000150a-0000-1000-8000-00805f9b34fb',
  NOTIFY_CHAR: '0000150b-0000-1000-8000-00805f9b34fb',
  BATTERY_SERVICE: '0000180a-0000-1000-8000-00805f9b34fb',
  BATTERY_CHAR: '00001500-0000-1000-8000-00805f9b34fb',
} as const;

/** v2 设备 (D-LAB ESTIM) 蓝牙 UUID */
const V2_UUIDS = {
  PRIMARY_SERVICE: '955a180b-0fe2-f5aa-a094-84b8d4f3e8ad',
  STRENGTH_CHAR: '955a1504-0fe2-f5aa-a094-84b8d4f3e8ad',
  WAVE_A_CHAR: '955a1505-0fe2-f5aa-a094-84b8d4f3e8ad',
  WAVE_B_CHAR: '955a1506-0fe2-f5aa-a094-84b8d4f3e8ad',
  BATTERY_SERVICE: '955a180a-0fe2-f5aa-a094-84b8d4f3e8ad',
  BATTERY_CHAR: '955a1500-0fe2-f5aa-a094-84b8d4f3e8ad',
} as const;

/** 通信间隔（毫秒），v3 每 100ms 发送一次 B0 包 */
const TICK_INTERVAL_MS = 100;

// ============================================================
// 类型定义
// ============================================================

export type DeviceVersion = 'v2' | 'v3';

export interface DeviceInfo {
  version: DeviceVersion;
  name: string;
  battery: number;
}

/**
 * 波形帧：[编码后的频率, 强度(0-100)]
 * 编码频率通过 decodeFreq 转换为实际毫秒值
 */
export type WaveFrame = [number, number];

/** 单通道波形播放状态 */
interface ChannelState {
  frames: WaveFrame[] | null;
  index: number;
  loop: boolean;
  active: boolean;
  waveformId: string | null;
}

// ============================================================
// 频率编解码
// ============================================================

/**
 * 将编码后的频率值解码为实际周期（毫秒）
 * 编码规则：
 *   0-100   → 直接使用
 *   101-200 → (encoded - 100) * 5 + 100
 *   201+    → (encoded - 200) * 10 + 600
 */
function decodeFreq(encoded: number): number {
  if (encoded <= 100) return encoded;
  if (encoded <= 200) return (encoded - 100) * 5 + 100;
  return (encoded - 200) * 10 + 600;
}

// ============================================================
// 工具函数
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeChannelState(): ChannelState {
  return {
    frames: null,
    index: 0,
    loop: false,
    active: false,
    waveformId: null,
  };
}

// ============================================================
// DGLabDevice 主类
// ============================================================

export class DGLabDevice {
  private device: BluetoothDevice | null = null;
  private version: DeviceVersion = 'v3';

  // v3 通用读写特征
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;

  // v2 独立特征
  private strengthChar: BluetoothRemoteGATTCharacteristic | null = null;
  private waveAChar: BluetoothRemoteGATTCharacteristic | null = null;
  private waveBChar: BluetoothRemoteGATTCharacteristic | null = null;

  // 电池特征（v2/v3 通用）
  private batteryChar: BluetoothRemoteGATTCharacteristic | null = null;

  /** 序列号，v3 协议中 0-15 */
  private seq = 0;
  private strengthA = 0;
  private strengthB = 0;
  /** 上一次发送的强度，用于检测变化 */
  private lastSentStrA = 0;
  private lastSentStrB = 0;
  /** A 通道强度上限，默认 50 */
  private limitA = 50;
  /** B 通道强度上限，默认 50 */
  private limitB = 50;
  private battery = 0;

  private channelA: ChannelState = makeChannelState();
  private channelB: ChannelState = makeChannelState();

  private tickTimer: number | null = null;
  private tickInFlight = false;
  private onStateChange: (() => void) | null = null;

  /** v3 收到 B1 确认包时更新的实际强度 */
  private actualStrA = 0;
  private actualStrB = 0;
  /** v3 ACK 门控：是否允许发送强度变更 */
  private ackAllowed = true;
  private pendingSeq = 0;
  private ackSentAt = 0;

  // ----------------------------------------------------------
  // 公开 API
  // ----------------------------------------------------------

  /**
   * 扫描并连接设备
   * 自动识别 v2/v3 版本，读取电池电量，启动通信定时器
   */
  async connect(): Promise<DeviceInfo> {
    // 请求蓝牙设备，同时过滤 v2 和 v3 服务
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: '47L121' },
        { namePrefix: 'D-LAB ESTIM' },
      ],
      optionalServices: [
        V3_UUIDS.PRIMARY_SERVICE,
        V3_UUIDS.BATTERY_SERVICE,
        V2_UUIDS.PRIMARY_SERVICE,
        V2_UUIDS.BATTERY_SERVICE,
      ],
    });

    this.device = device;
    const server = await device.gatt!.connect();

    // 尝试连接 v3 服务，如果失败则尝试 v2
    let connected = false;
    try {
      const primaryService = await server.getPrimaryService(V3_UUIDS.PRIMARY_SERVICE);
      this.version = 'v3';
      this.writeChar = await primaryService.getCharacteristic(V3_UUIDS.WRITE_CHAR);
      this.notifyChar = await primaryService.getCharacteristic(V3_UUIDS.NOTIFY_CHAR);

      // 监听 v3 通知（B1 确认包）
      this.notifyChar.addEventListener(
        'characteristicvaluechanged',
        this.handleV3Notification.bind(this),
      );
      await this.notifyChar.startNotifications();

      // 读取电池
      try {
        const battService = await server.getPrimaryService(V3_UUIDS.BATTERY_SERVICE);
        this.batteryChar = await battService.getCharacteristic(V3_UUIDS.BATTERY_CHAR);
        const battVal = await this.batteryChar.readValue();
        this.battery = battVal.getUint8(0);
      } catch {
        // 电池读取失败不影响正常使用
      }

      // 发送 BF 初始化包，设定强度上限
      await this.sendBFInit();
      connected = true;
    } catch {
      // v3 服务不存在，尝试 v2
    }

    if (!connected) {
      const primaryService = await server.getPrimaryService(V2_UUIDS.PRIMARY_SERVICE);
      this.version = 'v2';
      this.strengthChar = await primaryService.getCharacteristic(V2_UUIDS.STRENGTH_CHAR);
      this.waveAChar = await primaryService.getCharacteristic(V2_UUIDS.WAVE_A_CHAR);
      this.waveBChar = await primaryService.getCharacteristic(V2_UUIDS.WAVE_B_CHAR);

      // 订阅 v2 强度通知（物理拨轮变化）
      try {
        this.strengthChar.addEventListener(
          'characteristicvaluechanged',
          this.handleV2StrengthNotification.bind(this),
        );
        await this.strengthChar.startNotifications();
      } catch {
        // 通知订阅失败不影响正常写入
      }

      // 读取电池
      try {
        const battService = await server.getPrimaryService(V2_UUIDS.BATTERY_SERVICE);
        this.batteryChar = await battService.getCharacteristic(V2_UUIDS.BATTERY_CHAR);
        const battVal = await this.batteryChar.readValue();
        this.battery = battVal.getUint8(0);
      } catch {
        // 电池读取失败不影响正常使用
      }
    }

    // 监听断开事件
    this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

    // 启动通信定时器
    this.startTick();

    const info: DeviceInfo = {
      version: this.version,
      name: device.name ?? 'Unknown',
      battery: this.battery,
    };

    return info;
  }

  /** 断开连接，清理所有状态 */
  disconnect(): void {
    this.stopTick();
    // 停止通知并移除监听器
    try {
      if (this.notifyChar) {
        this.notifyChar.stopNotifications().catch(() => {});
      }
      if (this.strengthChar && this.version === 'v2') {
        this.strengthChar.stopNotifications().catch(() => {});
      }
    } catch {
      // 忽略清理错误
    }
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.resetState();
  }

  /**
   * 设置指定通道的强度
   * 值会被钳制到 [0, limit] 范围内
   */
  setStrength(channel: 'A' | 'B', value: number): void {
    if (channel === 'A') {
      this.strengthA = clamp(Math.round(value), 0, this.limitA);
    } else {
      this.strengthB = clamp(Math.round(value), 0, this.limitB);
    }
    this.onStateChange?.();
  }

  /**
   * 为指定通道设置波形帧序列
   * @param frames 波形帧数组
   * @param waveformId 波形标识，用于 UI 显示
   * @param loop 是否循环播放，默认 true
   */
  setWave(channel: 'A' | 'B', frames: WaveFrame[], waveformId: string, loop = true): void {
    const ch = channel === 'A' ? this.channelA : this.channelB;
    ch.frames = frames.length > 0 ? frames : null;
    ch.index = 0;
    ch.loop = loop;
    ch.active = frames.length > 0;
    ch.waveformId = frames.length > 0 ? waveformId : null;
    this.onStateChange?.();
  }

  /** 停止指定通道的波形播放 */
  stopWave(channel: 'A' | 'B'): void {
    const ch = channel === 'A' ? this.channelA : this.channelB;
    ch.frames = null;
    ch.index = 0;
    ch.active = false;
    ch.waveformId = null;
    this.onStateChange?.();
  }

  /** 紧急停止：双通道强度归零，停止所有波形 */
  stopAll(): void {
    this.strengthA = 0;
    this.strengthB = 0;
    this.channelA = makeChannelState();
    this.channelB = makeChannelState();
    this.onStateChange?.();
  }

  /**
   * 设置通道强度上限
   * 修改后会重发 BF 初始化包通知设备
   */
  setLimit(channel: 'A' | 'B', value: number): void {
    const clamped = clamp(Math.round(value), 0, 200);
    if (channel === 'A') {
      this.limitA = clamped;
      this.strengthA = Math.min(this.strengthA, clamped);
    } else {
      this.limitB = clamped;
      this.strengthB = Math.min(this.strengthB, clamped);
    }
    if (this.version === 'v3') {
      this.sendBFInit();
    }
    this.onStateChange?.();
  }

  /** 获取当前设备状态快照 */
  getState() {
    return {
      connected: this.device?.gatt?.connected ?? false,
      strengthA: this.strengthA,
      strengthB: this.strengthB,
      battery: this.battery,
      waveActiveA: this.channelA.active,
      waveActiveB: this.channelB.active,
      waveIdA: this.channelA.waveformId,
      waveIdB: this.channelB.waveformId,
      actualStrA: this.actualStrA,
      actualStrB: this.actualStrB,
      limitA: this.limitA,
      limitB: this.limitB,
    };
  }

  /** 注册状态变更回调 */
  setOnStateChange(cb: () => void): void {
    this.onStateChange = cb;
  }

  // ----------------------------------------------------------
  // 内部实现
  // ----------------------------------------------------------

  /** 启动 100ms 定时发送循环 */
  private startTick(): void {
    this.stopTick();
    this.tickTimer = window.setInterval(() => {
      if (this.version === 'v3') {
        this.tickV3().catch(console.error);
      } else {
        this.tickV2().catch(console.error);
      }
    }, TICK_INTERVAL_MS);
  }

  /** 停止定时发送循环 */
  private stopTick(): void {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** v3 每个 tick 发送一个 20 字节 B0 包 */
  private async tickV3(): Promise<void> {
    if (!this.writeChar || this.tickInFlight) return;
    this.tickInFlight = true;
    const packet = this.buildV3Packet();
    try {
      await this.writeChar.writeValueWithoutResponse(packet);
    } catch {
      // 写入失败通常表示设备已断开
    } finally {
      this.tickInFlight = false;
    }
  }

  /** v2 每个 tick 分别写入强度和波形数据 */
  private async tickV2(): Promise<void> {
    if (!this.strengthChar || this.tickInFlight) return;
    this.tickInFlight = true;

    try {
      // 写入强度
      const strData = this.encodeV2Strength();
      await this.strengthChar.writeValueWithoutResponse(strData);

      // 写入 A 通道波形
      const frameA = this.advanceFrame(this.channelA);
      if (this.waveAChar) {
        const waveData = this.encodeV2Wave(frameA);
        await this.waveAChar.writeValueWithoutResponse(waveData);
      }

      // 写入 B 通道波形
      const frameB = this.advanceFrame(this.channelB);
      if (this.waveBChar) {
        const waveData = this.encodeV2Wave(frameB);
        await this.waveBChar.writeValueWithoutResponse(waveData);
      }
    } catch {
      // 写入失败通常表示设备已断开
    } finally {
      this.tickInFlight = false;
    }
  }

  /**
   * 推进波形帧指针，返回当前帧
   * 如果通道无活动波形，返回默认静默帧 [0, 0]
   */
  private advanceFrame(ch: ChannelState): [number, number] {
    if (!ch.active || !ch.frames || ch.frames.length === 0) {
      return [0, 0];
    }

    const frame = ch.frames[ch.index];
    ch.index++;

    if (ch.index >= ch.frames.length) {
      if (ch.loop) {
        ch.index = 0;
      } else {
        // 非循环模式播放完毕，停止
        ch.active = false;
        ch.frames = null;
        ch.waveformId = null;
        ch.index = 0;
        this.onStateChange?.();
      }
    }

    return [frame[0], frame[1]];
  }

  /**
   * 构建 v3 协议的 20 字节 B0 数据包
   *
   * 字节布局：
   *   [0]    = 0xB0 包头
   *   [1]    = (seq << 4) | mode
   *   [2]    = strengthA
   *   [3]    = strengthB
   *   [4-7]  = freqA × 4（4 字节，每字节一个编码频率值）
   *   [8-11] = intA × 4（4 字节，每字节一个强度值）
   *   [12-15]= freqB × 4
   *   [16-19]= intB × 4
   *
   * mode 标志位：
   *   0x0C = 绝对模式 A 通道
   *   0x03 = 绝对模式 B 通道
   *   0x0F = 双通道绝对模式
   */
  private buildV3Packet(): Uint8Array {
    const packet = new Uint8Array(20);
    packet[0] = 0xB0;

    // 判断强度是否发生了变化
    const strChanged = this.strengthA !== this.lastSentStrA || this.strengthB !== this.lastSentStrB;

    let seq = 0;
    let mode = 0x00; // 默认不改变强度

    // ACK 超时保护：超过 500ms 未收到 ACK 则重新允许发送
    if (!this.ackAllowed && this.ackSentAt > 0 && Date.now() - this.ackSentAt > 500) {
      this.ackAllowed = true;
      this.pendingSeq = 0;
    }

    if (strChanged && this.ackAllowed) {
      this.seq = this.seq >= 15 ? 1 : this.seq + 1;
      seq = this.seq;
      mode = 0x0F;
      this.ackAllowed = false;
      this.pendingSeq = seq;
      this.ackSentAt = Date.now();
      this.lastSentStrA = this.strengthA;
      this.lastSentStrB = this.strengthB;
    }

    packet[1] = (seq << 4) | mode;
    packet[2] = this.strengthA;
    packet[3] = this.strengthB;

    // 获取当前帧
    const frameA = this.advanceFrame(this.channelA);
    const frameB = this.advanceFrame(this.channelB);

    if (this.channelA.active || frameA[1] > 0) {
      const freq = clamp(frameA[0] & 0xFF, 10, 240);
      const intensity = clamp(frameA[1], 0, 100);
      for (let i = 0; i < 4; i++) {
        packet[4 + i] = freq;
        packet[8 + i] = intensity;
      }
    } else {
      for (let i = 0; i < 4; i++) {
        packet[4 + i] = 0;
      }
      packet[8] = 0;
      packet[9] = 0;
      packet[10] = 0;
      packet[11] = 101;
    }

    if (this.channelB.active || frameB[1] > 0) {
      const freq = clamp(frameB[0] & 0xFF, 10, 240);
      const intensity = clamp(frameB[1], 0, 100);
      for (let i = 0; i < 4; i++) {
        packet[12 + i] = freq;
        packet[16 + i] = intensity;
      }
    } else {
      for (let i = 0; i < 4; i++) {
        packet[12 + i] = 0;
      }
      packet[16] = 0;
      packet[17] = 0;
      packet[18] = 0;
      packet[19] = 101;
    }

    return packet;
  }

  /**
   * v2 强度编码（大端序）
   * 将 strengthA/B 映射到 0-2047 范围后合并为 3 字节
   * combined = (valueA << 11) | valueB → 22 位，高位在前
   */
  private encodeV2Strength(): Uint8Array {
    const valueA = Math.round(this.strengthA * 2047 / 200);
    const valueB = Math.round(this.strengthB * 2047 / 200);
    const combined = (valueA << 11) | valueB;

    return new Uint8Array([
      (combined >> 16) & 0xFF,
      (combined >> 8) & 0xFF,
      combined & 0xFF,
    ]);
  }

  /**
   * v2 波形编码（大端序）
   * X = 脉冲数，Y = 间隔，Z = 脉冲宽度
   * 使用官方公式：X = ((Freq/1000)^0.5) * 15, Y = Freq - X
   * Z = round(intensity * 31 / 100)
   * packed = (Z << 15) | (Y << 5) | X → 高位在前
   */
  private encodeV2Wave(frame: [number, number]): Uint8Array {
    const [encodedFreq, intensity] = frame;
    const freq = clamp(decodeFreq(encodedFreq), 10, 1000);
    const x = clamp(Math.round(Math.pow(freq / 1000, 0.5) * 15), 1, 31);
    const y = clamp(freq - x, 0, 1023);
    const z = Math.round(clamp(intensity, 0, 100) * 31 / 100);
    const packed = (z << 15) | (y << 5) | x;

    return new Uint8Array([
      (packed >> 16) & 0xFF,
      (packed >> 8) & 0xFF,
      packed & 0xFF,
    ]);
  }

  /**
   * 发送 v3 BF 初始化包
   * 设定双通道强度上限和设备参数
   * 格式：[0xBF, limitA, limitB, 160, 160, 0, 0]
   */
  private async sendBFInit(): Promise<void> {
    if (!this.writeChar) return;
    const packet = new Uint8Array(7);
    packet[0] = 0xBF;
    packet[1] = this.limitA;
    packet[2] = this.limitB;
    packet[3] = 160; // 默认最大频率参数
    packet[4] = 160;
    packet[5] = 0;
    packet[6] = 0;
    try {
      await this.writeChar.writeValueWithoutResponse(packet);
    } catch {
      console.error('BF 初始化包发送失败');
    }
  }

  /**
   * 处理 v3 设备的 B1 通知回包
   * 格式：[0xB1, ackSeq, actualStrA, actualStrB]
   * 设备确认接收并返回实际输出强度
   */
  private handleV3Notification(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value || value.byteLength < 4) return;

    const header = value.getUint8(0);
    if (header !== 0xB1) return;

    const ackSeq = value.getUint8(1);
    this.actualStrA = value.getUint8(2);
    this.actualStrB = value.getUint8(3);

    if (ackSeq === this.pendingSeq && this.pendingSeq !== 0) {
      this.ackAllowed = true;
      this.pendingSeq = 0;
    }

    this.onStateChange?.();
  }

  /** 处理 v2 设备的强度通知（物理拨轮等） */
  private handleV2StrengthNotification(event: Event): void {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value || value.byteLength < 3) return;

    const combined = (value.getUint8(0) << 16) | (value.getUint8(1) << 8) | value.getUint8(2);
    const rawA = (combined >> 11) & 0x7FF;
    const rawB = combined & 0x7FF;
    this.actualStrA = Math.round(rawA * 200 / 2047);
    this.actualStrB = Math.round(rawB * 200 / 2047);
    this.onStateChange?.();
  }

  /** 设备断开事件处理 */
  private handleDisconnect(): void {
    this.stopTick();
    this.resetState();
    this.onStateChange?.();
  }

  /** 重置所有内部状态 */
  private resetState(): void {
    this.device = null;
    this.writeChar = null;
    this.notifyChar = null;
    this.strengthChar = null;
    this.waveAChar = null;
    this.waveBChar = null;
    this.batteryChar = null;
    this.seq = 0;
    this.strengthA = 0;
    this.strengthB = 0;
    this.lastSentStrA = 0;
    this.lastSentStrB = 0;
    this.battery = 0;
    this.actualStrA = 0;
    this.actualStrB = 0;
    this.ackAllowed = true;
    this.pendingSeq = 0;
    this.ackSentAt = 0;
    this.tickInFlight = false;
    this.channelA = makeChannelState();
    this.channelB = makeChannelState();
  }
}
