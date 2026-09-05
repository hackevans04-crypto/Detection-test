import { chromium } from '@playwright/test'
import { PLATFORM_CAMERA_KEYFRAMES } from '../lib/platform/camera-rail.ts'

/** Progreso real de una clave con nombre — nunca un literal a mano, para no
 * volver a desincronizar este reporte de un retoque de `PLATFORM_BEATS`
 * (ver historial: ya pasó una vez con `CORE_EXIT_OUTER`, y otra vez —
 * detectada en vivo esta pasada— cuando la novena pasada redistribuyó los
 * tramos tras retirar la presentación por caras y las cuatro claves "con
 * nombre" de abajo seguían midiendo contra progresos de la versión anterior). */
function keyframeProgress(name) {
  const frame = PLATFORM_CAMERA_KEYFRAMES.find((f) => f.name === name)
  if (!frame) throw new Error(`No existe la clave de cámara "${name}" — revisar camera-rail.ts`)
  return frame.progress
}

/**
 * Medición de holgura del riel de Plataforma — reescrito desde cero.
 *
 * La versión anterior de este script calculaba ocupación en pantalla contra
 * `PLATFORM_MODULES`, una exportación de `lib/platform/assembly.ts` que ya no
 * existe: la reconstrucción por rejilla (altura × cuadrante) de esa misma
 * pasada cambió `assembly.ts` para describir sólo dirección de explosión y
 * retraso (`SHELL_CELLS`), no tamaño de panel — el tamaño real de cada celda
 * sale de cortar la malla GLB de verdad (`cubeLayers()` en
 * `platform-cast.tsx`), triángulo a triángulo, en tiempo de ejecución. No hay
 * forma de reconstruir esa geometría fuera del navegador sin duplicar esa
 * misma función — y duplicarla es exactamente el tipo de "verdad aparte" que
 * ya causó una desincronización antes en este archivo.
 *
 * Así que esta versión no recalcula nada por su cuenta: abre la página real
 * con `?heroDebug=1` (el hook que ya expone `window.heroThree` — ver
 * `hero-scene.tsx`, comentario "sin esto, atribuir un defecto visual a un
 * objeto concreto es adivinar") y mide la geometría QUE DE VERDAD SE
 * RENDERIZA. Menos rápido que álgebra pura, pero no puede desincronizarse de
 * lo que ve el usuario porque es lo mismo que ve el usuario.
 *
 * Uso (con `tsx`, no `node` a secas — importa `camera-rail.ts`/`timeline.ts`
 * directamente para derivar el progreso real de cada clave con nombre, ver
 * `keyframeProgress`, así que necesita el resolver de TypeScript):
 *   npx tsx scripts/platform-rail-report.mjs
 *   HERO_BASE=http://localhost:3000 npx tsx scripts/platform-rail-report.mjs
 */
const base = process.env.HERO_BASE ?? 'http://localhost:3000'
const CLEARANCE_LIMIT = 0.45

/*
  Dos zonas críticas a paso 0,002: el cruce de entrada al núcleo
  (`CORE_ENTRY_OUTER`→`CORE_ARRIVAL`, con margen) y el de salida
  (`STATION_INCLUSION`→`CORE_EXIT_INNER`, con margen). Derivadas de las
  claves reales, no de literales — ver `keyframeProgress`.
*/
const entryFrom = keyframeProgress('CORE_ENTRY_OUTER') - 0.01
const entryTo = keyframeProgress('CORE_ARRIVAL') + 0.01
const exitFrom = keyframeProgress('STATION_INCLUSION') - 0.005
const exitTo = keyframeProgress('CORE_EXIT_INNER') + 0.02

