import "dotenv/config";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { TICK_RATE } from "../src/shared/constants.js";
import {
  encodeError,
  encodePong,
  encodeState,
  encodeWelcome,
  Op,
  parseInput,
  parseJoin,
  parsePing,
  type PlayerSnapshot,
} from "../src/shared/protocol.js";
import {
  createPlayer,
  DEFAULT_PLATFORMS,
  type Platform,
  snapshot,
  stepPlayer,
  type SimPlayer,
} from "./game.js";

const PORT = Number(process.env.PORT) || 3001;

type ClientRole = "host" | "controller";

type Attached = {
  role: ClientRole;
  roomId: string;
  playerId?: number;
};

const rooms = new Map<
  string,
  {
    host: WebSocket | null;
    controllers: Map<WebSocket, number>;
    players: Map<number, SimPlayer>;
    nextPlayerId: number;
    tick: number;
    platforms: Platform[];
  }
>();

function setTcpNoDelay(ws: WebSocket): void {
  const sock = (ws as unknown as { _socket?: { setNoDelay?: (v: boolean) => void } })._socket;
  sock?.setNoDelay?.(true);
}

function getAttached(ws: WebSocket): Attached | undefined {
  return (ws as unknown as { __jb?: Attached }).__jb;
}

function setAttached(ws: WebSocket, a: Attached): void {
  (ws as unknown as { __jb: Attached }).__jb = a;
}

function destroyRoom(roomId: string): void {
  const r = rooms.get(roomId);
  if (!r) return;
  for (const ws of r.controllers.keys()) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  if (r.host) {
    try {
      r.host.close();
    } catch {
      /* ignore */
    }
  }
  rooms.delete(roomId);
}

function bufferToArrayBuffer(data: Buffer): ArrayBuffer {
  const u8 = new Uint8Array(data.byteLength);
  u8.set(data);
  return u8.buffer;
}

function broadcastState(roomId: string): void {
  const r = rooms.get(roomId);
  if (!r || !r.host || r.host.readyState !== 1) return;
  const list: PlayerSnapshot[] = [];
  for (const p of r.players.values()) list.push(snapshot(p));
  const buf = encodeState(r.tick, list);
  try {
    r.host.send(buf);
  } catch {
    /* ignore */
  }
}

function gameLoop(): void {
  for (const [roomId, r] of rooms) {
    const hasHost = r.host && r.host.readyState === 1;
    if (!hasHost) continue;
    r.tick = (r.tick + 1) >>> 0;
    for (const p of r.players.values()) {
      stepPlayer(p, r.platforms);
    }
    broadcastState(roomId);
  }
}

function handleMessage(ws: WebSocket, data: Buffer, isBinary: boolean): void {
  if (!isBinary || !Buffer.isBuffer(data)) {
    try {
      ws.send(encodeError("binary frames only"));
    } catch {
      /* ignore */
    }
    return;
  }

  const buf = bufferToArrayBuffer(data);
  const u8 = new Uint8Array(buf);
  const op = u8[0];
  const att = getAttached(ws);

  if (!att) {
    if (op !== Op.ClientJoin) {
      ws.send(encodeError("expected join"));
      ws.close();
      return;
    }
    let join: ReturnType<typeof parseJoin>;
    try {
      join = parseJoin(buf);
    } catch {
      ws.send(encodeError("bad join"));
      ws.close();
      return;
    }

    const { role, roomId } = join;

    if (role === "host") {
      if (rooms.has(roomId)) {
        ws.send(encodeError("room already exists"));
        ws.close();
        return;
      }
      rooms.set(roomId, {
        host: ws,
        controllers: new Map(),
        players: new Map(),
        nextPlayerId: 1,
        tick: 0,
        platforms: DEFAULT_PLATFORMS,
      });
      setAttached(ws, { role: "host", roomId });
      ws.send(encodeWelcome(0, roomId));
      broadcastState(roomId);
      return;
    }

    const room = rooms.get(roomId);
    if (!room || !room.host || room.host.readyState !== 1) {
      ws.send(encodeError("room not found"));
      ws.close();
      return;
    }

    const playerId = room.nextPlayerId++;
    const spawnX = 80 + (playerId - 1) * 72;
    const spawnY = 200;
    const sim = createPlayer(playerId, spawnX, spawnY);
    room.players.set(playerId, sim);
    room.controllers.set(ws, playerId);
    setAttached(ws, { role: "controller", roomId, playerId });
    ws.send(encodeWelcome(playerId, roomId));
    broadcastState(roomId);
    return;
  }

  if (att.role === "host") {
    if (op === Op.ClientPing) {
      let t: number;
      try {
        t = parsePing(buf);
      } catch {
        return;
      }
      const serverTime = performance.now();
      ws.send(encodePong(t, serverTime));
    }
    return;
  }

  if (att.role === "controller" && att.playerId !== undefined) {
    const room = rooms.get(att.roomId);
    if (!room) return;
    const player = room.players.get(att.playerId);
    if (!player) return;

    if (op === Op.ClientInput) {
      let inp: ReturnType<typeof parseInput>;
      try {
        inp = parseInput(buf);
      } catch {
        return;
      }
      player.input = { h: inp.h, buttons: inp.buttons, seq: inp.seq };
      return;
    }
    if (op === Op.ClientPing) {
      let t: number;
      try {
        t = parsePing(buf);
      } catch {
        return;
      }
      ws.send(encodePong(t, performance.now()));
    }
  }
}

const distRoot = path.join(process.cwd(), "dist");

function contentType(filePath: string): string {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

const httpServer = http.createServer((req, res) => {
  if (!fs.existsSync(distRoot)) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      "Static bundle not found. Run `npm run build` for single-port mode, or use `npm run dev` (Vite + game server)."
    );
    return;
  }
  const u = new URL(req.url || "/", "http://127.0.0.1");
  let pathname = u.pathname;
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.normalize(path.join(distRoot, pathname));
  if (!filePath.startsWith(distRoot)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", contentType(filePath));
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws) => {
  setTcpNoDelay(ws);

  ws.on("message", (data, isBinary) => {
    handleMessage(ws, data as Buffer, Boolean(isBinary));
  });

  ws.on("close", () => {
    const att = getAttached(ws);
    if (!att) return;
    if (att.role === "host") {
      destroyRoom(att.roomId);
      return;
    }
    if (att.role === "controller" && att.playerId !== undefined) {
      const room = rooms.get(att.roomId);
      if (!room) return;
      room.controllers.delete(ws);
      room.players.delete(att.playerId);
      broadcastState(att.roomId);
    }
  });
});

setInterval(gameLoop, 1000 / TICK_RATE);

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[game] Port ${PORT} is already in use. Set a different PORT in .env.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`[game] http://127.0.0.1:${PORT}/ (static)  ws://127.0.0.1:${PORT}/ws`);
});
