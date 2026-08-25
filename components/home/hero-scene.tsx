'use client'

import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
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
  inside,
  until,
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
import { conceptApproach } from '@/lib/hero/timeline'
import { PARTICLE_CHANNELS, type ParticleChannel } from '@/lib/hero/particles'
import { InstitutionDataStreams } from './institution-data-streams'
import { NeuralSurface } from './neural-surface'
import { LivingLandscape } from './living-landscape'
import { cameraScalar, createPlatformCameraRail } from '@/lib/platform/camera-rail'
import { smoothstep as platformSmoothstep } from '@/lib/platform/timeline'
import { PlatformWorldContent } from '@/components/platform/platform-scene'
import type { PlatformStateRef } from '@/components/platform/platform-state'

const HERO = '/detection-home/hero'
const LAYERS = `${HERO}/layers`
const REFERENCE = `${HERO}/reference`
type SceneStateRef = MutableRefObject<HeroSceneState>
type Quality = 'high' | 'medium' | 'low'

/** PRNG pequeño y estable: una misma geometría y tier producen la misma nube. */
function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ cámara */

/** CameraRig driven exclusively by the frame produced by HeroDirector. */
function DirectedCameraRig({ framing, radius, sceneState, platformState }: { framing: Framing; radius: number; sceneState: SceneStateRef; platformState: PlatformStateRef }) {
  const desired = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const previous = useMemo(() => new THREE.Vector3(), [])
  const rail = useMemo(() => createPlatformCameraRail(), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const rollQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const forward = useMemo(() => new THREE.Vector3(0, 0, -1), [])
  const platformCenter = useMemo(() => new THREE.Vector3(0, 0, -9), [])

  useFrame((state) => {
    const signal = sceneState.current
    const platform = platformState.current
    const frame = signal.director
    const camera = state.camera as THREE.PerspectiveCamera
    const p = platform.progress

    if (p > 0.001) {
      // Por progreso, no por longitud de arco: ver `railCoordinate`. Con
      // `getPointAt` la posición adelantaba a la lente y el capítulo entero
      // reproducía una coreografía distinta de la escrita.
      rail.sample(p, desired, look)
      const narrow = state.size.width < 900
      if (narrow) {
        desired.x *= state.size.width < 640 ? 0.58 : 0.76
        desired.y *= 0.84
        look.x *= 0.72
        // En retrato la misma distancia llena el alto con el cubo y recorta su
        // base. El plano de presentación se aleja; al entrar físicamente en la
        // carcasa recupera gradualmente la distancia del riel original.
        const pull = THREE.MathUtils.lerp(
          state.size.width < 640 ? 1.48 : 1.22,
          state.size.width < 640 ? 1.06 : 1.03,
          platformSmoothstep(0.4, 0.62, p),
        )
        desired.copy(look).add(desired.sub(look).multiplyScalar(pull))
      }
      if (platform.reducedMotion) {
        desired.x *= 0.45
        desired.y *= 0.72
        look.x *= 0.5
      }
      const pointerStrength = narrow || platform.reducedMotion ? 0 : 0.1 * (1 - platformSmoothstep(0.43, 0.6, p))
      look.x += platform.pointerX * pointerStrength
      look.y -= platform.pointerY * pointerStrength * 0.65
      platform.cameraSpeed = previous.distanceTo(desired)
      previous.copy(desired)
      camera.position.copy(desired)
      matrix.lookAt(desired, look, camera.up)
      camera.quaternion.setFromRotationMatrix(matrix)
      const roll = platform.reducedMotion ? 0 : cameraScalar(p, 'roll')
      rollQuaternion.setFromAxisAngle(forward, roll)
      camera.quaternion.multiply(rollQuaternion)
      const fov = cameraScalar(p, 'fov')
      if (Math.abs(camera.fov - fov) > 0.001) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      const centerDistance = desired.distanceTo(platformCenter)
      const actorRadius = THREE.MathUtils.lerp(2.35, 0.82, platform.assemblyWeight)
      platform.cameraPosition = [desired.x, desired.y, desired.z]
      platform.cameraTarget = [look.x, look.y, look.z]
      platform.roll = roll
      platform.fov = fov
      platform.nearestActor = platform.assemblyWeight > 0.5 ? 'núcleo energético' : 'cubo modular'
      platform.nearestDistance = Math.max(0, centerDistance - actorRadius)
      platform.screenOccupancy = Math.min(1, (2 * THREE.MathUtils.radToDeg(Math.atan2(actorRadius, Math.max(centerDistance, 0.01)))) / fov)
      signal.cameraPosition = platform.cameraPosition
      signal.cameraFov = fov
      signal.lookAt = platform.cameraTarget
      signal.drawCalls = state.gl.info.render.calls
      return
    }
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

/** Comparte reloj, puntero, calidad y progreso con el segundo capítulo. */
function SharedPlatformDirector({ sceneState, platformState, quality, reducedMotion }: { sceneState: SceneStateRef; platformState: PlatformStateRef; quality: Quality; reducedMotion: boolean }) {
  const frames = useRef(0)
  const sampleStart = useRef(0)
  useFrame((state, delta) => {
    const hero = sceneState.current
    const platform = platformState.current
    platform.progress = platform.forcedProgress ?? platform.rawProgress
    platform.time = hero.time
    platform.pointerX = hero.pointerX
    platform.pointerY = hero.pointerY
    platform.velocity = hero.velocity
    platform.scrollEnergy = hero.scrollEnergy
    platform.quality = quality
    platform.reducedMotion = reducedMotion
    platform.dpr = state.gl.getPixelRatio()
    platform.activeConcept = '—'
    platform.drawCalls = state.gl.info.render.calls
    platform.triangles = state.gl.info.render.triangles
    frames.current += 1
    if (!sampleStart.current) sampleStart.current = performance.now()
    const now = performance.now()
    if (now - sampleStart.current > 500) {
      platform.fps = Math.round(frames.current * 1000 / (now - sampleStart.current))
      frames.current = 0
      sampleStart.current = now
    }
    // Evita una segunda cola temporal: el capítulo 02 hereda la energía del
    // mismo gesto y del mismo reloj que acaba de mover Inicio.
    void delta
  }, -90)
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
const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uNeural;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform int uMode;
  uniform float uMotion;
  uniform float uRate;
  uniform float uEnergyResponse;
  uniform float uNeuralResponse;
  attribute float aSeed;
  varying float vFade;

  vec3 hash3(float n) {
    return fract(sin(vec3(n, n + 17.13, n + 43.71)) * vec3(43758.5453, 22578.145, 19642.349)) - 0.5;
  }

  void main() {
    vec3 moved = position;
    vec3 seed = hash3(aSeed * 91.7);
    float wake = 1.0 + uEnergy * uEnergyResponse + uNeural * uNeuralResponse;
    float t = uTime * uRate * wake;

    /*
      Un modelo por familia. La versión anterior aplicaba a todas la misma
      deriva rígida y el mismo giro, así que seis familias se movían igual y
      ninguna comunicaba su papel.
    */
    if (uMode == 0) {
      // Distancia: centelleo casi imperceptible, nunca traslación.
      moved += seed * uMotion * sin(t + aSeed * 6.28);
    } else if (uMode == 1) {
      // Aire: viento constante con ruido lento encima, sin ciclo circular.
      moved.x += sin(t * 0.6 + seed.y * 5.0) * uMotion;
      moved.y += sin(t * 0.37 + seed.z * 4.2) * uMotion * 0.42;
      moved.z += cos(t * 0.29 + seed.x * 3.7) * uMotion * 0.3;
    } else if (uMode == 2) {
      /*
        Vida: aproximación a un campo curl. Tres senos desfasados en ejes
        cruzados dan una trayectoria que se retuerce sin cerrarse nunca, que es
        lo que separa «actividad» de «órbita».
      */
      float a = t + seed.x * 6.28;
      float b = t * 1.37 + seed.y * 6.28;
      float c = t * 0.83 + seed.z * 6.28;
      moved.x += (sin(b) * cos(c)) * uMotion;
      moved.y += (sin(c) * cos(a)) * uMotion;
      moved.z += (sin(a) * cos(b)) * uMotion * 0.6;
    } else {
      // Proximidad: deriva lateral que la energía del gesto acelera de verdad.
      float sweep = t + seed.x * 6.28;
      moved.x += sin(sweep) * uMotion * (1.0 + uEnergy * 1.6);
      moved.y += cos(sweep * 0.71 + seed.y * 3.0) * uMotion * 0.5;
    }

    vec4 viewPosition = modelViewMatrix * vec4(moved, 1.0);
    // Las de primer plano engordan con el gesto: leen como algo pasando cerca.
    float grow = uMode == 3 ? 1.0 + uEnergy * 0.55 : 1.0;
    vFade = 0.72 + 0.28 * sin(t * 1.7 + aSeed * 12.9);
    gl_PointSize = uSize * uPixelRatio * grow * (300.0 / max(-viewPosition.z, 1.0));
    gl_Position = projectionMatrix * viewPosition;
  }
`

const particleFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point) * 2.0;
    if (radius > 1.0) discard;
    float glow = pow(1.0 - radius, 2.2);
    float alpha = glow * uOpacity * vFade;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`

function ParticleLayer({
  count, spread, center, size, opacity, color, sceneState, channel, seed = 1, swell, pointerStrength = 0, activity = 'always',
}: {
  /** Familia a la que pertenece. Ver `PARTICLE_CHANNELS`. */
  channel: ParticleChannel
  count: number; spread: [number, number, number]; center: [number, number, number]
  size: number; opacity: number; color: string; sceneState: SceneStateRef
  seed?: number
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
  const behaviour = PARTICLE_CHANNELS[channel]
  const points = useRef<THREE.Points>(null)

  const geometry = useMemo(() => {
    const position = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    // Semilla explícita: el modo de prueba necesita la misma nube en cada carga.
    const random = (n: number) => {
      const v = Math.sin((n + seed * 977) * 127.1) * 43758.5453
      return v - Math.floor(v)
    }
    for (let i = 0; i < count; i += 1) {
      position[i * 3] = center[0] + (random(i + 11) - 0.5) * spread[0]
      position[i * 3 + 1] = center[1] + (random(i + 79) - 0.5) * spread[1]
      position[i * 3 + 2] = center[2] + (random(i + 173) - 0.5) * spread[2]
      seeds[i] = random(i + 421) * 100
    }
    const built = new THREE.BufferGeometry()
    built.setAttribute('position', new THREE.BufferAttribute(position, 3))
    built.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    return built
  }, [center, count, seed, spread])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uNeural: { value: 0 },
      uSize: { value: size },
      uPixelRatio: { value: 1 },
      uOpacity: { value: opacity },
      uColor: { value: new THREE.Color(color) },
      uMode: { value: behaviour.mode },
      uMotion: { value: behaviour.motion },
      uRate: { value: behaviour.rate },
      uEnergyResponse: { value: behaviour.energyResponse },
      uNeuralResponse: { value: behaviour.neuralResponse },
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [behaviour, color, opacity, size])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame((state) => {
    const signal = sceneState.current
    if (!points.current) return
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
    if (!points.current.visible) return
    points.current.position.x = signal.pointerX * pointerStrength
    points.current.position.y = signal.pointerY * pointerStrength * 0.55

    const sweep = swell ? bell(signal.progress, PHASE.DISASSEMBLY, 0.54, PHASE.REASSEMBLY) : 0
    material.uniforms.uTime.value = signal.time
    material.uniforms.uEnergy.value = signal.scrollEnergy
    material.uniforms.uNeural.value = signal.director.neuralIntensity
    material.uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 1.5)
    material.uniforms.uSize.value = size * (1 + (swell ?? 0) * sweep)
    material.uniforms.uOpacity.value = opacity * activityWeight * (1 + sweep * 0.42)
  })

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} />
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
  const tickInstances = useRef<THREE.InstancedMesh>(null)
  const nodeInstances = useRef<THREE.InstancedMesh>(null)
  const instance = useMemo(() => new THREE.Object3D(), [])
  const nodes = useMemo(() => Array.from({ length: 10 }, (_, index) => (index / 10) * Math.PI * 2), [])
  const ticks = useMemo(() => Array.from({ length: 24 }, (_, index) => (index / 24) * Math.PI * 2), [])
  const ring = radius * 1.16
  const node = radius * 0.016

  useEffect(() => {
    const tickMesh = tickInstances.current
    if (tickMesh) {
      ticks.forEach((angle, index) => {
        instance.position.set(Math.cos(angle) * ring * 1.075, 0, Math.sin(angle) * ring * 1.075)
        instance.rotation.set(0, -angle, 0)
        instance.scale.setScalar(1)
        instance.updateMatrix()
        tickMesh.setMatrixAt(index, instance.matrix)
      })
      tickMesh.instanceMatrix.needsUpdate = true
    }
  }, [instance, ring, ticks])

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
    group.current.visible = fade > 0.012
    if (!group.current.visible) return
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
    const mesh = nodeInstances.current
    if (!mesh) return
    nodes.forEach((angle, index) => {
      let distance = Math.abs(index / nodes.length - head)
      distance = Math.min(distance, 1 - distance)
      const lit = Math.max(0, 1 - distance * 6)
      instance.position.set(Math.cos(angle) * ring, 0, Math.sin(angle) * ring)
      instance.rotation.set(0, 0, 0)
      instance.scale.setScalar(0.72 + lit * 1.38)
      instance.updateMatrix()
      mesh.setMatrixAt(index, instance.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  /*
    Nodos pequeños.

    A 0,032 R y con material opaco, el que pasaba por delante del cerebro se
    proyectaba como una bola gris de cincuenta píxeles cruzándole la cara: leía
    como una pompa, no como un dato. La mitad de tamaño y mezcla aditiva lo
    convierten en un punto de luz que se suma a lo que hay debajo en vez de
    taparlo, que es lo que un HUD tiene que hacer.
  */
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
      <instancedMesh ref={tickInstances} args={[undefined, undefined, ticks.length]} frustumCulled={false}>
        <boxGeometry args={[radius * 0.026, radius * 0.0022, radius * 0.0022]} />
        <meshBasicMaterial color="#69d9ff" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={nodeInstances} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <sphereGeometry args={[node, 12, 12]} />
        <meshBasicMaterial color="#bfeeff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
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
      ? THREE.MathUtils.lerp(idle, smoothstep(inside('INTRO', 0.44), until('UNLOCK'), p), pass)
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
  const core = useRef<THREE.ShaderMaterial>(null)
  const halo = useRef<THREE.MeshBasicMaterial>(null)
  // Nace en la plataforma y muere bajo el cerebro. Un cono sólido de suelo a
  // techo es justo lo que la referencia rechaza.
  const platformY = ACTORS[0].position[1] * radius
  const height = Math.max(-platformY - radius * 0.9, radius * 0.12)
  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const energy = 0.12 + signal.director.platformIntensity * 0.14 + signal.director.portalIntensity * 0.58
    // El haz enciende el umbral, pero no puede seguir dentro de la lente: visto
    // desde el interior de su cilindro se convertía en dos placas verticales.
    const portalPass = 1 - smootherstep(inside('PLATFORM', 0.2), inside('PLATFORM', 0.58), p)
    const breath = 0.9 + Math.sin(signal.time * 0.9) * 0.1
    if (core.current) core.current.opacity = energy * breath * 0.95 * portalPass
    if (halo.current) halo.current.opacity = energy * breath * 0.26 * portalPass
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
    // Las ondas horizontales hacen la entrega al túnel antes del cruce. Si
    // sobreviven detrás de la cámara, su canto llena la pantalla con bandas.
    const portalPass = 1 - smootherstep(inside('PLATFORM', 0.2), inside('PLATFORM', 0.58), p)
    rings.current.forEach((ring, index) => {
      if (!ring) return
      // Cada aro va un tercio de ciclo por detrás del anterior.
      const phase = (signal.time * 0.28 + index / count) % 1
      const span = radius * (0.55 + phase * 1.85)
      ring.scale.set(span, span, 1)
      ring.position.y = platformY + radius * (0.04 + phase * 0.5)
      const material = ring.material as THREE.MeshBasicMaterial
      // Entra y sale: aparecer y desaparecer de golpe se ve como un parpadeo.
      material.opacity = Math.sin(phase * Math.PI) * 0.5 * energy * portalPass
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
    const idleCurrent = (1 - smootherstep(inside('ACTIVATION', 0.67), inside('DISASSEMBLY', 0.9), signal.progress)) * 0.18
    const intensity = Math.max(signal.director.neuralIntensity, signal.director.innerIntensity, idleCurrent)
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
              ref={(material) => { lines.current[index] = material; makeFilament(material, index) }}
              color={index % 2 ? '#8972ff' : '#31e7ff'} transparent opacity={0}
              blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
            />
          </mesh>
          <mesh ref={(mesh) => { pulses.current[index] = mesh }}>
            <sphereGeometry args={[radius * 0.026, 12, 12]} />
            <meshBasicMaterial
              ref={(material) => { pulseMaterials.current[index] = material; makePulse(material) }}
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

function InnerNeuralTunnel({ radius, framing, sceneState, quality }: { radius: number; framing: Framing; sceneState: SceneStateRef; quality: Quality }) {
  const group = useRef<THREE.Group>(null)
  const filamentMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const gateMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const nodeMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const gateInstances = useRef<THREE.InstancedMesh>(null)
  const nodeInstances = useRef<THREE.InstancedMesh>(null)
  const instance = useMemo(() => new THREE.Object3D(), [])
  const gateColor = useMemo(() => new THREE.Color(), [])
  const nodeColor = useMemo(() => new THREE.Color(), [])
  const tubeSegments = quality === 'high' ? 72 : quality === 'medium' ? 56 : 40
  const tubeRadialSegments = quality === 'high' ? 6 : quality === 'medium' ? 5 : 4
  const gateArcSegments = quality === 'high' ? 96 : quality === 'medium' ? 72 : 48
  const gateTubeSegments = quality === 'high' ? 7 : quality === 'medium' ? 6 : 5
  const nodeSegments = quality === 'high' ? 8 : quality === 'medium' ? 7 : 6

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
    return new THREE.TubeGeometry(curve, tubeSegments, radius * (index % 4 === 0 ? 0.007 : 0.0035), tubeRadialSegments, false)
  }), [radius, tubeRadialSegments, tubeSegments])

  const gates = useMemo(() => [-0.42, -1.05, -1.72, -2.42, -3.16, -3.92], [])
  const nodes = useMemo(() => Array.from({ length: 42 }, (_, index) => {
    const lane = index % 7
    const depth = Math.floor(index / 7)
    const angle = (lane / 7) * Math.PI * 2 + depth * 0.38
    const orbit = radius * (0.68 + (index % 3) * 0.17)
    return [Math.cos(angle) * orbit, Math.sin(angle) * orbit * 0.68, radius * (-0.28 - depth * 0.68)] as [number, number, number]
  }), [radius])

  useEffect(() => () => filaments.forEach((geometry) => geometry.dispose()), [filaments])
  useEffect(() => {
    const mesh = nodeInstances.current
    if (!mesh) return
    nodes.forEach((position, index) => {
      instance.position.fromArray(position)
      instance.rotation.set(0, 0, 0)
      instance.scale.setScalar(radius * (index % 6 === 0 ? 0.019 : 0.011))
      instance.updateMatrix()
      mesh.setMatrixAt(index, instance.matrix)
      mesh.setColorAt(index, nodeColor.set(index % 3 ? '#73eaff' : '#907bff'))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instance, nodeColor, nodes, radius])
  useEffect(() => {
    const mesh = gateInstances.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    gates.forEach((_, index) => mesh.setColorAt(index, gateColor.set(index % 2 ? '#7e6dff' : '#47e8ff')))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [gateColor, gates])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = Math.max(signal.director.innerIntensity, signal.director.entryIntensity * 0.64)
    if (group.current) {
      group.current.visible = intensity > 0.012
      group.current.rotation.z = signal.time * 0.018 + signal.progress * 0.16
    }
    if (intensity <= 0.012) return
    filamentMaterials.current.forEach((material, index) => {
      if (material) material.opacity = intensity * (index % 4 === 0 ? 0.3 : 0.15)
    })
    if (gateMaterial.current) gateMaterial.current.opacity = intensity * 0.25
    if (nodeMaterial.current) nodeMaterial.current.opacity = intensity * 0.62

    const mesh = gateInstances.current
    if (!mesh) return
    gates.forEach((z, index) => {
      const pulse = 1 + Math.sin(signal.time * 0.55 + index) * 0.025
      const gateRadius = radius * (0.54 + index * 0.055) * pulse
      instance.position.set(0, 0, z * radius)
      instance.rotation.set(0, 0, signal.time * (index % 2 ? -0.045 : 0.035) + index * 0.22)
      instance.scale.setScalar(gateRadius)
      instance.updateMatrix()
      mesh.setMatrixAt(index, instance.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} renderOrder={14} visible={false}>
      {filaments.map((geometry, index) => (
        <mesh key={`filament-${index}`} geometry={geometry} frustumCulled={false}>
          <meshBasicMaterial
            ref={(material) => { filamentMaterials.current[index] = material; makeFilament(material, index + 7) }}
            color={index % 3 === 0 ? '#9f7cff' : index % 2 ? '#2fc5ff' : '#6ef7ff'}
            transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
          />
        </mesh>
      ))}
      <instancedMesh ref={gateInstances} args={[undefined, undefined, gates.length]} frustumCulled={false}>
        {/* La geometría unitaria conserva radio, profundidad y giro por matriz,
            pero las seis compuertas salen en un solo draw call. */}
        <torusGeometry args={[1, 0.0125, gateTubeSegments, gateArcSegments]} />
        <meshBasicMaterial
          ref={gateMaterial}
          transparent opacity={0} blending={THREE.AdditiveBlending}
          depthWrite={false} toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={nodeInstances} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <sphereGeometry args={[1, nodeSegments, nodeSegments]} />
        <meshBasicMaterial
          ref={nodeMaterial}
          transparent opacity={0} blending={THREE.AdditiveBlending}
          depthWrite={false} toneMapped={false}
        />
      </instancedMesh>
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

const FRAGMENT_POINTS: Record<Quality, number> = { high: 2600, medium: 1800, low: 1000 }
const FRAGMENT_PLACEMENTS: Record<Quality, number> = { high: 3, medium: 2, low: 1 }

function InnerAnatomyFragments({ cast, framing, sceneState, quality }: { cast: StageCast; framing: Framing; sceneState: SceneStateRef; quality: Quality }) {
  const neural = cast.actors.find((actor) => actor.spec.key === 'neural')
  const group = useRef<THREE.Group>(null)
  const roots = useRef<Array<THREE.Group | null>>([])
  const sprite = useMemo(() => makeRadialSprite(0.24), [])
  const material = useMemo(() => new THREE.PointsMaterial({
    color: '#d9fbff',
    vertexColors: true,
    map: sprite,
    alphaTest: 0.015,
    size: quality === 'high' ? 0.021 : quality === 'medium' ? 0.019 : 0.017,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [quality, sprite])
  const placements = useMemo(() => [
    [-0.48, 0.34, -1.05, -0.4, 0.3],
    [-0.52, -0.18, -2.18, 0.72, 0.3],
    [-0.42, 0.1, -3.42, 0.48, 0.22],
  ] as const, [])
  const activePlacements = useMemo(
    () => placements.slice(0, FRAGMENT_PLACEMENTS[quality]),
    [placements, quality],
  )
  const pointGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    if (!neural) return geometry

    const source = neural.measure.geometry
    // MeshSurfaceSampler expande internamente las mallas indexadas; hacerlo de
    // forma explícita permite liberar esa copia temporal nada más muestrear.
    const samplingGeometry = source.index ? source.toNonIndexed() : source
    const samplingMesh = new THREE.Mesh(samplingGeometry)
    // La implementación de Three expone este setter, aunque @types/three aún
    // no lo declara en esta versión.
    const sampler = new MeshSurfaceSampler(samplingMesh) as MeshSurfaceSampler & {
      setRandomGenerator: (random: () => number) => MeshSurfaceSampler
    }
    sampler.setRandomGenerator(seededRandom(0x6e657572 + FRAGMENT_POINTS[quality])).build()
    const count = FRAGMENT_POINTS[quality]
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const point = new THREE.Vector3()
    const normal = new THREE.Vector3()
    const color = new THREE.Color()
    const cyan = new THREE.Color('#45e8ff')
    const violet = new THREE.Color('#8875ff')
    const random = seededRandom(0x706f696e + count)

    for (let index = 0; index < count; index += 1) {
      sampler.sample(point, normal)
      // Un espesor mínimo impide que la nube lea como una silueta plana.
      point.addScaledVector(normal, (random() - 0.5) * neural.measure.radius * 0.018)
      positions[index * 3] = point.x
      positions[index * 3 + 1] = point.y
      positions[index * 3 + 2] = point.z
      color.lerpColors(cyan, violet, 0.18 + random() * 0.64)
      const energy = 0.62 + random() * 0.38
      colors[index * 3] = color.r * energy
      colors[index * 3 + 1] = color.g * energy
      colors[index * 3 + 2] = color.b * energy
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.computeBoundingSphere()
    if (samplingGeometry !== source) samplingGeometry.dispose()
    const samplingMaterial = samplingMesh.material
    if (Array.isArray(samplingMaterial)) samplingMaterial.forEach((entry) => entry.dispose())
    else samplingMaterial.dispose()
    return geometry
  }, [neural, quality])
  useEffect(() => () => {
    pointGeometry.dispose()
    material.dispose()
  }, [material, pointGeometry])
  useEffect(() => () => sprite.dispose(), [sprite])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = signal.director.innerIntensity
    if (group.current) group.current.visible = intensity > 0.008
    if (intensity <= 0.008) {
      material.opacity = 0
      return
    }
    material.opacity = intensity * (quality === 'low' ? 0.76 : 0.68)
    const baseSize = quality === 'high' ? 0.021 : quality === 'medium' ? 0.019 : 0.017
    material.size = baseSize * (0.88 + intensity * 0.18)
    roots.current.forEach((root, index) => {
      if (!root) return
      root.rotation.y = activePlacements[index][3] + signal.time * (index % 2 ? -0.035 : 0.028)
      root.rotation.z = Math.sin(signal.time * 0.18 + index) * 0.08
    })
  })
  if (!neural) return null

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} name="InnerAnatomyFragments" visible={false}>
      {activePlacements.map(([x, y, z, yaw, size], index) => {
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
              <points geometry={pointGeometry} material={material} renderOrder={14} />
            </group>
          </group>
        )
      })}
    </group>
  )
}

/*
  Material del core interior.

  Antes era un `MeshBasicMaterial` casi blanco (#efffff) con mezcla aditiva a
  1,8 unidades de la cámara. Al ser unlit no tenía sombreado, así que se leía
  como un disco plano sin volumen; y al ser aditivo y casi blanco lavaba toda
  la zona izquierda del encuadre. Medido ocultándolo por capas: aportaba el
  84 % de la luminancia de esa región.

  Ahora es un cuerpo con material: base navy que conserva volumen, vetas de
  energía que recorren su interior y un fresnel muy leve en el borde. La luz
  sale de dentro, que es lo que debe sugerir, pero el objeto sigue siendo
  materia y no un orbe de neón.
*/
/**
 * Anclas de concepto resueltas por ancho de viewport.
 *
 * Las anclas son puntos del mundo 3D, no superposiciones: la misma coordenada
 * se proyecta en distinto sitio según la cámara y el aspecto, así que una sola
 * solución no puede servir a todos los tamaños. Medido con las anclas de
 * escritorio: en 1024 tres de los cuatro conceptos caían fuera del área segura
 * y en 390 los cuatro quedaban fuera de pantalla, entre el −131 % y el −4 % del
 * ancho. El mensaje central del capítulo no se veía en móvil.
 *
 * Cada fila sale de resolver, con la cámara real de ese hold y ese viewport,
 * dónde debe estar el punto de mundo para que el título caiga en su posición
 * de pantalla objetivo. Fijada la Z, las condiciones de proyección
 * `clip.x − tx·clip.w = 0` y `clip.y − ty·clip.w = 0` son lineales en X e Y,
 * así que hay solución cerrada y exacta: las dieciséis verifican con 0,00 px.
 * No se tantea, y no se toca la cámara —sólo dónde cuelga la información—.
 *
 * Entre filas se interpola por ancho, de modo que redimensionar no produce
 * saltos. La fila de 1920 reproduce la composición de escritorio aprobada.
 */
type ConceptAnchorRow = { width: number; xy: ReadonlyArray<readonly [number, number]> }

const CONCEPT_ANCHORS: readonly ConceptAnchorRow[] = [
  { width: 390, xy: [[0.504, 0.127], [1.119, -0.051], [1.667, -0.371], [1.042, -0.602]] },
  { width: 1024, xy: [[0.244, -0.074], [1.211, 0.122], [1.03, -0.501], [1.423, -0.073]] },
  { width: 1366, xy: [[0.089, -0.107], [1.532, 0.012], [0.465, -0.49], [2.453, -0.13]] },
  { width: 1920, xy: [[0.021, -0.142], [1.7, -0.049], [0.338, -0.53], [2.698, -0.227]] },
] as const

/** Profundidad de cada ancla, en radios. No la toca el solver. */
const CONCEPT_DEPTH = [-3.42, -3.95, -4.1, -4.25] as const

/** Interpola la tabla de anclas para un ancho cualquiera. */
function conceptAnchorsFor(width: number, radius: number): Array<[number, number, number]> {
  const rows = CONCEPT_ANCHORS
  let lo = rows[0]
  let hi = rows[0]
  if (width >= rows[rows.length - 1].width) { lo = hi = rows[rows.length - 1] }
  else if (width > rows[0].width) {
    for (let i = 0; i < rows.length - 1; i += 1) {
      if (width >= rows[i].width && width <= rows[i + 1].width) { lo = rows[i]; hi = rows[i + 1]; break }
    }
  }
  const span = hi.width - lo.width
  const t = span === 0 ? 0 : (width - lo.width) / span
  return CONCEPT_DEPTH.map((z, i) => [
    radius * (lo.xy[i][0] + (hi.xy[i][0] - lo.xy[i][0]) * t),
    radius * (lo.xy[i][1] + (hi.xy[i][1] - lo.xy[i][1]) * t),
    radius * z,
  ] as [number, number, number])
}

const innerCoreVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;

  void main() {
    vLocal = position;
    vNormalW = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const innerCoreFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uBase;
  uniform vec3 uEnergy;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vLocal;

  void main() {
    vec3 n = normalize(vNormalW);
    float facing = clamp(dot(n, normalize(vViewDir)), 0.0, 1.0);

    /*
      Vetas: tres senos cruzados sobre la posición local, desfasados en el
      tiempo. Al quedarse sólo con la cresta se obtienen líneas finas que
      recorren el cuerpo en lugar de un degradado uniforme.
    */
    vec3 p = normalize(vLocal) * 3.4;
    float veins = sin(p.x * 2.7 + uTime * 0.9)
                * sin(p.y * 3.1 - uTime * 0.7)
                * sin(p.z * 2.3 + uTime * 0.5);
    veins = pow(clamp(abs(veins), 0.0, 1.0), 6.0);

    // El interior se insinúa donde la superficie se aleja de la vista.
    float depth = pow(1.0 - facing, 1.6);
    // Fresnel muy leve: define el borde sin convertirlo en aro de neón.
    float rim = pow(1.0 - facing, 4.0) * 0.35;

    vec3 color = uBase * (0.35 + facing * 0.5);
    color += uEnergy * veins * (0.55 + uIntensity * 0.9);
    color += uEnergy * depth * 0.22;
    color += uEnergy * rim;

    gl_FragColor = vec4(color, uIntensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * Reloj compartido de los filamentos. Uno solo para todos: cada tubo no
 * necesita su propio uniforme de tiempo ni su propio `useFrame`.
 */
const filamentClock = { value: 0 }

/**
 * Convierte un tubo plano en un filamento de energía.
 *
 * Los caminos de señal eran `TubeGeometry` con `MeshBasicMaterial`: radio
 * constante en el mundo y material sin iluminar, así que dentro del sujeto
 * —donde la cámara pasa muy cerca— se leían como placas cian de ancho
 * uniforme, cortadas en seco en los extremos.
 *
 * Se corrige inyectando en el shader ya compilado en lugar de sustituir el
 * material: así siguen funcionando la opacidad, el color y la mezcla que el
 * bucle por fotograma escribe sobre estos mismos objetos.
 *
 * Con `vUv` del tubo se obtiene el corte transversal (y) y el recorrido (x):
 * de ahí salen el núcleo fino, el desvanecido del borde, el afilado de las
 * puntas y un pulso que viaja por la ruta.
 */
function makeFilament(material: THREE.Material | null, seed: number) {
  const patched = material as (THREE.Material & { __filament?: boolean }) | null
  if (!patched || patched.__filament) return
  patched.__filament = true
  patched.defines = { ...(patched.defines ?? {}), USE_UV: '' }
  patched.onBeforeCompile = (shader) => {
    shader.uniforms.uFilTime = filamentClock
    shader.uniforms.uFilSeed = { value: seed * 0.37 }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFilTime;
        uniform float uFilSeed;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // Corte transversal: el brillo se concentra en la línea central.
        float filAcross = sin(vUv.y * 3.14159265);
        float filCore = pow(max(filAcross, 0.0), 6.0);
        // Puntas afiladas: un tubo cortado en recto se lee como cinta.
        float filTaper = smoothstep(0.0, 0.11, vUv.x) * smoothstep(1.0, 0.89, vUv.x);
        // Pulso que recorre la ruta: energía en tránsito, no tubo encendido.
        float filHead = fract(uFilTime * 0.17 + uFilSeed);
        float filDelta = vUv.x - filHead;
        filDelta -= floor(filDelta + 0.5);
        float filPulse = filDelta <= 0.0 && filDelta > -0.24
          ? pow(1.0 + filDelta / 0.24, 3.0)
          : 0.0;
        gl_FragColor.rgb *= 0.8 + filCore * 1.45 + filPulse * 2.1;
        gl_FragColor.a *= (0.2 + filCore * 0.95) * filTaper * (0.6 + filPulse * 1.5);`,
      )
  }
  patched.needsUpdate = true
}

/**
 * Convierte una esfera de pulso plana en un evento con núcleo y halo.
 *
 * Las esferas de pulso usan `MeshBasicMaterial`, que pinta el color plano en
 * todo el disco. Medido en el hueco entre Análisis y Acompañamiento: el perfil
 * de luminancia iba 217 · 217 · 216 · 212 · 204 a lo largo de 90 px, es decir
 * un círculo sin caída. No estaba quemado —el pico no llegaba a 255— pero al
 * no tener degradado se leía como una mancha sin detalle.
 *
 * Para una esfera centrada en el origen la normal es la propia posición, así
 * que basta llevarla a espacio de vista: su componente Z vale 1 mirando a
 * cámara y 0 en la silueta. De ahí sale la caída, sin tocar geometría ni la
 * opacidad que el bucle escribe sobre este material.
 */
function makePulse(material: THREE.Material | null) {
  const patched = material as (THREE.Material & { __pulse?: boolean }) | null
  if (!patched || patched.__pulse) return
  patched.__pulse = true
  patched.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPulseN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPulseN = normalize(normalMatrix * normalize(position));`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPulseN;`)
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // 1 mirando a cámara, 0 en la silueta: la caída del propio volumen.
        float pulseFacing = clamp(vPulseN.z, 0.0, 1.0);
        float pulseCore = pow(pulseFacing, 2.4);
        float pulseHalo = pow(pulseFacing, 0.55);
        // Núcleo claro, halo que sobrevive hasta el borde: evento, no mancha.
        gl_FragColor.rgb *= 0.5 + pulseCore * 0.85;
        gl_FragColor.a *= 0.18 + pulseCore * 0.62 + pulseHalo * 0.2;`,
      )
  }
  patched.needsUpdate = true
}

function InnerCore({ radius, framing, sceneState }: { radius: number; framing: Framing; sceneState: SceneStateRef }) {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.ShaderMaterial>(null)
  const shell = useRef<THREE.MeshBasicMaterial>(null)
  const glow = useRef<THREE.SpriteMaterial>(null)
  const ringA = useRef<THREE.MeshBasicMaterial>(null)
  const ringB = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const glowTexture = useMemo(() => makeRadialSprite(0.42), [])
  useEffect(() => () => glowTexture.dispose(), [glowTexture])
  const coreUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uBase: { value: new THREE.Color('#0a2140') },
    uEnergy: { value: new THREE.Color('#3fd8ff') },
  }), [])
  useFrame(() => {
    const signal = sceneState.current
    const intensity = signal.director.innerIntensity
    if (group.current) {
      group.current.visible = intensity > 0.01
      group.current.rotation.y = signal.time * 0.12 + signal.progress * 0.8
      group.current.rotation.z = signal.time * -0.07
      group.current.scale.setScalar(0.94 + Math.sin(signal.time * 1.6) * 0.04 + intensity * 0.12)
    }
    if (core.current) {
      core.current.uniforms.uTime.value = signal.time
      core.current.uniforms.uIntensity.value = intensity
    }
    if (shell.current) shell.current.opacity = intensity * 0.28
    /*
      El halo baja de 0,66 a 0,24. Era la otra mitad del lavado: un sprite
      aditivo de casi un radio de ancho sobre un core ya muy luminoso. Se
      reduce aquí, en el actor, y no bajando el bloom global, que el exterior
      necesita intacto.
    */
    if (glow.current) glow.current.opacity = intensity * 0.24
    if (ringA.current) ringA.current.opacity = intensity * 0.32
    if (ringB.current) ringB.current.opacity = intensity * 0.24
    if (light.current) light.current.intensity = intensity * radius * 2.4
  })
  return (
    <group ref={group} position={[framing.stageX, framing.stageY, -radius * 3.62]} visible={false} renderOrder={15}>
      <mesh>
        {/* Más subdivisión: con 2 el icosaedro facetaba y reforzaba la lectura plana. */}
        <icosahedronGeometry args={[radius * 0.075, 4]} />
        <shaderMaterial
          ref={core}
          vertexShader={innerCoreVertex}
          fragmentShader={innerCoreFragment}
          uniforms={coreUniforms}
          transparent
          depthWrite
        />
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
  const rings = useRef<Array<THREE.Mesh | null>>([])
  const labels = useRef<Array<HTMLDivElement | null>>([])
  const connectorMaterials = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const signals = useRef<THREE.InstancedMesh>(null)
  const r = radius
  const viewportWidth = useThree((state) => state.size.width)
  const positions = useMemo(() => conceptAnchorsFor(viewportWidth, r), [viewportWidth, r])
  /*
    En pantallas estrechas el filamento arranca mucho más cerca de su nodo.

    Con el 0,58 de escritorio, en móvil el conector salía del cerebro y cruzaba
    media pantalla hasta el texto, que es justo lo que rompe la relación
    nodo → palabra: se leía como una línea de fondo, no como la conexión de ese
    concepto. Acortarlo mantiene el gesto y lo hace legible.
  */
  const connectorReach = viewportWidth < 768 ? 0.86 : viewportWidth < 1200 ? 0.74 : 0.58
  const conceptDummy = useMemo(() => new THREE.Object3D(), [])
  const cameraPoint = useMemo(() => new THREE.Vector3(), [])
  const anchorPoint = useMemo(() => new THREE.Vector3(), [])
  const toAnchor = useMemo(() => new THREE.Vector3(), [])
  // Un factor por concepto, amortiguado: entrar y salir de la oclusión no
  // puede ser un parpadeo.
  const occlusion = useRef<number[]>([1, 1, 1, 1])
  const signalPoint = useMemo(() => new THREE.Vector3(), [])
  const conceptCurves = useMemo(() => positions.map((position, index) => {
    const destination = new THREE.Vector3(...position)
    const origin = destination.clone().multiplyScalar(connectorReach)
    origin.z += r * (0.18 + index * 0.08)
    const middle = origin.clone().lerp(destination, 0.55)
    middle.y += (index % 2 ? -1 : 1) * r * 0.12
    return new THREE.CatmullRomCurve3([origin, middle, destination])
  }), [positions, r])

  const connectors = useMemo(() => positions.map((position, index) => {
    const destination = new THREE.Vector3(...position)
    const origin = destination.clone().multiplyScalar(connectorReach)
    origin.z += r * (0.18 + index * 0.08)
    const middle = origin.clone().lerp(destination, 0.55)
    middle.y += (index % 2 ? -1 : 1) * r * 0.12
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([origin, middle, destination]), 32, r * 0.0038, 5, false)
  }), [connectorReach, positions, r])
  useEffect(() => () => connectors.forEach((geometry) => geometry.dispose()), [connectors])

  useFrame((state, delta) => {
    const signal = sceneState.current
    const p = signal.progress
    const alive = signal.director.conceptIntensity
    // La síntesis reúne los nodos; las etiquetas conservan turnos exclusivos.
    const synthesis = bell(p, inside('INNER_EXIT', 0.42), inside('INNER_EXIT', 0.7), PHASE.REASSEMBLY) * alive
    if (group.current) group.current.visible = alive > 0.004
    signal.activeHotspot = synthesis > 0.4 ? '4 nodos' : '—'

    CONCEPTS.forEach((concept, index) => {
      const [from, holdFrom, holdTo, to] = CONCEPT_WINDOWS[index]
      const enter = smootherstep(from, holdFrom, p)
      const exit = 1 - smootherstep(holdTo, to, p)

      /*
        Carga holográfica: empieza en el VIAJE ANTERIOR.

        La rampa de entrada de la ventana mide 90 px de scroll, y ahí no
        caben nodo, filamento, partículas y tres bloques de texto: todo
        ocurría a la vez y se leía como una activación instantánea. El nodo
        empieza a cargarse antes de que la cámara llegue, sin mostrar todavía
        ninguna palabra, y el texto sigue entrando exactamente donde entraba.
        El hold no pierde un solo píxel.
      */
      const charge = smootherstep(conceptApproach(index), holdFrom, p) * exit
      const nodeCharge = clamp01(charge / 0.35)
      const connectorGrow = clamp01((charge - 0.25) / 0.3)
      const particleFlow = clamp01((charge - 0.45) / 0.3)
      const solo = Math.min(enter, exit)
      const labelWeight = solo * clamp01(0.72 + alive * 0.52)
      const nodeWeight = Math.max(nodeCharge * exit, labelWeight, synthesis * 0.72)
      if (labelWeight > 0.45) signal.activeHotspot = concept.title

      /*
        Entrada escalonada dentro del tramo de entrada: primero el índice,
        después el título y por último la descripción. Cada uno arranca
        cuando el anterior lleva medio camino, y eso la hace leerse como una
        materialización en vez de como tres cosas apareciendo a la vez.
      */
      const stagger = (offset: number) => clamp01((enter - offset) / Math.max(1 - offset, 0.0001))
      const indexWeight = stagger(0)
      const titleWeight = stagger(0.22)
      const copyWeight = stagger(0.46)

      /*
        Oclusión y profundidad del anclaje.

        La oclusión se resuelve contra una esfera del tamaño del sujeto en
        vez de con un raycast sobre la malla: son cuatro pruebas por
        fotograma en lugar de cuatro travesías del BVH, y para decidir si una
        etiqueta queda detrás del cerebro la aproximación es suficiente —el
        cerebro es convexo y casi esférico a esta escala—.
      */
      cameraPoint.fromArray(signal.cameraPosition)
      anchorPoint.set(
        framing.stageX + positions[index][0],
        framing.stageY + positions[index][1],
        positions[index][2],
      )
      toAnchor.copy(anchorPoint).sub(cameraPoint)
      const anchorDistance = toAnchor.length()
      toAnchor.divideScalar(Math.max(anchorDistance, 1e-6))
      // Distancia del centro del sujeto al rayo cámara → anclaje.
      const along = -cameraPoint.dot(toAnchor)
      const closest = along > 0 && along < anchorDistance
        ? cameraPoint.clone().addScaledVector(toAnchor, along).length()
        : Infinity
      // El ancla pierde brillo al quedar detrás, pero nunca legibilidad: el
      // texto es parte de la narración y no puede caer a gris casi invisible.
      const hidden = 1 - smoothstep(radius * 0.72, radius * 1.05, closest)
      const occlusionTarget = 1 - hidden * 0.08
      const occlusionEase = signal.forcedProgress !== null ? 1 : 1 - Math.exp(-delta * 7)
      occlusion.current[index] += (occlusionTarget - occlusion.current[index]) * occlusionEase

      /*
        Profundidad perceptible sin sacrificar lectura. `Html` de drei mantiene
        el tamaño en pantalla; este factor devuelve una pizca de perspectiva,
        recortada para que nunca se vuelva ilegible.
      */
      const reference = framing.distance + radius * 3.4
      const depthScale = THREE.MathUtils.clamp(reference / Math.max(anchorDistance, 1e-6), 0.82, 1.08)

      const label = labels.current[index]
      if (label) {
        // `Html` vive en un portal DOM: ocultar el Group de Three no basta.
        // Se corta también aquí para que ninguna etiqueta sobreviva al handoff.
        label.style.display = labelWeight > 0.025 ? 'block' : 'none'
        label.style.opacity = String(labelWeight * occlusion.current[index])
        // Durante el hold el desenfoque es exactamente 0: el texto no se
        // transforma mientras se lee. Sólo lo mueven la entrada y la salida.
        label.style.filter = `blur(${(1 - Math.min(enter, exit)) * 6}px)`
        label.style.setProperty('--index-in', String(indexWeight))
        label.style.setProperty('--title-in', String(titleWeight))
        label.style.setProperty('--copy-in', String(copyWeight))
        // Las de la izquierda crecen hacia fuera, no hacia el cerebro: drei
        // ancla la esquina superior izquierda del elemento en el punto
        // proyectado, así que hay que retirarlas su propio ancho.
        const side = index % 2 ? 0 : -100
        const safeNudge = viewportWidth < 768 ? (index % 2 ? -12 : 12) : 0
        label.style.transform = `translate3d(${side}%, ${12 * (1 - labelWeight)}px, 0) translateX(${safeNudge}px) scale(${(0.96 + labelWeight * 0.04) * depthScale})`
      }
      /*
        El anillo sólo existe durante la llegada: se abre de 0,3 a 1,2 de
        escala mientras se apaga. Marca el instante en que la señal alcanza
        el nodo, que es lo que hace que el texto parezca salir de ahí y no
        aparecer encima.
      */
      const ring = rings.current[index]
      if (ring) {
        const burst = Math.min(indexWeight, 1) * (1 - smootherstep(0.35, 1, indexWeight))
        ring.visible = burst > 0.01
        ring.scale.setScalar(0.3 + indexWeight * 0.9)
        const ringMaterial = ring.material as THREE.MeshBasicMaterial
        ringMaterial.opacity = burst * 1.6
      }

      const node = nodes.current[index]
      if (!node) return
      const nodeDamping = signal.forcedProgress !== null ? 1 : 1 - Math.exp(-delta * 9)
      node.scale.setScalar(THREE.MathUtils.lerp(node.scale.x, 0.45 + nodeWeight * 0.55, nodeDamping))
      node.rotation.z = signal.time * (index % 2 ? -0.3 : 0.3)
      node.traverse((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
        if (!material?.isMaterial) return
        material.opacity = (material.userData.base ??= material.opacity) * (0.2 + nodeWeight * 0.8)
      })
      if (connectorMaterials.current[index]) connectorMaterials.current[index]!.opacity = Math.max(connectorGrow * exit * 0.46, synthesis * 0.2)

      // Las señales viajan durante la entrada y se disuelven al llegar.
      if (signals.current) {
        const travel = particleFlow * (1 - smootherstep(0.9, 1, particleFlow))
        for (let slot = 0; slot < SIGNALS_PER_CONCEPT; slot += 1) {
          const at = index * SIGNALS_PER_CONCEPT + slot
          const offset = signalOffsets[at]
          // Cada una sale con su retardo y su velocidad: llegan escalonadas.
          const along = clamp01((particleFlow - offset * 0.34) / 0.62)
          const alive = slot < visibleSignals
            ? travel * (along > 0 ? 1 : 0) * (1 - along * 0.35)
            : 0
          conceptCurves[index].getPoint(along, signalPoint)
          conceptDummy.position.copy(signalPoint)
          conceptDummy.scale.setScalar(alive > 0.01 ? nodeRadius * (0.34 + offset * 0.3) * alive : 0)
          conceptDummy.updateMatrix()
          signals.current.setMatrixAt(at, conceptDummy.matrix)
        }
        signals.current.instanceMatrix.needsUpdate = true
      }
    })
  })

  /*
    Partículas de señal.

    Diez por concepto que nacen en el cerebro y recorren el conector hasta el
    texto. No son decoración alrededor de la etiqueta: su recorrido es lo que
    hace leer la información como algo EXTRAÍDO del sujeto en lugar de
    encendido encima de él.

    Van todas en una sola malla instanciada, y su posición se calcula desde
    el progreso local del concepto, así que el scroll inverso las devuelve.
  */
  const SIGNALS_PER_CONCEPT = 10
  /*
    Cuántas señales se ven de verdad. El búfer sigue siendo de diez para no
    reconstruir la malla instanciada al redimensionar; las sobrantes se
    escalan a cero. En pantalla pequeña diez trazas sobre un texto de 24 px
    son contaminación, no materialización.
  */
  const visibleSignals = viewportWidth < 768 ? 7 : viewportWidth < 1200 ? 9 : SIGNALS_PER_CONCEPT
  const signalCount = CONCEPTS.length * SIGNALS_PER_CONCEPT
  const signalOffsets = useMemo(
    () => Array.from({ length: signalCount }, (_, index) => {
      const value = Math.sin((index + 13) * 78.233) * 43758.5453
      return value - Math.floor(value)
    }),
    [signalCount],
  )

  const nodeRadius = r * 0.024

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} renderOrder={16} visible={false}>
      <instancedMesh ref={signals} args={[undefined, undefined, signalCount]} frustumCulled={false} renderOrder={17}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshBasicMaterial color="#d8f8ff" transparent opacity={0.92} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
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
          <mesh ref={(mesh) => { rings.current[index] = mesh }} visible={false}>
            <torusGeometry args={[nodeRadius * 4.6, nodeRadius * 0.16, 8, 44]} />
            <meshBasicMaterial color="#9df3ff" transparent opacity={0} blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
          </mesh>
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
              <em aria-hidden="true">{String(index + 1).padStart(2, '0')}</em>
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

function World({ sceneState, platformState, framing, quality, cast, debugScene }: { sceneState: SceneStateRef; platformState: PlatformStateRef; framing: Framing; quality: Quality; cast: StageCast; debugScene: boolean }) {
  const [mountainsFar, mountainsMid, mountainsFront, stars, network, fogDeep, fogFront, fogBack] = useLoader(THREE.TextureLoader, [
    `${HERO}/background-mountains-night.png`, `${LAYERS}/mountains-mid.png`, `${LAYERS}/mountains-front.png`,
    `${LAYERS}/stars-alpha.png`, `${LAYERS}/network-alpha.png`,
    `${REFERENCE}/fog-deep.png`, `${REFERENCE}/fog-front.png`, `${HERO}/fog-back.png`,
  ])
  const { size } = useThree()
  const aspect = size.width / Math.max(size.height, 1)
  const worldFog = useRef<THREE.FogExp2>(null)
  const root = useRef<THREE.Group>(null)
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
    if (material) material.opacity = (0.04 + bell(p, PHASE.UNLOCK, PHASE.ORBIT, until('ENTRY')) * 0.12) * exterior
    if (networkPlate.current) networkPlate.current.visible = exterior > 0.004
    signal.fogOpacity = THREE.MathUtils.lerp(0.26, 0.14, smoothstep(PHASE.SYNTHESIS, PHASE.HANDOFF, p))
    signal.particleCount = n(400) + n(180) + n(80) + n(160) + n(28) + n(16) + n(72)
    /*
      El mundo neuronal no se apaga en el límite entre capítulos. Durante el
      handoff la cámara ya dejó el cerebro detrás y sigue su señal hacia z-9;
      estrellas, niebla y partículas permanecen delante durante el primer arco
      de Plataforma. Sólo se desmonta el grupo cuando la arquitectura ya lo
      ocluye, nunca como sustitución instantánea de un actor por otro.
    */
    if (root.current) root.current.visible = platformState.current.progress < 0.22
  })

  return (
    <>
      <fogExp2 ref={worldFog} attach="fog" args={['#03142c', 0.0125]} />

      <group ref={root}>
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
      <ParticleLayer channel="deepSpace" count={n(400)} spread={[74, 36, 15]} center={[0, 2, WORLD_Z.fogFar]} size={0.075} opacity={0.42} color="#4c8ef8" sceneState={sceneState} seed={3} pointerStrength={0.015} activity="exterior" />

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
      <ParticleLayer channel="atmospheric" count={n(180)} spread={[34, 18, 10]} center={[0, 0.5, WORLD_Z.mountainsFront]} size={0.05} opacity={0.44} color="#79dfff" sceneState={sceneState} seed={7} pointerStrength={0.06} activity="exterior" />

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
          <NeuralSurface
            geometry={cast.brain.geometry}
            center={cast.brain.center}
            meshRadius={cast.brain.radius}
            brainScale={cast.brainScale}
            framing={framing}
            quality={quality}
            sceneState={sceneState}
          />
          <NeuralPulsePaths radius={cast.radius} framing={framing} sceneState={sceneState} />
          <InnerNeuralTunnel radius={cast.radius} framing={framing} sceneState={sceneState} quality={quality} />
          <InnerAnatomyFragments cast={cast} framing={framing} sceneState={sceneState} quality={quality} />
          <InnerCore radius={cast.radius} framing={framing} sceneState={sceneState} />
          <Beam radius={cast.radius} framing={framing} sceneState={sceneState} />
          <Scanner radius={cast.radius} framing={framing} sceneState={sceneState} />
          <PlatformPulses radius={cast.radius} framing={framing} sceneState={sceneState} />
          <PlatformPortalTunnel radius={cast.radius} framing={framing} sceneState={sceneState} />
          <Concepts radius={cast.radius} framing={framing} sceneState={sceneState} />
          <InstitutionDataStreams radius={cast.radius} framing={framing} sceneState={sceneState} />
        </>
      ) : null}
      {debugScene ? <DebugScene cast={cast} framing={framing} sceneState={sceneState} /> : null}

      {/* El corredor interior existe en coordenadas de mundo. Al avanzar la
          cámara las motas cercanas salen hacia los bordes por perspectiva; no
          se simula ese movimiento alterando x/y en pantalla. */}
      {!debugScene ? <ParticleLayer channel="brainMicro"
        count={n(160)}
        spread={[cast.radius * 4.6, cast.radius * 3.1, cast.radius * 4.8]}
        center={[framing.stageX, framing.stageY, -cast.radius * 1.65]}
        size={0.044} opacity={0.66} color="#69dcff" sceneState={sceneState}
        seed={17} activity="inner"
      /> : null}
      {!debugScene ? <ParticleLayer channel="brainMicro"
        count={n(28)}
        spread={[cast.radius * 2.8, cast.radius * 2.2, cast.radius * 3.6]}
        center={[framing.stageX, framing.stageY, -cast.radius * 0.55]}
        size={0.16} opacity={0.2} color="#d9fbff" sceneState={sceneState}
        seed={23} swell={0.72} activity="entry"
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
      <ParticleLayer channel="brainMicro"
        count={n(80)} spread={[cast.radius * 2.9, cast.radius * 2.5, cast.radius * 2.2]}
        center={[framing.stageX, framing.stageY, 0]} size={0.038} opacity={0.7} color="#c9f4ff"
        sceneState={sceneState} seed={11} pointerStrength={0.12}
      />

      {/* ------------------------------------------------------ mundo delantero */}
      {/* Bancos bajos de atmósfera: dan profundidad sin ocultar el cerebro
          completo que debe dominar el primer fotograma. */}
      <FogLayer
        texture={fogBack} sceneState={sceneState} position={[-2.1, -2.35, 2.25]} scale={[13.5, 2.8]}
        opacity={0.16} flowSpeed={[0.026, 0.004]} noiseScale={3.7} distortion={0.07} density={0.9}
        scrollShift={[-15.5, 0.65]} renderOrder={18} depth={1.12} fadeOut={[0.015, 0.13]} exterior
      />
      {quality !== 'low' ? <FogLayer
        texture={fogFront} sceneState={sceneState} position={[2.7, -2.05, 3.05]} scale={[14.8, 3.1]}
        opacity={0.11} flowSpeed={[0.031, 0.006]} noiseScale={4.45} distortion={0.082} density={0.86}
        scrollShift={[16.8, 0.8]} renderOrder={19} depth={1.38} fadeOut={[0.02, 0.14]} exterior
      /> : null}

      {/* FogFrontA cruza la silueta durante la activación. Tapar un poco al
          protagonista dice más sobre la profundidad que veinte órbitas. */}
      <FogLayer
        texture={fogFront} sceneState={sceneState} position={[-8.5, -0.9, WORLD_Z.fogFrontLeft]} scale={[12, 4]}
        opacity={0.3} flowSpeed={[0.021, 0.009]} noiseScale={4.6} distortion={0.05} density={0.95}
        scrollShift={[13, 0.6]} renderOrder={20} depth={1.25} window={[0.18, 0.26, 0.34]} exterior
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
      {!debugScene ? <ParticleLayer channel="lens"
        count={n(16)} spread={[9, 5.5, 1.6]} center={[framing.stageX, framing.stageY, WORLD_Z.lensParticles]}
        size={0.24} opacity={0.15} color="#e2fbff" sceneState={sceneState} seed={13}
        swell={0.55} pointerStrength={0.42}
      /> : null}
      <ParticleLayer channel="lens"
        count={n(72)}
        spread={[cast.radius * 1.5, cast.radius * 1.5, cast.radius * 3.8]}
        center={[framing.stageX, framing.stageY - cast.radius * 1.24, -cast.radius * 1.8]}
        size={0.052} opacity={0.75} color="#9ff6ff" sceneState={sceneState}
        seed={31} activity="portal"
      />
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ lienzo */

function qualityFor(width: number): Quality {
  if (width < 900) return 'low'
  if (width < 1440) return 'medium'
  return 'high'
}

const QUALITY_RANK: Record<Quality, number> = { low: 0, medium: 1, high: 2 }
const lowerQuality = (current: Quality, requested: Quality) => (
  QUALITY_RANK[current] <= QUALITY_RANK[requested] ? current : requested
)

/**
 * Publica métricas del renderer y baja el tier, pero sólo como último recurso.
 *
 * Hay dos formas de que la escena quepa en el fotograma y NO son equivalentes:
 * bajar la resolución no se ve, y quitar el bloom sí. Estaban compitiendo —cada
 * una midiendo por su cuenta y reaccionando a la vez—, y el resultado medido era
 * lo peor de las dos: la resolución llegaba a su suelo Y el tier caía a `low`,
 * que apaga el compositor entero. La escena perdía todo su brillo aunque ya
 * hubiera espacio de sobra en el fotograma.
 *
 * El orden correcto es jerárquico y está escrito aquí: primero se recortan
 * píxeles, y sólo si eso ya no da más de sí se toca lo que se ve. De ahí las dos
 * condiciones —suelo alcanzado y encima seguir por debajo de 32 fps—, y de ahí
 * que el umbral sea peor que el de la resolución: quien manda es ella.
 */
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
    const median = sorted[sorted.length >> 1]
    list.length = 0
    if (signal.renderScale > SCALE_FLOOR + 0.02) return
    if (median > 1 / 32) onDrop()
  })
  return null
}

export function HeroScene({ sceneState, platformState }: { sceneState: SceneStateRef; platformState: PlatformStateRef }) {
  const [environment, setEnvironment] = useState<{ ready: boolean; quality: Quality; reducedMotion: boolean; debugScene: boolean; framing: Framing | null }>(
    { ready: false, quality: 'high', reducedMotion: false, debugScene: false, framing: null },
  )

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const test = readTestMode(window.location.search)
      const params = new URLSearchParams(window.location.search)
      const platformTest = params.get('platformTest') === '1'
      const handoffTest = params.get('handoffTest') === '1'
      const requestedTimeParam = new URLSearchParams(window.location.search).get('t')
      const requestedTime = requestedTimeParam === null ? null : Number(requestedTimeParam)
      const signal = sceneState.current
      signal.forcedProgress = test.active ? test.progress : platformTest || handoffTest ? signal.forcedProgress : null
      signal.forcedTime = test.active
        ? requestedTime !== null && Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : test.progress * 12
        : null
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
          signal.forcedTime = clamped * 12
          // La interfaz va con la escena: el texto se retira, la institución
          // entra y el portal se abre en el mismo progreso.
          ;(window as unknown as { __heroSetDomProgress?: (v: number) => void }).__heroSetDomProgress?.(clamped)
          ;(window as unknown as { __heroInvalidate?: () => void }).__heroInvalidate?.()
        }
        ;(window as unknown as { __heroSetTime?: (value: number) => void }).__heroSetTime = (value) => {
          signal.forcedTime = Math.max(0, Number.isFinite(value) ? value : 0)
          ;(window as unknown as { __heroInvalidate?: () => void }).__heroInvalidate?.()
        }
      }
      setEnvironment((current) => ({
        ready: true,
        // Nunca se recupera un tier descartado por FPS, pero al estrechar el
        // viewport sí se aplica inmediatamente el presupuesto móvil.
        quality: current.ready ? lowerQuality(current.quality, qualityFor(width)) : qualityFor(width),
        reducedMotion: motionPreference.matches,
        debugScene: new URLSearchParams(window.location.search).get('heroDebugScene') === '1',
        framing: frameStage(width, height),
      }))
    }
    read()
    window.addEventListener('resize', read, { passive: true })
    motionPreference.addEventListener('change', read)
    return () => {
      window.removeEventListener('resize', read)
      motionPreference.removeEventListener('change', read)
      delete (window as unknown as { __heroSetProgress?: unknown }).__heroSetProgress
      delete (window as unknown as { __heroSetTime?: unknown }).__heroSetTime
      delete (window as unknown as { __heroInvalidate?: unknown }).__heroInvalidate
    }
  }, [sceneState])

  const framing = environment.framing
  if (!framing) return null

  const dpr: [number, number] = environment.quality === 'high' ? [1, 1.5] : environment.quality === 'medium' ? [1, 1.25] : [1, 1]

  return (
    <div className="hero-canvas" aria-hidden="true">
      <Canvas
        frameloop={environment.reducedMotion ? 'demand' : 'always'}
        dpr={dpr}
        camera={{ fov: STAGE_FOV, near: 0.035, far: 160, position: [framing.stageX, 0, framing.distance] }}
        /*
          Sin antialias del contexto cuando hay compositor.

          Estaba justo al revés: encendido en los tiers que SÍ montan
          `EffectComposer` y apagado en el que no. Con compositor, la escena se
          dibuja en objetivos propios y lo único que llega al lienzo es un
          cuádruple a pantalla completa, sobre el que el multisampling no tiene
          nada que suavizar: se pagaba la memoria y el resuelto de cada
          fotograma a cambio de nada, y encima SMAA ya hace el trabajo. En
          `low`, que no monta compositor, es donde de verdad hace falta.
        */
        gl={{ alpha: false, antialias: environment.quality === 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={(state) => {
          ;(window as unknown as { __heroInvalidate?: () => void }).__heroInvalidate = state.invalidate
          state.gl.outputColorSpace = THREE.SRGBColorSpace
          state.gl.toneMappingExposure = 1.02
          /*
            Con `?heroDebug=1` la escena queda accesible para poder auditar qué
            actor ocupa cada zona del encuadre. Sin esto, atribuir un defecto
            visual a un objeto concreto es adivinar.
          */
          if (new URLSearchParams(window.location.search).get('heroDebug') === '1') {
            ;(window as unknown as { heroThree?: unknown }).heroThree = state
          }
        }}
        scene={{ background: new THREE.Color('#020a18') }}
      >
        <Suspense fallback={null}>
          <SceneBody sceneState={sceneState} platformState={platformState} framing={framing} quality={environment.quality} reducedMotion={environment.reducedMotion} debugScene={environment.debugScene} onDrop={() => setEnvironment((c) => ({ ...c, quality: c.quality === 'high' ? 'medium' : 'low' }))} />
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
      /*
        Primer fotograma dibujado. Es la señal que el velo de carga espera:
        que los recursos hayan llegado no basta, porque entre eso y ver algo
        todavía queda compilar shaders y subir geometría a la GPU.
      */
      if (!(window as unknown as { __heroPainted?: boolean }).__heroPainted) {
        ;(window as unknown as { __heroPainted?: boolean }).__heroPainted = true
        window.dispatchEvent(new Event('hero:first-frame'))
      }
      // Un solo reloj para todos los filamentos de señal.
      filamentClock.value = signal.time
      const ease = 1 - Math.exp(-delta / PROGRESS_DAMPING)
      signal.progress += (signal.targetProgress - signal.progress) * ease
    }

    /*
      Energía del gesto: ataque rápido, caída lenta.

      Asimétrica a propósito. Con la misma constante en los dos sentidos, o
      reacciona tarde o se apaga de golpe al soltar; así responde casi al
      instante y se desvanece con cola, que es como se percibe la inercia.
    */
    const demand = Math.min(Math.abs(signal.targetProgress - signal.progress) * 26, 1)
    const rising = demand > signal.scrollEnergy
    const energyEase = 1 - Math.exp(-delta / (rising ? 0.035 : 0.11))
    signal.scrollEnergy += (demand - signal.scrollEnergy) * energyEase
    resolveHeroDirector(signal.progress, rail, radius, signal.director, signal.time)
  }, -100)
  return null
}

