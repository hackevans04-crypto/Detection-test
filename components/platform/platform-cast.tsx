'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SHELL_CELLS, bandOf, sectorOf } from '@/lib/platform/assembly'
import { assemblyWeight, activationWeight, at, CUBE_REST_ANGLE, exitPortalWeight, readingHold, smoothstep, smootherstep, stationCameraFreezeWeight, until } from '@/lib/platform/timeline'
import { coreCrossWeight } from '@/lib/platform/camera-rail'
import type { PlatformStateRef } from './platform-state'

/**
 * Letrero "03 · PROCESO" al fondo del corredor de salida (punto 12).
 *
 * No monta `ProcessSection` ni construye un tercer capítulo 3D — es un
 * plano con textura de canvas, mismo lenguaje que el resto del HUD del
 * capítulo, sentado dentro del propio corredor ya construido. Se ve lejano y
 * desenfocado al principio simplemente porque está lejos (la perspectiva ya
 * hace ese trabajo); lo único que anima es su opacidad y su brillo, para que
 * se sienta como algo que se enciende al acercarse y no como un cartel fijo.
 */
function makeProcessSignTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.textAlign = 'center'
  context.fillStyle = '#eaf6ff'
  context.font = '600 34px sans-serif'
  context.fillText('SIGUIENTE CAPÍTULO', canvas.width / 2, 92)
  context.font = '700 96px sans-serif'
  context.fillStyle = '#ffffff'
  context.shadowColor = '#c9a8ff'
  context.shadowBlur = 24
  context.fillText('03 · PROCESO', canvas.width / 2, 190)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const MODEL_ROOT = '/detection-home/platform/models'
const BASE_URL = `${MODEL_ROOT}/mechanical-base.glb`
const CUBE_URL = `${MODEL_ROOT}/modular-cube.glb`
const CORE_URL = `${MODEL_ROOT}/energy-core.glb`
const TUNNEL_URL = `${MODEL_ROOT}/data-tunnel.glb`

/*
  Cómo se visten los cuatro modelos.

  Los cuatro traen exactamente lo mismo: `baseColor` blanco, `metallic` y
  `roughness` a 1 y TODO el color en sus texturas —un albedo de 1024 px y un
  mapa metálico/rugosidad—. Ninguno trae emisión.

  Sobre eso, el vestido anterior hacía tres cosas que los apagaban:

  1. **Multiplicaba el color por un gris azulado** (#7994ad y compañía). Sobre un
     metal ese factor no tiñe una superficie difusa: tiñe el REFLEJO. Reflejar el
     58 % y encima en azul es, literalmente, quitarle la mitad de la luz al
     modelo.
  2. **Metal casi puro sin nada que reflejar.** Con `metalness` 0,9 no queda
     componente difusa, así que todo lo que se ve es entorno; y el entorno eran
     tres rectángulos a 128 px. Un metal sin entorno es negro.
  3. **Nadie encendía el neón.** Los modelos llevan sus luces pintadas en el
     albedo, pero sin `emissiveMap` esas zonas eran pintura mate.

  El vestido nuevo respeta el archivo: no toca el color, usa el propio albedo
  como mapa de emisión —así se encienden las luces que el modelo ya tiene
  dibujadas, y sólo ésas—, deja algo de componente difusa y sube el peso del
  entorno. La opacidad sigue siendo del capítulo, pero la transparencia sólo se
  activa mientras hay fundido: un metal transparente ni ordena bien ni se ve.
*/
type Dress = {
  /** Cuánto se encienden las luces que el modelo trae pintadas. */
  glow: number
  /** Peso del entorno en el reflejo. */
  env?: number
  metalness?: number
  roughness?: number
}

function dress(material: THREE.MeshStandardMaterial, look: Dress) {
  material.color.setRGB(1, 1, 1)
  if (material.map) {
    material.emissiveMap = material.map
    material.emissive.setRGB(1, 1, 1)
  } else {
    material.emissive.set('#0a3550')
  }
  material.emissiveIntensity = look.glow
  material.envMapIntensity = look.env ?? 1.9
  material.metalness = look.metalness ?? 0.82
  material.roughness = look.roughness ?? 0.4
  material.transparent = false
  material.opacity = 1
  material.depthWrite = true
  return material
}

/**
 * Centra el modelo en su propia caja y lo lleva al tamaño pedido.
 *
 * El escalado es uniforme sobre la arista mayor, así que ninguna proporción del
 * archivo se altera: los cuatro GLB vienen ya con escala uniforme y una sola
 * malla, y deformarlos aquí sería inventar.
 */
function dressedModel(source: THREE.Object3D, size: number, look: Dress) {
  const scene = source.clone(true)
  scene.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(scene)
  const extent = bounds.getSize(new THREE.Vector3())
  const centre = bounds.getCenter(new THREE.Vector3())
  scene.position.sub(centre)
  const wrapper = new THREE.Group()
  wrapper.add(scene)
  wrapper.scale.setScalar(size / Math.max(extent.x, extent.y, extent.z, 0.0001))
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const original = Array.isArray(object.material) ? object.material[0] : object.material
    object.material = dress(original.clone() as THREE.MeshStandardMaterial, look)
    object.castShadow = false
    object.receiveShadow = false
  })
  return wrapper
}

function materialsOf(object: THREE.Object3D) {
  const materials: THREE.MeshStandardMaterial[] = []
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const list = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of list) if (material instanceof THREE.MeshStandardMaterial) materials.push(material)
    }
  })
  return materials
}

/**
 * Fundido de un actor, sin dejarlo transparente cuando ya está entero.
 *
 * **El `depthWrite` no se suelta nunca.** Se apagaba por debajo del 55 % de
 * opacidad, y ahí es donde el corredor se rompía en cristales: es una malla
 * densa que se solapa consigo misma y que además se mira DESDE DENTRO, así que
 * sin buffer de profundidad cada triángulo se mezclaba en el orden en que
 * tocara y las paredes se veían unas a través de otras. Lo mismo le pasaba al
 * cubo durante su aparición.
 *
 * Los cuatro modelos son sólidos opacos: su fundido es una aparición, no un
 * cristal. Escribiendo profundidad, la cara más cercana gana y el objeto se
 * desvanece entero y limpio.
 */
function fade(materials: THREE.MeshStandardMaterial[], opacity: number) {
  const opaque = opacity >= 0.995
  for (const material of materials) {
    material.transparent = !opaque
    material.opacity = opacity
    material.depthWrite = true
  }
}

type SplitCube = { parts: THREE.Group[]; materials: THREE.MeshStandardMaterial[] }

type LayerBuffer = { position: number[]; normal: number[]; uv: number[] }

/** Arista del cubo en el mundo. Única fuente: la usan también `CUBE_EDGES`
 * más abajo, para que los cantos procedurales coincidan de verdad con la
 * malla real y no con un múltiplo inventado. */
const CUBE_WIDTH = 3.05

/**
 * Corta la malla real del cubo en la rejilla de `SHELL_CELLS` (altura ×
 * cuadrante). Segunda pasada de un mecanismo que ya cortaba por altura sola:
 * ahora clasifica cada triángulo también por en qué cuadrante (x,z) cae su
 * centroide, usando exactamente los mismos cortes que `SHELL_CELLS` describe
 * (`bandOf`/`sectorOf` en `lib/platform/assembly.ts`), así la lista de
 * piezas y la geometría real nunca se pueden desincronizar.
 */
