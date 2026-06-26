import { TICK_RATE, WORLD_H, WORLD_W } from "../src/shared/constants.js";
import type { FootballTeam } from "../src/shared/messages.js";
import { fallbackPlayerHue } from "../src/shared/playerColors.js";
import {
  resolveFootballMaxPlayerSpeed,
  resolveFootballPeriodSec,
  resolveFootballTdToWin,
} from "../src/shared/footballGameSettings.js";
import {
  FOOTBALL_BALL_R,
  FOOTBALL_BLUE_EZ_X0,
  FOOTBALL_FIELD_MARGIN_Y,
  FOOTBALL_FIELD_X0,
  FOOTBALL_FIELD_X1,
  FOOTBALL_KICKOFF_X_INSET,
  FOOTBALL_KICKOFF_BALL_JITTER,
  FOOTBALL_KICKOFF_COUNTDOWN_SEC,
  FOOTBALL_LIVE_BALL_X0,
  FOOTBALL_LIVE_BALL_X1,
  FOOTBALL_POST_TD_BALL_FRAC_FROM_MID,
  FOOTBALL_OPPONENT_TACKLE_PICKUP_LOCK_SEC,
  FOOTBALL_PASS_SPEED,
  FOOTBALL_POST_PASS_GLOBAL_PICKUP_LOCK_SEC,
  FOOTBALL_PLAYER_BOUNCE_CONTACT_SPEED_MUL,
  FOOTBALL_PLAYER_BOUNCE_RECOVERY_PER_SEC,
  FOOTBALL_PASS_TEAMMATE_LOCK_SEC,
  FOOTBALL_PLAYER_R,
  FOOTBALL_RED_EZ_X1,
  FOOTBALL_TACKLE_PICKUP_LOCK_SEC,
} from "../src/shared/footballSettings.js";
import { Btn } from "../src/shared/protocol.js";
import type { Room } from "./gameRoom.js";

export type FootballAthlete = {
  x: number;
  y: number;
  team: FootballTeam;
  prevPauseHeld: boolean;
  prevPassHeld: boolean;
  /** 1 = normal; lowered after non-carrier bounce contact, recovers over time. Carrier stays 1. */
  bounceInputMul: number;
};

const SUMMARY_SEC = 3;
const BALL_FLING_SPEED = 320;
const BALL_DRAG = 1.3;
/** Opposing players tackle when their circles overlap (center distance ≤ sum of radii). */
const TACKLE_DIST = FOOTBALL_PLAYER_R * 2;
const PICKUP_DIST = FOOTBALL_PLAYER_R + FOOTBALL_BALL_R - 2;

/**
 * Non-carriers gently separate when overlapping. Ball carrier skips this entirely — only tackle
 * applies vs opponents (carrier position is input-only aside from clamp).
 */
const PLAYER_BOUNCE_ITERS = 2;
const PLAYER_BOUNCE_STRENGTH = 0.42;

function decayFootballBounceFriction(room: Room, dt: number): void {
  const rate = FOOTBALL_PLAYER_BOUNCE_RECOVERY_PER_SEC * dt;
  for (const a of room.footballAthletes.values()) {
    if (a.bounceInputMul >= 1) continue;
    a.bounceInputMul = Math.min(1, a.bounceInputMul + rate);
  }
}

function resolveNonCarrierPlayerBounces(room: Room, carrierId: number | null): void {
  const ids = [...room.footballAthletes.keys()];
  const minD = FOOTBALL_PLAYER_R * 2;
  const halfStrength = PLAYER_BOUNCE_STRENGTH * 0.5;

  for (let iter = 0; iter < PLAYER_BOUNCE_ITERS; iter++) {
    for (let i = 0; i < ids.length; i++) {
      const idA = ids[i]!;
      if (carrierId !== null && idA === carrierId) continue;
      const a = room.footballAthletes.get(idA);
      if (!a) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const idB = ids[j]!;
        if (carrierId !== null && idB === carrierId) continue;
        const b = room.footballAthletes.get(idB);
        if (!b) continue;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minD || d < 1e-8) continue;
        dx /= d;
        dy /= d;
        const overlap = minD - d;
        const push = overlap * halfStrength;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        const cm = FOOTBALL_PLAYER_BOUNCE_CONTACT_SPEED_MUL;
        a.bounceInputMul = Math.min(a.bounceInputMul, cm);
        b.bounceInputMul = Math.min(b.bounceInputMul, cm);
      }
    }
  }

  for (const id of ids) {
    if (carrierId !== null && id === carrierId) continue;
    const a = room.footballAthletes.get(id);
    if (a) clampAthlete(room, a);
  }
}

