import {
  AIR_HOCKEY_GOALS_TO_WIN,
  AIR_HOCKEY_MAX_PLAYER_SPEED,
  AIR_HOCKEY_PERIOD_SEC,
} from "./airHockeySettings.js";

/** Room `gameSettings.airHockeyPeriodSec` — match length when an air hockey round resets. */
export const AIR_HOCKEY_GAME_PERIOD_SEC_MIN = 60;
export const AIR_HOCKEY_GAME_PERIOD_SEC_MAX = 900;

/** Room `gameSettings.airHockeyGoalsToWin`. */
export const AIR_HOCKEY_GAME_GOALS_TO_WIN_MIN = 1;
export const AIR_HOCKEY_GAME_GOALS_TO_WIN_MAX = 15;

/** Room `gameSettings.airHockeyMaxPlayerSpeed` — packed joystick cruise cap (world units/sec). */
export const AIR_HOCKEY_GAME_SPEED_MIN = 120;
export const AIR_HOCKEY_GAME_SPEED_MAX = 360;

export function clampAirHockeyPeriodSec(n: number): number {
  return Math.max(
    AIR_HOCKEY_GAME_PERIOD_SEC_MIN,
    Math.min(AIR_HOCKEY_GAME_PERIOD_SEC_MAX, Math.round(n))
  );
}

export function clampAirHockeyGoalsToWin(n: number): number {
  return Math.max(
    AIR_HOCKEY_GAME_GOALS_TO_WIN_MIN,
    Math.min(AIR_HOCKEY_GAME_GOALS_TO_WIN_MAX, Math.round(n))
  );
}

export function clampAirHockeyMaxPlayerSpeed(n: number): number {
  return Math.max(
    AIR_HOCKEY_GAME_SPEED_MIN,
    Math.min(AIR_HOCKEY_GAME_SPEED_MAX, Math.round(n))
  );
}

export function resolveAirHockeyPeriodSec(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.airHockeyPeriodSec;
  if (typeof v === "number" && Number.isFinite(v)) return clampAirHockeyPeriodSec(v);
  return AIR_HOCKEY_PERIOD_SEC;
}

export function resolveAirHockeyGoalsToWin(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.airHockeyGoalsToWin;
  if (typeof v === "number" && Number.isFinite(v)) return clampAirHockeyGoalsToWin(v);
  return AIR_HOCKEY_GOALS_TO_WIN;
}

export function resolveAirHockeyMaxPlayerSpeed(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.airHockeyMaxPlayerSpeed;
  if (typeof v === "number" && Number.isFinite(v)) return clampAirHockeyMaxPlayerSpeed(v);
  return AIR_HOCKEY_MAX_PLAYER_SPEED;
}
