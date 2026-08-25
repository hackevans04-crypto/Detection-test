'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { smoothstep } from '@/lib/platform/timeline'
import { PlatformCast } from './platform-cast'
import { PlatformGlyphs } from './platform-glyphs'
import { PlatformParticles } from './platform-particles'
import type { PlatformStateRef } from './platform-state'

function HandoffSignal({ sceneState }: { sceneState: PlatformStateRef }) {
  const group = useRef<THREE.Group>(null)
  const pathMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const particles = useRef<THREE.InstancedMesh>(null)
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -1.18, -2.5),
    new THREE.Vector3(-0.34, -1.25, -3.8),
    new THREE.Vector3(0.26, -1.42, -5.15),
    new THREE.Vector3(-0.12, -1.62, -6.65),
    new THREE.Vector3(0, -1.78, -8.35),
  ], false, 'centripetal', 0.5), [])
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 72, 0.012, 6, false), [curve])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const signal = sceneState.current
    const visibility = smoothstep(0.002, 0.025, signal.progress) * (1 - smoothstep(0.17, 0.24, signal.progress))
    if (group.current) group.current.visible = visibility > 0.004
    if (pathMaterial.current) pathMaterial.current.opacity = visibility * 0.34
    if (!particles.current || visibility <= 0.004) return
    const count = particles.current.count
    for (let index = 0; index < count; index += 1) {
      const travel = (index / count + signal.progress * 1.7 + signal.time * 0.018) % 1
      const point = curve.getPoint(travel)
      dummy.position.copy(point)
      dummy.scale.setScalar((0.7 + Math.sin((travel + signal.time * 0.05) * Math.PI * 2) * 0.22) * visibility)
      dummy.updateMatrix()
      particles.current.setMatrixAt(index, dummy.matrix)
    }
    particles.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry}>
        <meshBasicMaterial ref={pathMaterial} color="#48dfff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <instancedMesh ref={particles} args={[undefined, undefined, 24]} frustumCulled={false}>
        <sphereGeometry args={[0.035, 6, 6]} />
        <meshBasicMaterial color="#c8fbff" transparent opacity={0.88} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function PlatformLighting({ sceneState }: { sceneState: PlatformStateRef }) {
  const cyan = useRef<THREE.PointLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  const accent = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const signal = sceneState.current
    const inside = smoothstep(0.56, 0.68, signal.progress) * (1 - smoothstep(0.84, 0.92, signal.progress))
    if (cyan.current) cyan.current.intensity = (3.1 + signal.reactorWeight * 1.7 + Math.sin(signal.time * 1.1) * 0.12) * (1 - inside * 0.28)
    if (rim.current) {
      rim.current.position.x = Math.sin(signal.time * 0.12) * 7
      rim.current.position.z = -7 + Math.cos(signal.time * 0.12) * 5
    }
    if (accent.current) {
      accent.current.position.x = Math.sin(signal.time * 0.28) * 4.6
      accent.current.position.y = 1.4 + Math.cos(signal.time * 0.21) * 1.1
      accent.current.position.z = -9 + Math.cos(signal.time * 0.28) * 4.6
    }
  })
  return (
    <>
      {/*
        Los cuatro modelos son metal casi puro con el color en sus texturas, así
        que casi todo lo que se ve de ellos es reflejo. La luz directa apenas les
        llega: lo que los dibuja es el entorno —ver `<Environment>` abajo— y
        estas luces sólo modelan el volumen y separan el sujeto del fondo.
      */}
      <ambientLight intensity={0.3} color="#6f8ba8" />
      <hemisphereLight intensity={0.62} color="#dcefff" groundColor="#08111f" />
      <directionalLight position={[-5, 7, 1]} intensity={2.6} color="#dceaff" />
      <directionalLight position={[5, 1.5, 1]} intensity={1.35} color="#89a8c8" />
      <directionalLight ref={rim} position={[5, 2, -12]} intensity={2.9} color="#2fd6ff" />
      <pointLight ref={cyan} position={[0, 0, -9]} intensity={3.1} distance={12} color="#38e2ff" decay={2} />
      <pointLight ref={accent} position={[3.2, 1.2, -8]} intensity={1.9} distance={8} color="#9ad6ff" decay={2} />
      <pointLight position={[3.2, -1.2, -8]} intensity={1.9} distance={9} color="#ff9448" decay={2} />
      {/* Contraluz bajo la base: le da canto al podio y despega el cubo del fondo. */}
      <pointLight position={[0, -3.9, -11.5]} intensity={1.7} distance={11} color="#1f9fff" decay={2} />
    </>
  )
}

function PlatformExposure({ sceneState }: { sceneState: PlatformStateRef }) {
  const { gl } = useThree()
  useFrame(() => {
    const progress = sceneState.current.progress
    const inside = smoothstep(0.56, 0.68, progress) * (1 - smoothstep(0.84, 0.92, progress))
    gl.toneMappingExposure = THREE.MathUtils.lerp(0.98, 1.12, smoothstep(0, 0.2, progress)) - inside * 0.02
  }, -40)
  return null
}

function PlatformLayer({ sceneState }: { sceneState: PlatformStateRef }) {
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    if (root.current) root.current.visible = sceneState.current.progress > 0.001
  }, -80)
  return (
    <group ref={root} visible={false}>
      <PlatformLighting sceneState={sceneState} />
      <HandoffSignal sceneState={sceneState} />
      <PlatformParticles sceneState={sceneState} />
      <PlatformCast sceneState={sceneState} />
      <PlatformGlyphs sceneState={sceneState} />
    </group>
  )
}

export function PlatformWorldContent({ sceneState }: { sceneState: PlatformStateRef }) {
  return (
    <>
      {/*
        El entorno ES la iluminación de este capítulo.

        Estaba a 128 px con tres rectángulos tenues, y sobre metal eso da un
        reflejo casi negro: los modelos salían apagados por más luces directas
        que se pusieran. Se sube la resolución y se rodea el escenario —clave
        fría arriba, relleno cálido abajo, dos costados y un techo— para que
        haya algo que reflejar mire donde mire la cámara, que es lo que da color
        y volumen a una chapa metálica.
      */}
      <Environment resolution={256} background={false}>
        <Lightformer form="rect" intensity={3.6} color="#e8f4ff" position={[-4, 6, -4]} rotation={[0.35, 0.55, 0]} scale={[9, 4, 1]} />
        <Lightformer form="rect" intensity={2.5} color="#46d8ff" position={[6, 1.5, -10]} rotation={[0, -0.9, 0]} scale={[7, 4, 1]} />
        <Lightformer form="rect" intensity={2} color="#6fa8ff" position={[-6, 0.5, -12]} rotation={[0, 0.9, 0]} scale={[7, 4, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#cfe6ff" position={[0, 7, -9]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 6, 1]} />
        <Lightformer form="ring" intensity={2} color="#ff9a4d" position={[0, -4.5, -8]} rotation={[Math.PI / 2, 0, 0]} scale={4.2} />
      </Environment>
      <PlatformExposure sceneState={sceneState} />
      <PlatformLayer sceneState={sceneState} />
    </>
  )
}
