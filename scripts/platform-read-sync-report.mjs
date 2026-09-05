import * as THREE from 'three'
import { createPlatformCameraRail, cameraScalar, STATION_ANCHORS } from '../lib/platform/camera-rail.ts'
import {
  CONCEPTS,
  conceptFrame,
  stationArrival,
  stationCameraFreezeWeight,
  stationCameraFreezePoint,
} from '../lib/platform/timeline.ts'

/*
 * Reporte de sincronía de las estaciones interiores — el único tramo de
 * lectura del capítulo desde que se retiró la presentación por caras del
 * cubo (novena pasada, ver `PLATFORM_BEATS` en `lib/platform/timeline.ts`).
 * Este script reemplaza la versión anterior, que medía `CUBE_FACES` (ya
 * eliminado). Mide directamente las mismas funciones puras que ya consumen
 * los componentes reales (`conceptFrame`, `stationCameraFreezeWeight`) —
 * son la única fuente de verdad de esos valores, así que leerlas aquí es
 * equivalente a leer lo que de verdad se renderiza, sin necesitar un
 * navegador.
 *
 * Uso: node scripts/platform-read-sync-report.mjs
 */
const STEP = 0.0005
const START = CONCEPTS[0].window[0] - 0.01
const END = CONCEPTS[CONCEPTS.length - 1].window[1] + 0.01

const rail = createPlatformCameraRail()

function lookQuat(position, target) {
  const m = new THREE.Matrix4()
  m.lookAt(position, target, new THREE.Vector3(0, 1, 0))
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

function activeConcept(progress) {
  for (const concept of CONCEPTS) {
    if (progress >= concept.window[0] && progress <= concept.window[1]) return concept
  }
  return null
}

const posA = new THREE.Vector3(); const tgtA = new THREE.Vector3()
const frozenPos = new THREE.Vector3(); const frozenTgt = new THREE.Vector3()

let prevCamQuat = null
let prevCamPos = null

const rows = []
for (let p = START; p <= END; p += STEP) {
  const concept = activeConcept(p)
  // Misma mezcla que `DirectedCameraRig` en `hero-scene.tsx`: muestrea el
  // riel real y, si aplica, lo interpola hacia la pose congelada — medir
  // otra cosa aquí desincronizaría el reporte de lo que de verdad se ve.
  rail.sample(p, posA, tgtA)
  const freezeWeight = stationCameraFreezeWeight(p)
  if (freezeWeight > 0) {
    rail.sample(stationCameraFreezePoint(p), frozenPos, frozenTgt)
    posA.lerp(frozenPos, freezeWeight)
    tgtA.lerp(frozenTgt, freezeWeight)
  }
  const camQuat = lookQuat(posA, tgtA)
  /*
    `visibility` sola sobreestima lo que de verdad se pinta: `platform-chapter.tsx`
    multiplica ese mismo valor por `stationArrival` (¿la cámara ya está
    mirando el ancla de esta estación de verdad?) antes de fijar la opacidad
    real del texto — sin ese segundo factor, este reporte marcaría "texto
    visible" incluso mientras la cámara todavía viaja desde la estación
    anterior.
  */
  const textOpacity = concept
    ? conceptFrame(p, concept.window).visibility * stationArrival([tgtA.x, tgtA.y, tgtA.z], STATION_ANCHORS[concept.key])
    : 0
  const readHold = freezeWeight >= 0.999 ? 1 : 0

  let cameraAngularDelta = 0
  let cameraLinearDelta = 0
  if (prevCamQuat !== null) {
    cameraAngularDelta = (2 * Math.acos(Math.min(1, Math.abs(camQuat.dot(prevCamQuat))))) * 180 / Math.PI
    cameraLinearDelta = posA.distanceTo(prevCamPos)
  }
  rows.push({
    p: Number(p.toFixed(4)),
    concept: concept?.key ?? '—',
    textOpacity: Number(textOpacity.toFixed(4)),
    readHold,
    cameraAngularDelta: Number(cameraAngularDelta.toFixed(5)),
    cameraLinearDelta: Number(cameraLinearDelta.toFixed(6)),
  })
  prevCamQuat = camQuat.clone()
  prevCamPos = posA.clone()
}

// Delta por 0,001 de progreso (los de arriba son por STEP=0,0005) para
// comparar contra los umbrales pedidos ("por .001").
const scale = 0.001 / STEP

const failures = []
for (const row of rows) {
  const camDeltaPer001 = row.cameraAngularDelta * scale
  if (row.textOpacity > 0.5 && camDeltaPer001 > 0.15) {
    failures.push({ ...row, rule: 'textOpacity>.5 && cameraAngularDelta>.15°/.001', value: camDeltaPer001 })
  }
  if (row.readHold && camDeltaPer001 > 0) {
    failures.push({ ...row, rule: 'readHold=1 && cameraAngularDelta>0 (debería estar congelada del todo)', value: camDeltaPer001 })
  }
}

console.log(`${rows.length} muestras, p=[${START.toFixed(3)}, ${END.toFixed(3)}], paso=${STEP}.\n`)

for (const concept of CONCEPTS) {
  const conceptRows = rows.filter((r) => r.concept === concept.key)
  const readRows = conceptRows.filter((r) => r.readHold)
  const textLifeRows = conceptRows.filter((r) => r.textOpacity > 0.01)
  const fullyReadableRows = textLifeRows.filter((r) => r.textOpacity > 0.95)
  const plateauShare = textLifeRows.length ? fullyReadableRows.length / textLifeRows.length : 0
  console.log(`--- ${concept.key} ---`)
  console.log(`  cámara congelada: ${readRows.length} muestras (${(readRows.length * STEP).toFixed(4)} de progreso)`)
  console.log(`  texto visible (>0.01): ${textLifeRows.length} muestras — ${(plateauShare * 100).toFixed(1)}% de esa vida a opacidad >0.95 (meseta, objetivo >=60%)`)
}

console.log(`\n${failures.length} fallos de ${rows.length} muestras.`)
for (const f of failures.slice(0, 40)) {
  console.log(`  p=${f.p} concept=${f.concept} ${f.rule} = ${f.value.toFixed(4)}`)
}
if (failures.length > 40) console.log(`  ... y ${failures.length - 40} más.`)
