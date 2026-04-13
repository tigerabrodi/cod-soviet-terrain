# KTX2 Conversion Guide

How all textures in this project were converted to KTX2.

## Tool

`toktx` from [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases) (v4.4.2).

macOS Apple Silicon install (no sudo needed):
```bash
curl -LO https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Darwin-arm64.pkg
pkgutil --expand KTX-Software-4.4.2-Darwin-arm64.pkg /tmp/ktx-extract/expanded
mkdir -p /tmp/ktx-extract/tools-payload && cd /tmp/ktx-extract/tools-payload
cat ../expanded/KTX-Software-4.4.2-Darwin-arm64-tools.pkg/Payload | cpio -id
mkdir -p /tmp/ktx-extract/lib-payload && cd /tmp/ktx-extract/lib-payload
cat ../expanded/KTX-Software-4.4.2-Darwin-arm64-library.pkg/Payload | cpio -id
cp /tmp/ktx-extract/lib-payload/usr/local/lib/libktx.4.4.2.dylib /tmp/ktx-extract/tools-payload/usr/local/bin/libktx.4.dylib
# toktx is now at /tmp/ktx-extract/tools-payload/usr/local/bin/toktx
```

## Terrain Textures (PBR maps from Patina)

All 1024x1024 PNGs. 4 materials x 5 maps = 20 files.

### Basecolor (sRGB color data)
```bash
toktx --t2 --genmipmap --encode uastc --uastc_quality 2 --zcmp 22 \
  basecolor.ktx2 basecolor.png
```

### Normal map (linear, higher quality to avoid lighting artifacts)
```bash
toktx --t2 --genmipmap --encode uastc --uastc_quality 4 --assign_oetf linear --zcmp 22 \
  normal.ktx2 normal.png
```

### Roughness / Metalness / Height (linear, greyscale data)
```bash
toktx --t2 --genmipmap --encode uastc --uastc_quality 2 --assign_oetf linear --zcmp 22 \
  roughness.ktx2 roughness.png
```

### Transparent textures (e.g. snowflake particles with alpha)
```bash
toktx --t2 --genmipmap --encode uastc --uastc_quality 2 --zcmp 22 \
  snowflake.ktx2 snowflake.png
```
UASTC handles RGBA natively. No extra flags for alpha.

## Flags Explained

| Flag | What it does |
|------|-------------|
| `--t2` | Output KTX2 format |
| `--genmipmap` | Bake mipmap chain so GPU doesn't generate at load time |
| `--encode uastc` | UASTC encoding — high quality, GPU-ready block compression |
| `--uastc_quality 2` | Quality level (0-4). 2 is good default. 4 for normal maps |
| `--assign_oetf linear` | Mark texture as linear (not sRGB). Required for non-color maps |
| `--zcmp 22` | Zstandard supercompression level for smaller file on disk |

## Character Model

Textures handled differently — done via `gltf-transform` CLI which calls `ktx` internally:

```bash
# Resize textures to 1024
npx @gltf-transform/cli resize input.glb resized.glb --width 1024 --height 1024

# Convert to KTX2 UASTC (needs ktx binary in PATH)
npx @gltf-transform/cli uastc resized.glb ktx2.glb --level 2 --zstd 22

# Meshopt geometry compression
npx @gltf-transform/cli meshopt ktx2.glb final.glb
```

Result: 8.1 MB -> 1.5 MB.
