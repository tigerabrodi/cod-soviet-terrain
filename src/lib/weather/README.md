# Weather Systems

This folder owns the particle weather buffers. texture loading. and ground snow accumulation logic.

## Files

- `snow-particles.ts`. Deterministic particle seed generation and the snowflake KTX2 loader.
- `snow-particles.test.ts`. Tests for particle buffer determinism and volume bounds.
- `snow-accumulation.ts`. Pure snow coverage rules and the WebGPU compute backed ground accumulation path.
- `snow-accumulation.test.ts`. Tests for the accumulation rule and signature stability.

## Why it is structured this way

The data generation for particles is pure and stable. That makes it a good TDD target.

The actual rendering path is not pure. It depends on Three WebGPU and TSL node material behavior.

So the split is simple.

- Pure attribute packing here.
- Ground snow simulation here.
- Live GPU material and scene hookup in `src/components/snow-particles.tsx`.
- Terrain scene integration in `src/components/terrain-scene.tsx`.

## Why this is optimized

- The snowflake texture is compressed as KTX2 in `public/textures/particles/snowflake.ktx2`.
- Particle seeds are created once. The CPU does not update individual flakes every frame.
- The live falling motion is driven in TSL on the GPU from time and per particle seed data.
- The snow volume follows the camera. That means we can keep density high near the player without simulating a giant planet wide weather grid.
- Ground accumulation is updated through a compute step instead of rebuilding terrain on the CPU every frame.
- The terrain shader reads the snow field directly so the snow look can change without changing the mesh.
