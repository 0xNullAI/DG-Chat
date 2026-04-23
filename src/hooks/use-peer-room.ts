import { useState, useCallback, useRef, useEffect } from 'react';
import { joinRoom, selfId, getRelaySockets, type Room } from '@trystero-p2p/mqtt';
import type { ChatMessage, DeviceCommand, MemberState, CmdAction } from '../lib/protocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionSender = (data: any, targetPeers?: string | string[]) => void;

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error';

export const DEFAULT_RELAYS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker-cn.emqx.io:8084/mqtt',
  'wss://public:public@public.cloud.shiftr.io',
];

export function usePeerRoom(displayName: string) {
  const [status, setStatus] = useState<RoomStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [members, setMembers] = useState<Map<string, MemberState>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const roomRef = useRef<Room | null>(null);
  const sendChatRef = useRef<ActionSender | null>(null);
  const sendCommandRef = useRef<ActionSender | null>(null);
  const sendStateRef = useRef<ActionSender | null>(null);
  const onCommandRef = useRef<((cmd: DeviceCommand, peerId: string) => void) | null>(null);

  const log = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    const entry = `[${time}] ${msg}`;
    console.log('[DG-Chat]', msg);
    setDebugLog(prev => [...prev.slice(-49), entry]);
  }, []);

  const setCommandHandler = useCallback((handler: (cmd: DeviceCommand, peerId: string) => void) => {
    onCommandRef.current = handler;
  }, []);

  const join = useCallback((roomCode: string, relayUrls?: string[]) => {
    if (roomRef.current) return;

    const relays = relayUrls && relayUrls.length > 0 ? relayUrls : DEFAULT_RELAYS;

    setStatus('connecting');
    setError(null);
    log(`My peer ID: ${selfId}`);
    log(`Joining room "${roomCode}" via ${relays.length} brokers...`);

    try {
      const room = joinRoom({
        appId: 'dg-chat-v1',
        relayUrls: relays,
        relayRedundancy: relays.length,
      }, roomCode);
      roomRef.current = room;
      setRoomId(roomCode);

      log('joinRoom() returned, setting up channels...');

      const [sendChat, onChat] = room.makeAction('chat');
      const [sendCmd, onCmd] = room.makeAction('cmd');
      const [sendState, onState] = room.makeAction('state');

      sendChatRef.current = sendChat;
      sendCommandRef.current = sendCmd;
      sendStateRef.current = sendState;

      room.onPeerJoin((peerId: string) => {
        log(`✅ Peer joined: ${peerId}`);
        setPeers(prev => [...prev, peerId]);
      });

      room.onPeerLeave((peerId: string) => {
        log(`❌ Peer left: ${peerId}`);
        setPeers(prev => prev.filter(p => p !== peerId));
        setMembers(prev => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      });

      onChat((data: unknown, peerId: string) => {
        const msg = data as ChatMessage;
        setMessages(prev => [...prev, { ...msg, sender: peerId }]);
      });

      onCmd((data: unknown, peerId: string) => {
        const cmd = data as DeviceCommand;
        onCommandRef.current?.(cmd, peerId);
      });

      onState((data: unknown, peerId: string) => {
        const state = data as MemberState;
        setMembers(prev => {
          const next = new Map(prev);
          next.set(peerId, { ...state, peerId });
          return next;
        });
      });

      setStatus('connected');
      log('Room joined, waiting for peers...');

      // Monitor broker connections
      setTimeout(() => {
        try {
          const sockets = getRelaySockets();
          const entries = Object.entries(sockets);
          log(`Broker connections: ${entries.length}`);
          entries.forEach(([url, socket]) => {
            const state = (socket as WebSocket)?.readyState;
            const stateStr = state === 1 ? '✅ OPEN' : state === 0 ? '⏳ CONNECTING' : state === 2 ? '⚠️ CLOSING' : '❌ CLOSED';
            log(`  ${url}: ${stateStr}`);
          });
          if (entries.length === 0) {
            log('⚠️ No broker sockets found — brokers may still be connecting');
          }
        } catch (e) {
          log(`getRelaySockets error: ${e}`);
        }
      }, 3000);

      // Direct MQTT pub/sub test — bypass Trystero to verify broker messaging works
      import('mqtt').then(({ default: mqtt }) => {
        const testTopic = `dg-chat-ping/${roomCode}`;
        const myId = selfId;
        log(`MQTT ping test: topic="${testTopic}", id=${myId.slice(0, 8)}...`);

        const client = mqtt.connect(relays[0]);
        client.on('connect', () => {
          log(`Ping test: connected to ${relays[0]}`);
          client.subscribe(testTopic, (err) => {
            if (err) { log(`Ping test: subscribe error: ${err.message}`); return; }
            log('Ping test: subscribed, publishing...');
            client.publish(testTopic, JSON.stringify({ id: myId, t: Date.now() }));
          });
        });
        client.on('message', (_topic: string, payload: Buffer) => {
          try {
            const data = JSON.parse(payload.toString());
            if (data.id === myId) {
              log('Ping test: ✅ received own message (broker echo works)');
            } else {
              log(`Ping test: ✅✅ received OTHER peer: ${data.id.slice(0, 8)}... — MQTT messaging works!`);
            }
          } catch { /* ignore */ }
        });
        client.on('error', (err: Error) => {
          log(`Ping test: ❌ error: ${err.message}`);
        });

        // Republish every 3s for 30s
        let count = 0;
        const interval = setInterval(() => {
          count++;
          if (count > 10 || !roomRef.current) {
            clearInterval(interval);
            client.end();
            if (count > 10) log('Ping test: stopped after 30s');
            return;
          }
          client.publish(testTopic, JSON.stringify({ id: myId, t: Date.now() }));
        }, 3000);
      }).catch(e => log(`MQTT import error: ${e}`));

    } catch (err) {
      console.error('Failed to join room:', err);
      const msg = err instanceof Error ? err.message : String(err);
      log(`❌ Join failed: ${msg}`);
      setStatus('error');
      setError(msg);
      roomRef.current = null;
    }
  }, [log]);

  const sendMessage = useCallback((text: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'self',
      senderName: displayName,
      text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, msg]);
    sendChatRef.current?.(msg);
  }, [displayName]);

  const sendCommand = useCallback((target: string, action: CmdAction, data?: string) => {
    const cmd: DeviceCommand = { target, action, data };
    sendCommandRef.current?.(cmd, target);
  }, []);

  const broadcastState = useCallback((state: MemberState) => {
    sendStateRef.current?.(state);
  }, []);

  const leave = useCallback(() => {
    roomRef.current?.leave();
    roomRef.current = null;
    sendChatRef.current = null;
    sendCommandRef.current = null;
    sendStateRef.current = null;
    setStatus('idle');
    setError(null);
    setRoomId(null);
    setPeers([]);
    setMembers(new Map());
    setMessages([]);
    setDebugLog([]);
  }, []);

  useEffect(() => {
    return () => {
      roomRef.current?.leave();
    };
  }, []);

  return {
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
