'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { bell, smoothstep, type HeroSceneState } from '@/lib/hero/depth'
import { halfHeightAt, type Framing } from '@/lib/hero/stage'

type SceneStateRef = MutableRefObject<HeroSceneState>
type Quality = 'high' | 'medium' | 'low'

const moonVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const moonFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    for (int i = 0; i < 5; i++) {
      value += noise(p) * amplitude;
      p = p * 2.07 + 11.13;
      amplitude *= 0.49;
    }
    return value;
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(-vViewPosition);
    vec3 lightDirection = normalize(vec3(-0.78, 0.34, 0.82));
    float diffuse = dot(normal, lightDirection);
    float terminator = smoothstep(-0.2, 0.56, diffuse);

    float terrain = fbm(vUv * vec2(20.0, 10.0));
    float detail = fbm(vUv * vec2(58.0, 29.0) + terrain * 2.4);
    float basinA = 1.0 - smoothstep(0.035, 0.085, distance(vUv, vec2(0.32, 0.67)));
    float basinB = 1.0 - smoothstep(0.025, 0.072, distance(vUv, vec2(0.67, 0.42)));
    float basinC = 1.0 - smoothstep(0.018, 0.052, distance(vUv, vec2(0.55, 0.76)));
    float craters = basinA * 0.24 + basinB * 0.18 + basinC * 0.16;

    vec3 shadow = vec3(0.018, 0.055, 0.12);
    vec3 stone = mix(vec3(0.31, 0.42, 0.57), vec3(0.72, 0.84, 0.93), terrain);
    stone *= 0.78 + detail * 0.34 - craters;
    vec3 color = mix(shadow, stone, terminator);

    float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.1);
    float livingLight = 0.94 + 0.06 * sin(uTime * 0.72);
    color += vec3(0.18, 0.58, 1.1) * rim * (0.68 + uIntensity * 0.62);
    color *= livingLight * uIntensity;
    gl_FragColor = vec4(color, 1.0);
  }
`

const starVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uVisibility;
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  varying float vPulse;
  varying vec3 vColor;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float fastPulse = sin(uTime * (1.15 + aPhase * 0.9) + aPhase * 31.4159);
    float slowPulse = sin(uTime * 0.31 + aPhase * 13.7);
    vPulse = clamp(0.62 + fastPulse * 0.25 + slowPulse * 0.13, 0.18, 1.0) * uVisibility;
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio * (112.0 / max(-viewPosition.z, 1.0)) * (0.76 + vPulse * 0.46);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const starFragmentShader = /* glsl */ `
  varying float vPulse;
  varying vec3 vColor;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    float core = smoothstep(0.5, 0.035, radius);
    float horizontal = exp(-abs(point.y) * 42.0) * smoothstep(0.5, 0.04, abs(point.x));
    float vertical = exp(-abs(point.x) * 42.0) * smoothstep(0.5, 0.04, abs(point.y));
    float alpha = (core + (horizontal + vertical) * 0.33) * vPulse;
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(vColor * (0.72 + vPulse * 0.78), alpha);
  }
