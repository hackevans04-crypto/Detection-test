'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { exteriorVisibility, type HeroSceneState } from '@/lib/hero/depth'
import { halfHeightAt, type Framing } from '@/lib/hero/stage'

type LivingLandscapeProps = {
  texture: THREE.Texture
  sceneState: MutableRefObject<HeroSceneState>
  z: number
  framing: Framing
  viewportAspect: number
  imageAspect: number
  margin?: number
  opacity?: number
  renderOrder: number
  tint: string
  offsetY?: number
  depth: number
  phase: number
  /** La placa lejana es opaca; las dos cordilleras recortadas usan su alfa. */
  transparent?: boolean
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec3 uTint;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uDepth;
  uniform float uVisibility;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
  }

  void main() {
    vec4 source = texture2D(uTexture, vUv);
    float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
    float breathe = 0.96 + sin(uTime * 0.11 + uDepth * 3.7) * 0.035;

    // Una sombra de nube muy lenta y una franja de luz lunar recorren el
    // relieve sin mover la montaña. El parallax sigue siendo geométrico.
    float cloudShadow = noise(vec2(vUv.x * 3.1 - uTime * 0.012, vUv.y * 2.2 + uDepth));
    float shadow = mix(0.88, 1.04, cloudShadow);
    float ridge = pow(max(sin(vUv.x * 8.0 - uTime * 0.16 + vUv.y * 2.4 + uDepth * 4.0), 0.0), 18.0);
    ridge *= smoothstep(0.08, 0.7, luma) * (0.03 + uDepth * 0.08);

    vec3 color = source.rgb * uTint * breathe * shadow;
    color += vec3(0.12, 0.46, 0.9) * ridge;
    float alpha = source.a * uOpacity * uVisibility;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

function coverPlate(framing: Framing, z: number, viewportAspect: number, imageAspect: number, margin: number) {
  const distance = framing.distance - z
  const frameHeight = 2 * halfHeightAt(distance) * margin
  const frameWidth = frameHeight * viewportAspect
  const byWidth = frameWidth / imageAspect
  const height = Math.max(frameHeight, byWidth)
  return [height * imageAspect, height] as [number, number]
}

/**
 * Cordillera 2.5D con iluminación atmosférica. La geometría no ondula: el
 * movimiento visible procede de la cámara, la profundidad y la luz, como en un
 * matte painting cinematográfico.
 */
export function LivingLandscape({
  texture,
  sceneState,
  z,
  framing,
  viewportAspect,
  imageAspect,
  margin = 1.5,
  opacity = 1,
  renderOrder,
  tint,
  offsetY = 0,
  depth,
  phase,
  transparent = true,
}: LivingLandscapeProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const [width, height] = coverPlate(framing, z, viewportAspect, imageAspect, margin)
  const tintColor = useMemo(() => new THREE.Color(tint), [tint])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTexture: { value: texture },
      uTint: { value: tintColor },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uDepth: { value: depth },
      uVisibility: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  }), [depth, opacity, texture, tintColor, transparent])

  useEffect(() => () => material.dispose(), [material])

  useFrame(() => {
    const signal = sceneState.current
    const visibility = exteriorVisibility(signal.progress)
    material.uniforms.uTime.value = signal.time
    material.uniforms.uVisibility.value = visibility
    if (!mesh.current) return
    mesh.current.visible = visibility > 0.005
    // El desplazamiento es menor de un píxel en reposo. El viento se lee en la
    // luz y las nubes; la montaña conserva masa y no parece gelatina.
    mesh.current.position.x = Math.sin(signal.time * (0.018 + depth * 0.006) + phase) * 0.022 * depth
      - signal.pointerX * 0.045 * depth
    mesh.current.position.y = offsetY * height
      + Math.sin(signal.time * 0.013 + phase * 1.7) * 0.012 * depth
      + signal.pointerY * 0.018 * depth
  })

  return (
    <mesh
      ref={mesh}
      position={[0, offsetY * height, z]}
      scale={[width, height, 1]}
      renderOrder={renderOrder}
      material={material}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
