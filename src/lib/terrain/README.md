# Terrain Systems

This folder owns the terrain generation and streaming stack.

Batch two is now centered around a cube sphere planet.

The important runtime pieces are.

- `terrain-planet.ts`. Pure planet math. Cube face mapping. Planet quadtree chunk selection. Edge morph lookup for mixed LOD borders.
- `terrain-chunk.ts`. Chunk mesh generation. Flat and planet modes. SharedArrayBuffer aware typed array allocation. Edge stitching. Skirts. Splat weights.
- `terrain-chunk.worker.ts`. Worker entry for background chunk builds.
- `terrain-worker-pool.ts`. Small worker pool that keeps chunk generation off the main thread.
- `terrain-material.ts`. WebGPU and TSL terrain material. Triplanar PBR splatting with the packed KTX2 texture arrays.
- `terrain-textures.ts`. Loads and packs the KTX2 textures into compressed texture arrays.

## Why this is optimized

- Chunk generation runs in workers. The main thread stays responsive for camera movement and rendering.
- Worker results are built on `SharedArrayBuffer` when the browser is cross origin isolated. This avoids the usual copy heavy path.
- The quadtree only asks for high detail near the camera. Far terrain stays coarse.
- Chunk buffers are built once and then wrapped into Three geometry. We do not rebuild everything every frame.
- The material samples compressed KTX2 texture arrays. This keeps texture memory and upload cost under control.
- Triplanar sampling avoids stretched UVs on steep terrain so we do not need expensive bespoke UV unwrap logic.
- `terrainCoords` and `terrainHeight` are stored as attributes so the shader can stay stable even when the scene uses a floating origin.

## Current batch two state

Done.

- Planet quadtree chunk streaming.
- Fly camera and inspect camera.
- Worker based chunk builds.
- SharedArrayBuffer worker output path.
- Floating origin aware chunk builds.
- LOD edge morphing and skirts.
- Log depth renderer setup.

Still worth improving later.

- Chunk seam polishing across the full planet.
- Better whole planet far view material and shell polish.
- More aggressive code splitting for the large route chunk.
