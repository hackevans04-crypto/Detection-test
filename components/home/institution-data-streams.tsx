'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { PHASE, smootherstep, type HeroSceneState } from '@/lib/hero/depth'
import type { Framing } from '@/lib/hero/stage'

type InstitutionDataStreamsProps = {
  radius: number
  framing: Framing
  sceneState: MutableRefObject<HeroSceneState>
}

const STREAM_COUNT = 2
const PULSES_PER_STREAM = 9
const PULSE_COUNT = STREAM_COUNT * PULSES_PER_STREAM
const FORWARD = new THREE.Vector3(0, 0, 1)

/**
 * Two spatial data paths connecting UTEQ -> brain -> Olbrox.
 *
 * The tubes use two draw calls and every moving packet shares one InstancedMesh,
 * keeping the complete institutional link to three draw calls. Animation is a
 * pure function of the authored scene progress/time, so test captures and
 * reverse scrolling reproduce the same frame.
 */
export function InstitutionDataStreams({ radius, framing, sceneState }: InstitutionDataStreamsProps) {
  const root = useRef<THREE.Group>(null)
  const pulses = useRef<THREE.InstancedMesh>(null)

  const curves = useMemo(() => {
    const r = radius
    const makeCurve = (points: Array<[number, number, number]>) => new THREE.CatmullRomCurve3(
      points.map(([x, y, z]) => new THREE.Vector3(x * r, y * r, z * r)),
      false,
      'catmullrom',
      0.46,
    )

    return [
      makeCurve([
        [-2.5, 0.42, -0.42],
        [-1.62, 0.66, -0.28],
        [-0.72, 0.26, 0.14],
        [0, 0.08, 0],
        [0.72, 0.38, 0.16],
        [1.6, 0.62, -0.22],
        [2.5, 0.36, -0.42],
      ]),
      makeCurve([
        [-2.5, -0.34, 0.2],
        [-1.64, -0.52, -0.04],
        [-0.7, -0.2, -0.36],
        [0, -0.06, 0],
        [0.74, -0.22, -0.38],
        [1.62, -0.5, -0.08],
        [2.5, -0.3, 0.2],
      ]),
    ] as const
  }, [radius])

  const tubeGeometries = useMemo(() => curves.map((curve) => (
    new THREE.TubeGeometry(curve, 72, radius * 0.006, 5, false)
  )), [curves, radius])

  const tubeMaterials = useMemo(() => [
    new THREE.MeshBasicMaterial({
      color: '#43e4ff',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
    new THREE.MeshBasicMaterial({
      color: '#907dff',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  ], [])

  const pulseGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])
  const pulseMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#dffcff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  }), [])

  const packet = useMemo(() => new THREE.Object3D(), [])
  const point = useMemo(() => new THREE.Vector3(), [])
  const tangent = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    pulses.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [])

  useEffect(() => () => {
    for (const geometry of tubeGeometries) geometry.dispose()
    for (const material of tubeMaterials) material.dispose()
    pulseGeometry.dispose()
    pulseMaterial.dispose()
  }, [pulseGeometry, pulseMaterial, tubeGeometries, tubeMaterials])

  useFrame(() => {
    const signal = sceneState.current
    const progress = signal.progress
    const streamStart = PHASE.INSTITUTION - 0.012
    const streamEnd = PHASE.PLATFORM_EXIT + 0.004
    const inWindow = progress >= streamStart && progress <= streamEnd
    const enter = smootherstep(streamStart, PHASE.INSTITUTION, progress)
    const exit = 1 - smootherstep(PHASE.PLATFORM_EXIT - 0.012, streamEnd, progress)
    const directed = THREE.MathUtils.clamp(signal.director.institutionIntensity, 0, 1)
    const intensity = inWindow ? enter * exit * directed : 0

    if (root.current) root.current.visible = intensity > 0.004
    if (intensity <= 0.004) return

    const shimmer = 0.88 + Math.sin(signal.time * 1.7 + progress * Math.PI * 2) * 0.12
    tubeMaterials[0].opacity = intensity * 0.4 * shimmer
    tubeMaterials[1].opacity = intensity * 0.32 * (1.9 - shimmer)
    pulseMaterial.opacity = intensity * 0.92

    const mesh = pulses.current
    if (!mesh) return

    const institutionProgress = smootherstep(PHASE.INSTITUTION, PHASE.PLATFORM_EXIT, progress)
    const travel = signal.time * 0.115 + institutionProgress * 1.35

    for (let index = 0; index < PULSE_COUNT; index += 1) {
      const streamIndex = index % STREAM_COUNT
      const packetIndex = Math.floor(index / STREAM_COUNT)
      const phase = packetIndex / PULSES_PER_STREAM + streamIndex * 0.055
      const t = THREE.MathUtils.euclideanModulo(travel + phase, 1)
      const curve = curves[streamIndex]

      curve.getPointAt(t, point)
      curve.getTangentAt(t, tangent).normalize()
      packet.position.copy(point)
      packet.quaternion.setFromUnitVectors(FORWARD, tangent)

      const wave = 0.5 + 0.5 * Math.sin((t * 5 + streamIndex * 0.5) * Math.PI * 2)
      const scale = radius * (0.012 + wave * 0.01) * (0.76 + intensity * 0.24)
      packet.scale.set(scale * 0.82, scale * 0.82, scale * (1.5 + wave * 0.8))
      packet.updateMatrix()
      mesh.setMatrixAt(index, packet.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group
      ref={root}
      name="InstitutionDataStreams"
      position={[framing.stageX, framing.stageY, 0]}
      visible={false}
      renderOrder={15}
    >
      <mesh geometry={tubeGeometries[0]} material={tubeMaterials[0]} dispose={null} />
      <mesh geometry={tubeGeometries[1]} material={tubeMaterials[1]} dispose={null} />
      <instancedMesh
        ref={pulses}
        args={[pulseGeometry, pulseMaterial, PULSE_COUNT]}
        frustumCulled={false}
        dispose={null}
      />
    </group>
  )
}
