/**
 * Figure-8 kart track: walls from [`kartTrackGeometry.json`](./kartTrackGeometry.json)
 * (regenerate with `npm run gen:kart-geometry`). Lemniscate used for spawn/finish/lap only.
 * y-down screen coordinates.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Vec2 = { x: number; y: number };

type KartTrackGeometryFile = {
  outerWall: Vec2[];
  innerIslands: Vec2[][];
  bridgePolygon: Vec2[];
  underpassPolygon: Vec2[];
  interiorProbe: Vec2;
};

let _geometryCache: KartTrackGeometryFile | null = null;

function loadTrackGeometry(): KartTrackGeometryFile {
  if (_geometryCache) return _geometryCache;
  const dir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(dir, "kartTrackGeometry.json"), "utf8");
  _geometryCache = JSON.parse(raw) as KartTrackGeometryFile;
  return _geometryCache;
}

export const KART_FORWARD_SPEED = 220;
export const KART_TURN_SPEED = 2.8;
export const KART_WALL_SCRAPE_FRICTION = 4.5;
export const KART_WALL_IMPACT_FRICTION = 2.2;
export const KART_SPEED_RECOVER = 2.8;
export const KART_SPEED_MIN = 45;

const SPAWN_X = 170;
const SPAWN_Y = 145;
const SPAWN_ANGLE = 0;
const SPAWN_GAP = 22;
const FINISH_A: Vec2 = { x: 270, y: 100 };
const FINISH_B: Vec2 = { x: 270, y: 190 };
const FINISH_TAN: Vec2 = { x: 1, y: 0 };

const TRACK = {
  spawnX: SPAWN_X,
  spawnY: SPAWN_Y,
  spawnAngle: SPAWN_ANGLE,
} as const;

export type WallKind = "outer" | `inner${number}`;
export type CrossingMode = "bridge" | "underpass";

let _outerWall: Vec2[] = [];
let _innerIslands: Vec2[][] = [];
let _finishA: Vec2 = { x: 0, y: 0 };
let _finishB: Vec2 = { x: 0, y: 0 };
/** Unit tangent along centerline at finish (forward race direction) */
let _finishTan: Vec2 = { x: 0, y: 0 };
/** Bridge deck quad; underpass is the same polygon with reversed winding — world space */
let _bridgePoly: Vec2[] = [];
let _underpassPoly: Vec2[] = [];
/** Point known to lie on drivable surface (for wall normals) */
let _interiorProbe: Vec2 = { x: SPAWN_X, y: SPAWN_Y };

export function sampleEllipse(cx: number, cy: number, rx: number, ry: number, n = 48): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(u), y: cy + ry * Math.sin(u) });
  }
  return pts;
}

function buildTrack(): void {
  const g = loadTrackGeometry();
  _outerWall = g.outerWall;
  _innerIslands = g.innerIslands;
  _bridgePoly = g.bridgePolygon;
  _underpassPoly = g.underpassPolygon;
  _interiorProbe = g.interiorProbe;

  _finishA = { ...FINISH_A };
  _finishB = { ...FINISH_B };
  _finishTan = { ...FINISH_TAN };
}

buildTrack();

export function getOuterWall(): Vec2[] {
  return _outerWall;
}

export function getInnerIslands(): Vec2[][] {
  return _innerIslands;
}

export function getBridgePolygon(): Vec2[] {
  return _bridgePoly;
}

export function getUnderpassPolygon(): Vec2[] {
  return _underpassPoly;
}

function crossingCenter(): Vec2 {
  if (_bridgePoly.length === 0) return { x: (FINISH_A.x + FINISH_B.x) / 2, y: (FINISH_A.y + FINISH_B.y) / 2 };
  const sx = _bridgePoly.reduce((s, p) => s + p.x, 0);
  const sy = _bridgePoly.reduce((s, p) => s + p.y, 0);
  return { x: sx / _bridgePoly.length, y: sy / _bridgePoly.length };
}

function crossingHalfSpans(): { halfAlongBridge: number; halfAcrossBridge: number } {
  if (_bridgePoly.length === 0) return { halfAlongBridge: 1, halfAcrossBridge: 1 };
  const c = crossingCenter();
  const ubx = Math.SQRT1_2;
  const uby = Math.SQRT1_2;
  const uax = Math.SQRT1_2;
  const uay = -Math.SQRT1_2;
  let halfAlongBridge = 1;
  let halfAcrossBridge = 1;
  for (const p of _bridgePoly) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    halfAlongBridge = Math.max(halfAlongBridge, Math.abs(dx * ubx + dy * uby));
    halfAcrossBridge = Math.max(halfAcrossBridge, Math.abs(dx * uax + dy * uay));
  }
  return { halfAlongBridge, halfAcrossBridge };
}

