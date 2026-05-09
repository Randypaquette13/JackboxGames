import type { HostStateJson, RaceWalkCrosshairJson } from "@shared/messages";
import { WORLD_H, WORLD_W } from "@shared/constants";
import { fallbackPlayerHue } from "@shared/playerColors";
import { raceWalkLaneCenterY, raceWalkLanePitch } from "@shared/raceWalk";

let prevRwCountdown: number | null | undefined;
let goFlashUntil = 0;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

function blendedCrosshairStrokeRgb(hues: number[]): [number, number, number] {
  if (hues.length === 0) return [255, 107, 107];
  const rgbs = hues.map((hue) => hslToRgb(hue, 72, 58));
  const n = rgbs.length;
  const r = rgbs.reduce((a, v) => a + v[0], 0) / n;
  const g = rgbs.reduce((a, v) => a + v[1], 0) / n;
  const b = rgbs.reduce((a, v) => a + v[2], 0) / n;
  return [r, g, b];
}

function crosshairStrokeStyle(hues: number[]): string {
  const [r, g, b] = blendedCrosshairStrokeRgb(hues);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function runnerInLane(rw: NonNullable<HostStateJson["raceWalk"]>, lane: number) {
  return rw.runners.find((r) => r.lane === lane);
}

export function drawRaceWalk(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const rw = state.raceWalk;
  if (!rw) return;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#1a2430";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const pitch = raceWalkLanePitch();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 20; i++) {
    const y = 20 + i * pitch;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(120,255,160,0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(rw.startX, 16);
  ctx.lineTo(rw.startX, WORLD_H - 16);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,220,120,0.9)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(rw.finishX, 12);
  ctx.lineTo(rw.finishX, WORLD_H - 12);
  ctx.stroke();

  for (const r of rw.runners) {
    const cy = raceWalkLaneCenterY(r.lane);
    ctx.save();
    ctx.translate(r.x, cy);
    if (r.downed) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#6a6a7a";
    } else {
      ctx.fillStyle = "#c8ccd8";
    }
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  const activeCrosshairs = rw.crosshairs.filter((ch) => ch.active);
  const byLane = new Map<number, RaceWalkCrosshairJson[]>();
  for (const ch of activeCrosshairs) {
    const list = byLane.get(ch.lane) ?? [];
    list.push(ch);
    byLane.set(ch.lane, list);
  }

  const laneOrder = [...byLane.keys()].sort((a, b) => a - b);
  for (const lane of laneOrder) {
    const group = byLane.get(lane)!;
    const sorted = [...group].sort((a, b) => a.playerId - b.playerId);
    const playerIds = sorted.map((c) => c.playerId);
    const hues = sorted.map((c) => c.hue ?? fallbackPlayerHue(c.playerId));
    const stroke = crosshairStrokeStyle(hues);

    const target = runnerInLane(rw, lane);
    const cy = raceWalkLaneCenterY(lane);
    const cx = target?.x ?? rw.startX;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    const s = 14;
    ctx.beginPath();
    ctx.moveTo(cx - s, cy);
    ctx.lineTo(cx + s, cy);
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx, cy + s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, s + 4, 0, Math.PI * 2);
    ctx.stroke();
    const nameById = new Map<number, string>();
    for (const p of state.lobbyPlayers ?? []) nameById.set(p.playerId, p.name);
    const idLabel = playerIds.map((id) => nameById.get(id) ?? `P${id}`).join(" · ");
    ctx.fillStyle = stroke;
    ctx.font = "bold 13px system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(idLabel, cx + 18, cy - 10);
    ctx.font = "12px system-ui,sans-serif";
    ctx.fillStyle = "#aab0c8";
    const ammoLabel =
      sorted.length > 1
        ? `ammo ${sorted.map((c) => c.ammo).join(" · ")}`
        : `ammo ${sorted[0].ammo}`;
    ctx.fillText(ammoLabel, cx + 18, cy + 6);
  }

  ctx.restore();

  if (state.phase === "race_walk_paused") {
    ctx.save();
    ctx.filter = "blur(2.5px)";
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
    ctx.fillStyle = "rgba(8, 10, 14, 0.34)";
    ctx.fillRect(0, 0, canvasW, canvasH);

    const pausedBy = rw.pausedByPlayerId;
    const nameById2 = new Map<number, string>();
    for (const p of state.lobbyPlayers ?? []) {
      const label = p.name?.trim() ? p.name.trim() : `P${p.playerId}`;
      nameById2.set(p.playerId, label);
    }
    const byText =
      pausedBy !== null ? `${nameById2.get(pausedBy) ?? `P${pausedBy}`} paused the game` : "Paused";
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const boxW = Math.min(560, canvasW * 0.72);
    const boxH = 146;
    ctx.fillStyle = "rgba(14, 16, 24, 0.82)";
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffde87";
    ctx.font = "bold 48px system-ui,sans-serif";
    ctx.fillText("PAUSED", cx, cy - 24);
    ctx.fillStyle = "#e8e8f0";
    ctx.font = "22px system-ui,sans-serif";
    ctx.fillText(byText, cx, cy + 20);
    ctx.font = "16px system-ui,sans-serif";
    ctx.fillStyle = "#b9c0d4";
    ctx.fillText("Press resume on controller to continue", cx, cy + 52);
    ctx.restore();
  }

  const cd = rw.countdown;
  if (cd !== null && cd > 0) {
    goFlashUntil = 0;
  } else if (prevRwCountdown !== undefined && prevRwCountdown > 0 && cd === null) {
    goFlashUntil = performance.now() + 900;
  }
  prevRwCountdown = cd;

  const showGo = performance.now() < goFlashUntil;
  const countNum = cd !== null && cd > 0 ? Math.ceil(cd) : 0;
  const showBig = (countNum >= 1 && countNum <= 5) || showGo;
  if (showBig && state.phase === "race_walk") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const fontPx = Math.min(168, Math.min(canvasW, canvasH) * 0.26);
    const text = showGo ? "GO!" : String(countNum);
    ctx.font = `bold ${fontPx}px system-ui,sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(text, cx + 5, cy + 6);
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = Math.max(6, fontPx * 0.06);
    ctx.fillStyle = "#f8f8ff";
    ctx.strokeText(text, cx, cy);
    ctx.fillText(text, cx, cy);
  }

  if (rw.banners.length > 0) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let y = 56;
    ctx.font = "bold 20px system-ui,sans-serif";
    for (const b of rw.banners) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(canvasW / 2 - 280, y - 6, 560, 34);
      ctx.fillStyle = "#f4e6a8";
      ctx.fillText(b.text, canvasW / 2, y);
      y += 40;
    }
    ctx.restore();
  }

  const deadPlayers = rw.runners
    .filter((r) => r.downed && r.controllerId !== null)
    .map((r) => r.controllerId!)
    .sort((a, b) => a - b);
  if (deadPlayers.length > 0) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const msg =
      deadPlayers.length === 1
        ? `Player ${deadPlayers[0]} died`
        : `Players ${deadPlayers.join(", ")} died`;
    const cx = canvasW / 2;
    const y = canvasH - 54;
    ctx.font = "bold 24px system-ui,sans-serif";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(cx - 260, y - 22, 520, 44);
    ctx.fillStyle = "#ffd2d2";
    ctx.fillText(msg, cx, y);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "14px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Series wins: " + JSON.stringify(rw.seriesWins), 16, canvasH - 16);
  ctx.restore();
}
