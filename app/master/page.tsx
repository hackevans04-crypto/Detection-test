'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Vista maestra del capítulo 02 — la silueta, sin nada encima.
 *
 * Es el paso que el encargo pide antes de animar: renderizar el objeto
 * protagonista SIN texto, SIN partículas decorativas, SIN portal y SIN
 * postprocesado, y comprobar que se reconoce «plataforma → energía → cubo» de
 * un vistazo. Si la silueta no se sostiene desnuda, ningún efecto la salva.
 *
 * Vive como página del propio proyecto y no como script aparte a propósito:
 * usa el mismo `WebGLRenderer`, los mismos materiales y el mismo espacio de
 * color que la escena de producción, así que lo que se aprueba aquí es lo que
 * luego se reproduce.
 *
 * V2 corrige lo que se rechazó de la primera: el reactor ya no es una tercera
 * máquina puesta entre los dos actores —se ha metido DENTRO del cubo— y entre
 * cubo y pedestal sólo queda campo. Ver `SuspensionField`.
 */
const MODELS = '/detection-home/platform/models'

/** Ángulos de comprobación. El objeto tiene que funcionar en los tres. */
const VIEWS = {
  '34': new THREE.Vector3(0.62, 0.4, 0.86),
  front: new THREE.Vector3(0, 0.12, 1),
  side: new THREE.Vector3(1, 0.12, 0.02),
} as const

/** Centra el modelo en su propia caja y lo escala a un ancho conocido. */
function useActor(url: string, width: number) {
  const gltf = useGLTF(url, false, true) as unknown as { scene: THREE.Group }
  return useMemo(() => {
    const scene = gltf.scene.clone(true)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    scene.position.copy(center).multiplyScalar(-1)
    const wrapper = new THREE.Group()
    wrapper.add(scene)
    const longest = Math.max(size.x, size.y, size.z, 1e-4)
    wrapper.scale.setScalar(width / longest)
    return { object: wrapper, height: (size.y / longest) * width, width: (size.x / longest) * width }
  }, [gltf, width])
}

/**
 * Campo de suspensión entre el pedestal y el cubo.
 *
 * No es un cilindro sólido ni un láser: es un tronco de cono en aditivo cuyo
 * alfa cae hacia los bordes y hacia los extremos, con una vena central estrecha
 * y ruido temporal. Lo que tiene que leerse es que el cubo está sostenido por
 * algo, no que hay un tubo dibujado entre dos objetos.
 */
function SuspensionField({ from, to, radius }: { from: number; to: number; radius: number }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#4ad4ff') } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vPosition;
      void main() {
        // Caída hacia los dos extremos: el campo nace y muere en la geometría,
        // nunca corta en seco contra el pedestal ni contra el cubo.
        float ends = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.74, vUv.y);
        // Vena central: la parte que de verdad se ve como haz.
        float core = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 3.2);
        float ripple = 0.72 + 0.28 * sin(vUv.y * 26.0 - uTime * 3.1);
        float rise = 0.82 + 0.18 * sin(vUv.y * 9.0 - uTime * 1.7 + vPosition.x * 4.0);
        float alpha = ends * (core * 0.5 + 0.09) * ripple * rise;
        gl_FragColor = vec4(uColor * (0.6 + core * 0.9), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [])

  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime })
  useLayoutEffect(() => () => material.dispose(), [material])

  const height = to - from
  return (
    <mesh position={[0, from + height / 2, 0]} material={material}>
      {/* Más ancho abajo que arriba: el campo se abre desde el emisor. */}
      <cylinderGeometry args={[radius * 0.62, radius, height, 44, 1, true]} />
    </mesh>
  )
}

/**
 * Contención holográfica del cubo: ocho esquinas y aristas parciales.
 *
 * Refuerza la lectura tridimensional sin tapar los racks, que es la única razón
 * por la que existe. Una caja cian cerrada haría justo lo contrario.
 */
function Containment({ size }: { size: number }) {
  const half = size / 2
  const arm = size * 0.17
  const corners = useMemo(() => {
    const points: Array<[THREE.Vector3, THREE.Vector3]> = []
    for (let bit = 0; bit < 8; bit += 1) {
      const corner = new THREE.Vector3(
        bit & 1 ? half : -half,
        bit & 2 ? half : -half,
        bit & 4 ? half : -half,
      )
      for (const axis of ['x', 'y', 'z'] as const) {
        const end = corner.clone()
        end[axis] -= Math.sign(corner[axis]) * arm
        points.push([corner, end])
      }
    }
    return points
  }, [arm, half])

  const geometry = useMemo(() => {
    const positions: number[] = []
    for (const [a, b] of corners) positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return buffer
  }, [corners])

  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#63dcff" transparent opacity={0.34} toneMapped={false} />
    </lineSegments>
  )
}