const FIELD_Y0 = FOOTBALL_FIELD_MARGIN_Y;
const FIELD_Y1 = WORLD_H - FOOTBALL_FIELD_MARGIN_Y;
const MID_X = WORLD_W * 0.5;
const MID_Y = WORLD_H * 0.5;

export function footballPhases(room: Room): boolean {
  const ph = room.phase;
  return (
    ph === "football_team_select" ||
    ph === "football_summary" ||
    ph === "football" ||
    ph === "football_paused" ||
    ph === "football_results"
  );
}

export function clearFootballState(room: Room): void {
  room.footballTeamPick.clear();
  room.footballTeamAssignment.clear();
  room.footballAthletes.clear();
  room.footballBall = { x: MID_X, y: MID_Y, vx: 0, vy: 0, carrierId: null };
  room.footballRedScore = 0;
  room.footballBlueScore = 0;
  room.footballTimeLeftSec = resolveFootballPeriodSec(room.gameSettings);
  room.footballTimerExpired = false;
  room.footballPickupLockTeam = null;
  room.footballPickupLockUntilTick = 0;
  room.footballOpponentPickupLockTeam = null;
  room.footballOpponentPickupLockUntilTick = 0;
  room.footballPickupFreezeUntilTick = 0;
  room.footballSummaryEndTick = null;
  room.footballKickoffCountdown = null;
  room.footballPausedByPlayerId = null;
  room.footballWinner = null;
}

export function bootstrapFootballFromMenu(room: Room): void {
  room.phase = "football_team_select";
  room.stubId = null;
  room.showQr = false;
  room.kartCars.clear();
  room.kartWinnerId = null;
  room.kartCountdown = null;
  room.kartPaused = false;
  room.kartPausedByPlayerId = null;
  room.raceWalkCountdown = null;
  room.raceWalkRunners = [];
  room.raceWalkShooters.clear();
  room.raceWalkNpcAi = [];
  room.raceWalkBanners = [];
  room.raceWalkWinnerLane = null;
  room.raceWalkWinnerPlayerId = null;
  room.raceWalkPausedByPlayerId = null;
  room.froggerCountdown = null;
  room.froggerBands = [];
  room.froggerFrogs.clear();
  room.froggerWinnerId = null;
  room.froggerPausedByPlayerId = null;
  room.froggerBanners = [];
  room.froggerDeathNotices.clear();
  clearFootballState(room);
}

function rosterSlot(room: Room, pid: number) {
  const pl = room.players.get(pid);
  return {
    playerId: pid,
    name: pl?.name ?? `P${pid}`,
    hue: pl?.hue ?? fallbackPlayerHue(pid),
  };
}

function buildRosters(room: Room): { red: { playerId: number; name: string; hue: number }[]; blue: { playerId: number; name: string; hue: number }[] } {
  const red: { playerId: number; name: string; hue: number }[] = [];
  const blue: { playerId: number; name: string; hue: number }[] = [];
  for (const [pid, t] of room.footballTeamPick) {
    if (t === "red") red.push(rosterSlot(room, pid));
    else blue.push(rosterSlot(room, pid));
  }
  red.sort((a, b) => a.playerId - b.playerId);
  blue.sort((a, b) => a.playerId - b.playerId);
  return { red, blue };
}

function teamOfPlayer(room: Room, pid: number): FootballTeam | null {
  return room.footballTeamAssignment.get(pid) ?? null;
}

