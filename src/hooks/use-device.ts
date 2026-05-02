import { useState, useCallback, useRef, useEffect } from 'react';
import { DGLabDevice, type WaveFrame, type DeviceInfo } from '../lib/bluetooth';

/**
 * DG-Lab 设备控制 Hook
 * 封装 DGLabDevice 类，提供 React 状态同步
 */
export function useDevice() {
  const [connected, setConnected] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [strengthA, setStrengthA] = useState(0);
  const [strengthB, setStrengthB] = useState(0);
  const [battery, setBattery] = useState<number | null>(null);
  const [waveActiveA, setWaveActiveA] = useState(false);
  const [waveActiveB, setWaveActiveB] = useState(false);
  const [waveIdA, setWaveIdA] = useState<string | null>(null);
  const [waveIdB, setWaveIdB] = useState<string | null>(null);
  const [limitA, setLimitA] = useState(50);
  const [limitB, setLimitB] = useState(50);
  const [backgroundBehavior, setBackgroundBehaviorState] = useState<'stop' | 'keep'>(
    () => (localStorage.getItem('dg-bg-behavior') as 'stop' | 'keep') ?? 'stop'
  );
  const [firePolicy, setFirePolicyState] = useState<'sum' | 'max' | 'avg'>(
    () => (localStorage.getItem('dg-fire-policy') as 'sum' | 'max' | 'avg' | null) ?? 'max'
  );
  const firePolicyRef = useRef(firePolicy);
  firePolicyRef.current = firePolicy;
  const deviceRef = useRef<DGLabDevice | null>(null);
  const bgBehaviorRef = useRef(backgroundBehavior);
  bgBehaviorRef.current = backgroundBehavior;

  /** 从设备实例同步状态到 React state */
  const syncState = useCallback(() => {
    const dev = deviceRef.current;
    if (!dev) return;
    const s = dev.getState();
    setConnected(s.connected);
    setStrengthA(s.strengthA);
    setStrengthB(s.strengthB);
    setBattery(s.battery);
    setWaveActiveA(s.waveActiveA);
    setWaveActiveB(s.waveActiveB);
    setWaveIdA(s.waveIdA);
    setWaveIdB(s.waveIdB);
    setLimitA(s.limitA);
    setLimitB(s.limitB);
  }, []);

  /** 扫描并连接设备 */
  const connect = useCallback(async () => {
    const dev = new DGLabDevice();
    dev.setOnStateChange(syncState);
    const info = await dev.connect();
    deviceRef.current = dev;
    setDeviceInfo(info);
    syncState();
  }, [syncState]);

  /** 断开设备连接，重置所有状态 */
  const disconnect = useCallback(() => {
    deviceRef.current?.disconnect();
    deviceRef.current = null;
    setConnected(false);
    setDeviceInfo(null);
    setBattery(null);
    setStrengthA(0);
    setStrengthB(0);
    setWaveActiveA(false);
    setWaveActiveB(false);
    setWaveIdA(null);
    setWaveIdB(null);
    setLimitA(50);
    setLimitB(50);
  }, []);

  /** 设置指定通道强度 */
  const setStrength = useCallback((channel: 'A' | 'B', value: number) => {
    deviceRef.current?.setStrength(channel, value);
  }, []);

  /** 设置指定通道波形 */
  const setWave = useCallback(
    (channel: 'A' | 'B', frames: WaveFrame[], waveformId: string, loop?: boolean) => {
      deviceRef.current?.setWave(channel, frames, waveformId, loop);
    },
    [],
  );

  /** 停止指定通道波形 */
  const stopWave = useCallback((channel: 'A' | 'B') => {
    deviceRef.current?.stopWave(channel);
  }, []);

  /** 设置通道强度上限 */
  const setLimit = useCallback((channel: 'A' | 'B', value: number) => {
    deviceRef.current?.setLimit(channel, value);
  }, []);

  /** 紧急停止：双通道归零 */
  const stopAll = useCallback(() => {
    deviceRef.current?.stopAll();
  }, []);

  /** 设置后台行为 */
  const setBackgroundBehavior = useCallback((mode: 'stop' | 'keep') => {
    setBackgroundBehaviorState(mode);
    localStorage.setItem('dg-bg-behavior', mode);
  }, []);

  /** 设置多人开火聚合策略 */
  const setFirePolicy = useCallback((p: 'sum' | 'max' | 'avg') => {
    setFirePolicyState(p);
    localStorage.setItem('dg-fire-policy', p);
  }, []);

  // 后台行为：切换至后台时按设置停止输出
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden' && bgBehaviorRef.current === 'stop') {
        deviceRef.current?.stopAll();
        syncState();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [syncState]);

  return {
    connected,
    deviceInfo,
    strengthA,
    strengthB,
    battery,
    waveActiveA,
    waveActiveB,
    waveIdA,
    waveIdB,
    connect,
    disconnect,
    setStrength,
    setWave,
    stopWave,
    stopAll,
    limitA,
    limitB,
    setLimit,
    backgroundBehavior,
    setBackgroundBehavior,
    firePolicy,
    firePolicyRef,
    setFirePolicy,
  };
}
