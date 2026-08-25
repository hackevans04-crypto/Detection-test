'use client'

import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { bell, range, type HeroSceneState } from '@/lib/hero/depth'
import {
  ACTORS,
  CAMERA_ORBIT,
  BRAIN_URL,
  BRAIN_WORLD_HEIGHT,
  actorWeight,
  measureActor,
  type ActorMeasure,
  type ActorSpec,
  type Framing,
} from '@/lib/hero/stage'

type SceneStateRef = MutableRefObject<HeroSceneState>

export type StageCast = {
  brain: ActorMeasure
  /** Escala uniforme del cerebro. Nunca por eje. */
  brainScale: number
  /** Radio del cerebro en unidades de mundo. De aquí sale todo lo demás. */
  radius: number
  brainSize: THREE.Vector3
  actors: Array<{ spec: ActorSpec; measure: ActorMeasure; scale: number }>
  triangles: number
}

/**
 * Orden de pintado del escenario.
 *
 * Todo el mundo de fondo es transparente y se dibuja con `renderOrder` 0–8. Un
 * actor traslúcido con orden menor quedaría tapado por una montaña situada
 * treinta unidades más atrás, porque en la pasada transparente three.js ordena
 * primero por `renderOrder` y sólo después por distancia. Por eso el escenario
 * vive por encima del mundo y por debajo de la niebla frontal (20–21), que sí
 * debe poder cruzarse por delante.
 */
export const STAGE_RENDER_ORDER = { brain: 10, platform: 10, energy: 11, neural: 11, hud: 12 } as const

const smooth = (value: number) => value * value * (3 - 2 * value)

/** El cerebro nunca desaparece: en institución se atenúa y retrocede. */
function brainOpacity(p: number) {
  if (p <= 0.78) return 1
  if (p <= 0.9) return THREE.MathUtils.lerp(1, 0.72, smooth(range(p, 0.78, 0.9)))
  return THREE.MathUtils.lerp(0.72, 0.5, smooth(range(p, 0.9, 1)))
}

/**
 * Mide todo el reparto una sola vez.
 *
 * El cerebro fija la escala del mundo: se lleva a una altura conocida y su
 * radio `R` pasa a ser la unidad con la que se dimensionan y colocan los demás.
 * Así ningún número del escenario es arbitrario, y cambiar de viewport mueve la
 * cámara en lugar de deformar la composición.
 */
export function useStageCast(): StageCast {
  // El cerebro orgánico/digital es la dirección artística aprobada y no se
  // sustituye nunca. Degradar a `brain-solid` quitaba el hemisferio digital y
  // dejaba a la vista un tronco encefálico: la escena dejaba de ser la portada.
  // Los tiers bajan densidad de partículas, capas de niebla y DPR.
  const urls = useMemo(() => [BRAIN_URL, ...ACTORS.map((actor) => actor.url)], [])
  const loaded = useGLTF(urls, false, true) as unknown as Array<{ scene: THREE.Group }>

  return useMemo(() => {
    const brain = measureActor(loaded[0].scene)
    const brainScale = BRAIN_WORLD_HEIGHT / Math.max(brain.size.y, 1e-6)
    const radius = brain.radius * brainScale
    const actors = ACTORS.map((spec, index) => {
      const measure = measureActor(loaded[index + 1].scene, { aboveY: spec.cropAboveY, insideRadius: spec.cropInsideRadius })
      return { spec, measure, scale: (spec.width * radius) / Math.max(measure.size.x, 1e-6) }
    })
    return {
      brain,
      brainScale,
      radius,
      brainSize: brain.size.clone().multiplyScalar(brainScale),
      actors,
      triangles: brain.triangles + actors.reduce((sum, actor) => sum + actor.measure.triangles, 0),
    }
  }, [loaded])
}

