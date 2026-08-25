import * as THREE from 'three'

/**
 * El reparto del capítulo «Inicio».
 *
 * Los originales de Hi3D rondan 65 MB, dos millones de triángulos y dos JPEG de
 * 8192×8192 —358 MB de memoria de GPU por textura—, así que la escena no carga
 * ninguno: usa las versiones derivadas por `scripts/optimize-hero-models.mjs`,
 * medidas en `tmp/model-optimization.json`. Los siete juntos suman 767k
 * triángulos y 8,9 MB.
 *
 * Ninguno trae animaciones ni piezas separadas: son mallas fusionadas con un
 * solo material. Todo lo que se mueve se construye aquí, con grupos, curvas y
 * shaders.
 */
const WEB = '/detection-home/hero/models/web'

export type ActorKey = 'brain' | 'platform' | 'hud' | 'neural' | 'energy'

export type ActorSpec = {
  key: ActorKey
  url: string
  /**
   * Descarta la geometría por encima de esta altura del modelo. El podio trae
   * una torre con aguja sobre la base; la referencia pide una plataforma baja y
   * ancha, y este corte —medido sobre su histograma real de vértices— se queda
   * sólo con los dos discos inferiores.
   */
  cropAboveY?: number
  /**
   * Descarta la geometría por dentro de este radio XZ del modelo. El HUD es una
   * esfera armilar maciza; quedarse con su jaula exterior lo convierte en el
   * dato atmosférico que pide la referencia en vez de una maraña sobre el
   * cerebro.
   */
  cropInsideRadius?: number
  /** Anchura objetivo, en múltiplos del radio del cerebro. */
  width: number
  /** Posición, también en múltiplos del radio del cerebro. */
  position: [number, number, number]
  baseRotation: [number, number, number]
  /**
   * Coreografía: [entra, pleno, sigue pleno, sale]. Mantener los siete modelos
   * visibles todo el rato sería contaminación visual; cada uno tiene su tramo.
   */
  window: [number, number, number, number]
  /** Giro propio sobre Y, en radianes por segundo. */
  spin: number
  emissive: string
  emissiveIntensity: number
  peakOpacity: number
}

/** Altura del cerebro en el mundo. El resto de la escena se mide contra esto. */
export const BRAIN_WORLD_HEIGHT = 2.2

export const BRAIN_URL = `${WEB}/brain-organic-digital.glb`

/**
 * Cerebro sólo orgánico. Derivado y disponible, pero **no se usa en runtime**:
 * sustituir el cerebro por tier cambiaba la dirección artística —desaparecía el
 * hemisferio digital— en cuanto un equipo no sostenía 42 fps.
 */
export const BRAIN_LOW_URL = `${WEB}/brain-solid.glb`

export const ACTORS: ActorSpec[] = [
  {
    key: 'platform',
    url: `${WEB}/platform-podium.glb`,
    cropAboveY: -0.1,
    width: 1.82,
    position: [0, -1.24, 0],
    baseRotation: [0, 0, 0],
    window: [0, 0, 1, 1],
    spin: -0.045,
    emissive: '#07477f',
    emissiveIntensity: 0.34,
    peakOpacity: 1,
  },
  {
    key: 'hud',
    url: `${WEB}/hud-orbital.glb`,
    cropInsideRadius: 0.4,
    width: 3.05,
    position: [0, 0.02, 0],
    baseRotation: [0.06, 0, 0],
    // Jaula de datos: despierta con la activación, acompaña el arco de cámara y
    // se apaga antes de la institución. El anillo limpio del fotograma cero es
    // otro elemento, procedural, porque ningún GLB lo aporta.
    window: [0.12, 0.26, 0.58, 0.72],
    spin: 0.075,
    emissive: '#0e6fd0',
    emissiveIntensity: 0.7,
    peakOpacity: 0.42,
  },
  {
    key: 'energy',
    url: `${WEB}/energy-reactor.glb`,
    width: 1.75,
    position: [0, -1.1, -0.15],
    baseRotation: [0, 0, 0],
    // Sólo durante la activación: entra con el escáner y se apaga cuando la
    // cámara termina el arco.
    window: [0.15, 0.24, 0.36, 0.46],
    spin: 0.28,
    emissive: '#12a8e8',
    emissiveIntensity: 0.9,
    peakOpacity: 0.7,
  },
  {
    key: 'neural',
    url: `${WEB}/neural-cluster.glb`,
    // Envuelve al cerebro en vez de plantarse a su lado. Con 3,5 R y a −1,75 R
    // se leía como una segunda estructura gigante compitiendo con el sujeto,
    // que es justo lo que la dirección de arte rechaza.
    width: 2.35,
    position: [0, 0.04, -0.85],
    baseRotation: [0, 0.35, 0],
    // Acompaña al tramo de inteligencia: aparece cuando la cámara se estabiliza
    // y se apaga antes de la institución.
    window: [0.3, 0.46, 0.7, 0.76],
    spin: -0.05,
    emissive: '#1467c8',
    emissiveIntensity: 0.85,
    peakOpacity: 0.32,
  },
]

