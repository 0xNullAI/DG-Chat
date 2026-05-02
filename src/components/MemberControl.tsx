import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, Bluetooth, BatteryMedium, Play, Pause, RotateCcw, Upload, Trash2, Zap, Repeat, Repeat1, Shuffle, Timer } from 'lucide-react';
import type { CmdAction, DeviceCommand, MemberState, WaveformTransfer } from '../lib/protocol';

function useRepeatAction(action: () => void, initialDelay = 400, repeatInterval = 100) {
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback(() => {
    stop();
    actionRef.current();
    timerRef.current = window.setTimeout(() => {
      intervalRef.current = window.setInterval(() => actionRef.current(), repeatInterval);
    }, initialDelay);
  }, [stop, initialDelay, repeatInterval]);

  useEffect(() => stop, [stop]);

  return { onPointerDown: start, onPointerUp: stop, onPointerLeave: stop };
}

function RepeatButton({ onAction, className, children }: {
  onAction: () => void;
  className: string;
  children: React.ReactNode;
}) {
  const handlers = useRepeatAction(onAction);
  return (
    <button
      {...handlers}
      onContextMenu={e => e.preventDefault()}
      className={className}
      style={{ touchAction: 'manipulation', WebkitUserSelect: 'none', userSelect: 'none' }}
    >{children}</button>
  );
}
import { parseImportFile, type WaveformDefinition } from '../lib/waveforms';

interface MemberControlProps {
  peerId: string;
  member: MemberState | undefined;
  onSendCommand: (target: string, action: CmdAction, params?: Omit<DeviceCommand, 'action'>) => void;
  onSendWaveform: (targetPeerId: string, transfer: WaveformTransfer) => void;
  onBack: () => void;
  waveforms: WaveformDefinition[];
  onImportWaveform: (file: File) => Promise<string | null>;
  onRemoveWaveform: (id: string) => void;
  onClearWaveforms: () => void;
  isSelf: boolean;
  limitA: number;
  limitB: number;
  onSetLimit?: (channel: 'A' | 'B', value: number) => void;
  backgroundBehavior: 'stop' | 'keep';
  onSetBackgroundBehavior?: (mode: 'stop' | 'keep') => void;
}

const RING_R = 46;
const RING_C = 2 * Math.PI * RING_R;

function FireCircle({ label, strength, maxStrength, disabled, firing, onStrengthChange, onFireStart, onFireStop }: {
  label: string;
  strength: number;
  maxStrength: number;
  disabled: boolean;
  firing: boolean;
  onStrengthChange: (v: number) => void;
  onFireStart: () => void;
  onFireStop: () => void;
}) {
  const pct = maxStrength > 0 ? strength / maxStrength : 0;
  const offset = RING_C * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 110, height: 110 }}>
        {/* Background ring */}
        <svg className="absolute inset-0" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r={RING_R} fill="none" stroke="var(--surface-border)" strokeWidth="6" />
          <circle
            cx="55" cy="55" r={RING_R}
            fill="none"
            stroke={firing ? 'var(--danger)' : 'var(--accent)'}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
            transform="rotate(-90 55 55)"
            className="transition-all duration-150"
          />
        </svg>
        {/* Center fire button */}
        <button
          disabled={disabled}
          onPointerDown={e => { e.preventDefault(); if (!disabled) onFireStart(); }}
          onPointerUp={onFireStop}
          onPointerLeave={() => { if (firing) onFireStop(); }}
          onContextMenu={e => e.preventDefault()}
          className={`absolute inset-[10px] flex flex-col items-center justify-center rounded-full transition-all select-none ${
            disabled ? 'opacity-30 cursor-not-allowed' :
            firing ? 'bg-[var(--danger)] text-white scale-95' :
            'bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[var(--bg-soft)] active:scale-95 cursor-pointer'
          }`}
          style={{ touchAction: 'manipulation', WebkitUserSelect: 'none' }}
        >
          <Zap size={20} className={firing ? 'text-white' : 'text-[var(--danger)]'} />
          <span className="text-[10px] mt-0.5">{label} 开火</span>
        </button>
      </div>
      {/* Strength +/- */}
      <div className="mt-2 flex items-center gap-2">
        <RepeatButton
          onAction={() => onStrengthChange(Math.max(0, strength - 1))}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--bg-elevated)] text-xs text-[var(--text)] hover:border-[var(--accent)] active:scale-90"
        >−</RepeatButton>
        <span className="w-8 text-center text-xs tabular-nums font-medium text-[var(--text)]">{strength}</span>
        <RepeatButton
          onAction={() => onStrengthChange(Math.min(maxStrength, strength + 1))}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--bg-elevated)] text-xs text-[var(--text)] hover:border-[var(--accent)] active:scale-90"
        >+</RepeatButton>
      </div>
    </div>
  );
}

