import type {
  ClientIntent,
  ControllerStateJson,
  GamePhase,
  HostStateJson,
  MinigameId,
  RaceWalkBannerJson,
  RaceWalkCrosshairJson,
  RaceWalkRunnerJson,
} from "../src/shared/messages.js";
import { MINIGAME_IDS, MINIGAME_LABELS } from "../src/shared/messages.js";
import { TICK_RATE, WORLD_H, WORLD_W } from "../src/shared/constants.js";
import { RACE_WALK_FINISH_X, RACE_WALK_LANES, RACE_WALK_START_X } from "../src/shared/raceWalk.js";
import type { PlayerSnapshot } from "../src/shared/protocol.js";
import { Btn } from "../src/shared/protocol.js";
import {
  chooseCrossingModeByHeading,
  constrainToCrossingLane,
  KART_FORWARD_SPEED,
  KART_SPEED_MIN,
  KART_SPEED_RECOVER,
  KART_TURN_SPEED,
  KART_WALL_IMPACT_FRICTION,
  KART_WALL_SCRAPE_FRICTION,
  checkLapCross,
  clampToRing,
  finishLineSegment,
  getBridgePolygon,
  getInnerIslands,
  getOuterWall,
  getUnderpassPolygon,
  isInsideCrossing,
  normalIntoTrack,
  spawnPosition,
  wallScrapeAndImpact,
  wallViolated,
} from "../src/shared/kartTrack.js";
import type { Platform } from "../src/shared/level.js";
import type { SimPlayer } from "./game.js";
import { snapshot, stepPlayer } from "./game.js";
import type { WebSocket } from "ws";

export const LAPS_TO_WIN = 3;
export const KART_COUNTDOWN_SEC = 3;
export { RACE_WALK_LANES } from "../src/shared/raceWalk.js";
export const RACE_WALK_COUNTDOWN_SEC = KART_COUNTDOWN_SEC;
/** Shared walk speed for humans (walk button) and NPCs in walk segments */
const RACE_WALK_WALK_SPEED = 48;
/** Shared run speed for humans (run button) and NPCs when allowed to run */
const RACE_WALK_RUN_SPEED = 92;
const KART_DRIFT_BASE_GRIP = 6.4;
const KART_DRIFT_TURN_LOSS = 1.2;

export type RaceWalkRunner = {
  lane: number;
  x: number;
  downed: boolean;
  controllerId: number | null;
};

export type RaceWalkShooter = {
  ammo: number;
  crosshairLane: number;
  crosshairDisabled: boolean;
  prevJump: boolean;
  prevPause: boolean;
  prevAimUp: boolean;
  prevAimDown: boolean;
  prevFire: boolean;
};

export type RaceWalkNpcAi = {
  mode: "walk" | "stop";
  timer: number;
};

export type KartCar = {
  x: number;
  y: number;
  angle: number;
  laps: number;
  /** Current forward speed (wall friction reduces this; recovers in open track) */
  speed: number;
  /** edge-detected pause button */
  prevPauseHeld: boolean;
  /** Crossing lane lock while inside bridge polygon */
  crossingMode: "bridge" | "underpass" | null;
  /** Velocity carries slight lateral drift through turns */
  velX: number;
  velY: number;
};

export type Room = {
  host: WebSocket | null;
  controllers: Map<WebSocket, number>;
  players: Map<number, SimPlayer>;
  nextPlayerId: number;
  tick: number;
  platforms: Platform[];
  phase: GamePhase;
  showQr: boolean;
  menuIndex: number;
  settingsOpen: boolean;
  gameSettings: Record<string, unknown>;
  stubId: MinigameId | null;
  /** seconds remaining; null when racing */
  kartCountdown: number | null;
  kartPaused: boolean;
  kartPausedByPlayerId: number | null;
  kartCars: Map<number, KartCar>;
  kartWinnerId: number | null;
  seriesWins: Map<number, number>;
  raceWalkCountdown: number | null;
  raceWalkRunners: RaceWalkRunner[];
  raceWalkShooters: Map<number, RaceWalkShooter>;
  raceWalkNpcAi: RaceWalkNpcAi[];
  raceWalkBanners: RaceWalkBannerJson[];
  raceWalkWinnerLane: number | null;
  raceWalkWinnerPlayerId: number | null;
};