/**
 * Resolución del bloom, en fracción de la pantalla.
 *
 * `UnrealBloomPass` no es una pasada: son once. Umbral de luminancia más cinco
 * niveles de desenfoque, cada uno con su pasada horizontal y su vertical. A
 * resolución completa eso era, medido, la mitad del coste del fotograma del
 * capítulo entero.
 *
 * Y es lo más barato que se puede recortar porque un bloom ES un desenfoque:
 * calcularlo a 0,6 de lado —una tercera parte de los píxeles— no cambia lo que
 * se ve, sólo lo que cuesta. Lo único que cambia es que el halo sale algo más
 * ancho al escalarlo, y eso se compensa en el radio.
 */
const BLOOM_SCALE = 0.6

/** Fotogramas entre dos decisiones de la resolución dinámica. */
const SCALE_WINDOW = 24
/** Nunca por debajo de esto: preferible perder fluidez a que se vea borroso. */
const SCALE_FLOOR = 0.62
/** Espera mínima entre dos cambios de resolución, en segundos. */
const COOLDOWN = 1.1

/** Bloom aislado por luminancia: sólo reaccionan pulsos, HUD y bordes emisivos. */
function CinematicBloom({ quality, bloom = true, sceneState }: { quality: Exclude<Quality, 'low'>; bloom?: boolean; sceneState: SceneStateRef }) {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const next = new EffectComposer(gl)
    next.addPass(new RenderPass(scene, camera))
    if (bloom) {
      next.addPass(new UnrealBloomPass(
        new THREE.Vector2(Math.round(size.width * BLOOM_SCALE), Math.round(size.height * BLOOM_SCALE)),
        quality === 'high' ? 0.38 : 0.28,
        // El radio se mide en la retícula del propio bloom, así que al bajarle
        // la resolución el halo se ensancharía solo. Se compensa en la misma
        // proporción para que el resultado sea el mismo que a tamaño completo.
        0.42 * BLOOM_SCALE,
        0.86,
      ))
    }
    next.addPass(new SMAAPass())
    next.addPass(new OutputPass())
    return next
  }, [bloom, camera, gl, quality, scene, size.height, size.width])

  /*
    Resolución dinámica.

    El coste de este capítulo es de relleno, no de geometría: medido, renderizar
    el lienzo a la mitad de lado recupera casi tanto como quitarlo entero. Eso
    significa que la palanca correcta es la cantidad de píxeles, y que puede
    ajustarse sola en vez de fijarla a ojo para el equipo de quien la programa.

    El tier de calidad ya existía, pero degrada en tres escalones y tarda 140
    fotogramas en decidirse: en un equipo que va justo, eso son varios segundos
    de tirones antes de reaccionar, y después se pasa de frenada. Esto es
    continuo, sube y baja, y mide en la mediana para que una pausa del
    recolector de basura no cambie nada.
  */
  const base = Math.min(gl.getPixelRatio(), 1.25)
  const scale = useRef(1)
  const applied = useRef(0)
  const samples = useRef<number[]>([])
  const changed = useRef(0)

  const resize = useCallback((value: number) => {
    if (Math.abs(value - applied.current) < 0.03) return
    applied.current = value
    sceneState.current.renderScale = value
    // `setPixelRatio` reasigna los objetivos de render, así que sólo se llama
    // cuando el cambio compensa: por eso el umbral y la ventana de medida.
    composer.setPixelRatio(base * value)
    composer.setSize(size.width, size.height)
  }, [base, composer, sceneState, size.height, size.width])

  useEffect(() => {
    applied.current = 0
    resize(scale.current)
  }, [resize])
  useEffect(() => () => composer.dispose(), [composer])

  useFrame((state, delta) => {
    composer.render(delta)

    const now = state.clock.elapsedTime
    const list = samples.current
    list.push(delta)
    if (list.length < SCALE_WINDOW) return
    list.sort((a, b) => a - b)
    const median = list[list.length >> 1]
    list.length = 0

    // Bandas anchas: entre 48 y 58 fps no se toca nada. Sin esa zona muerta la
    // resolución oscilaría cada pocos fotogramas y el parpadeo se vería.
    /*
      Enfriamiento entre cambios.

      Reasignar los objetivos de render tiene su propio coste, y sin esta espera
      el ajuste podía encadenar varias reasignaciones seguidas mientras busca su
      sitio: el remedio se notaba más que la enfermedad. Bajar es más agresivo
      que subir a propósito —un tirón molesta más que un píxel de menos—.
    */
    if (now - changed.current < COOLDOWN) return
    if (median > 1 / 48) scale.current = Math.max(SCALE_FLOOR, scale.current - 0.08)
    else if (median < 1 / 58) scale.current = Math.min(1, scale.current + 0.05)
    else return
    changed.current = now
    resize(scale.current)
  }, 1)

  return null
}

