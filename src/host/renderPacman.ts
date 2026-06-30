import type { HostStateJson } from "@shared/messages";
import { WORLD_H, WORLD_W } from "@shared/constants";
import { fallbackPlayerHue } from "@shared/playerColors";

let prevPmCountdown: number | null | undefined;
let goFlashUntil = 0;

function ghostFill(mode: string, baseColor: string, tick: number): string {
  if (mode === "frightened") {
    return tick % 12 < 6 ? "#2121de" : "#fff";
  }
  if (mode === "eaten") return "rgba(255,255,255,0.35)";
  return baseColor;
}

export function drawPacman(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const pm = state.pacman;
  if (!pm) return;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const ox0 = pm.originX;
  const oy0 = pm.originY;
  const tile = pm.tile;

  for (let row = 0; row < pm.rows; row++) {
    for (let col = 0; col < pm.cols; col++) {
      const x = ox0 + col * tile;
      const y = oy0 + row * tile;
      const wall = pm.walls[row]?.[col];
      if (wall) {
        ctx.fillStyle = "#2121de";
        ctx.fillRect(x, y, tile, tile);
        ctx.strokeStyle = "#1414a8";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, tile - 2, tile - 2);
      } else {
        ctx.fillStyle = "#0a0a12";
        ctx.fillRect(x, y, tile, tile);
      }
    }
  }

  for (const cell of pm.pelletCells) {
    const x = ox0 + cell.col * tile + tile / 2;
    const y = oy0 + cell.row * tile + tile / 2;
    ctx.fillStyle = "#ffb897";
    ctx.beginPath();
    ctx.arc(x, y, tile * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const cell of pm.powerPelletCells) {
    const x = ox0 + cell.col * tile + tile / 2;
    const y = oy0 + cell.row * tile + tile / 2;
    const pulse = 0.85 + 0.15 * Math.sin(state.tick * 0.25);
    ctx.fillStyle = "#ffb897";
    ctx.beginPath();
    ctx.arc(x, y, tile * 0.18 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const g of pm.ghosts) {
    if (g.mode === "eaten") continue;
    const x = ox0 + g.col * tile + tile / 2;
    const y = oy0 + g.row * tile + tile / 2;
    const r = tile * 0.34;
    ctx.fillStyle = ghostFill(g.mode, g.color, state.tick);
    ctx.beginPath();
    ctx.arc(x, y - r * 0.15, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r * 0.55);
    ctx.lineTo(x + r * 0.66, y + r * 0.35);
    ctx.lineTo(x + r * 0.33, y + r * 0.55);
    ctx.lineTo(x, y + r * 0.35);
    ctx.lineTo(x - r * 0.33, y + r * 0.55);
    ctx.lineTo(x - r * 0.66, y + r * 0.35);
    ctx.lineTo(x - r, y + r * 0.55);
    ctx.closePath();
    ctx.fill();
    if (g.mode === "normal") {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
      ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2121de";
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.05, r * 0.1, 0, Math.PI * 2);
      ctx.arc(x + r * 0.35, y - r * 0.05, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const p of pm.players) {
    if (!p.alive) continue;
    const x = ox0 + p.col * tile + tile / 2;
    const y = oy0 + p.row * tile + tile / 2;
    const hue = p.hue ?? fallbackPlayerHue(p.playerId);
    const blink = p.invulnSecLeft > 0 && Math.floor(state.tick / 6) % 2 === 0;
    if (blink) continue;
    const mouth = 0.35 + 0.25 * Math.sin(state.tick * 0.4 + p.playerId);
    ctx.fillStyle = `hsl(${hue} 90% 55%)`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, tile * 0.34, mouth * Math.PI, (2 - mouth) * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#0a0a12";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(8, 8, 220, 52);
  ctx.fillStyle = "#ffb897";
  ctx.font = "bold 14px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Pellets: ${pm.pelletsRemaining}/${pm.totalPellets}`, 16, 14);
  if (pm.frightenedSecLeft !== null) {
    ctx.fillStyle = "#2121de";
    ctx.fillText(`Frightened: ${pm.frightenedSecLeft.toFixed(1)}s`, 16, 32);
  }

  for (const p of pm.players) {
    const x = WORLD_W - 16;
    const y = 14 + (p.playerId - 1) * 16;
    const hue = p.hue ?? fallbackPlayerHue(p.playerId);
    ctx.textAlign = "right";
    ctx.fillStyle = `hsl(${hue} 80% 62%)`;
    ctx.fillText(`${p.name}: ${p.score} · ${p.lives}L`, x, y);
  }

  for (const b of pm.banners) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(WORLD_W * 0.5 - 180, WORLD_H - 48, 360, 32);
    ctx.fillStyle = "#ffd38a";
    ctx.font = "bold 16px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.text, WORLD_W * 0.5, WORLD_H - 32);
  }

  if (pm.countdown !== null && pm.countdown > 0) {
    const n = Math.ceil(pm.countdown);
    if (prevPmCountdown !== null && prevPmCountdown > n) goFlashUntil = performance.now() + 420;
    prevPmCountdown = n;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = performance.now() < goFlashUntil ? "#7ee787" : "#fff";
    ctx.font = "bold 72px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n === 0 ? "GO!" : String(n), WORLD_W / 2, WORLD_H / 2);
  } else {
    prevPmCountdown = pm.countdown;
  }

  if (pm.paused) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", WORLD_W / 2, WORLD_H / 2);
  }

  if (state.phase === "pacman_results" && pm.teamCleared) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(WORLD_W * 0.5 - 200, WORLD_H * 0.5 - 36, 400, 72);
    ctx.fillStyle = "#ffd38a";
    ctx.font = "bold 28px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Team cleared the maze!", WORLD_W / 2, WORLD_H * 0.5);
  } else if (state.phase === "pacman_results" && pm.teamWiped) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(WORLD_W * 0.5 - 200, WORLD_H * 0.5 - 36, 400, 72);
    ctx.fillStyle = "#ff8a8a";
    ctx.font = "bold 28px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Out of lives — game over!", WORLD_W / 2, WORLD_H * 0.5);
  }

  ctx.restore();
}