export function chooseCrossingModeByHeading(angle: number): CrossingMode {
  const hx = Math.cos(angle);
  const hy = Math.sin(angle);
  const alignBridge = Math.abs((hx + hy) * Math.SQRT1_2);
  const alignUnderpass = Math.abs((hx - hy) * Math.SQRT1_2);
  return alignBridge >= alignUnderpass ? "bridge" : "underpass";
}

export function isInsideCrossing(x: number, y: number): boolean {
  return _bridgePoly.length >= 3 && pointInPoly(x, y, _bridgePoly);
}

/**
 * Constrain movement inside the crossing to a lane with two open ends.
 * Bridge lane uses UL<->LR as entry/exit; underpass uses UR<->LL.
 */
export function constrainToCrossingLane(
  x: number,
  y: number,
  mode: CrossingMode
): { x: number; y: number; hitSideWall: boolean } {
  if (_bridgePoly.length < 3) return { x, y, hitSideWall: false };
  if (!isInsideCrossing(x, y)) return { x, y, hitSideWall: false };
  const c = crossingCenter();
  const { halfAlongBridge, halfAcrossBridge } = crossingHalfSpans();
  const ubx = Math.SQRT1_2;
  const uby = Math.SQRT1_2;
  const uax = Math.SQRT1_2;
  const uay = -Math.SQRT1_2;
  const dx = x - c.x;
  const dy = y - c.y;

  const alongBridge = dx * ubx + dy * uby;
  const acrossBridge = dx * uax + dy * uay;
  const laneHalf = Math.min(halfAlongBridge, halfAcrossBridge) * 0.48;

  let nx = x;
  let ny = y;
  let hitSideWall = false;

  if (mode === "bridge") {
    const clampedAcross = Math.max(-laneHalf, Math.min(laneHalf, acrossBridge));
    hitSideWall = Math.abs(clampedAcross - acrossBridge) > 1e-6;
    nx = c.x + alongBridge * ubx + clampedAcross * uax;
    ny = c.y + alongBridge * uby + clampedAcross * uay;
  } else {
    const alongUnder = acrossBridge;
    const acrossUnder = alongBridge;
    const clampedAcross = Math.max(-laneHalf, Math.min(laneHalf, acrossUnder));
    hitSideWall = Math.abs(clampedAcross - acrossUnder) > 1e-6;
    nx = c.x + clampedAcross * ubx + alongUnder * uax;
    ny = c.y + clampedAcross * uby + alongUnder * uay;
  }

  // Keep result inside crossing polygon after projection.
  if (!isInsideCrossing(nx, ny)) {
    const cpt = closestPointOnPolygonBoundary(_bridgePoly, nx, ny);
    nx = cpt.x;
    ny = cpt.y;
    hitSideWall = true;
  }

  return { x: nx, y: ny, hitSideWall };
}

export function getTrackConstants(): typeof TRACK {
  return TRACK;
}

/** Ray-cast point-in-polygon */
export function pointInPoly(x: number, y: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const inter = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (inter) inside = !inside;
  }
  return inside;
}

function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): Vec2 {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * apy) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * abx, y: ay + t * aby };
}

