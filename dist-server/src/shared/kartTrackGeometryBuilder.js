/**
 * Kart track geometry traced from the provided reference image.
 * Runtime loads the emitted JSON from this file via `npm run gen:kart-geometry`.
 */
const OUTER_WALL = [
    { x: 912, y: 252 }, { x: 886, y: 206 }, { x: 852, y: 184 }, { x: 816, y: 176 },
    { x: 780, y: 180 }, { x: 744, y: 194 }, { x: 713, y: 207 }, { x: 646, y: 377 },
    { x: 417, y: 388 }, { x: 343, y: 350 }, { x: 362, y: 289 }, { x: 582, y: 336 },
    { x: 637, y: 314 }, { x: 702, y: 108 }, { x: 609, y: 48 }, { x: 629, y: 13 },
    { x: 592, y: 14 }, { x: 599, y: 48 }, { x: 499, y: 42 }, { x: 413, y: 108 },
    { x: 117, y: 108 }, { x: 41, y: 169 }, { x: 34, y: 457 }, { x: 58, y: 536 },
    { x: 109, y: 572 }, { x: 286, y: 515 }, { x: 372, y: 621 }, { x: 485, y: 645 },
    { x: 607, y: 558 }, { x: 748, y: 520 }, { x: 780, y: 524 }, { x: 814, y: 510 },
    { x: 846, y: 482 }, { x: 872, y: 440 }, { x: 892, y: 380 }, { x: 904, y: 312 },
];
const INNER_ISLAND = [
    { x: 867, y: 266 }, { x: 804, y: 431 }, { x: 741, y: 459 }, { x: 743, y: 420 },
    { x: 725, y: 463 }, { x: 576, y: 500 }, { x: 483, y: 566 }, { x: 412, y: 553 },
    { x: 369, y: 481 }, { x: 322, y: 451 }, { x: 265, y: 440 }, { x: 153, y: 496 },
    { x: 116, y: 473 }, { x: 114, y: 208 }, { x: 138, y: 179 }, { x: 408, y: 182 },
    { x: 530, y: 114 }, { x: 617, y: 122 }, { x: 584, y: 256 }, { x: 518, y: 256 },
    { x: 396, y: 214 }, { x: 320, y: 234 }, { x: 276, y: 278 }, { x: 260, y: 349 },
    { x: 282, y: 395 }, { x: 350, y: 441 }, { x: 457, y: 467 }, { x: 657, y: 457 },
    { x: 727, y: 401 }, { x: 780, y: 248 }, { x: 823, y: 233 },
];
function chaikinClosed(points, iterations) {
    let poly = points.slice();
    for (let it = 0; it < iterations; it++) {
        const next = [];
        const n = poly.length;
        for (let i = 0; i < n; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % n];
            next.push({
                x: a.x * 0.75 + b.x * 0.25,
                y: a.y * 0.75 + b.y * 0.25,
            });
            next.push({
                x: a.x * 0.25 + b.x * 0.75,
                y: a.y * 0.25 + b.y * 0.75,
            });
        }
        poly = next;
    }
    return poly;
}
function softenClosed(points, passes) {
    let poly = points.slice();
    for (let p = 0; p < passes; p++) {
        const next = [];
        const n = poly.length;
        for (let i = 0; i < n; i++) {
            const a = poly[(i - 1 + n) % n];
            const b = poly[i];
            const c = poly[(i + 1) % n];
            next.push({
                x: a.x * 0.2 + b.x * 0.6 + c.x * 0.2,
                y: a.y * 0.2 + b.y * 0.6 + c.y * 0.2,
            });
        }
        poly = next;
    }
    return poly;
}
export function buildProceduralKartTrackGeometry() {
    const outerWall = softenClosed(chaikinClosed(OUTER_WALL, 3), 1);
    const innerIslands = [softenClosed(chaikinClosed(INNER_ISLAND, 3), 1)];
    const bridgePolygon = [];
    const underpassPolygon = [];
    const interiorProbe = { x: 220, y: 150 };
    return {
        outerWall,
        innerIslands,
        bridgePolygon,
        underpassPolygon,
        interiorProbe,
    };
}
