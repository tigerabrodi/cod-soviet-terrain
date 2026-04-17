# Terrain Scene Streaming

This file owns the terrain runtime scheduling policy.

## What it does

- Keeps the terrain worker pool alive.
- Prioritizes chunks by LOD level and distance.
- Prefetches more aggressively for fast fly movement.
- Caps how many worker requests can be in flight.
- Queues finished worker results before React sees them.
- Flushes only a small chunk batch per frame.
- Keeps the last chunk generation alive briefly during handoff.

## Why it matters

Streaming terrain usually fails in one of two ways.

- Too much work starts at once.
- Too many finished chunks get committed at once.

The first problem burns CPU.

The second problem causes frame spikes on the main thread.

This file smooths both sides.

Workers are limited so the CPU does not stampede.

Finished chunks are queued and drip fed into React over multiple frames.

That gives steadier frame pacing than letting every worker result commit immediately.

Old chunk generations are also kept around for a short lag window.

That matters when the camera moves fast.

Without that retention. a hole can appear while the next chunk generation is still in flight.

With retention. the old terrain stays visible long enough for the new chunk to land.
