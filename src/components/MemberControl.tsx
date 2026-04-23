import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeft, Bluetooth, BatteryMedium, Play, Pause, RotateCcw, Upload, Trash2, Zap } from 'lucide-react';
import type { CmdAction, MemberState, WaveformTransfer } from '../lib/protocol';

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
import { parsePulseFile, type WaveformDefinition } from '../lib/waveforms';

interface MemberControlProps {
  peerId: string;
  member: MemberState | undefined;
  onSendCommand: (target: string, action: CmdAction, data?: string) => void;
  onSendWaveform: (targetPeerId: string, transfer: WaveformTransfer) => void;
  displayName: string;
  onBack: () => void;
  waveforms: WaveformDefinition[];
  onImportWaveform: (file: File) => Promise<string | null>;
  onRemoveWaveform: (id: string) => void;
  isSelf: boolean;
  limitA: number;
  limitB: number;
  onSetLimit?: (channel: 'A' | 'B', value: number) => void;
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
  peerId, member, onSendCommand, onSendWaveform, displayName, onBack,
  waveforms, onImportWaveform, onRemoveWaveform,
  isSelf, limitA, limitB, onSetLimit,
}: MemberControlProps) {
  const [waveTab, setWaveTab] = useState<'A' | 'B'>('A');
  const [selectedWaveA, setSelectedWaveA] = useState<string | null>(member?.waveA ?? null);
  const [selectedWaveB, setSelectedWaveB] = useState<string | null>(member?.waveB ?? null);
  const [fireStrA, setFireStrA] = useState(0);
  const [fireStrB, setFireStrB] = useState(0);
  const [firingA, setFiringA] = useState(false);
  const [firingB, setFiringB] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const remoteFileInputRef = useRef<HTMLInputElement>(null);

  const name = member?.displayName || peerId.slice(0, 8);
  const strengthA = member?.strengthA ?? 0;
  const strengthB = member?.strengthB ?? 0;
  const deviceConnected = member?.deviceConnected ?? false;
  const playingA = !!member?.waveA;
  const playingB = !!member?.waveB;

  const throttleRef = useRef<Record<string, number>>({});
  const adjustStrength = useCallback((channel: 'A' | 'B', value: number) => {
    const max = channel === 'A' ? limitA : limitB;
    const clamped = Math.max(0, Math.min(max, value));
    const now = Date.now();
    const key = `strength_${channel}`;
    if (now - (throttleRef.current[key] ?? 0) < 80) return;
    throttleRef.current[key] = now;
    onSendCommand(peerId, 'adjust_strength', JSON.stringify({ channel, value: clamped }));
  }, [peerId, onSendCommand, limitA, limitB]);

  const selectedWave = waveTab === 'A' ? selectedWaveA : selectedWaveB;

  function selectWaveform(w: WaveformDefinition) {
    if (waveTab === 'A') {
      setSelectedWaveA(w.id);
    } else {
      setSelectedWaveB(w.id);
    }
    onSendCommand(peerId, 'change_wave', JSON.stringify({ channel: waveTab, waveId: w.id }));
  }

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
    const text = await file.text();
    const waveform = parsePulseFile(text);
    if (!waveform) {
      window.alert('无法解析文件格式');
      e.target.value = '';
      return;
    }
    const name = file.name.replace(/\.pulse$/i, '') || '导入波形';
    waveform.name = name;
    waveform.id = `custom-${name.replace(/\W/g, '')}-${Date.now().toString(36)}`;
    onSendWaveform(peerId, {
      waveform: { id: waveform.id, name: waveform.name, description: waveform.description, frames: waveform.frames },
      fromName: displayName,
    });
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
                  onSendCommand(peerId, 'stop_wave', JSON.stringify({ channel: 'A' }));
                } else if (selectedWaveA) {
                  onSendCommand(peerId, 'start', JSON.stringify({ channel: 'A', waveId: selectedWaveA }));
                }
              }}
              disabled={!playingA && !selectedWaveA}
              className={`mb-2 flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-30 ${
                playingA
                  ? 'bg-[var(--danger)] text-white'
                  : 'bg-[var(--accent)] text-[var(--button-text)]'
              }`}
              title={playingA ? '暂停 A' : selectedWaveA ? '启动 A' : '请先选择 A 通道波形'}
            >
              {playingA ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <div className="channel-ring">
              <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{strengthA}</span>
              <span className="text-[10px] text-[var(--text-faint)]">A:{limitA}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RepeatButton onAction={() => adjustStrength('A', strengthA - 1)} className="strength-btn">−</RepeatButton>
              <RepeatButton onAction={() => adjustStrength('A', strengthA + 1)} className="strength-btn">+</RepeatButton>
            </div>
          </div>

          {/* Channel B */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => {
                if (playingB) {
                  onSendCommand(peerId, 'stop_wave', JSON.stringify({ channel: 'B' }));
                } else if (selectedWaveB) {
                  onSendCommand(peerId, 'start', JSON.stringify({ channel: 'B', waveId: selectedWaveB }));
                }
              }}
              disabled={!playingB && !selectedWaveB}
              className={`mb-2 flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-30 ${
                playingB
                  ? 'bg-[var(--danger)] text-white'
                  : 'bg-[var(--accent)] text-[var(--button-text)]'
              }`}
              title={playingB ? '暂停 B' : selectedWaveB ? '启动 B' : '请先选择 B 通道波形'}
            >
              {playingB ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            <div className="channel-ring">
              <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{strengthB}</span>
              <span className="text-[10px] text-[var(--text-faint)]">B:{limitB}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <RepeatButton onAction={() => adjustStrength('B', strengthB - 1)} className="strength-btn">−</RepeatButton>
              <RepeatButton onAction={() => adjustStrength('B', strengthB + 1)} className="strength-btn">+</RepeatButton>
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

        {/* ==================== Waveform Grid ==================== */}
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-[var(--text-faint)]">波形</p>
            <div className="flex items-center gap-1">
              {!isSelf && (
                <>
                  <button
                    onClick={() => remoteFileInputRef.current?.click()}
                    className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--success)] transition-colors hover:bg-[var(--success-soft)]"
                  >
                    <Upload size={12} /> 为对方导入
                  </button>
                  <input
                    ref={remoteFileInputRef}
                    type="file"
                    accept=".pulse"
                    className="hidden"
                    onChange={handleRemoteImport}
                  />
                </>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
              >
                <Upload size={12} /> 导入 .pulse
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pulse"
                className="hidden"
                onChange={handleFileImport}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {waveforms.map(w => (
              <button
                key={w.id}
                onClick={() => selectWaveform(w)}
                className={`wave-card group ${selectedWave === w.id ? 'selected' : ''}`}
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
                {w.custom && (
                  <button
                    onClick={e => { e.stopPropagation(); onRemoveWaveform(w.id); }}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 size={8} />
                  </button>
                )}
              </button>
            ))}
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
                setFiringA(true);
                onSendCommand(peerId, 'fire', JSON.stringify({ channel: 'A', targetStrength: strengthA + fireStrA }));
              }}
              onFireStop={() => {
                setFiringA(false);
                onSendCommand(peerId, 'fire_stop', JSON.stringify({ channel: 'A', restoreStrength: strengthA }));
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
                setFiringB(true);
                onSendCommand(peerId, 'fire', JSON.stringify({ channel: 'B', targetStrength: strengthB + fireStrB }));
              }}
              onFireStop={() => {
                setFiringB(false);
                onSendCommand(peerId, 'fire_stop', JSON.stringify({ channel: 'B', restoreStrength: strengthB }));
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
          </div>
        )}
      </div>
    </div>
  );
}
