# Snow Accumulation

This module owns the ground snow simulation.

## Mental model

The falling snowflakes are visual only.

The actual ground coverage is a separate per chunk field.

Each terrain vertex stores one snow number.

- `0` means no accumulated snow.
- `1` means fully covered.

The terrain material reads that value and decides how much the ground should whiten. soften. and lose rocky detail.

## Why this is the right split

Trying to make every snowflake hit the ground and change the terrain would be the wrong level of simulation for this project.

It would be expensive. noisy. and hard to scale across streamed planet terrain.

So the architecture is split on purpose.

- Particles sell the storm.
- The accumulation field stores the actual snow state.
- The terrain material turns that state into final appearance.

## Why it is GPU driven

The accumulation update runs as a compute step through the WebGPU renderer.

That means we do not loop over every terrain vertex on the CPU every frame.

Instead we upload the stable chunk data once.

- Surface support.
- Terrain height.
- Terrain world coordinates.

Then the compute pass updates the live snow coverage buffer directly on the GPU.

## What the simulation uses

The update rule is intentionally simple and stable.

It looks at.

- snowfall intensity.
- local flatness support.
- terrain height.
- a shelter noise term aligned to wind direction.
- the previous snow amount.

Then it adds deposition and subtracts melt. sliding. and wind exposure.

That gives a convincing result without pretending to be a full fluid simulation.

## Why it is per chunk

The terrain is already streamed and managed in chunks.

So snow accumulation follows the same ownership model.

That keeps the system aligned with the quadtree and worker pipeline.

When a chunk is rebuilt. its snow state can be recreated against the new terrain data.

## What is not in scope yet

- No true mesh displacement from snow depth yet.
- No persistent save file for snow state.
- No global planet wide snow history far away from active chunks.

Those are possible future stages.

The current stage is the good practical version.

- visually convincing.
- GPU friendly.
- easy to tune from the debug panel.
