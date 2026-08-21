/**
 * Detection-test — separador de capas del hero.
 *
 * Los assets llegan combinados (cerebro + anillos + haz + plataforma en un solo
 * PNG; el paisaje en una sola foto). Este script reparte el canal alfa entre
 * varias piezas SIN tocar los colores, de modo que apilarlas alineadas
 * reproduce exactamente la imagen original — pero cada pieza puede vivir a una
 * profundidad Z distinta y moverse por su cuenta.
 *
 *   node scripts/build-hero-layers.mjs
 */
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const HERO = 'public/detection-home/hero'
const OUT = `${HERO}/layers`

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** `toColourspace('b-w')` es obligatorio: sin él sharp devuelve 3 canales. */
async function blurGray(buffer, width, height, sigma) {
  return sharp(buffer, { raw: { width, height, channels: 1 } })
    .blur(sigma)
    .toColourspace('b-w')
    .raw()
    .toBuffer()
}

/** Escribe un PNG con los colores intactos y el alfa multiplicado por `weight(x, y)`. */
async function maskedLayer({ rgba, width, height, weight, file }) {
  const out = Buffer.from(rgba)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      out[i + 3] = Math.round(clamp(weight(x, y)) * rgba[i + 3])
    }
  }
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, effort: 8 })
    .toFile(file)
}

async function readRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { rgba: data, width: info.width, height: info.height }
}

async function splitHologram() {
  const { rgba, width, height } = await readRgba(`${HERO}/brain-hologram-platform.png`)

  // Apertura morfológica barata: al desenfocar mucho el alfa, los arcos finos y
  // los nodos pequeños se apagan y sólo sobreviven los cuerpos macizos
  // (cerebro + haz + plataforma). Umbral alto = máscara ceñida al cerebro, con
  // lo que los anillos quedan completos en su propia pieza.
  const alpha = Buffer.alloc(width * height)
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) alpha[p] = rgba[i + 3]
  const blurred = await blurGray(alpha, width, height, 30)

  const bodyRaw = Buffer.alloc(width * height)
  for (let p = 0; p < bodyRaw.length; p += 1) {
    bodyRaw[p] = Math.round(smoothstep(0.6, 0.82, blurred[p] / 255) * 255)
  }
  const body = await blurGray(bodyRaw, width, height, 5) // borde suave, sin costura

  const bodyAt = (x, y) => body[y * width + x] / 255
  // Corte horizontal justo por encima del borde superior de la plataforma.
  const platformAt = (y) => smoothstep(0.757, 0.803, y / height)
  // El haz arranca donde el cerebro se estrecha hacia la plataforma.
  const beamAt = (y) => smoothstep(0.63, 0.715, y / height)
  // Dentro de la plataforma: HUD luminoso arriba, base metálica abajo.
  const baseAt = (y) => smoothstep(0.818, 0.868, y / height)

  await mkdir(OUT, { recursive: true })

  await maskedLayer({
    rgba, width, height, file: `${OUT}/brain.png`,
    weight: (x, y) => (1 - platformAt(y)) * bodyAt(x, y) * (1 - beamAt(y)),
  })
  await maskedLayer({
    rgba, width, height, file: `${OUT}/beam.png`,
    weight: (x, y) => (1 - platformAt(y)) * bodyAt(x, y) * beamAt(y),
  })
  await maskedLayer({
    rgba, width, height, file: `${OUT}/rings.png`,
    weight: (x, y) => (1 - platformAt(y)) * (1 - bodyAt(x, y)),
  })
  await maskedLayer({
    rgba, width, height, file: `${OUT}/platform-glow.png`,
    weight: (x, y) => platformAt(y) * (1 - baseAt(y)),
  })
  await maskedLayer({
    rgba, width, height, file: `${OUT}/platform-base.png`,
    weight: (x, y) => platformAt(y) * baseAt(y),
  })

  console.log('holograma → brain, beam, rings, platform-glow, platform-base')
}

