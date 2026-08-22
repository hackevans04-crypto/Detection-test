'use client'

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import {
  CONCEPT_WINDOWS,
  PHASE,
  PROGRESS_DAMPING,
  bell,
  clamp01,
  exteriorVisibility,
  smoothstep,
  smootherstep,
  type HeroSceneState,
} from '@/lib/hero/depth'
import {
  ACTORS,
  STAGE_FOV,
  WORLD_Z,
  frameStage,
  halfHeightAt,
  readTestMode,
  type Framing,
} from '@/lib/hero/stage'
import { createHeroRail, resolveHeroDirector } from '@/lib/hero/director'
import { CinematicSky } from './cinematic-sky'
import { FogLayer } from './fog-layer'
import { LightRig, StageCastActors, useStageCast, type StageCast } from './hero-stage'
import { LivingLandscape } from './living-landscape'

const HERO = '/detection-home/hero'
const LAYERS = `${HERO}/layers`
const REFERENCE = `${HERO}/reference`
type SceneStateRef = MutableRefObject<HeroSceneState>
type Quality = 'high' | 'medium' | 'low'

/* ------------------------------------------------------------------ cámara */

/** CameraRig driven exclusively by the frame produced by HeroDirector. */
function DirectedCameraRig({ framing, radius, sceneState }: { framing: Framing; radius: number; sceneState: SceneStateRef }) {
  const desired = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    const signal = sceneState.current
    const frame = signal.director
    const camera = state.camera as THREE.PerspectiveCamera
    if (Math.abs(camera.fov - frame.cameraFov) > 0.001) {
      camera.fov = frame.cameraFov
      camera.updateProjectionMatrix()
    }

    desired.fromArray(frame.cameraPosition)
    look.fromArray(frame.cameraLookAt)

    // Differential pointer parallax: the lens moves less than foreground FX.
    // El puntero conserva vida en el plano exterior, pero cede durante el
    // túnel: ahí una desviación grande rompería la apertura entre hemisferios.
    const pointerScale = 1 - frame.entryIntensity * 0.88
    desired.x += signal.pointerX * radius * 0.055 * pointerScale
    desired.y -= signal.pointerY * radius * 0.035 * pointerScale
    look.x -= signal.pointerX * radius * 0.012 * pointerScale
    look.y += signal.pointerY * radius * 0.008 * pointerScale

    camera.position.copy(desired)
    camera.lookAt(look)
    camera.rotation.z += frame.cameraRoll + Math.sin(signal.time * 0.13) * 0.0024

    signal.cameraPosition = [camera.position.x, camera.position.y, camera.position.z]
    signal.cameraFov = camera.fov
    signal.lookAt = [look.x, look.y, look.z]
    signal.drawCalls = state.gl.info.render.calls
  }, -50)
  return null
}

/* ------------------------------------------------------------- planos base */

/** Cubre el encuadre a la profundidad dada sin deformar la imagen. */
function coverPlate(framing: Framing, z: number, viewportAspect: number, imageAspect: number, margin: number) {
  const distance = framing.distance - z
  const frameHeight = 2 * halfHeightAt(distance) * margin
  const frameWidth = frameHeight * viewportAspect
  const byWidth = frameWidth / imageAspect
  const height = Math.max(frameHeight, byWidth)
  return [height * imageAspect, height] as [number, number]
}

function Plate({
  texture, z, framing, aspect, imageAspect, margin = 1.5, opacity = 1, renderOrder = 0, additive = false, tint, offsetY = 0,
  sceneState, exterior = false,
}: {
  texture: THREE.Texture; z: number; framing: Framing; aspect: number; imageAspect: number
  margin?: number; opacity?: number; renderOrder?: number; additive?: boolean; tint?: string; offsetY?: number
  sceneState?: SceneStateRef; exterior?: boolean
}) {
  const [width, height] = coverPlate(framing, z, aspect, imageAspect, margin)
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    if (!sceneState || !exterior) return
    const visibility = exteriorVisibility(sceneState.current.progress)
    if (mesh.current) mesh.current.visible = visibility > 0.004
    if (material.current) material.current.opacity = opacity * visibility
  })
  return (
    <mesh ref={mesh} position={[0, offsetY * height, z]} scale={[width, height, 1]} renderOrder={renderOrder} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={material}
        map={texture}
        color={tint ?? '#ffffff'}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </mesh>
  )
}

/* --------------------------------------------------------------- partículas */

