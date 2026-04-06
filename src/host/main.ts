import QRCode from "qrcode";
import { PLAYER_H, PLAYER_W, WORLD_H, WORLD_W } from "@shared/constants";
import { PLATFORMS } from "@shared/level";
import {
  encodeJoin,
  encodePing,
  Op,
  parseError,
  parsePong,
  parseState,
  parseWelcome,
  type PlayerSnapshot,
} from "@shared/protocol";

function publicBaseUrl(): string {
  const raw = import.meta.env.VITE_PUBLIC_BASE_URL?.trim() || window.location.origin;
  return raw.replace(/\/$/, "");
}

function makeRoomId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function wsUrl(): string {
  const p = location.protocol === "https:" ? "wss:" : "ws:";
  return `${p}//${location.host}/ws`;
}

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const ctx = canvas.getContext("2d")!;
const roomCodeEl = document.querySelector<HTMLElement>("#room-code")!;
const rttEl = document.querySelector<HTMLElement>("#rtt")!;
const tickEl = document.querySelector<HTMLElement>("#tick")!;
const qrCanvas = document.querySelector<HTMLCanvasElement>("#qr")!;

const roomId = makeRoomId();
roomCodeEl.textContent = roomId;

const joinUrl = `${publicBaseUrl()}/join.html?room=${encodeURIComponent(roomId)}`;
QRCode.toCanvas(qrCanvas, joinUrl, { width: 140, margin: 1, color: { dark: "#0a0a12", light: "#ffffff" } }).catch(
  (e) => console.error(e)
);

let latest: { tick: number; players: PlayerSnapshot[] } = { tick: 0, players: [] };
let rttMs = 0;

function draw(): void {
  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.min(w / WORLD_W, h / WORLD_H);
  const ox = (w - WORLD_W * scale) / 2;
  const oy = (h - WORLD_H * scale) / 2;

  ctx.save();
  ctx.fillStyle = "#12121c";
  ctx.fillRect(0, 0, w, h);
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#2a2a3c";
  for (const pl of PLATFORMS) {
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
  }

  for (const p of latest.players) {
    const hue = (p.id * 47) % 360;
    ctx.fillStyle = `hsl(${hue} 72% 58%)`;
    ctx.strokeStyle = "#0a0a12";
    ctx.lineWidth = 2;
    ctx.fillRect(p.x, p.y, PLAYER_W, PLAYER_H);
    ctx.strokeRect(p.x, p.y, PLAYER_W, PLAYER_H);
    ctx.fillStyle = "#0a0a12";
    ctx.font = "bold 14px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.id), p.x + PLAYER_W / 2, p.y + PLAYER_H / 2);
  }

  ctx.restore();
  tickEl.textContent = `tick ${latest.tick}`;
  rttEl.textContent = rttMs > 0 ? `RTT ${rttMs.toFixed(0)} ms` : "";
  requestAnimationFrame(draw);
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);

const ws = new WebSocket(wsUrl());
ws.binaryType = "arraybuffer";

ws.addEventListener("open", () => {
  ws.send(encodeJoin("host", roomId));
});

ws.addEventListener("message", (ev) => {
  const data = ev.data as ArrayBuffer;
  const v = new DataView(data);
  const op = v.getUint8(0);
  if (op === Op.ServerWelcome) {
    parseWelcome(data);
    return;
  }
  if (op === Op.ServerState) {
    latest = parseState(data);
    return;
  }
  if (op === Op.ServerPong) {
    const { clientTime } = parsePong(data);
    rttMs = performance.now() - clientTime;
    return;
  }
  if (op === Op.ServerError) {
    console.error(parseError(data));
  }
});

setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(encodePing(performance.now()));
  }
}, 500);
