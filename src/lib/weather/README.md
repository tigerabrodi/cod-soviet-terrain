# Weather Systems

This folder owns the particle weather buffers and texture loading.

## Files

- `snow-particles.ts`. Deterministic particle seed generation and the snowflake KTX2 loader.
- `snow-particles.test.ts`. Tests for particle buffer determinism and volume bounds.

## Why it is structured this way

The data generation for particles is pure and stable. That makes it a good TDD target.

The actual rendering path is not pure. It depends on Three WebGPU and TSL node material behavior.

So the split is simple.

- Pure attribute packing here.
- Live GPU material and scene hookup in `src/components/snow-particles.tsx`.

## Why this is optimized

- The snowflake texture is compressed as KTX2 in `public/textures/particles/snowflake.ktx2`.
- Particle seeds are created once. The CPU does not update individual flakes every frame.
- The live falling motion is driven in TSL on the GPU from time and per particle seed data.
- The snow volume follows the camera. That means we can keep density high near the player without simulating a giant planet wide weather grid.
