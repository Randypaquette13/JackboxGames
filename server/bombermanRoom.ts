import { TICK_RATE } from "../src/shared/constants.js";
import {
  BOMMERMAN_BOMB_FUSE_SEC,
  BOMMERMAN_COUNTDOWN_SEC,
  BOMMERMAN_DEATH_NOTICE_TICKS,
  BOMMERMAN_FLAME_SEC,
  BOMMERMAN_MAX_BLAST_RADIUS,
  BOMMERMAN_MAX_BOMB_LIMIT,
  BOMMERMAN_MAX_SPEED_TIER,
  BOMMERMAN_ORIGIN_X,
  BOMMERMAN_ORIGIN_Y,
  BOMMERMAN_POWERUP_CHANCE,
  BOMMERMAN_START_BLAST_RADIUS,
  BOMMERMAN_START_BOMB_LIMIT,
  BOMMERMAN_TILE,
  BOMMERMAN_COLS,
  BOMMERMAN_ROWS,
  buildBombermanArena,
  bombermanMoveCooldownSec,
  pickBombermanPowerKind,
  type BombermanCellKind,
  type BombermanPowerKind,
} from "../src/shared/bombermanSettings.js";
import { fallbackPlayerHue } from "../src/shared/playerColors.js";
import { Btn } from "../src/shared/protocol.js";
import type { Room } from "./gameRoom.js";

export type BombermanPlayerSim = {
  col: number;
  row: number;
  alive: boolean;
  bombLimit: number;
  blastRadius: number;
  speedTier: number;
  moveCooldown: number;
  prevPauseHeld: boolean;
  prevAimUp: boolean;
  prevAimDown: boolean;
  prevH: number;
  prevLeft: boolean;
  prevRight: boolean;
  prevFire: boolean;
};

export type BombermanBombSim = {
  col: number;
  row: number;
  ownerId: number;
  fuse: number;
  blastRadius: number;
};

export type BombermanFlameSim = {
  col: number;
  row: number;
  ttl: number;
};

export type BombermanPowerUpSim = {
  col: number;
  row: number;
  kind: BombermanPowerKind;
};

const DIRS = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
] as const;

export function clearBombermanState(room: Room): void {
  room.bombermanCountdown = null;
  room.bombermanCells = [];
  room.bombermanPlayers.clear();
  room.bombermanBombs = [];
  room.bombermanFlames = [];
  room.bombermanPowerUps = [];
  room.bombermanWinnerId = null;
  room.bombermanPausedByPlayerId = null;
  room.bombermanBanners = [];
  room.bombermanDeathNotices.clear();
}

export function bootstrapBombermanFromMenu(room: Room): void {
  room.phase = "bomberman";
  room.stubId = null;
  room.showQr = false;
  clearBombermanState(room);
  initBombermanRound(room);
}

function initBombermanRound(room: Room): void {
  const ids = [...room.players.keys()].sort((a, b) => a - b);
  const arena = buildBombermanArena(ids.length);
  room.bombermanCells = arena.cells.map((row) => [...row]);
  room.bombermanBombs = [];
  room.bombermanFlames = [];
  room.bombermanPowerUps = [];
  room.bombermanWinnerId = null;
  room.bombermanPausedByPlayerId = null;
  room.bombermanBanners = [];
  room.bombermanDeathNotices.clear();
  room.bombermanCountdown = BOMMERMAN_COUNTDOWN_SEC;
  room.bombermanPlayers.clear();
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i]!;
    const spawn = arena.spawns[i] ?? arena.spawns[0]!;
    room.bombermanPlayers.set(pid, {
      col: spawn.col,
      row: spawn.row,
      alive: true,
      bombLimit: BOMMERMAN_START_BOMB_LIMIT,
      blastRadius: BOMMERMAN_START_BLAST_RADIUS,
      speedTier: 0,
      moveCooldown: 0,
      prevPauseHeld: false,
      prevAimUp: false,
      prevAimDown: false,
      prevH: 0,
      prevLeft: false,
      prevRight: false,
      prevFire: false,
    });
  }
}

