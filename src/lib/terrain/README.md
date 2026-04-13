# Terrain Systems

This folder owns the terrain generation and streaming stack.

The important runtime pieces are.

- `terrain-planet.ts`. Pure planet math. Cube face mapping. planet quadtree chunk selection. and mixed LOD edge morph lookup.
- `terrain-chunk.ts`. Chunk mesh generation. SharedArrayBuffer aware typed array allocation. skirts. edge stitching. and splat weights.
- `terrain-chunk.worker.ts`. Worker entry for background chunk builds.
- `terrain-worker-pool.ts`. Small worker pool that keeps chunk generation off the main thread.
- `terrain-material.ts`. WebGPU and TSL terrain material. Triplanar PBR splatting with the packed KTX2 texture arrays.
- `terrain-textures.ts`. KTX2 loading and texture array packing.

## Why this is optimized

- Chunk generation runs in workers. The main thread stays responsive for camera input and rendering.
- Worker results use `SharedArrayBuffer` when the browser is cross origin isolated. That avoids the usual copy heavy return path.
- The quadtree only asks for high detail near the current camera focus.
- Chunk buffers are built once and then wrapped into Three geometry. We do not rebuild the whole world every frame.
- The material samples compressed KTX2 texture arrays. This keeps memory and upload cost under control.
- Triplanar sampling avoids stretched UVs on steep terrain so we do not need bespoke unwrap work.
- `terrainCoords` and `terrainHeight` are stored as attributes so the shader stays stable even when the world render origin moves.

## Current project state

- Planet quadtree chunk streaming.
- Inspect camera and fly camera.
- Worker based chunk builds.
- SharedArrayBuffer worker output path.
- Floating origin aware rendering.
- LOD edge morphing and skirts.
- WebGPU renderer path with logarithmic depth buffer.
