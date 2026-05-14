/**
 * ============================================================
 * INFINITY LOOP — Puzzle Engine
 * ============================================================
 * Handles puzzle generation (seeded), scrambling,
 * solution validation, and multi-solution detection.
 *
 * Tile connection model (bitmask lower 4 bits: N=1 E=2 S=4 W=8):
 *   │  STRAIGHT_V  : N+S = 0b0101 = 5
 *   ─  STRAIGHT_H  : E+W = 0b1010 = 10
 *   ┌  ELBOW_NE    : N+E = 0b0011 = 3
 *   ┐  ELBOW_ES    : E+S = 0b0110 = 6
 *   ┘  ELBOW_SW    : S+W = 0b1100 = 12
 *   └  ELBOW_WN    : W+N = 0b1001 = 9
 *   ├  T_NES       : N+E+S = 0b0111 = 7
 *   ┬  T_ESW       : E+S+W = 0b1110 = 14
 *   ┤  T_NSW       : N+S+W = 0b1101 = 13
 *   ┴  T_NEW       : N+E+W = 0b1011 = 11
 *   ╋  CROSS       : N+E+S+W = 0b1111 = 15
 *
 * CURVED_V uses bitmask = ELBOW_bitmask + 16 (marker bit).
 *   tile & 0xf  → gives the actual N/E/S/W connections (same as ELBOW).
 *   tile & 0x10 → set means CURVED_V; clear means ELBOW.
 *   19 = N+E curved, 22 = E+S curved, 28 = S+W curved, 25 = W+N curved
 * ============================================================
 */

import {
    BITMASK,
    BITMASK_TO_FRONTEND,
    ELBOW_TO_CURVED_V,
    ROTATION_CYCLES,
    ROTATION_COUNT_MAP,
    SHAPE_TYPE,
} from './shapes.config';

export { BITMASK as TILE_SHAPES, SHAPE_TYPE as FRONTEND_SHAPES };
export { BITMASK_TO_FRONTEND, ROTATION_CYCLES, ROTATION_COUNT_MAP };

// Re-export shapes config as default for consumers that import the whole module
export { default as ShapesConfig } from './shapes.config';

export const DIR = { N: 1, E: 2, S: 4, W: 8 } as const;
export const DIR_OPPOSITE: Record<number, number> = { 1: 4, 2: 8, 4: 1, 8: 2 };
export const DIR_NAMES: Record<number, string> = { 1: 'N', 2: 'E', 4: 'S', 8: 'W' };

export type Direction = 1 | 2 | 4 | 8;
type Cell = [number, number];

// Legacy alias kept for existing consumers
export const TILE_ROTATION_MAP: Record<number, number[]> = ROTATION_CYCLES;
export const ROTATION_COUNT: Record<number, number> = ROTATION_COUNT_MAP;

// ── getTileFrontendInfo ────────────────────────────────────────
export function getTileFrontendInfo(bitmask: number): { shapeType: number; rotation: number } {
    return BITMASK_TO_FRONTEND[bitmask] ?? { shapeType: 0, rotation: 0 };
}

// ── Seeded PRNG (Mulberry32) ───────────────────────────────────
export function seededRandom(seed: number) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ── Tile Rotation ──────────────────────────────────────────────
export function rotateTile(mask: number, steps: number = 1): number {
    steps = ((steps % 4) + 4) % 4;
    if (steps === 0) {
        return mask;
    }
    const sequence = ROTATION_CYCLES[mask];
    if (sequence) {
        return sequence[steps];
    }
    // fallback: bitwise rotate on the lower 4 bits only
    let m = mask & 0xf;
    for (let i = 0; i < steps; i++) {
        m = ((m << 1) | (m >> 3)) & 0xf;
    }
    return m;
}

export function getUniqueRotations(mask: number): number[] {
    const seen = new Set<number>();
    const result: number[] = [];
    for (let i = 0; i < 4; i++) {
        const r = rotateTile(mask, i);
        if (!seen.has(r)) {
            seen.add(r);
            result.push(r);
        }
    }
    return result;
}