/** Un material por actor: cada uno anima su emisión y su opacidad por separado. */
function useActorMaterial(source: THREE.Object3D, emissive: string, emissiveIntensity: number) {
  const material = useMemo(() => {
    let base: THREE.MeshStandardMaterial | null = null
    source.traverse((object) => {
      if (object instanceof THREE.Mesh && !base) base = object.material as THREE.MeshStandardMaterial
    })
    const clone = (base ? (base as THREE.MeshStandardMaterial).clone() : new THREE.MeshStandardMaterial())
    clone.metalness = 0.3
    clone.roughness = 0.36
    clone.emissive = new THREE.Color(emissive)
    // Emisión baja a propósito: si el modelo se ilumina solo, el rig de luces
    // deja de leerse sobre los surcos y la escena vuelve a parecer plana.
    clone.emissiveIntensity = emissiveIntensity
    clone.transparent = true
    clone.depthWrite = true
    return clone
  }, [emissive, emissiveIntensity, source])
  useEffect(() => () => material.dispose(), [material])
  return material
}

/**
 * Un actor de apoyo: plataforma, HUD, reactor o red neuronal.
 *
 * Tres raíces con una responsabilidad cada una. La de normalización centra,
 * orienta y escala el modelo una sola vez y nunca se anima; la de animación es
 * la única que gira y respira; la de posición sólo decide dónde vive la pieza
 * en la composición. Mezclarlas es lo que antes hacía imposible corregir un
 * modelo sin descolocar su movimiento.
 */
function SupportActor({
  spec, measure, scale, radius, sceneState, source,
}: {
  spec: ActorSpec; measure: ActorMeasure; scale: number; radius: number
  sceneState: SceneStateRef; source: THREE.Object3D
}) {
  const animation = useRef<THREE.Group>(null)
  const group = useRef<THREE.Group>(null)
  const material = useActorMaterial(source, spec.emissive, spec.emissiveIntensity)

  useFrame(() => {
    const signal = sceneState.current
    const weight = actorWeight(spec.window, signal.progress)
    if (group.current) group.current.visible = weight > 0.002
    if (weight <= 0.002) return
    material.opacity = weight * spec.peakOpacity
    // Sólo la plataforma es un sólido opaco; el resto son capas de datos que no
    // deben tapar lo que tienen detrás.
    material.depthWrite = spec.peakOpacity > 0.95
    material.emissiveIntensity = spec.emissiveIntensity * (0.5 + weight * 0.5)
    if (!animation.current) return
    animation.current.rotation.y = signal.time * spec.spin + signal.progress * spec.spin * 4
    // Entra creciendo un poco: aparecer a tamaño final se lee como un salto.
    const pop = 0.94 + weight * 0.06
    animation.current.scale.setScalar(pop)
  })

  return (
    <group ref={group} name={`${spec.key}PositionRoot`} position={[spec.position[0] * radius, spec.position[1] * radius, spec.position[2] * radius]}>
      <group ref={animation} name={`${spec.key}AnimationRoot`}>
        <group name={`${spec.key}NormalizationRoot`} scale={[scale, scale, scale]} rotation={spec.baseRotation}>
          <group position={measure.center.clone().negate()}>
            <mesh geometry={measure.geometry} material={material} frustumCulled={false} renderOrder={STAGE_RENDER_ORDER[spec.key]} />
          </group>
        </group>
      </group>
    </group>
  )
}

/**
 * El escenario completo.
 *
 * El cerebro es el único actor presente de principio a fin; los demás entran y
 * salen en su tramo. Todos cuelgan de la misma raíz de posición, así que la
 * cámara puede orbitar alrededor de un único punto y todo el conjunto conserva
 * su relación espacial.
 */
