'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { makeFilament, makePulse } from '@/lib/three/filament'
import { orbitalStarVertexShader, starGlowFragmentShader } from '@/lib/three/star-field'
import { PLATFORM_BEATS, dataGatherWeight, readingHold, smootherstep } from '@/lib/platform/timeline'
import type { PlatformStateRef } from './platform-state'

/*
 * "¿Se está leyendo algo estable ahora mismo?"
 *
 * Antes combinaba `readingHold` (estaciones interiores) con
 * `platformCameraFreezeWeight` (la presentación por caras del cubo, un tramo
 * de progreso distinto) porque el capítulo tenía DOS regímenes de lectura
 * separados. La presentación por caras se eliminó esta pasada (ver
 * `PLATFORM_BEATS` en `lib/platform/timeline.ts`) — ahora las estaciones
 * interiores son el único tramo de lectura, así que esta señal es
 * simplemente `readingHold`. Se conserva como función propia (en vez de
 * usar `readingHold` directamente en cada sitio) para no tener que tocar
 * los dos puntos de abajo si el capítulo vuelve a ganar un segundo régimen
 * de lectura más adelante.
 */
function activeReadWeight(progress: number) {
  return readingHold(progress)
}

/**
 * `bandCenter`/`bandWidth` reemplazan el reparto uniforme en Y por dos lóbulos
 * simétricos a ±`bandCenter`, con ancho `bandWidth`. Es una aproximación
 * barata a "las partículas se concentran donde el cubo abre sus costuras": no
 * persigue la posición en vivo de cada banda —eso exigiría recolocar miles de
 * puntos por fotograma—, pero centra la nube estática donde caen esas
 * costuras (el cubo mide 3,05 u; las bandas se separan hasta ~1 u a cada
 * lado), así que el hueco del desensamblaje ya no se abre sobre una nube
 * repartida uniformemente por todo el volumen.
 *
 * Devuelve atributos por partícula (no posiciones horneadas): el giro ya no
 * lo aplica un `rotation.y` rígido sobre todo el grupo, sino el propio shader
 * (`orbitalStarVertexShader`), con velocidad angular distinta según el radio
 * de cada partícula — el mismo "giro diferencial" de `LivingStars` en Inicio.
 */
/*
 * `sphere` cambia sólo cómo se reparte `aY`.
 *
 * El disco original (bandCenter=0) reparte Y uniforme entre ±radio*0,6 SIN
 * relación con el radio XZ de cada partícula — una rebanada plana. Medido
 * desde la cámara de CHAMBER (bien dentro del volumen, mirando en diagonal):
 * la mayor parte de esa rebanada cae fuera del cono de visión, así que subir
 * el conteo no sube lo que de verdad se ve, sólo lo que hay detrás y a los
 * lados de cámara. Con `sphere`, Y se acota por partícula a
 * `sqrt(radio² - r²)`, formando una cáscara esférica: desde cualquier punto
 * cercano al centro, en cualquier dirección a la que se mire, hay
 * aproximadamente la misma densidad — que es justo lo que hace falta para un
 * plano general que puede mirar hacia cualquier lado.
 */
function cloud(count: number, radius: number, seed: number, bandCenter: number, bandWidth: number, palette: THREE.Color[], sphere = false) {
  const aRadius = new Float32Array(count)
  const aAngle = new Float32Array(count)
  const aY = new Float32Array(count)
  const aZJitter = new Float32Array(count)
  const aPhase = new Float32Array(count)
  const aColor = new Float32Array(count * 3)
  let value = seed >>> 0
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
  for (let i = 0; i < count; i++) {
    const r = radius * (0.3 + random() * 0.7)
    aRadius[i] = r
    aAngle[i] = random() * Math.PI * 2
    if (sphere) {
      const yRange = Math.sqrt(Math.max(0, radius * radius - r * r))
      aY[i] = (random() - 0.5) * 2 * yRange
    } else {
      aY[i] = bandCenter > 0
        ? (random() < 0.5 ? -1 : 1) * bandCenter + (random() - 0.5) * bandWidth
        : (random() - 0.5) * radius * 1.2
    }
    aZJitter[i] = (random() - 0.5) * 3
    aPhase[i] = random()
    const color = palette[Math.floor(random() * palette.length)]
    aColor[i * 3] = color.r
    aColor[i * 3 + 1] = color.g
    aColor[i * 3 + 2] = color.b
  }
  return { aRadius, aAngle, aY, aZJitter, aPhase, aColor }
}

