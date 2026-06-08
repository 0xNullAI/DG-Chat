// DG-Chat WebSocket wire 协议。
// 原 MQTT 用 topic 区分消息类型，现折叠进单条 WS 消息的 `t` 字段，由 RoomDO 路由。
// 该文件为纯类型 + 常量，无运行时依赖，可被 Worker 与（参照）前端共用。

/** 房间内消息类型。 */
export type WireType =
  | 'hello' // client→DO，加入首帧：声明昵称 / 是否公开 / 房间名
  | 'chat' // 聊天消息（持久化进历史，含可选 media 引用）
  | 'sf' // state.fast：强度/波形/开火，广播
  | 'ss' // state.slow：名字/电量/队列/目录，广播
  | 'presence' // 昵称心跳（轻量，广播）
  | 'cmd' // 设备命令，定向（to=peerId）
  | 'wave' // 波形传输，定向（to=peerId）
  | 'leave' // 主动离开
  | 'history' // DO→client：新人加入回放
  | 'sys'; // DO→client：连接级 presence（joined/left）

/** 媒体引用（图片/语音）。实体存 R2，消息只带引用。 */
export interface MediaRef {
  kind: 'image' | 'audio';
  /** R2 object id（不含房间前缀与扩展名由 mime 推断）。 */
  id: string;
  mime: string;
  size: number;
  /** 语音时长（毫秒），图片可带宽高。 */
  durationMs?: number;
  w?: number;
  h?: number;
}

/** 持久化的聊天消息（DO SQLite 行 ↔ history 回放 ↔ chat 广播体）。
 *  注意：`t` 是信封的消息类型（'chat'），时间戳用 `ts`，二者不可混用。 */
export interface WireChat {
  /** 消息类型标记（广播体里恒为 'chat'）。 */
  t?: 'chat';
  id: string;
  /** 发送者 peerId（DO 注入，可信）。 */
  _from?: string;
  /** 发送者昵称快照。 */
  n: string;
  /** 文本正文（媒体消息可为空）。 */
  x?: string;
  /** 媒体引用。 */
  m?: MediaRef;
  /** 发送时间戳（毫秒）。 */
  ts: number;
}

/** 客户端发往 DO 的信封（除 hello 外，业务字段扁平在顶层）。 */
export interface WireInbound {
  t: WireType;
  /** 定向消息的目标 peerId（cmd/wave）。 */
  to?: string;
  /** 任意业务字段（chat 的 x/m、sf/ss 的状态字段、cmd 的 a/c/v…）。 */
  [k: string]: unknown;
}

/** DO 发往客户端的 sys 帧。 */
export interface WireSys {
  t: 'sys';
  kind: 'joined' | 'left';
  peerId: string;
}

/** DO 发往客户端的 history 帧。 */
export interface WireHistory {
  t: 'history';
  messages: WireChat[];
}

/** 单例大厅 DO 的固定名字。 */
export const LOBBY_NAME = 'v1';

/** 房间空置后清理的宽限期（毫秒）。 */
export const ROOM_GRACE_MS = 10 * 60 * 1000;

/** 上传媒体大小上限（字节）。 */
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** 允许的媒体 MIME 前缀。 */
export const ALLOWED_MEDIA_PREFIXES = ['image/', 'audio/'];
