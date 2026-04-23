import { useState } from 'react';

interface RoomEntryProps {
  displayName: string;
  onNameChange: (name: string) => void;
  onJoin: (roomCode: string) => void;
}

export function RoomEntry({ displayName, onNameChange, onJoin }: RoomEntryProps) {
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') ?? '';
  });

  function createRoom() {
    const code = Math.random().toString(36).substring(2, 8);
    if (!displayName.trim()) return;
    onJoin(code);
  }

  function joinRoom() {
    if (!displayName.trim() || !roomCode.trim()) return;
    onJoin(roomCode.trim());
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm animate-fade-up rounded-[var(--radius-lg)] border border-[var(--surface-border)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow)]">
        <h1 className="mb-6 text-center text-2xl font-bold text-[var(--text)]">DG-Chat</h1>
        <p className="mb-4 text-center text-sm text-[var(--text-soft)]">P2P 多人聊天 &amp; 远程控制</p>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-[var(--text-soft)]">你的昵称</label>
          <input
            type="text"
            value={displayName}
            onChange={e => onNameChange(e.target.value)}
            placeholder="输入昵称..."
            className="w-full rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors"
            style={{ fontSize: '16px' }}
          />
        </div>

        <button
          onClick={createRoom}
          disabled={!displayName.trim()}
          className="w-full rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--button-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          创建房间
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
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors"
            style={{ fontSize: '16px' }}
          />
          <button
            onClick={joinRoom}
            disabled={!displayName.trim() || !roomCode.trim()}
            className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[var(--button-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            加入
          </button>
        </div>
      </div>
    </div>
  );
}
