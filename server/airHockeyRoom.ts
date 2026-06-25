import { TICK_RATE } from "../src/shared/constants.js";
import type { AirHockeyTeam } from "../src/shared/messages.js";
import { fallbackPlayerHue } from "../src/shared/playerColors.js";
import {
  resolveAirHockeyGoalsToWin,
  resolveAirHockeyPeriodSec,
} from "../src/shared/airHockeyGameSettings.js";
import {
  AIR_HOCKEY_FACEOFF_JITTER,
  AIR_HOCKEY_GOAL_MOUTH_FRAC,
  AIR_HOCKEY_KICKOFF_COUNTDOWN_SEC,
  AIR_HOCKEY_MALLET_RESTITUTION,
  AIR_HOCKEY_MALLET_VELOCITY_TRANSFER,
  AIR_HOCKEY_MALLET_VELOCITY_TRANSFER_MAX,
  AIR_HOCKEY_MALLET_VELOCITY_TRANSFER_STEP,
  AIR_HOCKEY_MID_X,
  AIR_HOCKEY_PLAYER_BOUNCE_ITERS,
  AIR_HOCKEY_PLAYER_BOUNCE_STRENGTH,
  AIR_HOCKEY_PLAYER_R,
  AIR_HOCKEY_PUCK_DRAG,
  AIR_HOCKEY_PUCK_MAX_SPEED,
  AIR_HOCKEY_PUCK_R,
  AIR_HOCKEY_RINK_X0,
  AIR_HOCKEY_RINK_X1,
  AIR_HOCKEY_RINK_Y0,
  AIR_HOCKEY_RINK_Y1,
  AIR_HOCKEY_WALL_RESTITUTION,
} from "../src/shared/airHockeySettings.js";
import type { Room } from "./gameRoom.js";

export type AirHockeyMallet = {
  x: number;
  y: number;
  team: AirHockeyTeam;
  prevPauseHeld: boolean;
};

const SUMMARY_SEC = 3;

const X0 = AIR_HOCKEY_RINK_X0;
const X1 = AIR_HOCKEY_RINK_X1;
const Y0 = AIR_HOCKEY_RINK_Y0;
const Y1 = AIR_HOCKEY_RINK_Y1;
const MID_X = AIR_HOCKEY_MID_X;
const MID_Y = (Y0 + Y1) * 0.5;

const GOAL_HALF = ((Y1 - Y0) * AIR_HOCKEY_GOAL_MOUTH_FRAC) * 0.5;
const GOAL_Y0 = MID_Y - GOAL_HALF;
const GOAL_Y1 = MID_Y + GOAL_HALF;

export function airHockeyPhases(room: Room): boolean {
  const ph = room.phase;
  return (
    ph === "air_hockey_team_select" ||
    ph === "air_hockey_summary" ||
    ph === "air_hockey" ||
    ph === "air_hockey_paused" ||
    ph === "air_hockey_results"
  );
}

export function clearAirHockeyState(room: Room): void {
  room.airHockeyTeamPick.clear();
  room.airHockeyTeamAssignment.clear();
  room.airHockeyMallets.clear();
  room.airHockeyPuck = { x: MID_X, y: MID_Y, vx: 0, vy: 0 };
  room.airHockeyRedScore = 0;
  room.airHockeyBlueScore = 0;
  room.airHockeyTimeLeftSec = resolveAirHockeyPeriodSec(room.gameSettings);
  room.airHockeyTimerExpired = false;
  room.airHockeySummaryEndTick = null;
  room.airHockeyKickoffCountdown = null;
  room.airHockeyPausedByPlayerId = null;
  room.airHockeyWinner = null;
  room.airHockeyVelocityTransferHits = 0;
}

export function bootstrapAirHockeyFromMenu(room: Room): void {
  room.phase = "air_hockey_team_select";
  room.stubId = null;
  room.showQr = false;
  clearAirHockeyState(room);
}