// ── Puzzle Generation ──────────────────────────────────────────
export function generateSolvedPuzzle(
    rows: number,
    cols: number,
    seed: string,
    level: number = 1,
): { grid: number[][]; seed: string } {
    void level;
    const rng = seededRandom(hashSeed(seed));

    const DIR_LIST = [DIR.N, DIR.E, DIR.S, DIR.W] as const;

    const getNeighbors = (r: number, c: number): [number, number, number][] => {
        const nb: [number, number, number][] = [];
        if (r > 0) {
            nb.push([r - 1, c, DIR.N]);
        }
        if (c < cols - 1) {
            nb.push([r, c + 1, DIR.E]);
        }
        if (r < rows - 1) {
            nb.push([r + 1, c, DIR.S]);
        }
        if (c > 0) {
            nb.push([r, c - 1, DIR.W]);
        }
        return nb;
    };

    const shuffleArr = <T>(arr: T[]): T[] => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    };

    // ── Step 1: Randomised DFS spanning tree (covers every cell) ──
    const grid: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
    const visited: boolean[][] = Array.from({ length: rows }, () =>
        Array<boolean>(cols).fill(false),
    );

    type Frame = { r: number; c: number; nb: [number, number, number][]; idx: number };
    const stack: Frame[] = [];

    visited[0][0] = true;
    stack.push({ r: 0, c: 0, nb: shuffleArr(getNeighbors(0, 0)), idx: 0 });

    while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.idx >= top.nb.length) {
            stack.pop();
            continue;
        }

        const [nr, nc, dir] = top.nb[top.idx++];
        if (visited[nr][nc]) {
            continue;
        }

        visited[nr][nc] = true;
        grid[top.r][top.c] |= dir;
        grid[nr][nc] |= DIR_OPPOSITE[dir];
        stack.push({ r: nr, c: nc, nb: shuffleArr(getNeighbors(nr, nc)), idx: 0 });
    }

    // ── Step 2: Close every degree-1 tile ─────────────────────────
    const getDeg = (r: number, c: number): number =>
        DIR_LIST.filter((d) => !!(grid[r][c] & d)).length;

    let changed = true;
    let passes = 0;
    while (changed && passes < 200) {
        changed = false;
        passes++;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (getDeg(r, c) !== 1) {
                    continue;
                }

                const candidates = getNeighbors(r, c)
                    .filter(([nr, nc, dir]) => !(grid[r][c] & dir) && getDeg(nr, nc) < 4)
                    .sort(([ar, ac], [br, bc]) => getDeg(ar, ac) - getDeg(br, bc));

                if (candidates.length === 0) {
                    continue;
                }

                const [nr, nc, dir] = candidates[0];
                grid[r][c] |= dir;
                grid[nr][nc] |= DIR_OPPOSITE[dir];
                changed = true;
            }
        }
    }

    // ── Step 3: Inject CROSS tiles at eligible STRAIGHT cells ─────
    const isReachableWithout = (
        sr: number,
        sc: number,
        tr: number,
        tc: number,
        exr: number,
        exc: number,
    ): boolean => {
        if (sr === tr && sc === tc) {
            return true;
        }
        const vis: boolean[][] = Array.from({ length: rows }, () =>
            Array<boolean>(cols).fill(false),
        );
        vis[exr][exc] = true;
        vis[sr][sc] = true;
        const q: [number, number][] = [[sr, sc]];
        const moves: [number, number, number][] = [
            [-1, 0, DIR.N],
            [0, 1, DIR.E],
            [1, 0, DIR.S],
            [0, -1, DIR.W],
        ];
        while (q.length) {
            const [r, c] = q.shift()!;
            for (const [dr, dc, d] of moves) {
                const nr = r + dr,
                    nc = c + dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || vis[nr][nc]) {
                    continue;
                }
                if (!(grid[r][c] & d)) {
                    continue;
                }
                if (nr === tr && nc === tc) {
                    return true;
                }
                vis[nr][nc] = true;
                q.push([nr, nc]);
            }
        }
        return false;
    };

    const CROSS_RATE = 0.55;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const mask = grid[r][c] & 0xf;

            if (mask === BITMASK.STRAIGHT_V && c > 0 && c < cols - 1) {
                if (
                    !(grid[r][c] & DIR.W) &&
                    !(grid[r][c] & DIR.E) &&
                    getDeg(r, c - 1) < 4 &&
                    getDeg(r, c + 1) < 4 &&
                    rng() < CROSS_RATE &&
                    isReachableWithout(r, c - 1, r, c + 1, r, c)
                ) {
                    grid[r][c] |= DIR.E | DIR.W;
                    grid[r][c - 1] |= DIR.E;
                    grid[r][c + 1] |= DIR.W;
                }
            } else if (mask === BITMASK.STRAIGHT_H && r > 0 && r < rows - 1) {
                if (
                    !(grid[r][c] & DIR.N) &&
                    !(grid[r][c] & DIR.S) &&
                    getDeg(r - 1, c) < 4 &&
                    getDeg(r + 1, c) < 4 &&
                    rng() < CROSS_RATE &&
                    isReachableWithout(r - 1, c, r + 1, c, r, c)
                ) {
                    grid[r][c] |= DIR.N | DIR.S;
                    grid[r - 1][c] |= DIR.S;
                    grid[r + 1][c] |= DIR.N;
                }
            }
        }
    }

    // ── Step 4: Randomly upgrade some ELBOW tiles to CURVED_V ─────
    // CURVED_V has the same N/E/S/W connections as the ELBOW it replaces
    // (tile & 0xf stays the same). This is a purely visual change that
    // keeps all loops closed and solvable.
    const CURVED_V_RATE = 0.45;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const mask = grid[r][c] & 0xf;
            const curved = ELBOW_TO_CURVED_V[mask];
            if (curved !== undefined && rng() < CURVED_V_RATE) {
                grid[r][c] = curved;
            }
        }
    }

    return { grid, seed };
}

