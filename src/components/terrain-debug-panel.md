# Terrain Debug Panel

This panel exists to make the terrain sandbox easier to study.

## What it controls

- Terrain generation presets. seed. strength values. and scale values.
- Terrain material response values.
- Snow and weather values.
- Ground snow accumulation rate. melt rate. wind loss. and visual strength.
- Performance controls like wireframe terrain and render scale.
- Lighting and fog values.

## Why it is useful

- Terrain generation now runs through workers and a runtime settings object. That means the panel can rebuild real chunk data instead of faking a UI only preview.
- Terrain presets let you jump between very different landform families quickly. The seed then remixes the same preset into a different version without changing the overall style.
- Weather and lighting can be tuned live without touching source files.
- The stats row shows fps. frame time. terrain triangle count. draw calls. geometry and texture counts. and live chunk queue pressure.
- The performance section exposes the current LOD split. SharedArrayBuffer chunk count. and active snow state count.

## Why the UI now opens by default

- The terrain shape controls are one of the main reasons this sandbox exists.
- The panel can still be collapsed. but it now starts open so the terrain lab controls are not hidden on first load.
