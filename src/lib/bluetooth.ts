/**
 * DGLabDevice — DG-Chat's BLE controller, now backed by @dg-kit.
 *
 * Wraps `@dg-kit/transport-webbluetooth`'s `WebBluetoothDeviceClient` plus
 * `@dg-kit/protocol`'s `CoyoteProtocolAdapter`. The public API is preserved
 * so `use-device.ts` and `commands.ts` don't need to change.
 */

import {
  CoyoteProtocolAdapter,
  V2_DEVICE_NAME_PREFIX,
  PawPrintsSensorAdapter,
  CivetPressureSensorAdapter,
  OpossumVibrateAdapter,
  createEmptyOpossumState,
  detectDeviceKind,
  DG_LAB_REQUEST_DEVICE_OPTIONS,
  type WebBluetoothProtocolAdapter,
  type NavigatorBluetoothLike,
  type BluetoothDeviceLike,
  type BluetoothRemoteGATTServerLike,
  type PawPrintsReading,
  type CivetPressureReading,
  type OpossumState,
  type OpossumButtonEvent,
} from '@dg-kit/protocol';
import { WebBluetoothDeviceClient, getWebBluetoothAvailability } from '@dg-kit/transport-webbluetooth';
import type {
  DeviceClient,
  DeviceState as KitDeviceState,
  WaveFrame as KitWaveFrame,
  SensorState,
  DeviceKind,
} from '@dg-kit/core';

/**
 * Optional override hook for non-browser runtimes (Tauri Android shell).
 * The default behaviour creates a `WebBluetoothDeviceClient`. The Tauri
 * shell passes a factory that creates a `TauriBlecDeviceClient` instead.
 */
export type DeviceClientFactory = (protocol: WebBluetoothProtocolAdapter) => DeviceClient;

export type DeviceVersion = 'v2' | 'v3';

export interface DeviceInfo {
  version: DeviceVersion;
  name: string;
  battery: number;
}

export type WaveFrame = KitWaveFrame;

const DEFAULT_LIMIT = 50;

/** Current waveform definition kept locally so we can re-trigger plays. */
interface ChannelLocalState {
  waveformId: string | null;
  frames: WaveFrame[] | null;
  loop: boolean;
}

export class DGLabDevice {
  private readonly protocol = new CoyoteProtocolAdapter();
  private readonly client: DeviceClient;
  private onStateChange: (() => void) | null = null;

  private version: DeviceVersion = 'v3';
  private deviceName = '';
  private channelA: ChannelLocalState = { waveformId: null, frames: null, loop: true };
  private channelB: ChannelLocalState = { waveformId: null, frames: null, loop: true };

  /**
   * @param clientFactory optional factory invoked with the protocol adapter
   *   to create the transport-specific `DeviceClient`. Defaults to
   *   `WebBluetoothDeviceClient` for browser. The Tauri Android shell
   *   passes a factory that builds a `TauriBlecDeviceClient`.
   */
  constructor(clientFactory?: DeviceClientFactory) {
    this.client = clientFactory
      ? clientFactory(this.protocol)
      : new WebBluetoothDeviceClient({ protocol: this.protocol });
    this.protocol.subscribe(() => {
      this.onStateChange?.();
    });
  }

  /** Scan + connect; auto-detect V2/V3 by name prefix; default per-channel limit 50. */
  async connect(): Promise<DeviceInfo> {
    await this.client.connect();
    const state = await this.client.getState();
    this.deviceName = state.deviceName ?? '';
    this.version = this.deviceName.startsWith(V2_DEVICE_NAME_PREFIX) ? 'v2' : 'v3';

    // DG-Chat ships with a per-channel safety cap of 50 (0~200 protocol range).
    await this.protocol.setLimits(DEFAULT_LIMIT, DEFAULT_LIMIT);

    return {
      version: this.version,
      name: this.deviceName,
      battery: state.battery ?? 0,
    };
  }