/* ---------------------------------------------------- medida y normalización */

export type ActorMeasure = {
  geometry: THREE.BufferGeometry
  bounds: THREE.Box3
  center: THREE.Vector3
  size: THREE.Vector3
  radius: number
  triangles: number
}

type PositionAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute

function boundsFromIndex(position: PositionAttribute, index: ArrayLike<number>) {
  const box = new THREE.Box3()
  const point = new THREE.Vector3()
  for (let i = 0; i < index.length; i++) {
    const vertex = index[i]
    box.expandByPoint(point.set(position.getX(vertex), position.getY(vertex), position.getZ(vertex)))
  }
  return box
}

/** Malla de mayor densidad de la escena del glTF. Estos modelos sólo traen una. */
function largestMesh(scene: THREE.Object3D): THREE.Mesh {
  scene.updateMatrixWorld(true)
  let found: THREE.Mesh | null = null
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    if (!found || object.geometry.attributes.position.count > found.geometry.attributes.position.count) found = object
  })
  if (!found) throw new Error('El modelo no contiene ninguna malla')
  return found
}

/**
 * Mide un modelo y, si se pide, lo recorta por altura.
 *
 * El recorte se decide por el centroide de cada triángulo, de modo que ninguno
 * queda partido, y la caja resultante se calcula sobre el índice recortado:
 * `computeBoundingBox` mira el atributo completo y devolvería la caja del
 * modelo entero, que después descuadraría toda la composición.
 */
export function measureActor(scene: THREE.Object3D, crop?: { aboveY?: number; insideRadius?: number }): ActorMeasure {
  const mesh = largestMesh(scene)
  const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
  const position = source.attributes.position
  const index = source.index
  const triangles = index ? index.count / 3 : position.count / 3

  if (crop?.aboveY === undefined && crop?.insideRadius === undefined) {
    source.computeBoundingBox()
    source.computeBoundingSphere()
    const bounds = source.boundingBox!.clone()
    return {
      geometry: source,
      bounds,
      center: bounds.getCenter(new THREE.Vector3()),
      size: bounds.getSize(new THREE.Vector3()),
      radius: source.boundingSphere!.radius,
      triangles,
    }
  }

  const kept: number[] = []
  for (let t = 0; t < triangles; t++) {
    const a = index ? index.getX(t * 3) : t * 3
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3
    if (crop.aboveY !== undefined && y > crop.aboveY) continue
    if (crop.insideRadius !== undefined) {
      const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3
      const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3
      if (Math.hypot(x, z) < crop.insideRadius) continue
    }
    kept.push(a, b, c)
  }
  const geometry = new THREE.BufferGeometry()
  // Se comparten los atributos: recortar no cuesta un búfer de GPU más.
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute)
  const array = position.count > 65535 ? new Uint32Array(kept) : new Uint16Array(kept)
  geometry.setIndex(new THREE.BufferAttribute(array, 1))
  const bounds = boundsFromIndex(position, array)
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  geometry.boundingBox = bounds
  geometry.boundingSphere = sphere
  return {
    geometry,
    bounds,
    center: bounds.getCenter(new THREE.Vector3()),
    size: bounds.getSize(new THREE.Vector3()),
    radius: sphere.radius,
    triangles: kept.length / 3,
  }
}