/** Núcleo del riel completo (paso 0,01) más las dos zonas críticas de arriba. */
function buildPoints() {
  const points = new Set()
  for (let i = 0; i <= 100; i += 1) points.add(Math.round(i) / 100)
  for (let p = entryFrom; p <= entryTo + 1e-9; p += 0.002) points.add(Math.round(p * 1000) / 1000)
  for (let p = exitFrom; p <= exitTo + 1e-9; p += 0.002) points.add(Math.round(p * 1000) / 1000)
  return [...points].sort((a, b) => a - b)
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.setDefaultTimeout(180000)
await page.goto(`${base}/?platformTest=1&heroDebug=1&p=0`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.hero-canvas canvas')
await page.waitForFunction('window.__heroReady === true && typeof window.heroThree !== "undefined"')

const points = buildPoints()
const samples = []
for (const progress of points) {
  await page.evaluate((value) => window.__heroSetDomProgress(value), progress)
  // Dos frames de reloj: uno para que `useFrame` lea el nuevo progreso, otro
  // para que `updateMatrixWorld` termine de propagar antes de medir.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const reading = await page.evaluate(() => {
    const state = window.heroThree
    if (!state) return null
    const camera = state.camera
    const scene = state.scene
    const camPos = camera.position
    const camQuat = camera.quaternion
    const coreCenter = { x: 0, y: 0.12, z: -9 }

    const meshes = []
    const walk = (object, parentVisible) => {
      const visible = parentVisible && object.visible !== false
      if (!visible) return
      if (object.isMesh && object.geometry && !object.isInstancedMesh) meshes.push(object)
      for (const child of object.children) walk(child, visible)
    }
    walk(scene, true)

    let nearest = Infinity
    let nearestName = '—'
    let nearestSolid = Infinity
    let nearestSolidName = '—'
    let nearestSolidPos = null
    for (const mesh of meshes) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const bb = mesh.geometry.boundingBox
      if (!bb) continue
      /*
        Distancia en espacio LOCAL del mesh, no una AABB de mundo.
        Transformar las 8 esquinas al mundo y volver a tomar min/max ahí
        infla la caja en cuanto el mesh está rotado — y estas celdas SÍ
        rotan (`spec.rotation` más una órbita continua sobre paneles). Con
        eso, la primera versión de este script marcaba distancia 0 contra
        paneles que en realidad estaban a más de una unidad de la cámara,
        sólo porque su caja de mundo, inflada por la rotación, se tragaba
        ese punto. Invertir la matriz y medir en el espacio propio del mesh
        da la distancia real a la caja orientada — válido porque el
        contenedor (`cubeAssemblyRoot`) sólo aplica escala UNIFORME.
      */
      const world = mesh.matrixWorld.elements
      const inv = mesh.matrixWorld.clone().invert().elements
      const lx = inv[0] * camPos.x + inv[4] * camPos.y + inv[8] * camPos.z + inv[12]
      const ly = inv[1] * camPos.x + inv[5] * camPos.y + inv[9] * camPos.z + inv[13]
      const lz = inv[2] * camPos.x + inv[6] * camPos.y + inv[10] * camPos.z + inv[14]
      const dx = Math.max(bb.min.x - lx, 0, lx - bb.max.x)
      const dy = Math.max(bb.min.y - ly, 0, ly - bb.max.y)
      const dz = Math.max(bb.min.z - lz, 0, lz - bb.max.z)
      /*
        `lx/ly/lz` viven en el espacio LOCAL/objeto del mesh (unidades del
        GLB en bruto, no del mundo) — invertir la matriz deshace también la
        escala. Una distancia calculada ahí sigue en esas mismas unidades, y
        `dressedModel()` reescala cada GLB a un tamaño de mundo arbitrario
        (`size / mayor extent`), así que un mesh con geometría en bruto mucho
        más grande o pequeña que su tamaño final de mundo devolvía una
        distancia con el factor de escala equivocado (0 seguía siendo 0 -por
        eso el hallazgo de las PANELS ya era válido-, pero cualquier holgura
        DISTINTA de cero salía mal). Se recupera el factor de escala uniforme
        —longitud de la primera columna de la matriz de mundo— y se aplica
        antes de comparar contra el umbral.
      */
      const scale = Math.hypot(world[0], world[1], world[2])
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * scale
      const name = mesh.name || mesh.parent?.name || '(sin nombre)'
      if (dist < nearest) { nearest = dist; nearestName = name }
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const isSolid = material && !material.transparent && material.depthWrite !== false
      // Origen en mundo del propio mesh — distingue "geometry_0" (nombre
      // genérico de exportación, comparte varios GLB) por SU POSICIÓN real:
      // la base vive en y≈−3,42, el núcleo en y≈0,12.
      if (isSolid && dist < nearestSolid) {
        nearestSolid = dist
        nearestSolidName = name
        nearestSolidPos = [world[12], world[13], world[14]]
      }
    }

    const dxc = camPos.x - coreCenter.x; const dyc = camPos.y - coreCenter.y; const dzc = camPos.z - coreCenter.z
    return {
      position: [camPos.x, camPos.y, camPos.z],
      quaternion: [camQuat.x, camQuat.y, camQuat.z, camQuat.w],
      fov: camera.fov,
      nearestDistance: nearest,
      nearestName,
      nearestSolidDistance: nearestSolid,
      nearestSolidName,
      nearestSolidPos,
      coreDistance: Math.sqrt(dxc * dxc + dyc * dyc + dzc * dzc),
      meshCount: meshes.length,
    }
  })
  samples.push({ progress, ...reading })
}
await browser.close()