// ── Puzzle Scrambling ──────────────────────────────────────────
export function scramblePuzzle(
    solvedGrid: number[][],
    seed: string,
): { scrambledGrid: number[][]; rotations: number[][] } {
    const rng = seededRandom(hashSeed(seed + '_scramble'));
    const rows = solvedGrid.length;
    const cols = solvedGrid[0].length;
    const scrambledGrid: number[][] = [];
    const rotations: number[][] = [];

    for (let r = 0; r < rows; r++) {
        scrambledGrid.push([]);
        rotations.push([]);
        for (let c = 0; c < cols; c++) {
            const tile = solvedGrid[r][c];
            const uniqueRots = getUniqueRotations(tile);
            let rotSteps = 0;

            if (uniqueRots.length > 1) {
                const possibleSteps = [1, 2, 3].filter((s) => rotateTile(tile, s) !== tile);
                rotSteps =
                    possibleSteps.length > 0
                        ? possibleSteps[Math.floor(rng() * possibleSteps.length)]
                        : Math.floor(rng() * 4);
            }
            scrambledGrid[r].push(rotateTile(tile, rotSteps));
            rotations[r].push(rotSteps);
        }
    }

    return { scrambledGrid, rotations };
}

// ── Puzzle Validation ──────────────────────────────────────────
export function validateSolution(grid: number[][]): {
    valid: boolean;
    errors: string[];
    loops: number[][][];
} {
    const rows = grid.length;
    const cols = grid[0].length;
    const errors: string[] = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const tile = grid[r][c];
            if (tile === 0) {
                continue;
            }

            // Use lower 4 bits for connection checks; upper marker bits are visual-only
            const connections = tile & 0xf;

            for (const d of [DIR.N, DIR.E, DIR.S, DIR.W] as const) {
                if (!(connections & d)) {
                    continue;
                }

                let nr = r,
                    nc = c;
                let opp = 0;
                if (d === DIR.N) {
                    nr = r - 1;
                    opp = DIR.S;
                } else if (d === DIR.E) {
                    nc = c + 1;
                    opp = DIR.W;
                } else if (d === DIR.S) {
                    nr = r + 1;
                    opp = DIR.N;
                } else {
                    nc = c - 1;
                    opp = DIR.E;
                }

                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
                    errors.push(`[${r},${c}] ${DIR_NAMES[d]} edge at boundary`);
                } else if (!(grid[nr][nc] & 0xf & opp)) {
                    errors.push(
                        `[${r},${c}] ${DIR_NAMES[d]} not matched by neighbor [${nr},${nc}]`,
                    );
                }
            }
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, loops: [] as Cell[][] };
    }

    const visited: boolean[][] = Array.from({ length: rows }, () =>
        Array<boolean>(cols).fill(false),
    );
    const loops: Cell[][] = [];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!visited[r][c] && grid[r][c] !== 0) {
                const loop = floodFill(grid, r, c, visited, rows, cols);
                if (loop.length === 0) {
                    return {
                        valid: false,
                        errors: [`[${r},${c}] incomplete loop`],
                        loops: [] as Cell[][],
                    };
                }
                loops.push(loop);
            }
        }
    }

    if (loops.length === 0) {
        return { valid: false, errors: ['Grid is empty'], loops: [] };
    }
    return { valid: true, errors: [], loops };
}

