# Terrain Debug Panel

This panel exists to make the terrain sandbox easier to study.

## What it controls

- Terrain generation strength values.
- Terrain material response values.
- Dead tree density. size. and LOD range.
- Snow and weather values.
- Ground snow accumulation rate. melt rate. wind loss. and visual strength.
- Lighting and fog values.

## Why it is useful

- Terrain generation now runs through workers and a runtime settings object. That means the panel can rebuild real chunk data instead of faking a UI only preview.
- Weather and lighting can be tuned live without touching source files.
- The stats row shows chunk count. triangle count. SharedArrayBuffer chunk count. and the current quadtree LOD split.

## Why the UI is small

- It is meant for tuning and learning. not for being part of the core art direction.
- The panel defaults to a compact footprint and can be collapsed so the terrain still owns the screen.
