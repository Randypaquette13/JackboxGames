/**
 * Player avatar / UI colors (HSL hue 0–359, fixed S/L in renderers).
 * New players get a hue that maximizes separation from players already in the room.
 */

/** Legacy deterministic hue when no assigned hue is available. */
export function fallbackPlayerHue(playerId: number): number {
  return (playerId * 47) % 360;
}

const BASE_YELLOW_HUE = fallbackPlayerHue(1);

function normalizeHue(h: number): number {
  const n = h % 360;
  return n < 0 ? n + 360 : n;
}

const FIRST_30_HUES = Array.from(
  { length: 30 },
  (_, i) => Math.round(normalizeHue(BASE_YELLOW_HUE + i * (360 / 30))) % 360
);

function circularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

function buildDistinctHueOrder(hues: readonly number[]): number[] {
  if (hues.length === 0) return [];
  const order: number[] = [hues[0]];
  const remaining = new Set<number>(hues.slice(1));
  while (remaining.size > 0) {
    let bestHue = -1;
    let bestScore = -1;
    for (const h of remaining) {
      let minDist = 180;
      for (const chosen of order) {
        minDist = Math.min(minDist, circularDistance(h, chosen));
      }
      if (minDist > bestScore || (minDist === bestScore && h < bestHue)) {
        bestScore = minDist;
        bestHue = h;
      }
    }
    order.push(bestHue);
    remaining.delete(bestHue);
  }
  return order;
}

const FIRST_30_HUES_DISTINCT_ORDER = buildDistinctHueOrder(FIRST_30_HUES);

function usedHueSet(hues: readonly number[]): Set<number> {
  const used = new Set<number>();
  for (const h of hues) {
    used.add(Math.round(normalizeHue(h)) % 360);
  }
  return used;
}

export function pickPlayerHue(existingHues: readonly number[]): number {
  const used = usedHueSet(existingHues);

  for (const hue of FIRST_30_HUES_DISTINCT_ORDER) {
    if (!used.has(hue)) return hue;
  }

  const unused: number[] = [];
  for (let h = 0; h < 360; h++) {
    if (!used.has(h)) unused.push(h);
  }
  if (unused.length === 0) return Math.round(BASE_YELLOW_HUE) % 360;
  return unused[Math.floor(Math.random() * unused.length)];
}