/** El rig de cámara necesita el radio medido, que sólo existe tras cargar. */
function SceneBody({ sceneState, platformState, framing, quality, reducedMotion, debugScene, onDrop }: { sceneState: SceneStateRef; platformState: PlatformStateRef; framing: Framing; quality: Quality; reducedMotion: boolean; debugScene: boolean; onDrop: () => void }) {
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
  useEffect(() => {
    if (reducedMotion) (window as unknown as { __heroReady?: boolean }).__heroReady = true
    return () => { (window as unknown as { __heroReady?: boolean }).__heroReady = false }
  }, [reducedMotion])
  return (
    <>
      <HeroDirector sceneState={sceneState} framing={framing} radius={cast.radius} reducedMotion={reducedMotion} />
      <SharedPlatformDirector sceneState={sceneState} platformState={platformState} quality={quality} reducedMotion={reducedMotion} />
      <DirectedCameraRig framing={framing} radius={cast.radius} sceneState={sceneState} platformState={platformState} />
      <Instrumentation sceneState={sceneState} quality={quality} onDrop={onDrop} />
      <World sceneState={sceneState} platformState={platformState} framing={framing} quality={quality} cast={cast} debugScene={debugScene} />
      {/* Los cuatro GLB optimizados pueden precargarse sin bloquear el primer
          fotograma de Inicio: su propia frontera de Suspense los aísla. */}
      <Suspense fallback={null}><PlatformWorldContent sceneState={platformState} /></Suspense>
      {quality !== 'low' ? <CinematicBloom quality={quality} bloom={!debugScene} sceneState={sceneState} /> : null}
    </>
  )
}
