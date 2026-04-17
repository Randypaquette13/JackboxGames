import "dotenv/config";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { TICK_DT } from "../src/shared/constants.js";
import { parseClientIntent } from "../src/shared/messages.js";
import {
  Btn,
  encodeError,
  encodePong,
  encodeWelcome,
  Op,
  parseInput,
  parseJoin,
  parsePing,
} from "../src/shared/protocol.js";
import {
  applyIntent,
  buildControllerState,
  buildHostState,
  createRoom,
  ensureKartCar,
  handleKartPauseEdge,
  type Room,
  tickSimulation,
} from "./gameRoom.js";
import { createPlayer, DEFAULT_PLATFORMS } from "./game.js";

const PORT = Number(process.env.PORT) || 3001;

type ClientRole = "host" | "controller";

type Attached = {
  role: ClientRole;
  roomId: string;
  playerId?: number;
};

const rooms = new Map<string, Room>();

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

export function broadcastRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room || !room.host || room.host.readyState !== 1) return;
  const hostJson = JSON.stringify(buildHostState(room, roomId));
  try {
    room.host.send(hostJson);
  } catch {
    /* ignore */
  }
  for (const [ws, pid] of room.controllers) {
    if (ws.readyState !== 1) continue;
    try {
      ws.send(JSON.stringify(buildControllerState(room, pid)));
    } catch {
      /* ignore */
    }
  }
}

function gameLoop(): void {
  for (const [roomId, room] of rooms) {
    const hasHost = room.host && room.host.readyState === 1;
    if (!hasHost) continue;
    tickSimulation(room, TICK_DT);
    broadcastRoom(roomId);
  }
}

function handleTextMessage(ws: WebSocket, raw: string): void {
  const att = getAttached(ws);
  if (!att || att.role !== "controller" || att.playerId === undefined) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const intent = parseClientIntent(parsed);
  if (!intent) return;
  const room = rooms.get(att.roomId);
  if (!room) return;
  applyIntent(room, att.playerId, intent);
  broadcastRoom(att.roomId);
}

function handleBinaryMessage(ws: WebSocket, data: Buffer): void {
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
      const room = createRoom(ws, DEFAULT_PLATFORMS);
      rooms.set(roomId, room);
      setAttached(ws, { role: "host", roomId });
      ws.send(encodeWelcome(0, roomId));
      broadcastRoom(roomId);
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
    ensureKartCar(room, playerId);
    ws.send(encodeWelcome(playerId, roomId));
    broadcastRoom(roomId);
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
      ws.send(encodePong(t, performance.now()));
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
      const car = room.kartCars.get(att.playerId);
      if (car && (room.phase === "kart" || room.phase === "kart_paused")) {
        const pauseHeld = (inp.buttons & Btn.Pause) !== 0;
        handleKartPauseEdge(room, att.playerId, car, pauseHeld);
      }
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
    if (!isBinary) {
      const s = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      handleTextMessage(ws, s);
      return;
    }
    if (Buffer.isBuffer(data)) {
      handleBinaryMessage(ws, data);
    }
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
      room.kartCars.delete(att.playerId);
      broadcastRoom(att.roomId);
    }
  });
});

setInterval(gameLoop, 1000 * TICK_DT);

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