function cubeLayers(source: THREE.Object3D, width = CUBE_WIDTH): SplitCube {
  source.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(source)
  const centre = bounds.getCenter(new THREE.Vector3())
  const extent = bounds.getSize(new THREE.Vector3())
  const scale = width / Math.max(extent.x, extent.y, extent.z, 0.0001)
  const halfHeight = Math.max(extent.y * 0.5, 0.0001)
  const cellCount = SHELL_CELLS.length
  const buffers: LayerBuffer[] = SHELL_CELLS.map(() => ({ position: [], normal: [], uv: [] }))
  let sourceMaterial: THREE.MeshStandardMaterial | null = null
  const worldPoint = new THREE.Vector3()
  const centroid = new THREE.Vector3()
  const normal = new THREE.Vector3()

  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const geometry = object.geometry
    const position = geometry.getAttribute('position')
    const normalAttribute = geometry.getAttribute('normal')
    const uv = geometry.getAttribute('uv')
    const index = geometry.index
    const triangleCount = index ? index.count / 3 : position.count / 3
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld)
    if (!sourceMaterial) {
      const material = Array.isArray(object.material) ? object.material[0] : object.material
      if (material instanceof THREE.MeshStandardMaterial) sourceMaterial = material
    }

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const vertexIndices = [0, 1, 2].map((corner) => index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner)
      centroid.set(0, 0, 0)
      for (const vertex of vertexIndices) {
        worldPoint.fromBufferAttribute(position as THREE.BufferAttribute, vertex).applyMatrix4(object.matrixWorld)
        centroid.add(worldPoint)
      }
      centroid.multiplyScalar(1 / 3).sub(centre)
      const height = centroid.y / halfHeight
      const band = bandOf(height)
      const sector = sectorOf(Math.atan2(centroid.z, centroid.x))
      const cell = Math.min(cellCount - 1, band * 4 + sector)
      const target = buffers[cell]

      for (const vertex of vertexIndices) {
        worldPoint.fromBufferAttribute(position as THREE.BufferAttribute, vertex)
          .applyMatrix4(object.matrixWorld)
          .sub(centre)
          .multiplyScalar(scale)
        target.position.push(worldPoint.x, worldPoint.y, worldPoint.z)
        if (normalAttribute) {
          normal.fromBufferAttribute(normalAttribute as THREE.BufferAttribute, vertex).applyMatrix3(normalMatrix).normalize()
          target.normal.push(normal.x, normal.y, normal.z)
        }
        if (uv) target.uv.push(uv.getX(vertex), uv.getY(vertex))
      }
    }
  })

  const parts = buffers.map((buffer, index) => {
    const group = new THREE.Group()
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.position, 3))
    if (buffer.normal.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffer.normal, 3))
    else geometry.computeVertexNormals()
    if (buffer.uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uv, 2))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const material = dress(
      sourceMaterial ? (sourceMaterial.clone() as THREE.MeshStandardMaterial) : new THREE.MeshStandardMaterial(),
      { glow: 0.36, env: 1.75, metalness: 0.8, roughness: 0.4 },
    )
    // Al abrirse se ve el canto del corte: con una sola cara quedaría el hueco.
    material.side = THREE.DoubleSide
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = SHELL_CELLS[index].name
    group.add(mesh)
    return group
  })
  return { parts, materials: parts.map((part) => (part.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial) }
}

/*
  El corredor de datos.

  Antes el túnel era UNA copia del modelo escalada a 5,4 u sobre su arista más
  larga: un trozo de tubo de metro y medio de radio con la cámara pegada a la
  pared y sin nada delante. No se leía como profundidad porque no había
  profundidad que leer —y encima la cámara no avanzaba ni un milímetro durante
  todo el tramo de entrada, así que tampoco había paralaje—. El resultado era la
  pared cian del vídeo.

  Ahora el modelo se repite en fila. Tres tramos encadenados dan veintisiete
  unidades de tubo por delante, con punto de fuga, y la cámara los recorre de
  verdad: las paredes pasan, el fondo se acerca y eso es lo que el ojo lee como
  velocidad y como distancia.
*/
const CORRIDOR_SEGMENT = 8.9
const CORRIDOR_SEGMENTS = 3

/** Los doce cantos del cubo, en coordenadas normalizadas (arista = 1). */
const CUBE_EDGES: ReadonlyArray<{ mid: [number, number, number]; axis: 'x' | 'y' | 'z' }> = (() => {
  const edges: Array<{ mid: [number, number, number]; axis: 'x' | 'y' | 'z' }> = []
  const s = 0.5
  for (const sy of [-s, s]) for (const sz of [-s, s]) edges.push({ mid: [0, sy, sz], axis: 'x' })
  for (const sx of [-s, s]) for (const sz of [-s, s]) edges.push({ mid: [sx, 0, sz], axis: 'y' })
  for (const sx of [-s, s]) for (const sy of [-s, s]) edges.push({ mid: [sx, sy, 0], axis: 'z' })
  return edges
})()

const AXIS_UP: Record<'x' | 'y' | 'z', THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

const SMALL_MODULE_COUNT = 22