export function createRoom(host: WebSocket, platforms: Platform[]): Room {
  return {
    host,
    controllers: new Map(),
    players: new Map(),
    nextPlayerId: 1,
    tick: 0,
    platforms,
    phase: "lobby",
    showQr: true,
    menuIndex: 0,
    settingsOpen: false,
    gameSettings: {},
    stubId: null,
    kartCountdown: null,
    kartPaused: false,
    kartPausedByPlayerId: null,
    kartCars: new Map(),
    kartWinnerId: null,
    seriesWins: new Map(),
    raceWalkCountdown: null,
    raceWalkRunners: [],
    raceWalkShooters: new Map(),
    raceWalkNpcAi: [],
    raceWalkBanners: [],
    raceWalkWinnerLane: null,
    raceWalkWinnerPlayerId: null,
  };
}

function clearRaceWalkState(room: Room): void {
  room.raceWalkCountdown = null;
  room.raceWalkRunners = [];
  room.raceWalkShooters.clear();
  room.raceWalkNpcAi = [];
  room.raceWalkBanners = [];
  room.raceWalkWinnerLane = null;
  room.raceWalkWinnerPlayerId = null;
}

function shuffleIntRange(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pushRaceWalkBanner(room: Room, text: string, durationSec: number): void {
  const ticks = Math.max(1, Math.floor(durationSec * TICK_RATE));
  room.raceWalkBanners.push({ text, untilTick: room.tick + ticks });
}

function pruneRaceWalkBanners(room: Room): void {
  room.raceWalkBanners = room.raceWalkBanners.filter((b) => b.untilTick > room.tick);
}

function anyRaceWalkCrosshairHasAmmo(room: Room): boolean {
  for (const s of room.raceWalkShooters.values()) {
    if (s.ammo > 0 && !s.crosshairDisabled) return true;
  }
  return false;
}

function runnerForPlayer(room: Room, playerId: number): RaceWalkRunner | undefined {
  return room.raceWalkRunners.find((r) => r.controllerId === playerId);
}

export function resetRaceWalk(room: Room): void {
  clearRaceWalkState(room);
  room.raceWalkCountdown = RACE_WALK_COUNTDOWN_SEC;
  const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
  const nPlayers = ids.length;
  const ammo = Math.max(1, nPlayers - 1);
  const lanes = shuffleIntRange(RACE_WALK_LANES);
  room.raceWalkRunners = [];
  for (let lane = 0; lane < RACE_WALK_LANES; lane++) {
    room.raceWalkRunners.push({
      lane,
      x: RACE_WALK_START_X,
      downed: false,
      controllerId: null,
    });
  }
  const cap = Math.min(nPlayers, RACE_WALK_LANES);
  for (let i = 0; i < cap; i++) {
    const lane = lanes[i];
    const runner = room.raceWalkRunners[lane];
    if (runner) runner.controllerId = ids[i];
    room.raceWalkShooters.set(ids[i], {
      ammo,
      crosshairLane: Math.floor(Math.random() * RACE_WALK_LANES),
      crosshairDisabled: false,
      prevJump: false,
      prevPause: false,
      prevAimUp: false,
      prevAimDown: false,
      prevFire: false,
    });
  }
  room.raceWalkNpcAi = Array.from({ length: RACE_WALK_LANES }, (_, lane) => {
    const r = room.raceWalkRunners[lane];
    if (r?.controllerId === null) {
      const startWalk = Math.random() < 0.42;
      return {
        mode: (startWalk ? "walk" : "stop") as "walk" | "stop",
        timer: startWalk
          ? 0.35 + Math.random() * 1.15
          : 0.75 + Math.random() * 2.85,
      };
    }
    return { mode: "stop" as const, timer: 9999 };
  });
}

export function startRaceWalkFromMenu(room: Room): void {
  room.phase = "race_walk";
  room.stubId = null;
  room.showQr = false;
  room.kartCars.clear();
  room.kartWinnerId = null;
  room.kartCountdown = null;
  room.kartPaused = false;
  room.kartPausedByPlayerId = null;
  resetRaceWalk(room);
}

function tickRaceWalk(room: Room, dt: number): void {
  pruneRaceWalkBanners(room);
  if (room.raceWalkCountdown !== null && room.raceWalkCountdown > 0) {
    room.raceWalkCountdown -= dt;
    if (room.raceWalkCountdown <= 0) {
      room.raceWalkCountdown = null;
    }
    return;
  }

  const racing = room.phase === "race_walk";
  if (!racing) return;

  const npcsMayRun = !anyRaceWalkCrosshairHasAmmo(room);

  for (const [pid, shooter] of room.raceWalkShooters) {
    const player = room.players.get(pid);
    if (!player) continue;
    const b = player.input.buttons;
    const walkHeld = (b & Btn.Jump) !== 0;
    const runHeld = (b & Btn.Pause) !== 0;
    const aimUpHeld = (b & Btn.AimUp) !== 0;
    const aimDownHeld = (b & Btn.AimDown) !== 0;
    const fireHeld = (b & Btn.Fire) !== 0;

    const edgeAimUp = aimUpHeld && !shooter.prevAimUp;
    const edgeAimDown = aimDownHeld && !shooter.prevAimDown;
    const edgeFire = fireHeld && !shooter.prevFire;

    if (edgeAimUp) {
      shooter.crosshairLane = (shooter.crosshairLane + RACE_WALK_LANES - 1) % RACE_WALK_LANES;
    } else if (edgeAimDown) {
      shooter.crosshairLane = (shooter.crosshairLane + 1) % RACE_WALK_LANES;
    }

    const canUseCrosshair = shooter.ammo > 0 && !shooter.crosshairDisabled;
    if (edgeFire && canUseCrosshair) {
      const lane = shooter.crosshairLane;
      const victim = room.raceWalkRunners[lane];
      if (victim && !victim.downed) {
        victim.downed = true;
        shooter.ammo -= 1;
        if (victim.controllerId !== null) {
          const vid = victim.controllerId;
          pushRaceWalkBanner(room, `Player ${vid} was eliminated`, 3.2);
          shooter.crosshairDisabled = true;
        }
      }
    }

    shooter.prevJump = walkHeld;
    shooter.prevPause = runHeld;
    shooter.prevAimUp = aimUpHeld;
    shooter.prevAimDown = aimDownHeld;
    shooter.prevFire = fireHeld;
  }

  for (const runner of room.raceWalkRunners) {
    if (runner.downed) continue;
    let speed = 0;
    if (runner.controllerId !== null) {
      const p = room.players.get(runner.controllerId);
      if (!p) continue;
      const b = p.input.buttons;
      const walkHeld = (b & Btn.Jump) !== 0;
      const runHeld = (b & Btn.Pause) !== 0;
      if (runHeld) speed = RACE_WALK_RUN_SPEED;
      else if (walkHeld) speed = RACE_WALK_WALK_SPEED;
    } else {
      const lane = runner.lane;
      const ai = room.raceWalkNpcAi[lane];
      if (ai) {
        ai.timer -= dt;
        if (ai.timer <= 0) {
          if (ai.mode === "walk") {
            ai.mode = "stop";
            ai.timer = 0.55 + Math.random() * 2.45;
          } else {
            ai.mode = "walk";
            ai.timer = 0.5 + Math.random() * 2.2;
          }
        }
        if (ai.mode === "walk") {
          speed = npcsMayRun ? RACE_WALK_RUN_SPEED : RACE_WALK_WALK_SPEED;
        }
      }
    }
    runner.x += speed * dt;
  }

  for (const runner of room.raceWalkRunners) {
    if (runner.downed) continue;
    if (runner.x >= RACE_WALK_FINISH_X) {
      room.raceWalkWinnerLane = runner.lane;
      room.raceWalkWinnerPlayerId = runner.controllerId;
      if (runner.controllerId !== null) {
        const wid = runner.controllerId;
        const w = room.seriesWins.get(wid) ?? 0;
        room.seriesWins.set(wid, w + 1);
        pushRaceWalkBanner(room, `Player ${wid} wins!`, 4);
      } else {
        pushRaceWalkBanner(room, "An NPC wins — no series points", 4);
      }
      room.phase = "race_walk_results";
      room.menuIndex = 0;
      return;
    }
  }
}

function buildRaceWalkHostJson(room: Room): HostStateJson["raceWalk"] {
  if (room.phase !== "race_walk" && room.phase !== "race_walk_results") return null;
  const runners: RaceWalkRunnerJson[] = room.raceWalkRunners.map((r) => ({
    lane: r.lane,
    x: r.x,
    downed: r.downed,
    controllerId: r.controllerId,
  }));
  const crosshairs: RaceWalkCrosshairJson[] = [];
  for (const [playerId, s] of room.raceWalkShooters) {
    crosshairs.push({
      playerId,
      lane: s.crosshairLane,
      ammo: s.ammo,
      active: s.ammo > 0 && !s.crosshairDisabled,
    });
  }
  crosshairs.sort((a, b) => a.playerId - b.playerId);
  const banners = room.raceWalkBanners.filter((b) => b.untilTick > room.tick);
  return {
    countdown: room.raceWalkCountdown,
    startX: RACE_WALK_START_X,
    finishX: RACE_WALK_FINISH_X,
    worldW: WORLD_W,
    worldH: WORLD_H,
    runners,
    crosshairs,
    banners,
    winnerLane: room.raceWalkWinnerLane,
    winnerPlayerId: room.raceWalkWinnerPlayerId,
    seriesWins: Object.fromEntries(room.seriesWins),
  };
}

function menuItemsList() {
  return MINIGAME_IDS.map((id) => ({ id, label: MINIGAME_LABELS[id] }));
}

export function buildHostState(room: Room, roomId: string): HostStateJson {
  const lobbyPlayers: PlayerSnapshot[] = [];
  for (const p of room.players.values()) lobbyPlayers.push(snapshot(p));

  let kart: HostStateJson["kart"] = null;
  if (room.phase === "kart" || room.phase === "kart_paused" || room.phase === "kart_results") {
    const outerWall = getOuterWall().map((p) => ({ x: p.x, y: p.y }));
    const innerIslands = getInnerIslands().map((island) => island.map((p) => ({ x: p.x, y: p.y })));
    const bridgePolygon = getBridgePolygon().map((p) => ({ x: p.x, y: p.y }));
    const underpassPolygon = getUnderpassPolygon().map((p) => ({ x: p.x, y: p.y }));
    const finishLine = finishLineSegment();
    const cars = Array.from(room.kartCars.entries()).map(([playerId, c]) => ({
      playerId,
      x: c.x,
      y: c.y,
      angle: c.angle,
      laps: Math.min(LAPS_TO_WIN, c.laps),
    }));
    kart = {
      countdown: room.kartCountdown,
      paused: room.kartPaused,
      pausedByPlayerId: room.kartPausedByPlayerId,
      innerIslands,
      outerWall,
      bridgePolygon,
      underpassPolygon,
      finishLine: { a: finishLine.a, b: finishLine.b },
      cars,
      winnerId: room.kartWinnerId,
      seriesWins: Object.fromEntries(room.seriesWins),
    };
  }


  return {
    type: "host_state",
    phase: room.phase,
    tick: room.tick,
    roomId,
    showQr: room.showQr,
    lobbyPlayers,
    menuIndex: room.menuIndex,
    menuItems: menuItemsList(),
    settingsOpen: room.settingsOpen,
    gameSettings: { ...room.gameSettings },
    stubId: room.stubId,
    kart,
    raceWalk: buildRaceWalkHostJson(room),
  };
}

export function buildControllerState(room: Room, playerId: number): ControllerStateJson {
  const laps: Record<number, number> = {};
  for (const [pid, car] of room.kartCars) {
    laps[pid] = Math.min(LAPS_TO_WIN, car.laps);
  }
  const shooter = room.raceWalkShooters.get(playerId);
  const assigned = runnerForPlayer(room, playerId);
  const raceWalkHud =
    room.phase === "race_walk" || room.phase === "race_walk_results"
      ? {
          assignedLane: assigned?.lane ?? null,
          runnerDowned: assigned?.downed ?? false,
          crosshairLane: shooter?.crosshairLane ?? 0,
          ammo: shooter?.ammo ?? 0,
          crosshairActive: shooter ? shooter.ammo > 0 && !shooter.crosshairDisabled : false,
          seriesWins: Object.fromEntries(room.seriesWins),
        }
      : null;
  return {
    type: "controller_state",
    phase: room.phase,
    playerId,
    menuIndex: room.menuIndex,
    menuItems: menuItemsList(),
    settingsOpen: room.settingsOpen,
    stubId: room.stubId,
    kart:
      room.phase === "kart" || room.phase === "kart_paused" || room.phase === "kart_results"
        ? {
            paused: room.kartPaused,
            laps,
            winnerId: room.kartWinnerId,
            seriesWins: Object.fromEntries(room.seriesWins),
          }
        : null,
    raceWalk: raceWalkHud,
  };
}

export function resetKartRace(room: Room): void {
  room.kartWinnerId = null;
  room.kartPaused = false;
  room.kartPausedByPlayerId = null;
  room.kartCountdown = KART_COUNTDOWN_SEC;
  room.kartCars.clear();
  const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
  for (let i = 0; i < ids.length; i++) {
    const sp = spawnPosition(i);
    room.kartCars.set(ids[i], {
      x: sp.x,
      y: sp.y,
      angle: sp.angle,
      laps: 0,
      speed: KART_FORWARD_SPEED,
      prevPauseHeld: false,
      crossingMode: null,
      velX: Math.cos(sp.angle) * KART_FORWARD_SPEED,
      velY: Math.sin(sp.angle) * KART_FORWARD_SPEED,
    });
  }
}

export function startKartFromMenu(room: Room): void {
  room.phase = "kart";
  room.stubId = null;
  room.showQr = false;
  clearRaceWalkState(room);
  resetKartRace(room);
}

export function ensureKartCar(room: Room, playerId: number): void {
  if (
    !room.kartCars.has(playerId) &&
    (room.phase === "kart" || room.phase === "kart_paused")
  ) {
    const ids = Array.from(room.players.keys()).sort((a, b) => a - b);
    const idx = ids.indexOf(playerId);
    const sp = spawnPosition(idx >= 0 ? idx : 0);
    room.kartCars.set(playerId, {
      x: sp.x,
      y: sp.y,
      angle: sp.angle,
      laps: 0,
      speed: KART_FORWARD_SPEED,
      prevPauseHeld: false,
      crossingMode: null,
      velX: Math.cos(sp.angle) * KART_FORWARD_SPEED,
      velY: Math.sin(sp.angle) * KART_FORWARD_SPEED,
    });
  }
}

export function tickSimulation(room: Room, dt: number): void {
  room.tick = (room.tick + 1) >>> 0;
  if (room.phase === "lobby") {
    for (const p of room.players.values()) {
      stepPlayer(p, room.platforms);
    }
    return;
  }
  if (room.phase === "race_walk_results") {
    pruneRaceWalkBanners(room);
    return;
  }
  if (room.phase === "race_walk") {
    tickRaceWalk(room, dt);
    return;
  }
  if (room.phase !== "kart" || room.kartPaused) return;
  if (room.kartCountdown !== null && room.kartCountdown > 0) {
    room.kartCountdown -= dt;
    if (room.kartCountdown <= 0) {
      room.kartCountdown = null;
    }
    return;
  }
  for (const [pid, car] of room.kartCars) {
    const player = room.players.get(pid);
    if (!player) continue;
    const h = Math.max(-1, Math.min(1, player.input.h / 127));
    const prev = { x: car.x, y: car.y };
    car.angle += h * KART_TURN_SPEED * dt;
    const desiredVx = Math.cos(car.angle) * car.speed;
    const desiredVy = Math.sin(car.angle) * car.speed;
    const grip = Math.max(1.2, KART_DRIFT_BASE_GRIP - Math.abs(h) * KART_DRIFT_TURN_LOSS);
    const blend = Math.min(1, grip * dt);
    car.velX += (desiredVx - car.velX) * blend;
    car.velY += (desiredVy - car.velY) * blend;
    const vx = car.velX;
    const vy = car.velY;
    const tx = car.x + vx * dt;
    const ty = car.y + vy * dt;
    const maxStep = Math.hypot(vx * dt, vy * dt);
    let clamped = clampToRing(tx, ty);
    if (isInsideCrossing(clamped.x, clamped.y)) {
      if (!car.crossingMode) {
        car.crossingMode = chooseCrossingModeByHeading(car.angle);
      }
      const lane = constrainToCrossingLane(clamped.x, clamped.y, car.crossingMode);
      clamped = { x: lane.x, y: lane.y };
      if (lane.hitSideWall) {
        car.speed = Math.max(KART_SPEED_MIN, car.speed * (1 - Math.min(0.92, dt * 1.8)));
      }
    } else {
      car.crossingMode = null;
    }
    const hit = wallViolated(tx, ty);
    if (hit) {
      // Find the furthest point along intended movement that stays drivable.
      // This avoids large tangential snaps that feel like "sticky sliding" on curves.
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) * 0.5;
        const mx = prev.x + (tx - prev.x) * mid;
        const my = prev.y + (ty - prev.y) * mid;
        if (wallViolated(mx, my) === null) lo = mid;
        else hi = mid;
      }
      const sx = prev.x + (tx - prev.x) * lo;
      const sy = prev.y + (ty - prev.y) * lo;
      clamped = clampToRing(sx, sy);

      // Prevent boundary projection from pulling cars forward along walls.
      const stepDx = clamped.x - prev.x;
      const stepDy = clamped.y - prev.y;
      const stepLen = Math.hypot(stepDx, stepDy);
      if (stepLen > maxStep && stepLen > 1e-6) {
        const k = maxStep / stepLen;
        clamped = { x: prev.x + stepDx * k, y: prev.y + stepDy * k };
      }
      const { scrape01, impact01 } = wallScrapeAndImpact(vx, vy, clamped.x, clamped.y, hit);
      const desiredDx = tx - prev.x;
      const desiredDy = ty - prev.y;
      const desiredLen = Math.hypot(desiredDx, desiredDy);
      let glancingMomentumKeep = 1;
      if (desiredLen > 1e-6) {
        const n = normalIntoTrack(clamped.x, clamped.y, hit);
        let txWall = -n.y;
        let tyWall = n.x;
        if (txWall * desiredDx + tyWall * desiredDy < 0) {
          txWall = -txWall;
          tyWall = -tyWall;
        }
        const along = txWall * desiredDx + tyWall * desiredDy;
        const along01 = Math.abs(along) / desiredLen;
        const glancingThreshold = Math.cos((30 * Math.PI) / 180);
        if (along > 0 && along01 >= glancingThreshold) {
          // Slight wall glide for shallow (<= 30deg off tangent) contacts.
          const slideDist = along * 0.38;
          const sx2 = clamped.x + txWall * slideDist;
          const sy2 = clamped.y + tyWall * slideDist;
          const slid = clampToRing(sx2, sy2);
          if (wallViolated(slid.x, slid.y) === null) {
            clamped = slid;
          }
          // Keep more speed on glancing scrapes than on head-on impacts.
          glancingMomentumKeep = 0.62;
        }
      }
      const loss =
        dt *
        (KART_WALL_SCRAPE_FRICTION * scrape01 + KART_WALL_IMPACT_FRICTION * impact01) *
        glancingMomentumKeep;
      const correction = Math.hypot(clamped.x - tx, clamped.y - ty);
      const extraLoss = Math.min(0.6, correction / 24);
      car.speed = Math.max(KART_SPEED_MIN, car.speed * (1 - Math.min(0.94, loss + extraLoss)));
      const retained = Math.max(0.18, 1 - Math.min(0.82, loss + extraLoss));
      car.velX *= retained;
      car.velY *= retained;
    } else {
      car.speed += (KART_FORWARD_SPEED - car.speed) * Math.min(1, KART_SPEED_RECOVER * dt);
    }
    car.x = clamped.x;
    car.y = clamped.y;
    if (checkLapCross(prev, { x: car.x, y: car.y }, vx, vy)) {
      car.laps++;
      if (car.laps >= LAPS_TO_WIN) {
        car.laps = LAPS_TO_WIN;
        room.kartWinnerId = pid;
        const w = room.seriesWins.get(pid) ?? 0;
        room.seriesWins.set(pid, w + 1);
        room.phase = "kart_results";
        room.menuIndex = 0;
        return;
      }
    }
  }
}

