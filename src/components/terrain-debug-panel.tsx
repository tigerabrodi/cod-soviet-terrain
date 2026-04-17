import type { TerrainSceneDebugState } from '@/components/terrain-scene'
import type { TerrainDebugSettings } from '@/lib/debug/terrain-debug'
import {
  applyTerrainGenerationPreset,
  type TerrainGenerationPresetName,
} from '@/lib/terrain/terrain-settings'
import type { ReactNode } from 'react'

export interface TerrainDebugPanelProps {
  debugState: TerrainSceneDebugState | null
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  onReset: () => void
  onSettingsChange: (settings: TerrainDebugSettings) => void
  settings: TerrainDebugSettings
}

export function TerrainDebugPanel({
  debugState,
  isOpen,
  onOpenChange,
  onReset,
  onSettingsChange,
  settings,
}: TerrainDebugPanelProps) {
  return (
    <div className="pointer-events-auto mt-3 w-[min(26rem,calc(100vw-2rem))]">
      <div className="rounded-[20px] border border-white/10 bg-black/22 p-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-body text-[10px] tracking-[0.24em] text-[#c9d2dc]/68 uppercase">
              Debug
            </p>
            <p className="font-body mt-1 text-sm text-[#eef2f6]">
              Tune terrain. snow. and performance.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="font-body rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#d0d8e1]"
              onClick={onReset}
              type="button"
            >
              Reset
            </button>
            <button
              className="font-body rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#f4f7fb]"
              onClick={() => {
                onOpenChange(!isOpen)
              }}
              type="button"
            >
              {isOpen ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#dbe4ec]/82 sm:grid-cols-4">
          <StatChip
            label="FPS"
            value={debugState ? formatFloat(debugState.fps, 1) : '...'}
          />
          <StatChip
            label="Frame ms"
            value={debugState ? formatFloat(debugState.frameMs, 1) : '...'}
          />
          <StatChip
            label="Chunks"
            value={debugState ? String(debugState.chunkCount) : '...'}
          />
          <StatChip
            label="Tris"
            value={debugState ? formatCount(debugState.triangleCount) : '...'}
          />
          <StatChip
            label="Draws"
            value={debugState ? formatCount(debugState.drawCalls) : '...'}
          />
          <StatChip
            label="Geom"
            value={debugState ? formatCount(debugState.geometries) : '...'}
          />
          <StatChip
            label="Tex"
            value={debugState ? formatCount(debugState.textureCount) : '...'}
          />
          <StatChip
            label="Queue"
            value={
              debugState
                ? `P${debugState.pendingChunkCommits} . I${debugState.inflightChunkRequests}`
                : '...'
            }
          />
        </div>

        {isOpen ? (
          <div className="mt-4 max-h-[58dvh] space-y-4 overflow-y-auto pr-1">
            <DebugSection title="Terrain shape">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TERRAIN_PRESET_BUTTONS.map((preset) => (
                  <button
                    className="font-body rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-[#e3e9ef] transition hover:bg-white/8"
                    key={preset.value}
                    onClick={() => {
                      onSettingsChange({
                        ...settings,
                        terrainGeneration: applyTerrainGenerationPreset(
                          preset.value,
                          settings.terrainGeneration.seed
                        ),
                      })
                    }}
                    type="button"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  className="font-body rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#f4f7fb]"
                  onClick={() => {
                    onSettingsChange({
                      ...settings,
                      terrainGeneration: {
                        ...settings.terrainGeneration,
                        seed: getNextTerrainSeed(),
                      },
                    })
                  }}
                  type="button"
                >
                  New seed
                </button>
                <InfoPill
                  label="Seed"
                  value={String(settings.terrainGeneration.seed)}
                />
              </div>
              <SliderControl
                label="Terrain seed"
                max={999}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      seed: Math.round(value),
                    },
                  })
                }}
                step={1}
                value={settings.terrainGeneration.seed}
              />
              <SliderControl
                label="Height scale"
                max={2.25}
                min={0.35}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      heightScale: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.heightScale}
              />
              <SliderControl
                label="Broad strength"
                max={2.5}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      broadStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.broadStrength}
              />
              <SliderControl
                label="Broad scale"
                max={2.2}
                min={0.45}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      broadScale: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.broadScale}
              />
              <SliderControl
                label="Detail strength"
                max={2.5}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      detailStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.detailStrength}
              />
              <SliderControl
                label="Detail scale"
                max={2.4}
                min={0.45}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      detailScale: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.detailScale}
              />
              <SliderControl
                label="Ridge strength"
                max={2.5}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      ridgeStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.ridgeStrength}
              />
              <SliderControl
                label="Ridge scale"
                max={2.6}
                min={0.45}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      ridgeScale: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.ridgeScale}
              />
              <SliderControl
                label="Crater strength"
                max={2.5}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      craterStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.craterStrength}
              />
              <SliderControl
                label="Crater scale"
                max={2.4}
                min={0.45}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainGeneration: {
                      ...settings.terrainGeneration,
                      craterScale: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainGeneration.craterScale}
              />
            </DebugSection>

            <DebugSection title="Terrain material">
              <SliderControl
                label="Texture scale"
                max={1.8}
                min={0.45}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainMaterial: {
                      ...settings.terrainMaterial,
                      textureScale: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainMaterial.textureScale}
              />
              <SliderControl
                label="Frost tint"
                max={2}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    terrainMaterial: {
                      ...settings.terrainMaterial,
                      frostStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.terrainMaterial.frostStrength}
              />
            </DebugSection>

            <DebugSection title="Weather">
              <ToggleControl
                checked={settings.weather.snowEnabled}
                label="Snow enabled"
                onChange={(checked) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      snowEnabled: checked,
                    },
                  })
                }}
              />
              <SliderControl
                label="Snow density"
                max={2}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      snowDensity: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.weather.snowDensity}
              />
              <SliderControl
                label="Ground build"
                max={2.5}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      accumulationRate: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.weather.accumulationRate}
              />
              <SliderControl
                label="Ground melt"
                max={2}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      meltRate: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.weather.meltRate}
              />
              <SliderControl
                label="Ground wind"
                max={2}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      windStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.weather.windStrength}
              />
              <SliderControl
                label="Snow look"
                max={2}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      coverageStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.weather.coverageStrength}
              />
              <SliderControl
                label="Fall speed"
                max={2.2}
                min={0.2}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      fallSpeed: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.weather.fallSpeed}
              />
              <SliderControl
                label="Drift strength"
                max={2}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    weather: {
                      ...settings.weather,
                      driftStrength: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.weather.driftStrength}
              />
            </DebugSection>

            <DebugSection title="Performance">
              <ToggleControl
                checked={settings.performance.showWireframe}
                label="Wireframe terrain"
                onChange={(checked) => {
                  onSettingsChange({
                    ...settings,
                    performance: {
                      ...settings.performance,
                      showWireframe: checked,
                    },
                  })
                }}
              />
              <SliderControl
                label="Render scale"
                max={1.1}
                min={0.45}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    performance: {
                      ...settings.performance,
                      renderScale: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.performance.renderScale}
              />
              <InfoRow
                label="LOD split"
                value={debugState ? formatLodCounts(debugState.lodCounts) : '...'}
              />
              <InfoRow
                label="SAB chunks"
                value={debugState ? String(debugState.sharedBufferChunks) : '...'}
              />
              <InfoRow
                label="Snow states"
                value={debugState ? String(debugState.snowChunkCount) : '...'}
              />
            </DebugSection>

            <DebugSection title="Lighting">
              <SliderControl
                label="Fog density"
                max={2.2}
                min={0}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    lighting: {
                      ...settings.lighting,
                      fogDensity: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.lighting.fogDensity}
              />
              <SliderControl
                label="Sky intensity"
                max={2}
                min={0.2}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    lighting: {
                      ...settings.lighting,
                      environmentIntensity: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.lighting.environmentIntensity}
              />
              <SliderControl
                label="Sun intensity"
                max={2.4}
                min={0.2}
                onChange={(value) => {
                  onSettingsChange({
                    ...settings,
                    lighting: {
                      ...settings.lighting,
                      sunIntensity: value,
                    },
                  })
                }}
                step={0.05}
                value={settings.lighting.sunIntensity}
              />
            </DebugSection>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DebugSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section>
      <p className="font-body text-[10px] tracking-[0.24em] text-[#c9d2dc]/64 uppercase">
        {title}
      </p>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  )
}