export function StageCastActors({
  cast, sceneState, framing,
}: {
  cast: StageCast; sceneState: SceneStateRef; framing: Framing
}) {
  const sources = useGLTF([BRAIN_URL, ...ACTORS.map((actor) => actor.url)], false, true) as unknown as Array<{ scene: THREE.Group }>
  const brainMaterial = useActorMaterial(sources[0].scene, '#0a3f96', 0.18)
  const animation = useRef<THREE.Group>(null)
  const normalization = useRef<THREE.Group>(null)
  const worldCenter = useMemo(() => new THREE.Vector3(), [])
  const { brain, brainScale, radius } = cast

  useFrame((state, delta) => {
    const signal = sceneState.current
    const p = signal.progress
    const time = signal.time
    const ease = 1 - Math.exp(-delta * 5)
    const alpha = brainOpacity(p)

    if (animation.current) {
      const node = animation.current
      // Gira en sentido contrario a la cámara. Sumado al arco de ésta, la cara
      // visible cambia bastante más de lo que se movería el punto de vista solo.
      const scrollYaw = THREE.MathUtils.degToRad(
        range(p, 0.14, 0.42) * 11 - range(p, 0.42, 0.74) * 5 - range(p, 0.86, 1) * 3,
      )
      const scrollPitch = THREE.MathUtils.degToRad(-range(p, 0.18, 0.42) * 2.4)
      node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, scrollYaw + signal.pointerX * 0.05, ease)
      node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, scrollPitch - signal.pointerY * 0.035, ease)
      node.position.y = Math.sin(time * 0.42) * radius * 0.012 + range(p, 0.88, 1) * radius * 0.16
      node.position.z = -range(p, 0.88, 1) * radius * 0.3
      signal.brainRotation = [node.rotation.x, node.rotation.y, node.rotation.z]
      signal.brainPosition = [framing.stageX, framing.stageY + node.position.y, node.position.z]
    }

    const activation = bell(p, 0.14, 0.3, 0.5)
    brainMaterial.opacity = alpha
    brainMaterial.emissiveIntensity = 0.16 + activation * 0.2

    signal.brainScale = brainScale
    signal.brainOpacity = alpha
    signal.brainRadius = radius
    signal.brainBounds = [cast.brainSize.x, cast.brainSize.y, cast.brainSize.z]
    signal.platformPosition = [framing.stageX, framing.stageY + ACTORS[0].position[1] * radius, 0]
    signal.platformScale = cast.actors[0]?.scale ?? 1
    signal.activeGlb = `${cast.actors.filter((a) => actorWeight(a.spec.window, p) > 0.02).length + 1}/5 actores`
    signal.triangles = state.gl.info.render.triangles

    if (process.env.NODE_ENV !== 'production') {
      const s = normalization.current?.scale
      if (s && (Math.abs(s.x - s.y) > 1e-6 || Math.abs(s.y - s.z) > 1e-6)) {
        throw new Error('La raíz de normalización debe conservar siempre una escala uniforme')
      }
      animation.current?.getWorldPosition(worldCenter)
      if (state.camera.position.distanceTo(worldCenter) <= radius * 1.1) {
        throw new Error('La cámara ha entrado en la esfera de seguridad del cerebro')
      }
    }
  })

  return (
    <group name="StagePositionRoot" position={[framing.stageX, framing.stageY, 0]}>
      <group ref={animation} name="BrainAnimationRoot">
        <group ref={normalization} name="BrainNormalizationRoot" scale={[brainScale, brainScale, brainScale]}>
          <group position={brain.center.clone().negate()}>
            <mesh geometry={brain.geometry} material={brainMaterial} frustumCulled={false} renderOrder={STAGE_RENDER_ORDER.brain} />
          </group>
        </group>
      </group>
      {cast.actors.map((actor, index) => (
        <SupportActor
          key={actor.spec.key}
          spec={actor.spec}
          measure={actor.measure}
          scale={actor.scale}
          radius={radius}
          sceneState={sceneState}
          source={sources[index + 1].scene}
        />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------- luces */

/**
 * Rig cinematográfico. Sus intensidades y posiciones cambian con el scroll: si
 * los mismos surcos siguen iluminados igual al 20 % y al 42 %, la escena parece
 * plana por mucho que la cámara se haya movido.
 */
export function LightRig({ cast, sceneState, framing }: { cast: StageCast; sceneState: SceneStateRef; framing: Framing }) {
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const platform = useRef<THREE.PointLight>(null)
  const sweep = useRef<THREE.PointLight>(null)
  const orbit = useMemo(() => new THREE.Vector3(), [])
  const { radius } = cast
  const platformY = ACTORS[0].position[1] * radius

  useFrame(() => {
    const signal = sceneState.current
    const p = signal.progress
    const time = signal.time
    const reveal = range(p, 0.16, 0.44)
    // Azimut de la cámara en este progreso, para colocar las luces respecto a
    // ella y no respecto al mundo.
    const cameraAzimuth = THREE.MathUtils.degToRad(CAMERA_ORBIT.getPoint(p, orbit).x)

    if (key.current) {
      key.current.intensity = 2.35 - reveal * 0.35
      // La clave acompaña a la cámara con un desfase fijo. Con una luz fija en
      // el mundo, abrir el arco hasta −18° dejaba al cerebro a contraluz y la
      // escena se apagaba justo en el momento de máxima perspectiva.
      const angle = cameraAzimuth - THREE.MathUtils.degToRad(41)
      key.current.position.set(Math.sin(angle) * radius * 3.9, radius * 2.4, Math.cos(angle) * radius * 3.9)
    }
    if (rim.current) {
      rim.current.intensity = 1.6 + reveal * 1.9 - range(p, 0.78, 1) * 0.6
      // El contraluz va al lado opuesto, también relativo a la cámara: es lo
      // que dibuja el contorno cian cuando el arco está abierto.
      const angle = cameraAzimuth + THREE.MathUtils.degToRad(118 + reveal * 22)
      rim.current.position.set(Math.sin(angle) * radius * 3.4, radius * 1.5, Math.cos(angle) * radius * 3.4)
    }
    if (platform.current) platform.current.intensity = (1.8 + reveal * 1.2 + range(p, 0.86, 1) * 3.6) * radius
    if (sweep.current) {
      // Barrido único durante la activación: recorre el cerebro de abajo arriba
      // y se apaga. No es una luz que parpadee siempre.
      const pass = bell(p, 0.18, 0.26, 0.36)
      sweep.current.intensity = pass * 2.8 * radius
      sweep.current.position.set(
        Math.sin(time * 0.5) * radius * 0.4,
        THREE.MathUtils.lerp(-radius, radius, range(p, 0.18, 0.36)),
        radius * 1.5,
      )
    }
    signal.lightLevel = 1 + reveal * 0.45
  })

  return (
    <group position={[framing.stageX, framing.stageY, 0]}>
      <ambientLight intensity={0.42} color="#6ba6f0" />
      <hemisphereLight intensity={0.58} color="#7fcdff" groundColor="#04142f" />
      <directionalLight ref={key} position={[-radius * 2.6, radius * 2.4, radius * 3]} intensity={2.2} color="#9ec9ff" />
      <directionalLight position={[radius * 1.4, -radius * 0.4, radius * 2.6]} intensity={0.72} color="#5d93d8" />
      <directionalLight ref={rim} position={[radius * 2.4, radius * 1.5, -radius * 2.4]} intensity={1.5} color="#4ef0ff" />
      <pointLight ref={platform} position={[0, platformY + radius * 0.2, 0]} intensity={1.8 * radius} distance={radius * 7} color="#2fd8ff" decay={2} />
      <pointLight ref={sweep} position={[0, -radius, radius * 1.5]} intensity={0} distance={radius * 3.4} color="#d6f8ff" decay={2} />
    </group>
  )
}

useGLTF.preload(BRAIN_URL, false, true)
for (const actor of ACTORS) useGLTF.preload(actor.url, false, true)
