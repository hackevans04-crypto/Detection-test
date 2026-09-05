'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { CONCEPTS, conceptFrame, smootherstep, stationArrival, stationRestFloor } from '@/lib/platform/timeline'
import { STATION_ANCHORS } from '@/lib/platform/camera-rail'
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

/*
  `size` medido contra la cámara real de cada estación: a ~2,1 u de
  distancia con FOV 44, el anillo de escaneo (`spread` llega a 1,7×`size`)
  ocupaba con 0,85 hasta el 85% de la altura del encuadre — un ícono a
  pantalla completa e ilegible, justo la queja de "la cámara llena la
  pantalla". Con 0,46 el anillo se queda cerca del 45%: presente, pero deja
  ver el fondo y el texto de la tarjeta a su lado.
*/
export function PlatformGlyph({ url, window: conceptWindow, position, accent, size = 0.46, sceneState }: GlyphProps) {
  const texture = useGlyphTexture(url)
  const sprite = useRef<THREE.Sprite>(null)
  const material = useRef<THREE.SpriteMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMaterial = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    const signal = sceneState.current
    const frame = conceptFrame(signal.progress, conceptWindow)
    /*
      Piso de presencia (punto 9): la estación activa sube a 1; las otras
      tres no desaparecen, se quedan en un 0,25–0,4 fijo mientras dura la
      visita interior (`stationRestFloor`). Antes cada glifo se apagaba del
      todo al ceder el turno y la sala interior quedaba vacía entre estación
      y estación — con las cuatro ancladas en su sitio del compás todo el
      tiempo, el interior se lee como una sala con cuatro puestos, no como
      una diapositiva que cambia.

      El encendido a "activo" (por encima del piso) además exige llegada real
      (`stationArrival`, punto 4): la ventana de progreso sola ya no basta
      para prender el glifo del todo, tiene que coincidir con la cámara
      realmente mirando su ancla — mismo cálculo que usa la tarjeta de texto
      en `platform-chapter.tsx`, para que los dos se enciendan juntos.
    */
    const arrival = stationArrival(signal.cameraTarget, position)
    const shown = Math.max(frame.visibility * arrival, stationRestFloor(signal.progress))

    if (sprite.current) {
      sprite.current.visible = shown > 0.004
      const t = frame.title
      const overshoot = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2)
      const breath = signal.reducedMotion ? 1 : 1 + Math.sin(signal.time * 1.6) * 0.018
      const scale = size * (0.45 + 0.55 * overshoot) * breath
      sprite.current.scale.set(scale, scale, 1)
    }
    if (material.current) material.current.opacity = shown * 0.8

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
 * Dónde se ancla cada glifo en el mundo — segunda pasada.
 *
 * Antes los cuatro vivían agrupados a un costado del cubo, porque la cámara
 * nunca dejaba de mirarlo desde fuera. Ahora que el tramo interior mete la
 * cámara dentro del núcleo, cada glifo va en su puesto del compás
 * (`STATION_ANCHORS` en `lib/platform/camera-rail.ts`: Evaluación arriba,
 * Organización a la izquierda, Análisis a la derecha, Inclusión abajo) —
 * el mismo punto al que apunta la cámara en su propia parada
 * (`STATION_EVALUATION`/`STATION_ORGANIZATION`/… en el riel), así que el
 * icono siempre cae justo donde la cámara está mirando.
 */
const ACCENTS: Record<(typeof CONCEPTS)[number]['key'], string> = {
  evaluation: '#70efff',
  organization: '#46b8ff',
  analysis: '#8c7bff',
  inclusion: '#53e0d0',
}

/** Los cuatro glifos del kit, cada uno con la ventana de su concepto. */
export function PlatformGlyphs({ sceneState }: { sceneState: PlatformStateRef }) {
  return (
    <group name="PlatformGlyphs">
      {CONCEPTS.map((concept) => (
        <PlatformGlyph
          key={concept.key}
          url={CONCEPT_GLYPHS[concept.key]}
          window={concept.window}
          position={STATION_ANCHORS[concept.key as keyof typeof STATION_ANCHORS]}
          accent={ACCENTS[concept.key]}
          sceneState={sceneState}
        />
      ))}
    </group>
  )
}

/*
  Novena pasada: la presentación por caras del cubo (`PlatformFaceGlyph`/
  `PlatformFaceGlyphs`, holograma por cara + conector + nodos orbitando) se
  eliminó junto con `CUBE_FACES`/`faceHologramWeight` en
  `lib/platform/timeline.ts` — ver el comentario junto a `PLATFORM_BEATS`.
  Los cuatro conceptos se presentan ahora una sola vez, con `PlatformGlyph`/
  `PlatformGlyphs` arriba, en las estaciones interiores.
*/
