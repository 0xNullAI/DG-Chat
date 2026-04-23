import { useState, useEffect, useCallback } from 'react';
import type { RoomStatus } from '../hooks/use-peer-room';
import { DEFAULT_RELAYS } from '../hooks/use-peer-room';
import { Loader2, ChevronDown, ChevronUp, Wifi, WifiOff, Plus, X } from 'lucide-react';

type RelayStatus = 'idle' | 'testing' | 'ok' | 'fail';

interface RelayInfo {
  url: string;
  status: RelayStatus;
  latency: number | null;
  enabled: boolean;
}

function testRelay(url: string): Promise<{ ok: boolean; latency: number }> {
  return new Promise((resolve) => {
    const start = performance.now();
    const ws = new WebSocket(url, ['mqtt']);
    const timer = setTimeout(() => {
      ws.close();
      resolve({ ok: false, latency: -1 });
    }, 6000);
    ws.onopen = () => {
      clearTimeout(timer);
      const latency = Math.round(performance.now() - start);
      ws.close();
      resolve({ ok: true, latency });
    };
    ws.onerror = () => {
      clearTimeout(timer);
      resolve({ ok: false, latency: -1 });
    };
  });
}

interface RoomEntryProps {
  displayName: string;
  onNameChange: (name: string) => void;
  onJoin: (roomCode: string, relayUrls?: string[]) => void;
  status: RoomStatus;
  error: string | null;
}