/** Finalize picks + balance-assign stragglers; set summary phase timer. */
export function footballTryStart(room: Room): boolean {
  if (room.phase !== "football_team_select") return false;
  const ids = [...room.players.keys()].sort((a, b) => a - b);
  if (ids.length < 2) return false;
  room.footballTeamAssignment.clear();
  for (const id of ids) {
    const p = room.footballTeamPick.get(id);
    if (p === "red" || p === "blue") room.footballTeamAssignment.set(id, p);
  }
  let reds = [...room.footballTeamAssignment.values()].filter((t) => t === "red").length;
  let blues = ids.length - reds;
  for (const id of ids) {
    if (room.footballTeamAssignment.has(id)) continue;
    const choose: FootballTeam = reds <= blues ? "red" : "blue";
    room.footballTeamAssignment.set(id, choose);
    if (choose === "red") reds++;
    else blues++;
  }
  room.phase = "football_summary";
  room.footballSummaryEndTick = room.tick + Math.floor(TICK_RATE * SUMMARY_SEC);
  return true;
}

/** Vertical spread across playable height (sideline to sideline). */
function kickoffPlayerY(index: number, total: number): number {
  const pr = FOOTBALL_PLAYER_R;
  const lo = FIELD_Y0 + pr;
  const hi = FIELD_Y1 - pr;
  if (total <= 1) return (lo + hi) * 0.5;
  return lo + (index / (total - 1)) * (hi - lo);
}

/**
 * @param receivingTeam `null` = opening kickoff (ball midfield). After a TD, the team that was scored on receives → ball biased toward their side.
 */
function initKickoffLayout(room: Room, receivingTeam: FootballTeam | null): void {
  /** Match clock lives for the whole round — only reset in clearFootballState / new game. */
  room.footballBall.carrierId = null;
  const jitter = FOOTBALL_KICKOFF_BALL_JITTER;

  if (receivingTeam === null) {
    room.footballBall.x = MID_X;
    room.footballBall.y = MID_Y;
    room.footballBall.vx = (Math.random() - 0.5) * 2 * jitter;
    room.footballBall.vy = (Math.random() - 0.5) * 2 * jitter;
  } else {
    const yJitterMax = (FIELD_Y1 - FIELD_Y0 - FOOTBALL_BALL_R * 4) * 0.38;
    const by =
      MID_Y + (Math.random() - 0.5) * 2 * yJitterMax;
    room.footballBall.y = Math.max(
      FIELD_Y0 + FOOTBALL_BALL_R,
      Math.min(FIELD_Y1 - FOOTBALL_BALL_R, by)
    );
    if (receivingTeam === "blue") {
      const span = FOOTBALL_LIVE_BALL_X1 - MID_X;
      room.footballBall.x = MID_X + span * FOOTBALL_POST_TD_BALL_FRAC_FROM_MID;
    } else {
      const span = MID_X - FOOTBALL_LIVE_BALL_X0;
      room.footballBall.x = MID_X - span * FOOTBALL_POST_TD_BALL_FRAC_FROM_MID;
    }
    room.footballBall.vx = (Math.random() - 0.5) * jitter * 0.9;
    room.footballBall.vy = (Math.random() - 0.5) * jitter * 0.9;
  }

  room.footballPickupLockTeam = null;
  room.footballPickupLockUntilTick = 0;
  room.footballOpponentPickupLockTeam = null;
  room.footballOpponentPickupLockUntilTick = 0;
  room.footballPickupFreezeUntilTick = 0;

  const redIds = [...room.footballTeamAssignment.entries()]
    .filter(([, t]) => t === "red")
    .map(([id]) => id)
    .sort((a, b) => a - b);
  const blueIds = [...room.footballTeamAssignment.entries()]
    .filter(([, t]) => t === "blue")
    .map(([id]) => id)
    .sort((a, b) => a - b);

  const pr = FOOTBALL_PLAYER_R;
  const inset = FOOTBALL_KICKOFF_X_INSET;
  const kickoffRedX = FOOTBALL_RED_EZ_X1 - pr - inset;
  const kickoffBlueX = FOOTBALL_BLUE_EZ_X0 + pr + inset;
  const maxStaggerTowardMid = Math.min(
    FOOTBALL_RED_EZ_X1 - pr - kickoffRedX,
    kickoffBlueX - (FOOTBALL_BLUE_EZ_X0 + pr),
    kickoffRedX - pr,
    WORLD_W - pr - kickoffBlueX
  );

  for (let i = 0; i < redIds.length; i++) {
    const id = redIds[i]!;
    const col = (i % 3) - 1;
    const dx = col * Math.min(9, Math.max(0, maxStaggerTowardMid));
    const x = Math.max(pr, Math.min(FOOTBALL_RED_EZ_X1 - pr, kickoffRedX + dx));
    room.footballAthletes.set(id, {
      x,
      y: kickoffPlayerY(i, redIds.length),
      team: "red",
      prevPauseHeld: false,
      prevPassHeld: false,
      bounceInputMul: 1,
    });
  }
  for (let i = 0; i < blueIds.length; i++) {
    const id = blueIds[i]!;
    const col = (i % 3) - 1;
    const dx = col * Math.min(9, Math.max(0, maxStaggerTowardMid));
    /** Mirror red: +dx toward midfield on left is −dx from blue's kickoff line toward midfield. */
    const x = Math.max(FOOTBALL_BLUE_EZ_X0 + pr, Math.min(WORLD_W - pr, kickoffBlueX - dx));
    room.footballAthletes.set(id, {
      x,
      y: kickoffPlayerY(i, blueIds.length),
      team: "blue",
      prevPauseHeld: false,
      prevPassHeld: false,
      bounceInputMul: 1,
    });
  }
}

