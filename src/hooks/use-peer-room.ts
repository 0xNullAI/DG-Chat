import { useState, useCallback, useRef, useEffect } from 'react';
import mqtt from 'mqtt';
import type {
  ChatMessage,
  DeviceCommand,
  MemberState,
  CmdAction,
  WaveformTransfer,
  StateFast,
  StateSlow,
} from '../lib/protocol';

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error';

export const DEFAULT_RELAYS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker-cn.emqx.io:8084/mqtt',
  'wss://public:public@public.cloud.shiftr.io',
];

const PRESENCE_INTERVAL_MS = 3000;
const PRESENCE_TIMEOUT_MS = 10000;
const FAST_THROTTLE_MS = 200;
const SEEN_MSG_MAX = 1000;

/** 8 字符随机 ID（替代 36 字符 UUID，dedup 用）。 */
function shortId(): string {
  const arr = crypto.getRandomValues(new Uint8Array(6));
  let s = '';
  for (let i = 0; i < 6; i++) s += arr[i].toString(36).padStart(2, '0').slice(-1);
  return s + crypto.getRandomValues(new Uint8Array(1))[0].toString(36).padStart(2, '0');
}

function generatePeerId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  const arr = crypto.getRandomValues(new Uint8Array(20));
  for (let i = 0; i < 20; i++) id += chars[arr[i] % 62];
  return id;
}

const selfId = generatePeerId();

/** Actions 中需要可靠送达的（QoS 1）。adjust_strength 走 QoS 0：高频，最新覆盖前者。 */
const RELIABLE_ACTIONS = new Set<CmdAction>([
  'change_wave', 'start', 'stop', 'stop_wave',
  'fire', 'fire_stop', 'burst',
  'vibrate', 'alert', 'bg', 'shake', 'beep',
]);

