import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src/shared/kartTrackGeometry.json");
const destDir = join(root, "dist-server/src/shared");
const dest = join(destDir, "kartTrackGeometry.json");
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("Copied kartTrackGeometry.json to dist-server");