export function tickFootballSummary(room: Room): void {
  if (room.phase !== "football_summary" || room.footballSummaryEndTick === null) return;
  if (room.tick < room.footballSummaryEndTick) return;
  room.phase = "football";
  room.footballKickoffCountdown = FOOTBALL_KICKOFF_COUNTDOWN_SEC;
  room.footballSummaryEndTick = null;
  initKickoffLayout(room, null);
}

export function handleFootballPauseEdge(
  room: Room,
  playerId: number,
  fb: FootballAthlete,
  pauseHeld: boolean
): void {
  const edge = pauseHeld && !fb.prevPauseHeld;
  fb.prevPauseHeld = pauseHeld;
  if (!edge) return;
  if (room.phase === "football") {
    room.phase = "football_paused";
    room.footballPausedByPlayerId = playerId;
  }
}

function clampAthlete(_room: Room, a: FootballAthlete): void {
  const pr = FOOTBALL_PLAYER_R;
  a.x = Math.max(pr, Math.min(WORLD_W - pr, a.x));
  a.y = Math.max(FIELD_Y0 + pr, Math.min(FIELD_Y1 - pr, a.y));
}

function clampLiveBall(room: Room): void {
  const br = FOOTBALL_BALL_R;
  const b = room.footballBall;
  if (b.carrierId !== null) return;
  if (b.x < FOOTBALL_LIVE_BALL_X0 + br) {
    b.x = FOOTBALL_LIVE_BALL_X0 + br;
    b.vx *= -0.35;
  } else if (b.x > FOOTBALL_LIVE_BALL_X1 - br) {
    b.x = FOOTBALL_LIVE_BALL_X1 - br;
    b.vx *= -0.35;
  }
  if (b.y < FIELD_Y0 + br) {
    b.y = FIELD_Y0 + br;
    b.vy *= -0.45;
  } else if (b.y > FIELD_Y1 - br) {
    b.y = FIELD_Y1 - br;
    b.vy *= -0.45;
  }
}

/** Matches maybePickup ban logic — used for host ball halo. */
function footballPickupBannedForTeam(room: Room, team: FootballTeam): boolean {
  const t = room.tick;
  if (t < room.footballPickupFreezeUntilTick) return true;
  const mate = room.footballPickupLockTeam;
  if (mate !== null && team === mate && t < room.footballPickupLockUntilTick) return true;
  const oppTeam = room.footballOpponentPickupLockTeam;
  if (oppTeam !== null && team === oppTeam && t < room.footballOpponentPickupLockUntilTick) return true;
  return false;
}

