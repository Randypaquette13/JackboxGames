import { TICK_RATE, WORLD_H, WORLD_W } from "./constants.js";

export const BOMMERMAN_TILE = 40;
export const BOMMERMAN_COLS = 24;
export const BOMMERMAN_ROWS = 13;
export const BOMMERMAN_GRID_W = BOMMERMAN_COLS * BOMMERMAN_TILE;
export const BOMMERMAN_GRID_H = BOMMERMAN_ROWS * BOMMERMAN_TILE;
export const BOMMERMAN_ORIGIN_X = (WORLD_W - BOMMERMAN_GRID_W) * 0.5;
export const BOMMERMAN_ORIGIN_Y = (WORLD_H - BOMMERMAN_GRID_H) * 0.5;

export const BOMMERMAN_COUNTDOWN_SEC = 3;
export const BOMMERMAN_BOMB_FUSE_SEC = 2.5;
export const BOMMERMAN_FLAME_SEC = 0.4;
export const BOMMERMAN_MOVE_COOLDOWN_SEC = 0.18;
export const BOMMERMAN_SPEED_COOLDOWN_MUL = 0.72;

export const BOMMERMAN_START_BOMB_LIMIT = 1;
export const BOMMERMAN_START_BLAST_RADIUS = 1;
export const BOMMERMAN_MAX_BOMB_LIMIT = 8;
export const BOMMERMAN_MAX_BLAST_RADIUS = 6;
export const BOMMERMAN_MAX_SPEED_TIER = 3;

export const BOMMERMAN_POWERUP_CHANCE = 0.3;

/** Death notice duration (ticks). */
export const BOMMERMAN_DEATH_NOTICE_TICKS = Math.floor(TICK_RATE * 8);

export type BombermanCellKind = "empty" | "hard" | "soft";
export type BombermanPowerKind = "bomb" | "fire" | "speed";

/** Classic four corners (inner grid coordinates). */
export const BOMMERMAN_CORNER_SPAWNS: readonly { col: number; row: number }[] = [
  { col: 1, row: 1 },
  { col: BOMMERMAN_COLS - 2, row: 1 },
  { col: 1, row: BOMMERMAN_ROWS - 2 },
  { col: BOMMERMAN_COLS - 2, row: BOMMERMAN_ROWS - 2 },
];

/** Extra spawn slots for 5–8 players (mid-edge), each with a directional pocket. */
export const BOMMERMAN_EXTRA_SPAWN_SLOTS: readonly { col: number; row: number }[] = [
  { col: 11, row: 1 },
  { col: 11, row: BOMMERMAN_ROWS - 2 },
  { col: 1, row: 6 },
  { col: BOMMERMAN_COLS - 2, row: 6 },
];

function isInner(col: number, row: number): boolean {
  return col >= 1 && col <= BOMMERMAN_COLS - 2 && row >= 1 && row <= BOMMERMAN_ROWS - 2;
}

/** Classic indestructible pillars on even coordinates (same as most Bomberman clones). */
function isHardPillar(col: number, row: number): boolean {
  return isInner(col, row) && col % 2 === 0 && row % 2 === 0;
}

/**
 * Classic corner / edge spawn pocket — 2×2 at corners, 4-tile opening on edges.
 * Matches standard Bomberman map clearing around each start position.
 */
