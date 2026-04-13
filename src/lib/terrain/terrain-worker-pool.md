# Terrain Worker Pool

This file explains the worker path used by batch two.

## What it does

`terrain-worker-pool.ts` owns a small pool of long lived workers.

Each request sends simple chunk build options to a free worker.

The worker rebuilds the chunk buffers off the main thread and posts the result back.

## Why it is optimized

- We reuse workers instead of spawning a new worker per chunk.
- The default worker count is capped to `navigator.hardwareConcurrency - 1` with a max of `7`. That matches the batch two target without flooding the machine.
- Requests are queued and pumped into free workers. This keeps the system busy without blocking rendering.
- The worker now asks `generateTerrainChunkBuffers` for `SharedArrayBuffer` backed arrays. When cross origin isolation is active the returned chunk data is shareable without the normal copy cost.

## Why the scene still stores geometry separately

The worker returns raw typed arrays. The scene turns those arrays into Three `BufferGeometry`.

That keeps the worker side simple and keeps Three specific objects on the main thread where they belong.

## Debugging note

`window.__terrainDebug` is written from the scene layer and includes how many loaded chunks were confirmed as SharedArrayBuffer backed at runtime.