function floodFill(
    grid: number[][],
    startR: number,
    startC: number,
    visitedGlobal: boolean[][],
    rows: number,
    cols: number,
): Cell[] {
    const loop: Cell[] = [];
    const stack: [number, number, number][] = [];
    const internalVisited: number[][] = Array.from({ length: rows }, () =>
        Array<number>(cols).fill(0),
    );

    const startTile = grid[startR][startC] & 0xf;
    if (startTile & DIR.N) {
        stack.push([startR, startC, DIR.N]);
    } else if (startTile & DIR.E) {
        stack.push([startR, startC, DIR.E]);
    } else if (startTile & DIR.S) {
        stack.push([startR, startC, DIR.S]);
    } else if (startTile & DIR.W) {
        stack.push([startR, startC, DIR.W]);
    }

    while (stack.length) {
        const [r, c, enterDir] = stack.pop()!;

        if (!visitedGlobal[r][c]) {
            visitedGlobal[r][c] = true;
            loop.push([r, c]);
        }

        if (internalVisited[r][c] & enterDir) {
            continue;
        }
        internalVisited[r][c] |= enterDir;

        const connections = grid[r][c] & 0xf;

        let possibleExits = 0;
        if (connections === BITMASK.CROSS) {
            // CROSS: straight-through routing N↔S and E↔W
            const opp: Record<number, number> = {
                [DIR.N]: DIR.S,
                [DIR.E]: DIR.W,
                [DIR.S]: DIR.N,
                [DIR.W]: DIR.E,
            };
            possibleExits = opp[enterDir] ?? 0;
        } else {
            // All other tiles (including CURVED_V whose connections = ELBOW bitmask):
            // exit through every connected side except the entry side
            possibleExits = connections & ~enterDir;
        }

        if (possibleExits & DIR.N && r > 0) {
            internalVisited[r][c] |= DIR.N;
            stack.push([r - 1, c, DIR.S]);
        }
        if (possibleExits & DIR.E && c < cols - 1) {
            internalVisited[r][c] |= DIR.E;
            stack.push([r, c + 1, DIR.W]);
        }
        if (possibleExits & DIR.S && r < rows - 1) {
            internalVisited[r][c] |= DIR.S;
            stack.push([r + 1, c, DIR.N]);
        }
        if (possibleExits & DIR.W && c > 0) {
            internalVisited[r][c] |= DIR.W;
            stack.push([r, c - 1, DIR.E]);
        }
    }
    return loop;
}