const TERRAIN_PRESET_BUTTONS: Array<{
  label: string
  value: TerrainGenerationPresetName
}> = [
  { label: 'Blasted', value: 'blasted' },
  { label: 'Alpine', value: 'alpine' },
  { label: 'Fractured', value: 'fractured' },
  { label: 'Cratered', value: 'cratered' },
  { label: 'Plains', value: 'plains' },
]

function InfoPill({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="font-body flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-[#d2dbe3]">
      <span className="text-[#aeb9c3]">{label}</span>
      <span className="text-[#f4f7fb]">{value}</span>
    </div>
  )
}

function getNextTerrainSeed() {
  return Math.floor(Math.random() * 1000)
}

function SliderControl({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="font-body text-xs text-[#eef2f6]">{label}</span>
        <span className="font-body text-[11px] text-[#c7d1db]/72">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/12"
        max={max}
        min={min}
        onChange={(event) => {
          onChange(event.currentTarget.valueAsNumber)
        }}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

function ToggleControl({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
      <span className="font-body text-xs text-[#eef2f6]">{label}</span>
      <input
        checked={checked}
        className="h-4 w-4 accent-[#dbe6f3]"
        onChange={(event) => {
          onChange(event.currentTarget.checked)
        }}
        type="checkbox"
      />
    </label>
  )
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
      <p className="font-body text-[10px] tracking-[0.2em] text-[#c9d2dc]/58 uppercase">
        {label}
      </p>
      <p className="font-body mt-1 text-xs text-[#f4f7fb]">{value}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
      <span className="font-body text-xs text-[#eef2f6]">{label}</span>
      <span className="font-body text-[11px] text-[#c7d1db]/72">{value}</span>
    </div>
  )
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatFloat(value: number, fractionDigits: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value)
}

function formatLodCounts(lodCounts: Record<number, number>) {
  const orderedEntries = Object.entries(lodCounts).sort(
    ([left], [right]) => Number(left) - Number(right)
  )

  if (orderedEntries.length === 0) {
    return '...'
  }

  return orderedEntries
    .map(([lodLevel, count]) => `L${lodLevel} ${count}`)
    .join(' . ')
}
