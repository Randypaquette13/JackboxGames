import type { HostStateJson } from "@shared/messages";
import {
  TANKS_BARREL_LEN,
  TANKS_BODY_H,
  TANKS_GRAVITY,
  TANKS_MAX_VELOCITY,
  TANKS_MIN_POWER,
} from "@shared/tanksSettings";

let prevTkKickCountdown: number | null | undefined;
let goFlashUntil = 0;

function teamFill(team: "red" | "blue"): string {
  return team === "red" ? "#c83838" : "#2f62cf";
}

function teamDark(team: "red" | "blue"): string {
  return team === "red" ? "#6a2020" : "#1a3a78";
}

function drawField(
  ctx: CanvasRenderingContext2D,
  field: { x0: number; x1: number; y0: number; y1: number; midX: number }
): void {
  const { x0, x1, y0, y1, midX } = field;

  ctx.save();
  ctx.fillStyle = "#3a5230";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  ctx.fillStyle = "rgba(90, 60, 40, 0.35)";
  ctx.fillRect(x0, y0, midX - x0, y1 - y0);
  ctx.fillStyle = "rgba(50, 70, 110, 0.28)";
  ctx.fillRect(midX, y0, x1 - midX, y1 - y0);

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(midX, y0);
  ctx.lineTo(midX, y1);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "#1a2418";
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

function drawTank(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  hue: number,
  team: "red" | "blue",
  label: string,
  alive: boolean,
  active: boolean
): void {
  ctx.save();
  ctx.globalAlpha = alive ? 1 : 0.25;
  ctx.translate(x, y);
  ctx.rotate(angle);

  if (active && alive) {
    ctx.strokeStyle = "rgba(255, 230, 100, 0.95)";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-TANKS_BODY_W * 0.6, -TANKS_BODY_H * 0.85, TANKS_BODY_W * 1.2, TANKS_BODY_H * 1.7);
    ctx.setLineDash([]);
  }

  ctx.fillStyle = teamDark(team);
  ctx.strokeStyle = "#0a0a12";
  ctx.lineWidth = 2;
  ctx.fillRect(-TANKS_BODY_W * 0.5, -TANKS_BODY_H * 0.5, TANKS_BODY_W, TANKS_BODY_H);
  ctx.strokeRect(-TANKS_BODY_W * 0.5, -TANKS_BODY_H * 0.5, TANKS_BODY_W, TANKS_BODY_H);

  ctx.fillStyle = teamFill(team);
  ctx.fillRect(-TANKS_BODY_W * 0.42, -TANKS_BODY_H * 0.38, TANKS_BODY_W * 0.84, TANKS_BODY_H * 0.76);

  ctx.fillStyle = `hsl(${hue} 68% 52%)`;
  ctx.beginPath();
  ctx.arc(-TANKS_BODY_W * 0.08, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2a2a32";
  ctx.fillRect(0, -4, TANKS_BARREL_LEN, 8);
  ctx.strokeRect(0, -4, TANKS_BARREL_LEN, 8);

  ctx.restore();

  if (alive) {
    ctx.save();
    ctx.fillStyle = "#faf8f2";
    ctx.font = "bold 11px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, x, y - TANKS_BODY_H * 0.7);
    ctx.restore();
  }
}

function drawAimPreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  power: number
): void {
  const speed = TANKS_MAX_VELOCITY * Math.max(TANKS_MIN_POWER, Math.min(1, power));
  let px = x + Math.cos(angle) * (TANKS_BARREL_LEN + 8);
  let py = y + Math.sin(angle) * (TANKS_BARREL_LEN + 8);
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 240, 160, 0.75)";
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(px, py);
  for (let i = 0; i < 36; i++) {
    vy += TANKS_GRAVITY * (1 / 60);
    px += vx * (1 / 60);
    py += vy * (1 / 60);
    ctx.lineTo(px, py);
    if (py > 520) break;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawProjectile(ctx: CanvasRenderingContext2D, x: number, y: number, team: "red" | "blue"): void {
  ctx.save();
  ctx.fillStyle = team === "red" ? "#ff6666" : "#66aaff";
  ctx.strokeStyle = "#1a1020";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, "rgba(255, 220, 80, 0.95)");
  grad.addColorStop(0.45, "rgba(255, 120, 40, 0.75)");
  grad.addColorStop(1, "rgba(80, 20, 10, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTeamSelectOverlay(
  ctx: CanvasRenderingContext2D,
  st: HostStateJson,
  w: number,
  h: number
): void {
  const tk = st.tanks;
  if (!tk) return;
  ctx.save();
  ctx.fillStyle = "rgba(8, 10, 18, 0.72)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#f0f0f8";
  ctx.font = "bold 28px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tank Battle — pick teams on your phone", w / 2, h * 0.18);

  const rosterY = h * 0.34;
  ctx.font = "bold 20px system-ui,sans-serif";
  ctx.fillStyle = "#ff6666";
  ctx.fillText("RED", w * 0.28, rosterY);
  ctx.fillStyle = "#66aaff";
  ctx.fillText("BLUE", w * 0.72, rosterY);

  ctx.font = "16px system-ui,sans-serif";
  ctx.fillStyle = "#ddd";
  tk.red.forEach((p, i) => {
    ctx.fillText(p.name, w * 0.28, rosterY + 28 + i * 22);
  });
  tk.blue.forEach((p, i) => {
    ctx.fillText(p.name, w * 0.72, rosterY + 28 + i * 22);
  });
  ctx.restore();
}

function drawSummaryOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(8, 10, 18, 0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffe080";
  ctx.font = "bold 32px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Teams locked — battle begins!", w / 2, h * 0.45);
  ctx.restore();
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  st: HostStateJson,
  w: number,
  scale: number
): void {
  const tk = st.tanks;
  if (!tk) return;

  ctx.save();
  ctx.fillStyle = "rgba(10, 12, 20, 0.72)";
  ctx.fillRect(8, 8, w - 16, 44);
  ctx.fillStyle = "#f0f0f8";
  ctx.font = `bold ${Math.max(14, Math.floor(16 * scale))}px system-ui,sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const r = tk.roundsToWin;
  let line = `RED ${tk.redScore}/${r} — BLUE ${tk.blueScore}/${r}`;
  if (tk.turnPlayerId !== null && tk.subPhase === "aim") {
    const active = tk.players.find((p) => p.playerId === tk.turnPlayerId);
    line += ` · ${active?.name ?? `P${tk.turnPlayerId}`}'s turn (${tk.turnSecLeft}s)`;
  } else if (tk.subPhase === "flight") {
    line += " · Shell in flight…";
  }
  ctx.fillText(line, 20, 30);
  ctx.restore();
}

function drawKickoff(ctx: CanvasRenderingContext2D, countdown: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = countdown <= 0 ? "#7dff7d" : "#ffe080";
  ctx.font = "bold 72px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(countdown <= 0 ? "GO!" : String(countdown), w / 2, h * 0.42);
  ctx.restore();
}

function drawWinnerOverlay(ctx: CanvasRenderingContext2D, st: HostStateJson, w: number, h: number): void {
  const tk = st.tanks;
  if (!tk?.winner) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = tk.winner === "red" ? "#ff6666" : tk.winner === "blue" ? "#66aaff" : "#ddd";
  ctx.font = "bold 40px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const msg =
    tk.winner === "tie" ? "Match tied!" : `${tk.winner.toUpperCase()} wins the match!`;
  ctx.fillText(msg, w / 2, h * 0.4);
  ctx.fillStyle = "#ccc";
  ctx.font = "20px system-ui,sans-serif";
  ctx.fillText("Choose on your controller", w / 2, h * 0.48);
  ctx.restore();
}

export function drawTanks(
  ctx: CanvasRenderingContext2D,
  st: HostStateJson,
  w: number,
  h: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const tk = st.tanks;
  if (!tk) return;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  drawField(ctx, tk.field);

  if (st.phase === "tanks_team_select") {
    ctx.restore();
    drawTeamSelectOverlay(ctx, st, w, h);
    return;
  }

  if (st.phase === "tanks_summary") {
    drawSummaryOverlay(ctx, w / scale, h / scale);
    ctx.restore();
    return;
  }

  for (const p of tk.players) {
    const active = tk.turnPlayerId === p.playerId && tk.subPhase === "aim";
    drawTank(ctx, p.x, p.y, p.angle, p.hue, p.team, p.name, p.alive, active);
    if (active && p.alive) {
      drawAimPreview(ctx, p.x, p.y, p.angle, p.power);
    }
  }

  if (tk.projectile) {
    drawProjectile(ctx, tk.projectile.x, tk.projectile.y, tk.projectile.ownerTeam);
  }
  if (tk.explosion) {
    drawExplosion(ctx, tk.explosion.x, tk.explosion.y, tk.explosion.radius);
  }

  ctx.restore();

  drawHud(ctx, st, w, scale);

  const cd = tk.kickoffCountdown;
  if (cd !== null && cd !== prevTkKickCountdown) {
    if (cd <= 0) goFlashUntil = performance.now() + 500;
    prevTkKickCountdown = cd;
  }
  if (cd !== null && cd > 0) {
    drawKickoff(ctx, cd, w, h);
  } else if (performance.now() < goFlashUntil) {
    drawKickoff(ctx, 0, w, h);
  }

  if (st.phase === "tanks_results") {
    drawWinnerOverlay(ctx, st, w, h);
  }
}