export function PlatformCast({ sceneState }: { sceneState: PlatformStateRef }) {
  const baseGltf = useGLTF(BASE_URL, false, true)
  const cubeGltf = useGLTF(CUBE_URL, false, true)
  const coreGltf = useGLTF(CORE_URL, false, true)
  const tunnelGltf = useGLTF(TUNNEL_URL, false, true)

  /*
    Un modelo, un papel. El cubo se usaba dos veces —entero como carcasa y otra
    vez encogido como «rack interior»—, y esa segunda copia se veía flotando
    fuera del cubo como si fuera un error de dibujo. El interior lo enseña ahora
    el núcleo, que es el modelo que existe para eso.
  */
  // La base lleva su energía pintada en la textura: encenderla además la borraba
  // de blanco y se perdía todo el relieve mecánico, que es lo que la hace base.
  const base = useMemo(() => dressedModel(baseGltf.scene, 6.4, { glow: 0.1, env: 1.5, metalness: 0.84, roughness: 0.38 }), [baseGltf.scene])
  const split = useMemo(() => cubeLayers(cubeGltf.scene), [cubeGltf.scene])
  /*
    Tamaño real del núcleo — medido, no adivinado (`tmp/inspect-core-bounds.mjs`
    contra la escena en vivo, `?heroDebug=1`). El histórico "radio ≈0,66–0,71"
    de los comentarios de más abajo estimaba a ojo sobre el brillo, no sobre la
    malla: la malla real de `energy-core.glb` no es una esfera, es una caja
    irregular de 2×1,58×1,77 en crudo, y a `size=1,15` su MEDIA DIAGONAL (la
    esquina más lejana del centro, la que de verdad importa para "¿la cámara
    está dentro?") medía 0,89 u ya al multiplicador de escala base (1,0) —
    antes incluso de los multiplicadores de `assembly`/`interiorGrowth`/
    `reactorWeight` que la crecen más durante la visita interior, hasta
    ≈1,04–1,2 u de esquina. La cámara pasa a 0,94–1,4 u del centro durante las
    cuatro estaciones —dentro de esa esquina la mayor parte del tiempo—, lo
    que explica el fotograma quemado en blanco medido en p=0,62–0,89 (ver
    `scripts/platform-rail-report.mjs`): no era sólo brillo de material —dos
    pasadas bajándolo apenas cambiaron el resultado—, era la malla sólida
    ocupando el mismo volumen que la cámara. Bajado a 0,55 (media diagonal
    ≈0,42 u al multiplicador base, ≈0,49–0,58 u en su pico) deja margen real
    bajo el umbral de 0,45 u en las estaciones sin tocar el cruce físico
    deliberado de `CORE_ENTRY`/`CORE_EXIT` en tránsito. Lo que el núcleo
    pierde en tamaño de malla lo compensan los elementos ya existentes que NO
    son sólidos —anillos, wireframe de contención, haz vertical, tendones— sin
    volver a arriesgar un choque de cámara.
  */
  const core = useMemo(() => dressedModel(coreGltf.scene, 0.55, { glow: 0.6, env: 2, metalness: 0.6, roughness: 0.3 }), [coreGltf.scene])
  const corridor = useMemo(() => {
    const group = new THREE.Group()
    for (let index = 0; index < CORRIDOR_SEGMENTS; index += 1) {
      const segment = dressedModel(tunnelGltf.scene, CORRIDOR_SEGMENT, { glow: 0.1, env: 0.32, metalness: 0.5, roughness: 0.72 })
      segment.position.z = -index * CORRIDOR_SEGMENT
      group.add(segment)
    }
    return group
  }, [tunnelGltf.scene])

  const cubeMaterials = split.materials
  const baseMaterials = useMemo(() => materialsOf(base), [base])
  const coreMaterials = useMemo(() => materialsOf(core), [core])
  const corridorMaterials = useMemo(() => materialsOf(corridor), [corridor])
  const baseRoot = useRef<THREE.Group>(null)
  const cubeAssemblyRoot = useRef<THREE.Group>(null)
  const coreRoot = useRef<THREE.Group>(null)
  const coreWireframe = useRef<THREE.LineSegments>(null)
  const coreWireMaterial = useRef<THREE.LineDashedMaterial>(null)
  const corridorRoot = useRef<THREE.Group>(null)
  const levitationRing = useRef<THREE.Mesh>(null)
  const levitationMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const beamCore = useRef<THREE.MeshBasicMaterial>(null)
  const beamHalo = useRef<THREE.MeshBasicMaterial>(null)
  const coreBeamCore = useRef<THREE.MeshBasicMaterial>(null)
  const coreBeamHalo = useRef<THREE.MeshBasicMaterial>(null)
  /*
    Portal de salida (punto 11): tres aros que se ensamblan y giran, teñidos
    de la misma paleta violeta que ya usa el corredor de salida
    (`corridorExitTint`) — la entrada es cian, la salida vira a violeta, sin
    inventar un cuarto material.
  */
  const exitRings = useRef<Array<THREE.Mesh | null>>([])
  const exitRingMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  /*
    Luz de canto del portal de salida (punto 11 — "el portal debe proyectar
    luz de canto real sobre los objetos cercanos"). Antes los aros sólo se
    dibujaban a sí mismos: nada de lo que hay alrededor —las paredes del
    propio corredor— sabía que ahí había una fuente de luz. Es hija de
    `corridorRoot`, así que hereda su posición sin plumbing aparte: donde
    estén los aros, ahí está la luz.
  */
  const exitPortalLight = useRef<THREE.PointLight>(null)
  const signTexture = useMemo(() => makeProcessSignTexture(), [])
  const signMaterial = useRef<THREE.MeshBasicMaterial>(null)
  useEffect(() => () => signTexture.dispose(), [signTexture])
  const modules = useRef<Array<THREE.Group | null>>([])
  /*
    Tendones de energía entre el núcleo y cada celda de la cáscara.

    El hueco que abre `SHELL_CELLS.exploded` no tenía nada que lo cruzara:
    doce celdas y un núcleo flotando en un vacío, exactamente durante la
    meseta de lectura de las cuatro estaciones. Un cilindro unitario estirado
    por celda —orientado por cuaternión hacia la posición en vivo de esa
    celda, ya calculada más abajo— cuesta sólo una actualización de matriz
    por fotograma, sin reconstruir geometría.
  */
  const tendrilGeometry = useMemo(() => new THREE.CylinderGeometry(0.016, 0.016, 1, 5, 1, true), [])
  /*
    Campo de contención del núcleo, no bounding-box de depuración.

    Era un `boxGeometry` con `wireframe: true`: eso dibuja también las
    diagonales con las que Three.js triangula cada cara, así que cada lado
    del cubo mostraba una X — la lectura de "caja de Blender" que se pidió
    quitar. `EdgesGeometry` extrae sólo las 12 aristas reales del cubo (sin
    diagonales), y como `LineSegments` con `LineDashedMaterial` puede llevar
    trazo discontinuo — el `dashOffset` se anima en el propio `useFrame` para
    que el guión "recorra" el campo como una línea de escaneo viva, no una
    caja estática.
  */
  const containmentGeometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 1.3, 1.3)), [])
  useEffect(() => {
    // `LineDashedMaterial` necesita las distancias acumuladas por segmento;
    // se calculan una vez sobre el objeto montado, no sobre la geometría.
    coreWireframe.current?.computeLineDistances()
    return () => containmentGeometry.dispose()
  }, [containmentGeometry])
  const tendrils = useRef<Array<THREE.Mesh | null>>([])
  const tendrilMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const tendrilUp = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const tendrilQuat = useMemo(() => new THREE.Quaternion(), [])
  const tendrilAxis = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => () => tendrilGeometry.dispose(), [tendrilGeometry])

  /*
    FRAMES: los doce cantos del cubo, como grupo de movimiento propio.

    La malla única no trae aristas como objeto aparte, así que se dibujan
    aquí, procedurales, sobre un `instancedMesh` de doce instancias — un solo
    draw call. Cada canto expande en la dirección de su propio punto medio y
    gira sobre sí mismo, distinto del movimiento puramente radial de la
    cáscara (`OUTER_SHELL`/`PANELS`).
  */
  const frameInstances = useRef<THREE.InstancedMesh>(null)
  const frameMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const frameDummy = useMemo(() => new THREE.Object3D(), [])
  const frameQuat = useMemo(() => new THREE.Quaternion(), [])
  const frameDir = useMemo(() => new THREE.Vector3(), [])

  /*
    SMALL_MODULES: micro-cubos que orbitan el núcleo.

    Doble función: son el grupo "módulos pequeños" del desensamblaje (expansión
    radial más amplia que la cáscara) y, a la vez, los micro-cubos que el
    punto 6 pide alrededor del Data Core — con el mismo radio, más cerrado
    cuando el núcleo aún no ha crecido.
  */
  const smallModuleInstances = useRef<THREE.InstancedMesh>(null)
  const smallModuleMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const smallModuleDummy = useMemo(() => new THREE.Object3D(), [])
  const smallModuleSeeds = useMemo(() => Array.from({ length: SMALL_MODULE_COUNT }, (_, index) => {
    const random = (n: number) => {
      const v = Math.sin((index * 91.7 + n) * 43758.5453)
      return v - Math.floor(v)
    }
    const theta = random(1) * Math.PI * 2
    const phi = Math.acos(random(2) * 2 - 1)
    return {
      dir: new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.72, Math.sin(phi) * Math.sin(theta)),
      spin: 0.6 + random(3) * 1.8,
      radiusJitter: 0.75 + random(4) * 0.5,
      scale: 0.055 + random(5) * 0.05,
      spinAxis: new THREE.Vector3(random(6) - 0.5, random(7) - 0.5, random(8) - 0.5).normalize(),
    }
  }), [])

  /*
    RINGS: dos toros junto al núcleo, además del `levitationRing` de la base.

    Se separan en vertical y giran al abrirse — el movimiento que el punto 5
    pide para este grupo, distinto de la cáscara y de los tendones.
  */
  const coreRingA = useRef<THREE.Mesh>(null)
  const coreRingB = useRef<THREE.Mesh>(null)
  const coreRingMaterialA = useRef<THREE.MeshBasicMaterial>(null)
  const coreRingMaterialB = useRef<THREE.MeshBasicMaterial>(null)

  /*
    Los dos túneles de cristal —el de entrada y el de salida— reutilizaban
    exactamente el mismo material y la misma curva de emisión: sólo la
    posición los distinguía. Un tinte suave (mezclado sobre el blanco, no en
    su lugar: el corredor sigue necesitando reflejo pleno) separa "llegar"
    de "partir" sin crear un segundo GLB ni una segunda geometría.
  */
  const corridorEntryTint = useMemo(() => new THREE.Color('#bfe9ff'), [])
  const corridorExitTint = useMemo(() => new THREE.Color('#f0c8ff'), [])

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const assembly = assemblyWeight(p)
    const activation = activationWeight(p)
    /*
      Atenuación durante lectura (pedido explícito, valores objetivo del
      encargo): "durante cada READ HOLD, el concepto activo debe dominar" —
      núcleo a 0,45, maquinaria cercana a 0,20, con el propio glifo y texto
      de la estación en 1,0 sin tocar (eso ya lo gobierna `conceptFrame`/
      `stationArrival` en `platform-glyphs.tsx`/`platform-chapter.tsx`, no
      esto). `readingHold` ya es la señal correcta — sube en el centro de
      cada estación, baja en los bordes — así que sólo hacía falta LEERLA
      aquí, donde vive la maquinaria, y no sólo en `PlatformDataRails`.
    */
    const hold = readingHold(p)
    const coreReadDim = 1 - hold * 0.55
    const machineryReadDim = 1 - hold * 0.8
    /*
      Sólo atenuar el emisivo no bastaba en INCLUSIÓN — capturado en vivo:
      `interiorGrowth` (crece de CORE_ENTRY a INCLUSION, ver más abajo) deja
      el núcleo en su tamaño máximo justo en la ÚLTIMA estación, y un núcleo
      más grande satura el bloom por ÁREA aunque su brillo por píxel baje
      (misma lección que la "cuarta vuelta" del cruce de CORE_ENTRY). Encoger
      un poco el propio tamaño durante la lectura, no sólo el brillo.
    */
    const coreReadScaleDim = 1 - hold * 0.4
    /*
      La instalación entera (cubo, base, anillo de levitación, núcleo — todo
      lo que cuelga de `cubeReveal`/`baseReveal`/`ringReveal`) se quedaba
      visible a opacidad plena desde `CHAMBER` hasta el último fotograma:
      medido con capturas en p=0,93–0,99, el cubo reensamblado seguía siendo
      el sujeto dominante del encuadre mientras la cámara ya debía estar en
      `PORTAL_EXIT`/`TUNNEL_EXIT` — la salida se sentía como un corte, no
      como una entrega, y el letrero "03 · PROCESO" competía con un cubo
      entero de fondo en vez de tener la escena para él. Comparte ventana con
      `exitPortalWeight` (mismo `[CORE_EXIT, PORTAL_EXIT]`) a propósito: la
      instalación se apaga exactamente al ritmo en que los aros de salida se
      encienden, así que es un relevo, no una desaparición.
    */
    const installationFade = 1 - smootherstep(at('CORE_EXIT'), until('PORTAL_EXIT'), p)
    const ringReveal = smootherstep(0.1, 0.17, p) * installationFade
    /*
      Adelantada de [0.10, 0.19] a [0.04, 0.14]: durante el relevo
      Inicio→Plataforma (HANDOFF) el corredor era la única cosa con volumen
      en pantalla. Ahora se intuye la silueta de la base al fondo del túnel
      antes de que el cubo se revele, sin adelantar `cubeReveal` —el cubo
      conserva su aparición propia, sin spoiler.
    */
    const baseReveal = smootherstep(0.04, 0.14, p) * installationFade
    /*
      Platform Chamber: el cubo tiene que estar visible —pequeño y lejano—
      durante toda la sala grande, no aparecer recién en `ACTIVATION`
      (0,39 con el reparto nuevo). Se revela rápido dentro de `CHAMBER`
      mismo; lo que lo hace "crecer" después es sólo la cámara acercándose
      en `CUBE_APPROACH` —este peso ya no se mueve una vez asentado, así
      que no compite con esa aproximación.
    */
    const cubeReveal = smootherstep(0.12, 0.155, p) * installationFade
    /*
      Salida limpia (pedido explícito): "Inclusión → estaciones fuera →
      ambiente baja → Core → beam → portal → túnel". La cáscara/base/anillo
      de levitación ya se apagan con `installationFade` desde el ARRANQUE de
      `CORE_EXIT` — eso es "maquinaria" y sale primero. El núcleo (+ sus
      anillos y su haz propio) se queda con su propia salida, que no empieza
      a apagarse hasta que `CORE_EXIT` TERMINA: se queda de pie solo,
      visiblemente la fuente del haz que arma el portal, durante todo
      `PORTAL_EXIT`, y sólo entonces se retira.
    */
    const coreExitFade = 1 - smootherstep(until('CORE_EXIT'), until('PORTAL_EXIT'), p)
    const coreVisibility = smootherstep(0.12, 0.155, p) * coreExitFade
    signal.assemblyWeight = assembly
    signal.activationWeight = activation
    signal.reactorWeight = smootherstep(0.34, 0.58, p) * (1 - smootherstep(until('CORE_EXIT'), until('PORTAL_EXIT'), p))
    // Pulso de reconocimiento: sube y baja dentro de ACTIVATION, no una rampa.
    const activationPulse = activation * (0.5 + 0.5 * Math.sin(signal.time * 6))

    if (baseRoot.current) {
      baseRoot.current.rotation.y = -0.08 + p * 0.16
      baseRoot.current.position.y = -3.42 + baseReveal * 0.07
      baseRoot.current.scale.setScalar(0.9 + baseReveal * 0.1)
      /*
        `fade()` sólo atenúa opacidad/transparencia, y sobre un metal casi
        puro (`metalness` 0,84) reflejando el entorno eso no basta —el
        reflejo especular seguía leyéndose a brillo pleno aun con la
        opacidad baja, medido en vivo: capturas idénticas antes y después de
        atenuar sólo el material. Ocultar el objeto entero durante la
        lectura (no sólo desvanecerlo) es lo que de verdad lo saca de
        encuadre.
      */
      baseRoot.current.visible = baseReveal > 0.003 && machineryReadDim > 0.3
    }
    /*
      Culpable real del fotograma quemado en INCLUSIÓN (quinta pasada,
      confirmado apagando actores uno por uno): no era el núcleo ni el
      holograma —los primeros sospechosos, ya investigados y descartados—,
      era esta BASE. Pensada para verse de lejos en `CHAMBER` (6,4 u de
      arista mayor), es la única de las cuatro estaciones cuya cámara mira
      HACIA ABAJO (el ancla de Inclusión está bajo el núcleo), así que es la
      única cuyo encuadre cae de lleno sobre esta pieza — mucho más cerca de
      lo que se diseñó para verse. Mismo criterio que el resto de
      "maquinaria cercana": se atenúa durante la lectura, no fuera de ella.
    */
    fade(baseMaterials, baseReveal * machineryReadDim)

    if (cubeAssemblyRoot.current) {
      const breath = signal.reducedMotion ? 1 : 1 + Math.sin(signal.time * 0.72) * 0.0035
      cubeAssemblyRoot.current.scale.setScalar(breath)
      /*
        Novena pasada: retirada la presentación por caras (`faceRotation`
        se eliminó — ver `lib/platform/timeline.ts`), el cubo se queda en su
        mismo ángulo de reposo de siempre durante `CHAMBER`/`CUBE_APPROACH`/
        `ACTIVATION`, y de ahí en adelante `DISASSEMBLY` toma el relevo
        moviendo cada pieza por su cuenta (más abajo) — ya no hay ningún
        giro de cuerpo completo que deshacer.

        El temblor ambiental usa `signal.time` (reloj real, no progreso) a
        propósito para sentirse vivo — pero durante la lectura de una
        estación interior ("no camera drift... aunque matemáticamente sea
        mínimo, se siente como desincronización", pedido explícito) hasta
        este medio grado de giro continuo compite con el glifo/texto ya
        fijos. Atenuado con la misma señal que ya usa `DirectedCameraRig`
        (`hero-scene.tsx`) para congelar la cámara en cada estación — una
        sola fuente de verdad para "¿cuánto estamos leyendo ahora?", y la
        misma rampa evita que el temblor se corte de golpe al entrar/salir.
      */
      cubeAssemblyRoot.current.rotation.y = CUBE_REST_ANGLE
        + (signal.reducedMotion ? 0 : Math.sin(signal.time * (0.19 + activation * 0.6)) * 0.012 * (1 - stationCameraFreezeWeight(p)))
      cubeAssemblyRoot.current.visible = cubeReveal > 0.003
    }
    fade(cubeMaterials, cubeReveal)
    for (const material of cubeMaterials) {
      // El neón del modelo sube cuando el reactor está encendido, y late
      // durante el reconocimiento previo a la apertura. Se atenúa durante
      // la lectura de una estación — "maquinaria cercana" del encargo.
      material.emissiveIntensity = (0.34 + signal.reactorWeight * 0.3 + activationPulse * 0.55) * machineryReadDim
    }

    /*
      El núcleo vive dentro del cubo y sólo se descubre cuando las celdas se
      apartan. No se le baja la opacidad para «verlo a través»: se ve porque
      hay una ventana abierta, que es lo que hace legible la apertura.
    */
    const coreReveal = smootherstep(0.28, 0.5, assembly)
    /*
      Pulso de refracción al cruzar la cáscara del núcleo — misma señal que
      usa `DirectedCameraRig` en `hero-scene.tsx` para el pulso de FOV/bloom
      del composer (`coreCrossWeight` en `lib/platform/camera-rail.ts`), así
      que el material y la cámara laten a la vez, no por separado. Cubre
      tanto CORE_ENTRY como CORE_EXIT: el cruce es físico en los dos sentidos.
    */
    const coreEntry = coreCrossWeight(p)
    /*
      Sólo el lado de SALIDA necesita un recorte mucho más fuerte que el de
      entrada (ver comentario "Quinta vuelta" más abajo) — `CORE_ENTRY` ya
      está aceptado tal cual (congelado, "core scale" en el encargo) y no
      debe moverse. `coreEntry` mezcla ambos lados con `Math.max`, así que
      aislar el de salida es tan simple como mirar en qué mitad del capítulo
      estamos: `CORE_ENTRY` y `CORE_EXIT` no se solapan nunca.
    */
    const coreExitCrossing = p >= at('CORE_EXIT') ? coreEntry : 0
    if (coreRoot.current) {
      coreRoot.current.rotation.y = p * 2.6
      coreRoot.current.rotation.x = p * 0.24
      coreRoot.current.visible = coreVisibility > 0.02
      /*
        El núcleo crece con `assembly` y, además, con la propia visita
        interior: durante EVALUACIÓN→INCLUSIÓN sigue creciendo un poco más,
        para que nunca se sienta "una esfera perdida en un hueco" mientras
        dura la parte más larga del capítulo. `coreEntry` le da un pico de
        escala en el instante del cruce, como un latido al entrar.
      */
      /*
        Bajado de 0,18 a 0,11 (quinta pasada): capturado en vivo, para
        INCLUSIÓN —la última estación, con `interiorGrowth` ya en su pico—
        el núcleo llenaba el encuadre por completo. La cámara está más cerca
        del CENTRO DEL NÚCLEO (~0,96 u) que del propio ancla del glifo
        (~2,04 u, la distancia con la que sí se midió el tamaño de 0,46 en
        `platform-glyphs.tsx`), así que un núcleo que sigue creciendo pesa
        mucho más de lo que su tamaño nominal sugiere.
      */
      const interiorGrowth = smootherstep(at('CORE_ENTRY'), at('INCLUSION'), p) * 0.11
      /*
        Segunda vuelta de tuerca: seguía saliendo blanco puro en el cruce.
        La cámara pasaba a distancia ~0,83 de un núcleo cuyo radio, en el
        pico de `coreEntry`, ya rondaba 0,87 — literalmente dentro de la
        malla, con bloom encima. Ahora el núcleo se queda más pequeño en su
        pico (radio ≈0,66) y `CORE_ENTRY_INNER` se aleja a ~1,1 (ver
        `camera-rail.ts`): la cámara SÍ atraviesa la cáscara al viajar entre
        las dos claves —eso pasa en tránsito, no en el reposo de ninguna—,
        pero ya no se queda empotrada en ella.

        Tercera vuelta: seguía sin bastar. Capturado con `?platformTest=1`
        en p=0,63 (CORE_ENTRY) y p=0,89 (CORE_EXIT): el fotograma entero sale
        blanco, sin ninguna forma legible. La base ya estaba a 0,86 de
        emisivo —justo en el umbral del bloom (0,86 en `UnrealBloomPass`,
        `hero-scene.tsx`)— así que el pico de `coreEntry` (antes +0,22 de
        emisivo y +0,08 de escala, EN EL MISMO INSTANTE en que la cámara ya
        está más cerca) no añadía un brillo más fuerte: añadía más ÁREA
        brillante en pantalla, y el bloom crece con el área, no sólo con la
        intensidad.

        Cuarta vuelta: bajar sólo el pico no bastó — recapturado, el mismo
        blanco seguía ahí. La base (0,86 de emisivo, YA en el umbral) es la
        que domina, no el pico; y en tránsito la cámara pasa más cerca del
        núcleo de lo que su clave de reposo sugiere (por diseño — "eso pasa
        en tránsito", comentario de arriba), así que crecer el núcleo en ese
        instante —aunque sea poco— es exactamente lo contrario de lo que
        hace falta. Ahora `coreEntry` ENCOGE el núcleo en vez de crecerlo, y
        además atenúa multiplicativamente tanto el emisivo base como el
        entorno reflejado (`envMapIntensity`, fijado una vez en `dress()`
        pero mutable aquí) durante el cruce — apagar la fuente en vez de
        sólo esperar a que el bloom no la vea.

        Quinta vuelta (sexta pasada, lado SALIDA): con la holgura de cámara
        ya arreglada (`INCLUSION_RELEASE`, ver `camera-rail.ts`) y la
        atenuación de lectura ya al máximo (`hold`≈1) el blanco seguía
        idéntico en p≈0,888-0,898 — la prueba de que ninguno de los dos
        mecanismos de atenuación era la causa aquí. Con el radio del
        núcleo YA REDUCIDO al mínimo que permitía `coreReadScaleDim`
        (factor ×0,6 en su punto más fuerte) el ángulo que ocupa en pantalla
        a ~0,83 u de distancia seguía por encima del FOV de la cámara —
        geometría, no brillo: ningún atenuado de material iba a arreglar un
        objeto más ancho que el propio encuadre. `CORE_ENTRY` no sufre esto
        (cámara más lejos en su propio cruce, y "core scale" ya está
        congelado ahí), así que el recorte extra sólo se suma con
        `coreExitCrossing` —cero en todo el lado de entrada, idéntico a
        antes— y se deja el `coreEntry*0,12`/`coreEntry*0,6` de siempre para
        que CORE_ENTRY no cambie ni un píxel.
      */
      coreRoot.current.scale.setScalar(
        (0.72 + assembly * 0.34 + interiorGrowth + signal.reactorWeight * 0.1 - coreEntry * 0.12 - coreExitCrossing * 0.83 + Math.sin(signal.time * 1.5) * 0.012) * coreVisibility * coreReadScaleDim,
      )
    }
    fade(coreMaterials, coreVisibility)
    for (const material of coreMaterials) {
      // Se quedaba en 2,3 y salía blanco puro: un núcleo quemado no tiene forma.
      const crossingDim = 1 - coreEntry * 0.6 - coreExitCrossing * 0.25
      material.emissiveIntensity = ((0.42 + coreReveal * 0.28 + signal.reactorWeight * 0.16) * crossingDim
        + coreEntry * 0.1 + Math.sin(signal.time * 1.4) * 0.04) * coreReadDim
      material.envMapIntensity = 2 * crossingDim
    }
    if (coreWireframe.current) {
      coreWireframe.current.visible = coreReveal > 0.05
      coreWireframe.current.rotation.y = -p * 1.4
      coreWireframe.current.scale.setScalar(1.5 + coreEntry * 0.25)
    }
    if (coreWireMaterial.current) {
      /*
        0,12-0,20 de techo (pedido explícito): un campo de contención se lee
        de un vistazo si es discreto. Un pulso lento en vez de opacidad fija
        —la diferencia entre "caja estática" y "energía viva conteniendo
        algo"— ya que esta versión de Three no expone `dashOffset` animable
        en `LineDashedMaterial` para hacer "correr" el guión en su lugar.
      */
      coreWireMaterial.current.opacity = 0.12 + (coreReveal * 0.5 + coreEntry * 0.3) * 0.05
        + Math.sin(signal.time * 0.9) * 0.02
    }

    if (levitationRing.current) {
      levitationRing.current.rotation.z = p * (1.7 + activation * 4)
      levitationRing.current.position.y = -1.72 - assembly * 0.1
      levitationRing.current.scale.setScalar(1 + assembly * 0.06 + activationPulse * 0.05)
      levitationRing.current.visible = ringReveal > 0.004
    }
    /*
      Encontrado en vivo (quinta pasada, diagnóstico de pantalla completa):
      este anillo —decoración del PEDESTAL, pensada para verse desde lejos
      en `CHAMBER`— vive fijo en y=−1,82. La cámara de INCLUSIÓN es la única
      de las cuatro estaciones que mira HACIA ABAJO (su ancla está debajo
      del núcleo), así que es la única cuyo eje de mirada cae casi encima de
      este anillo —mucho más cerca de lo que se diseñó para verse—, y de ahí
      el fotograma quemado detectado en la validación. Coincide exactamente
      con el punto 6 del encargo ("una pieza oscura cruza casi todo el
      centro superior de la pantalla" en INCLUSIÓN). Se atenúa con la misma
      señal que ya usa la maquinaria cercana durante la lectura.
    */
    if (levitationMaterial.current) levitationMaterial.current.opacity = ringReveal * (0.82 + activationPulse * 0.4) * machineryReadDim

    // RINGS junto al núcleo: separación vertical + spin al abrirse.
    // Misma oleada 4 que FRAMES (pedido: "frames and rings" juntos) — se
    // atenúa la opacidad, no la posición/escala, para que no se vean saltar
    // a un sitio ya separado cuando por fin se encienden.
    const ringWave = smootherstep(0.32, 0.58, assembly)
    if (coreRingA.current) {
      coreRingA.current.position.y = assembly * 0.62
      coreRingA.current.rotation.z = p * 2.1
      coreRingA.current.scale.setScalar(1 + assembly * 0.5)
      coreRingA.current.visible = coreVisibility > 0.02 && (assembly > 0.02 || activation > 0.02)
    }
    if (coreRingMaterialA.current) coreRingMaterialA.current.opacity = (assembly * 0.55 + activationPulse * 0.3) * coreVisibility * ringWave * machineryReadDim
    if (coreRingB.current) {
      coreRingB.current.position.y = -assembly * 0.62
      coreRingB.current.rotation.z = -p * 1.7
      coreRingB.current.scale.setScalar(1 + assembly * 0.4)
      coreRingB.current.visible = coreVisibility > 0.02 && (assembly > 0.02 || activation > 0.02)
    }
    if (coreRingMaterialB.current) coreRingMaterialB.current.opacity = (assembly * 0.45 + activationPulse * 0.25) * coreVisibility * ringWave * machineryReadDim

    const beamPulse = 0.78 + Math.sin(signal.time * 2.1) * 0.1
    if (beamCore.current) beamCore.current.opacity = baseReveal * (0.11 + signal.reactorWeight * 0.13) * beamPulse
    if (beamHalo.current) beamHalo.current.opacity = baseReveal * (0.03 + signal.reactorWeight * 0.04) * beamPulse
    /*
      Haz vertical propio del núcleo (punto 6): nace y muere con la
      apertura. No llevaba NINGÚN atenuado de lectura —a diferencia del
      material del núcleo (`coreReadDim`) o sus anillos (`machineryReadDim`)—
      así que se quedaba a brillo pleno incluso cuando la cámara de
      `CORE_EXIT_INNER` mira derecho por su propio eje (a diferencia de las
      cuatro estaciones, cuyo ancla está descentrada del núcleo): mirar de
      frente a un haz de mezcla aditiva es mucho más brillante que verlo de
      lado, y con blending aditivo + `toneMapped=false` alimenta el bloom
      sin que el atenuado del material del núcleo lo frenara. Mismo
      `coreReadDim` que ya usa el emisivo del núcleo — es literalmente "su
      haz propio", debe apagarse con él.
    */
    if (coreBeamCore.current) coreBeamCore.current.opacity = assembly * 0.28 * beamPulse * coreVisibility * coreReadDim
    if (coreBeamHalo.current) coreBeamHalo.current.opacity = assembly * 0.08 * beamPulse * coreVisibility * coreReadDim

    modules.current.forEach((module, index) => {
      if (!module) return
      module.visible = cubeReveal > 0.003
      const spec = SHELL_CELLS[index]
      const stagger = smootherstep(spec.delay, Math.min(1, spec.delay + 0.4), assembly)
      /*
        PANELS (banda media): a la expansión radial se le suma una órbita
        propia, distinta del resto de la cáscara — mismo mecanismo, otra ley
        de movimiento, que es justo lo que pide el desensamblaje granular.

        Medido con `scripts/platform-rail-report.mjs` (`?heroDebug=1`,
        distancia real en espacio local con el factor de escala de mundo
        aplicado a mano): esta órbita giraba con `signal.time` —el reloj real,
        no el progreso— así que durante toda la visita interior (`CORE_ENTRY`
        a `CORE_EXIT`, donde `assembly`≈1 y por tanto la órbita no deja de
        girar) las PANELS barrían continuamente TODOS los ángulos alrededor
        del núcleo a un radio (~0,9–1,2 u) que se solapa de lleno con dónde
        vive la cámara en ese mismo tramo (~0,3–1,4 u del centro): no hay radio
        fijo que las saque del camino, porque la cámara también recorre ese
        rango entero entre `CORE_ENTRY_OUTER` y las cuatro estaciones. Subir
        sólo el radio (intento anterior) simplemente desplazaba el solape a
        otro punto del barrido en vez de quitarlo.

        La órbita en sí, además, rompía el principio del capítulo —
        `state = f(progress)`, reversible— que el resto del riel sí respeta:
        dependía del reloj real, no de dónde está el scroll.

        Arreglo real: la órbita pasa a ser función de progreso, y ese
        progreso se CONGELA en el arranque de `CORE_ENTRY` (`Math.min`) — se
        ve barrer mientras el cubo se desensambla (movimiento real, vendido
        por el propio scroll) y luego se queda fija, en un ángulo conocido y
        reproducible, durante toda la visita interior. Con una órbita fija en
        vez de infinita, el radio extra (`panelClearance`) sólo tiene que
        despejar ESE ángulo concreto, no todos los ángulos posibles — y sí
        alcanza.
      */
      const isPanel = spec.band === 1
      const orbitClock = Math.min(p, at('CORE_ENTRY'))
      const orbit = isPanel ? orbitClock * 2.1 * stagger : 0
      const cos = Math.cos(orbit)
      const sin = Math.sin(orbit)
      const panelInteriorWeight = smootherstep(at('CORE_ENTRY') - 0.015, at('CORE_ENTRY') + 0.01, p)
        * (1 - smootherstep(until('CORE_EXIT') - 0.01, until('CORE_EXIT') + 0.015, p))
      const panelClearance = isPanel ? 1 + panelInteriorWeight * 0.75 : 1
      /*
        Transformación mecánica, no explosión (pedido explícito) — sin tocar
        el reposo ya aprobado: `spec.exploded`/`spec.rotation` en stagger=1
        no cambian. Lo que cambia es CÓMO se llega ahí. Un bulto temprano en
        `stagger` (`hingeBump`, 0 en stagger=0 y stagger≥0,5) hace dos cosas
        a la vez: retrae la pieza levemente hacia el centro antes de que
        continúe saliendo (`pullback`, igual que un cajón que se abre
        empujando primero) y le suma un giro extra sobre el eje TANGENCIAL a
        su propia dirección de salida — el eje de una bisagra real, no el de
        salida radial — que se deshace por completo antes de que la pieza
        llegue a su reposo. Ninguna composición final cambia; sólo el
        trayecto deja de sentirse como una sola pieza clonada volando en
        línea recta.
      */
      const hingeBump = smootherstep(0.08, 0.22, stagger) * (1 - smootherstep(0.22, 0.5, stagger))
      const pullback = 1 - hingeBump * 0.22
      const dirLength = Math.hypot(spec.exploded[0], spec.exploded[2]) || 1
      const dirX = spec.exploded[0] / dirLength
      const dirZ = spec.exploded[2] / dirLength
      const hingeSign = spec.exploded[1] >= 0 ? 1 : -1
      const swing = hingeBump * 0.85 * hingeSign
      const ex = spec.exploded[0] * stagger * panelClearance * pullback
      const ez = spec.exploded[2] * stagger * panelClearance * pullback
      module.position.set(
        isPanel ? ex * cos - ez * sin : ex,
        spec.exploded[1] * stagger * pullback,
        isPanel ? ex * sin + ez * cos : ez,
      )
      module.rotation.set(
        spec.rotation[0] * stagger - dirZ * swing,
        spec.rotation[1] * stagger + orbit * 0.4,
        spec.rotation[2] * stagger + dirX * swing,
      )

      const tendril = tendrils.current[index]
      const tendrilMaterial = tendrilMaterials.current[index]
      if (!tendril) return
      const length = module.position.length()
      tendril.visible = cubeReveal > 0.003 && assembly > 0.04 && length > 0.05
      if (!tendril.visible) return
      tendrilAxis.copy(module.position).normalize()
      tendrilQuat.setFromUnitVectors(tendrilUp, tendrilAxis)
      tendril.quaternion.copy(tendrilQuat)
      tendril.position.copy(module.position).multiplyScalar(0.5)
      tendril.scale.set(1, length, 1)
      if (tendrilMaterial) {
        const pulse = 0.5 + Math.sin(signal.time * 1.7 + index * 1.1) * 0.5
        tendrilMaterial.opacity = assembly * (0.1 + signal.reactorWeight * 0.1) * pulse * cubeReveal * machineryReadDim
      }
    })

    // FRAMES: los doce cantos, expansión + rotación propia.
    /*
      Oleada 4 (pedido explícito: "corners/small modules → top/bottom
      panels → side panels → frames and rings → inner modules"). Antes los
      cantos arrancaban en 0,1 de `assembly` — casi a la vez que la banda
      superior (0,05) — y se leían como una pieza más de la misma explosión
      en vez de una fase propia posterior. Retrasados a 0,34 arrancan
      después de que la banda media (delay 0,26 + hasta 0,135 de sector,
      termina hacia 0,595) ya está en marcha.
    */
    const frameMesh = frameInstances.current
    if (frameMesh) {
      frameMesh.visible = cubeReveal > 0.02 && assembly > 0.01
      CUBE_EDGES.forEach((edge, index) => {
        const stagger = smootherstep(0.34 + (index / CUBE_EDGES.length) * 0.25, 0.7 + (index / CUBE_EDGES.length) * 0.25, assembly)
        frameDir.set(edge.mid[0], edge.mid[1], edge.mid[2]).normalize()
        /*
          `edge.mid` está en el espacio normalizado del cubo unitario
          (±0.5): había que llevarlo a la escala real del cubo (arista 3,05,
          la misma que `cubeLayers`), no a un multiplicador arbitrario —
          con 1.6 los doce cantos quedaban muy por dentro de donde está de
          verdad la cáscara, y con longitud (`scale.y`) 1.6 sobre una
          geometría ya construida a 3,05 u salían casi ocho unidades: cantos
          asomando por fuera del encuadre en vez de acompañar cada celda.
        */
        const spread = 1.35 * stagger
        frameDummy.position.set(
          edge.mid[0] * CUBE_WIDTH + frameDir.x * spread,
          edge.mid[1] * CUBE_WIDTH + frameDir.y * spread,
          edge.mid[2] * CUBE_WIDTH + frameDir.z * spread,
        )
        frameQuat.setFromUnitVectors(tendrilUp, AXIS_UP[edge.axis])
        frameDummy.quaternion.copy(frameQuat)
        frameDummy.rotateOnAxis(AXIS_UP[edge.axis], signal.time * 0.4 * stagger)
        frameDummy.scale.set(1, 1, 1)
        frameDummy.updateMatrix()
        frameMesh.setMatrixAt(index, frameDummy.matrix)
      })
      frameMesh.instanceMatrix.needsUpdate = true
    }
    if (frameMaterial.current) frameMaterial.current.opacity = (0.16 + assembly * 0.4 + activationPulse * 0.3) * cubeReveal * machineryReadDim

    // SMALL_MODULES: micro-cubos orbitando, radio más amplio que la cáscara.
    const smallMesh = smallModuleInstances.current
    if (smallMesh) {
      smallMesh.visible = cubeReveal > 0.02 && (assembly > 0.01 || coreReveal > 0.05)
      const baseRadius = THREE.MathUtils.lerp(0.55, 2.35, assembly)
      smallModuleSeeds.forEach((seed, index) => {
        const radius = baseRadius * seed.radiusJitter
        const spin = signal.time * seed.spin * 0.2
        smallModuleDummy.position.copy(seed.dir).multiplyScalar(radius)
        smallModuleDummy.position.applyAxisAngle(seed.spinAxis, spin)
        smallModuleDummy.quaternion.setFromAxisAngle(seed.spinAxis, signal.time * seed.spin)
        smallModuleDummy.scale.setScalar(seed.scale * cubeReveal)
        smallModuleDummy.updateMatrix()
        smallMesh.setMatrixAt(index, smallModuleDummy.matrix)
      })
      smallMesh.instanceMatrix.needsUpdate = true
    }
    if (smallModuleMaterial.current) smallModuleMaterial.current.opacity = (0.35 + assembly * 0.45 + signal.reactorWeight * 0.2) * cubeReveal * machineryReadDim

    /*
      El corredor sólo existe en los dos relevos.

      A la entrada se apaga ANTES de que la sala aparezca, para que la base —que
      es más ancha que el tubo— nunca se vea atravesándolo. A la salida vuelve a
      montarse por delante de la cámara, ya lejos del escenario.

      El primer fotograma del capítulo cae con `p` exactamente en 0, y por eso la
      ventana de entrada arranca ahí: durante el cierre institucional del cerebro
      el capítulo aún no ha empezado y `PlatformLayer` mantiene todo esto sin
      montar, así que no puede volver a taparlo.
    */
    const entry = 1 - smoothstep(0.05, 0.12, p)
    /*
      "Hueco de salida" (sexta pasada, capturado en vivo en p≈0,936):
      `installationFade`/`exitPortalWeight` empiezan a apagar el núcleo y la
      cáscara ya en `at('CORE_EXIT')` (0,888), pero este tubo no empezaba a
      aparecer hasta `until('CORE_EXIT')` (0,933) — 0,045 de progreso donde
      lo viejo ya se apaga y lo nuevo no ha llegado, capturado como un
      fotograma casi negro. Ahora usa la MISMA ventana que el apagado
      (`at('CORE_EXIT')` → `until('PORTAL_EXIT')`) para que uno entre
      mientras el otro sale, en vez de dejar un hueco entre los dos. El tubo
      vive lejos, por delante de la cámara (`leaving ? -22.5`, más abajo) —
      adelantar su aparición no lo hace competir con el núcleo, que sigue
      cerca; sólo insinúa antes la boca de salida al fondo del encuadre.
    */
    const exit = smootherstep(at('CORE_EXIT'), until('PORTAL_EXIT'), p)
    const corridorWeight = Math.max(entry, exit)
    const leaving = exit > entry
    if (corridorRoot.current) {
      corridorRoot.current.visible = corridorWeight > 0.005
      /*
        A la salida el corredor se monta POR DELANTE, no alrededor.

        Puesto a −13 la cámara terminaba dentro del primer tramo y a un palmo de
        su pared: se veía una mancha de facetas azules sin tubo ni fuga, que es
        justo lo contrario de lo que el plano tiene que contar. Con la boca a
        cinco unidades por delante, el tubo se abre en el encuadre y el capítulo
        se va por donde entró.
      */
      /*
        Y en la entrada el corredor también viaja.

        La cámara sólo puede recorrer tres unidades: su primer fotograma está
        clavado al último del capítulo anterior y el empuje tiene que frenar
        antes del escenario. Tres unidades de paralaje no bastan para que un
        tubo se sienta largo. Moviendo además el corredor hacia atrás de la
        cámara se suman siete más: diez unidades de pared pasando, con la misma
        cámara y sin tocar el riel. Es la misma idea que travelar el decorado en
        vez del carro.
      */
      const rush = smoothstep(0, 0.12, p)
      corridorRoot.current.position.set(0, leaving ? 0.15 : -0.85, leaving ? -22.5 : -3 + rush * 7)
      // La salida gira más deprisa: "lanzada hacia delante" en vez de
      // "llegando", con el mismo tubo y sin tocar el riel de cámara.
      corridorRoot.current.rotation.z = p * (leaving ? 0.24 : 0.14)
    }
    fade(corridorMaterials, corridorWeight)
    for (const material of corridorMaterials) {
      /*
        Deliberadamente bajo en la entrada. La textura del tubo ya es cian
        brillante, y encenderla además dejaba las paredes de al lado tan
        claras como el fondo: sin diferencia de luz entre lo cercano y lo
        lejano no hay profundidad que leer, sólo ruido. Apagada, el punto de
        fuga es lo más claro del plano y el tubo se lee de un vistazo.

        La salida sí se permite un pico: un "flash de lanzamiento" que crece
        con `exit`, para que el capítulo se despida con energía en vez de
        con el mismo tubo apagado con el que entró.
      */
      material.emissiveIntensity = leaving
        ? 0.1 + corridorWeight * 0.05 + exit * 0.24
        : 0.08 + corridorWeight * 0.06
      material.color.lerp(leaving ? corridorExitTint : corridorEntryTint, 0.35)
      material.emissive.lerp(leaving ? corridorExitTint : corridorEntryTint, 0.35)
    }

    // Portal de salida: tres aros que se ensamblan y giran en la boca del
    // corredor, escalonados — no aparecen juntos, se arman uno tras otro.
    const exitPortal = exitPortalWeight(p)
    exitRings.current.forEach((ring, index) => {
      if (!ring) return
      const stagger = smootherstep(index * 0.16, index * 0.16 + 0.5, exitPortal)
      ring.visible = exitPortal > 0.01
      if (!ring.visible) return
      ring.rotation.z = signal.time * (0.55 + index * 0.28)
      ring.scale.setScalar((0.62 + index * 0.16) * (0.82 + stagger * 0.18))
      // Nace disperso y se cierra a su sitio: leído junto al giro, se lee
      // como piezas ensamblándose, no como un aro que sólo aparece.
      ring.position.z = (1 - stagger) * (index + 1) * 0.55
      const material = exitRingMaterials.current[index]
      if (material) material.opacity = exitPortal * stagger * 0.62
    })
    if (exitPortalLight.current) {
      // Los aros se cierran hacia z local 0 (ver el propio `ring.position.z`
      // arriba); la luz los sigue ahí, con un parpadeo muy leve de "energía
      // viva" en vez de una intensidad plana.
      exitPortalLight.current.intensity = exitPortal * 5.5
      exitPortalLight.current.position.z = Math.sin(signal.time * 1.3) * 0.08
    }
    // Letrero "03 · PROCESO": crece en brillo con `exit`, nunca con `entry" —
    // ninguna razón para que se insinúe durante la llegada.
    if (signMaterial.current) signMaterial.current.opacity = exit * 0.85
  })

  return (
    <group name="PlatformRoot">
      <group ref={corridorRoot}>
        <primitive object={corridor} />
        {[0, 1, 2].map((index) => (
          <mesh key={`exit-ring-${index}`} ref={(node) => { exitRings.current[index] = node }} position={[0, 0, -1.6]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[2.1 - index * 0.3, 0.03, 8, 72]} />
            <meshBasicMaterial
              ref={(node) => { exitRingMaterials.current[index] = node }}
              color="#d9a8ff"
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
        <pointLight ref={exitPortalLight} intensity={0} distance={6} decay={2} color="#d9a8ff" />
        {/*
          Antes en z local −10: sumado al desplazamiento del propio grupo en
          modo salida (z mundo −22,5), el letrero caía en z mundo ≈−32,5 —
          más allá de donde `EXIT`/`REASSEMBLY` siquiera miran (su target más
          lejano llega a z −23). Por eso nunca se veía. z local −1 lo deja
          justo en la boca del túnel, donde la cámara SÍ está mirando.
        */}
        <mesh position={[0, 0.3, -1]}>
          <planeGeometry args={[3.4, 1.7]} />
          <meshBasicMaterial
            ref={signMaterial}
            map={signTexture}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={baseRoot} position={[0, -3.42, -9]} rotation={[0, 0.08, 0]}><primitive object={base} /></group>
      <group ref={cubeAssemblyRoot} position={[0, 0.12, -9]} rotation={[0, 0.14, 0]}>
        {split.parts.map((part, index) => (
          <group key={SHELL_CELLS[index].name} ref={(node) => { modules.current[index] = node }} name={SHELL_CELLS[index].name}>
            <primitive object={part} />
          </group>
        ))}
        {SHELL_CELLS.map((spec, index) => (
          <mesh
            key={`tendril-${spec.name}`}
            ref={(node) => { tendrils.current[index] = node }}
            geometry={tendrilGeometry}
            visible={false}
            frustumCulled={false}
          >
            <meshBasicMaterial
              ref={(node) => { tendrilMaterials.current[index] = node }}
              color={spec.band === 1 ? '#ff8ad4' : '#4fe0ff'}
              transparent
              opacity={0}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}
        <instancedMesh ref={frameInstances} args={[undefined, undefined, CUBE_EDGES.length]} frustumCulled={false} visible={false}>
          <cylinderGeometry args={[0.018, 0.018, CUBE_WIDTH, 6, 1, true]} />
          <meshBasicMaterial
            ref={frameMaterial}
            color="#8fe8ff"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        <instancedMesh ref={smallModuleInstances} args={[undefined, undefined, SMALL_MODULE_COUNT]} frustumCulled={false} visible={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial
            ref={smallModuleMaterial}
            color="#bfe4ff"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </instancedMesh>
        <mesh ref={coreRingA} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.85, 0.012, 8, 96]} />
          <meshBasicMaterial ref={coreRingMaterialA} color="#5fe4ff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh ref={coreRingB} rotation={[Math.PI / 2, 0.3, 0]}>
          <torusGeometry args={[1.02, 0.008, 8, 96]} />
          <meshBasicMaterial ref={coreRingMaterialB} color="#c88bff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <group>
          <mesh>
            <cylinderGeometry args={[0.02, 0.02, 2.4, 12, 1, true]} />
            <meshBasicMaterial ref={coreBeamCore} color="#eaffff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.1, 0.1, 2.4, 16, 1, true]} />
            <meshBasicMaterial ref={coreBeamHalo} color="#8fe0ff" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group ref={coreRoot} position={[0, 0.12, -9]}>
        <primitive object={core} />
        <lineSegments ref={coreWireframe} geometry={containmentGeometry} visible={false}>
          <lineDashedMaterial
            ref={coreWireMaterial}
            color="#6fe0ff"
            transparent
            opacity={0}
            dashSize={0.09}
            gapSize={0.14}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
      </group>

      <group position={[0, -2.35, -9]}>
        <mesh>
          <cylinderGeometry args={[0.035, 0.055, 1.35, 18, 1, true]} />
          <meshBasicMaterial ref={beamCore} color="#9af5ff" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.24, 0.36, 1.5, 24, 1, true]} />
          <meshBasicMaterial ref={beamHalo} color="#22cfff" transparent opacity={0.08} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>

      <mesh ref={levitationRing} position={[0, -1.72, -9]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.35, 0.032, 12, 96]} />
        <meshStandardMaterial ref={levitationMaterial} color="#173a5d" emissive="#15bfff" emissiveIntensity={0.26} metalness={0.82} roughness={0.24} transparent opacity={0} />
      </mesh>
    </group>
  )
}

useGLTF.preload(BASE_URL, false, true)
useGLTF.preload(CUBE_URL, false, true)
useGLTF.preload(CORE_URL, false, true)
useGLTF.preload(TUNNEL_URL, false, true)
