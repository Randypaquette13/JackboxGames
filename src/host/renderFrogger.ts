import type { FroggerBandJson, HostStateJson } from "@shared/messages";
import { WORLD_H, WORLD_W } from "@shared/constants";
import { FROGGER_DISTANCE_UNIT, FROGGER_FROG_SIZE, FROGGER_KILL_MARGIN } from "@shared/froggerSettings";
import { fallbackPlayerHue } from "@shared/playerColors";
import {
  drawFroggerSprite,
  drawFroggerSpriteRotated,
  fillBandPattern,
  frogFacingRotation,
  getFroggerTextures,
  getTintedFrog,
  loadFroggerAssets,
} from "./froggerAssets";

let prevFgCountdown: number | null | undefined;
let goFlashUntil = 0;
let assetsLoadStarted = false;

type StreetBand = Extract<FroggerBandJson, { kind: "street" }>;
type RoadEdgeStyle = "solid" | "dashed" | "double-yellow";

/** Inset exterior edge lines into the road surface. */
const ROAD_EDGE_INSET = 3;
/** Classic double-yellow: two stripes straddling the shared lane boundary. */
const DOUBLE_YELLOW_STRIPE_H = 3;
const DOUBLE_YELLOW_GAP = 5;

function toCanvasY(scroll: number, worldY: number): number {
  return WORLD_H - (worldY - scroll);
}

function neighborAbove(bands: FroggerBandJson[], band: FroggerBandJson): FroggerBandJson | null {
  return bands.find((b) => b !== band && Math.abs(b.y0 - (band.y0 + band.h)) < 0.5) ?? null;
}

function neighborBelow(bands: FroggerBandJson[], band: FroggerBandJson): FroggerBandJson | null {
  return bands.find((b) => b !== band && Math.abs(band.y0 - (b.y0 + b.h)) < 0.5) ?? null;
}

