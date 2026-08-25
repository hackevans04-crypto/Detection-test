'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import type { HeroSceneState } from '@/lib/hero/depth'
import type { Framing } from '@/lib/hero/stage'

type Quality = 'high' | 'medium' | 'low'

type Props = {
  geometry: THREE.BufferGeometry
  /** Centro de la malla: el escenario la monta desplazada por su negativo. */
  center: THREE.Vector3
  /** Radio de la malla en SUS unidades, no en las del mundo. */
  meshRadius: number
  /** Factor que lleva la malla de sus unidades a las del mundo. */
  brainScale: number
  framing: Framing
  quality: Quality
  sceneState: MutableRefObject<HeroSceneState>
}

const NODE_TARGET: Record<Quality, number> = { high: 56, medium: 40, low: 26 }
const ROUTE_TARGET: Record<Quality, number> = { high: 32, medium: 18, low: 10 }
const ARC_SLOTS = 3
/** Muestras por ruta a lo largo de la curva. */
const SEGMENTS = 26
const MAX_ROUTES = 32

/** Ruido determinista: dos capturas del mismo progreso deben ser idénticas. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uWidth;
  /** Por ruta: (velocidad, fase, longitud de estela). */
  uniform vec3 uRoute[${MAX_ROUTES}];
  attribute vec3 aTangent;
  attribute float aSide;
  attribute float aAlong;
  attribute float aRoute;
  uniform float uWidthRef;
  varying float vPulse;
  varying float vSide;
  varying float vTaper;
  varying float vEdgeOn;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);

    /*
      Cinta orientada a cámara.

      El intento anterior usaba TubeGeometry y se leía como fideo de neón. Una
      cinta de dos vértices por muestra, separada en la perpendicular de la
      vista, da un filamento fino de borde suave y cuesta la mitad de geometría.
    */
    vec3 tangent = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
    vec3 toEye = normalize(-viewPosition.xyz);
    vec3 side = normalize(cross(tangent, toEye));

    /*
      El ancho responde a la distancia.

      Separar en espacio de vista con un ancho fijo da grosor constante en el
      mundo, pero dentro del sujeto la cámara pasa muy cerca de las rutas y la
      proyección las agranda hasta leerse como cinta adhesiva plana. Se acota
      el crecimiento cerca y se impide que desaparezcan lejos, de modo que una
      misma ruta ya no tiene el mismo ancho aparente de principio a fin.
    */
    float dist = max(-viewPosition.z, 0.001);
    float widthScale = clamp(dist / uWidthRef, 0.26, 1.3);

    /*
      Afilado en los extremos: una cinta que termina en corte recto se lee como
      un trozo de cinta. Afilada, se lee como un trazo de energía.
    */
    vTaper = smoothstep(0.0, 0.14, aAlong) * smoothstep(1.0, 0.86, aAlong);

    /*
      Respuesta al ángulo de vista: una ruta vista casi de punta debe adelgazar
      y apagarse, no mantener el mismo cuerpo que una vista de perfil.
    */
    vEdgeOn = abs(dot(tangent, toEye));

    float widthEnergy = 1.0 + uEnergy * 0.16;
    viewPosition.xyz += side * aSide * uWidth * widthScale * vTaper * widthEnergy;

    vec3 route = uRoute[int(aRoute)];
    /*
      La energía del gesto acelera el impulso y alarga su estela, pero no
      mueve la narrativa ni un ápice: moverse deprisa se SIENTE distinto de
      moverse despacio sin que cambie lo que se cuenta.
    */
    float head = fract(uTime * route.x * (1.0 + uEnergy * 0.5) + route.y);
    float delta = aAlong - head;
    delta -= floor(delta + 0.5);
    float tail = route.z * (1.0 + uEnergy * 0.45);
    vPulse = delta <= 0.0 && delta > -tail ? pow(1.0 + delta / tail, 2.6) : 0.0;
    vSide = aSide;

    gl_Position = projectionMatrix * viewPosition;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uCore;
  uniform vec3 uHalo;
  varying float vPulse;
  varying float vSide;
  varying float vTaper;
  varying float vEdgeOn;

  void main() {
    // Núcleo claro y halo cian que cae suave: sin cantos, no parece un tubo.
    float across = 1.0 - abs(vSide);
    float core = pow(max(across, 0.0), 3.2);
    float halo = pow(max(across, 0.0), 0.75) * 0.34;

    vec3 color = mix(uHalo, uCore, core);
    /*
      La ruta en reposo se insinúa y el impulso manda, pero el reposo no puede
      caer tan abajo que desaparezca: el cerebro es muy luminoso y con 0,05 la
      red existía en la escena y no se veía en pantalla. Comprobado forzando el
      material a opaco.
    */
    // Vista de punta: se apaga en vez de mantener cuerpo de placa.
    float facing = 1.0 - vEdgeOn * 0.72;
    float alpha = (core * 0.92 + halo) * (0.34 + vPulse * 0.9) * uIntensity * vTaper * facing;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color * (1.15 + vPulse * 3.0), alpha);
  }
