import { useEffect, useRef, useState } from 'react';
import { Bluetooth, BluetoothOff, RotateCcw } from 'lucide-react';
import { Popover } from './Popover';

interface DeviceSafetyButtonProps {
  connected: boolean;
  deviceName: string | null;
  battery: number | null;
  onConnect: () => void;
  onDisconnect: () => void;
  limitA: number;
  limitB: number;
  onSetLimit: (channel: 'A' | 'B', value: number) => void;
  backgroundBehavior: 'stop' | 'keep';
  onSetBackgroundBehavior: (mode: 'stop' | 'keep') => void;
  firePolicy: 'sum' | 'max' | 'avg';
  onSetFirePolicy: (p: 'sum' | 'max' | 'avg') => void;
  onRestoreDefaults: () => void;
}

export function DeviceSafetyButton({
  connected, deviceName, battery,
  onConnect, onDisconnect,
  limitA, limitB, onSetLimit,
  backgroundBehavior, onSetBackgroundBehavior,
  firePolicy, onSetFirePolicy,
  onRestoreDefaults,
}: DeviceSafetyButtonProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchorTop, setAnchorTop] = useState(0);

  useEffect(() => {
    const measure = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setAnchorTop(r.bottom + 4);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        className={`flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-xs transition-colors ${
          connected
            ? 'bg-[var(--success-soft)] text-[var(--success)]'
            : 'text-[var(--text-soft)] hover:bg-[var(--bg-soft)]'
        }`}
        title={connected ? `已连接 ${deviceName ?? ''}` : '设备与个人安全设置'}
        aria-label="设备与个人安全设置"
      >
        {connected ? (
          <>
            <Bluetooth className="h-4 w-4" />
            {battery != null && <span className="hidden sm:inline">{battery}%</span>}
          </>
        ) : (
          <BluetoothOff className="h-4 w-4" />
        )}
      </button>

      <Popover open={open} onOpenChange={setOpen} title="设备与个人安全设置" anchorTop={anchorTop}>
        <div className="space-y-4">
          {/* 设备连接 */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--text-soft)]">蓝牙设备</p>
              <p className="truncate text-[10px] text-[var(--text-faint)]">
                {connected ? `${deviceName ?? '已连接'}${battery != null ? ` · 电量 ${battery}%` : ''}` : '未连接'}
              </p>
            </div>
            <button
              onClick={() => {
                if (connected) onDisconnect();
                else onConnect();
              }}
              className={`shrink-0 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                connected
                  ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                  : 'bg-[var(--accent-soft)] text-[var(--accent)]'
              }`}
            >
              {connected ? '断开' : '连接'}
            </button>
          </div>

          {/* 通道上限 */}
          <div className="space-y-3 border-t border-[var(--surface-border)] pt-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-[var(--text-soft)]">A 通道上限</span>
                <span className="text-xs tabular-nums font-medium text-[var(--accent)]">{limitA}</span>
              </div>
              <input type="range" min={0} max={200} value={limitA} onChange={e => onSetLimit('A', Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-[var(--text-soft)]">B 通道上限</span>
                <span className="text-xs tabular-nums font-medium text-[var(--accent)]">{limitB}</span>
              </div>
              <input type="range" min={0} max={200} value={limitB} onChange={e => onSetLimit('B', Number(e.target.value))} className="w-full" />
            </div>
            <p className="text-[10px] text-[var(--text-faint)]">硬件级别限制，远程控制无法超过此上限</p>
          </div>

          {/* 后台行为 */}
          <div className="flex items-center justify-between border-t border-[var(--surface-border)] pt-3">
            <div>
              <p className="text-xs font-medium text-[var(--text-soft)]">后台行为</p>
              <p className="text-[10px] text-[var(--text-faint)]">切换至其他标签页时</p>
            </div>
            <button
              onClick={() => onSetBackgroundBehavior(backgroundBehavior === 'stop' ? 'keep' : 'stop')}
              className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors ${
                backgroundBehavior === 'stop'
                  ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                  : 'bg-[var(--success-soft)] text-[var(--success)]'
              }`}
            >
              {backgroundBehavior === 'stop' ? '停止输出' : '继续运行'}
            </button>
          </div>

          {/* 多人开火聚合 */}
          <div className="border-t border-[var(--surface-border)] pt-3">
            <p className="mb-2 text-xs font-medium text-[var(--text-soft)]">多人开火聚合策略</p>
            <div className="flex gap-1">
              {(['max', 'sum', 'avg'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => onSetFirePolicy(p)}
                  className={`flex-1 rounded-[var(--radius-sm)] py-1.5 text-xs transition-colors ${
                    firePolicy === p
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border border-[var(--surface-border)] text-[var(--text-soft)] hover:bg-[var(--bg-soft)]'
                  }`}
                >
                  {p === 'max' ? '取最大' : p === 'sum' ? '叠加' : '平均'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-[var(--text-faint)]">
              取最大：任意控制者按下都不超过其单人份。叠加：多人累计（受上限封顶）。平均：多人按时反而稀释。
            </p>
          </div>

          {/* 恢复默认波形 */}
          <div className="border-t border-[var(--surface-border)] pt-3">
            <button
              onClick={() => {
                if (window.confirm('恢复默认波形：清空全部自定义波形并取消隐藏所有内置波形。此操作无法撤销。')) {
                  onRestoreDefaults();
                }
              }}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--surface-border)] text-xs font-medium text-[var(--text-soft)] hover:bg-[var(--bg-soft)]"
            >
              <RotateCcw size={13} /> 恢复默认波形
            </button>
            <p className="mt-1 text-[10px] text-[var(--text-faint)]">清空自定义 + 取消隐藏内置</p>
          </div>
        </div>
      </Popover>
    </>
  );
}
