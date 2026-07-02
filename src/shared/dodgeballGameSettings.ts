import {
  DODGEBALL_MAX_PLAYER_SPEED,
  DODGEBALL_ROUNDS_TO_WIN,
  DODGEBALL_THROW_HOMING_RATE,
  DODGEBALL_THROW_RELEASE_AIM,
  DODGEBALL_THROW_SPEED,
} from "./dodgeballSettings.js";

/** Room `gameSettings.dodgeballRoundsToWin`. */
export const DODGEBALL_GAME_ROUNDS_TO_WIN_MIN = 1;
export const DODGEBALL_GAME_ROUNDS_TO_WIN_MAX = 9;

/** Room `gameSettings.dodgeballMaxPlayerSpeed`. */
export const DODGEBALL_GAME_SPEED_MIN = 120;
export const DODGEBALL_GAME_SPEED_MAX = 320;

/** Room `gameSettings.dodgeballThrowSpeed`. */
export const DODGEBALL_GAME_THROW_SPEED_MIN = 400;
export const DODGEBALL_GAME_THROW_SPEED_MAX = 1400;

/** Room `gameSettings.dodgeballThrowHomingRate` (1/sec in-flight curve). */
export const DODGEBALL_GAME_THROW_HOMING_MIN = 0;
export const DODGEBALL_GAME_THROW_HOMING_MAX = 8;

/** Room `gameSettings.dodgeballThrowReleaseAim` (0–1 release blend toward target). */
export const DODGEBALL_GAME_THROW_RELEASE_AIM_MIN = 0;
export const DODGEBALL_GAME_THROW_RELEASE_AIM_MAX = 0.5;

export function clampDodgeballRoundsToWin(n: number): number {
  return Math.max(
    DODGEBALL_GAME_ROUNDS_TO_WIN_MIN,
    Math.min(DODGEBALL_GAME_ROUNDS_TO_WIN_MAX, Math.round(n))
  );
}

export function clampDodgeballMaxPlayerSpeed(n: number): number {
  return Math.max(
    DODGEBALL_GAME_SPEED_MIN,
    Math.min(DODGEBALL_GAME_SPEED_MAX, Math.round(n))
  );
}

export function clampDodgeballThrowSpeed(n: number): number {
  return Math.max(
    DODGEBALL_GAME_THROW_SPEED_MIN,
    Math.min(DODGEBALL_GAME_THROW_SPEED_MAX, Math.round(n))
  );
}

export function clampDodgeballThrowHomingRate(n: number): number {
  const step = 0.5;
  const clamped = Math.max(
    DODGEBALL_GAME_THROW_HOMING_MIN,
    Math.min(DODGEBALL_GAME_THROW_HOMING_MAX, n)
  );
  return Math.round(clamped / step) * step;
}

export function clampDodgeballThrowReleaseAim(n: number): number {
  const step = 0.05;
  const clamped = Math.max(
    DODGEBALL_GAME_THROW_RELEASE_AIM_MIN,
    Math.min(DODGEBALL_GAME_THROW_RELEASE_AIM_MAX, n)
  );
  return Math.round(clamped / step) * step;
}

export function resolveDodgeballRoundsToWin(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.dodgeballRoundsToWin;
  if (typeof v === "number" && Number.isFinite(v)) return clampDodgeballRoundsToWin(v);
  return DODGEBALL_ROUNDS_TO_WIN;
}

export function resolveDodgeballMaxPlayerSpeed(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.dodgeballMaxPlayerSpeed;
  if (typeof v === "number" && Number.isFinite(v)) return clampDodgeballMaxPlayerSpeed(v);
  return DODGEBALL_MAX_PLAYER_SPEED;
}

export function resolveDodgeballThrowSpeed(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.dodgeballThrowSpeed;
  if (typeof v === "number" && Number.isFinite(v)) return clampDodgeballThrowSpeed(v);
  return DODGEBALL_THROW_SPEED;
}

export function resolveDodgeballThrowHomingRate(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.dodgeballThrowHomingRate;
  if (typeof v === "number" && Number.isFinite(v)) return clampDodgeballThrowHomingRate(v);
  return DODGEBALL_THROW_HOMING_RATE;
}

export function resolveDodgeballThrowReleaseAim(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.dodgeballThrowReleaseAim;
  if (typeof v === "number" && Number.isFinite(v)) return clampDodgeballThrowReleaseAim(v);
  return DODGEBALL_THROW_RELEASE_AIM;
}
