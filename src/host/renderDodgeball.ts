import type { HostStateJson } from "@shared/messages";
import { WORLD_H, WORLD_W } from "@shared/constants";
import { DODGEBALL_BALL_R, DODGEBALL_PLAYER_R } from "@shared/dodgeballSettings";
import { fallbackPlayerHue } from "@shared/playerColors";

const MID_X = WORLD_W * 0.5;
const MID_Y = WORLD_H * 0.5;

let prevDbKickCountdown: number | null | undefined;
let goFlashUntil = 0;

function teamFill(team: "red" | "blue"): string {
  return team === "red" ? "#d03838" : "#2f62cf";
}

function teamFillLive(team: "red" | "blue" | null): string {
  if (team === "red") return "#ff5555";
  if (team === "blue") return "#4a8cff";
  return "#e8e0d0";
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  br: number,
  live: boolean,
  liveTeam: "red" | "blue" | null
): void {
  ctx.save();
  ctx.fillStyle = live ? teamFillLive(liveTeam) : "#e8e0d0";
  ctx.strokeStyle = live ? "#1a1020" : "#4a4038";
  ctx.lineWidth = live ? 2.5 : 1.8;
  ctx.beginPath();
  ctx.arc(x, y, br, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (live) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, br + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pr: number,
  hue: number,
  team: "red" | "blue",
  label: string,
  alive: boolean,
  catching: boolean
): void {
  ctx.save();
  ctx.globalAlpha = alive ? 1 : 0.28;
  ctx.translate(x, y);

  if (catching && alive) {
    ctx.strokeStyle = "rgba(255, 230, 120, 0.95)";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, pr + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const jersey = teamFill(team);
  const inner = `hsl(${hue} 72% 54%)`;
  ctx.fillStyle = jersey;
  ctx.strokeStyle = "#0a0a12";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const dotR = pr * 0.26;
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(0, 0, dotR, 0, Math.PI * 2);
  ctx.fill();

  if (alive) {
    ctx.fillStyle = "#faf8f2";
    ctx.font = `${Math.max(9, Math.floor(pr * 0.48))}px system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, 0, -pr - 5);
  }

  ctx.restore();
}

function drawPausedOverlay(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number
): void {
  const db = state.dodgeball;
  ctx.save();
  ctx.filter = "blur(2.5px)";
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();
  ctx.fillStyle = "rgba(8, 10, 14, 0.34)";
  ctx.fillRect(0, 0, canvasW, canvasH);
  const pausedBy = db?.pausedByPlayerId ?? null;
  const nameById = new Map<number, string>();
  for (const p of state.lobbyPlayers ?? []) {
    nameById.set(p.playerId, p.name?.trim() ? p.name.trim() : `P${p.playerId}`);
  }
  const byText =
    pausedBy !== null ? `${nameById.get(pausedBy) ?? `P${pausedBy}`} paused the game` : "Paused";
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

export function drawDodgeball(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const db = state.dodgeball;
  if (!db) return;

  const c = db.court;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#262630";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  ctx.fillStyle = "rgba(208,56,56,0.28)";
  ctx.fillRect(c.x0, c.y0, c.midX - c.x0, c.y1 - c.y0);
  ctx.fillStyle = "rgba(56,118,236,0.26)";
  ctx.fillRect(c.midX, c.y0, c.x1 - c.midX, c.y1 - c.y0);

  ctx.fillStyle = "#3a5a48";
  ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(c.midX, c.y0);
  ctx.lineTo(c.midX, c.y1);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#1a2618";
  ctx.fillRect(0, 0, WORLD_W, c.y0);
  ctx.fillRect(0, c.y1, WORLD_W, WORLD_H - c.y1);

  ctx.fillStyle = "rgba(245,248,252,0.85)";
  ctx.font = "bold 18px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`RED  ${db.redScore}/${db.roundsToWin}`, 14, Math.max(6, c.y0 - 52));
  ctx.textAlign = "right";
  ctx.fillText(`${db.blueScore}/${db.roundsToWin}  BLUE`, WORLD_W - 14, Math.max(6, c.y0 - 52));

  if (
    state.phase === "dodgeball_team_select" ||
    state.phase === "dodgeball_summary" ||
    state.phase === "dodgeball_results"
  ) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(MID_X - 340, MID_Y - 118, 300, 210);
    ctx.fillRect(MID_X + 40, MID_Y - 118, 300, 210);
    ctx.fillStyle = "#f2eacf";
    ctx.font = "bold 16px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RED TEAM", MID_X - 190, MID_Y - 98);
    ctx.fillText("BLUE TEAM", MID_X + 190, MID_Y - 98);
    ctx.font = "14px system-ui,sans-serif";
    ctx.textAlign = "left";
    let yy = MID_Y - 72;
    for (const slot of db.red) {
      ctx.fillStyle = `hsl(${slot.hue ?? fallbackPlayerHue(slot.playerId)} 74% 70%)`;
      ctx.fillText(`${slot.name} (#${slot.playerId})`, MID_X - 325, yy);
      yy += 26;
    }
    yy = MID_Y - 72;
    for (const slot of db.blue) {
      ctx.fillStyle = `hsl(${slot.hue ?? fallbackPlayerHue(slot.playerId)} 74% 70%)`;
      ctx.fillText(`${slot.name} (#${slot.playerId})`, MID_X + 55, yy);
      yy += 26;
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffee99";
    ctx.font = "bold 22px system-ui,sans-serif";
    if (state.phase === "dodgeball_team_select") {
      ctx.fillText("Pick teams on your phone — START when ready (2+ players)", MID_X, MID_Y + 120);
    } else if (state.phase === "dodgeball_summary") {
      ctx.fillText("Teams locked — opening rush shortly", MID_X, MID_Y + 120);
    }
  }

  const pr = DODGEBALL_PLAYER_R;
  const br = DODGEBALL_BALL_R;

  if (
    state.phase === "dodgeball" ||
    state.phase === "dodgeball_paused" ||
    state.phase === "dodgeball_results"
  ) {
    for (const ball of db.balls) {
      if (ball.carrierId !== null) continue;
      drawBall(ctx, ball.x, ball.y, br, ball.live, ball.liveTeam);
    }

    for (const pl of db.players) {
      const hue = pl.hue ?? fallbackPlayerHue(pl.playerId);
      const nm = pl.name?.trim() || `P${pl.playerId}`;
      drawPlayer(ctx, pl.x, pl.y, pr, hue, pl.team, nm, pl.alive, pl.catching);
    }

    for (const pl of db.players) {
      if (pl.holdingBallId === null) continue;
      const ball = db.balls.find((b) => b.id === pl.holdingBallId);
      if (!ball) continue;
      const towardOpp = pl.team === "red" ? 1 : -1;
      drawBall(ctx, pl.x + towardOpp * pr * 0.45, pl.y, br, false, null);
    }
  }

  ctx.fillStyle = "rgba(218,226,246,0.55)";
  ctx.font = "12px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Series wins: " + JSON.stringify(db.seriesWins), 10, WORLD_H - 8);

  ctx.restore();

  if (state.phase === "dodgeball_paused") {
    drawPausedOverlay(ctx, state, canvasW, canvasH);
  }

  const kc = db.kickoffCountdown;
  if (kc !== null && kc > 0) {
    goFlashUntil = 0;
  } else if (prevDbKickCountdown !== undefined && prevDbKickCountdown! > 0 && (kc === null || kc <= 0)) {
    goFlashUntil = performance.now() + 900;
  }
  prevDbKickCountdown = kc;

  const showGo = performance.now() < goFlashUntil;
  const countNum = kc !== null && kc > 0 ? Math.ceil(kc) : 0;
  const showBig = (countNum >= 1 && countNum <= 5) || showGo;
  if (showBig && (state.phase === "dodgeball" || state.phase === "dodgeball_paused")) {
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

  if (state.phase === "dodgeball_results") {
    ctx.save();
    ctx.fillStyle = "rgba(10, 12, 20, 0.72)";
    ctx.fillRect(0, 0, canvasW, canvasH * 0.42);
    ctx.fillStyle = "#e8e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let y = 36;
    ctx.font = "bold 28px system-ui,sans-serif";
    let headline = "Match over — tie!";
    const wnr = db.winner;
    if (wnr === "red") headline = "Red team wins!";
    else if (wnr === "blue") headline = "Blue team wins!";
    ctx.fillText(headline, canvasW / 2, y);
    y += 40;
    ctx.font = "16px system-ui,sans-serif";
    ctx.fillStyle = "#98a2c0";
    ctx.fillText(
      `${db.redScore}/${db.roundsToWin} — ${db.blueScore}/${db.roundsToWin}`,
      canvasW / 2,
      y
    );
    ctx.restore();
  }
}
