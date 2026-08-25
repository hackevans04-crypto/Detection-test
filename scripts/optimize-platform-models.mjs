import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'

const DOWNLOADS = 'C:/Users/PC/Downloads'
const OUT = path.join(process.cwd(), 'public', 'detection-home', 'platform', 'models')
const WORK = path.join(process.cwd(), 'tmp', 'platform-model-work')

const targets = [
  {
    out: 'mechanical-base',
    src: 'Hi3D_Modelo 3D Plataforma de Teletransporte Sci-Fi Estilizada_allparts_20260823_202433.glb',
    ratio: 0.025,
    texture: 1024,
  },
  {
    /*
      El cubo maestro es `003633`, no el que se llama «Cubo Sci-Fi Cyberpunk».

      Comprobado mirando las siluetas, no los nombres (`tmp/platform-audit/`):
      el que se estaba usando —202444— tiene forma de cruz con brazos salientes
      y, en planta, bloques sueltos flotando en las esquinas: es un montaje
      semiexplotado, no un cubo. Por eso Plataforma no tenía figura central
      reconocible aunque el derivado fuera técnicamente correcto.

      `003633` da frente y lateral idénticos —un bloque macizo de racks sobre su
      propia base— y en planta un marco cuadrado con núcleo circular en el
      centro. Es exactamente la referencia aprobada: cubo modular sobre
      plataforma con núcleo interior.
    */
    out: 'modular-cube',
    src: 'Hi3D_Untitled_allparts_20260824_003633.glb',
    ratio: 0.028,
    texture: 1024,
  },
  {
    out: 'energy-core',
    src: 'Hi3D_Modelo 3D de Núcleo de Energía Holográfico Sci-Fi Estilizado_allparts_20260823_205907.glb',
    ratio: 0.022,
    texture: 1024,
  },
  {
    out: 'data-tunnel',
    src: 'Hi3D_Modelo 3D de Túnel de Datos Sci-Fi Cyberpunk Futurista_allparts_20260824_001814.glb',
    ratio: 0.018,
    texture: 768,
  },
]

fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(WORK, { recursive: true })
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const gltf = (...args) => execFileSync(
  'npx',
  ['gltf-transform', ...args].map((arg) => `"${arg}"`),
  { stdio: ['ignore', 'pipe', 'pipe'], shell: true },
).toString()

async function shrinkTextures(document, maxSize) {
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage()
    if (!image) continue
    const pipeline = sharp(Buffer.from(image), { failOn: 'none' })
    const meta = await pipeline.metadata()
    if (Math.max(meta.width ?? 0, meta.height ?? 0) <= maxSize) continue
    const resized = await pipeline
      .toColourspace('srgb')
      .resize(maxSize, maxSize, { fit: 'inside', kernel: 'lanczos3' })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer()
    texture.setImage(new Uint8Array(resized)).setMimeType('image/jpeg')
  }
}

const report = []
for (const target of targets) {
  const source = path.join(DOWNLOADS, target.src)
  if (!fs.existsSync(source)) throw new Error(`Falta ${source}`)
  const simplified = path.join(WORK, `${target.out}-simplified.glb`)
  const textured = path.join(WORK, `${target.out}-textures.glb`)
  const final = path.join(OUT, `${target.out}.glb`)

  gltf('simplify', source, simplified, '--ratio', String(target.ratio), '--error', '0.006')
  const document = await io.read(simplified)
  await shrinkTextures(document, target.texture)
  await io.write(textured, document)
  gltf('meshopt', textured, final, '--level', 'high')

  let triangles = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices()
      triangles += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3
    }
  }
  const mb = fs.statSync(final).size / 1024 / 1024
  report.push({ file: path.basename(final), triangles, mb })
  console.log(`✓ ${path.basename(final)} · ${triangles.toLocaleString()} tris · ${mb.toFixed(2)} MB`)
}

fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 2))
