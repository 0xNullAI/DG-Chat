import type { DeviceCommand } from './protocol';
import type { DGLabDevice } from './bluetooth';
import type { WaveformDefinition } from './waveforms';

// AudioContext 单例（iOS Safari 需要用户手势后才能创建）
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export interface CommandContext {
  device: DGLabDevice | null;
  getWaveform?: (id: string) => WaveformDefinition | undefined;
}

export function executeCommand(cmd: DeviceCommand, ctx?: CommandContext): string {
  switch (cmd.action) {
    case 'vibrate':
      if (navigator.vibrate) {
        navigator.vibrate(500);
        return '已振动';
      }
      return '当前设备不支持振动';

    case 'alert':
      window.alert(cmd.data ?? '');
      return '已弹窗';

    case 'bg':
      if (cmd.data) {
        document.body.style.backgroundColor = cmd.data;
        return `背景已改为 ${cmd.data}`;
      }
      return '缺少颜色参数';

    case 'shake':
      document.body.classList.add('shake-anim');
      setTimeout(() => document.body.classList.remove('shake-anim'), 600);
      return '已抖动';

    case 'beep': {
      try {
        const ctx2 = getAudioContext();
        const osc = ctx2.createOscillator();
        const gain = ctx2.createGain();
        osc.frequency.value = 440;
        gain.gain.value = 0.3;
        osc.connect(gain);
        gain.connect(ctx2.destination);
        osc.start();
        osc.stop(ctx2.currentTime + 0.2);
        return '已蜂鸣';
      } catch {
        return '无法播放蜂鸣';
      }
    }

    case 'adjust_strength': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      try {
        const { channel, value } = JSON.parse(cmd.data!) as { channel: 'A' | 'B'; value: number };
        dev.setStrength(channel, value);
        return `${channel} 通道强度已调整为 ${value}`;
      } catch {
        return '强度参数解析失败';
      }
    }

    case 'change_wave': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      try {
        const { channel, waveId } = JSON.parse(cmd.data!) as { channel: 'A' | 'B'; waveId: string };
        const waveform = ctx?.getWaveform?.(waveId);
        if (!waveform) return `波形 ${waveId} 未找到`;
        dev.setWave(channel, waveform.frames, waveform.id, true);
        return `${channel} 通道波形已切换为 ${waveform.name}`;
      } catch {
        return '波形参数解析失败';
      }
    }

    case 'start': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      try {
        const { channel, waveId } = JSON.parse(cmd.data!) as { channel: 'A' | 'B'; waveId: string };
        const waveform = ctx?.getWaveform?.(waveId);
        if (!waveform) return `波形 ${waveId} 未找到`;
        dev.setWave(channel, waveform.frames, waveform.id, true);
        return `${channel} 通道已启动 ${waveform.name}`;
      } catch {
        return '启动参数解析失败';
      }
    }

    case 'stop': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      dev.stopAll();
      return '已停止所有输出';
    }

    case 'stop_wave': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      try {
        const { channel } = JSON.parse(cmd.data!) as { channel: 'A' | 'B' };
        dev.stopWave(channel);
        return `${channel} 通道已暂停`;
      } catch {
        return '参数解析失败';
      }
    }

    case 'fire': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      try {
        const { channel, targetStrength } = JSON.parse(cmd.data!) as { channel: 'A' | 'B'; targetStrength: number };
        dev.setStrength(channel, targetStrength);
        return `${channel} 开火 强度${targetStrength}`;
      } catch {
        return '开火参数解析失败';
      }
    }

    case 'fire_stop': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      try {
        const { channel, restoreStrength } = JSON.parse(cmd.data!) as { channel: 'A' | 'B'; restoreStrength: number };
        dev.setStrength(channel, restoreStrength);
        return `${channel} 开火停止`;
      } catch {
        return '参数解析失败';
      }
    }

    case 'burst': {
      const dev = ctx?.device;
      if (!dev) return '未连接蓝牙设备';
      return '脉冲已发送';
    }

    default:
      return `未知指令: ${cmd.action}`;
  }
}