function quatAngleDeg(a, b) {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  dot = Math.min(1, Math.abs(dot))
  return (2 * Math.acos(dot)) * 180 / Math.PI
}

console.log(`${samples.length} muestras. Umbral de holgura: ${CLEARANCE_LIMIT} u.\n`)

console.log('progress'.padEnd(9), 'nearest(any)'.padStart(13), 'actor'.padEnd(16), 'nearest(solid)'.padStart(15), 'actor solido'.padEnd(16), 'core-dist'.padStart(10), 'FOV'.padStart(6), 'Δquat°'.padStart(8))
let risky = 0
for (let i = 0; i < samples.length; i += 1) {
  const s = samples[i]
  if (!s || s.nearestDistance == null) continue
  const prev = i > 0 ? samples[i - 1] : null
  const dq = prev && prev.quaternion ? quatAngleDeg(prev.quaternion, s.quaternion) : 0
  const bad = s.nearestSolidDistance < CLEARANCE_LIMIT
  if (bad) risky += 1
  // Sólo imprime las zonas críticas y cualquier fila en riesgo, para no inundar la consola.
  const inHotZone = (s.progress >= entryFrom && s.progress <= entryTo) || (s.progress >= exitFrom && s.progress <= exitTo)
  if (!inHotZone && !bad) continue
  const solidPos = s.nearestSolidPos ? `@[${s.nearestSolidPos.map((v) => v.toFixed(2)).join(',')}]` : ''
  console.log(
    s.progress.toFixed(3).padEnd(9),
    s.nearestDistance.toFixed(3).padStart(13),
    s.nearestName.padEnd(16),
    s.nearestSolidDistance.toFixed(3).padStart(15) + (bad ? ' ✗' : '  '),
    (s.nearestSolidName + ' ' + solidPos).padEnd(30),
    s.coreDistance.toFixed(3).padStart(10),
    s.fov.toFixed(1).padStart(6),
    dq.toFixed(2).padStart(8),
  )
}
console.log(`\n${risky} de ${samples.length} muestras con holgura sólida < ${CLEARANCE_LIMIT} u.`)

// Resumen por keyframe nombrado — progreso real de cada clave, no un
// literal a mano (ver `keyframeProgress`).
const named = [
  ['CORE_ENTRY_OUTER', keyframeProgress('CORE_ENTRY_OUTER')],
  ['CORE_ENTRY_INNER', keyframeProgress('CORE_ENTRY_INNER')],
  ['CORE_ARRIVAL', keyframeProgress('CORE_ARRIVAL')],
  ['CORE_EXIT_INNER', keyframeProgress('CORE_EXIT_INNER')],
]
console.log('\nClaves con nombre (progreso exacto de la clave, no el más cercano de la muestra):')
for (const [name, progress] of named) {
  const closest = samples.reduce((best, s) => (
    s && Math.abs(s.progress - progress) < Math.abs(best.progress - progress) ? s : best
  ), samples[0])
  console.log(`  ${name.padEnd(20)} p=${progress.toFixed(3)} (muestra más cercana p=${closest.progress.toFixed(3)}): solid=${closest.nearestSolidDistance.toFixed(3)}u (${closest.nearestSolidName}), core-dist=${closest.coreDistance.toFixed(3)}u`)
}

if (risky > 0) process.exitCode = 1