function rosterSlot(room: Room, pid: number) {
  const pl = room.players.get(pid);
  return {
    playerId: pid,
    name: pl?.name ?? `P${pid}`,
    hue: pl?.hue ?? fallbackPlayerHue(pid),
  };
}

function buildRosters(room: Room): {
  red: { playerId: number; name: string; hue: number }[];
  blue: { playerId: number; name: string; hue: number }[];
} {
  const red: { playerId: number; name: string; hue: number }[] = [];
  const blue: { playerId: number; name: string; hue: number }[] = [];
  for (const [pid, t] of room.airHockeyTeamPick) {
    if (t === "red") red.push(rosterSlot(room, pid));
    else blue.push(rosterSlot(room, pid));
  }
  red.sort((a, b) => a.playerId - b.playerId);
  blue.sort((a, b) => a.playerId - b.playerId);
  return { red, blue };
}

/** Finalize picks + balance-assign stragglers; set summary phase timer. */
export function airHockeyTryStart(room: Room): boolean {
  if (room.phase !== "air_hockey_team_select") return false;
  const ids = [...room.players.keys()].sort((a, b) => a - b);
  if (ids.length < 2) return false;
  room.airHockeyTeamAssignment.clear();
  for (const id of ids) {
    const p = room.airHockeyTeamPick.get(id);
    if (p === "red" || p === "blue") room.airHockeyTeamAssignment.set(id, p);
  }
  let reds = [...room.airHockeyTeamAssignment.values()].filter((t) => t === "red").length;
  let blues = ids.length - reds;
  for (const id of ids) {
    if (room.airHockeyTeamAssignment.has(id)) continue;
    const choose: AirHockeyTeam = reds <= blues ? "red" : "blue";
    room.airHockeyTeamAssignment.set(id, choose);
    if (choose === "red") reds++;
    else blues++;
  }
  room.phase = "air_hockey_summary";
  room.airHockeySummaryEndTick = room.tick + Math.floor(TICK_RATE * SUMMARY_SEC);
  return true;
}

/** Vertical spread across playable height. */
function malletStartY(index: number, total: number): number {
  const pr = AIR_HOCKEY_PLAYER_R;
  const lo = Y0 + pr;
  const hi = Y1 - pr;
  if (total <= 1) return (lo + hi) * 0.5;
  return lo + (index / (total - 1)) * (hi - lo);
}

function initFaceoffLayout(room: Room): void {
  const p = room.airHockeyPuck;
  p.x = MID_X;
  p.y = MID_Y;
  p.vx = (Math.random() - 0.5) * 2 * AIR_HOCKEY_FACEOFF_JITTER;
  p.vy = (Math.random() - 0.5) * 2 * AIR_HOCKEY_FACEOFF_JITTER;

  const redIds = [...room.airHockeyTeamAssignment.entries()]
    .filter(([, t]) => t === "red")
    .map(([id]) => id)
    .sort((a, b) => a - b);
  const blueIds = [...room.airHockeyTeamAssignment.entries()]
    .filter(([, t]) => t === "blue")
    .map(([id]) => id)
    .sort((a, b) => a - b);

  const pr = AIR_HOCKEY_PLAYER_R;
  const redX = X0 + (MID_X - X0) * 0.4;
  const blueX = X1 - (X1 - MID_X) * 0.4;

  for (let i = 0; i < redIds.length; i++) {
    const id = redIds[i]!;
    room.airHockeyMallets.set(id, {
      x: Math.max(X0 + pr, Math.min(MID_X - pr, redX)),
      y: malletStartY(i, redIds.length),
      team: "red",
      prevPauseHeld: false,
    });
  }
  for (let i = 0; i < blueIds.length; i++) {
    const id = blueIds[i]!;
    room.airHockeyMallets.set(id, {
      x: Math.max(MID_X + pr, Math.min(X1 - pr, blueX)),
      y: malletStartY(i, blueIds.length),
      team: "blue",
      prevPauseHeld: false,
    });
  }
}

