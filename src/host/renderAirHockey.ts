import type { HostStateJson } from "@shared/messages";
import { WORLD_H, WORLD_W } from "@shared/constants";
import {
  AIR_HOCKEY_PLAYER_R,
  AIR_HOCKEY_PUCK_R,
  AIR_HOCKEY_RINK_CORNER_R,
} from "@shared/airHockeySettings";
import { fallbackPlayerHue } from "@shared/playerColors";

const MID_Y = WORLD_H * 0.5;

let prevAhKickCountdown: number | null | undefined;
let goFlashUntil = 0;

function teamFill(team: "red" | "blue"): string {
  return team === "red" ? "#d03838" : "#2f62cf";
}

function drawPuck(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.fillStyle = "#11131a";
  ctx.strokeStyle = "#3a3f4d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(220,226,240,0.20)";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMallet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pr: number,
  hue: number,
  team: "red" | "blue",
  label: string
): void {
  const jersey = teamFill(team);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = jersey;
  ctx.strokeStyle = "#0a0a12";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  /** Cap knob: personal hue so the team color dominates the rim. */
  ctx.fillStyle = `hsl(${hue} 72% 56%)`;
  ctx.beginPath();
  ctx.arc(0, 0, pr * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(12, 12, 20, 0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#faf8f2";
  ctx.font = `${Math.max(9, Math.floor(pr * 0.42))}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, 0, -pr - 5);
  ctx.restore();
}

function drawPausedOverlay(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number
): void {
  const ah = state.airHockey;
  ctx.save();
  ctx.filter = "blur(2.5px)";
  ctx.drawImage(ctx.canvas, 0, 0);
  ctx.restore();
  ctx.fillStyle = "rgba(8, 10, 14, 0.34)";
  ctx.fillRect(0, 0, canvasW, canvasH);
  const pausedBy = ah?.pausedByPlayerId ?? null;
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

export function drawAirHockey(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const ah = state.airHockey;
  if (!ah) return;
  const rink = ah.rink;
  const midX = rink.midX;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#1a1f2b";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const rinkW = rink.x1 - rink.x0;
  const rinkH = rink.y1 - rink.y0;
  const cr = Math.min(AIR_HOCKEY_RINK_CORNER_R, rinkW / 2, rinkH / 2);

  // Goal cages sit in the inset behind each end wall, so they're clearly visible.
  const goalDepth = Math.max(14, rink.x0 - 14);
  const drawGoalCage = (cageX: number, color: string): void => {
    const gy0 = rink.goalY0;
    const gy1 = rink.goalY1;
    ctx.save();
    // Net backing.
    ctx.fillStyle = "rgba(245,248,252,0.16)";
    ctx.fillRect(cageX, gy0, goalDepth, gy1 - gy0);
    // Net mesh.
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = cageX + 6; gx < cageX + goalDepth; gx += 9) {
      ctx.moveTo(gx, gy0);
      ctx.lineTo(gx, gy1);
    }
    for (let gyy = gy0 + 6; gyy < gy1; gyy += 9) {
      ctx.moveTo(cageX, gyy);
      ctx.lineTo(cageX + goalDepth, gyy);
    }
    ctx.stroke();
    // Goal frame posts + crossbars in team color.
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cageX, gy0);
    ctx.lineTo(cageX + goalDepth, gy0);
    ctx.lineTo(cageX + goalDepth, gy1);
    ctx.lineTo(cageX, gy1);
    ctx.stroke();
    ctx.restore();
  };
  drawGoalCage(rink.x0 - goalDepth, "#d03838");
  drawGoalCage(rink.x1, "#2f62cf");

  // Ice surface (rounded), clip so tints/lines stay inside the boards.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rink.x0, rink.y0, rinkW, rinkH, cr);
  ctx.fillStyle = "#cdd9ec";
  ctx.fill();
  ctx.clip();

  // Faint team tints on each half.
  ctx.fillStyle = "rgba(208,56,56,0.12)";
  ctx.fillRect(rink.x0, rink.y0, midX - rink.x0, rinkH);
  ctx.fillStyle = "rgba(56,118,236,0.12)";
  ctx.fillRect(midX, rink.y0, rink.x1 - midX, rinkH);

  // Center line + circle.
  ctx.strokeStyle = "rgba(40,60,90,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(midX, rink.y0);
  ctx.lineTo(midX, rink.y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(midX, MID_Y, Math.min(rinkH, rinkW) * 0.13, 0, Math.PI * 2);
  ctx.stroke();

  // Goal creases in front of each mouth.
  ctx.strokeStyle = "rgba(208,56,56,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rink.x0, MID_Y, (rink.goalY1 - rink.goalY0) * 0.62, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(56,118,236,0.4)";
  ctx.beginPath();
  ctx.arc(rink.x1, MID_Y, (rink.goalY1 - rink.goalY0) * 0.62, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.stroke();
  ctx.restore();

  // Boards (rink walls), drawn as a rounded outline with gaps at the goal mouths.
  ctx.save();
  ctx.strokeStyle = "#0c1320";
  ctx.lineWidth = 5;
  // Full rounded board outline.
  ctx.beginPath();
  ctx.roundRect(rink.x0, rink.y0, rinkW, rinkH, cr);
  ctx.stroke();
  // Erase the wall across each goal mouth so the opening reads as a gap.
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  ctx.fillRect(rink.x0 - 4, rink.goalY0, 8, rink.goalY1 - rink.goalY0);
  ctx.fillRect(rink.x1 - 4, rink.goalY0, 8, rink.goalY1 - rink.goalY0);
  ctx.restore();
  ctx.restore();

  // Goal mouth posts (team-colored) framing each opening.
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#d03838";
  ctx.beginPath();
  ctx.moveTo(rink.x0, rink.goalY0 - 6);
  ctx.lineTo(rink.x0, rink.goalY0);
  ctx.moveTo(rink.x0, rink.goalY1);
  ctx.lineTo(rink.x0, rink.goalY1 + 6);
  ctx.stroke();
  ctx.strokeStyle = "#2f62cf";
  ctx.beginPath();
  ctx.moveTo(rink.x1, rink.goalY0 - 6);
  ctx.lineTo(rink.x1, rink.goalY0);
  ctx.moveTo(rink.x1, rink.goalY1);
  ctx.lineTo(rink.x1, rink.goalY1 + 6);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Scoreboard.
  ctx.fillStyle = "rgba(245,248,252,0.9)";
  ctx.font = "bold 18px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`RED  ${ah.redScore}/${ah.goalsToWin}`, 14, Math.max(6, rink.y0 - 28));
  ctx.textAlign = "right";
  ctx.fillText(`${ah.blueScore}/${ah.goalsToWin}  BLUE`, WORLD_W - 14, Math.max(6, rink.y0 - 28));

  ctx.textAlign = "center";
  ctx.fillStyle = ah.timerExpired ? "#ffb347" : "#1a2436";
  const clock = `${Math.floor(ah.timeLeftSec / 60)}:${String(ah.timeLeftSec % 60).padStart(2, "0")}`;
  ctx.fillText(
    ah.timerExpired ? `${clock} — next goal ends game` : clock,
    midX,
    Math.max(6, rink.y0 - 28)
  );

  if (
    state.phase === "air_hockey_team_select" ||
    state.phase === "air_hockey_summary" ||
    state.phase === "air_hockey_results"
  ) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(midX - 340, MID_Y - 118, 300, 210);
    ctx.fillRect(midX + 40, MID_Y - 118, 300, 210);
    ctx.fillStyle = "#f2eacf";
    ctx.font = "bold 16px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RED TEAM", midX - 190, MID_Y - 98);
    ctx.fillText("BLUE TEAM", midX + 190, MID_Y - 98);
    ctx.font = "14px system-ui,sans-serif";
    ctx.textAlign = "left";
    let yy = MID_Y - 72;
    for (const slot of ah.red) {
      const hue = slot.hue ?? fallbackPlayerHue(slot.playerId);
      ctx.fillStyle = `hsl(${hue} 74% 70%)`;
      ctx.fillText(`${slot.name} (#${slot.playerId})`, midX - 325, yy);
      yy += 26;
    }
    yy = MID_Y - 72;
    for (const slot of ah.blue) {
      const hue = slot.hue ?? fallbackPlayerHue(slot.playerId);
      ctx.fillStyle = `hsl(${hue} 74% 70%)`;
      ctx.fillText(`${slot.name} (#${slot.playerId})`, midX + 55, yy);
      yy += 26;
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffee99";
    ctx.font = "bold 22px system-ui,sans-serif";
    if (state.phase === "air_hockey_team_select") {
      ctx.fillText("Pick a side on your phone — START when ready (2+ players)", midX, MID_Y + 120);
    } else if (state.phase === "air_hockey_summary") {
      ctx.fillText("Teams locked — face-off shortly", midX, MID_Y + 120);
    }
  }

  if (
    state.phase === "air_hockey" ||
    state.phase === "air_hockey_paused" ||
    state.phase === "air_hockey_results"
  ) {
    const pr = AIR_HOCKEY_PLAYER_R;
    for (const m of ah.mallets) {
      const hue = m.hue ?? fallbackPlayerHue(m.playerId);
      const nm = m.name?.trim() || `P${m.playerId}`;
      drawMallet(ctx, m.x, m.y, pr, hue, m.team, nm);
    }
    drawPuck(ctx, ah.puck.x, ah.puck.y, AIR_HOCKEY_PUCK_R);
  }

  ctx.fillStyle = "rgba(40,52,80,0.55)";
  ctx.font = "12px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Series wins: " + JSON.stringify(ah.seriesWins), 10, WORLD_H - 8);

  ctx.restore();

  if (state.phase === "air_hockey_paused") {
    drawPausedOverlay(ctx, state, canvasW, canvasH);
  }

  const kc = ah.kickoffCountdown;
  if (kc !== null && kc > 0) {
    goFlashUntil = 0;
  } else if (prevAhKickCountdown !== undefined && prevAhKickCountdown! > 0 && (kc === null || kc <= 0)) {
    goFlashUntil = performance.now() + 900;
  }
  prevAhKickCountdown = kc;

  const showGo = performance.now() < goFlashUntil;
  const countNum = kc !== null && kc > 0 ? Math.ceil(kc) : 0;
  const showBig = (countNum >= 1 && countNum <= 5) || showGo;
  if (showBig && (state.phase === "air_hockey" || state.phase === "air_hockey_paused")) {
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

  if (state.phase === "air_hockey_results") {
    ctx.save();
    ctx.fillStyle = "rgba(10, 12, 20, 0.72)";
    ctx.fillRect(0, 0, canvasW, canvasH * 0.42);
    ctx.fillStyle = "#e8e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let y = 36;
    ctx.font = "bold 28px system-ui,sans-serif";
    let headline = "Match over — tie!";
    const wnr = ah.winner;
    if (wnr === "red") headline = "Red team wins!";
    else if (wnr === "blue") headline = "Blue team wins!";
    ctx.fillText(headline, canvasW / 2, y);
    y += 40;
    ctx.font = "16px system-ui,sans-serif";
    ctx.fillStyle = "#98a2c0";
    ctx.fillText(`${ah.redScore}/${ah.goalsToWin} — ${ah.blueScore}/${ah.goalsToWin}`, canvasW / 2, y);
    ctx.restore();
  }
}
