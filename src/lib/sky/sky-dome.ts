import { BufferAttribute, Color, SphereGeometry } from 'three'

const HORIZON_COLOR = new Color('#d2d0ca')
const MID_SKY_COLOR = new Color('#9aa3ab')
const ZENITH_COLOR = new Color('#6c7783')

export function createSkyDomeGeometry() {
  const geometry = new SphereGeometry(2800, 48, 32)
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)

  for (let index = 0; index < positions.count; index += 1) {
    const radius = Math.hypot(
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index)
    )
    const height01 = clamp((positions.getY(index) / radius) * 0.5 + 0.5, 0, 1)
    const gradientColor = sampleSkyGradientColor(height01)
    const colorOffset = index * 3

    colors[colorOffset] = gradientColor.r
    colors[colorOffset + 1] = gradientColor.g
    colors[colorOffset + 2] = gradientColor.b
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))

  return geometry
}

export function sampleSkyGradientColor(height01: number) {
  const lowerBlend = clamp(height01 * 1.7, 0, 1)
  const upperBlend = clamp((height01 - 0.36) / 0.64, 0, 1)
  const lowerColor = HORIZON_COLOR.clone().lerp(MID_SKY_COLOR, lowerBlend)

  return lowerColor.lerp(ZENITH_COLOR, upperBlend)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
