/**
 * Player avatar / UI colors (HSL hue 0–359, fixed S/L in renderers).
 * New players get a hue that maximizes separation from players already in the room.
 */

/** Legacy deterministic hue when no assigned hue is available. */
export function fallbackPlayerHue(playerId: number): number {
  return (playerId * 47) % 360;
}

/**
 * Choose a hue 0..359 whose minimum circular distance to any existing hue is as large
 * as possible (maximin), so new players read as visually distinct.
 */
export function pickPlayerHue(existingHues: readonly number[]): number {
  // First joiner keeps legacy player-1 hue (1 * 47) % 360 — original warm yellow.
  if (existingHues.length === 0) return fallbackPlayerHue(1);
  let bestH = 0;
  let bestScore = -1;
  for (let h = 0; h < 360; h++) {
    let minD = 360;
    for (const e of existingHues) {
      const raw = Math.abs(h - e);
      const circ = Math.min(raw, 360 - raw);
      minD = Math.min(minD, circ);
    }
    if (minD > bestScore || (minD === bestScore && h < bestH)) {
      bestScore = minD;
      bestH = h;
    }
  }
  return bestH;
}
