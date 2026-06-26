import QRCode from "qrcode";
import { PLAYER_H, PLAYER_W, WORLD_H, WORLD_W } from "@shared/constants";
import type { GamePhase, HostStateJson, MinigameId } from "@shared/messages";
import { MINIGAME_IDS, MINIGAME_LABELS } from "@shared/messages";
import { MINIGAME_HELP } from "@shared/minigameHelp";
import { fallbackPlayerHue } from "@shared/playerColors";
import { resolveKartForwardSpeed } from "@shared/kartSettings";
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
import { drawFrogger } from "./renderFrogger";
import { drawRaceWalk } from "./renderRaceWalk";
import { drawFootball } from "./renderFootball";
import { drawAirHockey } from "./renderAirHockey";
import { drawBomberman } from "./renderBomberman";

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
const hudEl = document.querySelector<HTMLElement>("#hud")!;
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
let latestLobby: { tick: number; players: HostStateJson["lobbyPlayers"] } = { tick: 0, players: [] };
let rttMs = 0;
const enableDevControllers =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_CONTROLLERS === "true";
if (!enableDevControllers) {
  document.querySelector("#dev-host-dock")?.remove();
} else {
  const devDock = document.querySelector<HTMLElement>("#dev-host-dock");
  if (devDock) devDock.hidden = false;
}

function isMinigamePausedPhase(phase: GamePhase): boolean {
  return (
    phase === "kart_paused" ||
    phase === "race_walk_paused" ||
    phase === "frogger_paused" ||
    phase === "football_paused" ||
    phase === "air_hockey_paused" ||
    phase === "bomberman_paused"
  );
}

function updateQrVisibility(): void {
  if (!hostState) return;
  const paused = isMinigamePausedPhase(hostState.phase);
  const visible = hostState.showQr || paused;
  qrWrap.hidden = !visible;
  qrWrap.classList.toggle("qr-wrap-pause", visible && paused);
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
    const hue = p.hue ?? fallbackPlayerHue(p.playerId);
    ctx.fillStyle = `hsl(${hue} 72% 58%)`;
    ctx.strokeStyle = "#0a0a12";
    ctx.lineWidth = 2;
    ctx.fillRect(p.x, p.y, PLAYER_W, PLAYER_H);
    ctx.strokeRect(p.x, p.y, PLAYER_W, PLAYER_H);
    ctx.fillStyle = "#0a0a12";
    ctx.font = "bold 14px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = p.name ?? `P${p.playerId}`;
    ctx.fillText(label, p.x + PLAYER_W / 2, p.y + PLAYER_H / 2);
  }
  ctx.restore();
}

function wrapUiLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawMinigameMenuHelp(w: number, h: number): void {
  if (!hostState) return;
  const pad = Math.max(28, Math.floor(w * 0.06));
  const maxTextW = w - pad * 2;
  const n = MINIGAME_IDS.length;
  const idx = n <= 0 ? 0 : ((hostState.menuIndex % n) + n) % n;
  const id = MINIGAME_IDS[idx] as MinigameId;
  const copy = MINIGAME_HELP[id];

  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8e8f0";
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.max(26, Math.min(42, Math.floor(h * 0.048)))}px system-ui,sans-serif`;
  ctx.fillText(`${MINIGAME_LABELS[id]} — How to play`, w / 2, Math.max(72, Math.floor(h * 0.12)));

  let y = Math.max(112, Math.floor(h * 0.2));
  const bodyFont = `${Math.max(15, Math.min(19, Math.floor(h * 0.024)))}px system-ui,sans-serif`;
  const sectionFont = `bold ${Math.max(17, Math.min(22, Math.floor(h * 0.026)))}px system-ui,sans-serif`;
  const lineGap = Math.max(20, Math.floor(h * 0.028));
  const footerH = 52;

  ctx.textAlign = "left";
  const flushSection = (title: string, bullets: string[]) => {
    ctx.font = sectionFont;
    ctx.fillStyle = "#d8c8ff";
    ctx.fillText(title, pad, y);
    y += lineGap + 4;
    ctx.font = bodyFont;
    ctx.fillStyle = "#dce0ec";
    for (const b of bullets) {
      const wrapped = wrapUiLines(ctx, `• ${b}`, maxTextW - 12);
      for (const ln of wrapped) {
        if (y > h - footerH - lineGap) return;
        ctx.fillText(ln, pad + 6, y);
        y += lineGap;
      }
      y += 4;
    }
    y += 8;
  };

  flushSection("Rules", copy.rules);
  if (y <= h - footerH - lineGap * 3) flushSection("Controls (phone)", copy.controls);

  ctx.textAlign = "center";
  ctx.font = "16px system-ui,sans-serif";
  ctx.fillStyle = "#889";
  ctx.fillText("↑↓ switch game · OK or Back closes this screen", w / 2, h - 28);
}

function drawMenu(w: number, h: number): void {
  if (!hostState) return;
  if (hostState.menuHelpOpen) {
    drawMinigameMenuHelp(w, h);
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#e8e8f0";
  const titleSize = Math.max(34, Math.min(56, Math.floor(h * 0.065)));
  const itemSize = Math.max(42, Math.min(82, Math.floor(h * 0.1)));
  const itemGap = Math.max(54, Math.floor(itemSize * 1.18));
  const menuBlockH = hostState.menuItems.length * itemGap;
  const menuTop = Math.floor(h * 0.5 - menuBlockH * 0.5 + itemGap * 0.5);

  ctx.font = `bold ${titleSize}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Minigames", w / 2, Math.max(90, Math.floor(h * 0.16)));
  ctx.font = `bold ${itemSize}px system-ui,sans-serif`;
  hostState.menuItems.forEach((item, i) => {
    const sel = i === hostState!.menuIndex;
    ctx.fillStyle = sel ? "#ffffaa" : "#ccc";
    ctx.fillText(`${sel ? "› " : "  "}${item.label}`, w / 2, menuTop + i * itemGap);
  });
  ctx.font = "18px system-ui,sans-serif";
  ctx.fillStyle = "#888";
  ctx.fillText(
    "↑↓ navigate · OK select · How to play on controller · Lobby / Settings on controller",
    w / 2,
    h - 48
  );
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
  ctx.fillText("Game settings", w / 2, h / 2 - 36);
  ctx.font = "18px system-ui,sans-serif";
  const kartSpd = resolveKartForwardSpeed(hostState.gameSettings);
  ctx.fillText(`Kart racing speed: ${kartSpd}`, w / 2, h / 2 + 4);
  ctx.font = "15px system-ui,sans-serif";
  ctx.fillStyle = "#b8c0d8";
  ctx.fillText("Adjust on a controller (Menu → Game settings)", w / 2, h / 2 + 40);
}

