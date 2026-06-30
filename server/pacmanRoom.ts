import { TICK_RATE } from "../src/shared/constants.js";
import {
  buildPacmanMaze,
  PACMAN_CHASE_SCATTER_SEC,
  PACMAN_COUNTDOWN_SEC,
  PACMAN_DEATH_NOTICE_TICKS,
  PACMAN_DIR_DELTA,
  PACMAN_FRIGHTENED_SEC,
  PACMAN_GHOST_EAT_POINTS,
  PACMAN_GHOST_MOVE_COOLDOWN_SEC,
  PACMAN_GHOST_SPAWN_STAGGER_SEC,
  PACMAN_INVULN_SEC,
  PACMAN_MOVE_COOLDOWN_SEC,
  PACMAN_ORIGIN_X,
  PACMAN_ORIGIN_Y,
  PACMAN_PELLET_POINTS,
  PACMAN_POWER_PELLET_POINTS,
  PACMAN_RESPAWN_SEC,
  PACMAN_TILE,
  PACMAN_COLS,
  PACMAN_ROWS,
  PACMAN_TUNNEL_ROW,
  pacmanInBounds,
  pacmanOppositeDir,
  pickPacmanPlayerSpawns,
  type PacmanDir,
} from "../src/shared/pacmanSettings.js";
import { resolvePacmanLivesPerPlayer } from "../src/shared/pacmanGameSettings.js";
import { fallbackPlayerHue } from "../src/shared/playerColors.js";
import { Btn } from "../src/shared/protocol.js";
import type { Room } from "./gameRoom.js";

export type PacmanPlayerSim = {
  col: number;
  row: number;
  alive: boolean;
  lives: number;
  respawnSecLeft: number;
  invulnSecLeft: number;
  score: number;
  moveCooldown: number;
  dir: PacmanDir;
  queuedDir: PacmanDir | null;
  prevPauseHeld: boolean;
  prevAimUp: boolean;
  prevAimDown: boolean;
  prevH: number;
  prevLeft: boolean;
  prevRight: boolean;
};

export type PacmanGhostMode = "normal" | "frightened" | "eaten";

export type PacmanGhostSim = {
  id: number;
  col: number;
  row: number;
  mode: PacmanGhostMode;
  chase: boolean;
  scatterTarget: { col: number; row: number };
  moveCooldown: number;
  dir: PacmanDir;
};

const GHOST_COLORS = ["#ff0000", "#ffb8ff", "#00ffff", "#ffb852"];

export function clearPacmanState(room: Room): void {
  room.pacmanCountdown = null;
  room.pacmanWalls = [];
  room.pacmanPellets = [];
  room.pacmanPowerPelletKeys.clear();
  room.pacmanPelletsRemaining = 0;
  room.pacmanTotalPellets = 0;
  room.pacmanFrightenedSecLeft = 0;
  room.pacmanChaseScatterTimer = PACMAN_CHASE_SCATTER_SEC;
  room.pacmanChaseMode = true;
  room.pacmanGhostHouse = { col: 15, row: 5 };
  room.pacmanPlayerSpawn = { col: 15, row: 15 };
  room.pacmanPlayers.clear();
  room.pacmanGhosts = [];
  room.pacmanPausedByPlayerId = null;
  room.pacmanBanners = [];
  room.pacmanDeathNotices.clear();
  room.pacmanTeamCleared = false;
  room.pacmanTeamWiped = false;
}

export function bootstrapPacmanFromMenu(room: Room): void {
  room.phase = "pacman";
  room.stubId = null;
  room.showQr = false;
  clearPacmanState(room);
  initPacmanRound(room);
}

