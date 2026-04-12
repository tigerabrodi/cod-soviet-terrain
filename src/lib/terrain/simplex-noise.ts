/*
 * Adapted from the SimonDev reference project and the Jonas Wagner simplex noise implementation.
 * Only the seeded 3D path needed by this terrain slice is kept here.
 */

type RandomSource = (() => number) | string | undefined

const F3 = 1 / 3
const G3 = 1 / 6

const GRADIENTS_3D = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0,
  -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
])

function createMasher() {
  let state = 0xefc8249d

  return (value: string) => {
    let hash = state

    for (let index = 0; index < value.length; index += 1) {
      hash += value.charCodeAt(index)

      let temp = 0.02519603282416938 * hash
      hash = temp >>> 0
      temp -= hash
      temp *= hash
      hash = temp >>> 0
      temp -= hash
      hash += temp * 0x1_0000_0000
    }

    state = hash >>> 0
    return (state >>> 0) * 2.3283064365386963e-10
  }
}

function createAlea(seed: string) {
  const mash = createMasher()

  let s0 = mash(' ')
  let s1 = mash(' ')
  let s2 = mash(' ')
  let carry = 1

  s0 -= mash(seed)
  if (s0 < 0) s0 += 1

  s1 -= mash(seed)
  if (s1 < 0) s1 += 1

  s2 -= mash(seed)
  if (s2 < 0) s2 += 1

  return () => {
    const t = 2_091_639 * s0 + carry * 2.3283064365386963e-10

    s0 = s1
    s1 = s2
    s2 = t - (carry = t | 0)

    return s2
  }
}

function createPermutationTable(random: () => number) {
  const table = new Uint8Array(256)

  for (let index = 0; index < table.length; index += 1) {
    table[index] = index
  }

  for (let index = 0; index < table.length - 1; index += 1) {
    const swapIndex = index + Math.floor(random() * (256 - index))
    const current = table[index]
    table[index] = table[swapIndex]
    table[swapIndex] = current
  }

  return table
}

function resolveRandomSource(randomOrSeed: RandomSource) {
  if (typeof randomOrSeed === 'function') {
    return randomOrSeed
  }

  if (typeof randomOrSeed === 'string' && randomOrSeed.length > 0) {
    return createAlea(randomOrSeed)
  }

  return Math.random
}

export class SimplexNoise {
  private readonly perm: Uint8Array
  private readonly permMod12: Uint8Array

  public constructor(randomOrSeed?: RandomSource) {
    const random = resolveRandomSource(randomOrSeed)
    const permutation = createPermutationTable(random)

    this.perm = new Uint8Array(512)
    this.permMod12 = new Uint8Array(512)

    for (let index = 0; index < 512; index += 1) {
      this.perm[index] = permutation[index & 255]
      this.permMod12[index] = this.perm[index] % 12
    }
  }

  public noise3D(x: number, y: number, z: number) {
    const skew = (x + y + z) * F3

    const skewedX = Math.floor(x + skew)
    const skewedY = Math.floor(y + skew)
    const skewedZ = Math.floor(z + skew)

    const unskew = (skewedX + skewedY + skewedZ) * G3

    const cellX = skewedX - unskew
    const cellY = skewedY - unskew
    const cellZ = skewedZ - unskew

    const localX = x - cellX
    const localY = y - cellY
    const localZ = z - cellZ

    let corner1X = 0
    let corner1Y = 0
    let corner1Z = 0
    let corner2X = 0
    let corner2Y = 0
    let corner2Z = 0

    if (localX >= localY) {
      if (localY >= localZ) {
        corner1X = 1
        corner2X = 1
        corner2Y = 1
      } else if (localX >= localZ) {
        corner1X = 1
        corner2X = 1
        corner2Z = 1
      } else {
        corner1Z = 1
        corner2X = 1
        corner2Z = 1
      }
    } else if (localY < localZ) {
      corner1Z = 1
      corner2Y = 1
      corner2Z = 1
    } else if (localX < localZ) {
      corner1Y = 1
      corner2Y = 1
      corner2Z = 1
    } else {
      corner1Y = 1
      corner2X = 1
      corner2Y = 1
    }

    const offset1X = localX - corner1X + G3
    const offset1Y = localY - corner1Y + G3
    const offset1Z = localZ - corner1Z + G3

    const offset2X = localX - corner2X + 2 * G3
    const offset2Y = localY - corner2Y + 2 * G3
    const offset2Z = localZ - corner2Z + 2 * G3

    const offset3X = localX - 1 + 3 * G3
    const offset3Y = localY - 1 + 3 * G3
    const offset3Z = localZ - 1 + 3 * G3

    const cellIndexX = skewedX & 255
    const cellIndexY = skewedY & 255
    const cellIndexZ = skewedZ & 255

    const contribution0 = this.getCornerContribution(
      cellIndexX,
      cellIndexY,
      cellIndexZ,
      localX,
      localY,
      localZ
    )
    const contribution1 = this.getCornerContribution(
      cellIndexX + corner1X,
      cellIndexY + corner1Y,
      cellIndexZ + corner1Z,
      offset1X,
      offset1Y,
      offset1Z
    )
    const contribution2 = this.getCornerContribution(
      cellIndexX + corner2X,
      cellIndexY + corner2Y,
      cellIndexZ + corner2Z,
      offset2X,
      offset2Y,
      offset2Z
    )
    const contribution3 = this.getCornerContribution(
      cellIndexX + 1,
      cellIndexY + 1,
      cellIndexZ + 1,
      offset3X,
      offset3Y,
      offset3Z
    )

    return 32 * (contribution0 + contribution1 + contribution2 + contribution3)
  }

  private getCornerContribution(
    xIndex: number,
    yIndex: number,
    zIndex: number,
    x: number,
    y: number,
    z: number
  ) {
    let attenuation = 0.6 - x * x - y * y - z * z

    if (attenuation < 0) {
      return 0
    }

    const gradientIndex =
      this.permMod12[xIndex + this.perm[yIndex + this.perm[zIndex]]] * 3

    attenuation *= attenuation

    return (
      attenuation *
      attenuation *
      (GRADIENTS_3D[gradientIndex] * x +
        GRADIENTS_3D[gradientIndex + 1] * y +
        GRADIENTS_3D[gradientIndex + 2] * z)
    )
  }
}