async function splitMountains() {
  const { rgba, width, height } = await readRgba(`${HERO}/background-mountains-night.png`)
  await mkdir(OUT, { recursive: true })

  // Copias del mismo paisaje con distinto peso vertical. Al compartir colores,
  // apiladas y alineadas dan la foto original; separadas por unos píxeles
  // generan parallax real en la franja que cada una pesa.
  await maskedLayer({
    rgba, width, height, file: `${OUT}/mountains-mid.png`,
    weight: (x, y) => {
      const v = y / height
      return smoothstep(0.4, 0.62, v) * (1 - smoothstep(0.82, 0.97, v))
    },
  })
  await maskedLayer({
    rgba, width, height, file: `${OUT}/mountains-front.png`,
    weight: (x, y) => {
      const v = y / height
      const u = x / width
      // Los macizos cercanos ocupan las esquinas inferiores izquierda y derecha.
      const sides = Math.max(1 - smoothstep(0.04, 0.34, u), smoothstep(0.6, 0.9, u))
      return smoothstep(0.52, 0.86, v) * (0.35 + 0.65 * sides)
    },
  })
  console.log('paisaje → mountains-mid, mountains-front')
}

/**
 * Convierte arte pensado para `mix-blend-mode: screen` en arte con alfa propio.
 *
 * Dentro de un contexto 3D los modos de fusión aplanan el subárbol y matan la
 * perspectiva, así que la oscuridad se traslada al canal alfa: sobre fondo
 * oscuro el resultado es indistinguible del `screen` original, pero compone
 * con alfa normal y respeta `preserve-3d`.
 */
async function screenToAlpha(name, file) {
  const { rgba, width, height } = await readRgba(file)
  const out = Buffer.alloc(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const peak = Math.max(rgba[i], rgba[i + 1], rgba[i + 2])
    out[i + 3] = Math.round((peak / 255) * rgba[i + 3])
    if (peak === 0) continue
    // Se des-premultiplica para que el color conserve su saturación.
    const gain = 255 / peak
    out[i] = Math.min(255, Math.round(rgba[i] * gain))
    out[i + 1] = Math.min(255, Math.round(rgba[i + 1] * gain))
    out[i + 2] = Math.min(255, Math.round(rgba[i + 2] * gain))
  }
  await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, effort: 8 })
    .toFile(`${OUT}/${name}.png`)
  console.log(`alfa → ${name}`)
}

/**
 * Divide el cerebro en sus dos hemisferios.
 *
 * No existe `brain.glb`, así que la apertura del capítulo se resuelve con dos
 * planos independientes: el hemisferio orgánico y el digital. El corte cae en
 * la columna más luminosa —la propia costura de luz del arte— con un degradado
 * a cada lado, de modo que al separarse ambas mitades conservan su borde
 * iluminado y en reposo vuelven a componer la imagen original.
 *
 * Es un apaño 2.5D, no una apertura volumétrica: las mitades no tienen caras
 * internas y la cámara no puede rodearlas.
 */
async function splitHemispheres() {
  const { rgba, width, height } = await readRgba(`${OUT}/brain.png`)
  const seam = 0.5342 * width
  const feather = 16

  await maskedLayer({
    rgba, width, height, file: `${OUT}/brain-left.png`,
    weight: (x) => 1 - smoothstep(seam - feather, seam + feather, x),
  })
  await maskedLayer({
    rgba, width, height, file: `${OUT}/brain-right.png`,
    weight: (x) => smoothstep(seam - feather, seam + feather, x),
  })
  console.log('hemisferios → brain-left, brain-right')
}

await splitHologram()
await splitHemispheres()
await splitMountains()
await screenToAlpha('stars-alpha', `${HERO}/starfield-particles.png`)
await screenToAlpha('network-alpha', `${HERO}/tech-network.png`)
await screenToAlpha('ribbons-alpha', `${HERO}/energy-ribbons.png`)
