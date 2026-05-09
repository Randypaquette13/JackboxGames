import {
  FOOTBALL_MAX_PLAYER_SPEED,
  FOOTBALL_PERIOD_SEC,
  FOOTBALL_TD_TO_WIN,
} from "./footballSettings.js";

/** Room `gameSettings.footballPeriodSec` — match length when a football round resets. */
export const FOOTBALL_GAME_PERIOD_SEC_MIN = 60;
export const FOOTBALL_GAME_PERIOD_SEC_MAX = 900;

/** Room `gameSettings.footballTdToWin`. */
export const FOOTBALL_GAME_TD_TO_WIN_MIN = 1;
export const FOOTBALL_GAME_TD_TO_WIN_MAX = 15;

/** Room `gameSettings.footballMaxPlayerSpeed` — packed joystick cruise cap (world units/sec). */
export const FOOTBALL_GAME_SPEED_MIN = 120;
export const FOOTBALL_GAME_SPEED_MAX = 320;

export function clampFootballPeriodSec(n: number): number {
  return Math.max(
    FOOTBALL_GAME_PERIOD_SEC_MIN,
    Math.min(FOOTBALL_GAME_PERIOD_SEC_MAX, Math.round(n))
  );
}

export function clampFootballTdToWin(n: number): number {
  return Math.max(
    FOOTBALL_GAME_TD_TO_WIN_MIN,
    Math.min(FOOTBALL_GAME_TD_TO_WIN_MAX, Math.round(n))
  );
}

export function clampFootballMaxPlayerSpeed(n: number): number {
  return Math.max(
    FOOTBALL_GAME_SPEED_MIN,
    Math.min(FOOTBALL_GAME_SPEED_MAX, Math.round(n))
  );
}

export function resolveFootballPeriodSec(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.footballPeriodSec;
  if (typeof v === "number" && Number.isFinite(v)) return clampFootballPeriodSec(v);
  return FOOTBALL_PERIOD_SEC;
}

export function resolveFootballTdToWin(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.footballTdToWin;
  if (typeof v === "number" && Number.isFinite(v)) return clampFootballTdToWin(v);
  return FOOTBALL_TD_TO_WIN;
}

export function resolveFootballMaxPlayerSpeed(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.footballMaxPlayerSpeed;
  if (typeof v === "number" && Number.isFinite(v)) return clampFootballMaxPlayerSpeed(v);
  return FOOTBALL_MAX_PLAYER_SPEED;
}
