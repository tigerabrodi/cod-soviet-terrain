# Sky Systems

This folder owns the batch three sky and atmosphere pieces.

## Files

- `sky-environment.ts`. Loads the EXR sky asset and builds the PMREM environment map.
- `sky-dome.ts`. Builds the visible cold sky dome gradient.
- `sky-dome.test.ts`. Small pure tests for the gradient and geometry attributes.

## Why it is split this way

The EXR is great for lighting. It gives the terrain real image based ambient light.

The EXR asset is not ideal as the literal visible background in every direction. It contains too much ground detail. That made the inspect and fly views look wrong.

So the final batch three setup does this.

- EXR for `scene.environment`.
- Lightweight procedural sky dome for what the player actually sees.

This gives better visuals and keeps the lighting physically grounded.

## Why this is optimized

- The EXR is loaded once and cached per renderer.
- PMREM is generated once and reused.
- The visible sky dome is just one `SphereGeometry` with vertex colors and a basic material.
- The sky dome follows the camera so it never needs giant world coordinates or frequent rebuilds.

## Batch three result

The world now has a cold overcast sky look.

The terrain gets image based ambient lighting from the EXR.

Distance haze is handled by scene fog tuned to the sky colors.
