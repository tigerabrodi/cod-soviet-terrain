# Debug Runtime

This folder holds the small runtime settings model behind the debug panel.

## What lives here

- Default debug values.
- Safe clamps for live sliders.
- Storage parsing for local persistence.
- Small helpers such as the live snow particle count.

## Why this exists

- The panel should drive real runtime systems. not random component local state.
- Keeping the settings logic pure makes it easy to test.
- The route layer can store and restore user tweaks without mixing parsing logic into UI code.