function cellAt(room: Room, col: number, row: number): BombermanCellKind | null {
  if (col < 0 || row < 0 || col >= BOMMERMAN_COLS || row >= BOMMERMAN_ROWS) return null;
  return room.bombermanCells[row]?.[col] ?? null;
}

function setCell(room: Room, col: number, row: number, kind: BombermanCellKind): void {
  if (col < 0 || row < 0 || col >= BOMMERMAN_COLS || row >= BOMMERMAN_ROWS) return;
  const rowArr = room.bombermanCells[row];
  if (rowArr) rowArr[col] = kind;
}

function bombAt(room: Room, col: number, row: number): BombermanBombSim | undefined {
  return room.bombermanBombs.find((b) => b.col === col && b.row === row);
}

function playerAt(room: Room, col: number, row: number, exceptId?: number): BombermanPlayerSim | null {
  for (const [pid, p] of room.bombermanPlayers) {
    if (pid === exceptId || !p.alive) continue;
    if (p.col === col && p.row === row) return p;
  }
  return null;
}

function activeBombCount(room: Room, ownerId: number): number {
  return room.bombermanBombs.filter((b) => b.ownerId === ownerId).length;
}

function isBlockedForMove(room: Room, col: number, row: number, selfId: number): boolean {
  const c = cellAt(room, col, row);
  if (c === null || c === "hard" || c === "soft") return true;
  if (bombAt(room, col, row)) return true;
  if (playerAt(room, col, row, selfId)) return true;
  return false;
}

function pushBanner(room: Room, text: string, sec: number): void {
  room.bombermanBanners.push({ text, untilTick: room.tick + Math.floor(TICK_RATE * sec) });
}

function pruneBanners(room: Room): void {
  room.bombermanBanners = room.bombermanBanners.filter((b) => b.untilTick > room.tick);
}

function killPlayer(room: Room, playerId: number): void {
  const p = room.bombermanPlayers.get(playerId);
  if (!p || !p.alive) return;
  p.alive = false;
  room.bombermanDeathNotices.set(playerId, {
    text: "You were blasted!",
    untilTick: room.tick + BOMMERMAN_DEATH_NOTICE_TICKS,
  });
  const pl = room.players.get(playerId);
  const name = pl?.name ?? `P${playerId}`;
  pushBanner(room, `${name} is out`, 2.5);
  checkBombermanGameOver(room);
}

function checkBombermanGameOver(room: Room): void {
  if (room.phase !== "bomberman") return;
  const alive = [...room.bombermanPlayers.entries()].filter(([, p]) => p.alive);
  if (alive.length > 1) return;

  if (alive.length === 1) {
    room.bombermanWinnerId = alive[0]![0];
    const wid = room.bombermanWinnerId;
    const w = room.seriesWins.get(wid) ?? 0;
    room.seriesWins.set(wid, w + 1);
    const pl = room.players.get(wid);
    pushBanner(room, `${pl?.name ?? `P${wid}`} wins!`, 4);
  } else {
    room.bombermanWinnerId = null;
    pushBanner(room, "Everyone eliminated — tie!", 4);
  }
  room.phase = "bomberman_results";
  room.menuIndex = 0;
}

function tryPickupPowerUp(room: Room, p: BombermanPlayerSim): void {
  const idx = room.bombermanPowerUps.findIndex((pu) => pu.col === p.col && pu.row === p.row);
  if (idx < 0) return;
  const pu = room.bombermanPowerUps[idx]!;
  room.bombermanPowerUps.splice(idx, 1);
  if (pu.kind === "bomb") {
    p.bombLimit = Math.min(BOMMERMAN_MAX_BOMB_LIMIT, p.bombLimit + 1);
  } else if (pu.kind === "fire") {
    p.blastRadius = Math.min(BOMMERMAN_MAX_BLAST_RADIUS, p.blastRadius + 1);
  } else {
    p.speedTier = Math.min(BOMMERMAN_MAX_SPEED_TIER, p.speedTier + 1);
  }
}

function destroySoftBlock(room: Room, col: number, row: number): void {
  if (cellAt(room, col, row) !== "soft") return;
  setCell(room, col, row, "empty");
  if (Math.random() < BOMMERMAN_POWERUP_CHANCE) {
    room.bombermanPowerUps.push({ col, row, kind: pickBombermanPowerKind() });
  }
}

