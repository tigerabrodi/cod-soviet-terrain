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

The important architecture split is this.

- Snowflakes in the air are presentation.
- Ground accumulation is simulation.

That keeps the effect believable without the cost of tracking individual flakes hitting a streamed planet surface.

## Why this is optimized

- The snowflake texture is compressed as KTX2 in `public/textures/particles/snowflake.ktx2`.
- Particle seeds are created once. The CPU does not update individual flakes every frame.
- The live falling motion is driven in TSL on the GPU from time and per particle seed data.
- The snow volume follows the camera. That means we can keep density high near the player without simulating a giant planet wide weather grid.
- Ground accumulation is updated through a compute step instead of rebuilding terrain on the CPU every frame.
- The terrain shader reads the snow field directly so the snow look can change without changing the mesh.
- Ground accumulation is per chunk. That fits the existing terrain streaming model and avoids a giant global snow map.
- Active snow chunks are updated in a round robin pass. That spreads compute work across frames and reduces spikes.

## Debug tuning

The debug panel can tune the weather and ground snow behavior live.

The most important controls are.

- `snow density` for visible snowfall in the air.
- `ground build` for how quickly snow coverage grows.
- `ground melt` for how quickly snow retreats.
- `ground wind` for how strongly exposed spots lose snow.
- `snow look` for how strongly the terrain material responds to the accumulated field.
