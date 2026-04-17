import type { HostStateJson } from "@shared/messages";
import { WORLD_H, WORLD_W } from "@shared/constants";
import { raceWalkLaneCenterY, raceWalkLanePitch } from "@shared/raceWalk";

let prevRwCountdown: number | null | undefined;
let goFlashUntil = 0;

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

  for (const ch of rw.crosshairs) {
    if (!ch.active) continue;
    const target = runnerInLane(rw, ch.lane);
    const cy = raceWalkLaneCenterY(ch.lane);
    const cx = target?.x ?? rw.startX;
    ctx.strokeStyle = "#ff6b6b";
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
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px system-ui,sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`P${ch.playerId}`, cx + 18, cy - 10);
    ctx.font = "12px system-ui,sans-serif";
    ctx.fillStyle = "#aab0c8";
    ctx.fillText(`ammo ${ch.ammo}`, cx + 18, cy + 6);
  }

  ctx.restore();

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

  ctx.save();
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "14px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Series wins: " + JSON.stringify(rw.seriesWins), 16, canvasH - 16);
  ctx.restore();
}
