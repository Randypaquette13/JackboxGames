# Kart track walls (revised): Option B + bridge / underpass behavior

## Status (implemented)

- [`src/shared/kartTrackGeometry.json`](../../src/shared/kartTrackGeometry.json) is the runtime source of truth for `outerWall`, `innerIslands`, `bridgePolygon`, `underpassPolygon`, and `interiorProbe`.
- [`src/shared/kartTrack.ts`](../../src/shared/kartTrack.ts) loads it via `readFileSync` next to the module (works in dev + `npm start` after copy step).
- Regenerate JSON from procedural defaults: `npm run gen:kart-geometry` (uses [`src/shared/kartTrackGeometryBuilder.ts`](../../src/shared/kartTrackGeometryBuilder.ts)).
- `npm run build` copies the JSON into `dist-server/src/shared/` for production.

## Decision

- **Use Option B**: load authoritative wall geometry from a JSON file (e.g. `src/shared/kartTrackGeometry.json`), imported by [`src/shared/kartTrack.ts`](../../src/shared/kartTrack.ts) in `buildTrack()`.
- **Bridge / underpass requirements** (2D game; “height” is presentation + rules, not full 3D):

### Does Option B allow the bridge / underpass behavior you want?

**Yes.** JSON defines **where boundaries are**; the engine already uses those boundaries for `clampToRing`, `wallViolated`, and rendering. There is no fundamental limitation of Option B vs Option A for this.

What you described maps to:

1. **Bridge — cannot fall off left or right**  
   In top-down 2D this means: the **drivable region** on the bridge deck is **bounded on both sides** by collision (outer fence and/or inner edges), so the car cannot leave the deck sideways.  
   - **Geometry**: Author the **outer** wall (and any holes) so that along the bridge strip the **corridor width** matches the deck and the fence runs parallel to the road—no wide “shoulder” past the bridge edges.  
   - Option B makes that explicit: you place vertices so the polyline **pinches** to the bridge width at the crossing.

2. **Underpass — tunnel with walls on either side**  
   - **Collision**: Same idea—**narrow** drivable channel under the crossing so the car is always between **left and right** boundaries (again: same outer polygon / holes, authored so the underpass path is a slot).  
   - **Look**: Draw tunnel walls (sprites, thick strokes, or extra decorative polylines) in [`src/host/renderKart.ts`](../../src/host/renderKart.ts); those can be **listed in JSON** as optional `decorations` or derived from the same crossing constants as the collision mesh.

If one **single** simple `outerWall` polygon cannot represent both the bridge deck and underpass slot without self-intersection, the plan allows:

- **Optional schema extension** in the same JSON file, e.g.:
  - `outerWall` — main track perimeter (simple polygon)
  - `innerIslands` — grass holes (array of polygons)
  - `barrierSegments` or `wallSegments` — **optional** short polylines or thin rectangles used **only** for extra collision (bridge rail / tunnel sides) if the main loop isn’t enough  
  The server would need a small extension to `clampToRing` / `wallViolated` to account for segment barriers (or merge them into the navigable region definition). **Prefer** folding side constraints into the main outer polygon first; add segments only if needed.

## Implementation outline (unchanged core + Option B + crossing)

| Area | Action |
|------|--------|
| JSON | `outerWall`, `innerIslands`; optional `bridgeOverlay`, `underpassOverlay`, `tunnelWallDecor` for render only |
| [`kartTrack.ts`](../../src/shared/kartTrack.ts) | `buildTrack()` loads JSON; sets `_outerWall`, `_innerIslands`; keeps lemniscate for spawn/finish/lap until migrated; `_interiorProbe` from loaded poly |
| Bridge/underpass quads | Align dimensions to **same** crossing width/length constants used when authoring JSON (or store those in JSON) |
| [`renderKart.ts`](../../src/host/renderKart.ts) | Underpass: draw tunnel sides (from JSON or shared constants); bridge: deck + railings visually |
| Physics | Ensure **narrow** corridors at crossing in JSON so “fall off” is impossible without extra systems |

## Validation

- Drive along bridge deck: lateral offset hits **outer** (or barrier) before leaving deck visually.
- Drive through underpass: bounded left/right; tunnel art matches collision bounds.
- `pointInPoly(interiorProbe)` and quick segment self-intersection check on `outerWall`.

## Todos

1. Add `kartTrackGeometry.json` schema and sample data aligned to bridge/underpass width.
2. Load in `buildTrack()`; remove or demote `buildOuterWallSimple` / lemniscate-only outer.
3. Align bridge/underpass render + optional tunnel wall art to JSON dimensions.
4. Playtest crossing; add `wallSegments` only if outer poly alone cannot enforce side bounds.