/** Peso 0 → 1 de un actor en un progreso dado, según su ventana. */
export function actorWeight([enter, full, hold, exit]: ActorSpec['window'], p: number) {
  if (p < full) return full <= enter ? 1 : THREE.MathUtils.clamp((p - enter) / (full - enter), 0, 1)
  if (p <= hold) return 1
  return exit <= hold ? 1 : THREE.MathUtils.clamp(1 - (p - hold) / (exit - hold), 0, 1)
}

/* ------------------------------------------------------------------ cámara */

/**
 * La cámara orbita alrededor del cerebro en vez de recorrer posiciones
 * absolutas. Es la diferencia entre parecer 3D y serlo: al girar el punto de
 * vista manteniendo el encuadre, el cerebro cambia de silueta y el fondo se
 * desplaza según su distancia, que es justo el parallax que faltaba. Moverla
 * en línea recta hacia el modelo sólo produciría zoom.
 *
 * Cada punto de la curva es (azimut°, elevación°, factor de distancia). Los
 * once nudos están repartidos uniformemente entre p=0 y p=1, que es como
 * `CatmullRomCurve3` parametriza `getPoint`.
 */
export const CAMERA_ORBIT = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 1), //           0.0  encuadre aprobado
  new THREE.Vector3(-1.5, 0.4, 0.985), //  0.1  vive, apenas respira
  new THREE.Vector3(-4.5, 1.2, 0.975), //  0.2  activación: dolly corto
  new THREE.Vector3(-10.5, 3, 0.95), //    0.3  arranca el arco lateral
  new THREE.Vector3(-18, 6.2, 0.935), //   0.4  máxima perspectiva
  new THREE.Vector3(-14.5, 5, 0.925), //   0.5  se estabiliza cerca
  new THREE.Vector3(-11, 3.4, 0.93), //    0.6  hotspots: manda el lookAt
  new THREE.Vector3(-8, 2.2, 0.945), //    0.7
  new THREE.Vector3(-3, 0.6, 0.985), //    0.8  institución: retrocede
  new THREE.Vector3(1.5, -1.8, 1.02), //   0.9
  new THREE.Vector3(0.5, -3.6, 0.97), //   1.0  entrega a la plataforma
], false, 'catmullrom', 0.5)

/** Desplazamiento del punto mirado, en múltiplos del radio del cerebro. */
export const CAMERA_TARGET = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.04, 0),
  new THREE.Vector3(0, 0.04, 0),
  new THREE.Vector3(0.02, 0.05, 0),
  new THREE.Vector3(0.04, 0.06, 0),
  new THREE.Vector3(0.02, 0.04, 0),
  new THREE.Vector3(-0.02, 0.02, 0),
  new THREE.Vector3(-0.06, -0.02, 0),
  new THREE.Vector3(-0.02, -0.06, 0),
  new THREE.Vector3(0, -0.02, 0),
  new THREE.Vector3(0, -0.34, 0),
  new THREE.Vector3(0, -0.72, 0),
], false, 'catmullrom', 0.5)

export type Framing = {
  brainHeight: number
  /** Distancia base cámara → cerebro. */
  distance: number
  /** Centro del cerebro en X, en unidades de mundo. */
  stageX: number
  /** Centro del cerebro en Y. El escenario vive siempre en el plano y = 0. */
  stageY: number
  /**
   * Desplazamiento horizontal del punto mirado, en unidades de mundo. Negativo
   * empuja al cerebro hacia la derecha del encuadre, que es donde lo pone la
   * referencia mientras el texto ocupa la izquierda.
   *
   * Va en el `lookAt` y no en la posición del escenario por la misma razón que
   * `lookAtY`: mover el escenario arrastra el pivote de la órbita con él y el
   * sujeto vuelve a quedar centrado.
   */
  lookAtX: number
  /**
   * Altura a la que mira la cámara, por encima del escenario. Desplaza el
   * encuadre, no el mundo: subir el punto mirado baja al cerebro en pantalla,
   * que es lo que deja libre la mitad superior para la columna de texto en
   * vertical. Mover el escenario no serviría, porque el pivote de la órbita
   * viaja con él y el sujeto seguiría centrado.
   */
  lookAtY: number
  fov: number
  targetHeightFraction: number
}