function Master({ view }: { view: keyof typeof VIEWS }) {
  /*
    Jerarquía de radios, que es lo que se rechazó de la V1.

    El pedestal manda: 1,00 de radio de referencia. El disco que trae el propio
    GLB del cubo es estructural suyo —no se puede quitar sin romper la malla—,
    así que en vez de eliminarlo se le da su papel: anillo de levitación,
    claramente menor. Con los dos casi del mismo diámetro se leían como dos
    plataformas apiladas; con esta diferencia se lee una plataforma y un cubo
    que flota sobre ella.
  */
  const base = useActor(`${MODELS}/mechanical-base.glb`, 6.0)
  const cube = useActor(`${MODELS}/modular-cube.glb`, 2.35)
  // El reactor va DENTRO del cubo: pequeño, insinuado entre los racks.
  const core = useActor(`${MODELS}/energy-core.glb`, 0.62)
  const { gl, camera, size } = useThree()
  const stage = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1.0
    gl.outputColorSpace = THREE.SRGBColorSpace
  }, [gl])

  const baseTop = base.height / 2
  // Más aire que en la V1: el cubo tiene que sentirse suspendido, y para eso
  // hace falta ver el campo entero por debajo de su silueta.
  const gap = 1.35
  const cubeY = baseTop + gap + cube.height / 2

  /*
    Encuadre calculado, no a ojo.

    Midiendo la caja del conjunto y resolviendo la distancia contra el FOV
    vertical y el aspecto, el encuadre se mantiene aunque cambien las
    proporciones de cualquier actor — que es justo lo que pasa al sustituir un
    GLB. La holgura del 45 % cubre que la escalinata del pedestal sobresale en
    +Z y la caja no es simétrica.
  */
  useLayoutEffect(() => {
    const group = stage.current
    if (!group) return
    group.position.set(0, 0, 0)
    group.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(group)
    const center = box.getCenter(new THREE.Vector3())
    const extent = box.getSize(new THREE.Vector3())
    group.position.set(-center.x, -center.y, -center.z)

    const perspective = camera as THREE.PerspectiveCamera
    const vertical = THREE.MathUtils.degToRad(perspective.fov)
    const aspect = size.width / Math.max(size.height, 1)
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect)
    const fit = Math.max(
      extent.y / 2 / Math.tan(vertical / 2),
      Math.max(extent.x, extent.z) / 2 / Math.tan(horizontal / 2),
    ) * 1.45
    perspective.position.copy(VIEWS[view].clone().normalize().multiplyScalar(fit))
    perspective.lookAt(0, 0, 0)
    perspective.updateProjectionMatrix()

    /*
      La señal de «listo» se emite AQUÍ y no al crear el `Canvas`.

      Al crearlo, los GLB todavía están suspendidos: el arnés fotografiaba un
      lienzo vacío y encima con el aviso de compilación de Next encima. Aquí ya
      hay malla medida y cámara colocada, que es la condición real.
    */
    const timer = window.setTimeout(() => {
      ;(window as unknown as { __masterReady?: boolean }).__masterReady = true
    }, 700)
    return () => window.clearTimeout(timer)
  }, [base, camera, core, cube, size.height, size.width, view])

  return (
    <>
      {/*
        Luz de estudio, no neón por todas partes: clave fría arriba-izquierda,
        contra cian a la derecha y una luz de contacto en el emisor. El metal
        del pedestal tiene que seguir siendo metal oscuro.
      */}
      <ambientLight intensity={0.3} color="#2b4a7c" />
      <directionalLight position={[-6, 8, 5]} intensity={3.0} color="#dcecff" />
      <directionalLight position={[7, 3, -4]} intensity={2.0} color="#4fd2ff" />
      <pointLight position={[0, 0.35, 0]} intensity={7} distance={5.5} color="#3fd0ff" />

      <group ref={stage}>
        <primitive object={base.object} position={[0, 0, 0]} />
        <primitive object={cube.object} position={[0, cubeY, 0]} />
        {/* Dentro del cubo, no entre los dos objetos. */}
        <primitive object={core.object} position={[0, cubeY - cube.height * 0.06, 0]} />
        <SuspensionField from={baseTop - 0.05} to={cubeY - cube.height * 0.34} radius={0.46} />
        <Containment size={cube.width * 1.12} />
        <group position={[0, cubeY, 0]}><Containment size={cube.width * 1.12} /></group>
        {/* Onda de contacto en el emisor: donde el campo toca el pedestal. */}
        {[0.52, 0.78].map((radius, index) => (
          <mesh key={radius} position={[0, baseTop + 0.02 + index * 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius, radius + 0.02, 96]} />
            <meshBasicMaterial color="#5fdcff" transparent opacity={0.42 - index * 0.16} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </>
  )
}

export default function MasterPage() {
  const view = (typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('view') ?? '34')
    : '34') as keyof typeof VIEWS

  return (
    <main style={{ width: '100vw', height: '100vh', background: '#050d1c' }}>
      <Canvas
        camera={{ fov: 34, position: [6.4, 3.4, 8.2], near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }}
        scene={{ background: new THREE.Color('#050d1c') }}
      >
        <Suspense fallback={null}><Master view={VIEWS[view] ? view : '34'} /></Suspense>
      </Canvas>
    </main>
  )
}
