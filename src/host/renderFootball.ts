import type { HostStateJson } from "@shared/messages";
import { WORLD_H, WORLD_W } from "@shared/constants";
import { FOOTBALL_BALL_R, FOOTBALL_PLAYER_R } from "@shared/footballSettings";
import { fallbackPlayerHue } from "@shared/playerColors";

const MID_X = WORLD_W * 0.5;
const MID_Y = WORLD_H * 0.5;

let prevFbKickCountdown: number | null | undefined;
let goFlashUntil = 0;

function teamFill(team: "red" | "blue"): string {
  return team === "red" ? "#d03838" : "#2f62cf";
}

function drawFootballBall(ctx: CanvasRenderingContext2D, x: number, y: number, br: number): void {
  ctx.save();
  ctx.fillStyle = "#f4dcb4";
  ctx.strokeStyle = "#3a2918";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, br * 1.15, br * 0.78, Math.PI / 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#5a4832";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, br * 0.35, -0.2, Math.PI * 0.6);
  ctx.stroke();
  ctx.restore();
}

/** Thin halo: color shows who is barred — opposite team color, or gray if both. */
function drawLiveBallPickupBanRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  br: number,
  ban: { red: boolean; blue: boolean }
): void {
  if (!ban.red && !ban.blue) return;
  ctx.save();
  let stroke: string;
  if (ban.red && ban.blue) stroke = "rgba(195, 200, 212, 0.96)";
  else if (ban.red) stroke = "#3a6ee8";
  else stroke = "#d42828";

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, br * 1.15 + 3.5, br * 0.78 + 2.8, Math.PI / 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawAthlete(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pr: number,
  hue: number,
  team: "red" | "blue",
  label: string
): void {
  const jersey = teamFill(team);
  const inner = `hsl(${hue} 72% 54%)`;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = jersey;
  ctx.strokeStyle = "#0a0a12";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(0, 0, pr * 0.62, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#faf8f2";
  ctx.font = `${Math.max(9, Math.floor(pr * 0.48))}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, 0, -pr - 5);

  ctx.restore();
}

/** Full-screen pause overlay — match frogger QR rule (shown after blurred frame). */
function drawPausedOverlay(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number
): void {
  const fb = state.football;
  ctx.save();
  ctx.filter = "blur(2.5px)";
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();
  ctx.fillStyle = "rgba(8, 10, 14, 0.34)";
  ctx.fillRect(0, 0, canvasW, canvasH);
  const pausedBy = fb?.pausedByPlayerId ?? null;
  const nameById = new Map<number, string>();
  for (const p of state.lobbyPlayers ?? []) {
    const label = p.name?.trim() ? p.name.trim() : `P${p.playerId}`;
    nameById.set(p.playerId, label);
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

export function drawFootball(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const fb = state.football;
  if (!fb) return;

  const f = fb.field;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#262630";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const yTop = Math.min(f.fieldY0, f.fieldY1);
  const yBot = Math.max(f.fieldY0, f.fieldY1);
  const fh = Math.abs(f.fieldY1 - f.fieldY0);

  /** Team colors = own end zone (kickoff side); scoring is the far stripe for each team. */
  ctx.fillStyle = "rgba(208,56,56,0.42)";
  ctx.fillRect(0, yTop, f.redEzX1, fh);
  ctx.fillStyle = "rgba(56,118,236,0.38)";
  ctx.fillRect(f.blueEzX0, yTop, WORLD_W - f.blueEzX0, fh);

  /** Playing field only — full-width green was painting over end zone tints. */
  ctx.fillStyle = "#2f6f3f";
  ctx.fillRect(f.redEzX1, yTop, f.blueEzX0 - f.redEzX1, fh);

  const leftQuarterX = (f.redEzX1 + MID_X) * 0.5;
  const rightQuarterX = (MID_X + f.blueEzX0) * 0.5;

  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(f.redEzX1, yTop);
  ctx.lineTo(f.redEzX1, yBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(f.blueEzX0, yTop);
  ctx.lineTo(f.blueEzX0, yBot);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(leftQuarterX, yTop);
  ctx.lineTo(leftQuarterX, yBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightQuarterX, yTop);
  ctx.lineTo(rightQuarterX, yBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(MID_X, yTop);
  ctx.lineTo(MID_X, yBot);
  ctx.stroke();

  const sidelineRgb = "#1a2618";
  ctx.fillStyle = sidelineRgb;
  ctx.fillRect(0, 0, WORLD_W, yTop);
  ctx.fillRect(0, yBot, WORLD_W, WORLD_H - yBot);

  ctx.fillStyle = "rgba(245,248,252,0.85)";
  ctx.font = "bold 18px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`RED  ${fb.redScore}`, 14, Math.max(6, yTop - 52));
  ctx.textAlign = "right";
  ctx.fillText(`${fb.blueScore}  BLUE`, WORLD_W - 14, Math.max(6, yTop - 52));

  ctx.textAlign = "center";
  ctx.fillStyle = fb.timerExpired ? "#ffb347" : "#dce6f8";
  const clock = `${Math.floor(fb.timeLeftSec / 60)}:${String(fb.timeLeftSec % 60).padStart(2, "0")}`;
  ctx.fillText(
    fb.timerExpired ? `${clock} — next tackle or TD ends game` : clock,
    MID_X,
    Math.max(6, yTop - 54)
  );

  if (
    state.phase === "football_team_select" ||
    state.phase === "football_summary" ||
    state.phase === "football_results"
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
    for (const slot of fb.red) {
      const hue = slot.hue ?? fallbackPlayerHue(slot.playerId);
      ctx.fillStyle = `hsl(${hue} 74% 70%)`;
      ctx.fillText(`${slot.name} (#${slot.playerId})`, MID_X - 325, yy);
      yy += 26;
    }
    yy = MID_Y - 72;
    for (const slot of fb.blue) {
      const hue = slot.hue ?? fallbackPlayerHue(slot.playerId);
      ctx.fillStyle = `hsl(${hue} 74% 70%)`;
      ctx.fillText(`${slot.name} (#${slot.playerId})`, MID_X + 55, yy);
      yy += 26;
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffee99";
    ctx.font = "bold 22px system-ui,sans-serif";
    if (state.phase === "football_team_select") {
      ctx.fillText("Pick teams on your phone — START when ready (2+ players)", MID_X, MID_Y + 120);
    } else if (state.phase === "football_summary") {
      ctx.fillText("Teams locked — kicking off shortly", MID_X, MID_Y + 120);
    }
  }

  const pr = FOOTBALL_PLAYER_R;

  if (
    state.phase === "football" ||
    state.phase === "football_paused" ||
    state.phase === "football_results"
  ) {
    const br = FOOTBALL_BALL_R;

    for (const pl of fb.players) {
      const hue = pl.hue ?? fallbackPlayerHue(pl.playerId);
      const nm = pl.name?.trim() || `P${pl.playerId}`;
      drawAthlete(ctx, pl.x, pl.y, pr, hue, pl.team, nm);
    }

    if (fb.ball.live) {
      drawFootballBall(ctx, fb.ball.x, fb.ball.y, br);
      drawLiveBallPickupBanRing(ctx, fb.ball.x, fb.ball.y, br, fb.ball.pickupBan);
    } else if (fb.ball.carrierId !== null) {
      const carrier = fb.players.find((p) => p.playerId === fb.ball.carrierId);
      if (carrier) {
        const towardGoalX = carrier.team === "red" ? 1 : -1;
        const bx = carrier.x + towardGoalX * pr * 0.52;
        const by = carrier.y + pr * 0.1;
        drawFootballBall(ctx, bx, by, br);
      } else {
        drawFootballBall(ctx, fb.ball.x, fb.ball.y, br);
      }
    }
  }

  ctx.fillStyle = "rgba(218,226,246,0.55)";
  ctx.font = "12px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Series wins: " + JSON.stringify(fb.seriesWins), 10, WORLD_H - 8);

  ctx.restore();

  if (state.phase === "football_paused") {
    drawPausedOverlay(ctx, state, canvasW, canvasH);
  }

  const kc = fb.kickoffCountdown;
  if (kc !== null && kc > 0) {
    goFlashUntil = 0;
  } else if (prevFbKickCountdown !== undefined && prevFbKickCountdown! > 0 && (kc === null || kc <= 0)) {
    goFlashUntil = performance.now() + 900;
  }
  prevFbKickCountdown = kc;

  const showGo = performance.now() < goFlashUntil;
  const countNum = kc !== null && kc > 0 ? Math.ceil(kc) : 0;
  const showBig = (countNum >= 1 && countNum <= 5) || showGo;
  if (showBig && (state.phase === "football" || state.phase === "football_paused")) {
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

  if (state.phase === "football_results") {
    ctx.save();
    ctx.fillStyle = "rgba(10, 12, 20, 0.72)";
    ctx.fillRect(0, 0, canvasW, canvasH * 0.42);
    ctx.fillStyle = "#e8e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let y = 36;
    ctx.font = "bold 28px system-ui,sans-serif";
    let headline = "Match over — tie!";
    const wnr = fb.winner;
    if (wnr === "red") headline = "Red team wins!";
    else if (wnr === "blue") headline = "Blue team wins!";
    ctx.fillText(headline, canvasW / 2, y);
    y += 40;
    ctx.font = "16px system-ui,sans-serif";
    ctx.fillStyle = "#98a2c0";
    ctx.fillText(`${fb.redScore} — ${fb.blueScore}`, canvasW / 2, y);
    ctx.restore();
  }
}
