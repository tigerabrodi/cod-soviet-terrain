# Vegetation Systems

This folder owns the pure data side of the dead tree system.

## Files

- `dead-tree-generation.ts`. Deterministic per chunk tree placement.
- `dead-tree-generation.test.ts`. Tests for stable placement and settings behavior.
- `dead-tree-geometry.ts`. Shared leafless tree mesh used by every instance.
- `dead-tree-textures.ts`. Bark KTX2 loading through the shared loader path.
- `dead-tree-material.ts`. Shared bark material setup.

## Why it is structured this way

The placement logic is pure and deterministic.

That makes it a good TDD target.

The rendering path is not pure.

It depends on React Three Fiber. Three.js. WebGPU. and live scene state.

So the split stays simple.

- Pure placement math here.
- Bark asset loading here.
- Live instanced rendering in `/Users/tigerabrodi/Desktop/cod-soviet-terrain/src/components/terrain-trees.tsx`.

## Why this is optimized

- Trees are generated per chunk. not as one giant planet wide vegetation pass.
- The same chunk key always gives the same tree layout. so there is no popping from random rerolls.
- The visible tree mesh is instanced. so one geometry and one material can draw many trees.
- Bark textures stay in KTX2. which keeps the memory path much lighter than raw textures.
- The tree system rides on the same chunk and LOD logic as the terrain. so far chunks can stay sparse or tree free.
