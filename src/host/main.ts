import QRCode from "qrcode";
import { PLAYER_H, PLAYER_W, WORLD_H, WORLD_W } from "@shared/constants";
import type { GamePhase, HostStateJson } from "@shared/messages";
import { MINIGAME_LABELS } from "@shared/messages";
import { PLATFORMS } from "@shared/level";
import {
  encodeJoin,
  encodePing,
  Op,
  parseError,
  parsePong,
  parseWelcome,
  type PlayerSnapshot,
} from "@shared/protocol";
import { drawKart } from "./renderKart";

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
const qrWrap = document.querySelector<HTMLElement>("#qr-wrap")!;

const roomId = makeRoomId();
roomCodeEl.textContent = roomId;

const joinUrl = `${publicBaseUrl()}/join.html?room=${encodeURIComponent(roomId)}`;
QRCode.toCanvas(qrCanvas, joinUrl, { width: 140, margin: 1, color: { dark: "#0a0a12", light: "#ffffff" } }).catch(
  (e) => console.error(e)
);

let hostState: HostStateJson | null = null;
const phaseRef: { current: GamePhase } = { current: "lobby" };
let latestLobby: { tick: number; players: PlayerSnapshot[] } = { tick: 0, players: [] };
let rttMs = 0;

function updateQrVisibility(): void {
  if (!hostState) return;
  qrWrap.hidden = !hostState.showQr;
}

function drawLobby(w: number, h: number, scale: number, ox: number, oy: number): void {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#2a2a3c";
  for (const pl of PLATFORMS) {
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
  }
  for (const p of latestLobby.players) {
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
}

function drawMenu(w: number, h: number): void {
  if (!hostState) return;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "bold 28px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Minigames", w / 2, 80);
  ctx.font = "22px system-ui,sans-serif";
  hostState.menuItems.forEach((item, i) => {
    const sel = i === hostState!.menuIndex;
    ctx.fillStyle = sel ? "#ffffaa" : "#ccc";
    ctx.fillText(`${sel ? "› " : "  "}${item.label}`, w / 2, 140 + i * 44);
  });
  ctx.font = "16px system-ui,sans-serif";
  ctx.fillStyle = "#888";
  ctx.fillText("↑↓ navigate · OK select · Add players / Settings on controller", w / 2, h - 48);
}

function drawStub(w: number, h: number): void {
  ctx.fillStyle = "rgba(10,10,20,0.95)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "bold 32px system-ui,sans-serif";
  ctx.textAlign = "center";
  const id = hostState?.stubId ?? "stub";
  ctx.fillText(MINIGAME_LABELS[id as keyof typeof MINIGAME_LABELS] ?? id, w / 2, h / 2 - 20);
  ctx.font = "18px system-ui,sans-serif";
  ctx.fillStyle = "#888";
  ctx.fillText("Stub — nothing here yet", w / 2, h / 2 + 24);
}

function drawSettingsOverlay(w: number, h: number): void {
  if (!hostState?.settingsOpen) return;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 24px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Game Settings (stub)", w / 2, h / 2 - 20);
  ctx.font = "16px system-ui,sans-serif";
  ctx.fillText(JSON.stringify(hostState.gameSettings), w / 2, h / 2 + 20);
}

function drawResultsMenu(w: number, h: number): void {
  if (!hostState || hostState.phase !== "kart_results" || !hostState.kart) return;
  const opts = ["Play again", "Back to minigame select", "Add more controllers"];
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, h - 200, w, 200);
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "bold 20px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Race finished — choose on controller:", 24, h - 168);
  ctx.font = "18px system-ui,sans-serif";
  opts.forEach((label, i) => {
    const sel = i === hostState!.menuIndex;
    ctx.fillStyle = sel ? "#ff8" : "#aaa";
    ctx.fillText(`${sel ? "▶ " : "   "}${label}`, 40, h - 130 + i * 36);
  });
}

function draw(): void {
  const w = canvas.width;
  const h = canvas.height;
  const scale = Math.min(w / WORLD_W, h / WORLD_H);
  const ox = (w - WORLD_W * scale) / 2;
  const oy = (h - WORLD_H * scale) / 2;

  ctx.fillStyle = "#12121c";
  ctx.fillRect(0, 0, w, h);

  const phase = hostState?.phase ?? "lobby";

  if (phase === "lobby") {
    drawLobby(w, h, scale, ox, oy);
  } else if (phase === "menu") {
    drawLobby(w, h, scale, ox, oy);
    drawMenu(w, h);
  } else if (phase === "stub") {
    drawStub(w, h);
  } else if (phase === "kart" || phase === "kart_paused" || phase === "kart_results") {
    if (hostState) drawKart(ctx, hostState, w, h);
    drawResultsMenu(w, h);
  }

  drawSettingsOverlay(w, h);

  tickEl.textContent = hostState ? `tick ${hostState.tick}` : "…";
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

let devKeyboardStarted = false;

ws.addEventListener("open", () => {
  ws.send(encodeJoin("host", roomId));
});

ws.addEventListener("message", (ev) => {
  if (typeof ev.data === "string") {
    try {
      const j = JSON.parse(ev.data) as HostStateJson;
      if (j.type === "host_state") {
        hostState = j;
        phaseRef.current = j.phase;
        latestLobby = { tick: j.tick, players: j.lobbyPlayers };
        updateQrVisibility();
      }
    } catch (e) {
      console.error(e);
    }
    return;
  }
  const data = ev.data as ArrayBuffer;
  const v = new DataView(data);
  const op = v.getUint8(0);
  if (op === Op.ServerWelcome) {
    parseWelcome(data);
    if (import.meta.env.DEV && !devKeyboardStarted) {
      devKeyboardStarted = true;
      void import("./devKeyboardPlayer").then(({ initDevKeyboardControllers }) => {
        initDevKeyboardControllers(roomId, wsUrl(), () => phaseRef.current);
      });
    }
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