function maybePickup(room: Room, pid: number, a: FootballAthlete): void {
  const b = room.footballBall;
  if (b.carrierId !== null || b.carrierId === pid) return;
  if (room.tick < room.footballPickupFreezeUntilTick) return;
  const lockTeam = room.footballPickupLockTeam;
  const lockUntil = room.footballPickupLockUntilTick;
  if (lockTeam !== null && a.team === lockTeam && room.tick < lockUntil) return;

  const oppLockTeam = room.footballOpponentPickupLockTeam;
  const oppLockUntil = room.footballOpponentPickupLockUntilTick;
  if (oppLockTeam !== null && a.team === oppLockTeam && room.tick < oppLockUntil) return;

  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d <= PICKUP_DIST) {
    b.carrierId = pid;
    b.vx = 0;
    b.vy = 0;
  }
}

function resolveFootballOvertime(room: Room): void {
  let w: FootballTeam | "tie" = "tie";
  if (room.footballRedScore > room.footballBlueScore) w = "red";
  else if (room.footballBlueScore > room.footballRedScore) w = "blue";
  endMatch(room, w);
}

function endMatch(room: Room, winner: FootballTeam | "tie"): void {
  room.phase = "football_results";
  room.menuIndex = 0;
  room.footballWinner = winner;
  if (winner === "red") {
    for (const [pid, t] of room.footballTeamAssignment) {
      if (t === "red") {
        room.seriesWins.set(pid, (room.seriesWins.get(pid) ?? 0) + 1);
      }
    }
  } else if (winner === "blue") {
    for (const [pid, t] of room.footballTeamAssignment) {
      if (t === "blue") {
        room.seriesWins.set(pid, (room.seriesWins.get(pid) ?? 0) + 1);
      }
    }
  }
}

function checkTouchdown(room: Room, pid: number, carrierTeam: FootballTeam): void {
  const b = room.footballBall;
  const tdNeed = resolveFootballTdToWin(room.gameSettings);
  const ax = room.footballAthletes.get(pid)?.x ?? b.x;
  if (carrierTeam === "red" && ax >= FOOTBALL_BLUE_EZ_X0) {
    room.footballRedScore++;
    b.carrierId = null;
    if (room.footballRedScore >= tdNeed) {
      endMatch(room, "red");
      return;
    }
    if (room.footballTimerExpired) {
      resolveFootballOvertime(room);
      return;
    }
    initKickoffLayout(room, "blue");
    room.footballKickoffCountdown = FOOTBALL_KICKOFF_COUNTDOWN_SEC;
    return;
  }
  if (carrierTeam === "blue" && ax <= FOOTBALL_RED_EZ_X1) {
    room.footballBlueScore++;
    b.carrierId = null;
    if (room.footballBlueScore >= tdNeed) {
      endMatch(room, "blue");
      return;
    }
    if (room.footballTimerExpired) {
      resolveFootballOvertime(room);
      return;
    }
    initKickoffLayout(room, "red");
    room.footballKickoffCountdown = FOOTBALL_KICKOFF_COUNTDOWN_SEC;
  }
}

function doTackle(room: Room, carrierTeam: FootballTeam): void {
  if (room.footballTimerExpired) {
    resolveFootballOvertime(room);
    return;
  }

  room.footballBall.carrierId = null;
  /** Fling toward opponent's scoring endzone (+x Blue EZ, −x Red EZ). Red carrier ⇒ toward Blue TD ⇒ +vx. Blue carrier ⇒ toward Red TD ⇒ −vx. */
  room.footballBall.vx = (carrierTeam === "red" ? 1 : -1) * BALL_FLING_SPEED * 0.72;
  room.footballBall.vy = (Math.random() - 0.5) * 140;
  room.footballPickupLockTeam = carrierTeam;
  room.footballPickupLockUntilTick =
    room.tick + Math.floor(TICK_RATE * FOOTBALL_TACKLE_PICKUP_LOCK_SEC);

  const defendingTeam: FootballTeam = carrierTeam === "red" ? "blue" : "red";
  room.footballOpponentPickupLockTeam = defendingTeam;
  room.footballOpponentPickupLockUntilTick =
    room.tick + Math.floor(TICK_RATE * FOOTBALL_OPPONENT_TACKLE_PICKUP_LOCK_SEC);
}

