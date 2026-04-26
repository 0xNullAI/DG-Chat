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
} from '@dg-kit/protocol';
import { WebBluetoothDeviceClient } from '@dg-kit/transport-webbluetooth';
import type { DeviceState as KitDeviceState, WaveFrame as KitWaveFrame } from '@dg-kit/core';

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
  private readonly client: WebBluetoothDeviceClient;
  private onStateChange: (() => void) | null = null;

  private version: DeviceVersion = 'v3';
  private deviceName = '';
  private channelA: ChannelLocalState = { waveformId: null, frames: null, loop: true };
  private channelB: ChannelLocalState = { waveformId: null, frames: null, loop: true };

  constructor() {
    this.client = new WebBluetoothDeviceClient({ protocol: this.protocol });
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
