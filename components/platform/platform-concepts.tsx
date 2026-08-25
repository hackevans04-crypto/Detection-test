'use client'

import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CONCEPTS, conceptFrame, smoothstep } from '@/lib/platform/timeline'
import type { PlatformStateRef } from './platform-state'

const placements = [
  { position: [-2.8, 2.35, -9.2] as [number, number, number], rotation: [0, 0.18, 0] as [number, number, number], accent: '#70efff' },
  { position: [-4.1, -1.1, -9.6] as [number, number, number], rotation: [0, 0.42, 0] as [number, number, number], accent: '#46b8ff' },
  { position: [3.8, 1.1, -10.2] as [number, number, number], rotation: [0, -0.45, 0] as [number, number, number], accent: '#8c7bff' },
  { position: [1.2, -1.8, -8.8] as [number, number, number], rotation: [0, -0.12, 0] as [number, number, number], accent: '#53e0d0' },
] as const

function ConceptNode({ index, sceneState }: { index: number; sceneState: PlatformStateRef }) {
  const concept = CONCEPTS[index]
  const placement = placements[index]
  const connector = useRef<THREE.Group>(null)
  const pulse = useRef<THREE.Mesh>(null)
  const copy = useRef<HTMLElement>(null)
  const origin = useMemo(() => new THREE.Vector3(0, -0.05, -9), [])
  const destination = useMemo(() => new THREE.Vector3(...placement.position), [placement.position])
  const points = useMemo(() => [origin.clone(), origin.clone().lerp(destination, 0.45).add(new THREE.Vector3(0, index % 2 ? -0.6 : 0.6, 0)), destination], [destination, index, origin])
  const point = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const frame = conceptFrame(sceneState.current.progress, concept.window)
    if (connector.current) connector.current.visible = frame.connector > 0.002 && frame.visibility > 0.002
    if (copy.current) {
      copy.current.style.opacity = String(frame.title)
      copy.current.style.setProperty('--concept-body', String(frame.body))
    }
    if (pulse.current) {
      const curveT = frame.signal
      point.copy(origin).lerp(destination, curveT)
      point.y += Math.sin(curveT * Math.PI) * (index % 2 ? -0.55 : 0.55)
      pulse.current.position.copy(point)
      pulse.current.visible = frame.signal > 0.02 && frame.signal < 0.995
    }
    if (frame.visibility > 0.55) sceneState.current.activeConcept = concept.title
  })

  return (
    <>
      <group ref={connector} visible={false}>
        <Line points={points} color={placement.accent} lineWidth={1} transparent opacity={0.6} dashed dashSize={0.12} gapSize={0.08} />
        <mesh ref={pulse}>
          <sphereGeometry args={[0.065, 12, 12]} />
          <meshBasicMaterial color={placement.accent} toneMapped={false} />
        </mesh>
      </group>
      <Html fullscreen zIndexRange={[12, 0]}>
          <article ref={copy} className={`platform-concept platform-concept-${index + 1}`} aria-label={`${concept.title}. ${concept.description}`}>
            <span>{concept.index}</span>
            <h3>{concept.title}</h3>
            <p>{concept.description}</p>
          </article>
      </Html>
    </>
  )
}

export function PlatformTitle({ sceneState }: { sceneState: PlatformStateRef }) {
  const copy = useRef<HTMLDivElement>(null)
  useFrame(() => {
    const progress = sceneState.current.progress
    const visibility = smoothstep(0.09, 0.13, progress) * (1 - smoothstep(0.24, 0.3, progress))
    if (copy.current) copy.current.style.opacity = String(visibility)
  })
  return (
      <Html fullscreen zIndexRange={[12, 0]}>
        <div ref={copy} className="platform-world-title">
          <span>02 / Sistema integral</span>
          <h2>Plataforma</h2>
          <strong>Detection-test</strong>
          <p>Evaluación, organización, análisis e inclusión en un solo entorno.</p>
        </div>
      </Html>
  )
}

export function PlatformConcepts({ sceneState }: { sceneState: PlatformStateRef }) {
  return (
    <group name="PlatformConcepts">
      <PlatformTitle sceneState={sceneState} />
      {CONCEPTS.map((concept, index) => <ConceptNode key={concept.key} index={index} sceneState={sceneState} />)}
    </group>
  )
}