export function tickAirHockeySummary(room: Room): void {
  if (room.phase !== "air_hockey_summary" || room.airHockeySummaryEndTick === null) return;
  if (room.tick < room.airHockeySummaryEndTick) return;
  room.phase = "air_hockey";
  room.airHockeyKickoffCountdown = AIR_HOCKEY_KICKOFF_COUNTDOWN_SEC;
  room.airHockeySummaryEndTick = null;
  initFaceoffLayout(room);
}

export function handleAirHockeyPauseEdge(
  room: Room,
  playerId: number,
  m: AirHockeyMallet,
  pauseHeld: boolean
): void {
  const edge = pauseHeld && !m.prevPauseHeld;
  m.prevPauseHeld = pauseHeld;
  if (!edge) return;
  if (room.phase === "air_hockey") {
    room.phase = "air_hockey_paused";
    room.airHockeyPausedByPlayerId = playerId;
  }
}

function clampMallet(m: AirHockeyMallet): void {
  const pr = AIR_HOCKEY_PLAYER_R;
  if (m.team === "red") {
    m.x = Math.max(X0 + pr, Math.min(MID_X - pr, m.x));
  } else {
    m.x = Math.max(MID_X + pr, Math.min(X1 - pr, m.x));
  }
  m.y = Math.max(Y0 + pr, Math.min(Y1 - pr, m.y));
}

function resolveMalletCrowding(room: Room): void {
  const ids = [...room.airHockeyMallets.keys()];
  const minD = AIR_HOCKEY_PLAYER_R * 2;
  const halfStrength = AIR_HOCKEY_PLAYER_BOUNCE_STRENGTH * 0.5;
  for (let iter = 0; iter < AIR_HOCKEY_PLAYER_BOUNCE_ITERS; iter++) {
    for (let i = 0; i < ids.length; i++) {
      const a = room.airHockeyMallets.get(ids[i]!);
      if (!a) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const b = room.airHockeyMallets.get(ids[j]!);
        if (!b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minD || d < 1e-8) continue;
        dx /= d;
        dy /= d;
        const push = (minD - d) * halfStrength;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }
  for (const id of ids) {
    const m = room.airHockeyMallets.get(id);
    if (m) clampMallet(m);
  }
}

function clampPuckSpeed(p: { vx: number; vy: number }): void {
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > AIR_HOCKEY_PUCK_MAX_SPEED) {
    const k = AIR_HOCKEY_PUCK_MAX_SPEED / sp;
    p.vx *= k;
    p.vy *= k;
  }
}

function resolveVelocityTransfer(room: Room): number {
  return Math.min(
    AIR_HOCKEY_MALLET_VELOCITY_TRANSFER_MAX,
    AIR_HOCKEY_MALLET_VELOCITY_TRANSFER +
      room.airHockeyVelocityTransferHits * AIR_HOCKEY_MALLET_VELOCITY_TRANSFER_STEP
  );
}

/** Reflect the puck off a mallet and transfer the mallet's input velocity along the normal. */
function resolvePuckMalletCollisions(room: Room): void {
  const p = room.airHockeyPuck;
  const minD = AIR_HOCKEY_PLAYER_R + AIR_HOCKEY_PUCK_R;
  for (const [pid, m] of room.airHockeyMallets) {
    let dx = p.x - m.x;
    let dy = p.y - m.y;
    let d = Math.hypot(dx, dy);
    if (d >= minD) continue;
    if (d < 1e-6) {
      dx = m.team === "red" ? 1 : -1;
      dy = 0;
      d = 1;
    }
    const nx = dx / d;
    const ny = dy / d;
    p.x = m.x + nx * minD;
    p.y = m.y + ny * minD;

    const vDotN = p.vx * nx + p.vy * ny;
    if (vDotN < 0) {
      const j = (1 + AIR_HOCKEY_MALLET_RESTITUTION) * vDotN;
      p.vx -= j * nx;
      p.vy -= j * ny;
    }

    const player = room.players.get(pid);
    const mvx = player?.input.footballVx ?? 0;
    const mvy = player?.input.footballVy ?? 0;
    const mDotN = mvx * nx + mvy * ny;
    if (mDotN > 0) {
      const transfer = resolveVelocityTransfer(room);
      p.vx += nx * mDotN * transfer;
      p.vy += ny * mDotN * transfer;
      room.airHockeyVelocityTransferHits++;
    }
    clampPuckSpeed(p);
  }
}

