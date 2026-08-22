'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { bell, exteriorVisibility, smootherstep, type HeroSceneState } from '@/lib/hero/depth'

type FogLayerProps = {
  texture: THREE.Texture
  sceneState: MutableRefObject<HeroSceneState>
  position: [number, number, number]
  scale: [number, number]
  opacity: number
  flowSpeed: [number, number]
  noiseScale: number
  distortion: number
  density: number
  scrollShift: [number, number]
  renderOrder: number
  /**
   * Cercanía a cámara, 0 (fondo) → 1,5 (delante del cerebro). Sólo escala el
   * arrastre propio de la capa: el parallax lo produce la perspectiva, no una
   * traslación por capa, que es lo que antes aplanaba la lectura.
   */
  depth: number
  /** La atmósfera exterior se apaga antes de entrar al cerebro. */
  exterior?: boolean
  /** Disolución irreversible dentro del tramo [inicio, fin]. */
  fadeOut?: readonly [number, number]
  /**
   * Ventana [entra, pico, sale] en la que esta capa está encendida.
   *
   * Sin ella la niebla vive todo el capítulo, que es lo correcto para las capas
   * de fondo. Las dos frontales la usan para cruzar la silueta en un momento
   * concreto —una durante la activación, otra durante la institución— y
   * desaparecer después: si se quedaran encendidas, lo que era un velo pasando
   * por delante se convierte en suciedad permanente sobre el sujeto.
   */
  window?: readonly [number, number, number]
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uDepthFade;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 billow = position;
    float waveA = sin(uv.x * 8.0 + uTime * 0.18);
    float waveB = sin(uv.y * 6.0 - uTime * 0.13 + uv.x * 3.0);
    billow.z += (waveA + waveB) * 0.012 * uDepthFade;
    billow.y += waveB * 0.0025 * uDepthFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(billow, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform vec2 uFlow;
  uniform float uNoise;
  uniform float uDistortion;
  uniform float uDensity;
  uniform float uProgress;
  uniform float uDepthFade;
  uniform float uExit;
  varying vec2 vUv;

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
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += noise(p) * amplitude;
      p = p * 2.03 + 17.17;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    float t = uTime;
    vec2 flow = uFlow * t;
    float coarse = fbm(vUv * uNoise + flow);
    float fine = fbm(vUv * (uNoise * 2.2) - flow * 0.63 + coarse);
    vec2 warp = vec2(coarse - 0.5, fine - 0.5) * uDistortion;
    warp += vec2(uProgress * uFlow.x * 0.24, uProgress * uFlow.y * 0.16);
    vec4 cloud = texture2D(uTexture, clamp(vUv + warp, 0.001, 0.999));

    float breathing = 0.91 + 0.09 * sin(t * 0.21 + coarse * 5.0);
    float breakup = smoothstep(0.16, 0.82, cloud.a * (0.72 + fine * 0.55));
    float feather = mix(0.18, 0.075, clamp(uDepthFade, 0.0, 1.0));
    float edge = smoothstep(0.0, feather, vUv.x) * smoothstep(0.0, feather, 1.0 - vUv.x);
    edge *= smoothstep(0.0, feather, vUv.y) * smoothstep(0.0, feather, 1.0 - vUv.y);
    float dissolveField = fine * 0.62 + coarse * 0.38;
    float dissolve = 1.0 - smoothstep(dissolveField - 0.18, dissolveField + 0.18, uExit);
    float alpha = breakup * edge * uOpacity * uDensity * breathing * dissolve;
    vec3 tint = mix(cloud.rgb, vec3(0.2, 0.55, 0.86), 0.1 + fine * 0.08);
    gl_FragColor = vec4(tint, alpha);
  }
`

export function FogCard({
  texture,
  sceneState,
  position,
  scale,
  opacity,
  flowSpeed,
  noiseScale,
  distortion,
  density,
  scrollShift,
  renderOrder,
  depth,
  exterior = false,
  fadeOut,
  window: activeWindow,
}: FogLayerProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTexture: { value: texture },
      uOpacity: { value: opacity },
      uFlow: { value: new THREE.Vector2(...flowSpeed) },
      uNoise: { value: noiseScale },
      uDistortion: { value: distortion },
      uDensity: { value: density },
      uProgress: { value: 0 },
      uDepthFade: { value: Math.min(depth / 1.5, 1) },
      uExit: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), [density, depth, distortion, flowSpeed, noiseScale, opacity, texture])

  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    const signal = sceneState.current
    const p = signal.progress
    material.uniforms.uTime.value = signal.time
    material.uniforms.uProgress.value = p
    let directedOpacity = opacity * signal.director.fogIntensity
    const exteriorWeight = exterior ? exteriorVisibility(p) : 1
    const exit = fadeOut ? smootherstep(fadeOut[0], fadeOut[1], p) : 0
    directedOpacity *= exteriorWeight * (1 - exit)
    material.uniforms.uExit.value = exit
    if (activeWindow) {
      const weight = bell(p, activeWindow[0], activeWindow[1], activeWindow[2])
      directedOpacity *= weight
    }
    material.uniforms.uOpacity.value = directedOpacity
    if (mesh.current) mesh.current.visible = directedOpacity > 0.003
    if (!mesh.current || mesh.current.visible === false) return
    // Deriva propia de la nube por el mundo, además de la deformación interna
    // del shader y del parallax de cámara: son los tres movimientos que evitan
    // que se lea como un PNG deslizándose.
    const targetX = position[0] + scrollShift[0] * p - signal.pointerX * depth * 0.12
    const targetY = position[1] + scrollShift[1] * p + signal.pointerY * depth * 0.06
    const gust = Math.sin(signal.time * 0.17 + depth * 2.1) * depth * 0.035
    const targetWindX = targetX + signal.time * 0.012 * depth + gust
    if (signal.forcedProgress !== null) {
      mesh.current.position.x = targetWindX
      mesh.current.position.y = targetY
    } else {
      const ease = 1 - Math.exp(-delta * 4.5)
      mesh.current.position.x = THREE.MathUtils.lerp(mesh.current.position.x, targetWindX, ease)
      mesh.current.position.y = THREE.MathUtils.lerp(mesh.current.position.y, targetY, ease)
    }
    const breath = 1 + Math.sin(signal.time * 0.09 + depth) * 0.006
    mesh.current.scale.set(scale[0] * breath, scale[1] / breath, 1)
  })

  return (
    <mesh ref={mesh} position={position} scale={[scale[0], scale[1], 1]} renderOrder={renderOrder} material={material}>
      <planeGeometry args={[1, 1, 24, 12]} />
    </mesh>
  )
}

/** Backwards-compatible name while the scene migrates to FogCard terminology. */
export const FogLayer = FogCard