function ParticleCloud({
  sceneState, count, radius, z, size, opacity, near = false, bandCenter = 0, bandWidth = 0, reactive = false, spin, palette, sphere = false, presence,
}: {
  sceneState: PlatformStateRef
  count: number
  radius: number
  z: number
  size: number
  opacity: number
  near?: boolean
  /** Y en la que se concentran los dos lóbulos de la nube. 0 = reparto uniforme. */
  bandCenter?: number
  bandWidth?: number
  /** Si liga su opacidad a `assemblyWeight`/`reactorWeight` — ver comentario en `PlatformParticles`. */
  reactive?: boolean
  /** Velocidad angular de referencia (rad/s) de las partículas en el radio exterior. */
  spin: number
  /** Paleta de la nube — variedad de tono, no un único color plano. */
  palette: string[]
  /** Cáscara esférica en vez de disco plano — ver comentario de `cloud()`. */
  sphere?: boolean
  /**
   * Ventana propia de presencia además de `chapterFade` — para una capa que
   * sólo debe leerse en un tramo del capítulo (el plano general de CHAMBER,
   * la salida por el túnel) en vez de vivir encendida todo el recorrido.
   * `undefined` equivale a "todo el capítulo", igual que antes.
   */
  presence?: (progress: number) => number
}) {
  const points = useRef<THREE.Points>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const paletteColors = useMemo(() => palette.map((hex) => new THREE.Color(hex)), [palette])
  const { aRadius, aAngle, aY, aZJitter, aPhase, aColor } = useMemo(
    () => cloud(count, radius, near ? 9127 : 4103, bandCenter, bandWidth, paletteColors, sphere),
    [bandCenter, bandWidth, count, near, paletteColors, radius, sphere],
  )
  const aSpeed = useMemo(() => {
    const values = new Float32Array(count)
    for (let i = 0; i < count; i += 1) {
      // Giro diferencial: el radio propio de cada partícula decide su
      // fracción de la velocidad de referencia (0,3 en el centro, 1 en el borde).
      values[i] = spin * (0.3 + (aRadius[i] / radius) * 0.7)
    }
    return values
  }, [aRadius, count, radius, spin])
  const aSize = useMemo(() => {
    let value = (near ? 9127 : 4103) ^ 0x2f6e2b1
    const random = () => {
      value = (value * 1664525 + 1013904223) >>> 0
      return value / 4294967296
    }
    const values = new Float32Array(count)
    for (let i = 0; i < count; i += 1) values[i] = size * (0.75 + random() * 0.6)
    return values
  }, [count, near, size])

  useEffect(() => () => material.current?.dispose(), [])

  useFrame((state) => {
    const signal = sceneState.current
    const hold = activeReadWeight(signal.progress)
    if (points.current) {
      /*
        El desplazamiento por puntero de la nube cercana es otra fuente de
        "algo se mueve" que la congelada de cámara (`stationCameraFreezeWeight`
        /`cubeHoldFreezeWeight`, ver `hero-scene.tsx`) no cubría — apagado con
        la misma señal para que nada detrás del cubo derive mientras una
        estación está en su propio READ HOLD, igual que ya se apaga el
        paralaje de la propia cámara.
      */
      points.current.position.x = near ? signal.pointerX * 0.18 * (1 - hold) : 0
      points.current.position.y = near ? -signal.pointerY * 0.12 * (1 - hold) : 0
    }
    if (material.current) {
      /*
        Las nubes reactivas rodean el cubo: cuando se abre, se avivan en vez
        de quedarse a intensidad constante, para que el hueco entre bandas se
        lea como energía en movimiento y no como espacio vacío.
      */
      const surge = reactive ? 0.4 + signal.assemblyWeight * 0.6 + signal.reactorWeight * 0.18 : 1
      // "Ambient particles" a 0,35 durante READ HOLD (valor objetivo del encargo).
      const readDim = 1 - hold * 0.65
      /*
        "Que las partículas entren y salgan bien" (pedido explícito) — esta
        nube no tenía ENTRADA ni SALIDA propias: `PlatformParticles` la monta
        con `PlatformLayer` en cuanto `progress` pasa de 0, y hasta ahora
        aparecía de golpe a su opacidad base en el primer fotograma, sin
        ningún fundido — y se quedaba exactamente igual hasta el final del
        capítulo, sin apagarse al entrar al túnel de salida. `chapterFade` le
        da ambas puntas: entra durante el mismo tramo en que el corredor de
        `HANDOFF` también se está revelando (`entry` en `platform-cast.tsx`,
        0-0,1), y se apaga durante `TUNNEL_EXIT` en vez de cortar junto con el
        resto de la escena en p=1.
      */
      const chapterFade = smootherstep(0, 0.06, signal.progress) * (1 - smootherstep(0.95, 1, signal.progress))
      const presenceWeight = presence ? presence(signal.progress) : 1
      material.current.uniforms.uOpacity.value = opacity * (0.8 + signal.scrollEnergy * (near ? 0.2 : 0.06)) * surge * readDim * chapterFade * presenceWeight
      material.current.uniforms.uTime.value = signal.time
      // Misma fórmula que `PointsMaterial` con `sizeAttenuation` (three.js
      // fija `scale = altura_en_px * 0,5`): calibrado para que el tamaño en
      // pantalla no cambie frente a la versión anterior, sólo el brillo/color.
      material.current.uniforms.uScale.value = state.gl.getPixelRatio() * state.size.height * 0.5
    }
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[new Float32Array(count * 3), 3]} />
        <bufferAttribute attach="attributes-aRadius" args={[aRadius, 1]} />
        <bufferAttribute attach="attributes-aAngle" args={[aAngle, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[aSpeed, 1]} />
        <bufferAttribute attach="attributes-aY" args={[aY, 1]} />
        <bufferAttribute attach="attributes-aZJitter" args={[aZJitter, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[aPhase, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[aSize, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[aColor, 3]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        uniforms={{ uTime: { value: 0 }, uScale: { value: 1 }, uZCenter: { value: z }, uOpacity: { value: opacity } }}
        vertexShader={orbitalStarVertexShader}
        fragmentShader={starGlowFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}

const DATA_COUNT: Record<'low' | 'medium' | 'high', number> = { low: 50, medium: 90, high: 150 }
/** Centro del cubo/núcleo en el mundo — mismo punto que `PlatformCast`. */
const CORE_CENTER = new THREE.Vector3(0, 0.12, -9)

/**
 * DATA_PARTICLES: el grupo que se mueve al revés que todos los demás.
 *
 * Mientras la cáscara, los cantos y los micro-módulos se ALEJAN del centro al
 * abrirse (`platform-cast.tsx`), este grupo VIAJA HACIA el núcleo — el punto
 * 5 lo pide explícitamente: "estructura mecánica expandiéndose + datos
 * concentrándose en el centro". Necesita posición por partícula actualizada
 * cada fotograma (no basta un `group.position`/opacidad como en `ParticleCloud`),
 * así que muta directamente el `BufferAttribute` en vez de reconstruirlo —
 * ninguna asignación nueva dentro de `useFrame`.
 */
function DataConvergence({ sceneState }: { sceneState: PlatformStateRef }) {
  const quality = sceneState.current.quality
  const count = DATA_COUNT[quality]
  const points = useRef<THREE.Points>(null)
  const material = useRef<THREE.PointsMaterial>(null)
  const positions = useMemo(() => new Float32Array(count * 3), [count])
  const seeds = useMemo(() => Array.from({ length: count }, (_, index) => {
    const random = (n: number) => {
      const v = Math.sin((index * 91.71 + n) * 12.9898) * 43758.5453
      return v - Math.floor(v)
    }
    const theta = random(1) * Math.PI * 2
    const phi = Math.acos(random(2) * 2 - 1)
    return {
      dir: new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.62, Math.sin(phi) * Math.sin(theta)),
      outerRadius: 2.6 + random(3) * 2.8,
      phase: random(4),
      spin: 0.15 + random(5) * 0.3,
    }
  }), [count])

  useFrame(() => {
    const signal = sceneState.current
    const gather = dataGatherWeight(signal.progress)
    const active = points.current
    if (!active) return
    active.visible = gather > 0.015
    if (!active.visible) return
    const attribute = active.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let index = 0; index < count; index += 1) {
      const seed = seeds[index]
      // Escalonado por partícula: no todas convergen a la vez, así que el
      // flujo se lee como una corriente y no como un solo salto sincronizado.
      const travel = Math.min(1, Math.max(0, gather * 1.35 - seed.phase * 0.35))
      const eased = travel * travel * (3 - 2 * travel)
      const radius = THREE.MathUtils.lerp(seed.outerRadius, 0.22, eased)
      const orbit = signal.time * seed.spin
      const cos = Math.cos(orbit)
      const sin = Math.sin(orbit)
      const x = seed.dir.x * cos - seed.dir.z * sin
      const z = seed.dir.x * sin + seed.dir.z * cos
      attribute.setXYZ(
        index,
        CORE_CENTER.x + x * radius,
        CORE_CENTER.y + seed.dir.y * radius,
        CORE_CENTER.z + z * radius,
      )
    }
    attribute.needsUpdate = true
    if (material.current) material.current.opacity = (0.35 + gather * 0.5 + signal.reactorWeight * 0.15)
  })

  return (
    <points ref={points} frustumCulled={false} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={material} color="#9af0ff" size={0.05} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

const RAIL_COUNT = 6

/**
 * Rieles de datos: la continuación de Inicio en Plataforma (punto 5 —
 * "unificar fondos").
 *
 * `NeuralPulsePaths` en `hero-scene.tsx` es la firma visual del interior del
 * cerebro: tubos curvos con núcleo/pulso (`makeFilament`/`makePulse`, ver
 * `lib/three/filament.ts`) recorridos por una esfera de energía. Plataforma
 * sólo heredaba ese lenguaje en el corredor de entrada (`HandoffSignal`, sólo
 * vive en HANDOFF) — el resto del capítulo caía a una nube de puntos sueltos
 * sin ninguna conexión entre sí, así que se leía como una escena nueva y no
 * como la misma sinapsis vista de otra forma. Aquí el mismo par de funciones
 * viste seis rieles alrededor del núcleo, presentes durante casi todo el
 * capítulo — no sólo en el cruce — para que "filamento" se convierta en
 * "riel de datos" sin cambiar de gramática visual.
 *
 * Igual que las sinapsis de Inicio se atenúan durante una lectura, estos
 * rieles bajan durante `readingHold` (punto J: nada grande debe competir con
 * el texto de una estación activa) y vuelven entre una estación y la
 * siguiente.
 */
function PlatformDataRails({ sceneState }: { sceneState: PlatformStateRef }) {
  const group = useRef<THREE.Group>(null)
  const lines = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const pulses = useRef<Array<THREE.Mesh | null>>([])
  const pulseMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const paths = useMemo(() => {
    const random = (seed: number) => {
      const v = Math.sin(seed * 12.9898) * 43758.5453
      return v - Math.floor(v)
    }
    return Array.from({ length: RAIL_COUNT }, (_, index) => {
      const start = (index / RAIL_COUNT) * Math.PI * 2
      const end = start + Math.PI * (0.55 + random(index * 3.1) * 0.5)
      const radius = 4.4 + random(index * 5.7) * 2.1
      const points = [0, 0.33, 0.66, 1].map((t) => {
        const angle = THREE.MathUtils.lerp(start, end, t)
        const wobble = 1 + (random(index * 7.3 + t) - 0.5) * 0.3
        return new THREE.Vector3(
          Math.cos(angle) * radius * wobble,
          (random(index * 11.1 + t) - 0.5) * 3.4,
          -9 + Math.sin(angle) * radius * wobble,
        )
      })
      const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)
      return { curve, geometry: new THREE.TubeGeometry(curve, 48, 0.014, 6, false) }
    })
  }, [])

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const present = smootherstep(0.1, 0.2, p) * (1 - smootherstep(0.88, 0.97, p))
    /*
      "Long rails" a 0,10 durante READ HOLD (valor objetivo del encargo,
      quinta pasada) — antes bajaban sólo a 0,35 (×0,65 de la lectura), lejos
      de "ningún elemento grande debe competir con el glifo activo".
    */
    const dimmed = present * (1 - activeReadWeight(p) * 0.9)
    if (group.current) group.current.visible = dimmed > 0.01
    paths.forEach((path, index) => {
      const flow = (signal.time * 0.05 + index * 0.161) % 1
      const pulse = pulses.current[index]
      if (pulse) {
        pulse.position.copy(path.curve.getPoint(flow))
        pulse.scale.setScalar(0.8 + Math.sin((flow + index) * Math.PI * 2) * 0.15)
      }
      if (lines.current[index]) lines.current[index]!.opacity = dimmed * 0.26
      if (pulseMaterials.current[index]) pulseMaterials.current[index]!.opacity = dimmed * 0.7
    })
  })

  return (
    <group ref={group} renderOrder={5} visible={false}>
      {paths.map((path, index) => (
        <group key={index}>
          <mesh geometry={path.geometry} frustumCulled={false}>
            <meshBasicMaterial
              ref={(material) => { lines.current[index] = material; makeFilament(material, index) }}
              color={index % 2 ? '#8c7bff' : '#48dfff'} transparent opacity={0}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
          <mesh ref={(mesh) => { pulses.current[index] = mesh }}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial
              ref={(material) => { pulseMaterials.current[index] = material; makePulse(material) }}
              color={index % 2 ? '#c8bcff' : '#c8fbff'} transparent opacity={0}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const CHAMBER_CENTER = new THREE.Vector3(0, 0.12, -9)
const CHAMBER_CUBE_COUNT = 8

/*
  Platform Chamber — pedido explícito: "que al salir del túnel no aparezca
  sólo 'el cubo', sino un mundo construido, con escala, profundidad y
  jerarquía". El pedestal, el haz cenital y los rieles de datos ya existen
  (`PlatformCast`/`PlatformDataRails`); esto añade lo que faltaba para dar
  PROFUNDIDAD — capas más allá del propio cubo, repartidas por la sala
  grande de `CHAMBER`/`CUBE_APPROACH` y retiradas antes de que la
  presentación por caras necesite toda la atención para sí.
*/
function ChamberDistantCubes({ sceneState }: { sceneState: PlatformStateRef }) {
  const instances = useRef<THREE.InstancedMesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const seeds = useMemo(() => Array.from({ length: CHAMBER_CUBE_COUNT }, (_, index) => {
    const random = (n: number) => {
      const v = Math.sin((index * 53.17 + n) * 12.9898) * 43758.5453
      return v - Math.floor(v)
    }
    const angle = random(1) * Math.PI * 2
    const radius = 5.6 + random(2) * 4.4
    return {
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        (random(3) - 0.5) * 3.4,
        CHAMBER_CENTER.z + Math.sin(angle) * radius,
      ),
      scale: 0.05 + random(4) * 0.09,
      spin: 0.05 + random(5) * 0.12,
      axis: new THREE.Vector3(random(6) - 0.5, random(7) - 0.5, random(8) - 0.5).normalize(),
    }
  }), [])

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    // Presente durante la sala grande; se retira antes de FACE_EVALUATION
    // para no competir con la presentación por caras.
    const present = smootherstep(0.08, 0.13, p) * (1 - smootherstep(0.19, 0.208, p))
    const mesh = instances.current
    if (mesh) {
      mesh.visible = present > 0.01
      if (mesh.visible) {
        seeds.forEach((seed, index) => {
          dummy.position.copy(seed.position)
          dummy.quaternion.setFromAxisAngle(seed.axis, signal.time * seed.spin)
          dummy.scale.setScalar(seed.scale)
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
      }
    }
    if (material.current) material.current.opacity = present * 0.5
  })

  return (
    <instancedMesh ref={instances} args={[undefined, undefined, CHAMBER_CUBE_COUNT]} frustumCulled={false} visible={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial ref={material} color="#5fb8e6" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  )
}

const CHAMBER_HUD_COUNT = 3

function makeHudTexture(seed: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 160
  const context = canvas.getContext('2d')!
  context.strokeStyle = 'rgba(140, 220, 255, 0.9)'
  context.fillStyle = 'rgba(140, 220, 255, 0.9)'
  context.lineWidth = 2
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12)
  const random = (n: number) => {
    const v = Math.sin((seed * 71.3 + n) * 12.9898) * 43758.5453
    return v - Math.floor(v)
  }
  // Barras — un lector abstracto, no texto: legible como "instrumentación",
  // sin competir por lectura con las tarjetas reales del capítulo.
  const bars = 7
  for (let index = 0; index < bars; index += 1) {
    const barHeight = 24 + random(index) * 78
    context.globalAlpha = 0.55 + random(index + 10) * 0.35
    context.fillRect(22 + index * 28, canvas.height - 22 - barHeight, 16, barHeight)
  }
  context.globalAlpha = 1
  context.beginPath()
  context.arc(canvas.width - 42, 42, 18, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.moveTo(canvas.width - 42, 42)
  context.lineTo(canvas.width - 42 + 14 * Math.cos(random(20) * Math.PI * 2), 42 + 14 * Math.sin(random(20) * Math.PI * 2))
  context.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const CHAMBER_HUD_LAYOUT: ReadonlyArray<{ position: [number, number, number]; scale: number }> = [
  { position: [-9.5, 2.6, -18], scale: 3.2 },
  { position: [8.6, 3.4, -22], scale: 3.6 },
  { position: [3.5, -2.2, -25], scale: 3 },
]

function ChamberHud({ sceneState, index }: { sceneState: PlatformStateRef; index: number }) {
  const texture = useMemo(() => makeHudTexture(index), [index])
  useEffect(() => () => texture.dispose(), [texture])
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const layout = CHAMBER_HUD_LAYOUT[index]

  useFrame((state) => {
    const signal = sceneState.current
    const p = signal.progress
    const present = smootherstep(0.08, 0.14, p) * (1 - smootherstep(0.19, 0.24, p))
    const flicker = 0.75 + Math.sin(signal.time * (0.6 + index * 0.23) + index * 2) * 0.25
    if (mesh.current) {
      mesh.current.visible = present > 0.01
      mesh.current.quaternion.copy(state.camera.quaternion)
    }
    if (material.current) material.current.opacity = present * flicker * 0.26
  })

  return (
    <mesh ref={mesh} position={layout.position} scale={[layout.scale, layout.scale * 0.625, 1]} visible={false} renderOrder={4}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}

function ChamberHuds({ sceneState }: { sceneState: PlatformStateRef }) {
  return (
    <>
      {Array.from({ length: CHAMBER_HUD_COUNT }, (_, index) => (
        <ChamberHud key={index} sceneState={sceneState} index={index} />
      ))}
    </>
  )
}

/*
 * Paletas de las nubes — antes cada una era un único `color` plano de
 * `PointsMaterial`. Se reparten dos tonos por nube (violeta/azul lejos, cian
 * cerca) para que "transacción de partículas como Inicio" incluya también la
 * variedad de color de `LivingStars`, atada a los acentos que ya usan
 * `PlatformDataRails` (`#8c7bff`/`#48dfff`) y `DataConvergence` (`#9af0ff`)
 * en vez de inventar una paleta nueva.
 */
const FAR_PALETTE = ['#2d8dff', '#8c7bff']
const NEAR_PALETTE = ['#5ee8ff', '#9af0ff']
/** Una tercera partícula, casi blanca, para que el cielo dedicado de la entrada/salida no sea sólo azul-violeta. */
const CHAMBER_SKY_PALETTE = ['#2d8dff', '#8c7bff', '#dff5ff']

/*
 * Ventana de `ChamberStarfield`: entra al salir del túnel de HANDOFF, se
 * retira antes de que el cubo necesite el encuadre para sí (ACTIVATION), y
 * vuelve durante la salida — CORE_EXIT hasta el final del túnel de salida.
 * Derivada de `PLATFORM_BEATS`, no de literales sueltos: éste es exactamente
 * el desajuste que ya rompió `platform-rail-report.mjs` una vez esta misma
 * sesión al retimear los beats.
 */
function chamberStarfieldPresence(progress: number): number {
  const entry = smootherstep(PLATFORM_BEATS.HANDOFF[1] - 0.02, PLATFORM_BEATS.CHAMBER[1], progress)
    * (1 - smootherstep(PLATFORM_BEATS.CUBE_APPROACH[1] - 0.03, PLATFORM_BEATS.ACTIVATION[0], progress))
  const exit = smootherstep(PLATFORM_BEATS.CORE_EXIT[0] + 0.01, PLATFORM_BEATS.PORTAL_EXIT[0], progress)
    * (1 - smootherstep(PLATFORM_BEATS.TUNNEL_EXIT[0] + 0.02, PLATFORM_BEATS.TUNNEL_EXIT[1], progress))
  return Math.max(entry, exit)
}

export function PlatformParticles({ sceneState }: { sceneState: PlatformStateRef }) {
  const quality = sceneState.current.quality
  return (
    <>
      {/*
        Antes 180/360/620 sobre un disco de radio 34: densidad baja pero
        aceptable como bruma ambiente de fondo durante todo el capítulo.
        Duplicado igualmente, de sobra para ese papel — la falta real de
        partículas en el plano general de CHAMBER no era ésta (ver
        `ChamberStarfield` más abajo: esta nube es un disco plano centrado
        lejos, y la cámara de CHAMBER mira en diagonal desde dentro de su
        propio volumen — subir su conteo casi no sube lo que cae dentro del
        cono de visión, sólo lo que queda detrás y a los lados).
      */}
      <ParticleCloud
        sceneState={sceneState} count={quality === 'low' ? 360 : quality === 'medium' ? 720 : 1200}
        radius={34} z={-18} size={0.05} opacity={0.48} spin={0.0015} palette={FAR_PALETTE}
      />
      {/*
        ChamberStarfield — el cielo real que faltaba en la entrada y la salida
        ("la entrada y salida de plataforma con partículas falta, no tiene
        ese efecto y transición, copia el diseño estilo de Inicio").
        Cáscara ESFÉRICA (`sphere`), no disco: medido con la cámara de CHAMBER
        dentro del volumen mirando en diagonal, un disco plano dejaba la
        mayor parte de sus partículas fuera del cono de visión sin importar
        cuántas se añadieran. Con densidad por partícula independiente de
        hacia dónde mire la cámara, esto sí se lee como estar rodeado de
        estrellas, igual que `LivingStars` en Inicio — sólo presente en la
        entrada (fin del túnel → CUBE_APPROACH) y la salida (CORE_EXIT →
        TUNNEL_EXIT), retirado durante el resto del capítulo para no competir
        con el cubo ni con las estaciones interiores.
      */}
      {/*
        Medido: con cámara dentro de la cáscara y FOV~38°, sólo ~2,7% de una
        esfera isótropa cae dentro del cono de visión en un instante dado
        (Ω_fov/4π). A 1500 partículas eso son ~40 en pantalla — de sobra en
        teoría, pero muchas caen detrás del pedestal opaco o demasiado tenues
        para leerse como "cielo". Subido a un conteo que deje una cifra
        efectiva en pantalla comparable a `LivingStars` en Inicio, no sólo
        matemáticamente presente.
      */}
      <ParticleCloud
        sceneState={sceneState} count={quality === 'low' ? 2200 : quality === 'medium' ? 4200 : 7000}
        radius={30} z={-9} size={0.11} opacity={0.85} spin={0.001} palette={CHAMBER_SKY_PALETTE} sphere
        presence={chamberStarfieldPresence}
      />
      <ParticleCloud
        sceneState={sceneState} count={quality === 'low' ? 70 : quality === 'medium' ? 130 : 220}
        radius={8} z={-9} size={0.055} opacity={0.58} bandCenter={1.5} bandWidth={2.3} reactive
        spin={0.0015} palette={FAR_PALETTE}
      />
      <ParticleCloud
        sceneState={sceneState} count={quality === 'low' ? 28 : quality === 'medium' ? 55 : 90}
        radius={5.5} z={-8} size={0.075} opacity={0.66} near bandCenter={1.25} bandWidth={1.9} reactive
        spin={-0.006} palette={NEAR_PALETTE}
      />
      <DataConvergence sceneState={sceneState} />
      <PlatformDataRails sceneState={sceneState} />
      <ChamberDistantCubes sceneState={sceneState} />
      <ChamberHuds sceneState={sceneState} />
    </>
  )
}
