import { TANKS_ROUNDS_TO_WIN, TANKS_TURN_SEC } from "./tanksSettings.js";

/** Room `gameSettings.tanksRoundsToWin`. */
export const TANKS_GAME_ROUNDS_TO_WIN_MIN = 1;
export const TANKS_GAME_ROUNDS_TO_WIN_MAX = 9;

/** Room `gameSettings.tanksTurnSec`. */
export const TANKS_GAME_TURN_SEC_MIN = 10;
export const TANKS_GAME_TURN_SEC_MAX = 45;

export function clampTanksRoundsToWin(n: number): number {
  return Math.max(
    TANKS_GAME_ROUNDS_TO_WIN_MIN,
    Math.min(TANKS_GAME_ROUNDS_TO_WIN_MAX, Math.round(n))
  );
}

export function clampTanksTurnSec(n: number): number {
  return Math.max(
    TANKS_GAME_TURN_SEC_MIN,
    Math.min(TANKS_GAME_TURN_SEC_MAX, Math.round(n))
  );
}

export function resolveTanksRoundsToWin(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.tanksRoundsToWin;
  if (typeof v === "number" && Number.isFinite(v)) return clampTanksRoundsToWin(v);
  return TANKS_ROUNDS_TO_WIN;
}

export function resolveTanksTurnSec(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.tanksTurnSec;
  if (typeof v === "number" && Number.isFinite(v)) return clampTanksTurnSec(v);
  return TANKS_TURN_SEC;
}
