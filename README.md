# COD Soviet Terrain

COD Soviet Terrain is a focused WebGPU terrain sandbox.

The project goal is simple.

- Build a planet scale terrain scene.
- Make it fast.
- Keep the code easy to study.
- Keep the rendering path modern and practical.

This repo is not trying to be a full game right now.

It is a terrain and rendering project first.

That is why the player character was removed.

The current product is two strong modes.

- Inspect mode for shape. streaming. and LOD work.
- Fly mode for close terrain passes and scale checks.

## Stack

- React.
- TanStack Router.
- Vite.
- Bun.
- TypeScript.
- Tailwind.
- Three.js.
- React Three Fiber.
- WebGPU through `three/webgpu`.
- TSL node materials.

## What the app does

The app renders a cube sphere planet with procedural terrain.

The terrain is streamed in chunks around the current camera focus.

Near the camera. chunks are dense.

Far from the camera. chunks are coarse.

This keeps the scene detailed where it matters and cheaper where it does not.

The terrain material blends four PBR surfaces.

- Scorched ground.
- Frozen muddy earth.
- Rocky rubble.
- Frost snow.

The blend is driven by terrain height and slope.

Low and flat zones lean scorched.

Mid and flat zones lean frozen mud.

High and flat zones lean frost snow.

Steep zones pull in rocky rubble at any height.

This gives the planet a worn. cold. patina heavy surface language. It reads well from orbit and from a low fly pass.

## Why the rendering path is modern

The project uses `three/webgpu` for the rendering backend.

The terrain material is written with TSL nodes. not raw GLSL or WGSL.

That matters for two reasons.

- The material graph stays inside the Three.js WebGPU model.
- The code is easier to port forward as the WebGPU node stack improves.

This repo is trying to be a practical WebGPU reference. not a one off shader experiment.

## Terrain generation

The terrain shape comes from layered procedural noise.

There is broad shape noise.

There is detail noise.

There is ridge noise.

There is crater shaping.

Those layers are combined into one sampled terrain height.

The same sampling rules are used across chunk borders. That keeps neighboring chunks aligned in world space.

The runtime then computes splat weights from the final height and the local surface flatness.

## Chunk streaming and LOD

The planet uses a cube sphere layout.

Each face participates in the streamed chunk window.

The selector uses a quadtree style subdivision pattern.

Near the camera. the selector asks for smaller chunks with higher vertex density.

Far away. it asks for larger chunks with lower density.

Mixed LOD borders use two protections.

- Edge morphing.
- Skirts.

Edge morphing helps stop visible cracks when one chunk is denser than its neighbor.

Skirts give a cheap visual seal under the edge.

This is a common terrain trick. It is simple. robust. and fast.

## Worker pipeline

Chunk generation does not run on the main thread.

It runs in workers.

That means camera movement. UI. and rendering stay responsive while new geometry is built.

This is one of the biggest practical wins in the project.

Without workers. streamed terrain tends to hitch.

With workers. the app feels much smoother.

## SharedArrayBuffer

The worker path is ready for serious throughput.

Chunk data is produced with `SharedArrayBuffer` when cross origin isolation is available.

That matters because it avoids the usual copy heavy return path between workers and the main thread.

In plain language.

- Less copying.
- Less memory churn.
- Better scaling as chunk count grows.

The repo includes the header setup needed for that mode during local development and preview.

## Floating origin

Large world movement causes precision problems if you let local scene coordinates grow forever.

This project avoids that with a floating origin render setup.

The camera can move through the world while the rendered scene stays near a small local coordinate range.

That helps camera stability. chunk stability. and long range traversal.

## Texture pipeline and KTX2

The terrain textures are stored as KTX2 assets in `public/textures`.

That is an intentional optimization choice.

KTX2 gives compressed GPU friendly texture storage.

That means less VRAM pressure and smaller upload cost than raw loose textures.

Each terrain material has five maps.

- Base color.
- Normal.
- Roughness.
- Metalness.
- Height.

At runtime. the loader packs them into compressed texture arrays.

That lets the terrain material sample a compact material stack instead of managing many separate texture bindings.

The snowflake particle texture also uses KTX2 for the same reason.

## Triplanar material

The terrain material uses triplanar sampling.

That solves a very common terrain problem.

Steep slopes stretch normal UV mapping badly.

Triplanar sampling blends the texture from the main axes instead.

The result is much more stable on cliffs and harsh angles.

This is especially useful on a planet where slope direction changes constantly.

## Snow system

Snow is handled as a GPU driven particle field.

The CPU builds seed buffers once.

The GPU handles the live falling motion.

The snow volume follows the camera instead of trying to simulate weather over the whole planet.

That keeps density high near the viewer and keeps the runtime cost under control.

## Sky and lighting

The project uses a cold overcast sky dome and a sky environment map.

This gives the terrain soft broad light and a muted war torn atmosphere.

The goal is not a bright fantasy world.

The goal is a heavy. weathered. Eastern front style surface language.

## Camera modes

### Inspect

Use Inspect when you want to study the whole planet.

Controls.

- Drag to orbit.
- Scroll to zoom.

### Fly

Use Fly when you want to skim over the terrain and feel the scale.

Controls.

- Click the scene to lock the pointer.
- Move the mouse to look.
- `WASD` to move.
- `Q` and `E` to move down and up.
- Hold `Shift` to boost.
- `Esc` to unlock the pointer.

The fly controller keeps a minimum terrain clearance floor. So it does not accidentally sink below the planet surface.

## Project structure

- `src/lib/terrain`: pure terrain math. chunk generation. workers. textures. material.
- `src/lib/camera`: pure fly camera math and tests.
- `src/components/terrain-scene.tsx`: scene integration and mode switching.
- `src/components/fly-camera-controller.tsx`: browser input bridge for fly mode.
- `src/lib/weather`: snow particle buffers and snow texture loading.
- `src/lib/sky`: sky dome and environment setup.

## Testing philosophy

This repo uses TDD where it makes real sense.

That means pure logic gets tests first.

Examples.

- Chunk selection.
- Chunk mesh generation.
- Splat weighting.
- Fly camera math.
- Snow particle seed generation.

Browser integration and visual rendering are still checked in a real browser. because those parts are not good fits for mock heavy tests.

## Why this repo can be useful to other people

Many terrain demos stop at one cool screenshot.

This repo tries to go further.

It shows how to combine.

- WebGPU.
- TSL.
- worker based terrain generation.
- SharedArrayBuffer.
- KTX2 texture compression.
- floating origin rendering.
- practical chunk streaming.

All in one small project that is still readable.

## Local docs

- Terrain streaming and chunk generation. `src/lib/terrain/README.md`
- Scene integration and modes. `src/components/terrain-scene.md`
- Fly camera math. `src/lib/camera/README.md`
- Fly controller runtime bridge. `src/components/fly-camera-controller.md`
- Weather and snow particles. `src/lib/weather/README.md`
- Sky and environment lighting. `src/lib/sky/README.md`