function makeRadialSprite(softness = 0.35) {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(softness, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Nube de puntos a una profundidad concreta.
 *
 * No se desplaza con el puntero ni con el scroll: vive en su Z y es la
 * perspectiva quien decide cuánto recorre la pantalla. Ésa es la razón de que
 * las motas de lente crucen el encuadre y las profundas casi no se muevan, y de
 * que ese contraste sea la referencia que hace legible la velocidad de la
 * cámara. Sin las de lente, orbitar y hacer zoom se parecen demasiado.
 */
function ParticleLayer({
  count, spread, center, size, opacity, color, sceneState, drift = 0, seed = 1, spin = 0.004, softness = 0.35, swell, pointerStrength = 0, activity = 'always',
}: {
  count: number; spread: [number, number, number]; center: [number, number, number]
  size: number; opacity: number; color: string; sceneState: SceneStateRef
  drift?: number; seed?: number; spin?: number; softness?: number
  pointerStrength?: number
  activity?: 'always' | 'exterior' | 'entry' | 'inner' | 'portal'
  /**
   * Crecimiento extra durante la órbita, como fracción del tamaño base.
   *
   * Es la versión honesta del «streak» que pide la dirección: un trazo
   * direccional de verdad necesita velocidad en espacio de pantalla por
   * partícula y un shader propio. Engordar y encender las motas de lente
   * mientras la cámara barre da la misma lectura —algo cerca pasando deprisa—
   * por una fracción del coste, y no se acerca a Star Wars.
   */
  swell?: number
}) {
  const points = useRef<THREE.Points>(null)
  const material = useRef<THREE.PointsMaterial>(null)
  const sprite = useMemo(() => makeRadialSprite(softness), [softness])
  useEffect(() => () => sprite.dispose(), [sprite])
  const positions = useMemo(() => {
    const data = new Float32Array(count * 3)
    // Semilla explícita: el modo de prueba necesita la misma nube en cada carga.
    const random = (n: number) => {
      const v = Math.sin((n + seed * 977) * 127.1) * 43758.5453
      return v - Math.floor(v)
    }
    for (let i = 0; i < count; i++) {
      data[i * 3] = center[0] + (random(i + 11) - 0.5) * spread[0]
      data[i * 3 + 1] = center[1] + (random(i + 79) - 0.5) * spread[1]
      data[i * 3 + 2] = center[2] + (random(i + 173) - 0.5) * spread[2]
    }
    return data
  }, [center, count, seed, spread])

  useFrame(() => {
    const signal = sceneState.current
    if (!points.current) return
    const velocity = signal.director.particleVelocity
    const activityWeight = activity === 'exterior'
      ? exteriorVisibility(signal.progress)
      : activity === 'entry'
      ? signal.director.entryIntensity
      : activity === 'inner'
        ? Math.max(signal.director.entryIntensity * 0.72, signal.director.innerIntensity)
        : activity === 'portal'
          ? signal.director.portalIntensity
          : 1
    points.current.visible = activityWeight > 0.006
    points.current.position.x = signal.pointerX * pointerStrength
    if (drift) {
      points.current.position.y = Math.sin(signal.time * 0.14 * velocity) * drift + signal.pointerY * pointerStrength * 0.55
      points.current.rotation.y = signal.time * spin * velocity
    }
    if (material.current) {
      const sweep = swell ? bell(signal.progress, PHASE.DISASSEMBLY, 0.54, PHASE.REASSEMBLY) : 0
      material.current.size = size * (1 + (swell ?? 0) * sweep + signal.director.cameraSpeed * 0.08)
      material.current.opacity = opacity * activityWeight * (1 + sweep * 0.42)
    }
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial
        ref={material}
        map={sprite} alphaMap={sprite} alphaTest={0.012} color={color} size={size}
        transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending}
        sizeAttenuation toneMapped={false}
      />
    </points>
  )
}

/* --------------------------------------------------------- anillo del HUD */

/**
 * El HUD: un anillo principal, dos arcos secundarios, diez nodos y unas marcas.
 *
 * Y nada más. La referencia tiene un círculo fino rodeando el cerebro, no una
 * maraña de órbitas. Ningún GLB del reparto lo aporta —el HUD orbital es una
 * esfera armilar maciza—, así que se construye aquí con `depthTest` activo: el
 * tramo trasero queda realmente oculto tras el cerebro, y esa oclusión es lo
 * que lo hace leer como 3D en vez de como una línea pintada encima.
 */
function HeroRing({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const nodeRefs = useRef<Array<THREE.Mesh | null>>([])
  const nodes = useMemo(() => Array.from({ length: 10 }, (_, index) => (index / 10) * Math.PI * 2), [])
  const ticks = useMemo(() => Array.from({ length: 24 }, (_, index) => (index / 24) * Math.PI * 2), [])

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    if (!group.current) return
    group.current.rotation.y = signal.time * 0.055 + p * 0.35
    // Primero desbloquea el ensamblaje; al final se convierte físicamente en
    // el portal que atraviesa la cámara.
    const open = 1 + signal.director.assemblyExplode * 0.34 + signal.director.portalIntensity * 0.62
    group.current.scale.setScalar(open)
    const wake = smoothstep(0.04, PHASE.UNLOCK, p)
    const fade = (0.28 + wake * 0.72) * signal.director.hudIntensity * (1 - signal.director.innerIntensity * 0.92)
    group.current.traverse((child) => {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
      if (!material?.isMaterial) return
      material.opacity = (material.userData.base ??= material.opacity) * fade
    })
    /*
      Un pulso recorre los nodos.

      El anillo giraba, pero girar un objeto de revolución no se ve: la silueta
      es idéntica en todos los fotogramas. Lo que delata el movimiento es que
      cada nodo se encienda a su turno, y de paso convierte el aro en algo que
      transporta datos en vez de un adorno.
    */
    const head = (signal.time * 0.2) % 1
    nodeRefs.current.forEach((node, index) => {
      if (!node) return
      let distance = Math.abs(index / nodes.length - head)
      distance = Math.min(distance, 1 - distance)
      const lit = Math.max(0, 1 - distance * 6)
      node.scale.setScalar(1 + lit * 1.1)
      const material = node.material as THREE.MeshBasicMaterial
      material.opacity = (material.userData.base ??= material.opacity) * fade * (0.34 + lit * 0.66)
    })
  })

  const ring = radius * 1.16
  /*
    Nodos pequeños.

    A 0,032 R y con material opaco, el que pasaba por delante del cerebro se
    proyectaba como una bola gris de cincuenta píxeles cruzándole la cara: leía
    como una pompa, no como un dato. La mitad de tamaño y mezcla aditiva lo
    convierten en un punto de luz que se suma a lo que hay debajo en vez de
    taparlo, que es lo que un HUD tiene que hacer.
  */
  const node = radius * 0.016
  return (
    <group ref={group} position={[framing.stageX, framing.stageY + radius * 0.02, 0]} rotation={[0.1, 0, 0.06]} renderOrder={13}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ring, radius * 0.0055, 8, 160]} />
        <meshBasicMaterial color="#5fe4ff" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Dos arcos secundarios, en otros planos: dan grosor al HUD sin
          convertirlo en una jaula. */}
      <mesh rotation={[Math.PI / 2, 0.32, 0.22]}>
        <torusGeometry args={[ring * 1.04, radius * 0.003, 6, 120, Math.PI * 1.15]} />
        <meshBasicMaterial color="#3fb6ff" transparent opacity={0.32} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, -0.5, -0.16]}>
        <torusGeometry args={[ring * 0.93, radius * 0.0022, 6, 110, Math.PI * 0.72]} />
        <meshBasicMaterial color="#7fd6ff" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {ticks.map((angle) => (
        <mesh key={`tick-${angle}`} position={[Math.cos(angle) * ring * 1.075, 0, Math.sin(angle) * ring * 1.075]} rotation={[0, -angle, 0]}>
          <boxGeometry args={[radius * 0.026, radius * 0.0022, radius * 0.0022]} />
          <meshBasicMaterial color="#69d9ff" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      {nodes.map((angle, index) => (
        <mesh
          key={angle}
          ref={(mesh) => { nodeRefs.current[index] = mesh }}
          position={[Math.cos(angle) * ring, 0, Math.sin(angle) * ring]}
        >
          <sphereGeometry args={[node, 12, 12]} />
          <meshBasicMaterial color="#bfeeff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ escáner */

const scannerFragment = /* glsl */ `
  uniform float uTime;
  uniform float uProgress;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float band = smoothstep(0.0, 0.018, abs(vUv.y - uProgress));
    float glow = (1.0 - band) * uOpacity;
    float grid = 0.5 + 0.5 * sin(vUv.x * 180.0 + uTime * 2.0);
    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(0.0, 0.14, 1.0 - vUv.x);
    gl_FragColor = vec4(mix(vec3(0.04, 0.4, 0.72), vec3(0.22, 0.82, 1.0), grid), glow * edge * (0.65 + grid * 0.35));
  }
`

/**
 * Barrido holográfico. Una pasada franca durante la activación y, el resto del
 * capítulo, un recorrido muy tenue en bucle: lo permanente da la sensación de
 * instrumento encendido y el pico marca el momento en que la escena despierta.
 */
function Scanner({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uProgress: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: scannerFragment,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const pass = signal.director.scannerIntensity
    const idle = (signal.time * 0.11) % 1
    material.uniforms.uTime.value = signal.time
    material.uniforms.uProgress.value = pass > 0.02
      ? THREE.MathUtils.lerp(idle, smoothstep(0.035, 0.22, p), pass)
      : idle
    material.uniforms.uOpacity.value = (0.018 + pass * 0.24) * (1 - smoothstep(PHASE.INSTITUTION, 0.9, p))
  })
  const r = radius
  return (
    <mesh position={[framing.stageX, framing.stageY, r * 0.62]} scale={[r * 2.3, r * 2.3, 1]} material={material} renderOrder={15}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------- haz */

function Beam({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const core = useRef<THREE.MeshBasicMaterial>(null)
  const halo = useRef<THREE.MeshBasicMaterial>(null)
  // Nace en la plataforma y muere bajo el cerebro. Un cono sólido de suelo a
  // techo es justo lo que la referencia rechaza.
  const platformY = ACTORS[0].position[1] * radius
  const height = Math.max(-platformY - radius * 0.9, radius * 0.12)
  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const energy = 0.12 + signal.director.platformIntensity * 0.14 + signal.director.portalIntensity * 0.58
    const breath = 0.9 + Math.sin(signal.time * 0.9) * 0.1
    if (core.current) core.current.opacity = energy * breath * 0.95
    if (halo.current) halo.current.opacity = energy * breath * 0.26
  })
  return (
    <group position={[framing.stageX, framing.stageY + platformY + height / 2, 0]} renderOrder={14}>
      <mesh>
        <cylinderGeometry args={[radius * 0.007, radius * 0.007, height, 10]} />
        <meshBasicMaterial ref={core} color="#eaffff" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius * 0.022, radius * 0.042, height, 20, 1, true]} />
        <meshBasicMaterial ref={halo} color="#35e7ff" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------- anillos de la plataforma */

/**
 * Ondas que suben desde la plataforma. Es la pieza que dice que el podio está
 * alimentando algo, y la que sostiene la última toma cuando el cerebro ya se ha
 * ido arriba: sin ella el capítulo termina en un plano vacío.
 */
function PlatformPulses({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const rings = useRef<Array<THREE.Mesh | null>>([])
  const platformY = ACTORS[0].position[1] * radius
  const count = 3

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const energy = 0.28 + signal.director.platformIntensity * 0.22 + signal.director.portalIntensity * 0.78
    rings.current.forEach((ring, index) => {
      if (!ring) return
      // Cada aro va un tercio de ciclo por detrás del anterior.
      const phase = (signal.time * 0.28 + index / count) % 1
      const span = radius * (0.55 + phase * 1.85)
      ring.scale.set(span, span, 1)
      ring.position.y = platformY + radius * (0.04 + phase * 0.5)
      const material = ring.material as THREE.MeshBasicMaterial
      // Entra y sale: aparecer y desaparecer de golpe se ve como un parpadeo.
      material.opacity = Math.sin(phase * Math.PI) * 0.5 * energy
      ring.visible = material.opacity > 0.004
    })
  })

  return (
    <group position={[framing.stageX, framing.stageY, 0]} renderOrder={12}>
      {Array.from({ length: count }, (_, index) => (
        <mesh key={index} ref={(mesh) => { rings.current[index] = mesh }} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
          <ringGeometry args={[0.94, 1, 72]} />
          <meshBasicMaterial
            color="#4fe0ff" transparent opacity={0} side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/* -------------------------------------------------------- señales neurales */

/**
 * Rutas precomputadas: las señales viajan por conectores continuos en vez de
 * encender puntos aleatorios. El pulso conserva dirección al avanzar el scroll.
 */
function NeuralPulsePaths({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const pulses = useRef<Array<THREE.Mesh | null>>([])
  const lines = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const pulseMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const paths = useMemo(() => {
    const definitions: Array<Array<[number, number, number]>> = [
      [[-1.08, 0.5, 0.18], [-0.78, 0.44, -0.55], [-0.42, 0.34, -1.3], [0.18, 0.5, -2.15], [0.94, 0.28, -3.35]],
      [[1.02, -0.38, 0.05], [0.76, -0.22, -0.72], [0.38, -0.42, -1.55], [-0.2, -0.24, -2.38], [-0.92, -0.48, -3.25]],
      [[-0.72, 0.9, -0.18], [-0.46, 0.58, -0.9], [-0.74, 0.2, -1.72], [-0.32, -0.08, -2.6], [0.54, 0.18, -3.55]],
      [[0.84, 0.76, 0.1], [0.58, 0.42, -0.62], [0.78, 0.06, -1.42], [0.46, -0.36, -2.3], [-0.36, -0.12, -3.42]],
      [[-1.0, -0.68, -0.15], [-0.58, -0.48, -0.88], [-0.76, -0.06, -1.7], [-0.34, 0.28, -2.48], [0.62, 0.62, -3.32]],
      [[1.1, 0.08, -0.12], [0.72, 0.14, -0.82], [0.52, 0.52, -1.62], [0.02, 0.72, -2.5], [-0.78, 0.48, -3.46]],
      [[-0.84, 0.08, 0.22], [-0.48, -0.02, -0.58], [-0.18, 0.18, -1.5], [0.26, -0.08, -2.34], [0.86, -0.18, -3.5]],
    ]
    return definitions.map((points) => {
      const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x * radius, y * radius, z * radius)), false, 'catmullrom', 0.5)
      return { curve, geometry: new THREE.TubeGeometry(curve, 64, radius * 0.009, 6, false) }
    })
  }, [radius])

  useEffect(() => () => paths.forEach((path) => path.geometry.dispose()), [paths])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = Math.max(signal.director.neuralIntensity, signal.director.innerIntensity)
    if (group.current) group.current.visible = intensity > 0.015
    paths.forEach((path, index) => {
      const flow = (signal.time * (0.16 + signal.director.cameraSpeed * 0.045) + signal.progress * 1.9 + index * 0.137) % 1
      const pulse = pulses.current[index]
      if (pulse) {
        pulse.position.copy(path.curve.getPoint(flow))
        pulse.scale.setScalar(0.72 + Math.sin((flow + index) * Math.PI * 2) * 0.12 + intensity * 0.35)
      }
      if (lines.current[index]) lines.current[index]!.opacity = intensity * (0.3 + (index % 2) * 0.06)
      if (pulseMaterials.current[index]) pulseMaterials.current[index]!.opacity = intensity * 0.88
    })
  })

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} renderOrder={14} visible={false}>
      {paths.map((path, index) => (
        <group key={index}>
          <mesh geometry={path.geometry} frustumCulled={false}>
            <meshBasicMaterial
              ref={(material) => { lines.current[index] = material }}
              color={index % 2 ? '#8972ff' : '#31e7ff'} transparent opacity={0}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
          <mesh ref={(mesh) => { pulses.current[index] = mesh }}>
            <sphereGeometry args={[radius * 0.026, 12, 12]} />
            <meshBasicMaterial
              ref={(material) => { pulseMaterials.current[index] = material }}
              color={index % 2 ? '#b8a8ff' : '#d8fbff'} transparent opacity={0}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------- corredor neural */

function InnerNeuralTunnel({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const filamentMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const ringMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const rings = useRef<Array<THREE.Mesh | null>>([])

  const filaments = useMemo(() => Array.from({ length: 12 }, (_, index) => {
    const phase = (index / 12) * Math.PI * 2
    const points = Array.from({ length: 10 }, (__, pointIndex) => {
      const t = pointIndex / 9
      const z = THREE.MathUtils.lerp(0.5, -4.45, t) * radius
      const orbit = (0.7 + Math.sin(t * Math.PI) * 0.5 + (index % 3) * 0.07) * radius
      const angle = phase + t * Math.PI * (1.35 + (index % 2) * 0.22)
      return new THREE.Vector3(Math.cos(angle) * orbit, Math.sin(angle) * orbit * 0.7, z)
    })
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45)
    return new THREE.TubeGeometry(curve, 72, radius * (index % 4 === 0 ? 0.007 : 0.0035), 6, false)
  }), [radius])

  const gates = useMemo(() => [-0.42, -1.05, -1.72, -2.42, -3.16, -3.92], [])
  const nodes = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const lane = index % 7
    const depth = Math.floor(index / 7)
    const angle = (lane / 7) * Math.PI * 2 + depth * 0.38
    const orbit = radius * (0.68 + (index % 3) * 0.17)
    return [Math.cos(angle) * orbit, Math.sin(angle) * orbit * 0.68, radius * (-0.28 - depth * 0.68)] as [number, number, number]
  }), [radius])

  useEffect(() => () => filaments.forEach((geometry) => geometry.dispose()), [filaments])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = Math.max(signal.director.innerIntensity, signal.director.entryIntensity * 0.64)
    if (group.current) {
      group.current.visible = intensity > 0.012
      group.current.rotation.z = signal.time * 0.018 + signal.progress * 0.16
    }
    filamentMaterials.current.forEach((material, index) => {
      if (material) material.opacity = intensity * (index % 4 === 0 ? 0.3 : 0.15)
    })
    ringMaterials.current.forEach((material, index) => {
      if (material) material.opacity = intensity * (0.2 + (index % 2) * 0.08)
    })
    rings.current.forEach((ring, index) => {
      if (!ring) return
      ring.rotation.z = signal.time * (index % 2 ? -0.045 : 0.035) + index * 0.22
      ring.scale.setScalar(1 + Math.sin(signal.time * 0.55 + index) * 0.025)
    })
  })

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} renderOrder={14} visible={false}>
      {filaments.map((geometry, index) => (
        <mesh key={`filament-${index}`} geometry={geometry} frustumCulled={false}>
          <meshBasicMaterial
            ref={(material) => { filamentMaterials.current[index] = material }}
            color={index % 3 === 0 ? '#9f7cff' : index % 2 ? '#2fc5ff' : '#6ef7ff'}
            transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
          />
        </mesh>
      ))}
      {gates.map((z, index) => (
        <mesh key={`gate-${z}`} ref={(mesh) => { rings.current[index] = mesh }} position={[0, 0, z * radius]}>
          <torusGeometry args={[radius * (0.54 + index * 0.055), radius * 0.008, 7, 96]} />
          <meshBasicMaterial
            ref={(material) => { ringMaterials.current[index] = material }}
            color={index % 2 ? '#7e6dff' : '#47e8ff'} transparent opacity={0}
            blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
          />
        </mesh>
      ))}
      {nodes.map((position, index) => (
        <mesh key={`tunnel-node-${index}`} position={position}>
          <sphereGeometry args={[radius * (index % 6 === 0 ? 0.019 : 0.011), 8, 8]} />
          <meshBasicMaterial color={index % 3 ? '#73eaff' : '#907bff'} transparent opacity={0.62} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function PlatformPortalTunnel({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const materials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const depths = useMemo(() => Array.from({ length: 8 }, (_, index) => -0.28 - index * 0.48), [])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = signal.director.portalIntensity
    if (group.current) {
      group.current.visible = intensity > 0.008
      group.current.rotation.z = signal.time * 0.04 + signal.progress * 0.26
    }
    materials.current.forEach((material, index) => {
      if (material) material.opacity = intensity * (0.4 - index * 0.025)
    })
  })
  return (
    <group ref={group} position={[framing.stageX, framing.stageY - radius * 1.24, 0]} visible={false} renderOrder={16}>
      {depths.map((z, index) => (
        <mesh key={z} position={[0, 0, z * radius]} rotation={[0, 0, index * 0.19]}>
          <torusGeometry args={[radius * (0.64 - index * 0.025), radius * (index % 2 ? 0.008 : 0.015), 8, 96]} />
          <meshBasicMaterial
            ref={(material) => { materials.current[index] = material }}
            color={index % 2 ? '#856cff' : '#4eeeff'} transparent opacity={0}
            blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

function InnerAnatomyFragments({ cast, framing, sceneState }: { cast: StageCast; framing: Framing; sceneState: SceneStateRef }) {
  const neural = cast.actors.find((actor) => actor.spec.key === 'neural')
  const roots = useRef<Array<THREE.Group | null>>([])
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#071d36',
    emissive: '#0b315b',
    emissiveIntensity: 0.18,
    roughness: 0.74,
    metalness: 0.04,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [])
  const wire = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#36c5e8',
    transparent: true,
    opacity: 0,
    wireframe: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [])
  const placements = useMemo(() => [
    [-0.48, 0.34, -1.05, -0.4, 0.3],
    [0.46, -0.26, -1.62, 0.55, 0.24],
    [-0.52, -0.18, -2.18, 0.72, 0.3],
    [0.5, 0.3, -2.78, -0.66, 0.25],
    [-0.42, 0.1, -3.42, 0.48, 0.22],
  ] as const, [])
  useEffect(() => () => {
    material.dispose()
    wire.dispose()
  }, [material, wire])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = signal.director.innerIntensity
    material.opacity = intensity * 0.3
    material.emissiveIntensity = 0.12 + intensity * 0.28
    wire.opacity = intensity * 0.065
    roots.current.forEach((root, index) => {
      if (!root) return
      root.rotation.y = placements[index][3] + signal.time * (index % 2 ? -0.035 : 0.028)
      root.rotation.z = Math.sin(signal.time * 0.18 + index) * 0.08
    })
  })
  if (!neural) return null

  return (
    <group position={[framing.stageX, framing.stageY, 0]} name="InnerAnatomyFragments">
      {placements.map(([x, y, z, yaw, size], index) => {
        const localScale = neural.scale * size
        return (
          <group
            key={z}
            ref={(group) => { roots.current[index] = group }}
            position={[x * cast.radius, y * cast.radius, z * cast.radius]}
            rotation={[index * 0.12, yaw, index * -0.08]}
            scale={[localScale, localScale, localScale]}
          >
            <group position={neural.measure.center.clone().negate()}>
              <mesh geometry={neural.measure.geometry} material={material} frustumCulled={false} renderOrder={13} />
              <mesh geometry={neural.measure.geometry} material={wire} scale={1.008} frustumCulled={false} renderOrder={14} />
            </group>
          </group>
        )
      })}
    </group>
  )
}

function InnerCore({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.MeshBasicMaterial>(null)
  const shell = useRef<THREE.MeshBasicMaterial>(null)
  const glow = useRef<THREE.SpriteMaterial>(null)
  const ringA = useRef<THREE.MeshBasicMaterial>(null)
  const ringB = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const glowTexture = useMemo(() => makeRadialSprite(0.42), [])
  useEffect(() => () => glowTexture.dispose(), [glowTexture])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = signal.director.innerIntensity
    if (group.current) {
      group.current.visible = intensity > 0.01
      group.current.rotation.y = signal.time * 0.12 + signal.progress * 0.8
      group.current.rotation.z = signal.time * -0.07
      group.current.scale.setScalar(0.94 + Math.sin(signal.time * 1.6) * 0.04 + intensity * 0.12)
    }
    if (core.current) core.current.opacity = intensity * 0.78
    if (shell.current) shell.current.opacity = intensity * 0.34
    if (glow.current) glow.current.opacity = intensity * 0.66
    if (ringA.current) ringA.current.opacity = intensity * 0.32
    if (ringB.current) ringB.current.opacity = intensity * 0.24
    if (light.current) light.current.intensity = intensity * radius * 2.4
  })
  return (
    <group ref={group} position={[framing.stageX, framing.stageY, -radius * 3.62]} visible={false} renderOrder={15}>
      <mesh>
        <icosahedronGeometry args={[radius * 0.075, 2]} />
        <meshBasicMaterial ref={core} color="#efffff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={1.75}>
        <icosahedronGeometry args={[radius * 0.19, 2]} />
        <meshBasicMaterial ref={shell} color="#6f75ff" wireframe transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite scale={[radius * 0.92, radius * 0.92, 1]} renderOrder={14}>
        <spriteMaterial ref={glow} map={glowTexture} color="#4deaff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} depthTest toneMapped={false} />
      </sprite>
      <mesh rotation={[Math.PI / 2, 0.3, 0]}>
        <torusGeometry args={[radius * 0.36, radius * 0.006, 7, 72]} />
        <meshBasicMaterial ref={ringA} color="#4cecff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[0.4, Math.PI / 2, -0.2]}>
        <torusGeometry args={[radius * 0.29, radius * 0.004, 7, 72]} />
        <meshBasicMaterial ref={ringB} color="#9b7cff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={light} color="#57eaff" intensity={0} distance={radius * 3.2} decay={2} />
    </group>
  )
}

/* --------------------------------------------------------------- conceptos */

export const CONCEPTS = [
  { title: 'Evaluación', copy: 'Organización de procesos' },
  { title: 'Análisis', copy: 'Información estructurada' },
  { title: 'Acompañamiento', copy: 'Apoyo al profesional' },
  { title: 'Inclusión', copy: 'Tecnología aplicada a educación' },
] as const

/**
 * Los cuatro conceptos, anclados alrededor del cerebro.
 *
 * Cada uno es un nodo luminoso pequeño, un conector corto y dos líneas de
 * texto. Nada de tarjetas grandes: la información acompaña al sujeto, no
 * compite con él.
 *
 * Vuelven a estar anclados al mundo 3D después de haber pasado por un panel
 * fijo. El panel hizo falta mientras la cámara viajaba por dentro del cerebro,
 * porque un ancla en movimiento cruzaba la pantalla en diagonal; con la cámara
 * quieta a 0,83 de distancia el ancla es estable y anclar al mundo vuelve a ser
 * lo correcto: el texto señala una parte concreta del objeto.
 *
 * Se colocan a 1,22 R en los cuatro cuadrantes. Con el cerebro ocupando el 53 %
 * del alto, eso deja cada etiqueta a un 35 % del centro: dentro del encuadre
 * con margen, incluso en 16:9 estrecho.
 */
function Concepts({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const nodes = useRef<Array<THREE.Group | null>>([])
  const labels = useRef<Array<HTMLDivElement | null>>([])
  const connectorMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const r = radius
  const positions = useMemo<Array<[number, number, number]>>(() => [
    [-r * 1.24, r * 0.62, -r * 0.86],
    [r * 0.96, r * 0.26, -r * 1.58],
    [-r * 0.58, r * 0.9, -r * 2.38],
    [r * 0.24, -r * 0.34, -r * 3.12],
  ], [r])
  const connectors = useMemo(() => positions.map((position, index) => {
    const destination = new THREE.Vector3(...position)
    const origin = destination.clone().multiplyScalar(0.58)
    origin.z += r * (0.18 + index * 0.08)
    const middle = origin.clone().lerp(destination, 0.55)
    middle.y += (index % 2 ? -1 : 1) * r * 0.12
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([origin, middle, destination]), 32, r * 0.0038, 5, false)
  }), [positions, r])
  useEffect(() => () => connectors.forEach((geometry) => geometry.dispose()), [connectors])

  useFrame((state, delta) => {
    const signal = sceneState.current
    const p = signal.progress
    const alive = signal.director.conceptIntensity
    // La síntesis reúne los cuatro conceptos después de mostrarlos uno a uno.
    const synthesis = bell(p, 0.75, 0.79, PHASE.REASSEMBLY + 0.035) * alive
    if (group.current) group.current.visible = alive > 0.004
    signal.activeHotspot = synthesis > 0.4 ? '4 nodos' : '—'

    CONCEPTS.forEach((concept, index) => {
      const [from, to] = CONCEPT_WINDOWS[index]
      const solo = bell(p, from - 0.02, (from + to) / 2, to + 0.02)
      const authoredWeight = Math.max(solo * Math.max(alive, 0.68), synthesis * 0.96)
      const weight = Math.pow(authoredWeight, 0.42)
      if (weight > 0.45 && solo > synthesis * 0.85) signal.activeHotspot = concept.title

      const label = labels.current[index]
      if (label) {
        // `Html` vive en un portal DOM: ocultar el Group de Three no basta.
        // Se corta también aquí para que ninguna etiqueta sobreviva al handoff.
        label.style.display = alive > 0.015 ? 'block' : 'none'
        label.style.opacity = String(weight)
        // Las de la izquierda crecen hacia fuera, no hacia el cerebro: drei
        // ancla la esquina superior izquierda del elemento en el punto
        // proyectado, así que hay que retirarlas su propio ancho.
        const side = index % 2 ? 0 : -100
        label.style.transform = `translate3d(${side}%, ${10 * (1 - weight)}px, 0)`
      }
      const node = nodes.current[index]
      if (!node) return
      const nodeDamping = signal.forcedProgress !== null ? 1 : 1 - Math.exp(-delta * 9)
      node.scale.setScalar(THREE.MathUtils.lerp(node.scale.x, 0.45 + weight * 0.55, nodeDamping))
      node.rotation.z = signal.time * (index % 2 ? -0.3 : 0.3)
      node.traverse((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
        if (!material?.isMaterial) return
        material.opacity = (material.userData.base ??= material.opacity) * (0.2 + weight * 0.8)
      })
      if (connectorMaterials.current[index]) connectorMaterials.current[index]!.opacity = weight * 0.34
    })
  })

  const nodeRadius = r * 0.024

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} renderOrder={16} visible={false}>
      {CONCEPTS.map((concept, index) => (
        <group key={concept.title}>
          <mesh geometry={connectors[index]} frustumCulled={false}>
            <meshBasicMaterial
              ref={(material) => { connectorMaterials.current[index] = material }}
              color={index % 2 ? '#8f7dff' : '#42e7ff'} transparent opacity={0}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
          <group position={positions[index]} ref={(node) => { nodes.current[index] = node }}>
          <mesh><sphereGeometry args={[nodeRadius, 12, 12]} /><meshBasicMaterial color="#e6fdff" transparent opacity={1} toneMapped={false} depthWrite={false} /></mesh>
          <mesh>
            <torusGeometry args={[nodeRadius * 2.8, nodeRadius * 0.2, 8, 40]} />
            <meshBasicMaterial color="#35dcff" transparent opacity={0.85} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
          </mesh>
          <Html
            position={[index % 2 ? nodeRadius * 3.4 : -nodeRadius * 3.4, nodeRadius * 1.2, 0]}
            zIndexRange={[80, 60]}
            pointerEvents="none"
            center={false}
          >
            <div
              ref={(node) => { labels.current[index] = node }}
              className={`concept-tag ${index % 2 ? 'is-right' : 'is-left'}`}
            >
              <i aria-hidden="true" />
              <strong>{concept.title}</strong>
              <small>{concept.copy}</small>
            </div>
          </Html>
          </group>
        </group>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------- escena debug 3D */

function DebugLabel({ text, position, radius }: { text: string; position: [number, number, number]; radius: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 72
    const context = canvas.getContext('2d')!
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(2, 10, 24, .86)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#55e8ff'
    context.lineWidth = 3
    context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
    context.fillStyle = '#dffcff'
    context.font = '600 28px ui-monospace, SFMono-Regular, Consolas, monospace'
    context.textBaseline = 'middle'
    context.fillText(text, 18, canvas.height / 2)
    const next = new THREE.CanvasTexture(canvas)
    next.colorSpace = THREE.SRGBColorSpace
    return next
  }, [text])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite position={position} scale={[radius * 0.96, radius * 0.14, 1]} renderOrder={50}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

function DebugScene({ cast, framing, sceneState }: { cast: StageCast; framing: Framing; sceneState: SceneStateRef }) {
  const { radius } = cast
  const rail = useMemo(() => createHeroRail(framing, radius), [framing, radius])
  const pathGeometry = useMemo(() => new THREE.TubeGeometry(rail.position, 220, radius * 0.003, 6, false), [rail, radius])
  const safeGates = useMemo(() => [0.42, -0.12, -0.68, -1.24, -1.82, -2.42, -3.04, -3.68], [])
  const boundsGeometry = useMemo(() => {
    const box = new THREE.BoxGeometry(cast.brainSize.x, cast.brainSize.y, cast.brainSize.z)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return edges
  }, [cast.brainSize.x, cast.brainSize.y, cast.brainSize.z])
  const target = useRef<THREE.Mesh>(null)
  useEffect(() => () => {
    pathGeometry.dispose()
    boundsGeometry.dispose()
  }, [boundsGeometry, pathGeometry])
  useFrame(() => target.current?.position.fromArray(sceneState.current.lookAt))

  const pivots: Array<{ name: string; position: [number, number, number]; color: string; labelOffsetX: number }> = [
    { name: 'LeftHemispherePivot', position: [framing.stageX - radius * 0.21, framing.stageY, 0], color: '#ff67cb', labelOffsetX: -0.58 },
    { name: 'RightHemispherePivot', position: [framing.stageX + radius * 0.21, framing.stageY, 0], color: '#53e7ff', labelOffsetX: 0.58 },
    { name: 'NeuralCorePivot', position: [framing.stageX, framing.stageY, -radius * 0.14], color: '#a18bff', labelOffsetX: 0 },
    { name: 'PlatformPortal', position: [framing.stageX, framing.stageY - radius * 1.24, 0], color: '#7cf7ff', labelOffsetX: 0 },
  ]

  return (
    <group name="HeroCameraDebug" renderOrder={48}>
      <mesh geometry={pathGeometry} frustumCulled={false}>
        <meshBasicMaterial color="#ffd166" transparent opacity={0.76} depthWrite={false} toneMapped={false} />
      </mesh>
      <lineSegments geometry={boundsGeometry} position={[framing.stageX, framing.stageY, 0]}>
        <lineBasicMaterial color="#5cf2ff" transparent opacity={0.82} depthTest={false} toneMapped={false} />
      </lineSegments>
      {/* Gates discretos: muestran el corredor sin envolver ni tapar la cámara cuando entra. */}
      {safeGates.map((z, index) => (
        <mesh key={z} position={[framing.stageX, framing.stageY, radius * z]}>
          <torusGeometry args={[radius * 0.27, radius * 0.003, 5, 42]} />
          <meshBasicMaterial
            color={index === 0 ? '#9dffd4' : '#38ffb3'}
            transparent
            opacity={index === 0 ? 0.48 : 0.3}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
      {pivots.map((pivot) => (
        <group key={pivot.name}>
          <mesh position={pivot.position}>
            <sphereGeometry args={[radius * 0.035, 12, 12]} />
            <meshBasicMaterial color={pivot.color} depthTest={false} toneMapped={false} />
          </mesh>
          <DebugLabel text={pivot.name} position={[pivot.position[0] + pivot.labelOffsetX * radius, pivot.position[1] + radius * 0.18, pivot.position[2]]} radius={radius} />
        </group>
      ))}
      <mesh ref={target}>
        <octahedronGeometry args={[radius * 0.025, 0]} />
        <meshBasicMaterial color="#ffe66d" wireframe depthTest={false} toneMapped={false} />
      </mesh>
      <DebugLabel text="Camera target" position={[framing.stageX, framing.stageY + radius * 1.35, -radius * 0.4]} radius={radius} />
    </group>
  )
}

/* ------------------------------------------------------------------ mundo */

const DENSITY: Record<Quality, number> = { high: 1, medium: 0.6, low: 0.32 }

function World({ sceneState, framing, quality, cast, debugScene }: { sceneState: SceneStateRef; framing: Framing; quality: Quality; cast: StageCast; debugScene: boolean }) {
  const [mountainsFar, mountainsMid, mountainsFront, stars, network, fogDeep, fogFront, fogBack] = useLoader(THREE.TextureLoader, [
    `${HERO}/background-mountains-night.png`, `${LAYERS}/mountains-mid.png`, `${LAYERS}/mountains-front.png`,
    `${LAYERS}/stars-alpha.png`, `${LAYERS}/network-alpha.png`,
    `${REFERENCE}/fog-deep.png`, `${REFERENCE}/fog-front.png`, `${HERO}/fog-back.png`,
  ])
  const { size } = useThree()
  const aspect = size.width / Math.max(size.height, 1)
  const worldFog = useRef<THREE.FogExp2>(null)
  const networkPlate = useRef<THREE.Mesh>(null)
  const density = DENSITY[quality]
  const n = (value: number) => Math.max(6, Math.round(value * density))

  useEffect(() => {
    for (const texture of [mountainsFar, mountainsMid, mountainsFront, stars, network, fogDeep, fogFront, fogBack]) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      texture.needsUpdate = true
    }
  }, [fogBack, fogDeep, fogFront, mountainsFar, mountainsFront, mountainsMid, network, stars])

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    // Niebla global sólo para integrar distancias. No sustituye a las cartas.
    if (worldFog.current) worldFog.current.density = 0.007 + signal.director.fogIntensity * 0.005
    const material = networkPlate.current?.material as THREE.MeshBasicMaterial | undefined
    const exterior = exteriorVisibility(p)
    if (material) material.opacity = (0.04 + bell(p, 0.14, PHASE.ORBIT, 0.56) * 0.12) * exterior
    if (networkPlate.current) networkPlate.current.visible = exterior > 0.004
    signal.fogOpacity = THREE.MathUtils.lerp(0.26, 0.14, smoothstep(PHASE.SYNTHESIS, PHASE.HANDOFF, p))
    signal.particleCount = n(400) + n(180) + n(80) + n(160) + n(28) + n(16) + n(72)
  })

  return (
    <>
      <fogExp2 ref={worldFog} attach="fog" args={['#03142c', 0.0125]} />

      {/* ------------------------------------------------------ mundo profundo */}
      <Plate
        texture={stars} z={WORLD_Z.deepStars} framing={framing} aspect={aspect} imageAspect={1.78}
        opacity={0.16} additive margin={1.35} renderOrder={0} sceneState={sceneState} exterior
      />
      <LivingLandscape
        texture={mountainsFar} sceneState={sceneState} z={WORLD_Z.mountainsFar} framing={framing}
        viewportAspect={aspect} imageAspect={1.87} tint="#8298b8" margin={1.35} renderOrder={1}
        offsetY={-0.02} depth={0.12} phase={0.4}
      />
      <CinematicSky sceneState={sceneState} framing={framing} quality={quality} />

      {/* DeepParticles: cuatrocientas, diminutas, prácticamente inmóviles. Son
          la referencia contra la que se mide todo lo demás. */}
      <ParticleLayer count={n(400)} spread={[74, 36, 15]} center={[0, 2, WORLD_Z.fogFar]} size={0.075} opacity={0.42} color="#4c8ef8" sceneState={sceneState} seed={3} pointerStrength={0.015} activity="exterior" />

      {/* FogFar */}
      <FogLayer texture={fogDeep} sceneState={sceneState} position={[-6, -3.2, WORLD_Z.fogFar]} scale={[54, 18]} opacity={0.34} flowSpeed={[0.012, 0.003]} noiseScale={2.6} distortion={0.03} density={0.95} scrollShift={[-1.6, 0.3]} renderOrder={3} depth={0.08} exterior />

      <mesh ref={networkPlate} position={[framing.stageX * 2.4, 2, WORLD_Z.techNetwork]} scale={[26, 15, 1]} renderOrder={4} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={network} transparent opacity={0.05} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* ---------------------------------------------------------- mundo medio */}
      <LivingLandscape
        texture={mountainsMid} sceneState={sceneState} z={WORLD_Z.mountainsMid} framing={framing}
        viewportAspect={aspect} imageAspect={1.87} opacity={0.92} tint="#8da9cf" margin={1.4}
        renderOrder={5} offsetY={-0.03} depth={0.56} phase={1.8}
      />

      {/* FogBack: justo detrás del cerebro. Es la capa que le da un fondo contra
          el que recortarse mientras la cámara orbita. */}
      <FogLayer texture={fogBack} sceneState={sceneState} position={[3.5, -1.6, WORLD_Z.fogBack]} scale={[30, 10]} opacity={0.24} flowSpeed={[0.016, 0.004]} noiseScale={3.4} distortion={0.026} density={0.86} scrollShift={[1.1, -0.15]} renderOrder={6} depth={0.3} exterior />

      {/* WorldParticles: ciento ochenta, movimiento lento, a media distancia. */}
      <ParticleLayer count={n(180)} spread={[34, 18, 10]} center={[0, 0.5, WORLD_Z.mountainsFront]} size={0.05} opacity={0.44} color="#79dfff" sceneState={sceneState} drift={0.05} seed={7} pointerStrength={0.06} activity="exterior" />

      <LivingLandscape
        texture={mountainsFront} sceneState={sceneState} z={WORLD_Z.mountainsFront} framing={framing}
        viewportAspect={aspect} imageAspect={1.87} opacity={0.96} tint="#a7bddb" margin={1.5}
        renderOrder={7} offsetY={-0.05} depth={1} phase={3.1}
      />

      {/* FogMid: a la profundidad del cerebro. Se mete entre la montaña
          delantera y el sujeto, que es donde hace falta aire. */}
      <FogLayer texture={fogDeep} sceneState={sceneState} position={[-2.5, -1.9, WORLD_Z.fogMiddle]} scale={[18, 6.2]} opacity={0.2} flowSpeed={[0.021, 0.002]} noiseScale={4} distortion={0.036} density={0.8} scrollShift={[0.9, 0.2]} renderOrder={8} depth={0.62} exterior />

      {/* -------------------------------------------------------------- escena */}
      <LightRig cast={cast} sceneState={sceneState} framing={framing} />
      <StageCastActors cast={cast} sceneState={sceneState} framing={framing} />
      {!debugScene ? (
        <>
          <HeroRing radius={cast.radius} framing={framing} sceneState={sceneState} />
          <NeuralPulsePaths radius={cast.radius} framing={framing} sceneState={sceneState} />
          <InnerNeuralTunnel radius={cast.radius} framing={framing} sceneState={sceneState} />
          <InnerAnatomyFragments cast={cast} framing={framing} sceneState={sceneState} />
          <InnerCore radius={cast.radius} framing={framing} sceneState={sceneState} />
          <Beam radius={cast.radius} framing={framing} sceneState={sceneState} />
          <Scanner radius={cast.radius} framing={framing} sceneState={sceneState} />
          <PlatformPulses radius={cast.radius} framing={framing} sceneState={sceneState} />
          <PlatformPortalTunnel radius={cast.radius} framing={framing} sceneState={sceneState} />
          <Concepts radius={cast.radius} framing={framing} sceneState={sceneState} />
        </>
      ) : null}
      {debugScene ? <DebugScene cast={cast} framing={framing} sceneState={sceneState} /> : null}

      {/* El corredor interior existe en coordenadas de mundo. Al avanzar la
          cámara las motas cercanas salen hacia los bordes por perspectiva; no
          se simula ese movimiento alterando x/y en pantalla. */}
      {!debugScene ? <ParticleLayer
        count={n(160)}
        spread={[cast.radius * 4.6, cast.radius * 3.1, cast.radius * 4.8]}
        center={[framing.stageX, framing.stageY, -cast.radius * 1.65]}
        size={0.044} opacity={0.66} color="#69dcff" sceneState={sceneState}
        drift={0.05} seed={17} spin={0.022} softness={0.42} activity="inner"
      /> : null}
      {!debugScene ? <ParticleLayer
        count={n(28)}
        spread={[cast.radius * 2.8, cast.radius * 2.2, cast.radius * 3.6]}
        center={[framing.stageX, framing.stageY, -cast.radius * 0.55]}
        size={0.16} opacity={0.2} color="#d9fbff" sceneState={sceneState}
        drift={0.08} seed={23} spin={0.035} softness={0.62} swell={0.72} activity="entry"
      /> : null}

      {/* Dos velos internos, separados más de 2R, rompen el aspecto de plano
          único y dan oclusión durante ENTRY/INNER_FLIGHT. */}
      {!debugScene ? <FogLayer
        texture={fogFront} sceneState={sceneState}
        position={[framing.stageX - cast.radius * 1.25, framing.stageY + cast.radius * 0.16, -cast.radius * 1.15]}
        scale={[cast.radius * 6.4, cast.radius * 2.8]} opacity={0.06}
        flowSpeed={[0.025, -0.008]} noiseScale={5.2} distortion={0.065} density={0.76}
        scrollShift={[cast.radius * 2.4, cast.radius * 0.2]} renderOrder={11} depth={0.88}
        window={[0.43, 0.57, 0.72]}
      /> : null}
      {!debugScene ? <FogLayer
        texture={fogDeep} sceneState={sceneState}
        position={[framing.stageX + cast.radius * 0.9, framing.stageY - cast.radius * 0.2, -cast.radius * 3.35]}
        scale={[cast.radius * 7.6, cast.radius * 3.2]} opacity={0.09}
        flowSpeed={[-0.019, 0.006]} noiseScale={4.4} distortion={0.052} density={0.72}
        scrollShift={[-cast.radius * 1.8, cast.radius * 0.34]} renderOrder={10} depth={0.72}
        window={[0.52, 0.69, 0.84]}
      /> : null}

      {/* BrainParticles: ochenta, pegadas al sujeto. Cruzan por delante de su
          silueta en cuanto la cámara se mueve y dan la medida de la distancia. */}
      <ParticleLayer
        count={n(80)} spread={[cast.radius * 2.9, cast.radius * 2.5, cast.radius * 2.2]}
        center={[framing.stageX, framing.stageY, 0]} size={0.038} opacity={0.7} color="#c9f4ff"
        sceneState={sceneState} drift={0.035} seed={11} spin={0.03} pointerStrength={0.12}
      />

      {/* ------------------------------------------------------ mundo delantero */}
      {/* Cortina de apertura: el primer gesto separa y erosiona dos bancos a
          distinta profundidad. El cerebro ya existe detrás de ellos, como
          silueta energética, y aparece completo al abrirse el aire. */}
      <FogLayer
        texture={fogBack} sceneState={sceneState} position={[-2.1, 0.15, 2.25]} scale={[13.5, 5.2]}
        opacity={0.52} flowSpeed={[0.026, 0.004]} noiseScale={3.7} distortion={0.07} density={0.96}
        scrollShift={[-15.5, 1.25]} renderOrder={18} depth={1.12} fadeOut={[0.025, 0.16]} exterior
      />
      {quality !== 'low' ? <FogLayer
        texture={fogFront} sceneState={sceneState} position={[2.7, -0.3, 3.05]} scale={[14.8, 5.6]}
        opacity={0.38} flowSpeed={[0.031, 0.006]} noiseScale={4.45} distortion={0.082} density={0.9}
        scrollShift={[16.8, 1.65]} renderOrder={19} depth={1.38} fadeOut={[0.035, 0.175]} exterior
      /> : null}

      {/* FogFrontA cruza la silueta durante la activación. Tapar un poco al
          protagonista dice más sobre la profundidad que veinte órbitas. */}
      <FogLayer
        texture={fogFront} sceneState={sceneState} position={[-8.5, -0.9, WORLD_Z.fogFrontLeft]} scale={[12, 4]}
        opacity={0.3} flowSpeed={[0.021, 0.009]} noiseScale={4.6} distortion={0.05} density={0.95}
        scrollShift={[13, 0.6]} renderOrder={20} depth={1.25} window={[0.3, 0.45, 0.59]} exterior
      />
      {/* FogFrontB cruza durante la institución: disimula el cambio de
          composición justo cuando entran los dos paneles. */}
      <FogLayer
        texture={fogFront} sceneState={sceneState} position={[7.5, -1.6, WORLD_Z.fogFrontRight]} scale={[13, 4.4]}
        opacity={0.26} flowSpeed={[-0.016, 0.006]} noiseScale={3.9} distortion={0.045} density={0.88}
        scrollShift={[-14, 1]} renderOrder={21} depth={1.4} window={[0.78, 0.88, 1]} exterior
      />

      {/* LensParticles: dieciséis, grandes y desenfocadas, casi encima de la
          lente. Son las que atraviesan la pantalla cuando la cámara barre, y
          las que convierten una órbita en una sensación de desplazamiento. */}
      {!debugScene ? <ParticleLayer
        count={n(16)} spread={[9, 5.5, 1.6]} center={[framing.stageX, framing.stageY, WORLD_Z.lensParticles]}
        size={0.24} opacity={0.15} color="#e2fbff" sceneState={sceneState} drift={0.05} seed={13}
        softness={0.6} swell={0.55} pointerStrength={0.42}
      /> : null}
      <ParticleLayer
        count={n(72)}
        spread={[cast.radius * 1.5, cast.radius * 1.5, cast.radius * 3.8]}
        center={[framing.stageX, framing.stageY - cast.radius * 1.24, -cast.radius * 1.8]}
        size={0.052} opacity={0.75} color="#9ff6ff" sceneState={sceneState}
        drift={0.04} seed={31} spin={0.06} softness={0.38} activity="portal"
      />
    </>
  )
}

/* ------------------------------------------------------------------ lienzo */

function qualityFor(width: number): Quality {
  if (width < 900) return 'low'
  if (width < 1440) return 'medium'
  return 'high'
}

/** Publica métricas reales del renderer y degrada el tier si no se sostiene. */
function Instrumentation({ sceneState, quality, onDrop }: { sceneState: SceneStateRef; quality: Quality; onDrop: () => void }) {
  const samples = useRef<number[]>([])
  useFrame((state, delta) => {
    const signal = sceneState.current
    signal.dpr = state.gl.getPixelRatio()
    signal.quality = quality
    if (signal.forcedProgress !== null) return
    const list = samples.current
    list.push(delta)
    if (list.length < 140) return
    const sorted = [...list].sort((a, b) => a - b)
    // Mediana, no media: una pausa del recolector de basura no debe degradar
    // la escena por sí sola.
    if (sorted[sorted.length >> 1] > 1 / 42) onDrop()
    list.length = 0
  })
  return null
}

export function HeroScene({ sceneState }: { sceneState: SceneStateRef }) {
  const [environment, setEnvironment] = useState<{ ready: boolean; quality: Quality; reducedMotion: boolean; debugScene: boolean; framing: Framing | null }>(
    { ready: false, quality: 'high', reducedMotion: false, debugScene: false, framing: null },
  )

  useEffect(() => {
    const read = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const test = readTestMode(window.location.search)
      const requestedTimeParam = new URLSearchParams(window.location.search).get('t')
      const requestedTime = requestedTimeParam === null ? null : Number(requestedTimeParam)
      const signal = sceneState.current
      signal.forcedProgress = test.active ? test.progress : null
      signal.forcedTime = test.active && requestedTime !== null && Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : null
      if (test.active) {
        signal.progress = test.progress
        signal.targetProgress = test.progress
      }
      // El arnés de capturas recorre quince progresos. Recargar la página en
      // cada uno volvería a descargar y medir los cinco modelos; con esto basta
      // una carga y el resto son saltos instantáneos.
      if (test.active) {
        ;(window as unknown as { __heroSetProgress?: (value: number) => void }).__heroSetProgress = (value) => {
          const clamped = clamp01(value)
          signal.forcedProgress = clamped
          signal.progress = clamped
          signal.targetProgress = clamped
          // La interfaz va con la escena: el texto se retira, la institución
          // entra y el portal se abre en el mismo progreso.
          ;(window as unknown as { __heroSetDomProgress?: (v: number) => void }).__heroSetDomProgress?.(clamped)
        }
        ;(window as unknown as { __heroSetTime?: (value: number) => void }).__heroSetTime = (value) => {
          signal.forcedTime = Math.max(0, Number.isFinite(value) ? value : 0)
        }
      }
      setEnvironment((current) => ({
        ready: true,
        // El tier no se recalcula al reescalar si ya se degradó por medición.
        quality: current.ready ? current.quality : qualityFor(width),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        debugScene: new URLSearchParams(window.location.search).get('heroDebugScene') === '1',
        framing: frameStage(width, height),
      }))
    }
    read()
    window.addEventListener('resize', read, { passive: true })
    return () => {
      window.removeEventListener('resize', read)
      delete (window as unknown as { __heroSetProgress?: unknown }).__heroSetProgress
      delete (window as unknown as { __heroSetTime?: unknown }).__heroSetTime
    }
  }, [sceneState])

  const framing = environment.framing
  if (!framing) return null

  const dpr: [number, number] = environment.quality === 'high' ? [1, 1.5] : environment.quality === 'medium' ? [1, 1.25] : [1, 1]

  return (
    <div className="hero-canvas" aria-hidden="true">
      <Canvas
        dpr={dpr}
        camera={{ fov: STAGE_FOV, near: 0.035, far: 160, position: [framing.stageX, 0, framing.distance] }}
        gl={{ alpha: false, antialias: environment.quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMappingExposure = 1.02
        }}
        scene={{ background: new THREE.Color('#020a18') }}
      >
        <Suspense fallback={null}>
          <SceneBody sceneState={sceneState} framing={framing} quality={environment.quality} reducedMotion={environment.reducedMotion} debugScene={environment.debugScene} onDrop={() => setEnvironment((c) => ({ ...c, quality: c.quality === 'high' ? 'medium' : 'low' }))} />
        </Suspense>
      </Canvas>
    </div>
  )
}

/**
 * Reloj y amortiguación del progreso.
 *
 * ScrollTrigger escribe `targetProgress` y aquí se persigue con una constante
 * de tiempo de 72 ms: el 95 % del recorrido en poco más de 200 ms. Hay peso,
 * pero la escena responde al gesto en vez de arrastrarse detrás de él.
 *
 * En modo de prueba todo se congela: sin esto, dos capturas del mismo progreso
 * caerían en instantes distintos de la niebla y la comparación no probaría nada.
 */
function HeroDirector({ sceneState, framing, radius, reducedMotion }: { sceneState: SceneStateRef; framing: Framing; radius: number; reducedMotion: boolean }) {
  const rail = useMemo(() => createHeroRail(framing, radius), [framing, radius])
  useFrame((state, delta) => {
    const signal = sceneState.current
    if (signal.forcedProgress !== null) {
      signal.time = signal.forcedTime ?? 12
      signal.progress = signal.forcedProgress
      signal.targetProgress = signal.forcedProgress
      signal.pointerX = 0
      signal.pointerY = 0
    } else if (reducedMotion) {
      signal.time = 0
      signal.progress = 0.16
      signal.targetProgress = 0.16
      signal.pointerX = 0
      signal.pointerY = 0
    } else {
      signal.time = state.clock.elapsedTime
      const ease = 1 - Math.exp(-delta / PROGRESS_DAMPING)
      signal.progress += (signal.targetProgress - signal.progress) * ease
    }
    resolveHeroDirector(signal.progress, rail, radius, signal.director)
  }, -100)
  return null
}

/** Bloom aislado por luminancia: sólo reaccionan pulsos, HUD y bordes emisivos. */
function CinematicBloom({ quality, bloom = true }: { quality: Exclude<Quality, 'low'>; bloom?: boolean }) {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const next = new EffectComposer(gl)
    next.addPass(new RenderPass(scene, camera))
    if (bloom) {
      next.addPass(new UnrealBloomPass(
        new THREE.Vector2(size.width, size.height),
        quality === 'high' ? 0.38 : 0.28,
        0.42,
        0.86,
      ))
    }
    next.addPass(new SMAAPass())
    next.addPass(new OutputPass())
    return next
  }, [bloom, camera, gl, quality, scene, size.height, size.width])

  useEffect(() => {
    composer.setPixelRatio(Math.min(gl.getPixelRatio(), 1.2))
    composer.setSize(size.width, size.height)
  }, [composer, gl, size.height, size.width])
  useEffect(() => () => composer.dispose(), [composer])
  useFrame((_state, delta) => composer.render(delta), 1)
  return null
}

/** El rig de cámara necesita el radio medido, que sólo existe tras cargar. */
function SceneBody({ sceneState, framing, quality, reducedMotion, debugScene, onDrop }: { sceneState: SceneStateRef; framing: Framing; quality: Quality; reducedMotion: boolean; debugScene: boolean; onDrop: () => void }) {
  const cast = useStageCast()
  const frames = useRef(0)
  // Bandera de «escena estable»: el arnés de capturas espera a que el modelo
  // esté medido y se hayan pintado varios frames. Sin ella las capturas caerían
  // durante la carga del GLB y no probarían nada.
  useFrame(() => {
    if (frames.current > 8) return
    frames.current += 1
    if (frames.current === 8) (window as unknown as { __heroReady?: boolean }).__heroReady = true
  })
  useEffect(() => () => { (window as unknown as { __heroReady?: boolean }).__heroReady = false }, [])
  return (
    <>
      <HeroDirector sceneState={sceneState} framing={framing} radius={cast.radius} reducedMotion={reducedMotion} />
      <DirectedCameraRig framing={framing} radius={cast.radius} sceneState={sceneState} />
      <Instrumentation sceneState={sceneState} quality={quality} onDrop={onDrop} />
      <World sceneState={sceneState} framing={framing} quality={quality} cast={cast} debugScene={debugScene} />
      {quality !== 'low' ? <CinematicBloom quality={quality} bloom={!debugScene} /> : null}
    </>
  )
}