  disconnect(): void {
    this.channelA = { waveformId: null, frames: null, loop: true };
    this.channelB = { waveformId: null, frames: null, loop: true };
    void this.client.disconnect();
  }

  /**
   * Set the absolute strength of a channel.
   *
   * NOTE: @dg-kit's `execute()` only exposes relative `adjustStrength`. For
   * the slider UX we want absolute. We translate target → delta off the
   * latest acked state. During rapid drags the V3 ack-gating means
   * intermediate values may be coalesced, but the final position always
   * wins (the slider settles at the user's release point).
   */
  setStrength(channel: 'A' | 'B', value: number): void {
    const state = this.protocol.getState();
    const limit = channel === 'A' ? state.limitA : state.limitB;
    const target = clamp(Math.round(value), 0, limit);
    const current = channel === 'A' ? state.strengthA : state.strengthB;
    const delta = target - current;
    if (delta === 0) return;
    void this.client
      .execute({ type: 'adjustStrength', channel, delta })
      .catch(() => undefined);
  }

  setWave(channel: 'A' | 'B', frames: WaveFrame[], waveformId: string, loop = true): void {
    const local = channel === 'A' ? this.channelA : this.channelB;
    if (frames.length === 0) {
      local.waveformId = null;
      local.frames = null;
      local.loop = loop;
      void this.client.execute({ type: 'stop', channel }).catch(() => undefined);
      return;
    }

    local.waveformId = waveformId;
    local.frames = frames.map((f) => [f[0], f[1]] as WaveFrame);
    local.loop = loop;

    void this.client
      .execute({
        type: 'changeWave',
        channel,
        waveform: {
          id: waveformId,
          name: waveformId,
          frames: local.frames,
        },
        loop,
      })
      .catch(() => undefined);
  }

  stopWave(channel: 'A' | 'B'): void {
    const local = channel === 'A' ? this.channelA : this.channelB;
    local.waveformId = null;
    local.frames = null;
    void this.client.execute({ type: 'stop', channel }).catch(() => undefined);
  }

  /** Emergency stop: zero both channels, kill all waves. */
  stopAll(): void {
    this.channelA = { waveformId: null, frames: null, loop: true };
    this.channelB = { waveformId: null, frames: null, loop: true };
    void this.client.emergencyStop().catch(() => undefined);
  }

  /** Update one channel's strength soft-limit (the other channel is preserved). */
  setLimit(channel: 'A' | 'B', value: number): void {
    const state = this.protocol.getState();
    const next = clamp(Math.round(value), 0, 200);
    const limitA = channel === 'A' ? next : state.limitA;
    const limitB = channel === 'B' ? next : state.limitB;
    void this.protocol.setLimits(limitA, limitB).catch(() => undefined);
  }

  getState(): {
    connected: boolean;
    strengthA: number;
    strengthB: number;
    battery: number;
    waveActiveA: boolean;
    waveActiveB: boolean;
    waveIdA: string | null;
    waveIdB: string | null;
    actualStrA: number;
    actualStrB: number;
    limitA: number;
    limitB: number;
  } {
    const s: KitDeviceState = this.protocol.getState();
    return {
      connected: s.connected,
      strengthA: s.strengthA,
      strengthB: s.strengthB,
      battery: s.battery ?? 0,
      waveActiveA: s.waveActiveA,
      waveActiveB: s.waveActiveB,
      waveIdA: s.currentWaveA ?? null,
      waveIdB: s.currentWaveB ?? null,
      // @dg-kit doesn't track ack-state separately; expose the current
      // strength as both the user-set and device-actual values.
      actualStrA: s.strengthA,
      actualStrB: s.strengthB,
      limitA: s.limitA,
      limitB: s.limitB,
    };
  }

