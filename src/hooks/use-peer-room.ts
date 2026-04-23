import { useState, useCallback, useRef, useEffect } from 'react';
import { joinRoom, type Room } from '@trystero-p2p/mqtt';
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

  const roomRef = useRef<Room | null>(null);
  const sendChatRef = useRef<ActionSender | null>(null);
  const sendCommandRef = useRef<ActionSender | null>(null);
  const sendStateRef = useRef<ActionSender | null>(null);
  const onCommandRef = useRef<((cmd: DeviceCommand, peerId: string) => void) | null>(null);

  const setCommandHandler = useCallback((handler: (cmd: DeviceCommand, peerId: string) => void) => {
    onCommandRef.current = handler;
  }, []);

  const join = useCallback((roomCode: string, relayUrls?: string[]) => {
    if (roomRef.current) return;

    const relays = relayUrls && relayUrls.length > 0 ? relayUrls : DEFAULT_RELAYS;

    setStatus('connecting');
    setError(null);

    try {
      const room = joinRoom({
        appId: 'dg-chat-v1',
        relayUrls: relays,
        relayRedundancy: relays.length,
      }, roomCode);
      roomRef.current = room;
      setRoomId(roomCode);

      const [sendChat, onChat] = room.makeAction('chat');
      const [sendCmd, onCmd] = room.makeAction('cmd');
      const [sendState, onState] = room.makeAction('state');

      sendChatRef.current = sendChat;
      sendCommandRef.current = sendCmd;
      sendStateRef.current = sendState;

      room.onPeerJoin((peerId: string) => {
        setPeers(prev => [...prev, peerId]);
      });

      room.onPeerLeave((peerId: string) => {
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
    } catch (err) {
      console.error('Failed to join room:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : '无法连接到信令服务器，请检查网络后重试');
      roomRef.current = null;
    }
  }, []);

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
    join,
    leave,
    sendMessage,
    sendCommand,
    broadcastState,
    setCommandHandler,
  };
}