/** Call when binary input arrives for kart pause edge. */
export function handleKartPauseEdge(
  room: Room,
  playerId: number,
  car: KartCar,
  pauseHeld: boolean
): void {
  const edge = pauseHeld && !car.prevPauseHeld;
  car.prevPauseHeld = pauseHeld;
  if (!edge) return;
  if (room.phase === "kart" && !room.kartPaused && room.kartCountdown === null) {
    room.phase = "kart_paused";
    room.kartPaused = true;
    room.kartPausedByPlayerId = playerId;
  }
}

export function applyIntent(room: Room, _playerId: number, intent: ClientIntent): void {
  switch (intent.type) {
    case "all_ready":
      if (room.phase === "lobby") {
        room.phase = "menu";
        room.showQr = false;
        room.menuIndex = 0;
      }
      break;
    case "menu_nav": {
      if (room.phase === "kart_results" || room.phase === "race_walk_results") {
        const n = 3;
        if (intent.dir === "up") room.menuIndex = (room.menuIndex - 1 + n) % n;
        else room.menuIndex = (room.menuIndex + 1) % n;
        break;
      }
      if (room.phase === "menu") {
        const n = MINIGAME_IDS.length;
        if (intent.dir === "up") room.menuIndex = (room.menuIndex - 1 + n) % n;
        else room.menuIndex = (room.menuIndex + 1) % n;
      }
      break;
    }
    case "menu_confirm": {
      if (room.phase === "kart_results") {
        const actions = ["play_again", "minigame_menu", "add_controllers"] as const;
        const action = actions[room.menuIndex % 3];
        if (action === "play_again") startKartFromMenu(room);
        else if (action === "minigame_menu") {
          room.phase = "menu";
          room.stubId = null;
          room.kartCars.clear();
          room.kartWinnerId = null;
          room.kartCountdown = null;
          room.kartPaused = false;
          room.kartPausedByPlayerId = null;
          room.showQr = false;
        } else {
          room.phase = "lobby";
          room.menuIndex = 0;
          room.stubId = null;
          room.kartCars.clear();
          room.kartWinnerId = null;
          room.kartCountdown = null;
          room.kartPaused = false;
          room.kartPausedByPlayerId = null;
          room.showQr = true;
        }
        break;
      }
      if (room.phase === "race_walk_results") {
        const actions = ["play_again", "minigame_menu", "add_controllers"] as const;
        const action = actions[room.menuIndex % 3];
        if (action === "play_again") startRaceWalkFromMenu(room);
        else if (action === "minigame_menu") {
          room.phase = "menu";
          room.stubId = null;
          clearRaceWalkState(room);
          room.showQr = false;
        } else {
          room.phase = "lobby";
          room.menuIndex = 0;
          room.stubId = null;
          clearRaceWalkState(room);
          room.showQr = true;
        }
        break;
      }
      if (room.phase === "menu") {
        const id = MINIGAME_IDS[room.menuIndex];
        if (id === "kart") startKartFromMenu(room);
        else if (id === "race_walk") startRaceWalkFromMenu(room);
        else {
          room.phase = "stub";
          room.stubId = id;
          room.showQr = false;
        }
      }
      break;
    }
    case "menu_add_players":
      room.showQr = true;
      break;
    case "menu_game_settings":
      room.settingsOpen = true;
      break;
    case "settings_close":
      room.settingsOpen = false;
      break;
    case "stub_back":
      if (room.phase === "stub") {
        room.phase = "menu";
        room.stubId = null;
      }
      break;
    case "kart_results":
      if (room.phase !== "kart_results") break;
      if (intent.action === "play_again") {
        startKartFromMenu(room);
      } else if (intent.action === "minigame_menu") {
        room.phase = "menu";
        room.stubId = null;
        room.kartCars.clear();
        room.kartWinnerId = null;
        room.kartCountdown = null;
        room.kartPaused = false;
        room.kartPausedByPlayerId = null;
        room.showQr = false;
      } else if (intent.action === "add_controllers") {
        room.phase = "lobby";
        room.menuIndex = 0;
        room.stubId = null;
        room.kartCars.clear();
        room.kartWinnerId = null;
        room.kartCountdown = null;
        room.kartPaused = false;
        room.kartPausedByPlayerId = null;
        room.showQr = true;
      }
      break;
    case "race_walk_results":
      if (room.phase !== "race_walk_results") break;
      if (intent.action === "play_again") {
        startRaceWalkFromMenu(room);
      } else if (intent.action === "minigame_menu") {
        room.phase = "menu";
        room.stubId = null;
        clearRaceWalkState(room);
        room.showQr = false;
      } else if (intent.action === "add_controllers") {
        room.phase = "lobby";
        room.menuIndex = 0;
        room.stubId = null;
        clearRaceWalkState(room);
        room.showQr = true;
      }
      break;
    case "pause_resume":
      if (room.phase === "kart_paused") {
        room.phase = "kart";
        room.kartPaused = false;
        room.kartPausedByPlayerId = null;
        for (const c of room.kartCars.values()) {
          c.prevPauseHeld = false;
        }
      }
      break;
    case "pause_to_menu":
      if (room.phase === "kart_paused" || room.phase === "kart") {
        room.phase = "menu";
        room.kartPaused = false;
        room.kartCountdown = null;
        room.kartCars.clear();
        room.kartWinnerId = null;
        room.stubId = null;
        room.kartPausedByPlayerId = null;
      } else if (room.phase === "race_walk") {
        room.phase = "menu";
        room.stubId = null;
        clearRaceWalkState(room);
        room.showQr = false;
      }
      break;
    default:
      break;
  }
}
