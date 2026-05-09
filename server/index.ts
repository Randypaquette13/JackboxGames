import "dotenv/config";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { TICK_DT } from "../src/shared/constants.js";
import { parseClientIntent, type ControllerStateJson } from "../src/shared/messages.js";
import { pickPlayerHue } from "../src/shared/playerColors.js";
import { FOOTBALL_MAX_PLAYER_SPEED } from "../src/shared/footballSettings.js";
import { packedAxisToVelocity } from "../src/shared/footballPackedInput.js";
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
  handleFootballPauseEdge,
  handleFroggerPauseEdge,
  handleKartPauseEdge,
  handleRaceWalkPauseEdge,
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

const CONTROLLER_GRACE_MS = 30_000;

type GraceEntry = {
  playerId: number;
  expiresAt: number;
  timeout: NodeJS.Timeout;
};

const rooms = new Map<string, Room>();
const reconnectGraceByRoom = new Map<string, Map<string, GraceEntry>>();
const clientIdByPlayerByRoom = new Map<string, Map<number, string>>();
const prejoinControllersByRoom = new Map<string, Set<WebSocket>>();

function prejoinSet(roomId: string): Set<WebSocket> {
  let s = prejoinControllersByRoom.get(roomId);
  if (!s) {
    s = new Set<WebSocket>();
    prejoinControllersByRoom.set(roomId, s);
  }
  return s;
}

function sanitizePlayerName(raw: string, fallback: string): string {
  const s = (raw || "").trim().toUpperCase().slice(0, 4);
  return s ? s : fallback;
}

function buildPrejoinState(room: Room): ControllerStateJson {
  const connectedIds = new Set<number>(room.controllers.values());
  const resumablePlayers = [...room.players.values()]
    .filter((p) => !connectedIds.has(p.id))
    .map((p) => ({ playerId: p.id, name: p.name ?? `P${p.id}`, hue: p.hue }))
    .sort((a, b) => a.playerId - b.playerId);

  const suggestedName = `P${room.nextPlayerId}`;
  const existingHues = [...room.players.values()].map((p) => p.hue);
  const suggestedHue = pickPlayerHue(existingHues);

  return {
    type: "controller_state",
    tick: room.tick,
    phase: room.phase,
    playerId: 0,
    prejoin: { suggestedName, suggestedHue, resumablePlayers },
    menuIndex: room.menuIndex,
    menuItems: [],
    menuHelpOpen: false,
    settingsOpen: room.settingsOpen,
    gameSettings: { ...room.gameSettings },
    stubId: room.stubId,
    kart: null,
    raceWalk: null,
    frogger: null,
    football: null,
  };
}

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

function setClientId(ws: WebSocket, cid: string | null): void {
  (ws as unknown as { __jbCid?: string | null }).__jbCid = cid;
}

function getClientId(ws: WebSocket): string | null {
  return (ws as unknown as { __jbCid?: string | null }).__jbCid ?? null;
}

function graceMap(roomId: string): Map<string, GraceEntry> {
  let m = reconnectGraceByRoom.get(roomId);
  if (!m) {
    m = new Map<string, GraceEntry>();
    reconnectGraceByRoom.set(roomId, m);
  }
  return m;
}

function clientMap(roomId: string): Map<number, string> {
  let m = clientIdByPlayerByRoom.get(roomId);
  if (!m) {
    m = new Map<number, string>();
    clientIdByPlayerByRoom.set(roomId, m);
  }
  return m;
}

