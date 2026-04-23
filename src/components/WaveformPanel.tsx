import { useRef } from 'react';
import { Upload, Trash2, Waves } from 'lucide-react';
import type { WaveformDefinition } from '../lib/waveforms';

interface WaveformPanelProps {
  waveforms: WaveformDefinition[];
  selectedId: string | null;
  onSelect: (waveform: WaveformDefinition) => void;
  onImport: (file: File) => Promise<string | null>;
  onRemove?: (id: string) => void;
  compact?: boolean;  // When true, show as dropdown-like compact list
}

export function WaveformPanel({
  waveforms,
  selectedId,
  onSelect,
  onImport,
  onRemove,
  compact = false,
}: WaveformPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = await onImport(file);
    if (error) window.alert(error);
    // Reset input
    e.target.value = '';
  }

  return (
    <div className={compact ? '' : 'space-y-2'}>
      {!compact && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-[var(--text-soft)]">波形库</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
          >
            <Upload size={12} /> 导入 .pulse
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pulse,.zip"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      <div className={compact ? 'flex flex-wrap gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
        {waveforms.map(w => (
          <button
            key={w.id}
            onClick={() => onSelect(w)}
            className={`flex min-h-[36px] items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1.5 text-left text-xs transition-colors ${
              selectedId === w.id
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--surface-border)] bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[var(--bg-soft)]'
            }`}
          >
            <Waves size={12} className="shrink-0" />
            <span className="truncate">{w.name}</span>
            {w.custom && onRemove && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onRemove(w.id);
                }}
                className="ml-auto shrink-0 rounded p-0.5 text-[var(--text-faint)] hover:text-[var(--danger)]"
              >
                <Trash2 size={10} />
              </button>
            )}
          </button>
        ))}
      </div>

      {compact && (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-1.5 flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
          >
            <Upload size={11} /> 导入 .pulse 文件
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pulse,.zip"
            className="hidden"
            onChange={handleFileChange}
          />
        </>
      )}
    </div>
  );
}