export const STAGE_FOV = 38

/**
 * El encuadre se calcula, no se tantea. Se fija el tamaño del cerebro en el
 * mundo y se despeja la distancia que lo hace ocupar la fracción de pantalla
 * pedida; así `R` es estable en cualquier viewport y los radios del HUD, las
 * órbitas y la plataforma pueden derivarse de él sin sorpresas.
 */
export function frameStage(width: number, height: number, brainHeight = BRAIN_WORLD_HEIGHT): Framing {
  const aspect = width / Math.max(height, 1)
  const narrow = width < 901
  const targetHeightFraction = width < 640 ? 0.34 : narrow ? 0.38 : width < 1280 ? 0.42 : 0.44
  const halfFov = THREE.MathUtils.degToRad(STAGE_FOV) / 2
  const byHeight = brainHeight / (2 * targetHeightFraction * Math.tan(halfFov))
  // En pantallas apaisadas manda la altura; en las estrechas, el ancho, o el
  // cerebro se saldría por los lados al orbitar. La fracción es generosa en
  // vertical: con 0,5 el cerebro quedaba en un 23 % de la pantalla y perdía el
  // protagonismo que pide la referencia.
  // En teléfonos la columna de texto ocupa casi dos tercios de la pantalla, así
  // que el escenario baja más y se conforma con menos ancho.
  const widthFraction = width < 640 ? 0.58 : 0.62
  const byWidth = brainHeight / (2 * widthFraction * Math.tan(halfFov) * Math.max(aspect, 0.2))
  const distance = Math.max(byHeight, byWidth)
  const visibleHeight = 2 * distance * Math.tan(halfFov)
  const visibleWidth = visibleHeight * aspect
  return {
    brainHeight,
    distance,
    stageX: 0,
    stageY: 0,
    lookAtX: narrow ? 0 : -visibleWidth * 0.155,
    lookAtY: width < 640 ? visibleHeight * 0.215 : narrow ? visibleHeight * 0.15 : 0,
    fov: STAGE_FOV,
    targetHeightFraction,
  }
}

/**
 * Mapa de profundidad del mundo, en Z de mundo con el cerebro en 0.
 *
 * Los saltos son grandes a propósito. Con la cámara a ~7,6 del cerebro, una
 * montaña a −34 está a 41,6 y una mota de lente a +4,6 está a 3: la misma
 * traslación de cámara las desplaza en pantalla en proporción 14:1. Ése es el
 * parallax diferencial, y sale de la perspectiva, no de mover cada capa a mano.
 */
export const WORLD_Z = {
  deepStars: -46,
  mountainsFar: -34,
  fogFar: -26,
  techNetwork: -20,
  mountainsMid: -14,
  fogBack: -8.5,
  mountainsFront: -5.2,
  fogMiddle: -2.6,
  stage: 0,
  fogFrontLeft: 2.6,
  fogFrontRight: 3.4,
  lensParticles: 4.6,
} as const

/** Mitad de la altura visible a una distancia dada de la cámara. */
export const halfHeightAt = (distance: number) => distance * Math.tan(THREE.MathUtils.degToRad(STAGE_FOV) / 2)

/* ------------------------------------------------------- modo determinista */

export type TestMode = { active: boolean; progress: number }

/**
 * `?heroTest=1&p=0.35` congela tiempo, puntero y semillas para que dos
 * capturas del mismo progreso sean idénticas. Sin esto no hay comparación
 * visual posible: cada captura caería en un instante distinto de la niebla.
 */
export function readTestMode(search: string): TestMode {
  const params = new URLSearchParams(search)
  const active = params.get('heroTest') === '1'
  const raw = Number(params.get('p'))
  return { active, progress: active && Number.isFinite(raw) ? THREE.MathUtils.clamp(raw, 0, 1) : 0 }
}