`

/**
 * Electricidad sobre la superficie real del cerebro.
 *
 * El intento anterior generaba las rutas sobre un elipsoide ajustado a la caja
 * envolvente. No funcionó por una razón geométrica: ese elipsoide cae por
 * dentro de la malla en casi todas las direcciones, así que las rutas salían
 * enterradas y sólo asomaban fragmentos —confeti—. Separarlas hacia fuera las
 * despegaba del sujeto. No hay valor bueno: la superficie de un cerebro no se
 * parece a un elipsoide.
 *
 * Aquí los nodos se muestrean de los triángulos del propio GLB, ponderados por
 * área, y se separan un 0,6 % del radio a lo largo de su normal: lo justo para
 * no pelearse con el z-buffer y seguir abrazando el pliegue.
 *
 * Coste: una llamada de dibujo para todas las rutas —cinta fusionada y un solo
 * material, con el impulso resuelto en el vértice—, una para los nodos y una
 * para los arcos.
 */
export function NeuralSurface({ geometry, center, meshRadius, brainScale, framing, quality, sceneState }: Props) {
  const group = useRef<THREE.Group>(null)
  const scaleRoot = useRef<THREE.Group>(null)
  const nodesRef = useRef<THREE.InstancedMesh>(null)
  const arcsRef = useRef<THREE.LineSegments>(null)

  const network = useMemo(() => {
    const random = seeded(20260822)
    const nodeTarget = NODE_TARGET[quality]
    const routeTarget = Math.min(ROUTE_TARGET[quality], MAX_ROUTES)

    // --- muestreo de la superficie real, ponderado por área ---
    const mesh = new THREE.Mesh(geometry)
    const sampler = new MeshSurfaceSampler(mesh)
    // El generador existe en tiempo de ejecución pero falta en los tipos de
    // esta versión de three. Sin él el muestreo usaría Math.random y dos
    // capturas del mismo progreso dejarían de ser idénticas.
    ;(sampler as unknown as { setRandomGenerator(fn: () => number): void }).setRandomGenerator(random)
    sampler.build()

    const offset = meshRadius * 0.02
    const candidatePosition = new THREE.Vector3()
    const candidateNormal = new THREE.Vector3()
    const nodes: Array<{ position: THREE.Vector3; normal: THREE.Vector3 }> = []
    // Rechazo por distancia mínima: sin él las muestras se apelotonan en las
    // caras grandes y quedan zonas del cerebro sin actividad.
    const minDistance = meshRadius * 0.26
    for (let attempt = 0; attempt < nodeTarget * 40 && nodes.length < nodeTarget; attempt += 1) {
      sampler.sample(candidatePosition, candidateNormal)
      if (nodes.some((node) => node.position.distanceTo(candidatePosition) < minDistance)) continue
      nodes.push({
        position: candidatePosition.clone().addScaledVector(candidateNormal, offset),
        normal: candidateNormal.clone(),
      })
    }

    // --- grafo: 2 a 4 vecinos, y sólo si están cerca sobre la superficie ---
    const maxEdge = meshRadius * 0.62
    const neighbours = nodes.map((node, index) => nodes
      .map((other, otherIndex) => ({ otherIndex, distance: node.position.distanceTo(other.position) }))
      .filter((entry) => entry.otherIndex !== index && entry.distance < maxEdge)
      // Una arista entre nodos de normales opuestas atravesaría el volumen.
      .filter((entry) => node.normal.dot(nodes[entry.otherIndex].normal) > 0.05)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4)
      .map((entry) => entry.otherIndex))

    // --- rutas: paseos cortos por el grafo, sin volver sobre sus pasos ---
    const routes: THREE.Vector3[][] = []
    for (let attempt = 0; attempt < routeTarget * 12 && routes.length < routeTarget; attempt += 1) {
      let current = Math.floor(random() * nodes.length)
      if (!neighbours[current]?.length) continue
      const path = [current]
      const length = 3 + Math.floor(random() * 3)
      for (let step = 0; step < length; step += 1) {
        const options = neighbours[current].filter((candidate) => !path.includes(candidate))
        if (!options.length) break
        current = options[Math.floor(random() * options.length)]
        path.push(current)
      }
      if (path.length >= 3) routes.push(path.map((index) => nodes[index].position))
    }

    return { nodes, routes, endpoints: routes.map((path) => path[path.length - 1]) }
  }, [geometry, meshRadius, quality])

  const routeParams = useMemo(() => {
    const random = seeded(77712)
    const values: THREE.Vector3[] = []
    for (let index = 0; index < MAX_ROUTES; index += 1) {
      values.push(new THREE.Vector3(
        0.06 + random() * 0.22,
        random(),
        0.1 + random() * 0.12,
      ))
    }
    return values
  }, [])

  const ribbon = useMemo(() => {
    const { routes } = network
    const vertexCount = routes.length * (SEGMENTS + 1) * 2
    const position = new Float32Array(vertexCount * 3)
    const tangent = new Float32Array(vertexCount * 3)
    const side = new Float32Array(vertexCount)
    const along = new Float32Array(vertexCount)
    const route = new Float32Array(vertexCount)
    const indices: number[] = []

    const point = new THREE.Vector3()
    const direction = new THREE.Vector3()
    let cursor = 0

    routes.forEach((path, routeIndex) => {
      const curve = new THREE.CatmullRomCurve3(path, false, 'catmullrom', 0.4)
      const base = cursor
      for (let step = 0; step <= SEGMENTS; step += 1) {
        const t = step / SEGMENTS
        curve.getPoint(t, point)
        curve.getTangent(t, direction)
        for (const edge of [-1, 1]) {
          const at = cursor * 3
          position[at] = point.x
          position[at + 1] = point.y
          position[at + 2] = point.z
          tangent[at] = direction.x
          tangent[at + 1] = direction.y
          tangent[at + 2] = direction.z
          side[cursor] = edge
          along[cursor] = t
          route[cursor] = routeIndex
          cursor += 1
        }
        if (step < SEGMENTS) {
          const a = base + step * 2
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
      }
    })

    const built = new THREE.BufferGeometry()
    built.setAttribute('position', new THREE.BufferAttribute(position, 3))
    built.setAttribute('aTangent', new THREE.BufferAttribute(tangent, 3))
    built.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
    built.setAttribute('aAlong', new THREE.BufferAttribute(along, 1))
    built.setAttribute('aRoute', new THREE.BufferAttribute(route, 1))
    built.setIndex(indices)
    return built
  }, [network])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uIntensity: { value: 1 },
      /*
        En unidades de MUNDO, no de la malla.

        La cinta se separa en espacio de vista, donde ya se ha aplicado la
        escala del grupo. Pasar aquí un valor en unidades del GLB hacía que
        el ancho dependiera de a qué escala estuviera exportado el modelo:
        o una franja enorme o algo de medio píxel. Con el radio en mundo,
        el filamento mide siempre lo mismo en pantalla.
      */
      uWidth: { value: meshRadius * brainScale * 0.0075 },
      /* Distancia de referencia del ancho: por debajo, la cinta deja de crecer. */
      uWidthRef: { value: meshRadius * brainScale * 1.6 },
      uRoute: { value: routeParams },
      uCore: { value: new THREE.Color('#e6fbff') },
      uHalo: { value: new THREE.Color('#2fa8ff') },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), [brainScale, meshRadius, routeParams])

  const arcGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_SLOTS * 2 * 3), 3))
    return geo
  }, [])

  useEffect(() => () => {
    ribbon.dispose()
    material.dispose()
    arcGeometry.dispose()
  }, [arcGeometry, material, ribbon])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])
  const rest = useMemo(() => new THREE.Color('#2f7fd8'), [])
  const flash = useMemo(() => new THREE.Color('#eafcff'), [])

  useFrame(() => {
    const signal = sceneState.current
    const directed = signal.director

    /*
      La red pertenece al exterior del sujeto. Cuando las mitades empiezan a
      separarse deja de tener superficie a la que agarrarse, así que se retira
      antes de que la separación sea visible y la energía pasa a los sistemas
      interiores. Quedarse flotando donde estaba el cerebro sería justo el
      defecto que esta reescritura viene a corregir.
    */
    const assembled = 1 - Math.min(directed.assemblyExplode * 4, 1)
    // Base de fase + un empujón muy pequeño. El cerebro no debe reventar de brillo.
    const intensity = Math.min(directed.neuralIntensity + signal.scrollEnergy * 0.08, 1) * assembled
    material.uniforms.uTime.value = signal.time
    material.uniforms.uEnergy.value = signal.scrollEnergy
    material.uniforms.uIntensity.value = intensity
    if (group.current) group.current.visible = intensity > 0.01
    if (!group.current || !group.current.visible) return

    /*
      La red viaja con el sujeto. Posición, giro y escala se leen del mismo
      estado que publica el ensamblaje, así que la electricidad respira, gira
      y flota con el cerebro en vez de quedarse clavada en el mundo.
    */
    group.current.position.fromArray(signal.brainPosition)
    group.current.rotation.set(signal.brainRotation[0], signal.brainRotation[1], signal.brainRotation[2])
    scaleRoot.current?.scale.setScalar(brainScale * directed.brainScale)

    if (nodesRef.current) {
      for (let index = 0; index < network.nodes.length; index += 1) {
        // El nodo se enciende cuando la cabeza de "su" ruta está por llegar.
        const params = routeParams[index % MAX_ROUTES]
        const head = (signal.time * params.x + params.y) % 1
        const arrival = head > 0.93 ? (head - 0.93) / 0.07 : 0
        const spike = arrival * arrival * (3 - 2 * arrival)
        dummy.position.copy(network.nodes[index].position)
        dummy.scale.setScalar(meshRadius * (0.004 + spike * 0.011))
        dummy.updateMatrix()
        nodesRef.current.setMatrixAt(index, dummy.matrix)
        tint.lerpColors(rest, flash, spike).multiplyScalar((0.3 + spike * 2.4) * intensity)
        nodesRef.current.setColorAt(index, tint)
      }
      nodesRef.current.instanceMatrix.needsUpdate = true
      if (nodesRef.current.instanceColor) nodesRef.current.instanceColor.needsUpdate = true
    }

    // Arcos sinápticos: cortos, ocasionales y sólo entre nodos realmente
    // vecinos. Nunca más de tres a la vez.
    if (arcsRef.current && quality !== 'low') {
      const array = arcGeometry.attributes.position.array as Float32Array
      let live = 0
      for (let slot = 0; slot < ARC_SLOTS; slot += 1) {
        const cycle = 2.3 + slot * 0.77
        const clock = signal.time + slot * 3.7
        const pick = Math.floor(clock / cycle)
        const a = network.nodes[Math.floor(seeded(pick * 31 + slot)() * network.nodes.length)]
        const b = network.nodes[Math.floor(seeded(pick * 57 + slot)() * network.nodes.length)]
        const at = slot * 6
        const close = a && b && a.position.distanceTo(b.position) < meshRadius * 0.5
        if (clock % cycle < 0.16 && close) {
          array[at] = a.position.x; array[at + 1] = a.position.y; array[at + 2] = a.position.z
          array[at + 3] = b.position.x; array[at + 4] = b.position.y; array[at + 5] = b.position.z
          live += 1
        } else {
          for (let i = 0; i < 6; i += 1) array[at + i] = 0
        }
      }
      arcGeometry.attributes.position.needsUpdate = true
      const arcMaterial = arcsRef.current.material as THREE.LineBasicMaterial
      arcMaterial.opacity = live ? 0.8 * intensity : 0
      arcsRef.current.visible = live > 0
    }
  })

  return (
    <group ref={group} position={[framing.stageX, framing.stageY, 0]} visible={false}>
      {/* Misma jerarquía que la malla: escala canónica y después el centro. */}
      <group ref={scaleRoot} scale={brainScale}>
        <group position={center.clone().negate()}>
        <mesh geometry={ribbon} material={material} frustumCulled={false} renderOrder={15} />
        <instancedMesh ref={nodesRef} args={[undefined, undefined, Math.max(network.nodes.length, 1)]} frustumCulled={false} renderOrder={16}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </instancedMesh>
        <lineSegments ref={arcsRef} geometry={arcGeometry} frustumCulled={false} renderOrder={16}>
          <lineBasicMaterial color="#dcf9ff" transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </lineSegments>
        </group>
      </group>
    </group>
  )
}
