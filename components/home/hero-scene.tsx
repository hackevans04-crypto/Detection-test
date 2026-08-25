'use client'

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { bell, range, type HeroSceneState } from '@/lib/hero/depth'
import {
  ACTORS,
  CAMERA_ORBIT,
  CAMERA_TARGET,
  STAGE_FOV,
  WORLD_Z,
  frameStage,
  halfHeightAt,
  readTestMode,
  type Framing,
} from '@/lib/hero/stage'
import { FogLayer } from './fog-layer'
import { LightRig, StageCastActors, useStageCast, type StageCast } from './hero-stage'

const HERO = '/detection-home/hero'
const LAYERS = `${HERO}/layers`
const REFERENCE = `${HERO}/reference`
type SceneStateRef = MutableRefObject<HeroSceneState>
type Quality = 'high' | 'medium' | 'low'

/* ------------------------------------------------------------------ cámara */

/**
 * Único dueño de la cámara.
 *
 * Orbita alrededor del cerebro en vez de recorrer coordenadas absolutas: el
 * encuadre se mantiene mientras el punto de vista gira, así que el modelo
 * cambia de silueta y cada capa del fondo se desplaza en proporción inversa a
 * su distancia. Es la diferencia entre profundidad y zoom.
 */
function CameraRig({ framing, radius, sceneState }: { framing: Framing; radius: number; sceneState: SceneStateRef }) {
  const orbit = useMemo(() => new THREE.Vector3(), [])
  const targetOffset = useMemo(() => new THREE.Vector3(), [])
  const desired = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const currentLook = useRef<THREE.Vector3 | null>(null)

  useFrame((state, delta) => {
    const signal = sceneState.current
    const p = signal.progress
    const camera = state.camera as THREE.PerspectiveCamera
    if (camera.fov !== framing.fov) {
      camera.fov = framing.fov
      camera.updateProjectionMatrix()
    }

    CAMERA_ORBIT.getPoint(p, orbit)
    CAMERA_TARGET.getPoint(p, targetOffset)
    const azimuth = THREE.MathUtils.degToRad(orbit.x) + signal.pointerX * 0.055
    const elevation = THREE.MathUtils.degToRad(orbit.y) - signal.pointerY * 0.045
    const distance = framing.distance * orbit.z
    const flat = Math.cos(elevation) * distance
    desired.set(
      framing.stageX + Math.sin(azimuth) * flat,
      framing.lookAtY + Math.sin(elevation) * distance,
      Math.cos(azimuth) * flat,
    )
    // El desplazamiento lateral se deshace entre el 18 % y el 33 %, mientras la
    // columna de texto se retira: el cerebro pasa de acompañar al texto a ser el
    // único sujeto, y lo hace con un movimiento de cámara, no con un salto.
    //
    // Termina antes del 35 % a propósito. Una panorámica y una órbita a la vez
    // se restan entre sí a ciertas profundidades: mientras la cámara recentra,
    // el sujeto viaja por pantalla y la ley de parallax deja de poder medirse.
    // Separadas en el tiempo, cada una hace su trabajo y ambas son verificables.
    const offCentre = framing.lookAtX * (1 - range(p, 0.18, 0.33))
    look.set(
      framing.stageX + offCentre + targetOffset.x * radius,
      framing.lookAtY + targetOffset.y * radius,
      targetOffset.z * radius,
    )

    // El primer frame se coloca sin amortiguar: si no, la escena entra desde
    // el origen y la captura de p=0 sale a medio camino.
    if (!currentLook.current) {
      currentLook.current = look.clone()
      camera.position.copy(desired)
    } else {
      const ease = 1 - Math.exp(-delta * 5.5)
      camera.position.lerp(desired, ease)
      currentLook.current.lerp(look, ease)
    }
    camera.lookAt(currentLook.current)

    signal.cameraPosition = [camera.position.x, camera.position.y, camera.position.z]
    signal.cameraFov = camera.fov
    signal.lookAt = [currentLook.current.x, currentLook.current.y, currentLook.current.z]
    signal.drawCalls = state.gl.info.render.calls
  })
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
}: {
  texture: THREE.Texture; z: number; framing: Framing; aspect: number; imageAspect: number
  margin?: number; opacity?: number; renderOrder?: number; additive?: boolean; tint?: string; offsetY?: number
}) {
  const [width, height] = coverPlate(framing, z, aspect, imageAspect, margin)
  return (
    <mesh position={[0, offsetY * height, z]} scale={[width, height, 1]} renderOrder={renderOrder} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
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

function makeRadialSprite() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)')
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
 * las motas de lente se muevan mucho y las profundas casi nada.
 */
function ParticleLayer({
  count, spread, center, size, opacity, color, sceneState, drift = 0, seed = 1,
}: {
  count: number; spread: [number, number, number]; center: [number, number, number]
  size: number; opacity: number; color: string; sceneState: SceneStateRef; drift?: number; seed?: number
}) {
  const points = useRef<THREE.Points>(null)
  const sprite = useMemo(makeRadialSprite, [])
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
    if (!points.current || !drift) return
    const time = sceneState.current.time
    points.current.position.y = Math.sin(time * 0.14) * drift
    points.current.rotation.y = time * 0.004
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial
        map={sprite} alphaMap={sprite} alphaTest={0.012} color={color} size={size}
        transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending}
        sizeAttenuation toneMapped={false}
      />
    </points>
  )
}


