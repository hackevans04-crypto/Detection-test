'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { LAYER_CUTS, PLATFORM_MODULES } from '@/lib/platform/assembly'
import { assemblyWeight, smoothstep, smootherstep } from '@/lib/platform/timeline'
import type { PlatformStateRef } from './platform-state'

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

/**
 * Corta la malla real del cubo en sus tres bandas horizontales.
 *
 * El exportador entregó todo el cubo como una sola malla, así que la separación
 * se hace triángulo a triángulo conservando posición, normal, UV y texturas: no
 * se dibuja ninguna caja sustituta ni se toca la microgeometría.
 *
 * La diferencia con la versión anterior está en POR DÓNDE se corta. Repartir
 * según a qué cara mira cada centroide traza fronteras diagonales que cruzan los
 * relieves en zigzag, y de ahí salían los bordes dentados que se leían como
 * geometría rota. Dos planos horizontales dan una costura recta y además caen
 * donde el propio modelo ya está dividido en bandas.
 */
function cubeLayers(source: THREE.Object3D, width = 3.05): SplitCube {
  source.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(source)
  const centre = bounds.getCenter(new THREE.Vector3())
  const extent = bounds.getSize(new THREE.Vector3())
  const scale = width / Math.max(extent.x, extent.y, extent.z, 0.0001)
  const halfHeight = Math.max(extent.y * 0.5, 0.0001)
  const buffers: LayerBuffer[] = PLATFORM_MODULES.map(() => ({ position: [], normal: [], uv: [] }))
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
      // Orden de las capas: 0 arriba, 1 centro, 2 abajo.
      const layer = height >= LAYER_CUTS[1] ? 0 : height <= LAYER_CUTS[0] ? 2 : 1
      const target = buffers[layer]

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
    mesh.name = PLATFORM_MODULES[index].name
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
  const core = useMemo(() => dressedModel(coreGltf.scene, 1.15, { glow: 0.6, env: 2, metalness: 0.6, roughness: 0.3 }), [coreGltf.scene])
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
  const corridorRoot = useRef<THREE.Group>(null)
  const levitationRing = useRef<THREE.Mesh>(null)
  const levitationMaterial = useRef<THREE.MeshStandardMaterial>(null)
  const beamCore = useRef<THREE.MeshBasicMaterial>(null)
  const beamHalo = useRef<THREE.MeshBasicMaterial>(null)
  const modules = useRef<Array<THREE.Group | null>>([])

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const assembly = assemblyWeight(p)
    const ringReveal = smootherstep(0.1, 0.17, p)
    const baseReveal = smootherstep(0.1, 0.19, p)
    const cubeReveal = smootherstep(0.13, 0.22, p)
    signal.assemblyWeight = assembly
    signal.reactorWeight = smootherstep(0.34, 0.58, p) * (1 - smootherstep(0.9, 1, p))

    if (baseRoot.current) {
      baseRoot.current.rotation.y = -0.08 + p * 0.16
      baseRoot.current.position.y = -3.42 + baseReveal * 0.07
      baseRoot.current.scale.setScalar(0.9 + baseReveal * 0.1)
      baseRoot.current.visible = baseReveal > 0.003
    }
    fade(baseMaterials, baseReveal)

    if (cubeAssemblyRoot.current) {
      const breath = signal.reducedMotion ? 1 : 1 + Math.sin(signal.time * 0.72) * 0.0035
      cubeAssemblyRoot.current.scale.setScalar(breath)
      cubeAssemblyRoot.current.rotation.y = 0.14 + (signal.reducedMotion ? 0 : Math.sin(signal.time * 0.19) * 0.012)
      cubeAssemblyRoot.current.visible = cubeReveal > 0.003
    }
    fade(cubeMaterials, cubeReveal)
    for (const material of cubeMaterials) {
      // El neón del modelo sube cuando el reactor está encendido; el resto del
      // tiempo se queda en su brillo de reposo.
      material.emissiveIntensity = 0.34 + signal.reactorWeight * 0.3
    }

    /*
      El núcleo vive dentro del cubo y sólo se descubre cuando la banda central
      se aparta. No se le baja la opacidad para «verlo a través»: se ve porque
      hay una ventana abierta, que es lo que hace legible la apertura.
    */
    const coreReveal = smootherstep(0.28, 0.5, assembly)
    if (coreRoot.current) {
      coreRoot.current.rotation.y = p * 2.6
      coreRoot.current.rotation.x = p * 0.24
      coreRoot.current.visible = cubeReveal > 0.02
      coreRoot.current.scale.setScalar((0.86 + signal.reactorWeight * 0.12 + Math.sin(signal.time * 1.5) * 0.012) * cubeReveal)
    }
    fade(coreMaterials, cubeReveal)
    for (const material of coreMaterials) {
      // Se quedaba en 2,3 y salía blanco puro: un núcleo quemado no tiene forma.
      material.emissiveIntensity = 0.55 + coreReveal * 0.4 + signal.reactorWeight * 0.2 + Math.sin(signal.time * 1.4) * 0.04
    }

    if (levitationRing.current) {
      levitationRing.current.rotation.z = p * 1.7
      levitationRing.current.position.y = -1.72 - assembly * 0.1
      levitationRing.current.scale.setScalar(1 + assembly * 0.06)
      levitationRing.current.visible = ringReveal > 0.004
    }
    if (levitationMaterial.current) levitationMaterial.current.opacity = ringReveal * 0.82
    const beamPulse = 0.78 + Math.sin(signal.time * 2.1) * 0.1
    if (beamCore.current) beamCore.current.opacity = baseReveal * (0.11 + signal.reactorWeight * 0.13) * beamPulse
    if (beamHalo.current) beamHalo.current.opacity = baseReveal * (0.03 + signal.reactorWeight * 0.04) * beamPulse
    modules.current.forEach((module, index) => {
      if (!module) return
      module.visible = cubeReveal > 0.003
      const spec = PLATFORM_MODULES[index]
      const stagger = smootherstep(spec.delay, Math.min(1, spec.delay + 0.44), assembly)
      module.position.set(spec.exploded[0] * stagger, spec.exploded[1] * stagger, spec.exploded[2] * stagger)
      module.rotation.set(spec.rotation[0] * stagger, spec.rotation[1] * stagger, spec.rotation[2] * stagger)
    })

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
    const exit = smoothstep(0.9, 0.97, p)
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
      corridorRoot.current.rotation.z = p * 0.14
    }
    fade(corridorMaterials, corridorWeight)
    for (const material of corridorMaterials) {
      /*
        Deliberadamente bajo. La textura del tubo ya es cian brillante, y
        encenderla además dejaba las paredes de al lado tan claras como el fondo:
        sin diferencia de luz entre lo cercano y lo lejano no hay profundidad que
        leer, sólo ruido. Apagadas, el punto de fuga es lo más claro del plano y
        el tubo se lee de un vistazo.
      */
      material.emissiveIntensity = 0.08 + corridorWeight * 0.06
    }
  })

  return (
    <group name="PlatformRoot">
      <group ref={corridorRoot}><primitive object={corridor} /></group>
      <group ref={baseRoot} position={[0, -3.42, -9]} rotation={[0, 0.08, 0]}><primitive object={base} /></group>
      <group ref={cubeAssemblyRoot} position={[0, 0.12, -9]} rotation={[0, 0.14, 0]}>
        {split.parts.map((part, index) => (
          <group key={PLATFORM_MODULES[index].name} ref={(node) => { modules.current[index] = node }} name={PLATFORM_MODULES[index].name}>
            <primitive object={part} />
          </group>
        ))}
      </group>
      <group ref={coreRoot} position={[0, 0.12, -9]}><primitive object={core} /></group>

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
