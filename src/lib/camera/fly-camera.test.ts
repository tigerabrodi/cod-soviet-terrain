import { describe, expect, it } from 'vitest'
import { PLANET_RADIUS } from '@/lib/terrain/terrain-planet'
import { samplePlanetTerrainHeight } from '@/lib/terrain/terrain-chunk'
import {
  applyFlyLook,
  createInitialFlyCameraState,
  stepFlyCamera,
} from './fly-camera'

describe('createInitialFlyCameraState', () => {
  it('spawns above the terrain shell with a finite forward vector', () => {
    const flyState = createInitialFlyCameraState()
    const length = Math.hypot(
      flyState.position.x,
      flyState.position.y,
      flyState.position.z
    )
    const up = {
      x: flyState.position.x / length,
      y: flyState.position.y / length,
      z: flyState.position.z / length,
    }
    const terrainRadius =
      PLANET_RADIUS +
      samplePlanetTerrainHeight(
        up.x * PLANET_RADIUS,
        up.y * PLANET_RADIUS,
        up.z * PLANET_RADIUS
      )

    expect(length).toBeGreaterThan(terrainRadius + 11.5)
    expect(
      Math.hypot(flyState.forward.x, flyState.forward.y, flyState.forward.z)
    ).toBeCloseTo(1, 5)
  })
})

describe('applyFlyLook', () => {
  it('rotates the forward vector without producing invalid values', () => {
    const initialState = createInitialFlyCameraState()
    const rotatedState = applyFlyLook(initialState, {
      deltaX: 180,
      deltaY: -90,
    })

    expect(Number.isFinite(rotatedState.forward.x)).toBe(true)
    expect(Number.isFinite(rotatedState.forward.y)).toBe(true)
    expect(Number.isFinite(rotatedState.forward.z)).toBe(true)
    expect(rotatedState.forward).not.toEqual(initialState.forward)
    expect(
      Math.hypot(
        rotatedState.forward.x,
        rotatedState.forward.y,
        rotatedState.forward.z
      )
    ).toBeCloseTo(1, 5)
  })

  it('clamps vertical look so the camera never aligns exactly with the up axis', () => {
    const initialState = createInitialFlyCameraState()
    const rotatedState = applyFlyLook(initialState, {
      deltaX: 0,
      deltaY: -100000,
    })
    const up = {
      x:
        rotatedState.position.x /
        Math.hypot(
          rotatedState.position.x,
          rotatedState.position.y,
          rotatedState.position.z
        ),
      y:
        rotatedState.position.y /
        Math.hypot(
          rotatedState.position.x,
          rotatedState.position.y,
          rotatedState.position.z
        ),
      z:
        rotatedState.position.z /
        Math.hypot(
          rotatedState.position.x,
          rotatedState.position.y,
          rotatedState.position.z
        ),
    }
    const dot =
      rotatedState.forward.x * up.x +
      rotatedState.forward.y * up.y +
      rotatedState.forward.z * up.z

    expect(Math.abs(dot)).toBeLessThan(0.97)
  })

  it('looks upward when the mouse moves upward', () => {
    const initialState = createInitialFlyCameraState()
    const initialRadius = Math.hypot(
      initialState.position.x,
      initialState.position.y,
      initialState.position.z
    )
    const up = {
      x: initialState.position.x / initialRadius,
      y: initialState.position.y / initialRadius,
      z: initialState.position.z / initialRadius,
    }
    const lookedUpState = applyFlyLook(initialState, {
      deltaX: 0,
      deltaY: -120,
    })
    const initialDot =
      initialState.forward.x * up.x +
      initialState.forward.y * up.y +
      initialState.forward.z * up.z
    const lookedUpDot =
      lookedUpState.forward.x * up.x +
      lookedUpState.forward.y * up.y +
      lookedUpState.forward.z * up.z

    expect(lookedUpDot).toBeGreaterThan(initialDot)
  })
})

describe('stepFlyCamera', () => {
  it('moves tangentially across the planet and keeps terrain clearance', () => {
    const initialState = createInitialFlyCameraState()
    const nextState = stepFlyCamera(
      initialState,
      {
        boost: false,
        forward: 1,
        lift: 0,
        strafe: 0,
      },
      1 / 60
    )

    expect(nextState.position).not.toEqual(initialState.position)
    expect(nextState.speed).toBeGreaterThan(0)

    const radius = Math.hypot(
      nextState.position.x,
      nextState.position.y,
      nextState.position.z
    )
    const up = {
      x: nextState.position.x / radius,
      y: nextState.position.y / radius,
      z: nextState.position.z / radius,
    }
    const terrainRadius =
      PLANET_RADIUS +
      samplePlanetTerrainHeight(
        up.x * PLANET_RADIUS,
        up.y * PLANET_RADIUS,
        up.z * PLANET_RADIUS
      )

    expect(radius).toBeGreaterThan(terrainRadius + 7.5)
  })

  it('moves faster while boost is held', () => {
    const initialState = createInitialFlyCameraState()
    const cruisingState = stepFlyCamera(
      initialState,
      {
        boost: false,
        forward: 1,
        lift: 0,
        strafe: 0,
      },
      1 / 6
    )
    const boostedState = stepFlyCamera(
      initialState,
      {
        boost: true,
        forward: 1,
        lift: 0,
        strafe: 0,
      },
      1 / 6
    )

    expect(boostedState.speed).toBeGreaterThan(cruisingState.speed + 20)
  })
})
