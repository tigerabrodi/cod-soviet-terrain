# Fly Camera Controller

This component is the runtime bridge between browser input and the pure fly camera math.

## What it owns

- Pointer lock hookup.
- Keyboard input for `WASD`, `Q`, `E`, and `Shift`.
- Mouse look hookup.
- Writing the latest render origin into a ref.
- Updating the streamed terrain focus point only when the camera has moved far enough.

## Why this exists as a separate component

The pure camera math should stay testable and deterministic.

The browser input path is not pure. It depends on DOM events. pointer lock. and a live Three camera.

So the split is.

- Pure fly math in `src/lib/camera`.
- Real browser input wiring here.

## Why it is optimized

- The hot path lives in refs. Not React state.
- The camera can move every frame without forcing a full React rerender of the terrain scene.
- The chunk focus state only updates after a real travel threshold. That avoids pointless chunk diff work.