function endMatch(room: Room, winner: AirHockeyTeam | "tie"): void {
  room.phase = "air_hockey_results";
  room.menuIndex = 0;
  room.airHockeyWinner = winner;
  if (winner === "red" || winner === "blue") {
    for (const [pid, t] of room.airHockeyTeamAssignment) {
      if (t === winner) {
        room.seriesWins.set(pid, (room.seriesWins.get(pid) ?? 0) + 1);
      }
    }
  }
}

/** Clock hit 0: leader wins immediately; tied score enters sudden-death overtime. */
function onClockExpired(room: Room): void {
  if (room.airHockeyRedScore === room.airHockeyBlueScore) {
    room.airHockeyTimerExpired = true;
    return;
  }
  if (room.airHockeyRedScore > room.airHockeyBlueScore) {
    endMatch(room, "red");
  } else {
    endMatch(room, "blue");
  }
}

/** Returns true if the round ended (match over) so the caller can stop. */
function onGoal(room: Room, scoringTeam: AirHockeyTeam): boolean {
  const goalsNeed = resolveAirHockeyGoalsToWin(room.gameSettings);
  if (scoringTeam === "red") room.airHockeyRedScore++;
  else room.airHockeyBlueScore++;

  const scored = scoringTeam === "red" ? room.airHockeyRedScore : room.airHockeyBlueScore;
  if (scored >= goalsNeed) {
    endMatch(room, scoringTeam);
    return true;
  }
  if (room.airHockeyTimerExpired) {
    endMatch(room, scoringTeam);
    return true;
  }
  room.airHockeyVelocityTransferHits = 0;
  initFaceoffLayout(room);
  room.airHockeyKickoffCountdown = AIR_HOCKEY_KICKOFF_COUNTDOWN_SEC;
  return true;
}

export function tickAirHockeyPlay(room: Room, dt: number): void {
  if (room.phase !== "air_hockey") return;

  if (room.airHockeyKickoffCountdown !== null && room.airHockeyKickoffCountdown > 0) {
    room.airHockeyKickoffCountdown -= dt;
    if (room.airHockeyKickoffCountdown <= 0) room.airHockeyKickoffCountdown = null;
    return;
  }

  if (!room.airHockeyTimerExpired && room.airHockeyTimeLeftSec > 0) {
    room.airHockeyTimeLeftSec = Math.max(0, room.airHockeyTimeLeftSec - dt);
    if (room.airHockeyTimeLeftSec <= 0) {
      onClockExpired(room);
      if (room.phase !== "air_hockey") return;
    }
  }

  if (room.phase !== "air_hockey") return;

  // Move mallets from packed-joystick input velocity, locked to their own half.
  for (const [pid, m] of room.airHockeyMallets) {
    const pl = room.players.get(pid);
    if (!pl) continue;
    m.x += (pl.input.footballVx ?? 0) * dt;
    m.y += (pl.input.footballVy ?? 0) * dt;
    clampMallet(m);
  }
  resolveMalletCrowding(room);

  // Integrate puck with mild glide friction.
  const p = room.airHockeyPuck;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const k = Math.max(0, 1 - AIR_HOCKEY_PUCK_DRAG * dt);
  p.vx *= k;
  p.vy *= k;

  resolvePuckMalletCollisions(room);

  const r = AIR_HOCKEY_PUCK_R;

  // Top / bottom walls always reflect.
  if (p.y < Y0 + r) {
    p.y = Y0 + r;
    p.vy = Math.abs(p.vy) * AIR_HOCKEY_WALL_RESTITUTION;
  } else if (p.y > Y1 - r) {
    p.y = Y1 - r;
    p.vy = -Math.abs(p.vy) * AIR_HOCKEY_WALL_RESTITUTION;
  }

  // End walls reflect except across the goal mouth.
  const inMouth = p.y > GOAL_Y0 && p.y < GOAL_Y1;
  if (!inMouth) {
    if (p.x < X0 + r) {
      p.x = X0 + r;
      p.vx = Math.abs(p.vx) * AIR_HOCKEY_WALL_RESTITUTION;
    } else if (p.x > X1 - r) {
      p.x = X1 - r;
      p.vx = -Math.abs(p.vx) * AIR_HOCKEY_WALL_RESTITUTION;
    }
  } else {
    // In the goal mouth: a puck crossing the wall plane is a goal.
    if (p.x <= X0) {
      onGoal(room, "blue");
      return;
    }
    if (p.x >= X1) {
      onGoal(room, "red");
      return;
    }
  }
}

