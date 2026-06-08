// LobbyDO：单例（idFromName("v1")）。公开房间注册表 + 实时推送。
// RoomDO 在成员进出 / 保活时 POST /update 上报；大厅页通过 /ws/lobby 实时订阅、/api/lobby/rooms 取快照。
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

/** 超过该时长未保活的房间视为下线（兜底，正常由 RoomDO count=0 主动移除）。 */
const LOBBY_STALE_MS = 45 * 1000;

interface LobbyRoom {
  code: string;
  name: string;
  count: number;
}

export class LobbyDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, name TEXT, count INTEGER, ts INTEGER)',
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws/lobby') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(JSON.stringify(this.snapshot()));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === '/api/lobby/rooms') {
      return Response.json(this.snapshot());
    }

    // 来自 RoomDO 的上报。
    if (url.pathname.endsWith('/update') && request.method === 'POST') {
      const { code, name, count } = (await request.json()) as LobbyRoom;
      if (count > 0) {
        this.sql.exec(
          'INSERT OR REPLACE INTO rooms (code, name, count, ts) VALUES (?, ?, ?, ?)',
          code,
          name ?? '',
          count,
          Date.now(),
        );
      } else {
        this.sql.exec('DELETE FROM rooms WHERE code = ?', code);
      }
      this.broadcast();
      await this.ctx.storage.setAlarm(Date.now() + LOBBY_STALE_MS);
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  }

  async webSocketClose(): Promise<void> {
    // 大厅订阅者断开无需特殊处理（Hibernation 自动回收）。
  }

  async alarm(): Promise<void> {
    // 清理过期房间（兜底），有变化则推送；仍有房间则继续排程。
    const cutoff = Date.now() - LOBBY_STALE_MS;
    const before = this.count();
    this.sql.exec('DELETE FROM rooms WHERE ts < ?', cutoff);
    if (this.count() !== before) this.broadcast();
    if (this.count() > 0) await this.ctx.storage.setAlarm(Date.now() + LOBBY_STALE_MS);
  }

  // —— 内部 ——

  private count(): number {
    const row = this.sql.exec('SELECT COUNT(*) AS n FROM rooms').one();
    return Number(row.n);
  }

  private snapshot(): { t: 'lobby'; rooms: LobbyRoom[] } {
    const cutoff = Date.now() - LOBBY_STALE_MS;
    const rows = this.sql
      .exec('SELECT code, name, count FROM rooms WHERE ts >= ? ORDER BY count DESC, name ASC', cutoff)
      .toArray();
    return {
      t: 'lobby',
      rooms: rows.map(r => ({ code: r.code as string, name: r.name as string, count: Number(r.count) })),
    };
  }

  private broadcast(): void {
    const data = JSON.stringify(this.snapshot());
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* ignore */
      }
    }
  }
}
