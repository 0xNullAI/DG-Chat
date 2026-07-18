import { Lightbulb } from 'lucide-react';

interface LedColorPickerProps {
  /** 当前设备实际支持的是单字节颜色编码（0-255），不是 RGB —— 具体色相映射由固件决定，
   *  这里给出一组视觉上分散的预设方便挑选，按钮上的色块只是助记，不代表设备真实发光颜色。 */
  onPick: (colorByte: number) => void;
  disabled?: boolean;
  className?: string;
}

const PRESETS: Array<{ label: string; byte: number; swatch: string }> = [
  { label: '红', byte: 0, swatch: '#ef4444' },
  { label: '橙', byte: 32, swatch: '#f97316' },
  { label: '黄', byte: 64, swatch: '#eab308' },
  { label: '绿', byte: 96, swatch: '#22c55e' },
  { label: '青', byte: 128, swatch: '#06b6d4' },
  { label: '蓝', byte: 160, swatch: '#3b82f6' },
  { label: '紫', byte: 192, swatch: '#a855f7' },
  { label: '白', byte: 255, swatch: '#e5e7eb' },
];

/**
 * 小型可复用 LED 颜色选择器，供 paw-prints / civet-edging / opossum 三种设备共用。
 * 点击直接通过 onPick 把颜色字节（0-255）交给调用方 —— 调用方负责用 'set_led'
 * room action 把它发出去（自己/远端设备都走同一条路径，见 MemberControl）。
 */
export function LedColorPicker({ onPick, disabled, className }: LedColorPickerProps) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1 text-[11px] text-[var(--text-faint)]">
        <Lightbulb size={12} /> 灯光颜色
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(preset => (
          <button
            key={preset.byte}
            disabled={disabled}
            onClick={() => onPick(preset.byte)}
            title={`${preset.label}（字节值 ${preset.byte}）`}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--surface-border)] transition-transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
            style={{ backgroundColor: preset.swatch }}
          >
            <span className="sr-only">{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
