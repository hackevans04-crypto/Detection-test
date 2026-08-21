import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'

/**
 * Deriva versiones web de los originales de Hi3D.
 *
 * Cada fuente ronda 65 MB, dos millones de triángulos y dos JPEG de 8192×8192.
 * Esas texturas cuestan 358 MB de memoria de GPU cada una: el peso del archivo
 * no dice nada sobre lo que cuesta dibujarlo, y por eso este script mide
 * triángulos y resolución, no megabytes.
 *
 *   node scripts/optimize-hero-models.mjs
 */
const MODELS = 'public/detection-home/hero/models'
const OUT = path.join(MODELS, 'web')
const WORK = path.join(process.cwd(), 'tmp', 'model-work')

/**
 * `ratio` es la fracción de triángulos que se conserva y `texture` el lado
 * máximo. El cerebro es el protagonista y aguanta más detalle; lo que sólo
 * aparece unos segundos, mucho menos.
 */
const TARGETS = [
  { out: 'brain-organic-digital', ratio: 0.09, texture: 2048, src: 'Hi3D_Modelo 3D de Cerebro Humano Red Neuronal Futurista_allparts_20260821_012530.glb' },
  { out: 'platform-podium', ratio: 0.05, texture: 1536, src: 'Hi3D_Podio de Teletransporte Sci-Fi Estilizado_allparts_20260821_012748.glb' },
  { out: 'hud-orbital', ratio: 0.05, texture: 1024, src: 'Hi3D_Untitled_allparts_20260821_013807.glb' },
  { out: 'neural-cluster', ratio: 0.045, texture: 1024, src: 'Hi3D_Untitled_allparts_20260821_015523.glb' },
  { out: 'energy-reactor', ratio: 0.04, texture: 1024, src: 'Hi3D_Untitled_allparts_20260821_015828.glb' },
  { out: 'brain-solid', ratio: 0.06, texture: 1536, src: 'Hi3D_Untitled_allparts_20260821_014624.glb' },
  { out: 'brain-stem', ratio: 0.05, texture: 1536, src: 'Hi3D_Untitled_allparts_20260821_014957.glb' },
]

fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(WORK, { recursive: true })
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
// `shell: true` es necesario en Windows para resolver `npx`, pero entonces los
// argumentos se vuelven a dividir por espacios y los nombres de los originales
// llevan varios. De ahí el entrecomillado explícito.
const gltf = (...args) => execFileSync(
  'npx',
  ['gltf-transform', ...args].map((arg) => `"${arg}"`),
  { stdio: ['ignore', 'pipe', 'pipe'], shell: true },
).toString()

/**
 * El `resize` del CLI aborta con estos JPEG porque libvips no logra deducir su
 * espacio de color. Forzarlo a sRGB y re-codificar aquí evita ese camino.
 */
async function shrinkTextures(document, maxSize) {
  let shrunk = 0
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage()
    if (!image) continue
    const pipeline = sharp(Buffer.from(image), { failOn: 'none' })
    const meta = await pipeline.metadata()
    if (Math.max(meta.width ?? 0, meta.height ?? 0) <= maxSize) continue
    const resized = await pipeline
      .toColourspace('srgb')
      .resize(maxSize, maxSize, { fit: 'inside', kernel: 'lanczos3' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer()
    texture.setImage(new Uint8Array(resized)).setMimeType('image/jpeg')
    shrunk++
  }
  return shrunk
}

const report = []
for (const target of TARGETS) {
  const source = path.join(MODELS, target.src)
  if (!fs.existsSync(source)) {
    console.log(`· ${target.out}: falta el original, se omite`)
    continue
  }
  const simplified = path.join(WORK, `${target.out}-simplified.glb`)
  const shrunk = path.join(WORK, `${target.out}-textures.glb`)
  const final = path.join(OUT, `${target.out}.glb`)

  // El orden importa: simplificar antes de comprimir, porque meshopt sólo
  // reduce el tamaño de transferencia y no quita un solo triángulo.
  gltf('simplify', source, simplified, '--ratio', String(target.ratio), '--error', '0.004')
  const document = await io.read(simplified)
  const count = await shrinkTextures(document, target.texture)
  await io.write(shrunk, document)
  gltf('meshopt', shrunk, final, '--level', 'high')

  // Se mide sobre el documento previo a meshopt: la compresión no elimina un
  // solo triángulo y leer el comprimido exigiría cargar aquí el decodificador.
  let triangles = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices()
      triangles += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3
    }
  }
  const resolutions = []
  for (const texture of document.getRoot().listTextures()) {
    const meta = await sharp(Buffer.from(texture.getImage())).metadata()
    resolutions.push(`${meta.width}x${meta.height}`)
  }
  const mb = fs.statSync(final).size / 1024 / 1024
  const sourceMb = fs.statSync(source).size / 1024 / 1024
  report.push({ file: `${target.out}.glb`, mb, sourceMb, triangles, textures: resolutions, shrunk: count })
  console.log(`✓ ${target.out}.glb  ${sourceMb.toFixed(1)} MB → ${mb.toFixed(2)} MB · ${triangles.toLocaleString()} tris · texturas ${resolutions.join(', ')}`)
}

fs.writeFileSync(path.join('tmp', 'model-optimization.json'), JSON.stringify(report, null, 2))
const totalTris = report.reduce((sum, r) => sum + r.triangles, 0)
const totalMb = report.reduce((sum, r) => sum + r.mb, 0)
console.log(`\nTotal: ${report.length} modelos · ${totalTris.toLocaleString()} triángulos · ${totalMb.toFixed(2)} MB`)
