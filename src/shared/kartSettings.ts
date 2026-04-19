/** Allowed range for room `gameSettings.kartForwardSpeed` (kart cruise / open-track recovery target). */
export const KART_FORWARD_SPEED_MIN = 80;
export const KART_FORWARD_SPEED_MAX = 280;
/** Default when `gameSettings.kartForwardSpeed` is unset (matches base kart physics). */
export const KART_FORWARD_SPEED_DEFAULT = 140;

export function clampKartForwardSpeed(n: number): number {
  return Math.max(KART_FORWARD_SPEED_MIN, Math.min(KART_FORWARD_SPEED_MAX, Math.round(n)));
}

export function resolveKartForwardSpeed(gameSettings: Record<string, unknown>): number {
  const v = gameSettings.kartForwardSpeed;
  if (typeof v === "number" && Number.isFinite(v)) return clampKartForwardSpeed(v);
  return KART_FORWARD_SPEED_DEFAULT;
}