export function RoomEntry({ displayName, onNameChange, onJoin, status, error }: RoomEntryProps) {
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') ?? '0xNullAI';
  });
  const [showRelays, setShowRelays] = useState(false);
  const [relays, setRelays] = useState<RelayInfo[]>(() =>
    DEFAULT_RELAYS.map(url => ({ url, status: 'idle' as RelayStatus, latency: null, enabled: true }))
  );
  const [customUrl, setCustomUrl] = useState('');
  const [testing, setTesting] = useState(false);

  const connecting = status === 'connecting';

  const testAllRelays = useCallback(async () => {
    setTesting(true);
    setRelays(prev => prev.map(r => ({ ...r, status: 'testing' as RelayStatus, latency: null })));

    const results = await Promise.all(
      relays.map(async (relay) => {
        const result = await testRelay(relay.url);
        return { ...relay, status: (result.ok ? 'ok' : 'fail') as RelayStatus, latency: result.ok ? result.latency : null };
      })
    );

    setRelays(results);
    setTesting(false);
  }, [relays]);

  useEffect(() => {
    if (showRelays && relays.every(r => r.status === 'idle')) {
      testAllRelays();
    }
  }, [showRelays]); // eslint-disable-line react-hooks/exhaustive-deps

  function getEnabledRelayUrls(): string[] {
    return relays.filter(r => r.enabled).map(r => r.url);
  }

  function createRoom() {
    const code = Math.random().toString(36).substring(2, 8);
    if (!displayName.trim()) return;
    onJoin(code, getEnabledRelayUrls());
  }

  function joinRoom() {
    if (!displayName.trim() || !roomCode.trim()) return;
    onJoin(roomCode.trim(), getEnabledRelayUrls());
  }

  function toggleRelay(url: string) {
    setRelays(prev => prev.map(r => r.url === url ? { ...r, enabled: !r.enabled } : r));
  }

  function removeRelay(url: string) {
    setRelays(prev => prev.filter(r => r.url !== url));
  }

  function addCustomRelay() {
    let url = customUrl.trim();
    if (!url) return;
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      url = 'wss://' + url;
    }
    if (relays.some(r => r.url === url)) return;
    setRelays(prev => [...prev, { url, status: 'idle', latency: null, enabled: true }]);
    setCustomUrl('');
  }

  const enabledCount = relays.filter(r => r.enabled).length;
  const okCount = relays.filter(r => r.status === 'ok').length;

  return (
    <div className="flex h-dvh items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm animate-fade-up rounded-[var(--radius-lg)] border border-[var(--surface-border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow)]">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--text)]">DG-Chat</h1>
        <p className="mb-4 text-center text-sm text-[var(--text-soft)]">P2P 多人聊天 &amp; 远程控制</p>

        {error && (
          <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs text-[var(--text-soft)]">你的昵称</label>
          <input
            type="text"
            value={displayName}
            onChange={e => onNameChange(e.target.value)}
            placeholder="输入昵称..."
            disabled={connecting}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            style={{ fontSize: '16px' }}
          />
        </div>

        <button
          onClick={createRoom}
          disabled={!displayName.trim() || connecting || enabledCount === 0}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--button-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {connecting ? '正在连接...' : '创建房间'}
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--surface-border)]" />
          <span className="text-xs text-[var(--text-faint)]">或加入已有房间</span>
          <div className="h-px flex-1 bg-[var(--surface-border)]" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={roomCode}
            onChange={e => setRoomCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinRoom()}
            placeholder="输入房间号"
            disabled={connecting}
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            style={{ fontSize: '16px' }}
          />
          <button
            onClick={joinRoom}
            disabled={!displayName.trim() || !roomCode.trim() || connecting || enabledCount === 0}
            className="flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--button-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            加入
          </button>
        </div>

        {/* Relay 设置 */}
        <div className="mt-5 border-t border-[var(--surface-border)] pt-4">
          <button
            onClick={() => setShowRelays(!showRelays)}
            className="flex w-full items-center justify-between text-xs text-[var(--text-soft)] hover:text-[var(--text)] transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" />
              信令服务器
              {okCount > 0 && (
                <span className="rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[10px] text-[var(--success)]">
                  {okCount}/{relays.length} 可用
                </span>
              )}
            </span>
            {showRelays ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showRelays && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-[var(--text-faint)]">
                  双方必须有至少一个相同的可用服务器
                </span>
                <button
                  onClick={testAllRelays}
                  disabled={testing}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
                >
                  {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {testing ? '测试中...' : '重新测试'}
                </button>
              </div>

              {relays.map((relay) => (
                <div
                  key={relay.url}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--surface-border)] px-2.5 py-1.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={relay.enabled}
                    onChange={() => toggleRelay(relay.url)}
                    className="accent-[var(--accent)]"
                  />

                  {relay.status === 'testing' && <Loader2 className="h-3 w-3 animate-spin text-[var(--text-faint)]" />}
                  {relay.status === 'ok' && <Wifi className="h-3 w-3 text-[var(--success)]" />}
                  {relay.status === 'fail' && <WifiOff className="h-3 w-3 text-[var(--danger)]" />}
                  {relay.status === 'idle' && <Wifi className="h-3 w-3 text-[var(--text-faint)]" />}

                  <span className={`flex-1 truncate ${relay.enabled ? 'text-[var(--text)]' : 'text-[var(--text-faint)] line-through'}`}>
                    {relay.url.replace('wss://', '')}
                  </span>

                  {relay.latency !== null && (
                    <span className={`tabular-nums text-[10px] ${relay.latency < 200 ? 'text-[var(--success)]' : relay.latency < 500 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>
                      {relay.latency}ms
                    </span>
                  )}

                  {!DEFAULT_RELAYS.includes(relay.url) && (
                    <button
                      onClick={() => removeRelay(relay.url)}
                      className="text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}

              {/* 添加自定义 relay */}
              <div className="flex gap-1.5 mt-2">
                <input
                  type="text"
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomRelay()}
                  placeholder="wss://your-relay.example.com"
                  className="flex-1 rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors"
                />
                <button
                  onClick={addCustomRelay}
                  disabled={!customUrl.trim()}
                  className="flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-[var(--surface-border)] px-2 py-1 text-xs text-[var(--text-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" /> 添加
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--text-faint)]">
          房间基于 P2P 直连，无需注册。输入相同房间号即可互相连接。
        </p>
        <p className="mt-3 text-center text-[10px] text-[var(--text-faint)]">
          本项目仅供学习交流使用，请遵守当地法律法规。<a href="https://github.com/0xNullAI/DG-Chat" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--accent)]">GitHub</a>
        </p>
      </div>
    </div>
  );
}
