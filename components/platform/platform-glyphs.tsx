'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CONCEPTS, conceptFrame, smootherstep } from '@/lib/platform/timeline'
import { CONCEPT_GLYPHS, assetExists } from '@/lib/platform/hud'
import type { PlatformStateRef } from './platform-state'

function useGlyphTexture(url: string) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    let alive = true
    let loaded: THREE.Texture | null = null
    assetExists(url).then((exists) => {
      if (!alive || !exists) return
      new THREE.TextureLoader().load(url, (result) => {
        if (!alive) {
          result.dispose()
          return
        }
        result.colorSpace = THREE.SRGBColorSpace
        result.anisotropy = 4
        loaded = result
        setTexture(result)
      })
    })
    return () => {
      alive = false
      loaded?.dispose()
    }
  }, [url])

  return texture
}

type GlyphProps = {
  url: string
  window: readonly number[]
  position: [number, number, number]
  accent: string
  size?: number
  sceneState: PlatformStateRef
}

export function PlatformGlyph({ url, window: conceptWindow, position, accent, size = 0.85, sceneState }: GlyphProps) {
  const texture = useGlyphTexture(url)
  const sprite = useRef<THREE.Sprite>(null)
  const material = useRef<THREE.SpriteMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    const signal = sceneState.current
    const frame = conceptFrame(signal.progress, conceptWindow)
    const shown = frame.visibility

    if (sprite.current) {
      sprite.current.visible = shown > 0.004
      const t = frame.title
      const overshoot = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)
      const breath = signal.reducedMotion ? 1 : 1 + Math.sin(signal.time * 1.6) * 0.018
      const scale = size * (0.45 + 0.55 * overshoot) * breath
      sprite.current.scale.set(scale, scale, 1)
    }
    if (material.current) material.current.opacity = shown * 0.92

    if (ring.current && ringMaterial.current) {
      const scan = smootherstep(0, 0.42, frame.local) * (1 - smootherstep(0.42, 0.78, frame.local))
      const spread = 0.55 + smootherstep(0, 0.6, frame.local) * 1.15
      ring.current.visible = scan > 0.006 && shown > 0.004
      ring.current.scale.setScalar(spread * size)
      // Mira a la camara igual que el glifo: es una malla, y sin orientarla se veia
      // en escorzo, como una elipse tumbada alrededor de un icono de frente.
      ring.current.quaternion.copy(state.camera.quaternion)
      ringMaterial.current.opacity = scan * shown * 0.5
    }
  })

  return (
    <group position={position}>
      {texture && (
        <sprite ref={sprite} visible={false} renderOrder={20}>
          <spriteMaterial
            ref={material}
            map={texture}
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      )}
      <mesh ref={ring} visible={false} renderOrder={19}>
        <torusGeometry args={[0.62, 0.008, 8, 72]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color={accent}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

/**
 * Donde se ancla cada glifo en el mundo.
 *
 * Los cuatro viven en el costado por el que pasa la camara durante todo el
 * tramo de lectura (siempre desde -x), escalonados en altura y profundidad para
 * que no se solapen entre ellos. Ninguno se mete en el volumen del cubo, que
 * ocupa x +/-1,3, ni en el de sus capas abiertas.
 *
 * Y todos van CERCA, a dos unidades del costado: a tres ya se salian del
 * encuadre por la izquierda, porque la camara mira al cubo muy escorada.
 *
 * Ninguno cae donde va su tarjeta: las tarjetas se colocan a la derecha de la
 * pantalla (.platform-concept), asi que el icono queda junto al cubo y el texto
 * al margen, sin pisarse.
 */
const PLACEMENTS: Array<{ position: [number, number, number]; accent: string }> = [
  { position: [-1.95, 1.85, -8.2], accent: '#70efff' },
  { position: [-2.05, -1.55, -8.45], accent: '#46b8ff' },
  { position: [-2.1, 1.75, -9.85], accent: '#8c7bff' },
  { position: [-1.95, -1.45, -10.1], accent: '#53e0d0' },
]

/** Los cuatro glifos del kit, cada uno con la ventana de su concepto. */
export function PlatformGlyphs({ sceneState }: { sceneState: PlatformStateRef }) {
  return (
    <group name="PlatformGlyphs">
      {CONCEPTS.map((concept, index) => (
        <PlatformGlyph
          key={concept.key}
          url={CONCEPT_GLYPHS[concept.key]}
          window={concept.window}
          position={PLACEMENTS[index].position}
          accent={PLACEMENTS[index].accent}
          sceneState={sceneState}
        />
      ))}
    </group>
  )
}
