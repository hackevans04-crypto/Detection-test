'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { PlatformStateRef } from './platform-state'

function cloud(count: number, radius: number, zCenter: number, seed: number) {
  const values = new Float32Array(count * 3)
  let value = seed >>> 0
  const random = () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 4294967296
  }
  for (let i = 0; i < count; i++) {
    const r = radius * (0.3 + random() * 0.7)
    const theta = random() * Math.PI * 2
    values[i * 3] = Math.cos(theta) * r
    values[i * 3 + 1] = (random() - 0.5) * radius * 1.2
    values[i * 3 + 2] = zCenter + Math.sin(theta) * r + (random() - 0.5) * 3
  }
  return values
}

function ParticleCloud({ sceneState, count, radius, z, size, opacity, near = false }: {
  sceneState: PlatformStateRef
  count: number
  radius: number
  z: number
  size: number
  opacity: number
  near?: boolean
}) {
  const points = useRef<THREE.Points>(null)
  const material = useRef<THREE.PointsMaterial>(null)
  const positions = useMemo(() => cloud(count, radius, z, near ? 9127 : 4103), [count, near, radius, z])

  useFrame(() => {
    const signal = sceneState.current
    if (points.current) {
      points.current.rotation.y = signal.time * (near ? -0.006 : 0.0015)
      points.current.position.x = near ? signal.pointerX * 0.18 : 0
      points.current.position.y = near ? -signal.pointerY * 0.12 : 0
    }
    if (material.current) material.current.opacity = opacity * (0.8 + signal.scrollEnergy * (near ? 0.2 : 0.06))
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={material} color={near ? '#5ee8ff' : '#2d8dff'} size={size} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

export function PlatformParticles({ sceneState }: { sceneState: PlatformStateRef }) {
  const quality = sceneState.current.quality
  return (
    <>
      <ParticleCloud sceneState={sceneState} count={quality === 'low' ? 180 : quality === 'medium' ? 360 : 620} radius={34} z={-18} size={0.045} opacity={0.42} />
      <ParticleCloud sceneState={sceneState} count={quality === 'low' ? 70 : quality === 'medium' ? 130 : 220} radius={8} z={-9} size={0.055} opacity={0.58} />
      <ParticleCloud sceneState={sceneState} count={quality === 'low' ? 28 : quality === 'medium' ? 55 : 90} radius={5.5} z={-8} size={0.075} opacity={0.66} near />
    </>
  )
}
