# Terrain Scene

This component is the bridge between the pure terrain systems and the live WebGPU scene.

## What it owns

- WebGPU renderer setup.
- Terrain material loading.
- Worker pool lifetime.
- Planet chunk diffing and chunk request priority.
- Inspect mode and fly mode.
- Floating origin updates.
- Small debug helpers used during development.

## Why it is structured this way

- The pure terrain math stays in `src/lib/terrain`. That makes the hard logic testable with Vitest.
- The scene layer only handles integration work. Camera state. Mesh lifetime. Material binding. Runtime debug checks.
- Loaded chunks keep the origin they were built with. That lets the floating origin move without instantly invalidating every mesh already on screen.
- A low detail continuous underlay shell sits below the streamed chunks. This hides small seam gaps when looking at the whole planet from far away.

## Camera modes

`Inspect`.

- Starts outside the planet.
- Uses orbit controls.
- Best for checking whole planet shape and LOD transitions.

`Fly`.

- Starts near the surface.
- Uses pointer lock controls.
- Best for ground scale and streaming feel.

## Runtime debug hook

`window.__terrainDebug` is intentionally small and temporary feeling.

It exists so we can verify chunk count and SharedArrayBuffer usage in a real browser session without guessing from code alone.