function maybeTryPass(
  room: Room,
  carrierId: number,
  carrierAth: FootballAthlete,
  carrierTeam: FootballTeam
): boolean {
  const pl = room.players.get(carrierId);
  if (!pl) return false;
  const passHeld = (pl.input.buttons & Btn.Pass) !== 0;
  const edge = passHeld && !carrierAth.prevPassHeld;
  carrierAth.prevPassHeld = passHeld;
  if (!edge) return false;

  const b = room.footballBall;
  let nx = pl.input.footballVx ?? 0;
  let ny = pl.input.footballVy ?? 0;
  const len = Math.hypot(nx, ny);
  const moveFloor = resolveFootballMaxPlayerSpeed(room.gameSettings) * 0.1;
  if (len < moveFloor) {
    nx = carrierTeam === "red" ? 1 : -1;
    ny = 0;
  } else {
    nx /= len;
    ny /= len;
  }

  const pad = FOOTBALL_PLAYER_R + FOOTBALL_BALL_R + 4;
  b.carrierId = null;
  b.x = carrierAth.x + nx * pad;
  b.y = carrierAth.y + ny * pad;
  b.vx = nx * FOOTBALL_PASS_SPEED;
  b.vy = ny * FOOTBALL_PASS_SPEED;

  room.footballPickupLockTeam = carrierTeam;
  room.footballPickupLockUntilTick =
    room.tick + Math.floor(TICK_RATE * FOOTBALL_PASS_TEAMMATE_LOCK_SEC);
  room.footballOpponentPickupLockTeam = null;
  room.footballOpponentPickupLockUntilTick = 0;
  room.footballPickupFreezeUntilTick =
    room.tick + Math.floor(TICK_RATE * FOOTBALL_POST_PASS_GLOBAL_PICKUP_LOCK_SEC);
  return true;
}

export function tickFootballPlay(room: Room, dt: number): void {
  if (room.phase !== "football") return;
  if (room.footballKickoffCountdown !== null && room.footballKickoffCountdown > 0) {
    room.footballKickoffCountdown -= dt;
    if (room.footballKickoffCountdown <= 0) room.footballKickoffCountdown = null;
    return;
  }

  if (!room.footballTimerExpired && room.footballTimeLeftSec > 0) {
    room.footballTimeLeftSec = Math.max(0, room.footballTimeLeftSec - dt);
    if (room.footballTimeLeftSec <= 0) room.footballTimerExpired = true;
  }

  decayFootballBounceFriction(room, dt);

  const b = room.footballBall;
  const carrierId = b.carrierId;

  if (carrierId !== null) {
    const car = room.footballAthletes.get(carrierId);
    const pl = room.players.get(carrierId);
    if (!car || !pl) return;
    const tm = teamOfPlayer(room, carrierId)!;

    // Integrate every athlete while there is a carrier. Previously only the carrier moved,
    // so defenders stayed one tick behind and tackles felt delayed / jittery on the host.
    for (const [pid, a] of room.footballAthletes) {
      const player = room.players.get(pid);
      if (!player) continue;
      const damp = a.bounceInputMul;
      a.x += (player.input.footballVx ?? 0) * damp * dt;
      a.y += (player.input.footballVy ?? 0) * damp * dt;
      clampAthlete(room, a);
    }

    resolveNonCarrierPlayerBounces(room, carrierId);

    if (room.footballBall.carrierId !== carrierId) return;

    const carrierNow = room.footballAthletes.get(carrierId);
    if (!carrierNow) return;
    b.x = carrierNow.x;
    b.y = carrierNow.y;

    checkTouchdown(room, carrierId, tm);

    if (room.phase !== "football" || room.footballBall.carrierId !== carrierId) return;

    for (const [oid, oat] of room.footballAthletes) {
      if (oid === carrierId || oat.team === tm) continue;
      const dd = Math.hypot(carrierNow.x - oat.x, carrierNow.y - oat.y);
      if (dd <= TACKLE_DIST) {
        doTackle(room, tm);
        return;
      }
    }

    if (maybeTryPass(room, carrierId, carrierNow, tm)) return;
    return;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 0.5) {
    const k = Math.max(0, 1 - BALL_DRAG * dt);
    b.vx *= k;
    b.vy *= k;
  }
  clampLiveBall(room);

  for (const [pid, a] of room.footballAthletes) {
    const pl = room.players.get(pid);
    if (!pl) continue;
    const damp = a.bounceInputMul;
    a.x += (pl.input.footballVx ?? 0) * damp * dt;
    a.y += (pl.input.footballVy ?? 0) * damp * dt;
    clampAthlete(room, a);
  }

  resolveNonCarrierPlayerBounces(room, null);

  for (const [pid, a] of room.footballAthletes) {
    maybePickup(room, pid, a);
  }
}