`

function makeGlowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(205,241,255,.96)')
  gradient.addColorStop(0.16, 'rgba(106,196,255,.48)')
  gradient.addColorStop(0.48, 'rgba(47,127,255,.14)')
  gradient.addColorStop(1, 'rgba(11,49,140,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeMeteorTexture() {
  const width = 256
  const height = 32
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    const vertical = Math.exp(-Math.abs(y / (height - 1) - 0.5) * 13)
    for (let x = 0; x < width; x += 1) {
      const along = Math.pow(x / (width - 1), 2.25)
      const alpha = Math.min(1, vertical * along * 1.32)
      const offset = (y * width + x) * 4
      pixels.data[offset] = 226
      pixels.data[offset + 1] = 248
      pixels.data[offset + 2] = 255
      pixels.data[offset + 3] = Math.round(alpha * 255)
    }
  }
  context.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function Moon({ sceneState, framing }: { sceneState: SceneStateRef; framing: Framing }) {
  const group = useRef<THREE.Group>(null)
  const surface = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Sprite>(null)
  const light = useRef<THREE.DirectionalLight>(null)
  const texture = useMemo(makeGlowTexture, [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
    },
    vertexShader: moonVertexShader,
    fragmentShader: moonFragmentShader,
    toneMapped: false,
  }), [])

  useEffect(() => () => {
    texture.dispose()
    material.dispose()
  }, [material, texture])

  const z = -31.2
  const distance = framing.distance - z
  const halfHeight = halfHeightAt(distance)
  const radius = halfHeight * 0.105
  const position = useMemo<[number, number, number]>(() => [halfHeight * 0.98, halfHeight * 0.48, z], [halfHeight])

  useFrame(() => {
    const signal = sceneState.current
    const opening = 1 - smoothstep(0.22, 0.47, signal.progress)
    const returnWeight = bell(signal.progress, 0.77, 0.86, 0.94) * 0.46
    const visibility = Math.max(opening, returnWeight)
    const pulse = 0.96 + Math.sin(signal.time * 0.58) * 0.04
    material.uniforms.uTime.value = signal.time
    material.uniforms.uIntensity.value = visibility * (1.05 + pulse * 0.08)

    if (group.current) {
      group.current.visible = visibility > 0.008
      group.current.position.x = position[0] - signal.pointerX * radius * 0.17
      group.current.position.y = position[1] + signal.pointerY * radius * 0.1 + Math.sin(signal.time * 0.11) * radius * 0.025
      group.current.rotation.z = -0.08 + Math.sin(signal.time * 0.08) * 0.012
    }
    if (surface.current) {
      surface.current.rotation.y = signal.time * 0.014 + signal.progress * 0.16
      surface.current.rotation.x = -0.09 + Math.sin(signal.time * 0.12) * 0.012
    }
    if (glow.current) {
      const spriteMaterial = glow.current.material as THREE.SpriteMaterial
      spriteMaterial.opacity = visibility * (0.36 + pulse * 0.13)
      glow.current.scale.setScalar(radius * (3.25 + pulse * 0.12))
    }
    if (light.current) light.current.intensity = visibility * (0.46 + pulse * 0.08)
  })

  return (
    <group ref={group} position={position} renderOrder={2}>
      <sprite ref={glow} position={[0, 0, -0.7]} scale={[radius * 3.3, radius * 3.3, 1]} renderOrder={2}>
        <spriteMaterial map={texture} color="#66baff" transparent opacity={0.46} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh ref={surface} material={material} renderOrder={3}>
        <sphereGeometry args={[radius, 64, 48]} />
      </mesh>
      <directionalLight ref={light} color="#83bfff" position={[-radius * 4, radius * 2.5, radius * 5]} intensity={0.52} />
    </group>
  )
}

function LivingStars({ sceneState, framing, quality }: { sceneState: SceneStateRef; framing: Framing; quality: Quality }) {
  const points = useRef<THREE.Points>(null)
  const count = quality === 'high' ? 260 : quality === 'medium' ? 160 : 88
  const { positions, phases, sizes, colors } = useMemo(() => {
    const nextPositions = new Float32Array(count * 3)
    const nextPhases = new Float32Array(count)
    const nextSizes = new Float32Array(count)
    const nextColors = new Float32Array(count * 3)
    const random = (index: number) => {
      const value = Math.sin((index + 71) * 91.773) * 43758.5453
      return value - Math.floor(value)
    }
    const palette = [new THREE.Color('#b9eaff'), new THREE.Color('#72baff'), new THREE.Color('#ecf9ff'), new THREE.Color('#8b92ff')]
    for (let index = 0; index < count; index += 1) {
      nextPositions[index * 3] = (random(index * 7 + 1) - 0.5) * 63
      nextPositions[index * 3 + 1] = -1 + random(index * 7 + 2) * 29
      nextPositions[index * 3 + 2] = -29.2 - random(index * 7 + 3) * 3.2
      nextPhases[index] = random(index * 7 + 4)
      nextSizes[index] = 0.72 + Math.pow(random(index * 7 + 5), 3) * 2.9
      const color = palette[Math.floor(random(index * 7 + 6) * palette.length)]
      nextColors[index * 3] = color.r
      nextColors[index * 3 + 1] = color.g
      nextColors[index * 3 + 2] = color.b
    }
    return { positions: nextPositions, phases: nextPhases, sizes: nextSizes, colors: nextColors }
  }, [count])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uVisibility: { value: 1 },
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const signal = sceneState.current
    const opening = 1 - smoothstep(0.26, 0.49, signal.progress)
    const returnWeight = bell(signal.progress, 0.77, 0.86, 0.94) * 0.55
    const visibility = Math.max(opening, returnWeight)
    material.uniforms.uTime.value = signal.time
    material.uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 1.5)
    material.uniforms.uVisibility.value = visibility
    if (points.current) {
      points.current.visible = visibility > 0.006
      points.current.position.x = -signal.pointerX * halfHeightAt(framing.distance + 30) * 0.018
      points.current.position.y = signal.pointerY * 0.08
      points.current.rotation.z = Math.sin(signal.time * 0.018) * 0.004
    }
  })

  return (
    <points ref={points} material={material} frustumCulled={false} renderOrder={2}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
      </bufferGeometry>
    </points>
  )
}

type MeteorDefinition = {
  at: number
  period: number
  duration: number
  start: [number, number, number]
  travel: [number, number, number]
  length: number
  color: string
}

const METEORS: readonly MeteorDefinition[] = [
  { at: 1.0, period: 6.8, duration: 0.95, start: [11.5, 10.2, -28.6], travel: [-10.5, -5.6, 0.2], length: 3.8, color: '#d9fbff' },
  { at: 3.45, period: 8.9, duration: 1.18, start: [-4.5, 12.7, -30.1], travel: [8.4, -4.1, 0.4], length: 3.1, color: '#7ce7ff' },
  { at: 5.35, period: 10.7, duration: 0.86, start: [18.4, 7.6, -29.4], travel: [-7.2, -3.8, 0.3], length: 2.7, color: '#a9bfff' },
]

function ShootingStars({ sceneState, quality }: { sceneState: SceneStateRef; quality: Quality }) {
  const groups = useRef<Array<THREE.Group | null>>([])
  const trails = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const heads = useRef<Array<THREE.SpriteMaterial | null>>([])
  const texture = useMemo(makeGlowTexture, [])
  const trailTexture = useMemo(makeMeteorTexture, [])
  const definitions = quality === 'low' ? METEORS.slice(0, 1) : quality === 'medium' ? METEORS.slice(0, 2) : METEORS
  const paths = useMemo(() => definitions.map((meteor) => {
    const direction = new THREE.Vector3(...meteor.travel).normalize()
    return {
      direction,
      angle: Math.atan2(direction.y, direction.x),
      start: new THREE.Vector3(...meteor.start),
      travel: new THREE.Vector3(...meteor.travel),
    }
  }), [definitions])

  useEffect(() => () => {
    texture.dispose()
    trailTexture.dispose()
  }, [texture, trailTexture])

  useFrame(() => {
    const signal = sceneState.current
    const skyVisibility = 1 - smoothstep(0.2, 0.42, signal.progress)
    definitions.forEach((meteor, index) => {
      const group = groups.current[index]
      if (!group) return
      const shifted = signal.time - meteor.at
      const localTime = shifted < 0 ? meteor.period + (shifted % meteor.period) : shifted % meteor.period
      const active = localTime >= 0 && localTime <= meteor.duration
      const travelProgress = active ? localTime / meteor.duration : 0
      const alpha = active ? bell(travelProgress, 0, 0.22, 1) * skyVisibility : 0
      group.visible = alpha > 0.006
      if (!group.visible) return
      group.position.copy(paths[index].start).addScaledVector(paths[index].travel, travelProgress)
      group.rotation.z = paths[index].angle
      const trail = trails.current[index]
      if (trail) trail.opacity = alpha * 0.78
      const head = heads.current[index]
      if (head) head.opacity = alpha
    })
  })

  return (
    <group renderOrder={4}>
      {definitions.map((meteor, index) => (
        <group
          key={`${meteor.at}-${meteor.period}`}
          ref={(node) => { groups.current[index] = node }}
          visible={false}
        >
          <mesh position={[-meteor.length * 0.5, 0, 0]} scale={[meteor.length, 0.055, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              ref={(node) => { trails.current[index] = node }}
              map={trailTexture}
              color={meteor.color}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <sprite scale={[0.34, 0.34, 1]}>
            <spriteMaterial
              ref={(node) => { heads.current[index] = node }}
              map={texture}
              color={meteor.color}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        </group>
      ))}
    </group>
  )
}

/**
 * Cielo vivo de la primera impresión. Todos los movimientos leen el mismo reloj
 * reversible de la escena; el scroll sólo decide cuándo el cielo cede el plano
 * al cerebro y a la cámara interior.
 */
export function CinematicSky({ sceneState, framing, quality }: { sceneState: SceneStateRef; framing: Framing; quality: Quality }) {
  return (
    <>
      <LivingStars sceneState={sceneState} framing={framing} quality={quality} />
      <Moon sceneState={sceneState} framing={framing} />
      <ShootingStars sceneState={sceneState} quality={quality} />
    </>
  )
}