function detonateBomb(room: Room, bomb: BombermanBombSim, pending: BombermanBombSim[]): void {
  const originCol = bomb.col;
  const originRow = bomb.row;
  room.bombermanBombs = room.bombermanBombs.filter((b) => b !== bomb);

  const flameCells = new Set<string>();
  const addFlame = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= BOMMERMAN_COLS || row >= BOMMERMAN_ROWS) return;
    flameCells.add(`${col},${row}`);
  };

  addFlame(originCol, originRow);
  for (const { dc, dr } of DIRS) {
    for (let i = 1; i <= bomb.blastRadius; i++) {
      const col = originCol + dc * i;
      const row = originRow + dr * i;
      const c = cellAt(room, col, row);
      if (c === null || c === "hard") break;
      addFlame(col, row);
      if (c === "soft") {
        destroySoftBlock(room, col, row);
        break;
      }
      const other = bombAt(room, col, row);
      if (other) {
        pending.push(other);
        break;
      }
    }
  }

  for (const key of flameCells) {
    const [cs, rs] = key.split(",");
    const col = Number(cs);
    const row = Number(rs);
    room.bombermanFlames.push({ col, row, ttl: BOMMERMAN_FLAME_SEC });
  }
}

function resolveExplosions(room: Room): void {
  const pending: BombermanBombSim[] = [];
  for (const bomb of [...room.bombermanBombs]) {
    if (bomb.fuse <= 0) detonateBomb(room, bomb, pending);
  }
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (room.bombermanBombs.includes(next)) detonateBomb(room, next, pending);
  }
}

function applyFlameDamage(room: Room): void {
  for (const [pid, p] of room.bombermanPlayers) {
    if (!p.alive) continue;
    for (const f of room.bombermanFlames) {
      if (f.col === p.col && f.row === p.row) {
        killPlayer(room, pid);
        break;
      }
    }
  }
}

function tryPlaceBomb(room: Room, playerId: number, p: BombermanPlayerSim): void {
  if (activeBombCount(room, playerId) >= p.bombLimit) return;
  if (bombAt(room, p.col, p.row)) return;
  room.bombermanBombs.push({
    col: p.col,
    row: p.row,
    ownerId: playerId,
    fuse: BOMMERMAN_BOMB_FUSE_SEC,
    blastRadius: p.blastRadius,
  });
}

function tryMovePlayer(room: Room, playerId: number, p: BombermanPlayerSim, dc: number, dr: number): void {
  const nc = p.col + dc;
  const nr = p.row + dr;
  if (isBlockedForMove(room, nc, nr, playerId)) return;
  p.col = nc;
  p.row = nr;
  p.moveCooldown = bombermanMoveCooldownSec(p.speedTier);
  tryPickupPowerUp(room, p);
}

export function handleBombermanPauseEdge(
  room: Room,
  playerId: number,
  p: BombermanPlayerSim,
  pauseHeld: boolean
): void {
  const edge = pauseHeld && !p.prevPauseHeld;
  p.prevPauseHeld = pauseHeld;
  if (!edge) return;
  if (room.phase === "bomberman" && room.bombermanCountdown === null) {
    room.phase = "bomberman_paused";
    room.bombermanPausedByPlayerId = playerId;
  }
}

