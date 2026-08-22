'use client'

import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { PHASE, openingSubjectReveal, smoothstep, smootherstep, type HeroSceneState } from '@/lib/hero/depth'
import {
  ACTORS,
  BRAIN_URL,
  BRAIN_WORLD_HEIGHT,
  halfHeightAt,
  measureActor,
  type ActorMeasure,
  type ActorSpec,
  type Framing,
} from '@/lib/hero/stage'

type SceneStateRef = MutableRefObject<HeroSceneState>

export type StageCast = {
  brain: ActorMeasure
  brainScale: number
  radius: number
  brainSize: THREE.Vector3
  actors: Array<{ spec: ActorSpec; measure: ActorMeasure; scale: number }>
  triangles: number
}

export const STAGE_RENDER_ORDER = {
  neural: 8,
  interior: 9,
  brain: 10,
  organic: 10,
  platform: 10,
  energy: 11,
  hud: 12,
} as const

export function useStageCast(): StageCast {
  const urls = useMemo(() => [BRAIN_URL, ...ACTORS.map((actor) => actor.url)], [])
  const loaded = useGLTF(urls, false, true) as unknown as Array<{ scene: THREE.Group }>

  return useMemo(() => {
    const brain = measureActor(loaded[0].scene)
    const brainScale = BRAIN_WORLD_HEIGHT / Math.max(brain.size.y, 1e-6)
    const radius = brain.radius * brainScale
    const actors = ACTORS.map((spec, index) => {
      const measure = measureActor(loaded[index + 1].scene, {
        aboveY: spec.cropAboveY,
        insideRadius: spec.cropInsideRadius,
      })
      const scale = spec.fit === 'brain-height'
        ? BRAIN_WORLD_HEIGHT / Math.max(measure.size.y, 1e-6)
        : ((spec.width ?? 1) * radius) / Math.max(measure.size.x, 1e-6)
      return { spec, measure, scale }
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

function useActorMaterial(
  source: THREE.Object3D,
  emissive: string,
  emissiveIntensity: number,
  organicSurface = false,
  tint?: string,
  doubleSided = false,
) {
  const material = useMemo(() => {
    let base: THREE.MeshStandardMaterial | null = null
    source.traverse((object) => {
      if (object instanceof THREE.Mesh && !base) base = object.material as THREE.MeshStandardMaterial
    })
    const clone = base ? (base as THREE.MeshStandardMaterial).clone() : new THREE.MeshStandardMaterial()
    clone.metalness = organicSurface ? 0.015 : 0.08
    clone.roughness = organicSurface ? 0.7 : 0.48
    clone.envMapIntensity = organicSurface ? 0.5 : 0.8
    clone.emissive = new THREE.Color(emissive)
    clone.emissiveIntensity = emissiveIntensity
    if (tint) clone.color.multiply(new THREE.Color(tint))
    clone.transparent = true
    clone.depthWrite = true
    clone.side = doubleSided ? THREE.DoubleSide : THREE.FrontSide
    clone.needsUpdate = true
    return clone
  }, [doubleSided, emissive, emissiveIntensity, organicSurface, source, tint])
  useEffect(() => () => material.dispose(), [material])
  return material
}

function makeIndexedSubset(source: THREE.BufferGeometry, indices: number[]) {
  const geometry = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute)
  const typed = source.attributes.position.count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
  geometry.setIndex(new THREE.BufferAttribute(typed, 1))

  const point = new THREE.Vector3()
  const bounds = new THREE.Box3()
  const position = source.attributes.position
  for (let index = 0; index < typed.length; index += 1) {
    const vertex = typed[index]
    bounds.expandByPoint(point.set(position.getX(vertex), position.getY(vertex), position.getZ(vertex)))
  }
  geometry.boundingBox = bounds
  geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere())
  return geometry
}

/** Partition the canonical mesh without changing vertices, UVs or materials. */
function splitGeometryByCentroidX(source: THREE.BufferGeometry, seamX: number) {
  const position = source.attributes.position
  const index = source.index
  const triangleCount = index ? index.count / 3 : position.count / 3
  const left: number[] = []
  const right: number[] = []
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = index ? index.getX(triangle * 3) : triangle * 3
    const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
    const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
    const centroidX = (position.getX(a) + position.getX(b) + position.getX(c)) / 3
    ;(centroidX < seamX ? left : right).push(a, b, c)
  }
  return {
    left: makeIndexedSubset(source, left),
    right: makeIndexedSubset(source, right),
  }
}

function SupportActor({
  spec, measure, scale, radius, sceneState, source,
}: {
  spec: ActorSpec
  measure: ActorMeasure
  scale: number
  radius: number
  sceneState: SceneStateRef
  source: THREE.Object3D
}) {
  const positionRoot = useRef<THREE.Group>(null)
  const animation = useRef<THREE.Group>(null)
  const material = useActorMaterial(source, spec.emissive, spec.emissiveIntensity, false, spec.tint)

  useFrame(() => {
    const signal = sceneState.current
    const directed = signal.director
    const weight = directed.actorWeights[spec.key] * openingSubjectReveal(signal.progress)
    if (positionRoot.current) positionRoot.current.visible = weight > 0.002
    if (weight <= 0.002) return

    material.opacity = weight * spec.peakOpacity
    material.depthWrite = spec.key === 'platform' && weight > 0.92
    material.emissiveIntensity = spec.emissiveIntensity * (
      spec.key === 'hud' ? 0.5 + directed.hudIntensity : 0.65 + directed.platformIntensity * 0.45
    )

    if (!animation.current) return
    animation.current.rotation.set(
      spec.baseRotation[0],
      spec.baseRotation[1] + signal.time * spec.spin + signal.progress * spec.spin * 4,
      spec.baseRotation[2],
    )
    let pop = 0.95 + weight * 0.05
    if (spec.key === 'hud') pop *= 1 + directed.assemblyExplode * 0.18 + directed.portalIntensity * 0.42
    if (spec.key === 'platform') pop *= 1 + directed.portalIntensity * 0.18
    animation.current.scale.setScalar(pop)
  })

  return (
    <group
      ref={positionRoot}
      name={`${spec.key}PositionRoot`}
      position={[spec.position[0] * radius, spec.position[1] * radius, spec.position[2] * radius]}
    >
      <group ref={animation} name={`${spec.key}AnimationRoot`}>
        <group name={`${spec.key}NormalizationRoot`} scale={[scale, scale, scale]}>
          <group position={measure.center.clone().negate()}>
            <mesh
              geometry={measure.geometry}
              material={material}
              frustumCulled={false}
              renderOrder={STAGE_RENDER_ORDER[spec.key]}
            />
          </group>
        </group>
      </group>
    </group>
  )
}

/** Internal layers share the BrainAssembly transform and remain depth-occluded. */
function NestedAssemblyActor({
  spec, measure, scale, radius, sceneState, source,
}: {
  spec: ActorSpec
  measure: ActorMeasure
  scale: number
  radius: number
  sceneState: SceneStateRef
  source: THREE.Object3D
}) {
  const root = useRef<THREE.Group>(null)
  const animation = useRef<THREE.Group>(null)
  const material = useActorMaterial(source, spec.emissive, spec.emissiveIntensity, false, spec.tint, true)

  useFrame(() => {
    const signal = sceneState.current
    const directed = signal.director
    const weight = directed.actorWeights[spec.key] * openingSubjectReveal(signal.progress)
    if (root.current) root.current.visible = weight > 0.004
    if (weight <= 0.004) return

    const exposed = 0.12 + directed.assemblyExplode * 0.88
    material.opacity = weight * spec.peakOpacity * (spec.key === 'energy' ? 1 : exposed)
    material.depthWrite = false
    material.emissiveIntensity = spec.emissiveIntensity * (
      0.7 + directed.innerIntensity * 1.15 + directed.entryIntensity * 0.45 + directed.portalIntensity * 0.7
    )

    if (root.current) {
      const handoff = spec.key === 'energy' ? smootherstep(PHASE.INSTITUTION, PHASE.PLATFORM_EXIT, signal.progress) : 0
      const inverseScale = 1 / Math.max(directed.brainScale, 0.2)
      const portalY = (-1.24 - directed.brainPosition[1]) * inverseScale
      const portalZ = -directed.brainPosition[2] * inverseScale
      root.current.position.set(
        THREE.MathUtils.lerp(spec.position[0], 0, handoff) * radius,
        THREE.MathUtils.lerp(spec.position[1], portalY, handoff) * radius,
        THREE.MathUtils.lerp(spec.position[2], portalZ, handoff) * radius,
      )
    }
    if (animation.current) {
      animation.current.rotation.set(
        spec.baseRotation[0],
        spec.baseRotation[1] + signal.time * spec.spin + signal.progress * spec.spin * 3,
        spec.baseRotation[2],
      )
      const pulse = spec.key === 'energy' ? 1 + Math.sin(signal.time * 2.1) * 0.035 : 1
      animation.current.scale.setScalar(pulse)
    }
  })

  return (
    <group ref={root} name={`${spec.key}AssemblyLayer`} position={spec.position.map((value) => value * radius) as [number, number, number]}>
      <group ref={animation}>
        <group scale={[scale, scale, scale]}>
          <group position={measure.center.clone().negate()}>
            <mesh
              geometry={measure.geometry}
              material={material}
              frustumCulled={false}
              renderOrder={STAGE_RENDER_ORDER[spec.key]}
            />
          </group>
        </group>
      </group>
    </group>
  )
}

function BrainFresnel({ geometry, sceneState }: { geometry: THREE.BufferGeometry; sceneState: SceneStateRef }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uScanner: { value: 0 },
      uEnergy: { value: 0 },
      uColorA: { value: new THREE.Color('#16cfff') },
      uColorB: { value: new THREE.Color('#7868ff') },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * world;
        vNormalView = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uScanner;
      uniform float uEnergy;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorld;
      void main() {
        float rim = pow(1.0 - max(dot(normalize(vNormalView), normalize(vViewDir)), 0.0), 2.7);
        float scan = exp(-pow((fract(uScanner) * 3.2 - 1.6) - vWorld.y, 2.0) * 18.0);
        float breathe = 0.76 + 0.24 * sin(uTime * 1.45 + vWorld.y * 3.0);
        float neuralField = sin(vWorld.x * 8.4 + sin(vWorld.y * 5.1) * 1.7 + uTime * 1.34);
        neuralField *= sin(vWorld.z * 9.2 - vWorld.y * 3.8 - uTime * 1.08);
        float neuralPath = pow(clamp(neuralField * 0.5 + 0.5, 0.0, 1.0), 13.0);
        float traveling = pow(clamp(sin(uTime * 2.45 - vWorld.y * 6.4 + vWorld.x * 2.1) * 0.5 + 0.5, 0.0, 1.0), 7.0);
        float electricity = neuralPath * (0.18 + traveling * 0.82) * uEnergy;
        vec3 color = mix(uColorB, uColorA, clamp(rim + scan * 0.45 + electricity, 0.0, 1.0));
        color += vec3(0.55, 0.94, 1.0) * electricity * 1.35;
        float alpha = uOpacity * (rim * 0.78 + scan * 0.34 + electricity * 1.1) * breathe;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [])

  useFrame(() => {
    const signal = sceneState.current
    material.uniforms.uTime.value = signal.time
    material.uniforms.uScanner.value = signal.progress
    material.uniforms.uEnergy.value = Math.max(
      0.42 * (1 - smootherstep(0.18, 0.36, signal.progress)),
      signal.director.neuralIntensity,
    )
    material.uniforms.uOpacity.value = signal.director.actorWeights.brain * openingSubjectReveal(signal.progress) * (
      0.14 + signal.director.hudIntensity * 0.07 + signal.director.scannerIntensity * 0.22
    )
  })
  useEffect(() => () => material.dispose(), [material])
  return <mesh geometry={geometry} material={material} scale={1.012} frustumCulled={false} renderOrder={13} />
}

export function StageCastActors({
  cast, sceneState, framing,
}: {
  cast: StageCast
  sceneState: SceneStateRef
  framing: Framing
}) {
  const sources = useGLTF([BRAIN_URL, ...ACTORS.map((actor) => actor.url)], false, true) as unknown as Array<{ scene: THREE.Group }>
  const brainMaterial = useActorMaterial(sources[0].scene, '#0a3f96', 0.08, true)
  const assembly = useRef<THREE.Group>(null)
  const outerScale = useRef<THREE.Group>(null)
  const innerScale = useRef<THREE.Group>(null)
  const leftPivot = useRef<THREE.Group>(null)
  const rightPivot = useRef<THREE.Group>(null)
  const worldCenter = useMemo(() => new THREE.Vector3(), [])
  const { brain, brainScale, radius } = cast
  const halves = useMemo(() => splitGeometryByCentroidX(brain.geometry, brain.center.x), [brain.center.x, brain.geometry])
  useEffect(() => () => {
    halves.left.dispose()
    halves.right.dispose()
  }, [halves])

  const leftPivotPosition = useMemo(
    () => new THREE.Vector3(brain.center.x - brain.size.x * 0.18, brain.center.y, brain.center.z),
    [brain.center, brain.size.x],
  )
  const rightPivotPosition = useMemo(
    () => new THREE.Vector3(brain.center.x + brain.size.x * 0.18, brain.center.y, brain.center.z),
    [brain.center, brain.size.x],
  )

  useFrame((state, delta) => {
    const signal = sceneState.current
    const directed = signal.director
    const time = signal.time
    const idleWeight = 1 - smootherstep(0.12, 0.3, signal.progress)
    const livingScale = 1 + Math.sin(time * 1.337) * 0.0055 * idleWeight
    // Las capturas y el scroll inverso deben resolver el mismo fotograma sin
    // depender del punto anterior. En interacción normal el director ya aporta
    // inercia y esta capa sólo suaviza la respiración del ensamblaje.
    const damping = signal.forcedProgress !== null ? 1 : 1 - Math.exp(-delta * 10)

    if (assembly.current) {
      const node = assembly.current
      const quiet = 1 - directed.entryIntensity * 0.82
      const ambientYaw = THREE.MathUtils.degToRad(Math.sin(time * 0.23) * 0.8) * quiet
      const ambientPitch = THREE.MathUtils.degToRad(Math.sin(time * 0.31) * 0.5) * quiet
      node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, directed.brainRotation[1] + ambientYaw + signal.pointerX * 0.012 * quiet, damping)
      node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, directed.brainRotation[0] + ambientPitch - signal.pointerY * 0.008 * quiet, damping)
      node.rotation.z = THREE.MathUtils.lerp(node.rotation.z, directed.brainRotation[2], damping)
      const float = Math.sin(time * 0.42) * 0.016 + Math.sin(time * 1.31) * 0.004
      node.position.set(
        directed.brainPosition[0] * radius,
        (directed.brainPosition[1] + float * quiet) * radius,
        directed.brainPosition[2] * radius,
      )
      signal.brainRotation = [node.rotation.x, node.rotation.y, node.rotation.z]
      signal.brainPosition = [framing.stageX + node.position.x, framing.stageY + node.position.y, node.position.z]
    }

    const directedScale = directed.brainScale
    outerScale.current?.scale.setScalar(brainScale * directedScale * livingScale)
    innerScale.current?.scale.setScalar(directedScale * livingScale)

    const explode = directed.assemblyExplode
    const sourceTravel = radius * 0.46 / Math.max(brainScale, 1e-6)
    if (leftPivot.current) {
      leftPivot.current.position.set(
        leftPivotPosition.x - sourceTravel * explode,
        leftPivotPosition.y + sourceTravel * 0.07 * explode,
        leftPivotPosition.z + sourceTravel * 0.08 * explode,
      )
      leftPivot.current.rotation.set(0.035 * explode, 0.15 * explode, -0.08 * explode)
    }
    if (rightPivot.current) {
      rightPivot.current.position.set(
        rightPivotPosition.x + sourceTravel * explode,
        rightPivotPosition.y - sourceTravel * 0.045 * explode,
        rightPivotPosition.z - sourceTravel * 0.06 * explode,
      )
      rightPivot.current.rotation.set(-0.028 * explode, -0.14 * explode, 0.075 * explode)
    }

    const alpha = directed.actorWeights.brain * openingSubjectReveal(signal.progress)
    brainMaterial.opacity = alpha
    brainMaterial.depthWrite = alpha > 0.8
    brainMaterial.emissiveIntensity = (
      0.055 + directed.hudIntensity * 0.07 + directed.scannerIntensity * 0.16 + directed.innerIntensity * 0.05
    ) * (0.97 + Math.sin(time * 1.11) * 0.03)

    assembly.current?.getWorldPosition(worldCenter)
    const distance = state.camera.position.distanceTo(worldCenter)
    signal.cameraDistanceR = distance / radius
    signal.brainScreenHeight = (BRAIN_WORLD_HEIGHT * directedScale) / (2 * halfHeightAt(Math.max(distance, 0.001)))
    signal.brainScale = brainScale * directedScale * livingScale
    signal.brainOpacity = alpha
    signal.brainRadius = radius
    signal.brainBounds = [cast.brainSize.x, cast.brainSize.y, cast.brainSize.z]
    const platform = cast.actors.find((actor) => actor.spec.key === 'platform')
    signal.platformPosition = [framing.stageX, framing.stageY + (platform?.spec.position[1] ?? -1.24) * radius, 0]
    signal.platformScale = platform?.scale ?? 1
    const activeActors = cast.actors.filter((actor) => directed.actorWeights[actor.spec.key] > 0.02).length + 1
    signal.activeGlb = `${activeActors}/6 actores · orgánico y galaxia excluidos`
    signal.triangles = state.gl.info.render.triangles

    if (process.env.NODE_ENV !== 'production') {
      const scale = outerScale.current?.scale
      if (scale && (Math.abs(scale.x - scale.y) > 1e-6 || Math.abs(scale.y - scale.z) > 1e-6)) {
        throw new Error('BrainAssembly debe conservar una escala uniforme')
      }
    }
  })

  const supportActors = cast.actors.filter((actor) => actor.spec.key === 'platform' || actor.spec.key === 'hud')
  const nestedActors = cast.actors.filter((actor) => actor.spec.key === 'interior' || actor.spec.key === 'neural' || actor.spec.key === 'energy')
  const sourceFor = (key: ActorSpec['key']) => sources[ACTORS.findIndex((actor) => actor.key === key) + 1].scene

  return (
    <group name="StagePositionRoot" position={[framing.stageX, framing.stageY, 0]}>
      <group ref={assembly} name="BrainAssemblyRoot">
        <group ref={innerScale} name="BrainInternalScaleRoot">
          {nestedActors.map((actor) => (
            <NestedAssemblyActor
              key={actor.spec.key}
              {...actor}
              radius={radius}
              sceneState={sceneState}
              source={sourceFor(actor.spec.key)}
            />
          ))}
        </group>

        <group ref={outerScale} name="BrainCanonicalScaleRoot" scale={[brainScale, brainScale, brainScale]}>
          <group position={brain.center.clone().negate()}>
            <group ref={leftPivot} name="LeftHemispherePivot" position={leftPivotPosition}>
              <group position={leftPivotPosition.clone().negate()}>
                <mesh geometry={halves.left} material={brainMaterial} frustumCulled={false} renderOrder={STAGE_RENDER_ORDER.brain} />
                <BrainFresnel geometry={halves.left} sceneState={sceneState} />
              </group>
            </group>
            <group ref={rightPivot} name="RightHemispherePivot" position={rightPivotPosition}>
              <group position={rightPivotPosition.clone().negate()}>
                <mesh geometry={halves.right} material={brainMaterial} frustumCulled={false} renderOrder={STAGE_RENDER_ORDER.brain} />
                <BrainFresnel geometry={halves.right} sceneState={sceneState} />
              </group>
            </group>
          </group>
        </group>
      </group>

      {supportActors.map((actor) => (
        <SupportActor
          key={actor.spec.key}
          {...actor}
          radius={radius}
          sceneState={sceneState}
          source={sourceFor(actor.spec.key)}
        />
      ))}
    </group>
  )
}

