/**
 * ============================================================
 * INFINITY LOOP — Shape Definitions (Single Source of Truth)
 * ============================================================
 *
 * Bitmask encoding (4 bits, lower nibble): N=1  E=2  S=4  W=8
 *
 * CURVED_V uses a marker bit (bit 4 = 16) above the standard 4-bit
 * bitmask to distinguish it from ELBOW visually while keeping the
 * same N/E/S/W connection logic (tile & 0xf gives the connections).
 *
 * e.g. CURVED_V_NE = 19 = 16 + 3 = 0b10011  →  tile & 0xf = 3 = N+E
 * ============================================================
 */

// ── Frontend shape type IDs ────────────────────────────────────
export const SHAPE_TYPE = {
    EMPTY: 0,
    STRAIGHT: 2,
    ELBOW: 3,
    TEE: 4,
    CURVED_V: 5,
    CROSS: 6,
} as const;

export type ShapeType = (typeof SHAPE_TYPE)[keyof typeof SHAPE_TYPE];

// ── All bitmask values used in the grid ───────────────────────
export const BITMASK = {
    EMPTY: 0,

    // STRAIGHT — 2 connections, opposite sides
    STRAIGHT_V: 5, // N+S  (0b0101)
    STRAIGHT_H: 10, // E+W  (0b1010)

    // ELBOW — 2 connections, adjacent sides (small inward corner arc)
    ELBOW_NE: 3, // N+E  (0b0011)
    ELBOW_ES: 6, // E+S  (0b0110)
    ELBOW_SW: 12, // S+W  (0b1100)
    ELBOW_WN: 9, // W+N  (0b1001)

    // TEE — 3 connections
    TEE_NES: 7, // N+E+S  (0b0111)
    TEE_ESW: 14, // E+S+W  (0b1110)
    TEE_NSW: 13, // N+S+W  (0b1101)
    TEE_NEW: 11, // N+E+W  (0b1011)

    // CURVED_V — 2 adjacent connections + marker bit 16
    // (large smooth outward arc, same connectivity as ELBOW)
    CURVED_V_NE: 19, // 16+3  = N+E curved
    CURVED_V_ES: 22, // 16+6  = E+S curved
    CURVED_V_SW: 28, // 16+12 = S+W curved
    CURVED_V_WN: 25, // 16+9  = W+N curved

    // CROSS — 4 connections, straight-through routing N↔S and E↔W
    CROSS: 15, // N+E+S+W  (0b1111)
} as const;

export type BitmaskValue = (typeof BITMASK)[keyof typeof BITMASK];

// ── Per-shape metadata ─────────────────────────────────────────
export interface ShapeDef {
    shapeType: ShapeType;
    name: string;
    bitmasks: readonly number[];
    connections: number;
    rotationCount: number;
    description: string;
}

export const SHAPES: readonly ShapeDef[] = [
    {
        shapeType: SHAPE_TYPE.EMPTY,
        name: 'EMPTY',
        bitmasks: [BITMASK.EMPTY],
        connections: 0,
        rotationCount: 1,
        description: 'No connections — blank cell',
    },
    {
        shapeType: SHAPE_TYPE.STRAIGHT,
        name: 'STRAIGHT',
        bitmasks: [BITMASK.STRAIGHT_V, BITMASK.STRAIGHT_H],
        connections: 2,
        rotationCount: 2,
        description: 'Two opposite connections (│ or ─)',
    },
    {
        shapeType: SHAPE_TYPE.ELBOW,
        name: 'ELBOW',
        bitmasks: [BITMASK.ELBOW_NE, BITMASK.ELBOW_ES, BITMASK.ELBOW_SW, BITMASK.ELBOW_WN],
        connections: 2,
        rotationCount: 4,
        description: 'Two adjacent connections — small inward corner arc',
    },
    {
        shapeType: SHAPE_TYPE.TEE,
        name: 'TEE',
        bitmasks: [BITMASK.TEE_NES, BITMASK.TEE_ESW, BITMASK.TEE_NSW, BITMASK.TEE_NEW],
        connections: 3,
        rotationCount: 4,
        description: 'Three connections — T-junction',
    },
    {
        shapeType: SHAPE_TYPE.CURVED_V,
        name: 'CURVED_V',
        bitmasks: [
            BITMASK.CURVED_V_NE,
            BITMASK.CURVED_V_ES,
            BITMASK.CURVED_V_SW,
            BITMASK.CURVED_V_WN,
        ],
        connections: 2,
        rotationCount: 4,
        description: 'Two adjacent connections — large smooth outward C-arc (bitmask = ELBOW + 16)',
    },
    {
        shapeType: SHAPE_TYPE.CROSS,
        name: 'CROSS',
        bitmasks: [BITMASK.CROSS],
        connections: 4,
        rotationCount: 1,
        description: 'All four connections — plus shape (+), routes N↔S and E↔W independently',
    },
] as const;

// ── Bitmask → { shapeType, rotation } ─────────────────────────
export const BITMASK_TO_FRONTEND: Readonly<
    Record<number, { shapeType: number; rotation: number }>