export function usePeerRoom(displayName: string) {
  const [status, setStatus] = useState<RoomStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [members, setMembers] = useState<Map<string, MemberState>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const clientsRef = useRef<mqtt.MqttClient[]>([]);
  const roomIdRef = useRef<string | null>(null);
  const onCommandRef = useRef<((cmd: DeviceCommand, peerId: string) => void) | null>(null);
  const onWaveformRef = useRef<((transfer: WaveformTransfer, peerId: string) => void) | null>(null);
  const presenceTimerRef = useRef<number | null>(null);
  const peerTimersRef = useRef<Map<string, number>>(new Map());
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const seenMsgsRef = useRef<Set<string>>(new Set());

  // Fast-state 节流器（leading + trailing）
  const fastThrottleRef = useRef<{ lastSent: number; pending: StateFast | null; timer: number | null }>({
    lastSent: 0, pending: null, timer: null,
  });

  const setCommandHandler = useCallback((handler: (cmd: DeviceCommand, peerId: string) => void) => {
    onCommandRef.current = handler;
  }, []);

  const setWaveformHandler = useCallback((handler: (transfer: WaveformTransfer, peerId: string) => void) => {
    onWaveformRef.current = handler;
  }, []);

  const removePeer = useCallback((peerId: string) => {
    setPeers(prev => prev.filter(p => p !== peerId));
    setMembers(prev => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    const timer = peerTimersRef.current.get(peerId);
    if (timer) clearTimeout(timer);
    peerTimersRef.current.delete(peerId);
  }, []);

  const publishAll = useCallback((topic: string, payload: string, qos: 0 | 1 = 0) => {
    for (const client of clientsRef.current) {
      if (client.connected) client.publish(topic, payload, { qos });
    }
  }, []);

  const join = useCallback((roomCode: string, relayUrls?: string[]) => {
    if (clientsRef.current.length > 0) return;
    const relays = relayUrls && relayUrls.length > 0 ? relayUrls : DEFAULT_RELAYS;

    setStatus('connecting');
    setError(null);
    roomIdRef.current = roomCode;
    console.log('[DG-Chat] join', roomCode, 'as', selfId);

    const base = `dg-chat/r/${roomCode}`;
    const t = {
      presence: `${base}/presence`,
      chat:     `${base}/chat`,
      cmdSelf:  `${base}/cmd/${selfId}`,
      waveSelf: `${base}/wave/${selfId}`,
      stateFast: `${base}/sf`,
      stateSlow: `${base}/ss`,
      leave:    `${base}/leave`,
    };

    let anyConnected = false;
    const allClients: mqtt.MqttClient[] = [];

    function isDuplicate(id: string): boolean {
      if (seenMsgsRef.current.has(id)) return true;
      seenMsgsRef.current.add(id);
      if (seenMsgsRef.current.size > SEEN_MSG_MAX) {
        const first = seenMsgsRef.current.values().next().value;
        if (first) seenMsgsRef.current.delete(first);
      }
      return false;
    }

    function touchPeer(peerId: string, name?: string) {
      setPeers(prev => prev.includes(peerId) ? prev : [...prev, peerId]);
      const existing = peerTimersRef.current.get(peerId);
      if (existing) clearTimeout(existing);
      peerTimersRef.current.set(peerId, window.setTimeout(() => {
        console.log('[DG-Chat] peer timeout', peerId.slice(0, 8));
        removePeer(peerId);
      }, PRESENCE_TIMEOUT_MS));
      if (name) {
        setMembers(prev => {
          const cur = prev.get(peerId);
          if (cur && cur.displayName === name) return prev;
          const next = new Map(prev);
          next.set(peerId, { ...(cur ?? emptyMember(peerId)), displayName: name });
          return next;
        });
      }
    }

    for (const url of relays) {
      const client = mqtt.connect(url, {
        clientId: `dg-${selfId.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 5000,
      });
      allClients.push(client);

      client.on('connect', () => {
        const subs = [t.presence, t.chat, t.cmdSelf, t.waveSelf, t.stateFast, t.stateSlow, t.leave];
        client.subscribe(subs, { qos: 1 }, (err) => {
          if (err) { console.warn('[DG-Chat] subscribe', url, err.message); return; }

          if (!anyConnected) {
            anyConnected = true;
            clientsRef.current = allClients;
            setRoomId(roomCode);
            setStatus('connected');

            presenceTimerRef.current = window.setInterval(() => {
              publishAll(t.presence, JSON.stringify({
                _from: selfId, _id: shortId(), n: displayNameRef.current,
              }));
            }, PRESENCE_INTERVAL_MS);
          }

          client.publish(t.presence, JSON.stringify({
            _from: selfId, _id: shortId(), n: displayNameRef.current,
          }), { qos: 0 });
        });

        client.on('message', (topic: string, payload: Buffer) => {
          let data: Record<string, unknown>;
          try { data = JSON.parse(payload.toString()); } catch { return; }
          const from = data._from as string;
          if (!from || from === selfId) return;
          const id = data._id as string | undefined;
          if (id && isDuplicate(id)) return;

          if (topic === t.presence) {
            touchPeer(from, data.n as string | undefined);
          } else if (topic === t.chat) {
            setMessages(prev => [...prev, {
              id: id ?? shortId(),
              fromSelf: false,
              senderId: from,
              senderName: (data.n as string) ?? from.slice(0, 6),
              text: (data.x as string) ?? '',
              timestamp: (data.t as number) ?? Date.now(),
            }]);
          } else if (topic === t.cmdSelf) {
            onCommandRef.current?.({
              action: data.a as CmdAction,
              c: data.c as 'A' | 'B' | undefined,
              v: data.v as number | undefined,
              w: data.w as string | undefined,
              d: data.d as string | undefined,
            }, from);
          } else if (topic === t.waveSelf) {
            onWaveformRef.current?.({
              wid: data.wid as string,
              wn: data.wn as string,
              fr: data.fr as [number, number][],
            }, from);
          } else if (topic === t.stateFast) {
            touchPeer(from);
            setMembers(prev => {
              const cur = prev.get(from) ?? emptyMember(from);
              const next = new Map(prev);
              next.set(from, {
                ...cur,
                strengthA: (data.sa as number) ?? cur.strengthA,
                strengthB: (data.sb as number) ?? cur.strengthB,
                waveA: (data.wa as string | null) ?? null,
                waveB: (data.wb as string | null) ?? null,
              });
              return next;
            });
          } else if (topic === t.stateSlow) {
            touchPeer(from);
            setMembers(prev => {
              const cur = prev.get(from) ?? emptyMember(from);
              const next = new Map(prev);
              next.set(from, {
                ...cur,
                displayName: (data.n as string) ?? cur.displayName,
                deviceConnected: (data.dc as boolean) ?? cur.deviceConnected,
                battery: (data.b as number | null) ?? null,
                waveformCatalog: (data.cat as MemberState['waveformCatalog']) ?? cur.waveformCatalog,
              });
              return next;
            });
          } else if (topic === t.leave) {
            removePeer(from);
          }
        });
      });

      client.on('error', (err: Error) => console.warn('[DG-Chat] err', url, err.message));
      client.on('offline',   () => console.warn('[DG-Chat] offline', url));
    }

    setTimeout(() => {
      if (!anyConnected) {
        setStatus('error');
        setError('无法连接到任何信令服务器');
        allClients.forEach(c => c.end(true));
      }
    }, 12000);
  }, [removePeer, publishAll]);

  const sendMessage = useCallback((text: string) => {
    const id = shortId();
    const now = Date.now();
    const name = displayNameRef.current;

    setMessages(prev => [...prev, {
      id, fromSelf: true, senderId: selfId, senderName: name, text, timestamp: now,
    }]);

    const room = roomIdRef.current;
    if (room) {
      publishAll(`dg-chat/r/${room}/chat`, JSON.stringify({
        _from: selfId, _id: id, n: name, x: text, t: now,
      }), 1);
    }
  }, [publishAll]);

  const sendCommand = useCallback((target: string, action: CmdAction, params?: Omit<DeviceCommand, 'action'>) => {
    const room = roomIdRef.current;
    if (!room) return;
    const qos: 0 | 1 = RELIABLE_ACTIONS.has(action) ? 1 : 0;
    publishAll(`dg-chat/r/${room}/cmd/${target}`, JSON.stringify({
      _from: selfId, _id: shortId(), a: action, ...params,
    }), qos);
  }, [publishAll]);

  const sendWaveform = useCallback((targetPeerId: string, transfer: WaveformTransfer) => {
    const room = roomIdRef.current;
    if (!room) return;
    publishAll(`dg-chat/r/${room}/wave/${targetPeerId}`, JSON.stringify({
      _from: selfId, _id: shortId(),
      wid: transfer.wid, wn: transfer.wn, fr: transfer.fr,
    }), 1);
  }, [publishAll]);

  /** 高频状态广播：变化时立即发，节流 200ms。 */
  const broadcastStateFast = useCallback((s: StateFast) => {
    const room = roomIdRef.current;
    if (!room) return;
    const send = (state: StateFast) => {
      publishAll(`dg-chat/r/${room}/sf`, JSON.stringify({
        _from: selfId, _id: shortId(),
        sa: state.strengthA, sb: state.strengthB, wa: state.waveA, wb: state.waveB,
      }), 0);
    };
    const ref = fastThrottleRef.current;
    const now = Date.now();
    const elapsed = now - ref.lastSent;
    if (elapsed >= FAST_THROTTLE_MS) {
      ref.lastSent = now;
      ref.pending = null;
      send(s);
    } else {
      ref.pending = s;
      if (ref.timer == null) {
        ref.timer = window.setTimeout(() => {
          ref.timer = null;
          if (ref.pending) {
            ref.lastSent = Date.now();
            const p = ref.pending;
            ref.pending = null;
            send(p);
          }
        }, FAST_THROTTLE_MS - elapsed);
      }
    }
  }, [publishAll]);

  /** 低频状态广播：5 秒心跳 + catalog 变化时调用一次。 */
  const broadcastStateSlow = useCallback((s: StateSlow) => {
    const room = roomIdRef.current;
    if (!room) return;
    publishAll(`dg-chat/r/${room}/ss`, JSON.stringify({
      _from: selfId,
      n: s.displayName, dc: s.deviceConnected, b: s.battery,
      ...(s.waveformCatalog ? { cat: s.waveformCatalog } : {}),
    }), 0);
  }, [publishAll]);

  const leave = useCallback(() => {
    const room = roomIdRef.current;
    if (room) {
      publishAll(`dg-chat/r/${room}/leave`, JSON.stringify({
        _from: selfId, _id: shortId(),
      }), 1);
    }

    if (presenceTimerRef.current) { clearInterval(presenceTimerRef.current); presenceTimerRef.current = null; }
    peerTimersRef.current.forEach(timer => clearTimeout(timer));
    peerTimersRef.current.clear();
    if (fastThrottleRef.current.timer) {
      clearTimeout(fastThrottleRef.current.timer);
      fastThrottleRef.current = { lastSent: 0, pending: null, timer: null };
    }

    clientsRef.current.forEach(c => c.end(true));
    clientsRef.current = [];
    roomIdRef.current = null;
    seenMsgsRef.current.clear();
    setStatus('idle');
    setError(null);
    setRoomId(null);
    setPeers([]);
    setMembers(new Map());
    setMessages([]);
  }, [publishAll]);

  useEffect(() => {
    const timers = peerTimersRef.current;
    return () => {
      if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
      timers.forEach(timer => clearTimeout(timer));
      const room = roomIdRef.current;
      if (room) {
        for (const client of clientsRef.current) {
          if (client.connected) {
            client.publish(`dg-chat/r/${room}/leave`, JSON.stringify({ _from: selfId }));
          }
        }
      }
      clientsRef.current.forEach(c => c.end(true));
    };
  }, []);

  return {
    selfId,
    status,
    connected: status === 'connected',
    error,
    roomId,
    peers,
    members,
    messages,
    join,
    leave,
    sendMessage,
    sendCommand,
    sendWaveform,
    broadcastStateFast,
    broadcastStateSlow,
    setCommandHandler,
    setWaveformHandler,
  };
}

function emptyMember(peerId: string): MemberState {
  return {
    peerId,
    displayName: '',
    deviceConnected: false,
    strengthA: 0,
    strengthB: 0,
    waveA: null,
    waveB: null,
    battery: null,
  };
}