export function closestPointOnPolygonBoundary(poly: Vec2[], x: number, y: number): Vec2 {
  const n = poly.length;
  let best = { x: poly[0].x, y: poly[0].y };
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const c = closestOnSegment(x, y, a.x, a.y, b.x, b.y);
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Nearest point on polygon boundary from outside (project onto boundary) */
function projectOntoOuterBoundary(x: number, y: number): Vec2 {
  const c = closestPointOnPolygonBoundary(_outerWall, x, y);
  const toInX = _interiorProbe.x - c.x;
  const toInY = _interiorProbe.y - c.y;
  const len = Math.hypot(toInX, toInY) || 1;
  const inset = 0.8;
  return { x: c.x + (toInX / len) * inset, y: c.y + (toInY / len) * inset };
}

function projectOutOfIsland(island: Vec2[], x: number, y: number): Vec2 {
  const c = closestPointOnPolygonBoundary(island, x, y);
  const icx = island.reduce((s, p) => s + p.x, 0) / island.length;
  const icy = island.reduce((s, p) => s + p.y, 0) / island.length;
  const awayX = c.x - icx;
  const awayY = c.y - icy;
  const len = Math.hypot(awayX, awayY) || 1;
  const inset = 0.8;
  return { x: c.x + (awayX / len) * inset, y: c.y + (awayY / len) * inset };
}

export function clampToRing(x: number, y: number): Vec2 {
  let px = x;
  let py = y;
  for (let k = 0; k < 4; k++) {
    if (!pointInPoly(px, py, _outerWall)) {
      const c = projectOntoOuterBoundary(px, py);
      px = c.x;
      py = c.y;
    }
    for (const isl of _innerIslands) {
      if (pointInPoly(px, py, isl)) {
        const q = projectOutOfIsland(isl, px, py);
        px = q.x;
        py = q.y;
      }
    }
  }
  if (!pointInPoly(px, py, _outerWall)) {
    const c = projectOntoOuterBoundary(px, py);
    px = c.x;
    py = c.y;
  }
  for (const isl of _innerIslands) {
    if (pointInPoly(px, py, isl)) {
      const q = projectOutOfIsland(isl, px, py);
      px = q.x;
      py = q.y;
    }
  }
  return { x: px, y: py };
}

export function wallViolated(x: number, y: number): WallKind | null {
  if (!pointInPoly(x, y, _outerWall)) return "outer";
  for (let i = 0; i < _innerIslands.length; i++) {
    if (pointInPoly(x, y, _innerIslands[i])) return `inner${i}`;
  }
  return null;
}

/** Inward normal into drivable at (x,y) on boundary of given wall */
export function normalIntoTrack(
  x: number,
  y: number,
  wall: WallKind
): Vec2 {
  const poly =
    wall === "outer"
      ? _outerWall
      : _innerIslands[Math.max(0, Number.parseInt(wall.slice(5), 10) || 0)];
  let bestI = 0;
  let bestD = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const c = closestOnSegment(x, y, a.x, a.y, b.x, b.y);
    const d = Math.hypot(x - c.x, y - c.y);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  const a = poly[bestI];
  const b = poly[(bestI + 1) % n];
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const el = Math.hypot(ex, ey) || 1;
  const tx = ex / el;
  const ty = ey / el;
  let nx = -ty;
  let ny = tx;
  const midx = (a.x + b.x) / 2;
  const midy = (a.y + b.y) / 2;
  if (wall === "outer") {
    const toInX = _interiorProbe.x - midx;
    const toInY = _interiorProbe.y - midy;
    if (nx * toInX + ny * toInY < 0) {
      nx = -nx;
      ny = -ny;
    }
  } else {
    const icx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const icy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    const awayX = midx - icx;
    const awayY = midy - icy;
    if (nx * awayX + ny * awayY < 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  const len = Math.hypot(nx, ny) || 1;
  return { x: nx / len, y: ny / len };
}

export function wallScrapeAndImpact(
  vx: number,
  vy: number,
  x: number,
  y: number,
  wall: WallKind
): { scrape01: number; impact01: number } {
  const n = normalIntoTrack(x, y, wall);
  const speed = Math.hypot(vx, vy);
  if (speed < 1e-6) return { scrape01: 0, impact01: 1 };
  const vt = Math.abs(vx * n.y - vy * n.x);
  const scrape01 = Math.min(1, vt / speed);
  const impact01 = Math.min(1, Math.max(0, 1 - scrape01));
  return { scrape01, impact01 };
}

function segIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-10) return false;
  const t =
    ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u =
    ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

export function finishLineSegment(): { a: Vec2; b: Vec2 } {
  return { a: { ..._finishA }, b: { ..._finishB } };
}

/**
 * Lap when crossing finish segment in forward direction (along centerline tangent).
 */
export function checkLapCross(prev: Vec2, curr: Vec2, vx: number, vy: number): boolean {
  const { a, b } = finishLineSegment();
  if (!segIntersect(prev, curr, a, b)) return false;
  const tx = _finishTan.x;
  const ty = _finishTan.y;
  const dot = vx * tx + vy * ty;
  return dot > 40;
}

export function spawnPosition(index: number): { x: number; y: number; angle: number } {
  const row = Math.floor(index / 4);
  const col = index % 4;
  const x = SPAWN_X - row * SPAWN_GAP;
  const y = SPAWN_Y + (col - 1.5) * 12;
  const angle = SPAWN_ANGLE;
  return { x, y, angle };
}
