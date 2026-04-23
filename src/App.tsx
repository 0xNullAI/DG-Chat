import { useState, useEffect, useCallback, useRef } from 'react';
import { usePeerRoom } from './hooks/use-peer-room';
import { useDevice } from './hooks/use-device';
import { useWaveforms } from './hooks/use-waveforms';
import { executeCommand, type CommandContext } from './lib/commands';
import { RoomEntry } from './components/RoomEntry';
import { SafetyNotice, useSafetyAccepted } from './components/SafetyNotice';
import { ChatPanel } from './components/ChatPanel';
import { ControlPanel } from './components/ControlPanel';
import { Bluetooth, BluetoothOff, LogOut, Sun, Moon } from 'lucide-react';
import type { DeviceCommand, MemberState, CmdAction, WaveformTransfer } from './lib/protocol';

export default function App() {
  const [displayName, setDisplayName] = useState(() =>
    localStorage.getItem('dg-chat-name') ?? ''
  );
  const [activeTab, setActiveTab] = useState<'chat' | 'control'>('chat');
  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') ?? 'dark'
  );

  const safety = useSafetyAccepted();
  const peerRoom = usePeerRoom(displayName);
  const device = useDevice();
  const waveforms = useWaveforms();

  // 保持引用最新，避免闭包过时
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const waveformsRef = useRef(waveforms);
  waveformsRef.current = waveforms;

  useEffect(() => {
    if (displayName) localStorage.setItem('dg-chat-name', displayName);
  }, [displayName]);

  // 注册远程指令处理器
  const handleCommand = useCallback((cmd: DeviceCommand, _peerId: string) => {
    const ctx: CommandContext = {
      device: deviceRef.current.connected ? (deviceRef.current as unknown as CommandContext['device']) : null,
      getWaveform: waveformsRef.current.getWaveform,
    };
    executeCommand(cmd, ctx);
  }, []);

  useEffect(() => {
    peerRoom.setCommandHandler(handleCommand);
  }, [peerRoom.setCommandHandler, handleCommand]);

  const handleWaveform = useCallback((transfer: WaveformTransfer, _peerId: string) => {
    waveforms.addRemoteWaveform({
      ...transfer.waveform,
      custom: true,
    });
  }, [waveforms.addRemoteWaveform]);

  useEffect(() => {
    peerRoom.setWaveformHandler(handleWaveform);
  }, [peerRoom.setWaveformHandler, handleWaveform]);

  const sendCommand = useCallback((target: string, action: CmdAction, data?: string) => {
    const cmd: DeviceCommand = { target, action, data };
    if (target === 'self') {
      handleCommand(cmd, 'self');
    } else {
      peerRoom.sendCommand(target, action, data);
    }
  }, [peerRoom.sendCommand, handleCommand]);

  // 定期广播自己的设备状态
  useEffect(() => {
    if (!peerRoom.connected) return;
    const broadcast = () => {
      peerRoom.broadcastState({
        peerId: 'self',
        displayName,
        deviceConnected: device.connected,
        strengthA: device.strengthA,
        strengthB: device.strengthB,
        waveA: device.waveIdA,
        waveB: device.waveIdB,
        battery: device.battery,
      });
    };
    broadcast();
    const interval = setInterval(broadcast, 2000);
    return () => clearInterval(interval);
  }, [peerRoom.connected, peerRoom.broadcastState, displayName,
      device.connected, device.strengthA, device.strengthB,
      device.waveIdA, device.waveIdB, device.battery]);

  if (!safety.accepted) {
    return <SafetyNotice onAccept={({ dontShowAgain }) => safety.accept(dontShowAgain)} />;
  }

  if (!peerRoom.connected) {
    return (
      <RoomEntry
        displayName={displayName}
        onNameChange={setDisplayName}
        onJoin={(code, relays) => peerRoom.join(code, relays)}
        status={peerRoom.status}
        error={peerRoom.error}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[var(--bg)]">
      {/* 顶部栏 */}
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--surface-border)] bg-[var(--bg-elevated)] px-3 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-[var(--text)]">DG-Chat</h1>
          {peerRoom.roomId && (
            <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--text-faint)]">
              {peerRoom.roomId}
            </span>
          )}
          {peerRoom.peers.length > 0 ? (
            <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent)]">
              {peerRoom.peers.length + 1} 人在线
            </span>
          ) : (
            <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-xs text-[var(--text-faint)]">
              等待其他成员加入...
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* 主题切换 */}
          <button
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              setTheme(next);
              document.documentElement.setAttribute('data-theme', next);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-soft)] transition-colors hover:bg-[var(--bg-soft)]"
            title={theme === 'dark' ? '切换亮色主题' : '切换暗色主题'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {/* 蓝牙连接按钮 */}
          <button
            onClick={device.connected ? device.disconnect : device.connect}
            className={`flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs transition-colors ${
              device.connected
                ? 'bg-[var(--success-soft)] text-[var(--success)]'
                : 'text-[var(--text-soft)] hover:bg-[var(--bg-soft)]'
            }`}
            title={device.connected ? `已连接 ${device.deviceInfo?.name ?? ''} (点击断开)` : '连接蓝牙设备'}
          >
            {device.connected ? (
              <>
                <Bluetooth className="h-4 w-4" />
                {device.battery != null && <span>{device.battery}%</span>}
              </>
            ) : (
              <BluetoothOff className="h-4 w-4" />
            )}
          </button>
          {/* 紧急停止 */}
          {device.connected && (
            <button
              onClick={device.stopAll}
              className="flex h-9 items-center gap-1 rounded-[10px] bg-[var(--danger-soft)] px-2.5 text-xs font-medium text-[var(--danger)] transition-opacity hover:opacity-80"
            >
              ⏹ 停止
            </button>
          )}
          {/* 离开房间 */}
          <button
            onClick={() => { device.disconnect(); peerRoom.leave(); }}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--text-soft)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--danger)]"
            title="离开房间"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* 手机 Tab 栏 */}
      <div className="flex shrink-0 border-b border-[var(--surface-border)] bg-[var(--bg-elevated)] lg:hidden">
        <button
          onClick={() => setActiveTab('chat')}
          className={`mobile-tab ${activeTab === 'chat' ? 'active' : ''}`}
        >
          💬 聊天
        </button>
        <button
          onClick={() => setActiveTab('control')}
          className={`mobile-tab ${activeTab === 'control' ? 'active' : ''}`}
        >
          ⚡ 控制
        </button>
      </div>

      {/* 双面板 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
        <div className={`${activeTab !== 'chat' ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col`}>
          <ChatPanel
            messages={peerRoom.messages}
            onSend={peerRoom.sendMessage}
            myPeerId="self"
          />
        </div>
        <div className={`${activeTab !== 'control' ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col border-l border-[var(--surface-border)]`}>
          <ControlPanel
            members={peerRoom.members}
            peers={peerRoom.peers}
            onSendCommand={sendCommand}
            onSendWaveform={peerRoom.sendWaveform}
            displayName={displayName}
            roomId={peerRoom.roomId}
            waveforms={waveforms.allWaveforms}
            onImportWaveform={waveforms.importFile}
            onRemoveWaveform={waveforms.removeWaveform}
            selfState={{
              peerId: 'self',
              displayName,
              deviceConnected: device.connected,
              strengthA: device.strengthA,
              strengthB: device.strengthB,
              waveA: device.waveIdA,
              waveB: device.waveIdB,
              battery: device.battery,
            } satisfies MemberState}
            selfLimitA={device.limitA}
            selfLimitB={device.limitB}
            onSetLimit={device.setLimit}
          />
        </div>
      </div>
      <footer className="shrink-0 border-t border-[var(--surface-border)] bg-[var(--bg-elevated)] py-1.5 text-center text-[10px] text-[var(--text-faint)]">
        本项目仅供学习交流使用，请遵守当地法律法规。<a href="https://github.com/0xNullAI/DG-Chat" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]">GitHub</a>
      </footer>
    </div>
  );
}
