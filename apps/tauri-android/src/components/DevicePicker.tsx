import { useMemo } from 'react';
import type { DiscoveredDevice } from '@dg-kit/transport-tauri-blec';
import './DevicePicker.css';

interface Props {
  open: boolean;
  devices: DiscoveredDevice[];
  onSelect: (address: string) => void;
  onCancel: () => void;
}

export function DevicePicker({ open, devices, onSelect, onCancel }: Props) {
  const sorted = useMemo(
    () => [...devices].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)),
    [devices],
  );
  if (!open) return null;
  return (
    <div className="dgch-picker-backdrop" role="dialog" aria-modal="true">
      <div className="dgch-picker-panel">
        {/* Reused for all 4 device kinds now (Coyote + the 3 aux kinds via
            DeviceSession.connectDeviceKindTauri()) — generic title since the
            caller already told the user which kind via the kind buttons in
            DeviceSafetyButton. */}
        <header className="dgch-picker-header">选择设备</header>
        <ul className="dgch-picker-list">
          {sorted.length === 0 ? (
            <li className="dgch-picker-empty">
              未发现设备 — 请确认设备已开机并按住按键开启广播
            </li>
          ) : (
            sorted.map((d) => (
              <li key={d.address}>
                <button
                  className="dgch-picker-row"
                  type="button"
                  onClick={() => onSelect(d.address)}
                >
                  <span className="dgch-picker-name">{d.name || '未知设备'}</span>
                  <span className="dgch-picker-meta">
                    {d.address} · RSSI {d.rssi}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <footer className="dgch-picker-footer">
          <button className="dgch-picker-cancel" type="button" onClick={onCancel}>
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}