export function buildFootballHostJson(
  room: Room
): import("../src/shared/messages.js").HostStateJson["football"] {
  if (
    room.phase !== "football_team_select" &&
    room.phase !== "football_summary" &&
    room.phase !== "football" &&
    room.phase !== "football_paused" &&
    room.phase !== "football_results"
  ) {
    return null;
  }
  const { red, blue } = buildRosters(room);
  const rosterRed =
    room.phase === "football_team_select"
      ? red
      : [...room.footballTeamAssignment.entries()]
          .filter(([, t]) => t === "red")
          .map(([id]) => rosterSlot(room, id))
          .sort((x, y) => x.playerId - y.playerId);
  const rosterBlue =
    room.phase === "football_team_select"
      ? blue
      : [...room.footballTeamAssignment.entries()]
          .filter(([, t]) => t === "blue")
          .map(([id]) => rosterSlot(room, id))
          .sort((x, y) => x.playerId - y.playerId);

  const players: {
    playerId: number;
    name: string;
    hue: number;
    team: FootballTeam;
    x: number;
    y: number;
  }[] = [];
  if (
    room.phase === "football" ||
    room.phase === "football_paused" ||
    room.phase === "football_results"
  ) {
    for (const [pid, a] of room.footballAthletes) {
      const pl = room.players.get(pid);
      players.push({
        playerId: pid,
        name: pl?.name ?? `P${pid}`,
        hue: pl?.hue ?? fallbackPlayerHue(pid),
        team: a.team,
        x: pid === room.footballBall.carrierId ? room.footballBall.x : a.x,
        y: pid === room.footballBall.carrierId ? room.footballBall.y : a.y,
      });
    }
    players.sort((x, y) => x.playerId - y.playerId);
  }

  const b = room.footballBall;
  const ballLive = b.carrierId === null;

  return {
    red: rosterRed,
    blue: rosterBlue,
    players,
    ball: {
      x: b.x,
      y: b.y,
      live: ballLive,
      carrierId: b.carrierId,
      pickupBan: ballLive
        ? {
            red: footballPickupBannedForTeam(room, "red"),
            blue: footballPickupBannedForTeam(room, "blue"),
          }
        : { red: false, blue: false },
    },
    redScore: room.footballRedScore,
    blueScore: room.footballBlueScore,
    tdToWin: resolveFootballTdToWin(room.gameSettings),
    timeLeftSec: Math.ceil(room.footballTimeLeftSec),
    timerExpired: room.footballTimerExpired,
    kickoffCountdown:
      room.footballKickoffCountdown !== null && room.footballKickoffCountdown > 0
        ? Math.ceil(room.footballKickoffCountdown)
        : null,
    paused: room.phase === "football_paused",
    pausedByPlayerId: room.footballPausedByPlayerId,
    seriesWins: Object.fromEntries(room.seriesWins),
    winner:
      room.phase === "football_results" ? (room.footballWinner ?? "tie") : null,
    field: {
      fieldX0: FOOTBALL_FIELD_X0,
      fieldX1: FOOTBALL_FIELD_X1,
      fieldY0: FIELD_Y0,
      fieldY1: FIELD_Y1,
      redEzX1: FOOTBALL_RED_EZ_X1,
      blueEzX0: FOOTBALL_BLUE_EZ_X0,
      liveBallX0: FOOTBALL_LIVE_BALL_X0,
      liveBallX1: FOOTBALL_LIVE_BALL_X1,
    },
  };
}