export function LightRig({ cast, sceneState, framing }: { cast: StageCast; sceneState: SceneStateRef; framing: Framing }) {
  const key = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const platform = useRef<THREE.PointLight>(null)
  const accent = useRef<THREE.PointLight>(null)
  const scan = useRef<THREE.PointLight>(null)
  const { radius } = cast
  const platformY = (ACTORS.find((actor) => actor.key === 'platform')?.position[1] ?? -1.24) * radius
  const cyanAccent = useMemo(() => new THREE.Color('#63d4ff'), [])
  const violetAccent = useMemo(() => new THREE.Color('#8d6cff'), [])

  useFrame(() => {
    const signal = sceneState.current
    const directed = signal.director
    const reveal = smoothstep(PHASE.AWAKENING, PHASE.INFORMATION, signal.progress)
    const cameraAzimuth = Math.atan2(signal.cameraPosition[0] - framing.stageX, signal.cameraPosition[2])

    if (key.current) {
      key.current.intensity = directed.keyLightIntensity * (0.975 + Math.sin(signal.time * 0.47) * 0.025)
      const angle = cameraAzimuth - THREE.MathUtils.degToRad(41)
      key.current.position.set(Math.sin(angle) * radius * 3.9, radius * 2.4, Math.cos(angle) * radius * 3.9)
    }
    if (rim.current) {
      rim.current.intensity = directed.rimLightIntensity * (0.94 + Math.sin(signal.time * 0.61 + 1.4) * 0.06)
      const angle = cameraAzimuth + THREE.MathUtils.degToRad(118 + reveal * 22)
      rim.current.position.set(Math.sin(angle) * radius * 3.4, radius * 1.5, Math.cos(angle) * radius * 3.4)
    }
    if (platform.current) platform.current.intensity = directed.platformIntensity * 1.45 * radius
    if (accent.current) {
      // La luz exploradora ya recorre el cerebro en reposo. Al avanzar se
      // mezcla sin salto con la posición dirigida de cada plano.
      const orbitAngle = signal.time * THREE.MathUtils.lerp(0.13, 0.09, reveal)
      const x = directed.accentLightPosition[0]
      const z = directed.accentLightPosition[2]
      accent.current.position.set(
        x * Math.cos(orbitAngle) - z * Math.sin(orbitAngle),
        directed.accentLightPosition[1],
        x * Math.sin(orbitAngle) + z * Math.cos(orbitAngle),
      )
      accent.current.color.lerpColors(cyanAccent, violetAccent, directed.neuralIntensity * 0.75)
      accent.current.intensity = (0.82 + directed.hudIntensity * 0.62 + directed.innerIntensity * 0.55 + Math.sin(signal.time * 0.9) * 0.12) * radius
    }
    if (scan.current) {
      scan.current.intensity = directed.scannerIntensity * 2.6 * radius
      scan.current.position.set(
        Math.sin(signal.time * 0.5) * radius * 0.4,
        THREE.MathUtils.lerp(-radius, radius, smoothstep(0.045, PHASE.UNLOCK, signal.progress)),
        radius * 1.5,
      )
    }
    signal.lightLevel = (directed.keyLightIntensity + directed.rimLightIntensity) / 4.4
  })

  return (
    <group position={[framing.stageX, framing.stageY, 0]}>
      <ambientLight intensity={0.24} color="#5e8fd1" />
      <hemisphereLight intensity={0.4} color="#82cfff" groundColor="#020814" />
      <directionalLight ref={key} position={[-radius * 2.6, radius * 2.4, radius * 3]} intensity={2.2} color="#9ec9ff" />
      <directionalLight position={[radius * 1.4, -radius * 0.4, radius * 2.6]} intensity={0.42} color="#5d93d8" />
      <directionalLight ref={rim} position={[radius * 2.4, radius * 1.5, -radius * 2.4]} intensity={1.5} color="#4ef0ff" />
      <pointLight ref={platform} position={[0, platformY + radius * 0.2, 0]} intensity={1.7 * radius} distance={radius * 7.5} color="#2fd8ff" decay={2} />
      <pointLight ref={accent} position={[0, 0, radius * 2.7]} intensity={0} distance={radius * 9} color="#63d4ff" decay={2} />
      <pointLight ref={scan} position={[0, -radius, radius * 1.5]} intensity={0} distance={radius * 3.4} color="#d6f8ff" decay={2} />
    </group>
  )
}

useGLTF.preload(BRAIN_URL, false, true)
for (const actor of ACTORS) useGLTF.preload(actor.url, false, true)
