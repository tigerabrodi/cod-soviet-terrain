# Terrain Systems

This folder owns the terrain generation and streaming stack.

The important runtime pieces are.

- `terrain-planet.ts`. Pure planet math. Cube face mapping. planet quadtree chunk selection. and mixed LOD edge morph lookup.
- `terrain-chunk.ts`. Chunk mesh generation. SharedArrayBuffer aware typed array allocation. skirts. edge stitching. and splat weights.
- `terrain-sampling.ts`. Terrain height sampling. splat logic. terrain seed offsets. and the noise controls used by the debug panel.
- `terrain-chunk.worker.ts`. Worker entry for background chunk builds.
- `terrain-worker-pool.ts`. Small worker pool that keeps chunk generation off the main thread.
- `terrain-runtime-scheduling.ts`. Small pure helpers for request budgeting and round robin runtime work.
- `terrain-chunk-transition.ts`. Small pure helper for chunk reveal timing.
- `terrain-material.ts`. WebGPU and TSL terrain material. Triplanar PBR splatting with the packed KTX2 texture arrays.
- `terrain-textures.ts`. KTX2 loading and texture array packing.

## Why this is optimized

- Chunk generation runs in workers. The main thread stays responsive for camera input and rendering.
- Worker results use `SharedArrayBuffer` when the browser is cross origin isolated. That avoids the usual copy heavy return path.
- Finished chunk results are queued and committed in small batches. That avoids React spikes when many workers finish close together.
- The fly camera streams a little ahead of its current movement direction. That starts chunk work sooner when you move fast.
- Fly mode keeps one streamed window around the current camera position and another around the predictive focus ahead. That makes sustained fast movement less likely to outrun the chunk handoff.
- The quadtree only asks for high detail near the current camera focus.
- Fine chunks behind the current fly camera view are filtered out before request and commit. That keeps the active triangle budget pointed at what the camera is actually looking at.
- Older chunk generations stay alive briefly during handoff. That reduces visible holes and makes the stream transition smoother.
- Chunks fully hidden by the planet horizon are filtered out too. That avoids spending terrain work on the far side of the sphere.
- The fly underlay uses its own fallback material and stays out of the main depth fight. That reduces dark flashing during terrain handoff.
- The chunk reveal helper starts from a small visible floor instead of pure zero. That avoids a single dark first frame when a new chunk lands.
- Chunk buffers are built once and then wrapped into Three geometry. We do not rebuild the whole world every frame.
- The material samples compressed KTX2 texture arrays. This keeps memory and upload cost under control.
- Triplanar sampling avoids stretched UVs on steep terrain so we do not need bespoke unwrap work.
- `terrainCoords` and `terrainHeight` are stored as attributes so the shader stays stable even when the world render origin moves.
- New chunks reveal from a fog tinted state over a short window. That hides hard pop in without using transparent terrain sorting.
- Noise scale and strength values live in the terrain settings object. That lets the debug UI regenerate genuinely different terrain shapes instead of faking a material only change.
- The terrain seed works by shifting the sampled noise fields in a stable way. That gives new planet variations without changing the whole terrain pipeline or breaking chunk determinism.

## Current project state

- Planet quadtree chunk streaming.
- Inspect camera and fly camera.
- Worker based chunk builds.
- SharedArrayBuffer worker output path.
- Floating origin aware rendering.
- LOD edge morphing and skirts.
- WebGPU renderer path with logarithmic depth buffer.
