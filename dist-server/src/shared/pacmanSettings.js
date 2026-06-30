import { TICK_RATE, WORLD_H, WORLD_W } from "./constants.js";
export const PACMAN_TILE = 24;
export const PACMAN_COLS = 31;
export const PACMAN_ROWS = 17;
export const PACMAN_GRID_W = PACMAN_COLS * PACMAN_TILE;
export const PACMAN_GRID_H = PACMAN_ROWS * PACMAN_TILE;
export const PACMAN_ORIGIN_X = (WORLD_W - PACMAN_GRID_W) * 0.5;
export const PACMAN_ORIGIN_Y = (WORLD_H - PACMAN_GRID_H) * 0.5;
export const PACMAN_COUNTDOWN_SEC = 3;
export const PACMAN_MOVE_COOLDOWN_SEC = 0.12;
export const PACMAN_GHOST_MOVE_COOLDOWN_SEC = 0.16;
export const PACMAN_RESPAWN_SEC = 3;
export const PACMAN_INVULN_SEC = 1.5;
export const PACMAN_FRIGHTENED_SEC = 6;
export const PACMAN_CHASE_SCATTER_SEC = 7;
export const PACMAN_PELLET_POINTS = 10;
export const PACMAN_POWER_PELLET_POINTS = 50;
export const PACMAN_GHOST_EAT_POINTS = 200;
/** Row index for horizontal wrap tunnel (full-width corridor). */
export const PACMAN_TUNNEL_ROW = 7;
export const PACMAN_DEATH_NOTICE_TICKS = Math.floor(TICK_RATE * 8);
export const PACMAN_DIR_DELTA = [
    { dc: 0, dr: -1 },
    { dc: 0, dr: 1 },
    { dc: -1, dr: 0 },
    { dc: 1, dr: 0 },
];
/** # wall · . pellet o power G house (walkable) space walkable */
const MAZE_TEMPLATE = [
    "###############################",
    "#..............#..............#",
    "#.###.#######.#.#.#######.###.#",
    "#o..#...#...#...#...#...#..o..#",
    "#.###.#.#.#.#.#.#.#.#.#.###.###",
    "#.....#....#...G...#....#.....#",
    "#.###.#.#################.###.#",
    "                               ",
    "#.###.#.#################.###.#",
    "#.....#...#.........#...#.....#",
    "#.###.#.#.#.#.#.#.#.#.###.###.#",
    "#o..#...#...#...#...#...#..o..#",
    "#.###.#######.#.#.#######.###.#",
    "#..............#..............#",
    "#.............................#",
    "#..............S..............#",
    "###############################",
];
function assertMazeDimensions() {
    if (MAZE_TEMPLATE.length !== PACMAN_ROWS) {
        throw new Error(`Pac-Man maze row count ${MAZE_TEMPLATE.length} !== ${PACMAN_ROWS}`);
    }
    for (let r = 0; r < MAZE_TEMPLATE.length; r++) {
        if (MAZE_TEMPLATE[r].length !== PACMAN_COLS) {
            throw new Error(`Pac-Man maze row ${r} width ${MAZE_TEMPLATE[r].length} !== ${PACMAN_COLS}`);
        }
    }
}
assertMazeDimensions();
export function buildPacmanMaze() {
    const walls = [];
    const pellets = [];
    const powerPellets = [];
    let ghostHouse = { col: 15, row: 5 };
    let playerSpawn = { col: 15, row: 15 };
    const ghostSpawns = [];
    let totalPellets = 0;
    for (let row = 0; row < PACMAN_ROWS; row++) {
        const wallLine = [];
        const pelletLine = [];
        for (let col = 0; col < PACMAN_COLS; col++) {
            const ch = MAZE_TEMPLATE[row][col];
            if (ch === "#") {
                wallLine.push(true);
                pelletLine.push(false);
            }
            else if (ch === "G") {
                wallLine.push(false);
                pelletLine.push(false);
                if (ghostSpawns.length === 0) {
                    ghostHouse = { col, row };
                    ghostSpawns.push({ col: col - 1, row });
                    ghostSpawns.push({ col: col + 1, row });
                    ghostSpawns.push({ col, row: row - 1 });
                    ghostSpawns.push({ col, row: row + 1 });
                }
            }
            else if (ch === "S") {
                wallLine.push(false);
                pelletLine.push(false);
                playerSpawn = { col, row };
            }
            else if (ch === "o") {
                wallLine.push(false);
                pelletLine.push(false);
                powerPellets.push({ col, row });
                totalPellets++;
            }
            else if (ch === ".") {
                wallLine.push(false);
                pelletLine.push(true);
                totalPellets++;
            }
            else {
                wallLine.push(false);
                pelletLine.push(false);
            }
        }
        walls.push(wallLine);
        pellets.push(pelletLine);
    }
    while (ghostSpawns.length < 4) {
        ghostSpawns.push({ ...ghostHouse });
    }
    const scatterTargets = [
        { col: 1, row: 1 },
        { col: PACMAN_COLS - 2, row: 1 },
        { col: 1, row: PACMAN_ROWS - 2 },
        { col: PACMAN_COLS - 2, row: PACMAN_ROWS - 2 },
    ];
    return {
        walls,
        pellets,
        powerPellets,
        ghostHouse,
        playerSpawn,
        ghostSpawns: ghostSpawns.slice(0, 4),
        scatterTargets,
        totalPellets,
    };
}
export function pacmanInBounds(col, row) {
    return col >= 0 && row >= 0 && col < PACMAN_COLS && row < PACMAN_ROWS;
}
export function pacmanOppositeDir(d) {
    if (d === 0)
        return 1;
    if (d === 1)
        return 0;
    if (d === 2)
        return 3;
    return 2;
}
export function pacmanCellCenterPx(col, row) {
    return {
        x: PACMAN_ORIGIN_X + (col + 0.5) * PACMAN_TILE,
        y: PACMAN_ORIGIN_Y + (row + 0.5) * PACMAN_TILE,
    };
}
export function pickPacmanPlayerSpawns(playerCount, base) {
    const offsets = [
        { dc: 0, dr: 0 },
        { dc: -1, dr: 0 },
        { dc: 1, dr: 0 },
        { dc: -2, dr: 0 },
        { dc: 2, dr: 0 },
        { dc: 0, dr: -1 },
        { dc: 0, dr: 1 },
        { dc: -1, dr: -1 },
    ];
    const out = [];
    for (let i = 0; i < playerCount; i++) {
        const o = offsets[i] ?? { dc: 0, dr: 0 };
        out.push({ col: base.col + o.dc, row: base.row + o.dr });
    }
    return out;
}
