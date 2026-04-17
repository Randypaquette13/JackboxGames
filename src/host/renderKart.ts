import type { HostStateJson } from "@shared/messages";

const CAR_R = 12;

/** Detect end of server countdown to show client-side "GO!" */
let prevKartCountdown: number | null | undefined;
let goFlashUntil = 0;
const underpassLatchByPlayer = new Map<number, boolean>();
const inCrossingByPlayer = new Map<number, boolean>();

function addClosedPoly(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[]
): void {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
}

function pointInPoly(x: number, y: number, poly: { x: number; y: number }[]): boolean {
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

/** Center of the crossing (average of bridge quad vertices). */
function crossingCenter(bridge: { x: number; y: number }[]): { cx: number; cy: number } {
  let sx = 0;
  let sy = 0;
  for (const p of bridge) {
    sx += p.x;
    sy += p.y;
  }
  const n = bridge.length || 1;
  return { cx: sx / n, cy: sy / n };
}

/**
 * Bridge vs underpass: same quad, but the two diagonals through the center (UL–LR vs UR–LL,
 * screen coords). Closer to the UR–LL diagonal = under the bridge deck.
 */
function isUnderpassSide(x: number, y: number, cx: number, cy: number): boolean {
  const dUlLr = Math.abs(x - y - (cx - cy));
  const dUrLl = Math.abs(x + y - (cx + cy));
  return dUrLl < dUlLr - 1e-4;
}

/**
 * Stable crossing-side classification.
 * Near the center where both diagonal-distance tests are almost equal, use heading
 * alignment as a tie-breaker to prevent bridge/underpass flicker.
 */
function isUnderpassSideStable(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angle: number
): boolean {
  const dUlLr = Math.abs(x - y - (cx - cy));
  const dUrLl = Math.abs(x + y - (cx + cy));
  const diff = dUrLl - dUlLr;
  if (Math.abs(diff) > 2.0) return diff < 0;

  const hx = Math.cos(angle);
  const hy = Math.sin(angle);
  const invSqrt2 = Math.SQRT1_2;
  const alignBridge = Math.abs((hx + hy) * invSqrt2); // UL <-> LR travel
  const alignUnderpass = Math.abs((hx - hy) * invSqrt2); // UR <-> LL travel
  return alignUnderpass > alignBridge;
}

/** Under the bridge deck: inside crossing quad and on the UR–LL diagonal half. */
function isInUnderpassTunnel(
  playerId: number,
  x: number,
  y: number,
  angle: number,
  bridgePolygon: { x: number; y: number }[]
): boolean {
  if (bridgePolygon.length < 3) return false;
  const inside = pointInPoly(x, y, bridgePolygon);
  const wasInside = inCrossingByPlayer.get(playerId) ?? false;
  inCrossingByPlayer.set(playerId, inside);
  if (!inside) {
    underpassLatchByPlayer.delete(playerId);
    return false;
  }
  const latched = underpassLatchByPlayer.get(playerId);
  if (latched !== undefined && wasInside) return latched;

  // On entry (or first observed frame inside), classify by heading and lock until exit.
  const hx = Math.cos(angle);
  const hy = Math.sin(angle);
  const invSqrt2 = Math.SQRT1_2;
  const alignBridge = Math.abs((hx + hy) * invSqrt2); // UL <-> LR
  const alignUnderpass = Math.abs((hx - hy) * invSqrt2); // UR <-> LL
  const entryClass = alignUnderpass >= alignBridge;
  underpassLatchByPlayer.set(playerId, entryClass);
  return entryClass;
}

function drawKartCar(
  ctx: CanvasRenderingContext2D,
  car: { playerId: number; x: number; y: number; angle: number },
  scale: number,
  inTunnel: boolean
): void {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const hue = (car.playerId * 47) % 360;
  if (inTunnel) {
    ctx.globalAlpha = 0.94;
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8 / scale;
    ctx.fillStyle = `hsl(${hue} 42% 36%)`;
    ctx.strokeStyle = "#15151c";
  } else {
    ctx.fillStyle = `hsl(${hue} 70% 52%)`;
    ctx.strokeStyle = "#2a2a38";
  }
  ctx.lineWidth = 2 / scale;
  ctx.fillRect(-CAR_R, -CAR_R * 0.6, CAR_R * 2, CAR_R * 1.2);
  ctx.strokeRect(-CAR_R, -CAR_R * 0.6, CAR_R * 2, CAR_R * 1.2);
  ctx.restore();
}

function drawBridgeDeck(
  ctx: CanvasRenderingContext2D,
  bridgePolygon: { x: number; y: number }[],
  scale: number
): void {
  if (bridgePolygon.length < 4) return;
  const bx = bridgePolygon.map((p) => p.x);
  const by = bridgePolygon.map((p) => p.y);
  const bminX = Math.min(...bx);
  const bmaxX = Math.max(...bx);
  const bminY = Math.min(...by);
  const bmaxY = Math.max(...by);
  const mx = (bminX + bmaxX) / 2;
  const my = (bminY + bmaxY) / 2;
  const rdx = bridgePolygon[1].x - bridgePolygon[0].x;
  const rdy = bridgePolygon[1].y - bridgePolygon[0].y;
  const rlen = Math.hypot(rdx, rdy) || 1;
  const ux = rdx / rlen;
  const uy = rdy / rlen;

  ctx.save();
  ctx.beginPath();
  addClosedPoly(ctx, bridgePolygon);
  const baseGrad = ctx.createLinearGradient(
    mx - ux * 80,
    my - uy * 80,
    mx + ux * 80,
    my + uy * 80
  );
  baseGrad.addColorStop(0, "#7a5a32");
  baseGrad.addColorStop(0.5, "#9a7344");
  baseGrad.addColorStop(1, "#6b4a28");
  ctx.fillStyle = baseGrad;
  ctx.fill();
  ctx.clip();
  const plankW = 11;
  const woods = ["#5c3d22", "#6e4a2a", "#5a3a1c", "#7a5230"];
  for (let s = -120; s < 120; s += plankW) {
    const px = mx + ux * s;
    const py = my + uy * s;
    ctx.strokeStyle = woods[((Math.floor(s / plankW) % 4) + 4) % 4];
    ctx.lineWidth = 5 / scale;
    ctx.beginPath();
    ctx.moveTo(px - uy * 120, py + ux * 120);
    ctx.lineTo(px + uy * 120, py - ux * 120);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    ctx.moveTo(px - uy * 120 + ux * 2, py + ux * 120 + uy * 2);
    ctx.lineTo(px + uy * 120 + ux * 2, py - ux * 120 + uy * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  addClosedPoly(ctx, bridgePolygon);
  ctx.strokeStyle = "#3d2a18";
  ctx.lineWidth = 3 / scale;
  ctx.stroke();
  ctx.beginPath();
  addClosedPoly(ctx, bridgePolygon);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
  ctx.restore();
}

function drawFinishLine(
  ctx: CanvasRenderingContext2D,
  finishA: { x: number; y: number },
  finishB: { x: number; y: number },
  scale: number
): void {
  const dx = finishB.x - finishA.x;
  const dy = finishB.y - finishA.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const nx = -ty;
  const ny = tx;
  const halfW = 8;
  const step = 7;
  const stripes = Math.max(2, Math.floor(len / step));
  for (let i = 0; i < stripes; i++) {
    const t0 = i / stripes;
    const t1 = (i + 1) / stripes;
    const ax = finishA.x + dx * t0;
    const ay = finishA.y + dy * t0;
    const bx = finishA.x + dx * t1;
    const by = finishA.y + dy * t1;
    ctx.beginPath();
    ctx.moveTo(ax + nx * halfW, ay + ny * halfW);
    ctx.lineTo(bx + nx * halfW, by + ny * halfW);
    ctx.lineTo(bx - nx * halfW, by - ny * halfW);
    ctx.lineTo(ax - nx * halfW, ay - ny * halfW);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "#f7f7f7" : "#15161a";
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(finishA.x + nx * halfW, finishA.y + ny * halfW);
  ctx.lineTo(finishB.x + nx * halfW, finishB.y + ny * halfW);
  ctx.moveTo(finishA.x - nx * halfW, finishA.y - ny * halfW);
  ctx.lineTo(finishB.x - nx * halfW, finishB.y - ny * halfW);
  ctx.strokeStyle = "rgba(20, 20, 22, 0.8)";
  ctx.lineWidth = 1.5 / scale;
  ctx.stroke();
}

export function drawKart(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  w: number,
  h: number
): void {
  const kart = state.kart;
  if (!kart) return;

  const { innerIslands, outerWall, bridgePolygon, underpassPolygon } = kart;
  if (outerWall.length < 3) return;

  const allPts = [
    ...outerWall,
    ...innerIslands.flat(),
    ...bridgePolygon,
    ...underpassPolygon,
  ];
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  const pad = 48;
  const gw = maxX - minX || 1;
  const gh = maxY - minY || 1;
  const scale = Math.min((w - pad * 2) / gw, (h - pad * 2) / gh);
  const ox = (w - gw * scale) / 2 - minX * scale;
  const oy = (h - gh * scale) / 2 - minY * scale;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  const grass = "#2d5a3a";
  const sand = "#d4b896";
  const fence = "#4a3a2a";

  ctx.fillStyle = grass;
  ctx.fillRect(minX - 80, minY - 80, maxX - minX + 160, maxY - minY + 160);

  ctx.beginPath();
  addClosedPoly(ctx, outerWall);
  for (const isl of innerIslands) {
    addClosedPoly(ctx, isl);
  }
  ctx.fillStyle = sand;
  ctx.fill("evenodd");
  drawFinishLine(ctx, kart.finishLine.a, kart.finishLine.b, scale);

  for (const isl of innerIslands) {
    ctx.beginPath();
    addClosedPoly(ctx, isl);
    ctx.fillStyle = "#3d7a45";
    ctx.fill();
    ctx.strokeStyle = "#5a4a3a";
    ctx.lineWidth = 3 / scale;
    ctx.stroke();
  }

  ctx.beginPath();
  addClosedPoly(ctx, outerWall);
  ctx.strokeStyle = fence;
  ctx.lineWidth = 5 / scale;
  ctx.lineJoin = "round";
  ctx.stroke();

  const underpassNow = new Set<number>();
  for (const car of kart.cars) {
    if (isInUnderpassTunnel(car.playerId, car.x, car.y, car.angle, bridgePolygon)) {
      underpassNow.add(car.playerId);
    }
  }

  for (const car of kart.cars) {
    if (underpassNow.has(car.playerId)) {
      drawKartCar(ctx, car, scale, true);
    }
  }

  drawBridgeDeck(ctx, bridgePolygon, scale);

  for (const car of kart.cars) {
    if (!underpassNow.has(car.playerId)) {
      drawKartCar(ctx, car, scale, false);
    }
  }

  ctx.restore();

  if (state.phase === "kart_paused") {
    // Fake backdrop blur by re-drawing the current frame through a blur filter.
    ctx.save();
    ctx.filter = "blur(2.5px)";
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
    ctx.fillStyle = "rgba(8, 10, 14, 0.34)";
    ctx.fillRect(0, 0, w, h);

    const pausedBy = kart.pausedByPlayerId;
    const byText = pausedBy !== null ? `Player ${pausedBy} paused the race` : "Race paused";
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = w / 2;
    const cy = h / 2;
    const boxW = Math.min(560, w * 0.72);
    const boxH = 146;
    ctx.fillStyle = "rgba(14, 16, 24, 0.82)";
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffde87";
    ctx.font = "bold 48px system-ui,sans-serif";
    ctx.fillText("PAUSED", cx, cy - 24);
    ctx.fillStyle = "#e8e8f0";
    ctx.font = "22px system-ui,sans-serif";
    ctx.fillText(byText, cx, cy + 20);
    ctx.font = "16px system-ui,sans-serif";
    ctx.fillStyle = "#b9c0d4";
    ctx.fillText("Press resume on controller to continue", cx, cy + 52);
    ctx.restore();
  }

  const cd = kart.countdown;
  if (cd !== null && cd > 0) {
    goFlashUntil = 0;
  } else if (prevKartCountdown !== undefined && prevKartCountdown > 0 && cd === null) {
    goFlashUntil = performance.now() + 900;
  }
  prevKartCountdown = cd;

  ctx.save();
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "bold 18px system-ui,sans-serif";
  let y = 28;
  if (state.phase === "kart_paused") {
    ctx.fillStyle = "#ffcc66";
    ctx.fillText("PAUSED", 16, y);
    y += 26;
  }
  ctx.fillStyle = "#e8e8f0";
  for (const car of kart.cars) {
    ctx.fillText(`P${car.playerId}: lap ${car.laps}/${3}`, 16, y);
    y += 22;
  }
  if (kart.winnerId !== null) {
    ctx.fillStyle = "#8f8";
    ctx.fillText(`Winner: Player ${kart.winnerId}`, 16, y);
  }
  ctx.fillStyle = "#aaa";
  ctx.font = "14px system-ui,sans-serif";
  y = h - 20;
  ctx.fillText("Series wins: " + JSON.stringify(kart.seriesWins), 16, y);

  const showGo = performance.now() < goFlashUntil;
  const countNum = cd !== null && cd > 0 ? Math.ceil(cd) : 0;
  const showBig = (countNum >= 1 && countNum <= 5) || showGo;
  if (showBig && (state.phase === "kart" || state.phase === "kart_paused")) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = w / 2;
    const cy = h / 2;
    const fontPx = Math.min(168, Math.min(w, h) * 0.26);
    const text = showGo ? "GO!" : String(countNum);
    ctx.font = `bold ${fontPx}px system-ui,sans-serif`;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillText(text, cx + 5, cy + 6);
    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = Math.max(6, fontPx * 0.06);
    ctx.fillStyle = "#f8f8ff";
    ctx.strokeText(text, cx, cy);
    ctx.fillText(text, cx, cy);
  }

  ctx.restore();
}