> = {
    [BITMASK.EMPTY]: { shapeType: SHAPE_TYPE.EMPTY, rotation: 0 },
    // STRAIGHT
    [BITMASK.STRAIGHT_V]: { shapeType: SHAPE_TYPE.STRAIGHT, rotation: 0 },
    [BITMASK.STRAIGHT_H]: { shapeType: SHAPE_TYPE.STRAIGHT, rotation: 1 },
    // ELBOW
    [BITMASK.ELBOW_NE]: { shapeType: SHAPE_TYPE.ELBOW, rotation: 0 },
    [BITMASK.ELBOW_ES]: { shapeType: SHAPE_TYPE.ELBOW, rotation: 1 },
    [BITMASK.ELBOW_SW]: { shapeType: SHAPE_TYPE.ELBOW, rotation: 2 },
    [BITMASK.ELBOW_WN]: { shapeType: SHAPE_TYPE.ELBOW, rotation: 3 },
    // TEE
    [BITMASK.TEE_NES]: { shapeType: SHAPE_TYPE.TEE, rotation: 0 },
    [BITMASK.TEE_ESW]: { shapeType: SHAPE_TYPE.TEE, rotation: 1 },
    [BITMASK.TEE_NSW]: { shapeType: SHAPE_TYPE.TEE, rotation: 2 },
    [BITMASK.TEE_NEW]: { shapeType: SHAPE_TYPE.TEE, rotation: 3 },
    // CURVED_V
    [BITMASK.CURVED_V_NE]: { shapeType: SHAPE_TYPE.CURVED_V, rotation: 0 },
    [BITMASK.CURVED_V_ES]: { shapeType: SHAPE_TYPE.CURVED_V, rotation: 1 },
    [BITMASK.CURVED_V_SW]: { shapeType: SHAPE_TYPE.CURVED_V, rotation: 2 },
    [BITMASK.CURVED_V_WN]: { shapeType: SHAPE_TYPE.CURVED_V, rotation: 3 },
    // CROSS
    [BITMASK.CROSS]: { shapeType: SHAPE_TYPE.CROSS, rotation: 0 },
};

// ── Rotation cycles: bitmask → [rot0, rot1, rot2, rot3] ───────
// rotateTile(mask, steps) returns ROTATION_CYCLES[mask][steps]
export const ROTATION_CYCLES: Readonly<Record<number, [number, number, number, number]>> = {
    [BITMASK.EMPTY]: [0, 0, 0, 0],
    // STRAIGHT (period 2)
    [BITMASK.STRAIGHT_V]: [5, 10, 5, 10],
    [BITMASK.STRAIGHT_H]: [10, 5, 10, 5],
    // ELBOW (period 4)
    [BITMASK.ELBOW_NE]: [3, 6, 12, 9],
    [BITMASK.ELBOW_ES]: [6, 12, 9, 3],
    [BITMASK.ELBOW_SW]: [12, 9, 3, 6],
    [BITMASK.ELBOW_WN]: [9, 3, 6, 12],
    // TEE (period 4)
    [BITMASK.TEE_NES]: [7, 14, 13, 11],
    [BITMASK.TEE_ESW]: [14, 13, 11, 7],
    [BITMASK.TEE_NSW]: [13, 11, 7, 14],
    [BITMASK.TEE_NEW]: [11, 7, 14, 13],
    // CURVED_V (period 4, same cycle structure as ELBOW)
    [BITMASK.CURVED_V_NE]: [19, 22, 28, 25],
    [BITMASK.CURVED_V_ES]: [22, 28, 25, 19],
    [BITMASK.CURVED_V_SW]: [28, 25, 19, 22],
    [BITMASK.CURVED_V_WN]: [25, 19, 22, 28],
    // CROSS (period 1)
    [BITMASK.CROSS]: [15, 15, 15, 15],
};

// ── Rotation count per bitmask ─────────────────────────────────
export const ROTATION_COUNT_MAP: Readonly<Record<number, number>> = {
    [BITMASK.EMPTY]: 1,
    [BITMASK.STRAIGHT_V]: 2,
    [BITMASK.STRAIGHT_H]: 2,
    [BITMASK.ELBOW_NE]: 4,
    [BITMASK.ELBOW_ES]: 4,
    [BITMASK.ELBOW_SW]: 4,
    [BITMASK.ELBOW_WN]: 4,
    [BITMASK.TEE_NES]: 4,
    [BITMASK.TEE_ESW]: 4,
    [BITMASK.TEE_NSW]: 4,
    [BITMASK.TEE_NEW]: 4,
    [BITMASK.CURVED_V_NE]: 4,
    [BITMASK.CURVED_V_ES]: 4,
    [BITMASK.CURVED_V_SW]: 4,
    [BITMASK.CURVED_V_WN]: 4,
    [BITMASK.CROSS]: 1,
};

// ── Elbow → CURVED_V upgrade map (for puzzle generation) ───────
export const ELBOW_TO_CURVED_V: Readonly<Record<number, number>> = {
    [BITMASK.ELBOW_NE]: BITMASK.CURVED_V_NE,
    [BITMASK.ELBOW_ES]: BITMASK.CURVED_V_ES,
    [BITMASK.ELBOW_SW]: BITMASK.CURVED_V_SW,
    [BITMASK.ELBOW_WN]: BITMASK.CURVED_V_WN,
};

export default {
    SHAPE_TYPE,
    BITMASK,
    SHAPES,
    BITMASK_TO_FRONTEND,
    ROTATION_CYCLES,
    ROTATION_COUNT_MAP,
    ELBOW_TO_CURVED_V,
};
