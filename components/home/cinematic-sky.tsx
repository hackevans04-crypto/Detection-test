'use client'

import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { PHASE, bell, smoothstep, type HeroSceneState, at, inside, until } from '@/lib/hero/depth'
import { halfHeightAt, type Framing } from '@/lib/hero/stage'

type SceneStateRef = MutableRefObject<HeroSceneState>
type Quality = 'high' | 'medium' | 'low'

/** Albedo lunar equirectangular. Es también el mapa de altura: en la Luna los
 *  mares son a la vez lo oscuro y lo hundido, así que el mismo gradiente sirve
 *  para pintar y para inclinar la normal. */
const MOON_MAP = '/detection-home/hero/textures/moon-color.jpg'

const moonVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;

    /*
      Marco tangente analítico.

      La textura es equirectangular sobre una esfera, así que +u apunta siempre
      al este y +v al norte y ambos se despejan del propio normal. Sale exacto
      y —al contrario que dFdx— no depende de ninguna extensión de GLSL.
    */
    vec3 axis = abs(normal.y) > 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 east = normalize(cross(axis, normal));
    vNormal = normalize(normalMatrix * normal);
    vTangent = normalize(normalMatrix * east);
    vBitangent = normalize(normalMatrix * cross(normal, east));

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const moonFragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uStep;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uExposure;
  uniform float uRelief;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uEarthshine;
  uniform vec3 uRimColor;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec3 vViewPosition;

  float elevation(vec2 uv) {
    return dot(texture2D(uMap, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec3 albedo = texture2D(uMap, vUv).rgb;

    // Relieve por diferencias finitas sobre el propio mapa. El paso es de
    // varios téxeles a propósito: a este tamaño en pantalla la luna se ve muy
    // minificada y un paso de un téxel se lo comería el mipmap.
    float slopeEast = elevation(vUv + vec2(uStep.x, 0.0)) - elevation(vUv - vec2(uStep.x, 0.0));
    float slopeNorth = elevation(vUv + vec2(0.0, uStep.y)) - elevation(vUv - vec2(0.0, uStep.y));
    vec3 geometric = normalize(vNormal);
    vec3 relief = normalize(geometric - (normalize(vTangent) * slopeEast + normalize(vBitangent) * slopeNorth) * uRelief);
    vec3 viewDirection = normalize(-vViewPosition);

    /*
      El terminador lo dicta la esfera, no el mapa.

      El mapa es albedo: dejar que su ruido decidiera dónde acaba el día
      convertía el borde en un arrecife de coral. Sólo entra un tercio del
      relieve, lo justo para que el corte no sea un arco de compás.
    */
    float incidence = dot(normalize(mix(geometric, relief, 0.34)), uSunDirection);

    // Sin atmósfera el corte es casi seco; lo único que lo suaviza es el medio
    // grado que mide el disco solar.
    float day = smoothstep(-0.05, 0.24, incidence);

    // El sombreado de los cráteres sí lee el relieve completo.
    float exitance = max(dot(geometric, viewDirection), 0.0);

    /*
      Lommel–Seeliger, no Lambert.

      El regolito retrodispersa: por eso la Luna llena se ve como un disco
      plano y luminoso hasta el mismo borde y no como una esfera que se apaga
      hacia los lados. Es el detalle que separa una luna de una bola gris.
    */
    float mu0 = max(dot(relief, uSunDirection), 0.0);
    // El suelo de 0.22 es obligatorio: en el limbo la salida tiende a cero y la
    // ley se dispara a uno, así que cualquier grano del relieve se encendía del
    // todo y el borde se leía como un arrecife.
    float backscatter = mu0 / (mu0 + max(exitance, 0.22));
    float sunlight = day * (backscatter * 1.62 + mu0 * 0.3);

    vec3 color = albedo * uSunColor * sunlight * uExposure;

    // Luz cenicienta: el lado en sombra recoge el azul del cielo del capítulo
    // en vez de morder un agujero negro sobre las estrellas.
    color += albedo * uEarthshine * (0.16 + 0.5 * (1.0 - day));

    // El limbo se ata a la paleta fría de la escena. Va sobre la normal
    // geométrica, no sobre la del relieve, o el borde hierve.
    float limb = pow(1.0 - max(dot(geometric, viewDirection), 0.0), 3.0);
    color += uRimColor * limb * (0.1 + 0.5 * day);

    // La misma respiración lenta que llevan el halo y la luz de relleno.
    color *= 0.965 + 0.035 * sin(uTime * 0.62);

    gl_FragColor = vec4(color, uOpacity);
  }
`

const starVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uVisibility;
  uniform float uSpread;
  attribute float aOrbit;
  attribute float aAngle;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  varying float vPulse;
  varying vec3 vColor;
  varying float vFlare;

  void main() {
    /*
      La órbita es la firma del campo: todas las estrellas giran alrededor del
      mismo eje —el que pasa por el cerebro— y las de fuera lo hacen más
      deprisa, así que el cielo entero se cizalla en espiral en vez de girar
      como un disco rígido. El radio llega normalizado y lo escala uSpread, de
      modo que redimensionar la ventana no reconstruye ningún búfer ni salta
      la posición de una sola estrella.
    */
    float radius = aOrbit * uSpread;
    float angle = aAngle + uTime * aSpeed;
    vec3 orbited = vec3(sin(angle) * radius, cos(angle) * radius, position.z);

    vec4 viewPosition = modelViewMatrix * vec4(orbited, 1.0);
    float fastPulse = sin(uTime * (1.15 + aPhase * 0.9) + aPhase * 31.4159);
    float slowPulse = sin(uTime * 0.31 + aPhase * 13.7);
    vPulse = clamp(0.62 + fastPulse * 0.25 + slowPulse * 0.13, 0.18, 1.0) * uVisibility;
    vColor = aColor;
    // Las puntas sólo las llevan las grandes; en una estrella de tres píxeles
    // serían una cruz de aliasing.
    vFlare = smoothstep(3.4, 6.4, aSize);
    gl_PointSize = aSize * uPixelRatio * (112.0 / max(-viewPosition.z, 1.0)) * (0.76 + vPulse * 0.46);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const starFragmentShader = /* glsl */ `
  varying float vPulse;
  varying vec3 vColor;
  varying float vFlare;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distance = length(point) * 2.0;
    if (distance > 1.0) discard;

    // El perfil del original: núcleo blanco diminuto, halo de color que cae muy
    // rápido y una cola larga y oscura que sólo aporta atmósfera.
    vec3 tint = mix(vec3(1.0), vColor, smoothstep(0.02, 0.22, distance));
    tint = mix(tint, vColor * 0.16, smoothstep(0.22, 0.54, distance));
    float glow = pow(1.0 - distance, 2.4);

    float horizontal = exp(-abs(point.y) * 44.0) * smoothstep(0.5, 0.05, abs(point.x));
    float vertical = exp(-abs(point.x) * 44.0) * smoothstep(0.5, 0.05, abs(point.y));
    float alpha = (glow + (horizontal + vertical) * 0.3 * vFlare) * vPulse;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(tint * (0.68 + vPulse * 0.82), alpha);
  }
`

function makeGlowTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(205,241,255,.96)')
  gradient.addColorStop(0.16, 'rgba(106,196,255,.48)')
  gradient.addColorStop(0.48, 'rgba(47,127,255,.14)')
  gradient.addColorStop(1, 'rgba(11,49,140,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeMeteorTexture() {
  const width = 256
  const height = 32
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    const vertical = Math.exp(-Math.abs(y / (height - 1) - 0.5) * 13)
    for (let x = 0; x < width; x += 1) {
      const along = Math.pow(x / (width - 1), 2.25)
      const alpha = Math.min(1, vertical * along * 1.32)
      const offset = (y * width + x) * 4
      pixels.data[offset] = 226
      pixels.data[offset + 1] = 248
      pixels.data[offset + 2] = 255
      pixels.data[offset + 3] = Math.round(alpha * 255)
    }
  }
  context.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * La luna del capítulo. Textura lunar real, relieve derivado de ella y una sola
 * fuente de luz coherente con la clave del escenario, que entra por la parte
 * alta izquierda: por eso el terminador cae abajo a la derecha.
 *
 * La visibilidad la sigue mandando el recorrido —se retira cuando la cámara se
 * acerca al cerebro y vuelve durante el reensamble—, pero ahora viaja por
 * `uOpacity` en vez de apagar el color, para que al desvanecerse deje ver las
 * estrellas que tiene detrás en lugar de dejar un disco negro sobre ellas.
 */
function Moon({ sceneState, framing }: { sceneState: SceneStateRef; framing: Framing }) {
  const group = useRef<THREE.Group>(null)
  const surface = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Sprite>(null)
  const light = useRef<THREE.DirectionalLight>(null)
  const texture = useMemo(makeGlowTexture, [])
  const map = useLoader(THREE.TextureLoader, MOON_MAP)
  const aspect = useThree((state) => state.size.width / Math.max(state.size.height, 1))

  const material = useMemo(() => {
    const image = map.image as { width?: number; height?: number } | undefined
    const width = image?.width ?? 1024
    const height = image?.height ?? 512
    map.colorSpace = THREE.SRGBColorSpace
    // El muestreo del relieve cruza la costura en u; sin repetición la costura
    // se leería como un meridiano brillante.
    map.wrapS = THREE.RepeatWrapping
    map.wrapT = THREE.ClampToEdgeWrapping
    map.anisotropy = 8
    map.needsUpdate = true
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uStep: { value: new THREE.Vector2(3.5 / width, 3.5 / height) },
        uTime: { value: 0 },
        uOpacity: { value: 1 },
        uExposure: { value: 2.1 },
        uRelief: { value: 0.9 },
        // En espacio de vista: la cara iluminada no cambia mientras la cámara
        // orbita, que es lo que mantiene estable la composición.
        uSunDirection: { value: new THREE.Vector3(-0.62, 0.3, 0.72).normalize() },
        uSunColor: { value: new THREE.Color('#f2f5ff') },
        uEarthshine: { value: new THREE.Color('#1b4a90') },
        uRimColor: { value: new THREE.Color('#2f7dd8') },
      },
      vertexShader: moonVertexShader,
      fragmentShader: moonFragmentShader,
      transparent: true,
      depthWrite: false,
    })
  }, [map])

  useEffect(() => () => {
    texture.dispose()
    material.dispose()
  }, [material, texture])

  /*
    La luna compartía profundidad EXACTA con el enjambre de estrellas: las dos
    a -31,2, con el mismo parallax de 0,189. Por eso se leía como parte del
    plano estelar en vez de como un cuerpo lejano. A -84 su parallax cae a
    0,080 y deja de perseguir a la cámara; el radio se calcula desde la
    distancia, así que ocupa lo mismo en pantalla.

    El enjambre se queda donde está y pasa a ser la capa media de estrellas,
    con la placa profunda al fondo: tres profundidades estelares reales.
  */
  const z = -84
  const distance = framing.distance - z
  const halfHeight = halfHeightAt(distance)
  const narrow = aspect < 0.75
  const radius = halfHeight * (narrow ? 0.075 : 0.118)
  // La posición de escritorio estaba expresada sólo contra la altura. En
  // vertical quedaba a más del doble del ancho visible y la Luna desaparecía.
  // En estrecho se deriva del semiancho real y ocupa el claro superior derecho.
  const position = useMemo<[number, number, number]>(() => [
    narrow ? halfHeight * aspect * 0.66 : halfHeight * 0.98,
    narrow ? halfHeight * 0.72 : halfHeight * 0.48,
    z,
  ], [aspect, halfHeight, narrow])

  useFrame(() => {
    const signal = sceneState.current
    const opening = 1 - smoothstep(at('DISASSEMBLY'), until('ENTRY'), signal.progress)
    const returnWeight = bell(signal.progress, inside('INNER_EXIT', 0.5), PHASE.INSTITUTION, until('INSTITUTION')) * 0.46
    const visibility = Math.max(opening, returnWeight)
    const pulse = 0.96 + Math.sin(signal.time * 0.58) * 0.04
    material.uniforms.uTime.value = signal.time
    material.uniforms.uOpacity.value = visibility

    if (group.current) {
      group.current.visible = visibility > 0.008
      group.current.position.x = position[0] - signal.pointerX * radius * 0.17
      group.current.position.y = position[1] + signal.pointerY * radius * 0.1 + Math.sin(signal.time * 0.11) * radius * 0.025
      group.current.rotation.z = -0.08 + Math.sin(signal.time * 0.08) * 0.012
    }
    if (surface.current) {
      // −π/2 pone el meridiano cero —la cara visible desde la Tierra— frente a
      // la cámara. Lo demás es una rotación tan lenta que sólo se nota como
      // libración, no como un globo girando.
      surface.current.rotation.y = -Math.PI / 2 + signal.time * 0.052 + signal.progress * 0.1
      surface.current.rotation.x = -0.09 + Math.sin(signal.time * 0.12) * 0.012
    }
    if (glow.current) {
      const spriteMaterial = glow.current.material as THREE.SpriteMaterial
      spriteMaterial.opacity = visibility * (0.3 + pulse * 0.12)
      glow.current.scale.setScalar(radius * (3.15 + pulse * 0.14))
    }
    if (light.current) light.current.intensity = visibility * (0.46 + pulse * 0.08)
  })

  return (
    <group ref={group} position={position} renderOrder={2}>
      <sprite ref={glow} position={[0, 0, -0.7]} scale={[radius * 3.2, radius * 3.2, 1]} renderOrder={2}>
        <spriteMaterial map={texture} color="#7cc6ff" transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh ref={surface} material={material} renderOrder={3}>
        <sphereGeometry args={[radius, 96, 64]} />
      </mesh>
      {/* Luz de relleno del escenario, no de la luna: es lo que hace que el
          cerebro reciba algo desde el mismo lado del que viene el astro. */}
      <directionalLight ref={light} color="#83bfff" position={[-radius * 4, radius * 2.5, radius * 5]} intensity={0.52} />
    </group>
  )
}

/**
 * El cielo vivo del capítulo.
 *
 * Hereda del original de referencia lo que le da carácter: las estrellas no
 * están sembradas al azar por una caja, sino repartidas en órbitas alrededor de
 * un mismo eje, con más densidad y más brillo hacia el centro y con las de
 * fuera girando más deprisa que las de dentro. Ese giro diferencial es lo que
 * convierte el fondo en una espiral lenta en vez de un papel pintado.
 *
 * El eje pasa por el cerebro, así que el sujeto queda en el ojo del remolino y
 * todo lo demás gira a su alrededor: el fondo no compite con él, lo señala.
 */
function LivingStars({ sceneState, framing, quality }: { sceneState: SceneStateRef; framing: Framing; quality: Quality }) {
  const points = useRef<THREE.Points>(null)
  const count = quality === 'high' ? 1400 : quality === 'medium' ? 820 : 560

  const { positions, orbits, angles, speeds, phases, sizes, colors } = useMemo(() => {
    const nextPositions = new Float32Array(count * 3)
    const nextOrbits = new Float32Array(count)
    const nextAngles = new Float32Array(count)
    const nextSpeeds = new Float32Array(count)
    const nextPhases = new Float32Array(count)
    const nextSizes = new Float32Array(count)
    const nextColors = new Float32Array(count * 3)
    const random = (index: number) => {
      const value = Math.sin((index + 71) * 91.773) * 43758.5453
      return value - Math.floor(value)
    }
    const palette = [new THREE.Color('#b9eaff'), new THREE.Color('#72baff'), new THREE.Color('#ecf9ff'), new THREE.Color('#8b92ff')]
    for (let index = 0; index < count; index += 1) {
      // El exponente por debajo de uno concentra población hacia el centro sin
      // dejar el borde del encuadre vacío, que es el reparto de la referencia.
      const orbit = Math.pow(random(index * 11 + 1), 0.8)
      nextOrbits[index] = orbit
      nextAngles[index] = random(index * 11 + 2) * Math.PI * 2
      // Giro diferencial: el término base impide que las del centro queden
      // clavadas y el proporcional hace que el borde arrastre.
      nextSpeeds[index] = (0.0022 + random(index * 11 + 3) * 0.0125) * (0.3 + orbit * 0.7)
      // Sólo la Z se guarda en `position`; X e Y las resuelve la órbita en el
      // vértice. El escalonado en profundidad es lo que da parallax al campo.
      nextPositions[index * 3 + 2] = -29.2 - random(index * 11 + 4) * 4.6
      nextPhases[index] = random(index * 11 + 5)
      // Reparto muy sesgado a lo pequeño con una cola larga: la mayoría son
      // puntos y unas pocas, soles difusos.
      nextSizes[index] = 0.5 + Math.pow(random(index * 11 + 6), 2.4) * 7.4
      const color = palette[Math.floor(random(index * 11 + 7) * palette.length)]
      nextColors[index * 3] = color.r
      nextColors[index * 3 + 1] = color.g
      nextColors[index * 3 + 2] = color.b
    }
    return {
      positions: nextPositions,
      orbits: nextOrbits,
      angles: nextAngles,
      speeds: nextSpeeds,
      phases: nextPhases,
      sizes: nextSizes,
      colors: nextColors,
    }
  }, [count])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uVisibility: { value: 1 },
      uSpread: { value: 30 },
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const signal = sceneState.current
    const opening = 1 - smoothstep(inside('DISASSEMBLY', 0.36), until('ARRIVAL'), signal.progress)
    const returnWeight = bell(signal.progress, inside('INNER_EXIT', 0.5), PHASE.INSTITUTION, until('INSTITUTION')) * 0.55
    const visibility = Math.max(opening, returnWeight)
    // La órbita mayor cubre la diagonal del encuadre con un margen, para que
    // ninguna esquina se quede sin cielo al girar.
    const halfHeight = halfHeightAt(framing.distance + 30)
    const aspect = state.size.width / Math.max(state.size.height, 1)
    material.uniforms.uSpread.value = Math.hypot(halfHeight * aspect, halfHeight) * 1.22
    material.uniforms.uTime.value = signal.time
    material.uniforms.uPixelRatio.value = Math.min(state.gl.getPixelRatio(), 1.5)
    material.uniforms.uVisibility.value = visibility
    if (points.current) {
      points.current.visible = visibility > 0.006
      points.current.position.x = -signal.pointerX * halfHeight * 0.018
      points.current.position.y = signal.pointerY * 0.08
    }
  })

  return (
    <points ref={points} material={material} frustumCulled={false} renderOrder={2}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aOrbit" args={[orbits, 1]} />
        <bufferAttribute attach="attributes-aAngle" args={[angles, 1]} />
        <bufferAttribute attach="attributes-aSpeed" args={[speeds, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
      </bufferGeometry>
    </points>
  )
}

type MeteorDefinition = {
  at: number
  period: number
  duration: number
  start: [number, number, number]
  travel: [number, number, number]
  length: number
  color: string
}

const METEORS: readonly MeteorDefinition[] = [
  { at: 0.55, period: 6.8, duration: 1.05, start: [11.5, 10.2, -28.6], travel: [-10.5, -5.6, 0.2], length: 5.0, color: '#d9fbff' },
  { at: 3.45, period: 8.9, duration: 1.18, start: [-4.5, 12.7, -30.1], travel: [8.4, -4.1, 0.4], length: 3.1, color: '#7ce7ff' },
  { at: 5.35, period: 10.7, duration: 0.86, start: [18.4, 7.6, -29.4], travel: [-7.2, -3.8, 0.3], length: 2.7, color: '#a9bfff' },
]

function ShootingStars({ sceneState, quality }: { sceneState: SceneStateRef; quality: Quality }) {
  const groups = useRef<Array<THREE.Group | null>>([])
  const trails = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const heads = useRef<Array<THREE.SpriteMaterial | null>>([])
  const texture = useMemo(makeGlowTexture, [])
  const trailTexture = useMemo(makeMeteorTexture, [])
  const definitions = quality === 'low' ? METEORS.slice(0, 1) : quality === 'medium' ? METEORS.slice(0, 2) : METEORS
  const paths = useMemo(() => definitions.map((meteor) => {
    const direction = new THREE.Vector3(...meteor.travel).normalize()
    return {
      direction,
      angle: Math.atan2(direction.y, direction.x),
      start: new THREE.Vector3(...meteor.start),
      travel: new THREE.Vector3(...meteor.travel),
    }
  }), [definitions])

  useEffect(() => () => {
    texture.dispose()
    trailTexture.dispose()
  }, [texture, trailTexture])

  useFrame(() => {
    const signal = sceneState.current
    const skyVisibility = 1 - smoothstep(inside('UNLOCK', 0.75), inside('ENTRY', 0.82), signal.progress)
    definitions.forEach((meteor, index) => {
      const group = groups.current[index]
      if (!group) return
      const shifted = signal.time - meteor.at
      const localTime = shifted < 0 ? meteor.period + (shifted % meteor.period) : shifted % meteor.period
      const active = localTime >= 0 && localTime <= meteor.duration
      const travelProgress = active ? localTime / meteor.duration : 0
      const alpha = active ? bell(travelProgress, 0, 0.22, 1) * skyVisibility : 0
      group.visible = alpha > 0.006
      if (!group.visible) return
      group.position.copy(paths[index].start).addScaledVector(paths[index].travel, travelProgress)
      group.rotation.z = paths[index].angle
      const trail = trails.current[index]
      if (trail) trail.opacity = alpha * 0.95
      const head = heads.current[index]
      if (head) head.opacity = alpha
    })
  })

  return (
    <group renderOrder={4}>
      {definitions.map((meteor, index) => (
        <group
          key={`${meteor.at}-${meteor.period}`}
          ref={(node) => { groups.current[index] = node }}
          visible={false}
        >
          <mesh position={[-meteor.length * 0.5, 0, 0]} scale={[meteor.length, 0.075, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              ref={(node) => { trails.current[index] = node }}
              map={trailTexture}
              color={meteor.color}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <sprite scale={[0.46, 0.46, 1]}>
            <spriteMaterial
              ref={(node) => { heads.current[index] = node }}
              map={texture}
              color={meteor.color}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        </group>
      ))}
    </group>
  )
}

/**
 * Cielo vivo de la primera impresión. Todos los movimientos leen el mismo reloj
 * reversible de la escena; el scroll sólo decide cuándo el cielo cede el plano
 * al cerebro y a la cámara interior.
 */
export function CinematicSky({ sceneState, framing, quality }: { sceneState: SceneStateRef; framing: Framing; quality: Quality }) {
  return (
    <>
      <LivingStars sceneState={sceneState} framing={framing} quality={quality} />
      <Moon sceneState={sceneState} framing={framing} />
      <ShootingStars sceneState={sceneState} quality={quality} />
    </>
  )
}
