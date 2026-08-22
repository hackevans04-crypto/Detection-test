'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { bell, type HeroSceneState } from '@/lib/hero/depth'

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
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
    float alpha = breakup * edge * uOpacity * uDensity * breathing;
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
    if (activeWindow) {
      const weight = bell(p, activeWindow[0], activeWindow[1], activeWindow[2])
      directedOpacity *= weight
      if (mesh.current) mesh.current.visible = weight > 0.004
    } else if (mesh.current) {
      mesh.current.visible = true
    }
    material.uniforms.uOpacity.value = directedOpacity
    if (!mesh.current || mesh.current.visible === false) return
    // Deriva propia de la nube por el mundo, además de la deformación interna
    // del shader y del parallax de cámara: son los tres movimientos que evitan
    // que se lea como un PNG deslizándose.
    const targetX = position[0] + scrollShift[0] * p - signal.pointerX * depth * 0.12
    const targetY = position[1] + scrollShift[1] * p + signal.pointerY * depth * 0.06
    const ease = 1 - Math.exp(-delta * 4.5)
    mesh.current.position.x = THREE.MathUtils.lerp(mesh.current.position.x, targetX, ease)
    mesh.current.position.y = THREE.MathUtils.lerp(mesh.current.position.y, targetY, ease)
  })

  return (
    <mesh ref={mesh} position={position} scale={[scale[0], scale[1], 1]} renderOrder={renderOrder} material={material}>
      <planeGeometry args={[1, 1, 24, 12]} />
    </mesh>
  )
}

/** Backwards-compatible name while the scene migrates to FogCard terminology. */
export const FogLayer = FogCard
