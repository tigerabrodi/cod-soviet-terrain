# Terrain Scene

This component is the live bridge between the pure terrain systems and the running WebGPU scene.

## What it owns

- WebGPU renderer setup.
- Terrain material loading.
- Worker pool lifetime.
- Planet chunk diffing and chunk request priority.
- Queued chunk commit flushing and chunk reveal smoothing.
- Inspect mode and fly mode.
- Snow and sky scene integration.
- Snow accumulation compute scheduling and chunk snow state lifetime.
- Floating origin display offset.
- Small browser debug helpers.
- Runtime debug settings from the overlay panel.

## Why it is structured this way

- The hard terrain math stays in `src/lib/terrain`. That keeps the generator. quadtree. and chunk logic testable with Vitest.
- The fly controller math lives in `src/lib/camera`. That keeps camera feel work separate from terrain streaming.
- The scene layer only handles integration. loading. mesh lifetime. camera hookup. and runtime checks.
- The snow accumulation state lives next to the chunk runtime state instead of React state. That keeps the compute loop off the rerender path.
- New chunks reveal from a fog tinted state instead of appearing at full strength in one frame. That hides visible pop without using transparent terrain sorting.
- Fly mode streams against a slightly lower overview underlay. That way a slow chunk handoff shows rough terrain instead of a flat shell.
- The fly underlay uses its own non wireframe material and does not write depth. That makes it a fallback surface instead of something that fights the main streamed chunks.
- Fly mode also pushes the streaming focus a bit ahead of the camera movement direction. That lets chunk requests start sooner when moving fast.
- Fly mode now merges two streamed windows. one around the current camera position. and one around the predictive focus ahead. that keeps the current ground covered while the next terrain ring is already being requested.
- Fly mode chunk selection now also looks at the current view direction. Fine chunks behind the camera are filtered out before they are even requested.
- Chunk selection also applies horizon culling. Chunks fully hidden by the planet curve are not kept in the active streamed set.
- New chunks also start from a small reveal floor instead of absolute zero. That avoids the first dark frame during chunk handoff.
- The world render offset lives in a single group. That lets the fly camera move without forcing every terrain mesh prop to be recomputed through React on every frame.
- The scene exports a compact debug state with fps. draw calls. chunk count. triangle count. queue pressure. LOD split. and SharedArrayBuffer usage so the UI can teach what the renderer is doing.

## Camera modes

`Inspect`.

- Starts outside the planet.
- Uses orbit controls.
- Best for checking the whole planet. chunk coverage. and LOD transitions.

`Fly`.

- Starts just above the terrain shell.
- Uses pointer lock mouse look and six axis movement.
- Keeps a terrain clearance floor so the camera does not drop under the surface.
- Streams terrain a little ahead of the current movement direction so the camera does not outrun the chunk window as easily.
- Best for close terrain passes and checking scale.

## Runtime debug hook

`window.__terrainDebug` is intentionally small.

It exists so we can verify chunk count. triangle count. LOD split. SharedArrayBuffer usage. current camera mode. and the last streamed world focus point in a real browser session.
