import { useState, useCallback, useRef, useEffect } from 'react';
import { joinRoom, type Room } from 'trystero/nostr';
import type { ChatMessage, DeviceCommand, MemberState, CmdAction } from '../lib/protocol';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionSender = (data: any, targetPeers?: string | string[]) => void;

export function usePeerRoom(displayName: string) {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [members, setMembers] = useState<Map<string, MemberState>>(new Map());
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const roomRef = useRef<Room | null>(null);
  const sendChatRef = useRef<ActionSender | null>(null);
  const sendCommandRef = useRef<ActionSender | null>(null);
  const sendStateRef = useRef<ActionSender | null>(null);
  const onCommandRef = useRef<((cmd: DeviceCommand, peerId: string) => void) | null>(null);

  // Allow external command handler registration
  const setCommandHandler = useCallback((handler: (cmd: DeviceCommand, peerId: string) => void) => {
    onCommandRef.current = handler;
  }, []);

  const join = useCallback((roomCode: string) => {
    if (roomRef.current) return;

    const room = joinRoom({ appId: 'dg-chat-v1' }, roomCode);
    roomRef.current = room;
    setRoomId(roomCode);
    setConnected(true);

    // 创建通信通道（使用 unknown 绕过 Trystero 的 DataPayload 索引签名约束）
    const [sendChat, onChat] = room.makeAction('chat');
    const [sendCmd, onCmd] = room.makeAction('cmd');
    const [sendState, onState] = room.makeAction('state');

    sendChatRef.current = sendChat;
    sendCommandRef.current = sendCmd;
    sendStateRef.current = sendState;

    // 监听成员加入
    room.onPeerJoin((peerId: string) => {
      setPeers(prev => [...prev, peerId]);
    });

    // 监听成员离开
    room.onPeerLeave((peerId: string) => {
      setPeers(prev => prev.filter(p => p !== peerId));
      setMembers(prev => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    });

    // 监听聊天消息
    onChat((data: unknown, peerId: string) => {
      const msg = data as ChatMessage;
      setMessages(prev => [...prev, { ...msg, sender: peerId }]);
    });

    // 监听控制指令
    onCmd((data: unknown, peerId: string) => {
      const cmd = data as DeviceCommand;
      onCommandRef.current?.(cmd, peerId);
    });

    // 监听成员状态
    onState((data: unknown, peerId: string) => {
      const state = data as MemberState;
      setMembers(prev => {
        const next = new Map(prev);
        next.set(peerId, { ...state, peerId });
        return next;
      });
    });
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
    setConnected(false);
    setRoomId(null);
    setPeers([]);
    setMembers(new Map());
    setMessages([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      roomRef.current?.leave();
    };
  }, []);

  return {
    connected,
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