function streetRuns(streets: StreetBand[]): StreetBand[][] {
  const sorted = [...streets].sort((a, b) => a.y0 - b.y0);
  const runs: StreetBand[][] = [];
  let current: StreetBand[] = [];
  for (const s of sorted) {
    if (current.length === 0 || current[current.length - 1]!.y0 + current[current.length - 1]!.h === s.y0) {
      current.push(s);
    } else {
      runs.push(current);
      current = [s];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function sharedRoadEdgeStyle(
  runs: StreetBand[][] ,
  lower: StreetBand,
  upper: StreetBand
): RoadEdgeStyle {
  const run = runs.find((r) => r.includes(lower) && r.includes(upper));
  if (run && run.length === 2 && run[0]!.dir !== run[1]!.dir) {
    return "double-yellow";
  }
  return "dashed";
}

function computeRoadBoundaryStyles(bands: FroggerBandJson[]): Map<number, RoadEdgeStyle> {
  const styles = new Map<number, RoadEdgeStyle>();
  const streets = bands.filter((b): b is StreetBand => b.kind === "street");
  const runs = streetRuns(streets);

  for (const s of streets) {
    const below = neighborBelow(bands, s);
    const bottomY = Math.round(s.y0);
    if (!below || below.kind !== "street") {
      styles.set(bottomY, "solid");
    } else {
      styles.set(bottomY, sharedRoadEdgeStyle(runs, below as StreetBand, s));
    }

    const above = neighborAbove(bands, s);
    const topY = Math.round(s.y0 + s.h);
    if (!above || above.kind !== "street") {
      styles.set(topY, "solid");
    } else {
      styles.set(topY, sharedRoadEdgeStyle(runs, s, above as StreetBand));
    }
  }

  return styles;
}

function drawRoadBoundary(
  ctx: CanvasRenderingContext2D,
  scroll: number,
  worldY: number,
  style: RoadEdgeStyle,
  placement: "double-yellow" | "exterior-bottom" | "exterior-top" | "shared"
): void {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  if (style === "double-yellow") {
    ctx.fillStyle = "#f0c020";
    const gapHalf = DOUBLE_YELLOW_GAP / 2;
    const stripes: [number, number][] = [
      [worldY - gapHalf - DOUBLE_YELLOW_STRIPE_H, worldY - gapHalf],
      [worldY + gapHalf, worldY + gapHalf + DOUBLE_YELLOW_STRIPE_H],
    ];
    for (const [yBot, yTop] of stripes) {
      const canvasTop = toCanvasY(scroll, yTop);
      const canvasBot = toCanvasY(scroll, yBot);
      const y = Math.min(canvasTop, canvasBot);
      const h = Math.abs(canvasBot - canvasTop);
      ctx.fillRect(0, y, WORLD_W, h);
    }
  } else {
    ctx.strokeStyle = style === "solid" ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.72)";
    ctx.setLineDash(style === "dashed" ? [10, 12] : []);
    let drawWorldY = worldY;
    if (placement === "exterior-bottom") {
      drawWorldY = worldY + ROAD_EDGE_INSET;
    } else if (placement === "exterior-top") {
      drawWorldY = worldY - ROAD_EDGE_INSET;
    }
    const y = toCanvasY(scroll, drawWorldY);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }
  ctx.restore();
}

function boundaryPlacement(
  band: StreetBand,
  worldY: number,
  style: RoadEdgeStyle,
  bands: FroggerBandJson[]
): "double-yellow" | "exterior-bottom" | "exterior-top" | "shared" {
  if (style === "double-yellow") return "double-yellow";
  const isBottom = Math.abs(worldY - band.y0) < 0.5;
  const isTop = Math.abs(worldY - (band.y0 + band.h)) < 0.5;
  if (isBottom) {
    const below = neighborBelow(bands, band);
    if (!below || below.kind !== "street") return "exterior-bottom";
  }
  if (isTop) {
    const above = neighborAbove(bands, band);
    if (!above || above.kind !== "street") return "exterior-top";
  }
  return "shared";
}

export function drawFrogger(
  ctx: CanvasRenderingContext2D,
  state: HostStateJson,
  canvasW: number,
  canvasH: number,
  scale: number,
  ox: number,
  oy: number
): void {
  const fg = state.frogger;
  if (!fg) return;

  if (!assetsLoadStarted) {
    assetsLoadStarted = true;
    void loadFroggerAssets(ctx);
  }
  const tex = getFroggerTextures();

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#1a1c28";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const sc = fg.scroll;
  const sortedBands = [...fg.bands].sort((a, b) => a.y0 - b.y0);
  const riverFlow = performance.now() * 0.045;
  const roadBoundaryStyles = computeRoadBoundaryStyles(sortedBands);
  const drawnBoundaries = new Set<string>();

  for (const band of sortedBands) {
    const yTop = toCanvasY(sc, band.y0 + band.h);
    const yBot = toCanvasY(sc, band.y0);
    const top = Math.min(yTop, yBot);
    const bh = Math.abs(yBot - yTop);

    if (band.kind === "grass") {
      if (tex.grass) {
        fillBandPattern(ctx, tex.grass, band.y0, top, WORLD_W, bh);
      } else {
        ctx.fillStyle = "#2d5a32";
        ctx.fillRect(0, top, WORLD_W, bh);
      }
      for (const o of band.obstacles) {
        const ot = toCanvasY(sc, o.y + o.h);
        const ob = toCanvasY(sc, o.y);
        const otop = Math.min(ot, ob);
        const oh = Math.abs(ob - ot);
        if (tex.bush) {
          drawFroggerSprite(ctx, tex.bush, o.x, otop, o.w, oh);
        } else {
          ctx.fillStyle = "#1e3d22";
          ctx.fillRect(o.x, otop, o.w, oh);
        }
      }
    } else if (band.kind === "street") {
      if (tex.road) {
        fillBandPattern(ctx, tex.road, band.y0, top, WORLD_W, bh);
      } else {
        ctx.fillStyle = "#3a3a44";
        ctx.fillRect(0, top, WORLD_W, bh);
      }
      for (const c of band.cars) {
        const ct = toCanvasY(sc, c.y + c.h);
        const cb = toCanvasY(sc, c.y);
        const ctop = Math.min(ct, cb);
        const ch = Math.abs(cb - ct);
        const carImg = c.fast ? tex.carFast : tex.carNormal;
        if (carImg) {
          drawFroggerSprite(ctx, carImg, c.x, ctop, c.w, ch, band.dir < 0);
        } else {
          ctx.fillStyle = c.fast ? "#ff6b4a" : "#c8ccd8";
          ctx.fillRect(c.x, ctop, c.w, ch);
          ctx.strokeStyle = "#1a1a22";
          ctx.lineWidth = 1;
          ctx.strokeRect(c.x, ctop, c.w, ch);
        }
      }
    } else {
      if (tex.water) {
        fillBandPattern(ctx, tex.water, band.y0, top, WORLD_W, bh, band.dir * riverFlow, 0);
      } else {
        ctx.fillStyle = "#1e4a6e";
        ctx.fillRect(0, top, WORLD_W, bh);
        ctx.strokeStyle = "rgba(120,200,255,0.12)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
          const yy = top + (i / 8) * bh;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(WORLD_W, yy);
          ctx.stroke();
        }
      }
      for (const p of band.platforms) {
        const pt = toCanvasY(sc, p.y + p.h);
        const pb = toCanvasY(sc, p.y);
        const ptop = Math.min(pt, pb);
        const ph = Math.abs(pb - pt);
        const platImg = p.kind === "log" ? tex.log : tex.lilyPad;
        if (platImg) {
          drawFroggerSprite(ctx, platImg, p.x, ptop, p.w, ph);
        } else {
          ctx.fillStyle = p.kind === "log" ? "#6b4a2a" : "#4a8c4e";
          ctx.beginPath();
          ctx.roundRect(p.x, ptop, p.w, ph, p.kind === "log" ? 4 : 10);
          ctx.fill();
          ctx.strokeStyle = "#0d1820";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  for (const band of sortedBands) {
    if (band.kind !== "street") continue;
    for (const worldY of [Math.round(band.y0), Math.round(band.y0 + band.h)]) {
      const style = roadBoundaryStyles.get(worldY);
      if (!style) continue;
      const placement = boundaryPlacement(band, worldY, style, sortedBands);
      const key =
        style === "double-yellow" ? `dy:${worldY}` : `${worldY}:${placement}`;
      if (drawnBoundaries.has(key)) continue;
      drawRoadBoundary(ctx, sc, worldY, style, placement);
      drawnBoundaries.add(key);
    }
  }

  const killY = sc + FROGGER_KILL_MARGIN;
  const ky = toCanvasY(sc, killY);
  ctx.fillStyle = "rgba(255,50,50,0.14)";
  ctx.fillRect(0, ky, WORLD_W, WORLD_H - ky);
  ctx.strokeStyle = "rgba(255,100,100,0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(0, ky);
  ctx.lineTo(WORLD_W, ky);
  ctx.stroke();
  ctx.setLineDash([]);

  const s = FROGGER_FROG_SIZE;
  for (const fr of fg.frogs) {
    if (!fr.alive) continue;
    const ft = fr.y + s / 2;
    const fb = fr.y - s / 2;
    const sy = toCanvasY(sc, ft);
    const sh = toCanvasY(sc, fb) - sy;
    const hue = fr.hue ?? fallbackPlayerHue(fr.playerId);
    const rx = fr.x - s / 2;
    const ry = sy;

    if (tex.frog) {
      const frogImg = getTintedFrog(hue);
      if (frogImg) {
        drawFroggerSpriteRotated(
          ctx,
          frogImg,
          rx,
          ry,
          s,
          sh,
          frogFacingRotation(fr.facing ?? "up")
        );
      }
    } else {
      ctx.fillStyle = `hsl(${hue} 72% 52%)`;
      ctx.strokeStyle = "#0a0a12";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const rr = Math.min(8, s * 0.25);
      ctx.roundRect(rx, ry, s, sh, rr);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#0a0a12";
    ctx.font = "bold 12px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fr.name, fr.x, ry + sh / 2);
  }

  ctx.fillStyle = "#aab0c8";
  ctx.font = "13px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Scroll ${fg.scrollSpeed.toFixed(0)} px/s · dist 1 unit = ${FROGGER_DISTANCE_UNIT}px`, 10, 8);

  ctx.restore();

  if (state.phase === "frogger_paused") {
    ctx.save();
    ctx.filter = "blur(2.5px)";
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
    ctx.fillStyle = "rgba(8, 10, 14, 0.34)";
    ctx.fillRect(0, 0, canvasW, canvasH);
    const pausedBy = fg.pausedByPlayerId;
    const nameById = new Map<number, string>();
    for (const p of state.lobbyPlayers ?? []) {
      const label = p.name?.trim() ? p.name.trim() : `P${p.playerId}`;
      nameById.set(p.playerId, label);
    }
    const byText =
      pausedBy !== null ? `${nameById.get(pausedBy) ?? `P${pausedBy}`} paused the game` : "Paused";
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const boxW = Math.min(560, canvasW * 0.72);
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

  const cd = fg.countdown;
  if (cd !== null && cd > 0) {
    goFlashUntil = 0;
  } else if (prevFgCountdown !== undefined && prevFgCountdown > 0 && cd === null) {
    goFlashUntil = performance.now() + 900;
  }
  prevFgCountdown = cd;

  const showGo = performance.now() < goFlashUntil;
  const countNum = cd !== null && cd > 0 ? Math.ceil(cd) : 0;
  const showBig = (countNum >= 1 && countNum <= 5) || showGo;
  if (showBig && (state.phase === "frogger" || state.phase === "frogger_paused")) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const fontPx = Math.min(168, Math.min(canvasW, canvasH) * 0.26);
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

  if (fg.banners.length > 0) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let y = 56;
    ctx.font = "bold 20px system-ui,sans-serif";
    for (const b of fg.banners) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(canvasW / 2 - 280, y - 6, 560, 34);
      ctx.fillStyle = "#f4e6a8";
      ctx.fillText(b.text, canvasW / 2, y);
      y += 40;
    }
    ctx.restore();
  }

  if (state.phase === "frogger_results") {
    ctx.save();
    ctx.fillStyle = "rgba(10, 12, 20, 0.72)";
    ctx.fillRect(0, 0, canvasW, canvasH * 0.42);
    ctx.fillStyle = "#e8e8f0";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const cx = canvasW / 2;
    let y = 36;
    const wid = fg.winnerId;
    ctx.font = "bold 28px system-ui,sans-serif";
    const wname = wid !== null ? fg.frogs.find((f) => f.playerId === wid)?.name ?? `P${wid}` : null;
    ctx.fillText(wid !== null ? `${wname} wins!` : "Round over", cx, y);
    y += 36;
    ctx.font = "15px system-ui,sans-serif";
    ctx.fillStyle = "#98a2c0";
    ctx.fillText("Winner is whoever reached the farthest row", cx, y);
    y += 34;
    ctx.font = "18px system-ui,sans-serif";
    ctx.fillStyle = "#c8d0e8";
    const sorted = [...fg.frogs].sort((a, b) => b.distance - a.distance || a.playerId - b.playerId);
    for (const f of sorted) {
      ctx.fillText(`${f.name}: ${f.distance} m`, cx, y);
      y += 26;
    }
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "#e8e8f0";
  ctx.font = "14px system-ui,sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Series wins: " + JSON.stringify(fg.seriesWins), 16, canvasH - 16);
  ctx.restore();
}
