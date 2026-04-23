import { useState, useCallback, useRef, useEffect } from 'react';
import mqtt from 'mqtt';
import type { ChatMessage, DeviceCommand, MemberState, CmdAction } from '../lib/protocol';

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error';

export const DEFAULT_RELAYS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker-cn.emqx.io:8084/mqtt',
  'wss://public:public@public.cloud.shiftr.io',
];

const PRESENCE_INTERVAL_MS = 3000;
const PRESENCE_TIMEOUT_MS = 10000;
const SEEN_MSG_MAX = 200;

function generatePeerId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  const arr = crypto.getRandomValues(new Uint8Array(20));
  for (let i = 0; i < 20; i++) id += chars[arr[i] % 62];
  return id;
}

const selfId = generatePeerId();

export function usePeerRoom(displayName: string) {
  const [status, setStatus] = useState<RoomStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [members, setMembers] = useState<Map<string, MemberState>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const clientsRef = useRef<mqtt.MqttClient[]>([]);
  const roomIdRef = useRef<string | null>(null);
  const onCommandRef = useRef<((cmd: DeviceCommand, peerId: string) => void) | null>(null);
  const presenceTimerRef = useRef<number | null>(null);
  const peerTimersRef = useRef<Map<string, number>>(new Map());
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const seenMsgsRef = useRef<Set<string>>(new Set());

  const log = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    console.log('[DG-Chat]', msg);
    setDebugLog(prev => [...prev.slice(-49), entry]);
  }, []);

  const setCommandHandler = useCallback((handler: (cmd: DeviceCommand, peerId: string) => void) => {
    onCommandRef.current = handler;
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

  /** Publish to ALL connected brokers for redundancy */
  const publishAll = useCallback((topic: string, payload: string, qos: 0 | 1 = 0) => {
    for (const client of clientsRef.current) {
      if (client.connected) {
        client.publish(topic, payload, { qos });
      }
    }
  }, []);

  const join = useCallback((roomCode: string, relayUrls?: string[]) => {
    if (clientsRef.current.length > 0) return;

    const relays = relayUrls && relayUrls.length > 0 ? relayUrls : DEFAULT_RELAYS;

    setStatus('connecting');
    setError(null);
    roomIdRef.current = roomCode;
    log(`My peer ID: ${selfId}`);
    log(`Joining room "${roomCode}" via ${relays.length} brokers...`);

    const topicBase = `dg-chat/r/${roomCode}`;
    const topics = {
      presence: `${topicBase}/presence`,
      chat: `${topicBase}/chat`,
      cmdSelf: `${topicBase}/cmd/${selfId}`,
      state: `${topicBase}/state`,
      leave: `${topicBase}/leave`,
    };

    let anyConnected = false;
    const allClients: mqtt.MqttClient[] = [];

    function isDuplicate(msgId: string): boolean {
      if (seenMsgsRef.current.has(msgId)) return true;
      seenMsgsRef.current.add(msgId);
      if (seenMsgsRef.current.size > SEEN_MSG_MAX) {
        const first = seenMsgsRef.current.values().next().value;
        if (first) seenMsgsRef.current.delete(first);
      }
      return false;
    }

    function handlePresence(peerId: string, data: Record<string, unknown>) {
      setPeers(prev => {
        if (prev.includes(peerId)) return prev;
        log(`✅ Peer joined: ${peerId.slice(0, 8)}... (${data.displayName ?? 'unknown'})`);
        return [...prev, peerId];
      });

      const existing = peerTimersRef.current.get(peerId);
      if (existing) clearTimeout(existing);
      peerTimersRef.current.set(peerId, window.setTimeout(() => {
        log(`❌ Peer timeout: ${peerId.slice(0, 8)}...`);
        removePeer(peerId);
      }, PRESENCE_TIMEOUT_MS));
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
        log(`✅ Connected to ${url}`);

        const subTopics = [topics.presence, topics.chat, topics.cmdSelf, topics.state, topics.leave];
        client.subscribe(subTopics, { qos: 1 }, (err) => {
          if (err) {
            log(`❌ Subscribe error on ${url}: ${err.message}`);
            return;
          }
          log(`✅ Subscribed on ${url}`);

          if (!anyConnected) {
            anyConnected = true;
            clientsRef.current = allClients;
            setRoomId(roomCode);
            setStatus('connected');

            // Start presence heartbeat
            presenceTimerRef.current = window.setInterval(() => {
              publishAll(topics.presence, JSON.stringify({
                _from: selfId,
                _id: crypto.randomUUID(),
                displayName: displayNameRef.current,
                t: Date.now(),
              }));
            }, PRESENCE_INTERVAL_MS);
          }

          // Send presence on this broker
          client.publish(topics.presence, JSON.stringify({
            _from: selfId,
            _id: crypto.randomUUID(),
            displayName: displayNameRef.current,
            t: Date.now(),
          }), { qos: 0 });
        });

        // Handle incoming messages (deduplication across brokers)
        client.on('message', (_topic: string, payload: Buffer) => {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(payload.toString());
          } catch {
            return;
          }
          const from = data._from as string;
          if (!from || from === selfId) return;

          // Deduplicate messages received from multiple brokers
          const msgId = data._id as string;
          if (msgId && isDuplicate(msgId)) return;

          if (_topic === topics.presence) {
            handlePresence(from, data);
          } else if (_topic === topics.chat) {
            const msg = data as unknown as ChatMessage;
            setMessages(prev => [...prev, { ...msg, sender: from }]);
          } else if (_topic === topics.cmdSelf) {
            const cmd = data as unknown as DeviceCommand;
            onCommandRef.current?.(cmd, from);
          } else if (_topic === topics.state) {
            const state = data as unknown as MemberState;
            setMembers(prev => {
              const next = new Map(prev);
              next.set(from, { ...state, peerId: from });
              return next;
            });
          } else if (_topic === topics.leave) {
            log(`❌ Peer left: ${from.slice(0, 8)}...`);
            removePeer(from);
          }
        });
      });

      client.on('error', (err: Error) => {
        log(`❌ ${url}: ${err.message}`);
      });

      client.on('offline', () => {
        log(`⚠️ ${url} offline`);
      });
    }

    // Overall timeout
    setTimeout(() => {
      if (!anyConnected) {
        log('❌ Failed to connect to any broker');
        setStatus('error');
        setError('无法连接到任何信令服务器');
        allClients.forEach(c => c.end(true));
      }
    }, 12000);
  }, [log, removePeer, publishAll]);

  const sendMessage = useCallback((text: string) => {
    const msgId = crypto.randomUUID();
    const msg: ChatMessage = {
      id: msgId,
      sender: 'self',
      senderName: displayName,
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, msg]);

    const roomCode = roomIdRef.current;
    if (roomCode) {
      publishAll(`dg-chat/r/${roomCode}/chat`, JSON.stringify({
        ...msg,
        _from: selfId,
        _id: msgId,
      }), 1);
    }
  }, [displayName, publishAll]);

  const sendCommand = useCallback((target: string, action: CmdAction, data?: string) => {
    const cmd: DeviceCommand = { target, action, data };
    const roomCode = roomIdRef.current;
    if (roomCode) {
      publishAll(`dg-chat/r/${roomCode}/cmd/${target}`, JSON.stringify({
        ...cmd,
        _from: selfId,
        _id: crypto.randomUUID(),
      }), 1);
    }
  }, [publishAll]);

  const broadcastState = useCallback((state: MemberState) => {
    const roomCode = roomIdRef.current;
    if (roomCode) {
      publishAll(`dg-chat/r/${roomCode}/state`, JSON.stringify({
        ...state,
        _from: selfId,
      }));
    }
  }, [publishAll]);

  const leave = useCallback(() => {
    const roomCode = roomIdRef.current;
    if (roomCode) {
      publishAll(`dg-chat/r/${roomCode}/leave`, JSON.stringify({
        _from: selfId,
        _id: crypto.randomUUID(),
      }), 1);
    }

    if (presenceTimerRef.current) {
      clearInterval(presenceTimerRef.current);
      presenceTimerRef.current = null;
    }
    peerTimersRef.current.forEach(timer => clearTimeout(timer));
    peerTimersRef.current.clear();

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
    setDebugLog([]);
  }, [publishAll]);

  useEffect(() => {
    return () => {
      if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
      peerTimersRef.current.forEach(timer => clearTimeout(timer));
      const roomCode = roomIdRef.current;
      if (roomCode) {
        for (const client of clientsRef.current) {
          if (client.connected) {
            client.publish(`dg-chat/r/${roomCode}/leave`, JSON.stringify({ _from: selfId }));
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
    debugLog,
    join,
    leave,
    sendMessage,
    sendCommand,
    broadcastState,
    setCommandHandler,
  };
}