function drawResultsMenu(w: number, h: number): void {
  if (!hostState) return;
  const opts = ["Play again", "Back to minigame select", "Add more controllers"];
  let title = "";
  if (hostState.phase === "kart_results" && hostState.kart) {
    title = "Race finished — choose on controller:";
  } else if (hostState.phase === "race_walk_results" && hostState.raceWalk) {
    title = "Race Walk finished — choose on controller:";
  } else if (hostState.phase === "frogger_results" && hostState.frogger) {
    title = "Frogger finished — choose on controller:";
  } else if (hostState.phase === "football_results" && hostState.football) {
    title = "Football finished — choose on controller:";
  } else if (hostState.phase === "air_hockey_results" && hostState.airHockey) {
    title = "Air Hockey finished — choose on controller:";
  } else if (hostState.phase === "bomberman_results" && hostState.bomberman) {
    title = "Bomberman finished — choose on controller:";
  } else {
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, h - 200, w, 200);
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "bold 20px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, 24, h - 168);
  ctx.font = "18px system-ui,sans-serif";
  opts.forEach((label, i) => {
    const sel = i === hostState!.menuIndex;
    ctx.fillStyle = sel ? "#ff8" : "#aaa";
    ctx.fillText(`${sel ? "▶ " : "   "}${label}`, 40, h - 130 + i * 36);
  });
}

function drawReconnectOverlay(w: number): void {
  const reconnecting = hostState?.reconnectingPlayers ?? [];
  if (reconnecting.length === 0) return;
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const x = 12;
  let y = 12;
  ctx.fillStyle = "rgba(10, 10, 18, 0.68)";
  ctx.fillRect(x - 8, y - 8, 320, 28 + reconnecting.length * 22);
  ctx.fillStyle = "#ffd38a";
  ctx.font = "bold 16px system-ui,sans-serif";
  ctx.fillText("Reconnecting controllers", x, y);
  y += 24;
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "14px system-ui,sans-serif";
  for (const p of reconnecting) {
    const nm = hostState?.lobbyPlayers.find((lp) => lp.playerId === p.playerId)?.name ?? `P${p.playerId}`;
    ctx.fillText(`${nm} (${p.secondsLeft}s left)`, x, y);
    y += 20;
  }
  ctx.restore();
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
  } else if (phase === "race_walk" || phase === "race_walk_paused" || phase === "race_walk_results") {
    if (hostState) drawRaceWalk(ctx, hostState, w, h, scale, ox, oy);
    drawResultsMenu(w, h);
  } else if (phase === "frogger" || phase === "frogger_paused" || phase === "frogger_results") {
    if (hostState) drawFrogger(ctx, hostState, w, h, scale, ox, oy);
    drawResultsMenu(w, h);
  } else if (
    phase === "football_team_select" ||
    phase === "football_summary" ||
    phase === "football" ||
    phase === "football_paused" ||
    phase === "football_results"
  ) {
    if (hostState) drawFootball(ctx, hostState, w, h, scale, ox, oy);
    drawResultsMenu(w, h);
  } else if (
    phase === "air_hockey_team_select" ||
    phase === "air_hockey_summary" ||
    phase === "air_hockey" ||
    phase === "air_hockey_paused" ||
    phase === "air_hockey_results"
  ) {
    if (hostState) drawAirHockey(ctx, hostState, w, h, scale, ox, oy);
    drawResultsMenu(w, h);
  } else if (phase === "bomberman" || phase === "bomberman_paused" || phase === "bomberman_results") {
    if (hostState) drawBomberman(ctx, hostState, w, h, scale, ox, oy);
    drawResultsMenu(w, h);
  }

  drawSettingsOverlay(w, h);
  drawReconnectOverlay(w);

  const lobbyHud = phase === "lobby";
  const pausedMinigameHud = isMinigamePausedPhase(phase);
  /** Keep HUD mounted during paused minigames so #qr-wrap (inside #hud) can show join QR. */
  hudEl.hidden = !(lobbyHud || pausedMinigameHud);
  if (lobbyHud || pausedMinigameHud) {
    tickEl.textContent = hostState ? `tick ${hostState.tick}` : "…";
    rttEl.textContent = rttMs > 0 ? `RTT ${rttMs.toFixed(0)} ms` : "";
  }
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
    if (enableDevControllers && !devKeyboardStarted) {
      devKeyboardStarted = true;
      void import("./devKeyboardPlayer").then(({ initDevKeyboardControllers }) => {
        initDevKeyboardControllers(roomId, wsUrl(), {
          getPhase: () => phaseRef.current,
          getHostSnapshot: () => ({
            settingsOpen: hostState?.settingsOpen ?? false,
            gameSettings: hostState?.gameSettings ?? {},
          }),
        });
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
