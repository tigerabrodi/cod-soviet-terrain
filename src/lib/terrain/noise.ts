import { SimplexNoise } from './simplex-noise'

export interface NoiseOptions {
  exponentiation: number
  height: number
  lacunarity: number
  octaves: number
  persistence: number
  scale: number
  seed: string
}

export class NoiseGenerator {
  private readonly options: NoiseOptions
  private readonly noise: SimplexNoise

  public constructor(options: NoiseOptions) {
    this.options = options
    this.noise = new SimplexNoise(options.seed)
  }

  public get(x: number, y: number, z: number) {
    const gain = 2 ** -this.options.persistence
    const scaledX = x / this.options.scale
    const scaledY = y / this.options.scale
    const scaledZ = z / this.options.scale

    let amplitude = 1
    let frequency = 1
    let normalization = 0
    let total = 0

    for (let octave = 0; octave < this.options.octaves; octave += 1) {
      const noiseValue =
        this.noise.noise3D(
          scaledX * frequency,
          scaledY * frequency,
          scaledZ * frequency
        ) *
          0.5 +
        0.5

      total += noiseValue * amplitude
      normalization += amplitude
      amplitude *= gain
      frequency *= this.options.lacunarity
    }

    total /= normalization

    return Math.pow(total, this.options.exponentiation) * this.options.height
  }
}