function initPacmanRound(room: Room): void {
  const maze = buildPacmanMaze();
  room.pacmanWalls = maze.walls.map((r) => [...r]);
  room.pacmanPellets = maze.pellets.map((r) => [...r]);
  room.pacmanPowerPelletKeys.clear();
  for (const p of maze.powerPellets) {
    room.pacmanPowerPelletKeys.add(`${p.col},${p.row}`);
  }
  room.pacmanPelletsRemaining = maze.totalPellets;
  room.pacmanTotalPellets = maze.totalPellets;
  room.pacmanFrightenedSecLeft = 0;
  room.pacmanChaseScatterTimer = PACMAN_CHASE_SCATTER_SEC;
  room.pacmanChaseMode = true;
  room.pacmanGhostHouse = { ...maze.ghostHouse };
  room.pacmanPlayerSpawn = { ...maze.playerSpawn };
  room.pacmanTeamCleared = false;
  room.pacmanTeamWiped = false;
  room.pacmanBanners = [];
  room.pacmanDeathNotices.clear();
  room.pacmanCountdown = PACMAN_COUNTDOWN_SEC;
  const livesPerPlayer = resolvePacmanLivesPerPlayer(room.gameSettings);

  const ids = [...room.players.keys()].sort((a, b) => a - b);
  const spawns = pickPacmanPlayerSpawns(ids.length, maze.playerSpawn);
  room.pacmanPlayers.clear();
  for (let i = 0; i < ids.length; i++) {
    const s = spawns[i] ?? maze.playerSpawn;
    room.pacmanPlayers.set(ids[i]!, {
      col: s.col,
      row: s.row,
      alive: true,
      lives: livesPerPlayer,
      respawnSecLeft: 0,
      invulnSecLeft: 0,
      score: 0,
      moveCooldown: 0,
      dir: 2,
      queuedDir: null,
      prevPauseHeld: false,
      prevAimUp: false,
      prevAimDown: false,
      prevH: 0,
      prevLeft: false,
      prevRight: false,
    });
  }

  room.pacmanGhosts = maze.ghostSpawns.map((s, id) => ({
    id,
    col: s.col,
    row: s.row,
    mode: "normal" as const,
    chase: id % 2 === 0,
    scatterTarget: maze.scatterTargets[id] ?? maze.scatterTargets[0]!,
    moveCooldown: id * PACMAN_GHOST_SPAWN_STAGGER_SEC,
    dir: 2 as PacmanDir,
  }));
}

function pushBanner(room: Room, text: string, sec: number): void {
  room.pacmanBanners.push({ text, untilTick: room.tick + Math.floor(TICK_RATE * sec) });
}

function pruneBanners(room: Room): void {
  room.pacmanBanners = room.pacmanBanners.filter((b) => b.untilTick > room.tick);
}

function isWall(room: Room, col: number, row: number): boolean {
  if (!pacmanInBounds(col, row)) {
    if (row === PACMAN_TUNNEL_ROW) return false;
    return true;
  }
  return room.pacmanWalls[row]![col]!;
}

function wrapCol(col: number, row: number): number {
  if (row !== PACMAN_TUNNEL_ROW) return col;
  if (col < 0) return PACMAN_COLS - 1;
  if (col >= PACMAN_COLS) return 0;
  return col;
}

function canMove(room: Room, col: number, row: number, dir: PacmanDir): boolean {
  const { dc, dr } = PACMAN_DIR_DELTA[dir]!;
  let nc = col + dc;
  const nr = row + dr;
  nc = wrapCol(nc, nr);
  if (nr < 0 || nr >= PACMAN_ROWS) return false;
  return !isWall(room, nc, nr);
}

function legalDirs(room: Room, col: number, row: number, curDir: PacmanDir): PacmanDir[] {
  const out: PacmanDir[] = [];
  for (let d = 0; d < 4; d++) {
    const dir = d as PacmanDir;
    if (!canMove(room, col, row, dir)) continue;
    if (out.length > 0 && dir === pacmanOppositeDir(curDir)) continue;
    out.push(dir);
  }
  if (out.length === 0) {
    const rev = pacmanOppositeDir(curDir);
    if (canMove(room, col, row, rev)) out.push(rev);
  }
  return out;
}