export function buildAirHockeyHostJson(
  room: Room
): import("../src/shared/messages.js").HostStateJson["airHockey"] {
  if (
    room.phase !== "air_hockey_team_select" &&
    room.phase !== "air_hockey_summary" &&
    room.phase !== "air_hockey" &&
    room.phase !== "air_hockey_paused" &&
    room.phase !== "air_hockey_results"
  ) {
    return null;
  }
  const { red, blue } = buildRosters(room);
  const rosterRed =
    room.phase === "air_hockey_team_select"
      ? red
      : [...room.airHockeyTeamAssignment.entries()]
          .filter(([, t]) => t === "red")
          .map(([id]) => rosterSlot(room, id))
          .sort((x, y) => x.playerId - y.playerId);
  const rosterBlue =
    room.phase === "air_hockey_team_select"
      ? blue
      : [...room.airHockeyTeamAssignment.entries()]
          .filter(([, t]) => t === "blue")
          .map(([id]) => rosterSlot(room, id))
          .sort((x, y) => x.playerId - y.playerId);

  const mallets: {
    playerId: number;
    name: string;
    hue: number;
    team: AirHockeyTeam;
    x: number;
    y: number;
  }[] = [];
  if (
    room.phase === "air_hockey" ||
    room.phase === "air_hockey_paused" ||
    room.phase === "air_hockey_results"
  ) {
    for (const [pid, m] of room.airHockeyMallets) {
      const pl = room.players.get(pid);
      mallets.push({
        playerId: pid,
        name: pl?.name ?? `P${pid}`,
        hue: pl?.hue ?? fallbackPlayerHue(pid),
        team: m.team,
        x: m.x,
        y: m.y,
      });
    }
    mallets.sort((x, y) => x.playerId - y.playerId);
  }

  return {
    red: rosterRed,
    blue: rosterBlue,
    mallets,
    puck: { x: room.airHockeyPuck.x, y: room.airHockeyPuck.y },
    redScore: room.airHockeyRedScore,
    blueScore: room.airHockeyBlueScore,
    goalsToWin: resolveAirHockeyGoalsToWin(room.gameSettings),
    timeLeftSec: Math.ceil(room.airHockeyTimeLeftSec),
    timerExpired: room.airHockeyTimerExpired,
    kickoffCountdown:
      room.airHockeyKickoffCountdown !== null && room.airHockeyKickoffCountdown > 0
        ? Math.ceil(room.airHockeyKickoffCountdown)
        : null,
    paused: room.phase === "air_hockey_paused",
    pausedByPlayerId: room.airHockeyPausedByPlayerId,
    seriesWins: Object.fromEntries(room.seriesWins),
    winner: room.phase === "air_hockey_results" ? (room.airHockeyWinner ?? "tie") : null,
    rink: {
      x0: X0,
      x1: X1,
      y0: Y0,
      y1: Y1,
      midX: MID_X,
      goalY0: GOAL_Y0,
      goalY1: GOAL_Y1,
    },
  };
}
