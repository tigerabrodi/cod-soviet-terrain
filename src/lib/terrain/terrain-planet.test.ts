import { describe, expect, it } from 'vitest'
import {
  PLANET_RADIUS,
  filterVisiblePlanetChunks,
  getCubeFacePoint,
  getPlanetPointOnFace,
  getPlanetChunkEdgeMorphs,
  selectPlanetChunkWindow,
} from './terrain-planet'

describe('getCubeFacePoint', () => {
  it('matches adjacent cube face edges before sphere projection', () => {
    expect(
      getCubeFacePoint('positive-z', PLANET_RADIUS, 24, PLANET_RADIUS)
    ).toEqual(getCubeFacePoint('positive-x', -PLANET_RADIUS, 24, PLANET_RADIUS))
    expect(
      getCubeFacePoint('positive-y', 48, -PLANET_RADIUS, PLANET_RADIUS)
    ).toEqual(getCubeFacePoint('positive-z', 48, PLANET_RADIUS, PLANET_RADIUS))
  })
})

describe('selectPlanetChunkWindow', () => {
  it('returns mixed lod leaves across cube faces near the camera', () => {
    const chunkWindow = selectPlanetChunkWindow(
      { x: 0, y: 0, z: PLANET_RADIUS + 24 },
      [64, 32, 16]
    )

    const lodLevels = new Set(chunkWindow.map((chunk) => chunk.lodLevel))
    const faces = new Set(chunkWindow.map((chunk) => chunk.face))

    expect(chunkWindow.length).toBeGreaterThan(20)
    expect(lodLevels).toEqual(new Set([0, 1, 2]))
    expect(faces).toEqual(
      new Set([
        'negative-x',
        'negative-y',
        'negative-z',
        'positive-x',
        'positive-y',
        'positive-z',
      ])
    )

    expect(
      chunkWindow.find(
        (chunk) => chunk.face === 'positive-z' && chunk.lodLevel === 0
      )
    ).toMatchObject({
      face: 'positive-z',
      lodLevel: 0,
      resolution: 64,
    })

    expect(
      chunkWindow.find(
        (chunk) => chunk.face === 'negative-z' && chunk.lodLevel === 2
      )
    ).toMatchObject({
      face: 'negative-z',
      lodLevel: 2,
      resolution: 16,
    })
  })
})

describe('getPlanetChunkEdgeMorphs', () => {
  it('marks edges that border coarser neighbors on the same face', () => {
    const edgeMorphs = getPlanetChunkEdgeMorphs([
      {
        centerX: 90,
        centerY: -90,
        face: 'positive-y',
        key: 'fine-center',
        lodLevel: 0,
        resolution: 64,
        size: 180,
        sphereCenter: { x: 0, y: PLANET_RADIUS, z: 0 },
      },
      {
        centerX: 360,
        centerY: 0,
        face: 'positive-y',
        key: 'coarse-east',
        lodLevel: 1,
        resolution: 32,
        size: 360,
        sphereCenter: { x: 0, y: PLANET_RADIUS, z: 0 },
      },
      {
        centerX: -180,
        centerY: 0,
        face: 'positive-y',
        key: 'coarse-west',
        lodLevel: 1,
        resolution: 32,
        size: 360,
        sphereCenter: { x: 0, y: PLANET_RADIUS, z: 0 },
      },
      {
        centerX: 90,
        centerY: 180,
        face: 'positive-y',
        key: 'coarse-south',
        lodLevel: 1,
        resolution: 32,
        size: 360,
        sphereCenter: { x: 0, y: PLANET_RADIUS, z: 0 },
      },
      {
        centerX: 90,
        centerY: -360,
        face: 'positive-y',
        key: 'coarse-north',
        lodLevel: 1,
        resolution: 32,
        size: 360,
        sphereCenter: { x: 0, y: PLANET_RADIUS, z: 0 },
      },
    ])

    expect(edgeMorphs.get('fine-center')).toEqual({
      east: 1,
      north: 1,
      south: 1,
      west: 1,
    })
    expect(edgeMorphs.get('coarse-east')).toEqual({
      east: 0,
      north: 0,
      south: 0,
      west: 0,
    })
  })
})

describe('filterVisiblePlanetChunks', () => {
  it('filters fine chunks that are behind the current camera view', () => {
    const visibleChunks = filterVisiblePlanetChunks(
      [
        {
          centerX: 90,
          centerY: 0,
          face: 'positive-z',
          key: 'ahead-fine',
          lodLevel: 0,
          resolution: 64,
          size: 180,
          sphereCenter: getPlanetPointOnFace('positive-z', 90, 0),
        },
        {
          centerX: -180,
          centerY: 0,
          face: 'positive-z',
          key: 'behind-fine',
          lodLevel: 0,
          resolution: 64,
          size: 180,
          sphereCenter: getPlanetPointOnFace('positive-z', -180, 0),
        },
        {
          centerX: -180,
          centerY: 0,
          face: 'positive-z',
          key: 'behind-coarse',
          lodLevel: 1,
          resolution: 32,
          size: 360,
          sphereCenter: getPlanetPointOnFace('positive-z', -180, 0),
        },
      ],
      {
        cameraAspect: 16 / 9,
        cameraForwardWorld: { x: 1, y: 0, z: 0 },
        cameraVerticalFovDegrees: 38,
        cameraWorldPosition: { x: 0, y: 0, z: PLANET_RADIUS + 24 },
      }
    )

    expect(visibleChunks.map((chunk) => chunk.key)).toEqual([
      'ahead-fine',
      'behind-coarse',
    ])
  })

  it('culls chunks that are fully beyond the planet horizon', () => {
    const visibleChunks = filterVisiblePlanetChunks(
      [
        {
          centerX: 0,
          centerY: 0,
          face: 'positive-z',
          key: 'near-side',
          lodLevel: 0,
          resolution: 64,
          size: 180,
          sphereCenter: getPlanetPointOnFace('positive-z', 0, 0),
        },
        {
          centerX: 0,
          centerY: 0,
          face: 'negative-z',
          key: 'far-side',
          lodLevel: 2,
          resolution: 16,
          size: 720,
          sphereCenter: getPlanetPointOnFace('negative-z', 0, 0),
        },
      ],
      {
        cameraAspect: 16 / 9,
        cameraForwardWorld: { x: 1, y: 0, z: 0 },
        cameraVerticalFovDegrees: 38,
        cameraWorldPosition: { x: 0, y: 0, z: PLANET_RADIUS + 24 },
      }
    )

    expect(visibleChunks.map((chunk) => chunk.key)).toEqual(['near-side'])
  })
})