export function MemberControl({
  peerId, member, onSendCommand, onSendWaveform, onBack,
  waveforms, onImportWaveform, onRemoveWaveform, onClearWaveforms,
  isSelf, limitA, limitB, onSetLimit, backgroundBehavior, onSetBackgroundBehavior,
}: MemberControlProps) {
  type PlayMode = 'single' | 'list' | 'random';

  const [waveTab, setWaveTab] = useState<'A' | 'B'>('A');
  const [playlistA, setPlaylistA] = useState<string[]>(() => member?.waveA ? [member.waveA] : []);
  const [playlistB, setPlaylistB] = useState<string[]>(() => member?.waveB ? [member.waveB] : []);
  const [playModeA, setPlayModeA] = useState<PlayMode>('single');
  const [playModeB, setPlayModeB] = useState<PlayMode>('single');
  const [intervalA, setIntervalA] = useState(30);
  const [intervalB, setIntervalB] = useState(30);
  const [currentIndexA, setCurrentIndexA] = useState(0);
  const [currentIndexB, setCurrentIndexB] = useState(0);
  const [fireStrA, setFireStrA] = useState(0);
  const [fireStrB, setFireStrB] = useState(0);
  const [firingA, setFiringA] = useState(false);
  const [firingB, setFiringB] = useState(false);
  const preFireStrA = useRef(0);
  const preFireStrB = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const switchTimerA = useRef<number | null>(null);
  const switchTimerB = useRef<number | null>(null);

  const name = member?.displayName || peerId.slice(0, 8);
  const strengthA = member?.strengthA ?? 0;
  const strengthB = member?.strengthB ?? 0;
  const deviceConnected = member?.deviceConnected ?? false;
  const playingA = !!member?.waveA;
  const playingB = !!member?.waveB;

  const currentPlaylist = waveTab === 'A' ? playlistA : playlistB;
  const currentPlayMode = waveTab === 'A' ? playModeA : playModeB;
  const setCurrentPlayMode = waveTab === 'A' ? setPlayModeA : setPlayModeB;
  const currentInterval = waveTab === 'A' ? intervalA : intervalB;
  const setCurrentInterval = waveTab === 'A' ? setIntervalA : setIntervalB;
  const activeWaveId = waveTab === 'A' ? member?.waveA : member?.waveB;

  // 乐观本地强度：避免 broadcastState 2 秒延迟导致 strength+1 一直基于旧值
  const [localStrengthA, setLocalStrengthA] = useState(strengthA);
  const [localStrengthB, setLocalStrengthB] = useState(strengthB);
  const lastLocalAtA = useRef(0);
  const lastLocalAtB = useRef(0);

  // 远端状态变化时，若本地最近无操作（>1.5s）则采纳远端值（开火/归零/他人调整）
  useEffect(() => {
    if (Date.now() - lastLocalAtA.current > 1500) setLocalStrengthA(strengthA);
  }, [strengthA]);
  useEffect(() => {
    if (Date.now() - lastLocalAtB.current > 1500) setLocalStrengthB(strengthB);
  }, [strengthB]);

  const adjustStrength = useCallback((channel: 'A' | 'B', delta: number) => {
    const max = channel === 'A' ? limitA : limitB;
    const setter = channel === 'A' ? setLocalStrengthA : setLocalStrengthB;
    const stamp = channel === 'A' ? lastLocalAtA : lastLocalAtB;
    setter(prev => {
      const next = Math.max(0, Math.min(max, prev + delta));
      if (next === prev) return prev;
      stamp.current = Date.now();
      onSendCommand(peerId, 'adjust_strength', { c: channel, v: next });
      return next;
    });
  }, [peerId, onSendCommand, limitA, limitB]);

  function toggleWaveform(w: WaveformDefinition) {
    const setter = waveTab === 'A' ? setPlaylistA : setPlaylistB;
    const setIdx = waveTab === 'A' ? setCurrentIndexA : setCurrentIndexB;
    const playlist = waveTab === 'A' ? playlistA : playlistB;
    const isPlaying = waveTab === 'A' ? playingA : playingB;

    if (playlist.includes(w.id)) {
      const removedIdx = playlist.indexOf(w.id);
      setter(prev => prev.filter(id => id !== w.id));
      if (removedIdx <= (waveTab === 'A' ? currentIndexA : currentIndexB)) {
        setIdx(prev => Math.max(0, prev - 1));
      }
    } else {
      setter(prev => {
        const newList = [...prev, w.id];
        setIdx(newList.length - 1);
        return newList;
      });
      if (isPlaying) {
        onSendCommand(peerId, 'change_wave', { c: waveTab, w: w.id });
      }
    }
  }

  function getNextWaveId(playlist: string[], currentIdx: number, mode: PlayMode): { id: string; idx: number } {
    if (playlist.length === 0) return { id: '', idx: 0 };
    if (mode === 'single') return { id: playlist[currentIdx % playlist.length]!, idx: currentIdx };
    if (mode === 'random') {
      const idx = Math.floor(Math.random() * playlist.length);
      return { id: playlist[idx]!, idx };
    }
    const nextIdx = (currentIdx + 1) % playlist.length;
    return { id: playlist[nextIdx]!, idx: nextIdx };
  }

  const switchWave = useCallback((channel: 'A' | 'B') => {
    const playlist = channel === 'A' ? playlistA : playlistB;
    const mode = channel === 'A' ? playModeA : playModeB;
    const currentIdx = channel === 'A' ? currentIndexA : currentIndexB;
    const setIdx = channel === 'A' ? setCurrentIndexA : setCurrentIndexB;

    if (playlist.length <= 1 && mode === 'single') return;

    const { id, idx } = getNextWaveId(playlist, currentIdx, mode);
    if (!id) return;
    setIdx(idx);
    onSendCommand(peerId, 'change_wave', { c: channel, w: id });
  }, [playlistA, playlistB, playModeA, playModeB, currentIndexA, currentIndexB, peerId, onSendCommand]);

  useEffect(() => {
    if (switchTimerA.current) { clearInterval(switchTimerA.current); switchTimerA.current = null; }
    if (playingA && playlistA.length > 1 && playModeA !== 'single') {
      switchTimerA.current = window.setInterval(() => switchWave('A'), intervalA * 1000);
    }
    return () => { if (switchTimerA.current) clearInterval(switchTimerA.current); };
  }, [playingA, playlistA.length, playModeA, intervalA, switchWave]);

  useEffect(() => {
    if (switchTimerB.current) { clearInterval(switchTimerB.current); switchTimerB.current = null; }
    if (playingB && playlistB.length > 1 && playModeB !== 'single') {
      switchTimerB.current = window.setInterval(() => switchWave('B'), intervalB * 1000);
    }
    return () => { if (switchTimerB.current) clearInterval(switchTimerB.current); };
  }, [playingB, playlistB.length, playModeB, intervalB, switchWave]);

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = await onImportWaveform(file);
    if (error) window.alert(error);
    e.target.value = '';
  }

  async function handleRemoteImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const waveformList = await parseImportFile(file);
      if (waveformList.length === 0) {
        window.alert('无法解析文件格式');
        e.target.value = '';
        return;
      }
      for (const wf of waveformList) {
        onSendWaveform(peerId, { wid: wf.id, wn: wf.name, fr: wf.frames });
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '导入失败');
    }
    e.target.value = '';
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--surface-border)] px-4 py-3">
        <button
          onClick={onBack}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-soft)] transition-colors hover:bg-[var(--bg-soft)]"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text)]">{name}</p>
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${deviceConnected ? 'bg-[var(--success)]' : 'bg-[var(--text-faint)]'}`} />
        </div>
        {deviceConnected && (
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-soft)]">
            <Bluetooth size={14} className="text-[var(--success)]" />
            {member?.battery != null && (
              <span className="flex items-center gap-0.5">
                <BatteryMedium size={14} />
                {member.battery}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-4">
        {/* ==================== Dual Channel Strength ==================== */}
        <div className="flex items-center justify-center gap-6">
          {/* Channel A */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => {
                if (playingA) {
                  onSendCommand(peerId, 'stop_wave', { c: 'A' });
                } else if (playlistA.length > 0) {
                  const startId = playlistA[currentIndexA % playlistA.length]!;
                  onSendCommand(peerId, 'start', { c: 'A', w: startId });
                }
              }}
              disabled={!playingA && playlistA.length === 0}
              className={`mb-2 flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-30 ${
                playingA
                  ? 'bg-[var(--danger)] text-white'
                  : 'bg-[var(--accent)] text-[var(--button-text)]'
              }`}
              title={playingA ? '暂停 A' : playlistA.length > 0 ? '启动 A' : '请先选择 A 通道波形'}
            >
              {playingA ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <div className="channel-ring">
              <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{localStrengthA}</span>
              <span className="text-[10px] text-[var(--text-faint)]">A:{limitA}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RepeatButton onAction={() => adjustStrength('A', -1)} className="strength-btn">−</RepeatButton>
              <RepeatButton onAction={() => adjustStrength('A', +1)} className="strength-btn">+</RepeatButton>
            </div>
          </div>

          {/* Channel B */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => {
                if (playingB) {
                  onSendCommand(peerId, 'stop_wave', { c: 'B' });
                } else if (playlistB.length > 0) {
                  const startId = playlistB[currentIndexB % playlistB.length]!;
                  onSendCommand(peerId, 'start', { c: 'B', w: startId });
                }
              }}
              disabled={!playingB && playlistB.length === 0}
              className={`mb-2 flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-30 ${
                playingB
                  ? 'bg-[var(--danger)] text-white'
                  : 'bg-[var(--accent)] text-[var(--button-text)]'
              }`}
              title={playingB ? '暂停 B' : playlistB.length > 0 ? '启动 B' : '请先选择 B 通道波形'}
            >
              {playingB ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <div className="channel-ring">
              <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{localStrengthB}</span>
              <span className="text-[10px] text-[var(--text-faint)]">B:{limitB}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RepeatButton onAction={() => adjustStrength('B', -1)} className="strength-btn">−</RepeatButton>
              <RepeatButton onAction={() => adjustStrength('B', +1)} className="strength-btn">+</RepeatButton>
            </div>
          </div>
        </div>

        {/* ==================== Reset / Stop Bar ==================== */}
        <div className="mt-5 flex items-center justify-center">
          <button
            onClick={() => onSendCommand(peerId, 'stop')}
            className="flex h-11 flex-1 max-w-xs items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-soft)] active:scale-[0.98]"
          >
            <RotateCcw size={15} className="text-[var(--danger)]" />
            归零
          </button>
        </div>

        {/* ==================== A/B Channel Wave Tab ==================== */}
        <div className="mt-5 flex rounded-[var(--radius-sm)] border border-[var(--surface-border)] overflow-hidden">
          <button
            onClick={() => setWaveTab('A')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              waveTab === 'A'
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:bg-[var(--bg-soft)]'
            }`}
          >
            A 通道波形
          </button>
          <button
            onClick={() => setWaveTab('B')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              waveTab === 'B'
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:bg-[var(--bg-soft)]'
            }`}
          >
            B 通道波形
          </button>
        </div>

        {/* ==================== Playlist Controls ==================== */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPlayMode('single')}
              className={`flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] transition-colors ${
                currentPlayMode === 'single'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'
              }`}
              title="单曲循环"
            >
              <Repeat1 size={13} /> 单曲
            </button>
            <button
              onClick={() => setCurrentPlayMode('list')}
              className={`flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] transition-colors ${
                currentPlayMode === 'list'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'
              }`}
              title="列表循环"
            >
              <Repeat size={13} /> 列表
            </button>
            <button
              onClick={() => setCurrentPlayMode('random')}
              className={`flex h-7 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] transition-colors ${
                currentPlayMode === 'random'
                  ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                  : 'text-[var(--text-faint)] hover:text-[var(--text-soft)]'
              }`}
              title="随机播放"
            >
              <Shuffle size={13} /> 随机
            </button>
          </div>
          {currentPlayMode !== 'single' && (
            <div className="flex items-center gap-1.5">
              <Timer size={12} className="text-[var(--text-faint)]" />
              <select
                value={currentInterval}
                onChange={e => setCurrentInterval(Number(e.target.value))}
                className="rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-1.5 py-0.5 text-[11px] text-[var(--text)] outline-none"
              >
                <option value={10}>10秒</option>
                <option value={20}>20秒</option>
                <option value={30}>30秒</option>
                <option value={60}>1分钟</option>
                <option value={120}>2分钟</option>
                <option value={300}>5分钟</option>
                <option value={600}>10分钟</option>
              </select>
            </div>
          )}
        </div>

        {/* ==================== Waveform Grid ==================== */}
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-[var(--text-faint)]">
              波形{currentPlaylist.length > 0 ? ` (已选 ${currentPlaylist.length})` : ''}
            </p>
            <div className="flex items-center gap-1">
              {isSelf && waveforms.some(w => w.custom) && (
                <button
                  onClick={() => {
                    if (window.confirm('确定要清空所有自定义波形吗？此操作无法撤销。')) {
                      onClearWaveforms();
                    }
                  }}
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
                >
                  <Trash2 size={12} /> 清空
                </button>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
              >
                <Upload size={12} /> 导入波形
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pulse,.zip"
                className="hidden"
                onChange={isSelf ? handleFileImport : handleRemoteImport}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {waveforms.map(w => {
              const inPlaylist = currentPlaylist.includes(w.id);
              const isActive = activeWaveId === w.id;
              return (
                <div
                  key={w.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleWaveform(w)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleWaveform(w); } }}
                  className={`wave-card group ${
                    isActive ? 'selected' :
                    inPlaylist ? 'wave-card-queued' : ''
                  }`}
                >
                  <svg viewBox="0 0 40 20" className="wave-icon">
                    <path
                      d="M2 10 Q8 2 14 10 Q20 18 26 10 Q32 2 38 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="wave-card-name">{w.name}</span>
                  {inPlaylist && (
                    <span className="absolute top-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--accent)] text-[8px] text-white font-bold">
                      {currentPlaylist.indexOf(w.id) + 1}
                    </span>
                  )}
                  {isSelf && w.custom && !inPlaylist && (
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveWaveform(w.id); }}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      title="删除波形"
                    >
                      <Trash2 size={8} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ==================== Fire Buttons ==================== */}
        <div className="mt-5">
          <p className="mb-3 text-center text-xs text-[var(--text-faint)]">一键开火（按住增加强度，松开恢复）</p>
          <div className="flex items-center justify-center gap-8">
            <FireCircle
              label="A"
              strength={fireStrA}
              maxStrength={limitA}
              disabled={false}
              firing={firingA}
              onStrengthChange={setFireStrA}
              onFireStart={() => {
                preFireStrA.current = localStrengthA;
                setFiringA(true);
                onSendCommand(peerId, 'fire', { c: 'A', v: localStrengthA + fireStrA });
              }}
              onFireStop={() => {
                setFiringA(false);
                onSendCommand(peerId, 'fire_stop', { c: 'A', v: preFireStrA.current });
              }}
            />
            <FireCircle
              label="B"
              strength={fireStrB}
              maxStrength={limitB}
              disabled={false}
              firing={firingB}
              onStrengthChange={setFireStrB}
              onFireStart={() => {
                preFireStrB.current = localStrengthB;
                setFiringB(true);
                onSendCommand(peerId, 'fire', { c: 'B', v: localStrengthB + fireStrB });
              }}
              onFireStop={() => {
                setFiringB(false);
                onSendCommand(peerId, 'fire_stop', { c: 'B', v: preFireStrB.current });
              }}
            />
          </div>
        </div>

        {/* ==================== Strength Limit (self only) ==================== */}
        {isSelf && onSetLimit && (
          <div className="mt-6 rounded-[var(--radius-md)] border border-[var(--surface-border)] bg-[var(--bg-elevated)] p-4">
            <p className="mb-3 text-xs font-medium text-[var(--text-soft)]">强度上限（仅自己可见）</p>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-soft)]">A 通道上限</span>
                  <span className="text-xs tabular-nums font-medium text-[var(--accent)]">{limitA}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={limitA}
                  onChange={e => onSetLimit('A', Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-soft)]">B 通道上限</span>
                  <span className="text-xs tabular-nums font-medium text-[var(--accent)]">{limitB}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={limitB}
                  onChange={e => onSetLimit('B', Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
            <p className="mt-2 text-[10px] text-[var(--text-faint)]">硬件级别限制，远程控制无法超过此上限</p>

            {/* 后台行为 */}
            <div className="mt-3 flex items-center justify-between border-t border-[var(--surface-border)] pt-3">
              <div>
                <p className="text-xs font-medium text-[var(--text-soft)]">后台行为</p>
                <p className="text-[10px] text-[var(--text-faint)]">切换至其他标签页时</p>
              </div>
              <button
                onClick={() => onSetBackgroundBehavior?.(backgroundBehavior === 'stop' ? 'keep' : 'stop')}
                className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                  backgroundBehavior === 'stop'
                    ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                    : 'bg-[var(--success-soft)] text-[var(--success)]'
                }`}
              >
                {backgroundBehavior === 'stop' ? '停止输出' : '继续运行'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
