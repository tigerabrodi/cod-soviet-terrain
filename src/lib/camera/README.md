# Camera Systems

This folder owns the pure fly camera math.

## Files

- `fly-camera.ts`. Pure spawn. mouse look. and movement stepping for the fly camera.
- `fly-camera.test.ts`. TDD coverage for spawn safety. look clamping. boost speed. and terrain clearance.

## Why it is structured this way

The camera feel work has two parts.

- Pure movement math that should stay predictable and testable.
- Scene integration that needs real browser input and Three camera objects.

So the split is simple.

- Pure camera rules in this folder.
- Live input wiring in `src/components/terrain-scene.tsx`.

## What the fly camera does

- Starts above the terrain shell at a deterministic spawn point.
- Rotates around the local planet up axis for yaw.
- Rotates around the local camera right axis for pitch.
- Clamps pitch so the forward vector never collapses into the up axis.
- Moves on the tangent plane for `WASD`.
- Moves radially for `Q` and `E`.
- Boosts speed with `Shift`.
- Preserves a minimum terrain clearance so the camera does not dip below the generated surface.

## Why this is optimized

- The math is tiny and branch light.
- The runtime keeps the camera state in refs. It does not rebuild terrain data on every frame.
- The render origin moves with the camera so local scene coordinates stay small.
