import type { HostStateJson } from "@shared/messages";
import { BOMMERMAN_BOMB_FUSE_SEC } from "@shared/bombermanSettings";
import { WORLD_H, WORLD_W } from "@shared/constants";
import { fallbackPlayerHue } from "@shared/playerColors";

let prevBmCountdown: number | null | undefined;
let goFlashUntil = 0;

function powerGlyph(kind: "bomb" | "fire" | "speed"): string {
  if (kind === "bomb") return "B";
  if (kind === "fire") return "F";
  return "S";
}

function powerColor(kind: "bomb" | "fire" | "speed"): string {
  if (kind === "bomb") return "#ffd166";
  if (kind === "fire") return "#ff6b4a";
  return "#7ee787";
}

export function drawBomberman(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const bm = state.bomberman;
  if (!bm) return;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#1a1c28";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const ox0 = bm.originX;
  const oy0 = bm.originY;
  const tile = bm.tile;

  for (let row = 0; row < bm.rows; row++) {
    for (let col = 0; col < bm.cols; col++) {
      const cell = bm.cells[row]?.[col] ?? "empty";
      const x = ox0 + col * tile;
      const y = oy0 + row * tile;
      if (cell === "hard") {
        ctx.fillStyle = "#3a3d52";
        ctx.fillRect(x, y, tile, tile);
        ctx.strokeStyle = "#252836";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, tile - 2, tile - 2);
      } else if (cell === "soft") {
        ctx.fillStyle = "#6b4a3a";
        ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
        ctx.strokeStyle = "#4a3020";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, tile - 4, tile - 4);
      } else {
        ctx.fillStyle = "#2a3040";
        ctx.fillRect(x, y, tile, tile);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      }
    }
  }

  for (const pu of bm.powerUps) {
    const x = ox0 + pu.col * tile;
    const y = oy0 + pu.row * tile;
    ctx.fillStyle = powerColor(pu.kind);
    ctx.beginPath();
    ctx.arc(x + tile / 2, y + tile / 2, tile * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0a12";
    ctx.font = `bold ${Math.floor(tile * 0.38)}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(powerGlyph(pu.kind), x + tile / 2, y + tile / 2 + 1);
  }

  for (const f of bm.flames) {
    const x = ox0 + f.col * tile;
    const y = oy0 + f.row * tile;
    ctx.fillStyle = "rgba(255, 120, 40, 0.82)";
    ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
    ctx.fillStyle = "rgba(255, 220, 80, 0.55)";
    ctx.fillRect(x + 8, y + 8, tile - 16, tile - 16);
  }

  for (const bomb of bm.bombs) {
    const x = ox0 + bomb.col * tile;
    const y = oy0 + bomb.row * tile;
    const pulse = 0.85 + 0.15 * Math.sin(state.tick * 0.35);
    const r = tile * 0.28 * pulse;
    ctx.fillStyle = "#1a1a22";
    ctx.beginPath();
    ctx.arc(x + tile / 2, y + tile / 2, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d2d38";
    ctx.beginPath();
    ctx.arc(x + tile / 2, y + tile / 2, r, 0, Math.PI * 2);
    ctx.fill();
    const fuseFrac = Math.max(0, bomb.fuseLeft / BOMMERMAN_BOMB_FUSE_SEC);
    ctx.fillStyle = fuseFrac > 0.35 ? "#ffd166" : "#ff6b4a";
    ctx.fillRect(x + tile / 2 - 2, y + 4, 4, 8);
  }

  for (const p of bm.players) {
    if (!p.alive) continue;
    const x = ox0 + p.col * tile + tile / 2;
    const y = oy0 + p.row * tile + tile / 2;
    const hue = p.hue ?? fallbackPlayerHue(p.playerId);
    ctx.fillStyle = `hsl(${hue} 72% 52%)`;
    ctx.beginPath();
    ctx.arc(x, y, tile * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0a0a12";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#0a0a12";
    ctx.font = `bold ${Math.floor(tile * 0.22)}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = p.name.length > 3 ? p.name.slice(0, 3) : p.name;
    ctx.fillText(label, x, y);
  }

  for (const b of bm.banners) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(WORLD_W * 0.5 - 180, 8, 360, 32);
    ctx.fillStyle = "#ffd38a";
    ctx.font = "bold 16px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.text, WORLD_W * 0.5, 24);
  }

  if (bm.countdown !== null && bm.countdown > 0) {
    const n = Math.ceil(bm.countdown);
    if (prevBmCountdown !== null && prevBmCountdown > n) goFlashUntil = performance.now() + 420;
    prevBmCountdown = n;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = performance.now() < goFlashUntil ? "#7ee787" : "#fff";
    ctx.font = "bold 72px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n === 0 ? "GO!" : String(n), WORLD_W / 2, WORLD_H / 2);
  } else {
    prevBmCountdown = bm.countdown;
  }

  if (bm.paused) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", WORLD_W / 2, WORLD_H / 2);
  }

  if (state.phase === "bomberman_results" && bm.winnerId !== null) {
    const winner = bm.players.find((p) => p.playerId === bm.winnerId);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(WORLD_W * 0.5 - 200, WORLD_H * 0.5 - 36, 400, 72);
    ctx.fillStyle = "#ffd38a";
    ctx.font = "bold 28px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${winner?.name ?? `P${bm.winnerId}`} wins!`, WORLD_W / 2, WORLD_H * 0.5);
  } else if (state.phase === "bomberman_results" && bm.winnerId === null) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(WORLD_W * 0.5 - 120, WORLD_H * 0.5 - 28, 240, 56);
    ctx.fillStyle = "#ffd38a";
    ctx.font = "bold 24px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Tie!", WORLD_W / 2, WORLD_H * 0.5);
  }

  ctx.restore();
}
