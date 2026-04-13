# Snow Particles

This component renders the live snowfall layer.

## How it works

- It creates one instanced sprite field.
- Each particle gets a seeded anchor position and a few random control values.
- The GPU uses those seed values with TSL time math to make flakes fall. drift sideways. and spin.
- The whole snow volume follows the camera so the effect stays dense where the player is.

## Why this is a good fit for WebGPU

This is exactly the kind of workload that should stay on the GPU.

The CPU only does three small things.

- Build the seed buffers once.
- Load the compressed snowflake texture.
- Move the particle volume with the camera.

The GPU does the expensive repeated work every frame.

- Per particle fall animation.
- Side drift.
- Spin.
- Billboard rendering through the sprite material path.

## Why it is optimized

- No per frame CPU loop over thousands of flakes.
- KTX2 alpha texture keeps the particle art compact.
- Instanced sprite rendering keeps draw overhead low.
- The effect stays local to the camera instead of pretending to simulate global weather.
