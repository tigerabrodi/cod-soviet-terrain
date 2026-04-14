# Terrain Trees

This component is the live bridge between the dead tree data and the running scene.

## What it owns

- Bark texture loading through the shared KTX2 loader.
- Shared dead tree geometry lifetime.
- Shared bark material lifetime.
- Per chunk instance transform generation.
- Instanced mesh rendering for visible dead trees.

## Why it is structured this way

- The placement rules live in the vegetation library so they can be tested.
- The scene component only handles the WebGPU facing part. geometry. material. and instanced meshes.
- Each visible chunk gets its own instance set. That keeps the tree system aligned with terrain chunk lifetime and floating origin behavior.

## Why this is optimized

- Trees are instanced. so we do not create a full mesh object per tree.
- The bark material is shared. not rebuilt for every chunk.
- The bark textures are KTX2 and loaded once through the shared loader cache.
- Tree placement is deterministic. so we do not waste time regenerating unstable random layouts.
- Trees only appear on nearer chunk levels by default. That keeps the barren war torn look and avoids paying for tiny far distance trees that do not matter.