// ── Multiple Solutions Detection ───────────────────────────────
export function countSolutions(
    puzzle: number[][],
    maxSolutions: number = 2,
): { count: number; solutions: number[][][] } {
    const rows = puzzle.length;
    const cols = puzzle[0].length;
    const solutions: number[][][] = [];

    // CROSS (15) is visually symmetric — treat as single candidate
    const candidates = puzzle.map((row) =>
        row.map((tile) => ((tile & 0xf) === BITMASK.CROSS ? [tile] : getUniqueRotations(tile))),
    );

    function solve(grid: number[][], r: number, c: number) {
        if (solutions.length >= maxSolutions) {
            return;
        }

        let nr = r,
            nc = c + 1;
        if (nc >= cols) {
            nr++;
            nc = 0;
        }

        for (const rotated of candidates[r][c]) {
            if (isLocallyValid(grid, r, c, rotated, rows, cols)) {
                const prev = grid[r][c];
                grid[r][c] = rotated;

                if (nr >= rows) {
                    const { valid } = validateSolution(grid.map((row) => [...row]));
                    if (valid) {
                        solutions.push(grid.map((row) => [...row]));
                    }
                } else {
                    solve(grid, nr, nc);
                }
                grid[r][c] = prev;
            }
        }
    }

    const workGrid = puzzle.map((row) => [...row]);
    solve(workGrid, 0, 0);
    return { count: solutions.length, solutions };
}

function isLocallyValid(
    grid: number[][],
    r: number,
    c: number,
    tileVal: number,
    rows: number,
    cols: number,
): boolean {
    void rows;
    void cols;
    const conn = tileVal & 0xf;
    if (r > 0) {
        if (!!(conn & DIR.N) !== !!(grid[r - 1][c] & 0xf & DIR.S)) {
            return false;
        }
    } else if (conn & DIR.N) {
        return false;
    }

    if (c > 0) {
        if (!!(conn & DIR.W) !== !!(grid[r][c - 1] & 0xf & DIR.E)) {
            return false;
        }
    } else if (conn & DIR.W) {
        return false;
    }

    return true;
}

// ── Utilities ──────────────────────────────────────────────────
export function hashSeed(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
}

export function getLevelSeed(levelId: number, difficulty: string = 'medium'): string {
    const randomStr = Math.random().toString(36).substring(2, 7);
    return `IL_${difficulty}_l${levelId}_v1_${Date.now()}_${randomStr}`;
}

export function getGridSizeForLevel(level: number): { rows: number; cols: number } {
    const base = 3;
    const increment = Math.floor((level - 1) / 5);
    const rows = Math.min(20, base + increment);
    const cols = Math.min(20, base + Math.floor((level - 1) / 3));
    return { rows, cols };
}

export function createPuzzle({
    rows,
    cols,
    seed,
    level = 1,
    difficulty = 'medium',
}: {
    rows: number;
    cols: number;
    level?: number;
    seed: string;
    difficulty?: string;
}) {
    const { grid: solvedGrid } = generateSolvedPuzzle(rows, cols, seed, level);
    const { scrambledGrid, rotations } = scramblePuzzle(solvedGrid, seed);

    return {
        id: `${seed}_${rows}x${cols}`,
        seed,
        difficulty,
        rows,
        cols,
        solvedGrid,
        initialGrid: scrambledGrid.map((row) => [...row]),
        currentGrid: scrambledGrid.map((row) => [...row]),
        initialRotations: rotations,
        createdAt: Date.now(),
    };
}

export default {
    DIR,
    DIR_OPPOSITE,
    TILE_SHAPES: BITMASK,
    FRONTEND_SHAPES: SHAPE_TYPE,
    rotateTile,
    getUniqueRotations,
    generateSolvedPuzzle,
    scramblePuzzle,
    validateSolution,
    countSolutions,
    hashSeed,
    getLevelSeed,
    createPuzzle,
    seededRandom,
    getGridSizeForLevel,
    TILE_ROTATION_MAP,
    ROTATION_COUNT,
    getTileFrontendInfo,
};
