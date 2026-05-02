import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import type { ChatMessage } from '../lib/protocol';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-[var(--text-faint)]">
            <span className="text-3xl">💬</span>
            <p className="text-sm">还没有消息</p>
            <p className="text-xs">发送第一条消息开始聊天吧</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isSelf = msg.fromSelf;
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const sameSender = prevMsg?.senderId === msg.senderId;
          const closeInTime = prevMsg && (msg.timestamp - prevMsg.timestamp) < 60000;
          const grouped = sameSender && closeInTime;

          return (
            <div
              key={msg.id}
              className={`${grouped ? 'mb-0.5' : 'mb-2'} flex animate-msg-in ${isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div className="max-w-[75%]">
                {!isSelf && !grouped && (
                  <p className="mb-0.5 px-1 text-xs text-[var(--text-faint)]">
                    {msg.senderName || msg.senderId.slice(0, 6)}
                  </p>
                )}
                <div
                  className={
                    isSelf
                      ? 'rounded-[14px] rounded-br-[4px] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--button-text)]'
                      : 'rounded-[14px] rounded-bl-[4px] border border-[var(--surface-border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]'
                  }
                >
                  {msg.text}
                </div>
                {!grouped && (
                  <p
                    className={`mt-0.5 px-1 text-[10px] text-[var(--text-faint)] ${
                      isSelf ? 'text-right' : 'text-left'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-[var(--surface-border)] bg-[var(--bg-elevated)] px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors"
            style={{ fontSize: '16px' }}
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--button-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
