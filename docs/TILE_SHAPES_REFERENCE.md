# Tile Shapes Reference

## Shape ID Map (`FRONTEND_SHAPES`)

| shapeType | Name         | Description |
|-----------|--------------|-------------|
| 0         | EMPTY        | No connections; blank cell |
| 2         | STRAIGHT     | Two opposite connections |
| 3         | ELBOW        | Two adjacent connections; classic corner |
| 4         | TEE          | Three connections; T-junction |
| 5         | CURVED_V     | Two adjacent connections; wide smooth corner |
| 6         | CROSS        | Four connections; plus junction |
| 7         | ORBIT_ELBOW  | Two adjacent connections; ring-accent corner |
| 8         | BLOOM_TEE    | Three connections; rounded clover-like junction |

---

## Bitmask Encoding

The backend stores connections in the lower 4 bits:

- `N = 1`
- `E = 2`
- `S = 4`
- `W = 8`

Any higher bits are visual markers only. Validation and routing always use `tile & 0xf`.

---

## Bitmask to Frontend Mapping

| Bitmask | Shape | Rotation | Notes |
|---------|-------|----------|-------|
| 0       | EMPTY (0) | 0 | Blank |
| 5       | STRAIGHT (2) | 0 | N+S |
| 10      | STRAIGHT (2) | 1 | E+W |
| 3       | ELBOW (3) | 0 | N+E |
| 6       | ELBOW (3) | 1 | E+S |
| 12      | ELBOW (3) | 2 | S+W |
| 9       | ELBOW (3) | 3 | W+N |
| 7       | TEE (4) | 0 | N+E+S |
| 14      | TEE (4) | 1 | E+S+W |
| 13      | TEE (4) | 2 | N+S+W |
| 11      | TEE (4) | 3 | N+E+W |
| 19      | CURVED_V (5) | 0 | N+E decorative elbow |
| 22      | CURVED_V (5) | 1 | E+S decorative elbow |
| 28      | CURVED_V (5) | 2 | S+W decorative elbow |
| 25      | CURVED_V (5) | 3 | W+N decorative elbow |
| 35      | ORBIT_ELBOW (7) | 0 | N+E ring-accent elbow |
| 38      | ORBIT_ELBOW (7) | 1 | E+S ring-accent elbow |
| 44      | ORBIT_ELBOW (7) | 2 | S+W ring-accent elbow |
| 41      | ORBIT_ELBOW (7) | 3 | W+N ring-accent elbow |
| 71      | BLOOM_TEE (8) | 0 | N+E+S rounded tee |
| 78      | BLOOM_TEE (8) | 1 | E+S+W rounded tee |
| 77      | BLOOM_TEE (8) | 2 | N+S+W rounded tee |
| 75      | BLOOM_TEE (8) | 3 | N+E+W rounded tee |
| 15      | CROSS (6) | 0 | N+E+S+W |

---

## Rendering Notes

- `CURVED_V` is a softer outer-corner variant of `ELBOW`.
- `ORBIT_ELBOW` is inspired by your first reference image: a corner piece with a circular ring accent.
- `BLOOM_TEE` is inspired by the rounded floral branches visible in your second reference image.
- If the client has not added dedicated art for `shapeType` `7` or `8` yet, it can temporarily fall back to `ELBOW` and `TEE` rendering while staying fully compatible with the backend.

---

## Engine Behavior

`getTileFrontendInfo(bitmask: number)` returns:

```typescript
{ shapeType: number, rotation: number }
```

The puzzle engine now injects a mix of decorative variants during solved-grid generation:

- some `ELBOW` tiles become `CURVED_V`
- some `ELBOW` tiles become `ORBIT_ELBOW`
- some `TEE` tiles become `BLOOM_TEE`

These are visual-only upgrades and do not change solvability.