/* --------------------------------------------------------- anillo del HUD */

/**
 * El anillo limpio del fotograma cero.
 *
 * La referencia tiene un único círculo fino rodeando el cerebro con unos pocos
 * nodos, no una maraña de órbitas. Ningún GLB del reparto lo aporta —el HUD
 * orbital es una esfera armilar maciza—, así que se construye aquí: un toro y
 * ocho nodos, con `depthTest` activo para que el tramo trasero quede realmente
 * oculto tras el cerebro. Esa oclusión es lo que lo hace leer como 3D en vez de
 * como una línea pintada encima.
 */
function HeroRing({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const nodes = useMemo(
    () => Array.from({ length: 8 }, (_, index) => (index / 8) * Math.PI * 2),
    [],
  )
  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    if (!group.current) return
    group.current.rotation.y = signal.time * 0.055 + p * 0.35
    const fade = 1 - range(p, 0.86, 0.99)
    group.current.traverse((child) => {
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
      if (!material?.isMaterial) return
      material.opacity = (material.userData.base ??= material.opacity) * fade * (0.72 + bell(p, 0.14, 0.3, 0.52) * 0.28)
    })
  })
  const ring = radius * 1.14
  const node = radius * 0.035
  return (
    <group ref={group} position={[framing.stageX, framing.stageY + radius * 0.02, 0]} rotation={[0.1, 0, 0.06]} renderOrder={13}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[ring, radius * 0.0055, 8, 160]} />
        <meshBasicMaterial color="#5fe4ff" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Arco secundario, más tenue y en otro plano: da grosor al HUD sin
          convertirlo en una jaula. */}
      <mesh rotation={[Math.PI / 2, 0.32, 0.22]}>
        <torusGeometry args={[ring * 1.035, radius * 0.003, 6, 120, Math.PI * 1.15]} />
        <meshBasicMaterial color="#3fb6ff" transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {nodes.map((angle) => (
        <mesh key={angle} position={[Math.cos(angle) * ring, 0, Math.sin(angle) * ring]}>
          <sphereGeometry args={[node, 14, 14]} />
          <meshBasicMaterial color="#d8f7ff" transparent opacity={0.95} toneMapped={false} />
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
    float band = smoothstep(0.0, 0.06, abs(vUv.y - uProgress));
    float glow = (1.0 - band) * uOpacity;
    float grid = 0.5 + 0.5 * sin(vUv.x * 180.0 + uTime * 2.0);
    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(0.0, 0.14, 1.0 - vUv.x);
    gl_FragColor = vec4(mix(vec3(0.35, 0.9, 1.0), vec3(0.85, 1.0, 1.0), grid), glow * edge * (0.65 + grid * 0.35));
  }
`

/** Una sola pasada durante la activación. No es un efecto permanente. */
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
    material.uniforms.uTime.value = signal.time
    material.uniforms.uProgress.value = range(signal.progress, 0.18, 0.34)
    material.uniforms.uOpacity.value = bell(signal.progress, 0.17, 0.25, 0.35)
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
    const energy = 0.3 + range(signal.progress, 0.16, 0.46) * 0.28 + range(signal.progress, 0.86, 1) * 0.42
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

/* --------------------------------------------------------------- hotspots */

const HOTSPOTS = [
  { title: 'Evaluación', copy: 'Organización de procesos', window: [0.5, 0.53, 0.57] as const },
  { title: 'Análisis', copy: 'Información estructurada', window: [0.56, 0.59, 0.63] as const },
  { title: 'Acompañamiento', copy: 'Apoyo al profesional', window: [0.62, 0.65, 0.69] as const },
  { title: 'Inclusión', copy: 'Tecnología aplicada a educación', window: [0.68, 0.71, 0.75] as const },
]

/**
 * La información aparece anclada al mundo 3D, alrededor del cerebro. Los nodos
 * son geometría; sólo el texto es DOM, para que siga siendo seleccionable y
 * legible por un lector de pantalla.
 */
function IntelligenceHotspots({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const labels = useRef<Array<HTMLDivElement | null>>([])
  const nodes = useRef<Array<THREE.Group | null>>([])
  const r = radius

  useFrame((state, delta) => {
    const signal = sceneState.current
    const p = signal.progress
    const summary = bell(p, 0.73, 0.78, 0.84)
    if (group.current) group.current.visible = p >= 0.46 && p <= 0.86
    signal.activeHotspot = summary > 0.2 ? '4 nodos' : '—'
    HOTSPOTS.forEach((hotspot, index) => {
      const active = bell(p, hotspot.window[0], hotspot.window[1], hotspot.window[2])
      const opacity = Math.max(summary * 0.9, active)
      if (active > 0.45) signal.activeHotspot = hotspot.title
      const label = labels.current[index]
      if (label) {
        label.style.opacity = String(opacity)
        label.style.transform = `translate3d(0, ${8 * (1 - opacity)}px, 0)`
      }
      const node = nodes.current[index]
      if (!node) return
      node.scale.setScalar(THREE.MathUtils.lerp(node.scale.x, 0.5 + opacity * 0.5, 1 - Math.exp(-delta * 8)))
      node.rotation.z = signal.time * (index % 2 ? -0.3 : 0.3)
    })
  })

  const positions: Array<[number, number, number]> = [
    [-r * 1.34, r * 0.62, r * 0.42],
    [r * 1.36, r * 0.5, r * 0.38],
    [-r * 1.3, -r * 0.58, r * 0.44],
    [r * 1.32, -r * 0.52, r * 0.4],
  ]
  const nodeRadius = r * 0.026

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} renderOrder={16} visible={false}>
      {HOTSPOTS.map((hotspot, index) => (
        <group key={hotspot.title} position={positions[index]} ref={(node) => { nodes.current[index] = node }}>
          <mesh><sphereGeometry args={[nodeRadius, 12, 12]} /><meshBasicMaterial color="#dffcff" toneMapped={false} /></mesh>
          <mesh>
            <torusGeometry args={[nodeRadius * 3, nodeRadius * 0.2, 8, 40]} />
            <meshBasicMaterial color="#35dcff" transparent opacity={0.8} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
          </mesh>
          <Html position={[index % 2 ? nodeRadius * 4 : -nodeRadius * 4, nodeRadius * 2, 0]} zIndexRange={[30, 10]} pointerEvents="none" center={false}>
            <div ref={(node) => { labels.current[index] = node }} className={`brain-hotspot-label ${index % 2 ? 'is-right' : 'is-left'}`}>
              <strong>{hotspot.title}</strong><small>{hotspot.copy}</small>
            </div>
          </Html>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ mundo */

const DENSITY: Record<Quality, number> = { high: 1, medium: 0.6, low: 0.32 }

function World({ sceneState, framing, quality, cast }: { sceneState: SceneStateRef; framing: Framing; quality: Quality; cast: StageCast }) {
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
    if (worldFog.current) worldFog.current.density = THREE.MathUtils.lerp(0.0125, 0.0075, range(p, 0.74, 1))
    const material = networkPlate.current?.material as THREE.MeshBasicMaterial | undefined
    if (material) material.opacity = 0.05 + bell(p, 0.14, 0.32, 0.52) * 0.12
    signal.fogOpacity = THREE.MathUtils.lerp(0.26, 0.12, range(p, 0.76, 0.92)) + range(p, 0.92, 1) * 0.1
    signal.lightLevel = 1 + range(p, 0.16, 0.44) * 0.4
    signal.particleCount = n(340) + n(150) + n(70) + n(9)
  })

  const fogLayers = quality === 'low' ? 3 : 5

  return (
    <>
      <fogExp2 ref={worldFog} attach="fog" args={['#03142c', 0.0125]} />

      {/* ------------------------------------------------------ mundo profundo */}
      <Plate texture={stars} z={WORLD_Z.deepStars} framing={framing} aspect={aspect} imageAspect={1.78} opacity={0.55} additive margin={1.35} renderOrder={0} />
      <Plate texture={mountainsFar} z={WORLD_Z.mountainsFar} framing={framing} aspect={aspect} imageAspect={1.87} tint="#5d76a0" margin={1.35} renderOrder={1} offsetY={-0.02} />
      <ParticleLayer count={n(340)} spread={[70, 34, 14]} center={[0, 2, WORLD_Z.fogFar]} size={0.09} opacity={0.4} color="#4c8ef8" sceneState={sceneState} seed={3} />
      <FogLayer texture={fogDeep} sceneState={sceneState} position={[-6, -3.2, WORLD_Z.fogFar]} scale={[54, 18]} opacity={0.3} flowSpeed={[0.011, 0.004]} noiseScale={2.6} distortion={0.03} density={0.95} scrollShift={[-1.6, 0.3]} renderOrder={3} depth={0.08} />
      <mesh ref={networkPlate} position={[framing.stageX * 2.4, 2, WORLD_Z.techNetwork]} scale={[26, 15, 1]} renderOrder={4} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={network} transparent opacity={0.05} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* ---------------------------------------------------------- mundo medio */}
      <Plate texture={mountainsMid} z={WORLD_Z.mountainsMid} framing={framing} aspect={aspect} imageAspect={1.87} opacity={0.86} tint="#7f9bc4" margin={1.4} renderOrder={5} offsetY={-0.03} />
      <FogLayer texture={fogBack} sceneState={sceneState} position={[3.5, -1.6, WORLD_Z.fogBack]} scale={[30, 10]} opacity={0.19} flowSpeed={[-0.014, 0.005]} noiseScale={3.4} distortion={0.026} density={0.86} scrollShift={[1.1, -0.15]} renderOrder={6} depth={0.3} />
      <ParticleLayer count={n(150)} spread={[34, 18, 10]} center={[0, 0.5, WORLD_Z.mountainsFront]} size={0.05} opacity={0.42} color="#79dfff" sceneState={sceneState} drift={0.05} seed={7} />
      <Plate texture={mountainsFront} z={WORLD_Z.mountainsFront} framing={framing} aspect={aspect} imageAspect={1.87} opacity={0.94} tint="#9db6d8" margin={1.5} renderOrder={7} offsetY={-0.05} />
      <FogLayer texture={fogDeep} sceneState={sceneState} position={[-2.5, -1.9, WORLD_Z.fogMiddle]} scale={[18, 6.2]} opacity={0.15} flowSpeed={[0.017, -0.007]} noiseScale={4} distortion={0.036} density={0.8} scrollShift={[0.9, 0.2]} renderOrder={8} depth={0.62} />

      {/* -------------------------------------------------------------- escena */}
      <LightRig cast={cast} sceneState={sceneState} framing={framing} />
      <StageCastActors cast={cast} sceneState={sceneState} framing={framing} />
      <HeroRing radius={cast.radius} framing={framing} sceneState={sceneState} />
      <Beam radius={cast.radius} framing={framing} sceneState={sceneState} />
      <Scanner radius={cast.radius} framing={framing} sceneState={sceneState} />
      <IntelligenceHotspots radius={cast.radius} framing={framing} sceneState={sceneState} />
      <ParticleLayer count={n(70)} spread={[cast.radius * 3.4, cast.radius * 3, cast.radius * 2.4]} center={[framing.stageX, framing.stageY, 0]} size={0.05} opacity={0.6} color="#b9f2ff" sceneState={sceneState} drift={0.03} seed={11} />

      {/* ------------------------------------------------------ mundo delantero */}
      {/* Cruza por delante del cerebro entre el 25 % y el 40 %. Tapar un poco al
          protagonista dice más sobre la profundidad que veinte órbitas. */}
      <FogLayer texture={fogFront} sceneState={sceneState} position={[-7.5, -0.9, WORLD_Z.fogFrontLeft]} scale={[11, 3.8]} opacity={0.34} flowSpeed={[0.021, 0.009]} noiseScale={4.6} distortion={0.05} density={0.95} scrollShift={[9.5, 0.5]} renderOrder={20} depth={1.25} />
      {fogLayers > 3 && (
        <FogLayer texture={fogFront} sceneState={sceneState} position={[6.4, -1.6, WORLD_Z.fogFrontRight]} scale={[12, 4.2]} opacity={0.22} flowSpeed={[-0.016, 0.006]} noiseScale={3.9} distortion={0.045} density={0.88} scrollShift={[-4.2, 0.9]} renderOrder={21} depth={1.4} />
      )}
      <ParticleLayer count={n(9)} spread={[9, 5.5, 1.6]} center={[framing.stageX, framing.stageY, WORLD_Z.lensParticles]} size={0.2} opacity={0.16} color="#e2fbff" sceneState={sceneState} drift={0.05} seed={13} />
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
  const [environment, setEnvironment] = useState<{ ready: boolean; quality: Quality; reducedMotion: boolean; framing: Framing | null }>(
    { ready: false, quality: 'high', reducedMotion: false, framing: null },
  )

  useEffect(() => {
    const read = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const test = readTestMode(window.location.search)
      const signal = sceneState.current
      signal.forcedProgress = test.active ? test.progress : null
      if (test.active) signal.progress = test.progress
      // El arnés de capturas recorre once progresos. Recargar la página en cada
      // uno volvería a descargar y medir los cinco modelos; con esto basta una
      // carga y el resto son saltos instantáneos.
      if (test.active) {
        ;(window as unknown as { __heroSetProgress?: (value: number) => void }).__heroSetProgress = (value) => {
          signal.forcedProgress = THREE.MathUtils.clamp(value, 0, 1)
          signal.progress = signal.forcedProgress
          // La interfaz va con la escena: el texto se retira, la institución
          // entra y el portal se abre en el mismo progreso.
          ;(window as unknown as { __heroSetDomProgress?: (v: number) => void }).__heroSetDomProgress?.(signal.forcedProgress)
        }
      }
      setEnvironment((current) => ({
        ready: true,
        // El tier no se recalcula al reescalar si ya se degradó por medición.
        quality: current.ready ? current.quality : qualityFor(width),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        framing: frameStage(width, height),
      }))
    }
    read()
    window.addEventListener('resize', read, { passive: true })
    return () => window.removeEventListener('resize', read)
  }, [sceneState])

  const framing = environment.framing
  if (!framing) return null

  const dpr: [number, number] = environment.quality === 'high' ? [1, 1.6] : environment.quality === 'medium' ? [1, 1.35] : [1, 1]

  return (
    <div className="hero-canvas" aria-hidden="true">
      <Canvas
        dpr={dpr}
        camera={{ fov: STAGE_FOV, near: 0.5, far: 160, position: [framing.stageX, 0, framing.distance] }}
        gl={{ alpha: false, antialias: environment.quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMappingExposure = 1.14
        }}
        scene={{ background: new THREE.Color('#020a18') }}
      >
        <Clock sceneState={sceneState} reducedMotion={environment.reducedMotion} />
        <Suspense fallback={null}>
          <SceneBody sceneState={sceneState} framing={framing} quality={environment.quality} onDrop={() => setEnvironment((c) => ({ ...c, quality: c.quality === 'high' ? 'medium' : 'low' }))} />
        </Suspense>
      </Canvas>
    </div>
  )
}

/**
 * Reloj único de la escena. En modo de prueba se congela: sin esto, dos
 * capturas del mismo progreso caerían en instantes distintos de la niebla y la
 * comparación visual no probaría nada.
 */
function Clock({ sceneState, reducedMotion }: { sceneState: SceneStateRef; reducedMotion: boolean }) {
  useFrame((state) => {
    const signal = sceneState.current
    if (signal.forcedProgress !== null) {
      signal.time = 12
      signal.progress = signal.forcedProgress
      signal.pointerX = 0
      signal.pointerY = 0
      return
    }
    signal.time = reducedMotion ? 0 : state.clock.elapsedTime
  })
  return null
}

/** El rig de cámara necesita el radio medido, que sólo existe tras cargar. */
function SceneBody({ sceneState, framing, quality, onDrop }: { sceneState: SceneStateRef; framing: Framing; quality: Quality; onDrop: () => void }) {
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
      <CameraRig framing={framing} radius={cast.radius} sceneState={sceneState} />
      <Instrumentation sceneState={sceneState} quality={quality} onDrop={onDrop} />
      <World sceneState={sceneState} framing={framing} quality={quality} cast={cast} />
    </>
  )
}