  setOnStateChange(cb: () => void): void {
    this.onStateChange = cb;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Multi-device session (Coyote + optional sensor + optional Opossum)
// ---------------------------------------------------------------------------

export type SensorKind = Extract<DeviceKind, 'paw-prints' | 'civet-edging'>;

export interface SensorSummary {
  kind: SensorKind;
  connected: boolean;
  deviceName: string;
  battery: number | null;
  /** Human-readable summary of the most recent reading. Informational only. */
  lastEvent: string | null;
  /** Raw numeric value of the last reading, when the reading type has one
   *  (civet-edging pressure in kPa; paw-prints trigger parameterValue). */
  lastValue: number | null;
  lastEventAt: number | null;
}

export interface OpossumSummary {
  connected: boolean;
  deviceName: string;
  battery: number | null;
  intensityA: number;
  intensityB: number;
  /** Names of buttons currently reported pressed, joined with '+', or null. */
  lastButtons: string | null;
  lastButtonsAt: number | null;
}

/** Turn a raw paw-prints notification into a short human-readable summary + optional numeric value. */
function describePawPrintsReading(reading: PawPrintsReading): { text: string; value: number | null } | null {
  switch (reading.type) {
    case 'trigger':
      return { text: `触发事件 #${reading.eventId}（参数 ${reading.parameterValue}）`, value: reading.parameterValue };
    case 'triggerCancel':
      return { text: `事件 #${reading.eventId} 已取消`, value: null };
    case 'parameterChange':
      return { text: `参数 #${reading.eventId} 变更为 ${reading.value}`, value: reading.value };
    case 'physical':
      return { text: reading.pressState ? '物理按键：按下' : '物理按键：松开', value: null };
    case 'autoDetectResult':
      return { text: '姿态自检完成', value: null };
    case 'status':
      // Passive status ping, not a user-facing event.
      return null;
    default:
      return null;
  }
}

function describeCivetReading(reading: CivetPressureReading): { text: string; value: number | null } {
  return { text: `压力 ${reading.kPa.toFixed(1)} kPa`, value: reading.kPa };
}

/**
 * DeviceSession — manages a member's full BLE device set: exactly one Coyote
 * (unchanged, via `DGLabDevice`/`clientFactory`) plus at most one sensor
 * (paw-prints OR civet-edging — never both at once) plus at most one Opossum
 * vibration controller.
 *
 * v1 scope, deliberately simplified: no multi-Coyote, no two sensors at
 * once even of different kinds. Connecting a new sensor replaces whichever
 * sensor was previously connected. This mirrors the brief's "one of each
 * kind is a reasonable v1 scope."
 *
 * The Coyote path is untouched and continues to go through `clientFactory`
 * (works on both the web build and the Tauri Android shell). The
 * sensor/Opossum path below talks to `navigator.bluetooth` directly — Web
 * Bluetooth only. Android's WebView has no Web Bluetooth (see
 * apps/tauri-android/README.md), so `addDevice()` fails fast there with a
 * clear "unsupported environment" error rather than silently doing nothing.
 * Extending sensor/Opossum support to Tauri would require a
 * `@dg-kit/transport-tauri-blec` client shaped for
 * `WebBluetoothSensorAdapter`/`OpossumVibrateAdapter` — today's
 * `TauriBlecDeviceClient` only wraps the Coyote-shaped
 * `WebBluetoothProtocolAdapter`. Out of scope for this pass.
 */
export class DeviceSession {
  readonly coyote: DGLabDevice;

  private sensorAdapter: PawPrintsSensorAdapter | CivetPressureSensorAdapter | null = null;
  private sensorKind: SensorKind | null = null;
  private sensorDevice: BluetoothDeviceLike | null = null;
  private sensorState: SensorState = { connected: false };
  private sensorLastEvent: string | null = null;
  private sensorLastValue: number | null = null;
  private sensorLastEventAt: number | null = null;
  private unsubscribeSensorReading: (() => void) | null = null;
  private unsubscribeSensorState: (() => void) | null = null;

  private opossumAdapter: OpossumVibrateAdapter | null = null;
  private opossumDevice: BluetoothDeviceLike | null = null;
  private opossumState: OpossumState = createEmptyOpossumState();
  private opossumLastButtons: string | null = null;
  private opossumLastButtonsAt: number | null = null;
  private unsubscribeOpossumButtons: (() => void) | null = null;
  private unsubscribeOpossumState: (() => void) | null = null;

  private onStateChange: (() => void) | null = null;

  constructor(clientFactory?: DeviceClientFactory) {
    this.coyote = new DGLabDevice(clientFactory);
    this.coyote.setOnStateChange(() => this.emit());
  }

  setOnStateChange(cb: () => void): void {
    this.onStateChange = cb;
  }

  private emit(): void {
    this.onStateChange?.();
  }

  /** Existing single-Coyote connect flow — behavior unchanged. */
  async connectCoyote(): Promise<DeviceInfo> {
    return this.coyote.connect();
  }

  /**
   * "Add device" — opens the browser Bluetooth chooser scoped to every
   * known 47L12x-family device kind, detects which kind was picked via
   * `detectDeviceKind()`, and routes it to the right adapter slot.
   *
   * Web Bluetooth only (see class doc). The device kind is identified from
   * `device.name` alone (via `detectDeviceKind()`), before any GATT
   * connection is opened, so a Coyote pick is rejected immediately without
   * ever calling `gatt.connect()`. It's rejected rather than routed to
   * `this.coyote` because `DGLabDevice` owns its own `DeviceClient`/
   * reconnect lifecycle built around a `bluetooth.requestDevice()` call it
   * makes itself — there's no clean way to hand this method's already-
   * chosen `BluetoothDevice` into that separate lifecycle. Users connect
   * Coyote via the primary "连接" button instead.
   */
  async addDevice(): Promise<{ kind: DeviceKind; name: string }> {
    const availability = getWebBluetoothAvailability();
    if (!availability.supported) {
      throw new Error(availability.reason ?? '当前环境不支持 Web Bluetooth');
    }

    const nav = navigator as unknown as NavigatorBluetoothLike;
    const bluetooth = nav.bluetooth;
    if (!bluetooth) {
      throw new Error('当前环境不支持 Web Bluetooth');
    }

    const device = await bluetooth.requestDevice(DG_LAB_REQUEST_DEVICE_OPTIONS);
    const kind = detectDeviceKind(device.name);

    if (kind === 'unknown') {
      throw new Error('未识别的设备，请确认选择了正确的 DG-Lab 设备');
    }
    if (kind === 'coyote') {
      throw new Error('Coyote 主机请使用上方"连接"按钮');
    }

    const gatt = device.gatt;
    if (!gatt) {
      throw new Error('所选蓝牙设备不支持 GATT');
    }
    const server = await gatt.connect();

    try {
      if (kind === 'paw-prints' || kind === 'civet-edging') {
        await this.attachSensor(kind, device, server);
      } else {
        await this.attachOpossum(device, server);
      }
    } catch (error) {
      if (gatt.connected) gatt.disconnect();
      throw error;
    }

    return { kind, name: device.name ?? '' };
  }

  private async attachSensor(
    kind: SensorKind,
    device: BluetoothDeviceLike,
    server: BluetoothRemoteGATTServerLike,
  ): Promise<void> {
    // v1: one sensor at a time — tear down whatever was there before.
    this.disconnectSensor();

    const adapter: PawPrintsSensorAdapter | CivetPressureSensorAdapter =
      kind === 'paw-prints' ? new PawPrintsSensorAdapter() : new CivetPressureSensorAdapter();
    await adapter.onConnected({ device, server });

    this.sensorKind = kind;
    this.sensorAdapter = adapter;
    this.sensorDevice = device;
    this.sensorState = adapter.getState();
    device.addEventListener('gattserverdisconnected', this.handleSensorGattDisconnected);

    this.unsubscribeSensorState = adapter.onStateChanged((state) => {
      this.sensorState = state;
      this.emit();
    });
    this.unsubscribeSensorReading = adapter.subscribe((reading: PawPrintsReading | CivetPressureReading) => {
      const described =
        kind === 'paw-prints'
          ? describePawPrintsReading(reading as PawPrintsReading)
          : describeCivetReading(reading as CivetPressureReading);
      if (!described) return;
      this.sensorLastEvent = described.text;
      this.sensorLastValue = described.value;
      this.sensorLastEventAt = Date.now();
      this.emit();

      // TODO(cross-device consent): a sensor event like this is exactly the
      // kind of signal a user might eventually want to wire into "my
      // button press nudges someone else's device" — but doing that
      // automatically, without the *receiving* member explicitly opting
      // in, would let one person's sensor silently drive another person's
      // hardware. That needs its own consent/permission UI (mirroring the
      // existing `allowAi` opt-in toggle for AI control) before it can be
      // built safely. Until that exists, sensor events stay strictly
      // informational: surfaced in the room UI via MemberState.sensorLastEvent,
      // never used here to construct/send a DeviceCommand automatically.
    });

    this.emit();
  }

  private readonly handleSensorGattDisconnected = (): void => {
    this.disconnectSensor();
  };

  disconnectSensor(): void {
    if (this.sensorDevice) {
      this.sensorDevice.removeEventListener('gattserverdisconnected', this.handleSensorGattDisconnected);
      const gatt = this.sensorDevice.gatt;
      if (gatt?.connected) gatt.disconnect();
    }
    this.unsubscribeSensorReading?.();
    this.unsubscribeSensorReading = null;
    this.unsubscribeSensorState?.();
    this.unsubscribeSensorState = null;
    void this.sensorAdapter?.onDisconnected();
    this.sensorAdapter = null;
    this.sensorKind = null;
    this.sensorDevice = null;
    this.sensorState = { connected: false };
    this.sensorLastEvent = null;
    this.sensorLastValue = null;
    this.sensorLastEventAt = null;
    this.emit();
  }

  private async attachOpossum(device: BluetoothDeviceLike, server: BluetoothRemoteGATTServerLike): Promise<void> {
    this.disconnectOpossum();

    const adapter = new OpossumVibrateAdapter();
    await adapter.onConnected({ device, server });

    this.opossumAdapter = adapter;
    this.opossumDevice = device;
    this.opossumState = adapter.getState();
    device.addEventListener('gattserverdisconnected', this.handleOpossumGattDisconnected);

    this.unsubscribeOpossumState = adapter.onStateChanged((state) => {
      this.opossumState = state;
      this.emit();
    });
    this.unsubscribeOpossumButtons = adapter.subscribeButtons((event: OpossumButtonEvent) => {
      this.opossumLastButtons = event.pressed.size > 0 ? [...event.pressed].join('+') : null;
      this.opossumLastButtonsAt = Date.now();
      this.emit();
      // TODO(cross-device consent): see the identical note in
      // attachSensor() above — Opossum button presses are informational
      // only, for the same reason (no receiving-side consent UI yet).
    });

    this.emit();
  }

  private readonly handleOpossumGattDisconnected = (): void => {
    this.disconnectOpossum();
  };

  disconnectOpossum(): void {
    if (this.opossumDevice) {
      this.opossumDevice.removeEventListener('gattserverdisconnected', this.handleOpossumGattDisconnected);
      const gatt = this.opossumDevice.gatt;
      if (gatt?.connected) gatt.disconnect();
    }
    this.unsubscribeOpossumButtons?.();
    this.unsubscribeOpossumButtons = null;
    this.unsubscribeOpossumState?.();
    this.unsubscribeOpossumState = null;
    void this.opossumAdapter?.onDisconnected();
    this.opossumAdapter = null;
    this.opossumDevice = null;
    this.opossumState = createEmptyOpossumState();
    this.opossumLastButtons = null;
    this.opossumLastButtonsAt = null;
    this.emit();
  }

  /** Absolute set, clamped to [0, limit] — mirrors `DGLabDevice.setStrength`. */
  setOpossumIntensity(channel: 'A' | 'B', value: number, limit: number): void {
    if (!this.opossumAdapter) return;
    const target = clamp(Math.round(value), 0, limit);
    void this.opossumAdapter
      .setIntensity(channel === 'A' ? target : 'unchanged', channel === 'B' ? target : 'unchanged')
      .catch(() => undefined);
  }

  /** Fire-and-restore burst convenience, mirroring Coyote's `burst` command. */
  opossumBurst(channel: 'A' | 'B', strength: number, durationMs: number, limit: number): void {
    if (!this.opossumAdapter) return;
    const previous = channel === 'A' ? this.opossumState.intensityA : this.opossumState.intensityB;
    this.setOpossumIntensity(channel, strength, limit);
    setTimeout(() => {
      this.setOpossumIntensity(channel, Math.min(previous, limit), limit);
    }, Math.max(100, durationMs));
  }

  /** Stop one or both Opossum channels immediately (no restore). */
  opossumStop(channel?: 'A' | 'B'): void {
    if (!this.opossumAdapter) return;
    if (!channel) {
      void this.opossumAdapter.emergencyStop();
      return;
    }
    void this.opossumAdapter
      .setIntensity(channel === 'A' ? 0 : 'unchanged', channel === 'B' ? 0 : 'unchanged')
      .catch(() => undefined);
  }

  /** LED color byte (0-255) for the sensor or Opossum slot, whichever is connected. */
  setLedColor(target: 'sensor' | 'opossum', color: number): void {
    const byte = clamp(Math.round(color), 0, 255);
    if (target === 'sensor') {
      if (this.sensorAdapter instanceof PawPrintsSensorAdapter) {
        void this.sensorAdapter.setLedSolid(byte).catch(() => undefined);
      } else if (this.sensorAdapter instanceof CivetPressureSensorAdapter) {
        // civet-edging has no dedicated LED-only command; color rides along
        // with the pressure-reporting toggle packet, so re-issuing "start"
        // with the new color updates it in place without interrupting the
        // pressure stream.
        void this.sensorAdapter.startPressureReporting(byte).catch(() => undefined);
      }
    } else if (this.opossumAdapter) {
      void this.opossumAdapter.setLed(byte, true).catch(() => undefined);
    }
  }

  /** Emergency stop across every connected device (Coyote + Opossum). Sensors have no output to zero. */
  stopAllOutputs(): void {
    this.coyote.stopAll();
    this.opossumStop();
  }

  /** Tear down the whole session — used when disconnecting or leaving the room. */
  disconnectAll(): void {
    this.coyote.disconnect();
    this.disconnectSensor();
    this.disconnectOpossum();
  }

  getSensorSummary(): SensorSummary | null {
    if (!this.sensorKind) return null;
    return {
      kind: this.sensorKind,
      connected: this.sensorState.connected,
      deviceName: this.sensorState.deviceName ?? '',
      battery: this.sensorState.battery ?? null,
      lastEvent: this.sensorLastEvent,
      lastValue: this.sensorLastValue,
      lastEventAt: this.sensorLastEventAt,
    };
  }

  getOpossumSummary(): OpossumSummary | null {
    if (!this.opossumAdapter) return null;
    return {
      connected: this.opossumState.connected,
      deviceName: this.opossumState.deviceName ?? '',
      battery: this.opossumState.battery ?? null,
      intensityA: this.opossumState.intensityA,
      intensityB: this.opossumState.intensityB,
      lastButtons: this.opossumLastButtons,
      lastButtonsAt: this.opossumLastButtonsAt,
    };
  }
}
