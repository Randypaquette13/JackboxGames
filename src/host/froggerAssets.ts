import { FROGGER_TILE } from "@shared/froggerSettings";
import grassTileUrl from "../assets/frogger/grass-tile.png?url";
import roadTileUrl from "../assets/frogger/road-tile.png?url";
import waterTileUrl from "../assets/frogger/water-tile.png?url";
import bushUrl from "../assets/frogger/bush.png?url";
import lilyPadUrl from "../assets/frogger/lily-pad.png?url";
import logUrl from "../assets/frogger/log.png?url";
import carNormalUrl from "../assets/frogger/car-normal.png?url";
import carFastUrl from "../assets/frogger/car-fast.png?url";
import frogUrl from "../assets/frogger/frog.png?url";

const TILE_PX = FROGGER_TILE;
const SPRITE_MAX_PX = 128;

type SpriteSource = HTMLCanvasElement;

type TileTexture = {
  pattern: CanvasPattern;
  scale: number;
};

export type FroggerTextures = {
  grass: TileTexture | null;
  road: TileTexture | null;
  water: TileTexture | null;
  bush: SpriteSource | null;
  lilyPad: SpriteSource | null;
  log: SpriteSource | null;
  carNormal: SpriteSource | null;
  carFast: SpriteSource | null;
  frog: SpriteSource | null;
  ready: boolean;
};

const emptyTextures: FroggerTextures = {
  grass: null,
  road: null,
  water: null,
  bush: null,
  lilyPad: null,
  log: null,
  carNormal: null,
  carFast: null,
  frog: null,
  ready: false,
};

let textures: FroggerTextures = emptyTextures;
let loadPromise: Promise<void> | null = null;
const frogTintCache = new Map<number, HTMLCanvasElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function isNeutralBackground(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const lum = (r + g + b) / 3;
  return spread <= 22 && lum >= 145;
}

function keySpriteBackground(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const w = img instanceof HTMLCanvasElement ? img.width : img.naturalWidth;
  const h = img instanceof HTMLCanvasElement ? img.height : img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  const trySeed = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (!isNeutralBackground(px[i]!, px[i + 1]!, px[i + 2]!)) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++]!;
    const i = idx * 4;
    px[i + 3] = 0;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) trySeed(x - 1, y);
    if (x < w - 1) trySeed(x + 1, y);
    if (y > 0) trySeed(x, y - 1);
    if (y < h - 1) trySeed(x, y + 1);
  }

  ctx.putImageData(data, 0, 0);
  return canvas;
}

function trimTransparent(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = src;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return src;
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const octx = out.getContext("2d")!;
  octx.drawImage(src, minX, minY, tw, th, 0, 0, tw, th);
  return out;
}

function downscaleToMax(src: HTMLCanvasElement, maxPx: number): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const scale = Math.min(1, maxPx / w, maxPx / h);
  if (scale >= 0.999) return src;
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));
  const out = document.createElement("canvas");
  out.width = nw;
  out.height = nh;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(src, 0, 0, nw, nh);
  return out;
}

function processSprite(img: HTMLImageElement): HTMLCanvasElement {
  return downscaleToMax(trimTransparent(keySpriteBackground(img)), SPRITE_MAX_PX);
}

function processTile(img: HTMLImageElement, size = TILE_PX): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  return out;
}

function flipCanvasVertically(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.translate(0, out.height);
  ctx.scale(1, -1);
  ctx.drawImage(src, 0, 0);
  return out;
}

function makeTileTexture(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement): TileTexture | null {
  const pattern = ctx.createPattern(src, "repeat");
  if (!pattern) return null;
  return { pattern, scale: FROGGER_TILE / src.width };
}

export function getFroggerTextures(): FroggerTextures {
  return textures;
}

export function getTintedFrog(hue: number): SpriteSource | null {
  const base = textures.frog;
  if (!base) return null;
  const key = Math.round(hue);
  let tinted = frogTintCache.get(key);
  if (!tinted) {
    const c = document.createElement("canvas");
    c.width = base.width;
    c.height = base.height;
    const tctx = c.getContext("2d")!;
    tctx.filter = `hue-rotate(${key - 120}deg) saturate(1.15)`;
    tctx.drawImage(base, 0, 0);
    tinted = c;
    frogTintCache.set(key, tinted);
  }
  return tinted;
}

export function loadFroggerAssets(ctx: CanvasRenderingContext2D): Promise<void> {
  if (textures.ready) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [grassTile, roadTile, waterTile, bush, lilyPad, log, carNormal, carFast, frog] =
      await Promise.all([
        loadImage(grassTileUrl),
        loadImage(roadTileUrl),
        loadImage(waterTileUrl),
        loadImage(bushUrl),
        loadImage(lilyPadUrl),
        loadImage(logUrl),
        loadImage(carNormalUrl),
        loadImage(carFastUrl),
        loadImage(frogUrl),
      ]);

    const grassCanvas = processTile(grassTile);
    const roadCanvas = processTile(roadTile);
    const waterCanvas = processTile(waterTile);

    textures = {
      grass: makeTileTexture(ctx, grassCanvas),
      road: makeTileTexture(ctx, roadCanvas),
      water: makeTileTexture(ctx, waterCanvas),
      bush: processSprite(bush),
      lilyPad: processSprite(lilyPad),
      log: processSprite(log),
      carNormal: processSprite(carNormal),
      carFast: processSprite(carFast),
      frog: flipCanvasVertically(processSprite(frog)),
      ready: true,
    };
  })().catch((err) => {
    loadPromise = null;
    console.warn("[frogger] texture load failed", err);
  });

  return loadPromise;
}

/** World-locked repeating fill for scrolling bands. */
export function fillBandPattern(
  ctx: CanvasRenderingContext2D,
  tile: TileTexture,
  worldY0: number,
  canvasTop: number,
  width: number,
  height: number,
  extraOffsetX = 0,
  extraOffsetY = 0
): void {
  const phaseY = (worldY0 + extraOffsetY) % FROGGER_TILE;
  ctx.save();
  ctx.translate(0, canvasTop);
  tile.pattern.setTransform(
    new DOMMatrix().scale(tile.scale).translate(extraOffsetX / tile.scale, -phaseY / tile.scale)
  );
  ctx.fillStyle = tile.pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function drawFroggerSprite(
  ctx: CanvasRenderingContext2D,
  img: SpriteSource,
  x: number,
  y: number,
  w: number,
  h: number,
  flipX = false
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  if (flipX) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
}

export function frogFacingRotation(facing: FroggerFacing): number {
  switch (facing) {
    case "up":
      return 0;
    case "right":
      return Math.PI / 2;
    case "down":
      return Math.PI;
    case "left":
      return -Math.PI / 2;
  }
}

export function drawFroggerSpriteRotated(
  ctx: CanvasRenderingContext2D,
  img: SpriteSource,
  x: number,
  y: number,
  w: number,
  h: number,
  rotationRad: number
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotationRad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
