/**
 * Regenerates src/shared/kartTrackGeometry.json from procedural builder.
 * Run: npx tsx scripts/generate-kart-geometry.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildProceduralKartTrackGeometry } from "../src/shared/kartTrackGeometryBuilder.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src/shared/kartTrackGeometry.json");
const data = buildProceduralKartTrackGeometry();
writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Wrote", out);
