# Sky Environment

`sky-environment.ts` loads `/public/skybox.exr` with `EXRLoader` and turns it into a PMREM environment texture.

## Important details

- The loader uses `HalfFloatType` to keep HDR precision without the heavier full float path.
- The environment is cached in a `WeakMap` by renderer instance.
- `PMREMGenerator` is used once per renderer to create the roughness aware environment texture that PBR materials expect.

## Why this matters

Raw HDR textures are not enough for physically based reflections.

PMREM prefilters the environment so rough materials and glossy materials both sample the sky correctly.

That is the reason the terrain now picks up colder ambient light and better specular response without any extra custom shader work.
