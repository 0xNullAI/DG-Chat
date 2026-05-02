import type { DeviceCommand } from './protocol';
import type { DGLabDevice } from './bluetooth';
import type { WaveformDefinition } from './waveforms';

let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

export interface CommandContext {
  device: DGLabDevice | null;
  getWaveform?: (id: string) => WaveformDefinition | undefined;
}

export function executeCommand(cmd: DeviceCommand, ctx?: CommandContext): string {
  const dev = ctx?.device;
  switch (cmd.action) {
    case 'vibrate':
      if (navigator.vibrate) { navigator.vibrate(500); return '已振动'; }
      return '当前设备不支持振动';

    case 'alert':
      window.alert(cmd.d ?? '');
      return '已弹窗';

    case 'bg':
      if (cmd.d) { document.body.style.backgroundColor = cmd.d; return `背景已改为 ${cmd.d}`; }
      return '缺少颜色参数';

    case 'shake':
      document.body.classList.add('shake-anim');
      setTimeout(() => document.body.classList.remove('shake-anim'), 600);
      return '已抖动';

    case 'beep': {
      try {
        const a = getAudioContext();
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.frequency.value = 440;
        gain.gain.value = 0.3;
        osc.connect(gain);
        gain.connect(a.destination);
        osc.start();
        osc.stop(a.currentTime + 0.2);
        return '已蜂鸣';
      } catch { return '无法播放蜂鸣'; }
    }

    case 'adjust_strength': {
      if (!dev) return '未连接蓝牙设备';
      if (!cmd.c || cmd.v == null) return '强度参数缺失';
      dev.setStrength(cmd.c, cmd.v);
      return `${cmd.c} 通道强度已调整为 ${cmd.v}`;
    }

    case 'change_wave':
    case 'start': {
      if (!dev) return '未连接蓝牙设备';
      if (!cmd.c || !cmd.w) return '波形参数缺失';
      const wf = ctx?.getWaveform?.(cmd.w);
      if (!wf) return `波形 ${cmd.w} 未找到`;
      dev.setWave(cmd.c, wf.frames, wf.id, true);
      return `${cmd.c} 通道${cmd.action === 'start' ? '已启动' : '波形已切换为'} ${wf.name}`;
    }

    case 'stop':
      if (!dev) return '未连接蓝牙设备';
      dev.stopAll();
      return '已停止所有输出';

    case 'stop_wave':
      if (!dev) return '未连接蓝牙设备';
      if (!cmd.c) return '通道参数缺失';
      dev.stopWave(cmd.c);
      return `${cmd.c} 通道已暂停`;

    case 'fire':
      if (!dev) return '未连接蓝牙设备';
      if (!cmd.c || cmd.v == null) return '开火参数缺失';
      dev.setStrength(cmd.c, cmd.v);
      return `${cmd.c} 开火 强度${cmd.v}`;

    case 'fire_stop':
      if (!dev) return '未连接蓝牙设备';
      if (!cmd.c || cmd.v == null) return '参数缺失';
      dev.setStrength(cmd.c, cmd.v);
      return `${cmd.c} 开火停止`;

    case 'burst':
      if (!dev) return '未连接蓝牙设备';
      return '脉冲已发送';

    case 'set_queue':
    case 'set_play_mode':
    case 'set_interval':
      // 由 App.tsx 拦截：这些命令更新本机权威队列状态，由 broadcastStateSlow 同步给所有人。
      return '';

    case 'fire_press':
    case 'fire_release':
      // 由 App.tsx 拦截：进聚合系统，由 owner 端权威 setStrength。
      return '';

    default:
      return `未知指令: ${(cmd as DeviceCommand).action}`;
  }
}