export function bombermanSpawnPocketCells(col: number, row: number): { col: number; row: number }[] {
  const cells: { col: number; row: number }[] = [];
  const add = (c: number, r: number): void => {
    if (isInner(c, r)) cells.push({ col: c, row: r });
  };

  const left = col === 1;
  const right = col === BOMMERMAN_COLS - 2;
  const top = row === 1;
  const bottom = row === BOMMERMAN_ROWS - 2;

  if (left && top) {
    add(1, 1);
    add(2, 1);
    add(1, 2);
    add(2, 2);
  } else if (right && top) {
    add(col, row);
    add(col - 1, row);
    add(col, row + 1);
    add(col - 1, row + 1);
  } else if (left && bottom) {
    add(col, row);
    add(col + 1, row);
    add(col, row - 1);
    add(col + 1, row - 1);
  } else if (right && bottom) {
    add(col, row);
    add(col - 1, row);
    add(col, row - 1);
    add(col - 1, row - 1);
  } else if (top) {
    add(col, row);
    add(col - 1, row);
    add(col + 1, row);
    add(col, row + 1);
  } else if (bottom) {
    add(col, row);
    add(col - 1, row);
    add(col + 1, row);
    add(col, row - 1);
  } else if (left) {
    add(col, row);
    add(col, row - 1);
    add(col, row + 1);
    add(col + 1, row);
  } else if (right) {
    add(col, row);
    add(col, row - 1);
    add(col, row + 1);
    add(col - 1, row);
  } else {
    add(col, row);
    add(col - 1, row);
    add(col + 1, row);
    add(col, row - 1);
    add(col, row + 1);
  }
  return cells;
}

/** Pick spawn anchors: 2-player uses diagonal corners; 3–4 use corners; 5+ adds edge slots. */
export function pickBombermanSpawns(playerCount: number): { col: number; row: number }[] {
  const n = Math.max(1, Math.min(playerCount, 8));
  const corners = BOMMERMAN_CORNER_SPAWNS;
  if (n === 1) return [{ ...corners[0]! }];
  if (n === 2) return [{ ...corners[0]! }, { ...corners[3]! }];
  if (n === 3) return [{ ...corners[0]! }, { ...corners[1]! }, { ...corners[2]! }];
  if (n === 4) return corners.map((s) => ({ ...s }));
  const extras = BOMMERMAN_EXTRA_SPAWN_SLOTS.slice(0, n - 4);
  return [...corners.map((s) => ({ ...s })), ...extras.map((s) => ({ ...s }))];
}

function isSpawnPocketCell(
  col: number,
  row: number,
  spawns: readonly { col: number; row: number }[]
): boolean {
  for (const s of spawns) {
    for (const p of bombermanSpawnPocketCells(s.col, s.row)) {
      if (p.col === col && p.row === row) return true;
    }
  }
  return false;
}

export function bombermanMoveCooldownSec(speedTier: number): number {
  const tier = Math.max(0, Math.min(BOMMERMAN_MAX_SPEED_TIER, speedTier));
  return BOMMERMAN_MOVE_COOLDOWN_SEC * Math.pow(BOMMERMAN_SPEED_COOLDOWN_MUL, tier);
}

export function bombermanCellCenterPx(col: number, row: number): { x: number; y: number } {
  return {
    x: BOMMERMAN_ORIGIN_X + (col + 0.5) * BOMMERMAN_TILE,
    y: BOMMERMAN_ORIGIN_Y + (row + 0.5) * BOMMERMAN_TILE,
  };
}

export type BombermanArena = {
  cells: BombermanCellKind[][];
  spawns: { col: number; row: number }[];
};

/** Build classic arena: border walls, even-coordinate pillars, soft blocks elsewhere (spawn pockets clear). */
export function buildBombermanArena(playerCount: number): BombermanArena {
  const spawns = pickBombermanSpawns(playerCount);
  const cells: BombermanCellKind[][] = [];
  for (let row = 0; row < BOMMERMAN_ROWS; row++) {
    const line: BombermanCellKind[] = [];
    for (let col = 0; col < BOMMERMAN_COLS; col++) {
      if (col === 0 || row === 0 || col === BOMMERMAN_COLS - 1 || row === BOMMERMAN_ROWS - 1) {
        line.push("hard");
      } else if (isHardPillar(col, row) && !isSpawnPocketCell(col, row, spawns)) {
        line.push("hard");
      } else if (isSpawnPocketCell(col, row, spawns)) {
        line.push("empty");
      } else {
        line.push("soft");
      }
    }
    cells.push(line);
  }
  return { cells, spawns };
}

export function pickBombermanPowerKind(): BombermanPowerKind {
  const r = Math.random();
  if (r < 1 / 3) return "bomb";
  if (r < 2 / 3) return "fire";
  return "speed";
}
