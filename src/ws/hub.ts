import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { redis, createSubscriber } from '../db/redis';

type Client = WebSocket & { subs?: Set<number> };

const clients = new Set<Client>();

const CHANNEL = 'relay:broadcast';

export function attachWs(server: Server): void {
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws: Client) => {
    ws.subs = new Set();
    clients.add(ws);
    ws.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.type === 'subscribe' && Array.isArray(m.conversationIds)) {
          ws.subs = new Set(m.conversationIds.map(Number));
        } else if (m.type === 'typing' && m.conversationId != null) {
          publish(Number(m.conversationId), {
            type: 'typing',
            conversationId: Number(m.conversationId),
            userId: Number(m.userId),
            name: m.name ? String(m.name) : null,
          });
        }
      } catch (e) {
        console.error('set/publish error', e)
      }
    });
    ws.on('close', () => clients.delete(ws));
  });

  const sub = createSubscriber();
  sub.subscribe(CHANNEL);
  sub.on('message', (_channel, raw) => {
    try {
      const { conversationId, payload } = JSON.parse(raw);
      sendLocal(conversationId, payload);
    } catch (e){
      console.error('sendLocal errjr', e)
    }
  });
}


export function broadcast(conversationId: number, payload: unknown): void {
  publish(conversationId, payload);
}

function publish(conversationId: number, payload: unknown): void {
  redis.publish(CHANNEL, JSON.stringify({ conversationId, payload }));
}

function sendLocal(conversationId: number, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.subs?.has(conversationId) && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}
