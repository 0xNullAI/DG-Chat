import { useState, useRef, useEffect } from 'react';
import { ArrowUp, Image as ImageIcon, Mic, X } from 'lucide-react';
import type { ChatMessage } from '../lib/protocol';
import { compressImage, startRecording, formatDuration, type Recorder } from '../lib/media';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  /** 上传并发送媒体（图片/语音）。房间未就绪时上层应忽略。 */
  onSendMedia: (blob: Blob, kind: 'image' | 'audio', meta?: { durationMs?: number; w?: number; h?: number }) => Promise<void>;
}

export function ChatPanel({ messages, onSend, onSendMedia }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [recElapsed, setRecElapsed] = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recStartRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 录音计时：开始时间记在 ref，interval 内计算已录时长。
  useEffect(() => {
    if (!recorder) return;
    const t = window.setInterval(() => setRecElapsed(Date.now() - recStartRef.current), 250);
    return () => clearInterval(t);
  }, [recorder]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  async function handlePickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { blob, w, h } = await compressImage(file);
      await onSendMedia(blob, 'image', { w, h });
    } catch (err) {
      console.error('[DG-Chat] image send failed', err);
    } finally {
      setBusy(false);
    }
  }

  async function startRec() {
    try {
      const rec = await startRecording();
      recStartRef.current = Date.now();
      setRecElapsed(0);
      setRecorder(rec);
    } catch (err) {
      console.error('[DG-Chat] mic access failed', err);
    }
  }

  async function stopRecAndSend() {
    if (!recorder) return;
    const rec = recorder;
    setRecorder(null);
    setBusy(true);
    try {
      const { blob, durationMs } = await rec.stop();
      if (blob.size > 0) await onSendMedia(blob, 'audio', { durationMs });
    } catch (err) {
      console.error('[DG-Chat] voice send failed', err);
    } finally {
      setBusy(false);
    }
  }

  function cancelRec() {
    recorder?.cancel();
    setRecorder(null);
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
          const hasMedia = !!msg.media;

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

                {msg.media?.kind === 'image' ? (
                  <button
                    onClick={() => setLightbox(msg.media!.url)}
                    className="block overflow-hidden rounded-[14px] border border-[var(--surface-border)]"
                  >
                    <img
                      src={msg.media.url}
                      alt="图片"
                      loading="lazy"
                      className="max-h-60 max-w-full object-cover"
                    />
                  </button>
                ) : msg.media?.kind === 'audio' ? (
                  <div
                    className={
                      isSelf
                        ? 'rounded-[14px] rounded-br-[4px] bg-[var(--accent)] px-3 py-2'
                        : 'rounded-[14px] rounded-bl-[4px] border border-[var(--surface-border)] bg-[var(--bg-elevated)] px-3 py-2'
                    }
                  >
                    <audio controls src={msg.media.url} className="max-w-[220px]" />
                    {msg.media.durationMs != null && (
                      <p className={`mt-0.5 text-[10px] ${isSelf ? 'text-[var(--button-text)]' : 'text-[var(--text-faint)]'}`}>
                        语音 {formatDuration(msg.media.durationMs)}
                      </p>
                    )}
                  </div>
                ) : null}

                {(!hasMedia || msg.text) && (
                  <div
                    className={
                      `${hasMedia ? 'mt-1 ' : ''}` +
                      (isSelf
                        ? 'rounded-[14px] rounded-br-[4px] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--button-text)]'
                        : 'rounded-[14px] rounded-bl-[4px] border border-[var(--surface-border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]')
                    }
                  >
                    {msg.text}
                  </div>
                )}

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
        {recorder ? (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelRec}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-soft)] hover:text-[var(--danger)] transition-colors"
              title="取消录音"
            >
              <X size={20} />
            </button>
            <div className="flex flex-1 items-center gap-2 text-sm text-[var(--danger)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--danger)]" />
              录音中 {formatDuration(recElapsed)}
            </div>
            <button
              onClick={stopRecAndSend}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--button-text)] transition-opacity hover:opacity-90"
              title="结束并发送"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handlePickImage}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-soft)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
              title="发送图片"
            >
              <ImageIcon size={20} />
            </button>
            <button
              onClick={startRec}
              disabled={busy}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-soft)] hover:text-[var(--accent)] transition-colors disabled:opacity-40"
              title="发送语音"
            >
              <Mic size={20} />
            </button>
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={busy ? '发送中...' : '输入消息...'}
              disabled={busy}
              className="flex-1 rounded-[var(--radius-sm)] border border-[var(--surface-border)] bg-[var(--bg)] px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-60"
              style={{ fontSize: '16px' }}
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || busy}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--button-text)] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp size={20} />
            </button>
          </div>
        )}
      </div>

      {/* 图片放大 */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <img src={lightbox} alt="图片" className="max-h-full max-w-full rounded-[var(--radius-sm)]" />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
          >
            <X size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