export function tickBombermanPlay(room: Room, dt: number): void {
  pruneBanners(room);
  if (room.bombermanCountdown !== null && room.bombermanCountdown > 0) {
    room.bombermanCountdown -= dt;
    if (room.bombermanCountdown <= 0) room.bombermanCountdown = null;
    return;
  }

  if (room.phase !== "bomberman") return;

  for (const bomb of room.bombermanBombs) {
    bomb.fuse -= dt;
  }
  resolveExplosions(room);

  for (const f of room.bombermanFlames) {
    f.ttl -= dt;
  }
  room.bombermanFlames = room.bombermanFlames.filter((f) => f.ttl > 0);

  applyFlameDamage(room);
  if (room.phase !== "bomberman") return;

  for (const [playerId, p] of room.bombermanPlayers) {
    if (!p.alive) continue;
    const player = room.players.get(playerId);
    if (!player) continue;

    const b = player.input.buttons;
    const aimUp = (b & Btn.AimUp) !== 0;
    const aimDown = (b & Btn.AimDown) !== 0;
    const fireHeld = (b & Btn.Fire) !== 0;
    const h = player.input.h;
    const edgeUp = aimUp && !p.prevAimUp;
    const edgeDown = aimDown && !p.prevAimDown;
    const edgeFire = fireHeld && !p.prevFire;
    const deadzone = 12;
    const leftHeld = h < -deadzone;
    const rightHeld = h > deadzone;
    const edgeLeft = leftHeld && !p.prevLeft;
    const edgeRight = rightHeld && !p.prevRight;

    p.prevAimUp = aimUp;
    p.prevAimDown = aimDown;
    p.prevFire = fireHeld;
    p.prevH = h;
    p.prevLeft = leftHeld;
    p.prevRight = rightHeld;

    if (edgeFire) tryPlaceBomb(room, playerId, p);

    if (p.moveCooldown > 0) {
      p.moveCooldown -= dt;
    } else {
      if (edgeUp) tryMovePlayer(room, playerId, p, 0, -1);
      else if (edgeDown) tryMovePlayer(room, playerId, p, 0, 1);
      else if (edgeLeft) tryMovePlayer(room, playerId, p, -1, 0);
      else if (edgeRight) tryMovePlayer(room, playerId, p, 1, 0);
    }
  }
}

export function buildBombermanHostJson(
  room: Room
): import("../src/shared/messages.js").HostStateJson["bomberman"] {
  if (
    room.phase !== "bomberman" &&
    room.phase !== "bomberman_paused" &&
    room.phase !== "bomberman_results"
  ) {
    return null;
  }

  const players: import("../src/shared/messages.js").BombermanPlayerHostJson[] = [];
  for (const [pid, p] of room.bombermanPlayers) {
    const pl = room.players.get(pid);
    players.push({
      playerId: pid,
      name: pl?.name ?? `P${pid}`,
      hue: pl?.hue ?? fallbackPlayerHue(pid),
      col: p.col,
      row: p.row,
      alive: p.alive,
      bombLimit: p.bombLimit,
      blastRadius: p.blastRadius,
      speedTier: p.speedTier,
    });
  }
  players.sort((a, b) => a.playerId - b.playerId);

  return {
    countdown: room.bombermanCountdown,
    originX: BOMMERMAN_ORIGIN_X,
    originY: BOMMERMAN_ORIGIN_Y,
    tile: BOMMERMAN_TILE,
    cols: BOMMERMAN_COLS,
    rows: BOMMERMAN_ROWS,
    cells: room.bombermanCells.map((row) => [...row]),
    players,
    bombs: room.bombermanBombs.map((b) => ({
      col: b.col,
      row: b.row,
      ownerId: b.ownerId,
      fuseLeft: b.fuse,
    })),
    flames: room.bombermanFlames.map((f) => ({ col: f.col, row: f.row })),
    powerUps: room.bombermanPowerUps.map((pu) => ({ col: pu.col, row: pu.row, kind: pu.kind })),
    winnerId: room.bombermanWinnerId,
    seriesWins: Object.fromEntries(room.seriesWins),
    paused: room.phase === "bomberman_paused",
    pausedByPlayerId: room.bombermanPausedByPlayerId,
    banners: room.bombermanBanners.filter((b) => b.untilTick > room.tick),
  };
}

export function bombermanOnPlayerRemoved(room: Room, playerId: number): void {
  room.bombermanPlayers.delete(playerId);
  room.bombermanDeathNotices.delete(playerId);
  if (room.bombermanPausedByPlayerId === playerId) room.bombermanPausedByPlayerId = null;
  room.bombermanBombs = room.bombermanBombs.filter((b) => b.ownerId !== playerId);
  if (room.phase === "bomberman") checkBombermanGameOver(room);
}

export { initBombermanRound as restartBombermanRound };