function removePlayerFromRoom(room: Room, playerId: number): void {
  room.players.delete(playerId);
  room.kartCars.delete(playerId);
  room.raceWalkShooters.delete(playerId);
  room.froggerFrogs.delete(playerId);
  room.froggerDeathNotices.delete(playerId);
  room.footballTeamPick.delete(playerId);
  room.footballTeamAssignment.delete(playerId);
  room.footballAthletes.delete(playerId);
  if (room.footballBall.carrierId === playerId) {
    room.footballBall.carrierId = null;
  }
  for (const runner of room.raceWalkRunners) {
    if (runner.controllerId === playerId) runner.controllerId = null;
  }
  if (room.kartPausedByPlayerId === playerId) room.kartPausedByPlayerId = null;
  if (room.raceWalkPausedByPlayerId === playerId) room.raceWalkPausedByPlayerId = null;
  if (room.froggerPausedByPlayerId === playerId) room.froggerPausedByPlayerId = null;
  if (room.footballPausedByPlayerId === playerId) room.footballPausedByPlayerId = null;
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
  const gm = reconnectGraceByRoom.get(roomId);
  if (gm) {
    for (const g of gm.values()) clearTimeout(g.timeout);
    reconnectGraceByRoom.delete(roomId);
  }
  clientIdByPlayerByRoom.delete(roomId);
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
  const now = Date.now();
  const reconnectingPlayers = [...graceMap(roomId).values()]
    .map((g) => ({
      playerId: g.playerId,
      secondsLeft: Math.max(0, Math.ceil((g.expiresAt - now) / 1000)),
    }))
    .filter((p) => p.secondsLeft > 0)
    .sort((a, b) => a.playerId - b.playerId);
  const hostJson = JSON.stringify(buildHostState(room, roomId, reconnectingPlayers));
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

  const pre = prejoinControllersByRoom.get(roomId);
  if (pre && pre.size > 0) {
    const st = JSON.stringify(buildPrejoinState(room));
    for (const ws of pre) {
      if (ws.readyState !== 1) continue;
      try {
        ws.send(st);
      } catch {
        /* ignore */
      }
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
  if (!att || att.role !== "controller") return;
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

  if (att.playerId === undefined) {
    // Pre-join flow.
    if (intent.type === "prejoin_create") {
      const playerId = room.nextPlayerId++;
      const spawnX = 80 + (playerId - 1) * 72;
      const spawnY = 200;
      const hue = Math.max(0, Math.min(359, Math.round(intent.hue)));
      const sim = createPlayer(playerId, spawnX, spawnY, hue);
      sim.name = sanitizePlayerName(intent.name, `P${playerId}`);
      room.players.set(playerId, sim);
      room.controllers.set(ws, playerId);
      prejoinSet(att.roomId).delete(ws);
      setAttached(ws, { role: "controller", roomId: att.roomId, playerId });
      const wsCid = getClientId(ws);
      if (wsCid) clientMap(att.roomId).set(playerId, wsCid);
      ensureKartCar(room, playerId);
      ws.send(encodeWelcome(playerId, att.roomId));
      broadcastRoom(att.roomId);
    } else if (intent.type === "prejoin_claim") {
      const pid = intent.playerId;
      const pl = room.players.get(pid);
      if (!pl) return;
      // Only allow claiming players that are currently disconnected (no controller WS attached).
      const connectedIds = new Set<number>(room.controllers.values());
      if (connectedIds.has(pid)) return;

      room.controllers.set(ws, pid);
      prejoinSet(att.roomId).delete(ws);
      setAttached(ws, { role: "controller", roomId: att.roomId, playerId: pid });
      const wsCid = getClientId(ws);
      if (wsCid) clientMap(att.roomId).set(pid, wsCid);
      ensureKartCar(room, pid);
      ws.send(encodeWelcome(pid, att.roomId));
      broadcastRoom(att.roomId);
    }
    return;
  }

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

    const wsCid = getClientId(ws);
    if (wsCid) {
      const gm = graceMap(roomId);
      const pending = gm.get(wsCid);
      if (
        pending &&
        pending.expiresAt > Date.now() &&
        room.players.has(pending.playerId)
      ) {
        clearTimeout(pending.timeout);
        gm.delete(wsCid);
        const playerId = pending.playerId;
        room.controllers.set(ws, playerId);
        setAttached(ws, { role: "controller", roomId, playerId });
        clientMap(roomId).set(playerId, wsCid);
        ensureKartCar(room, playerId);
        ws.send(encodeWelcome(playerId, roomId));
        broadcastRoom(roomId);
        return;
      }
      if (pending) {
        clearTimeout(pending.timeout);
        gm.delete(wsCid);
      }
    }

    // Controller pre-join: choose to resume a disconnected player or create a new player.
    setAttached(ws, { role: "controller", roomId });
    prejoinSet(roomId).add(ws);
    ws.send(encodeWelcome(0, roomId));
    try {
      ws.send(JSON.stringify(buildPrejoinState(room)));
    } catch {
      /* ignore */
    }
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
      const axisU8 = new DataView(buf).getUint8(5);
      if (room.phase === "football" || room.phase === "football_paused") {
        const { vx, vy } = packedAxisToVelocity(axisU8, FOOTBALL_MAX_PLAYER_SPEED);
        player.input = { h: 0, buttons: inp.buttons, seq: inp.seq, footballVx: vx, footballVy: vy };
      } else {
        player.input = { h: inp.h, buttons: inp.buttons, seq: inp.seq };
      }
      const car = room.kartCars.get(att.playerId);
      if (car && (room.phase === "kart" || room.phase === "kart_paused")) {
        const pauseHeld = (inp.buttons & Btn.Pause) !== 0;
        handleKartPauseEdge(room, att.playerId, car, pauseHeld);
      }
      const rwShooter = room.raceWalkShooters.get(att.playerId);
      if (rwShooter && (room.phase === "race_walk" || room.phase === "race_walk_paused")) {
        const pauseHeld = (inp.buttons & Btn.Pause) !== 0;
        handleRaceWalkPauseEdge(room, att.playerId, rwShooter, pauseHeld);
      }
      const fgFrog = room.froggerFrogs.get(att.playerId);
      if (fgFrog && (room.phase === "frogger" || room.phase === "frogger_paused")) {
        const pauseHeld = (inp.buttons & Btn.Pause) !== 0;
        handleFroggerPauseEdge(room, att.playerId, fgFrog, pauseHeld);
      }
      const fbAth = room.footballAthletes.get(att.playerId);
      if (fbAth && (room.phase === "football" || room.phase === "football_paused")) {
        const pauseHeld = (inp.buttons & Btn.Pause) !== 0;
        handleFootballPauseEdge(room, att.playerId, fbAth, pauseHeld);
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

wss.on("connection", (ws, req) => {
  setTcpNoDelay(ws);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const cidRaw = url.searchParams.get("cid")?.trim() ?? "";
  const cid = cidRaw && cidRaw.length <= 128 ? cidRaw : null;
  setClientId(ws, cid);

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
      const pid = att.playerId;
      const cid = getClientId(ws) ?? clientMap(att.roomId).get(pid) ?? null;
      if (!cid) {
        removePlayerFromRoom(room, pid);
        broadcastRoom(att.roomId);
        return;
      }
      const gm = graceMap(att.roomId);
      const prior = gm.get(cid);
      if (prior) clearTimeout(prior.timeout);
      const expiresAt = Date.now() + CONTROLLER_GRACE_MS;
      const timeout = setTimeout(() => {
        const r = rooms.get(att.roomId);
        if (!r) return;
        const cur = graceMap(att.roomId).get(cid);
        if (!cur || cur.playerId !== pid) return;
        graceMap(att.roomId).delete(cid);
        clientMap(att.roomId).delete(pid);
        broadcastRoom(att.roomId);
      }, CONTROLLER_GRACE_MS);
      gm.set(cid, { playerId: pid, expiresAt, timeout });
      broadcastRoom(att.roomId);
    }

    if (att.role === "controller" && att.playerId === undefined) {
      const s = prejoinControllersByRoom.get(att.roomId);
      if (s) {
        s.delete(ws);
        if (s.size === 0) prejoinControllersByRoom.delete(att.roomId);
      }
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