function manhattan(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function nearestAlivePlayer(room: Room, from: { col: number; row: number }): PacmanPlayerSim | null {
  let best: PacmanPlayerSim | null = null;
  let bestD = Infinity;
  for (const p of room.pacmanPlayers.values()) {
    if (!p.alive) continue;
    const d = manhattan(from, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function applyMove(col: number, row: number, dir: PacmanDir): { col: number; row: number } {
  const { dc, dr } = PACMAN_DIR_DELTA[dir]!;
  let nc = col + dc;
  const nr = row + dr;
  nc = wrapCol(nc, nr);
  return { col: nc, row: nr };
}

function tryCollectPellet(room: Room, p: PacmanPlayerSim): void {
  const key = `${p.col},${p.row}`;
  if (room.pacmanPowerPelletKeys.has(key)) {
    room.pacmanPowerPelletKeys.delete(key);
    room.pacmanPelletsRemaining--;
    p.score += PACMAN_POWER_PELLET_POINTS;
    room.pacmanFrightenedSecLeft = PACMAN_FRIGHTENED_SEC;
    for (const g of room.pacmanGhosts) {
      if (g.mode !== "eaten") g.mode = "frightened";
    }
    return;
  }
  if (room.pacmanPellets[p.row]?.[p.col]) {
    room.pacmanPellets[p.row]![p.col] = false;
    room.pacmanPelletsRemaining--;
    p.score += PACMAN_PELLET_POINTS;
  }
}

function checkPacmanWin(room: Room): void {
  if (room.pacmanPelletsRemaining > 0) return;
  room.pacmanTeamCleared = true;
  for (const pid of room.pacmanPlayers.keys()) {
    const w = room.seriesWins.get(pid) ?? 0;
    room.seriesWins.set(pid, w + 1);
  }
  pushBanner(room, "Maze cleared — team win!", 4);
  room.phase = "pacman_results";
  room.menuIndex = 0;
}

function allPlayersOutOfLives(room: Room): boolean {
  if (room.pacmanPlayers.size === 0) return false;
  for (const p of room.pacmanPlayers.values()) {
    if (p.lives > 0) return false;
  }
  return true;
}

function checkPacmanTeamWipe(room: Room): void {
  if (room.phase !== "pacman") return;
  if (!allPlayersOutOfLives(room)) return;
  room.pacmanTeamWiped = true;
  pushBanner(room, "Out of lives — game over!", 4);
  room.phase = "pacman_results";
  room.menuIndex = 0;
}

function killPlayer(room: Room, playerId: number): void {
  const p = room.pacmanPlayers.get(playerId);
  if (!p || !p.alive) return;
  p.lives = Math.max(0, p.lives - 1);
  p.alive = false;
  const pl = room.players.get(playerId);
  if (p.lives > 0) {
    p.respawnSecLeft = PACMAN_RESPAWN_SEC;
    room.pacmanDeathNotices.set(playerId, {
      text: `${p.lives} ${p.lives === 1 ? "life" : "lives"} left`,
      untilTick: room.tick + PACMAN_DEATH_NOTICE_TICKS,
    });
    pushBanner(room, `${pl?.name ?? `P${playerId}`} was caught — ${p.lives} left`, 2);
  } else {
    p.respawnSecLeft = 0;
    room.pacmanDeathNotices.set(playerId, {
      text: "Out of lives!",
      untilTick: room.tick + PACMAN_DEATH_NOTICE_TICKS,
    });
    pushBanner(room, `${pl?.name ?? `P${playerId}`} is out`, 2);
  }
  checkPacmanTeamWipe(room);
}

function dirFromInput(aimUp: boolean, aimDown: boolean, leftHeld: boolean, rightHeld: boolean): PacmanDir | null {
  if (aimUp) return 0;
  if (aimDown) return 1;
  if (leftHeld) return 2;
  if (rightHeld) return 3;
  return null;
}

function stepPlayer(room: Room, p: PacmanPlayerSim): void {
  if (!p.alive) return;

  let tryDir = p.queuedDir ?? p.dir;
  if (!canMove(room, p.col, p.row, tryDir)) tryDir = p.dir;
  if (!canMove(room, p.col, p.row, tryDir)) return;

  const next = applyMove(p.col, p.row, tryDir);
  p.col = next.col;
  p.row = next.row;
  p.dir = tryDir;
  p.moveCooldown = PACMAN_MOVE_COOLDOWN_SEC;
  tryCollectPellet(room, p);
  if (room.phase !== "pacman") return;
  checkPacmanWin(room);
}

function ghostTarget(
  room: Room,
  g: PacmanGhostSim
): { col: number; row: number } {
  if (g.mode === "eaten") return { ...room.pacmanGhostHouse };
  if (g.mode === "frightened") {
    const pl = nearestAlivePlayer(room, g);
    if (!pl) return { col: 0, row: 0 };
    return { col: pl.col, row: pl.row };
  }
  if (room.pacmanChaseMode && g.chase) {
    const pl = nearestAlivePlayer(room, g);
    if (pl) return { col: pl.col, row: pl.row };
  }
  return g.scatterTarget;
}

function pickGhostDir(room: Room, g: PacmanGhostSim): PacmanDir | null {
  const options = legalDirs(room, g.col, g.row, g.dir);
  if (options.length === 0) return null;
  const target = ghostTarget(room, g);
  const flee = g.mode === "frightened";
  let best = options[0]!;
  let bestScore = flee ? -Infinity : Infinity;
  for (const dir of options) {
    const next = applyMove(g.col, g.row, dir);
    const d = manhattan(next, target);
    if (flee) {
      if (d > bestScore) {
        bestScore = d;
        best = dir;
      }
    } else if (d < bestScore) {
      bestScore = d;
      best = dir;
    }
  }
  return best;
}

function stepGhost(room: Room, g: PacmanGhostSim): void {
  const dir = pickGhostDir(room, g);
  if (dir === null) return;
  const next = applyMove(g.col, g.row, dir);
  g.col = next.col;
  g.row = next.row;
  g.dir = dir;
  g.moveCooldown = PACMAN_GHOST_MOVE_COOLDOWN_SEC;

  if (g.mode === "eaten") {
    if (g.col === room.pacmanGhostHouse.col && g.row === room.pacmanGhostHouse.row) {
      g.mode = room.pacmanFrightenedSecLeft > 0 ? "frightened" : "normal";
    }
    return;
  }

  for (const [pid, p] of room.pacmanPlayers) {
    if (!p.alive || p.invulnSecLeft > 0) continue;
    if (p.col !== g.col || p.row !== g.row) continue;
    if (g.mode === "frightened") {
      g.mode = "eaten";
      const scorer = room.pacmanPlayers.get(pid);
      if (scorer) scorer.score += PACMAN_GHOST_EAT_POINTS;
      pushBanner(room, `${room.players.get(pid)?.name ?? `P${pid}`} ate a ghost!`, 1.5);
    } else if (room.pacmanFrightenedSecLeft <= 0) {
      killPlayer(room, pid);
    }
  }
}

function tickGhostPlayerCollisions(room: Room): void {
  if (room.pacmanFrightenedSecLeft > 0) return;
  for (const [pid, p] of room.pacmanPlayers) {
    if (!p.alive || p.invulnSecLeft > 0) continue;
    for (const g of room.pacmanGhosts) {
      if (g.mode === "eaten" || g.mode === "frightened") continue;
      if (p.col === g.col && p.row === g.row) {
        killPlayer(room, pid);
        break;
      }
    }
  }
}

export function handlePacmanPauseEdge(
  room: Room,
  playerId: number,
  p: PacmanPlayerSim,
  pauseHeld: boolean
): void {
  const edge = pauseHeld && !p.prevPauseHeld;
  p.prevPauseHeld = pauseHeld;
  if (!edge) return;
  if (room.phase === "pacman" && room.pacmanCountdown === null) {
    room.phase = "pacman_paused";
    room.pacmanPausedByPlayerId = playerId;
  }
}

export function tickPacmanPlay(room: Room, dt: number): void {
  pruneBanners(room);
  if (room.pacmanCountdown !== null && room.pacmanCountdown > 0) {
    room.pacmanCountdown -= dt;
    if (room.pacmanCountdown <= 0) room.pacmanCountdown = null;
    return;
  }

  if (room.phase !== "pacman") return;

  if (room.pacmanFrightenedSecLeft > 0) {
    room.pacmanFrightenedSecLeft = Math.max(0, room.pacmanFrightenedSecLeft - dt);
    if (room.pacmanFrightenedSecLeft <= 0) {
      for (const g of room.pacmanGhosts) {
        if (g.mode === "frightened") g.mode = "normal";
      }
    }
  } else {
    room.pacmanChaseScatterTimer -= dt;
    if (room.pacmanChaseScatterTimer <= 0) {
      room.pacmanChaseScatterTimer = PACMAN_CHASE_SCATTER_SEC;
      room.pacmanChaseMode = !room.pacmanChaseMode;
    }
  }

  for (const p of room.pacmanPlayers.values()) {
    if (!p.alive && p.lives > 0) {
      p.respawnSecLeft = Math.max(0, p.respawnSecLeft - dt);
      if (p.respawnSecLeft <= 0) {
        p.alive = true;
        p.col = room.pacmanPlayerSpawn.col;
        p.row = room.pacmanPlayerSpawn.row;
        p.invulnSecLeft = PACMAN_INVULN_SEC;
      }
    } else if (p.alive && p.invulnSecLeft > 0) {
      p.invulnSecLeft = Math.max(0, p.invulnSecLeft - dt);
    }
  }

  for (const [playerId, p] of room.pacmanPlayers) {
    if (!p.alive) continue;
    const player = room.players.get(playerId);
    if (!player) continue;

    const b = player.input.buttons;
    const aimUp = (b & Btn.AimUp) !== 0;
    const aimDown = (b & Btn.AimDown) !== 0;
    const h = player.input.h;
    const deadzone = 12;
    const leftHeld = h < -deadzone;
    const rightHeld = h > deadzone;

    const inputDir = dirFromInput(aimUp, aimDown, leftHeld, rightHeld);
    if (inputDir !== null) p.queuedDir = inputDir;

    p.prevAimUp = aimUp;
    p.prevAimDown = aimDown;
    p.prevH = h;
    p.prevLeft = leftHeld;
    p.prevRight = rightHeld;

    p.moveCooldown = Math.max(0, p.moveCooldown - dt);
    if (p.moveCooldown <= 0) stepPlayer(room, p);
    if (room.phase !== "pacman") return;
  }

  for (const g of room.pacmanGhosts) {
    g.moveCooldown = Math.max(0, g.moveCooldown - dt);
    if (g.moveCooldown <= 0) stepGhost(room, g);
  }

  tickGhostPlayerCollisions(room);
}

export function buildPacmanHostJson(
  room: Room
): import("../src/shared/messages.js").HostStateJson["pacman"] {
  if (room.phase !== "pacman" && room.phase !== "pacman_paused" && room.phase !== "pacman_results") {
    return null;
  }

  const pelletCells: { col: number; row: number }[] = [];
  for (let row = 0; row < PACMAN_ROWS; row++) {
    for (let col = 0; col < PACMAN_COLS; col++) {
      if (room.pacmanPellets[row]?.[col]) pelletCells.push({ col, row });
    }
  }
  const powerPelletCells: { col: number; row: number }[] = [];
  for (const key of room.pacmanPowerPelletKeys) {
    const [cs, rs] = key.split(",");
    powerPelletCells.push({ col: Number(cs), row: Number(rs) });
  }

  const players: import("../src/shared/messages.js").PacmanPlayerHostJson[] = [];
  for (const [pid, p] of room.pacmanPlayers) {
    const pl = room.players.get(pid);
    players.push({
      playerId: pid,
      name: pl?.name ?? `P${pid}`,
      hue: pl?.hue ?? fallbackPlayerHue(pid),
      col: p.col,
      row: p.row,
      dir: p.dir,
      alive: p.alive,
      lives: p.lives,
      respawnSecLeft: p.respawnSecLeft,
      score: p.score,
      invulnSecLeft: p.invulnSecLeft,
    });
  }
  players.sort((a, b) => a.playerId - b.playerId);

  return {
    countdown: room.pacmanCountdown,
    originX: PACMAN_ORIGIN_X,
    originY: PACMAN_ORIGIN_Y,
    tile: PACMAN_TILE,
    cols: PACMAN_COLS,
    rows: PACMAN_ROWS,
    walls: room.pacmanWalls.map((r) => [...r]),
    pelletCells,
    powerPelletCells,
    pelletsRemaining: room.pacmanPelletsRemaining,
    totalPellets: room.pacmanTotalPellets,
    frightenedSecLeft: room.pacmanFrightenedSecLeft > 0 ? room.pacmanFrightenedSecLeft : null,
    chaseMode: room.pacmanChaseMode,
    players,
    ghosts: room.pacmanGhosts.map((g) => ({
      id: g.id,
      col: g.col,
      row: g.row,
      mode: g.mode,
      color: GHOST_COLORS[g.id % GHOST_COLORS.length]!,
    })),
    teamCleared: room.pacmanTeamCleared,
    teamWiped: room.pacmanTeamWiped,
    seriesWins: Object.fromEntries(room.seriesWins),
    paused: room.phase === "pacman_paused",
    pausedByPlayerId: room.pacmanPausedByPlayerId,
    banners: room.pacmanBanners.filter((b) => b.untilTick > room.tick),
  };
}

export function pacmanOnPlayerRemoved(room: Room, playerId: number): void {
  room.pacmanPlayers.delete(playerId);
  room.pacmanDeathNotices.delete(playerId);
  if (room.pacmanPausedByPlayerId === playerId) room.pacmanPausedByPlayerId = null;
}

export { initPacmanRound as restartPacmanRound };
