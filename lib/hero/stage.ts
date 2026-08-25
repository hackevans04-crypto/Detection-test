import * as THREE from 'three'

/**
 * El reparto del capítulo «Inicio».
 *
 * Los originales de Hi3D rondan 65 MB, dos millones de triángulos y dos JPEG de
 * 8192×8192 —358 MB de memoria de GPU por textura—, así que la escena no carga
 * ninguno: usa las versiones derivadas por `scripts/optimize-hero-models.mjs`,
 * medidas en `tmp/model-optimization.json`. El cerebro orgánico completo y la
 * galaxia se auditaron, pero no se cargan porque duplican o contradicen el
 * ensamblaje continuo.
 *
 * Ninguno trae animaciones ni piezas separadas: son mallas fusionadas con un
 * solo material. Todo lo que se mueve se construye aquí, con grupos, curvas y
 * shaders.
 */
const WEB = '/detection-home/hero/models/web'

export type ActorKey = 'brain' | 'organic' | 'interior' | 'platform' | 'hud' | 'neural' | 'energy'

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
  width?: number
  /** Los estados cerebrales se normalizan por altura para ocupar el mismo volumen. */
  fit?: 'brain-height'
  /** Posición, también en múltiplos del radio del cerebro. */
  position: [number, number, number]
  baseRotation: [number, number, number]
  /** Giro propio sobre Y, en radianes por segundo. */
  spin: number
  emissive: string
  /** Multiplicador cromático del mapa horneado. */
  tint?: string
  emissiveIntensity: number
  peakOpacity: number
}

/** Altura del cerebro en el mundo. El resto de la escena se mide contra esto. */
export const BRAIN_WORLD_HEIGHT = 2.2

export const BRAIN_URL = `${WEB}/brain-organic-digital.glb`
export const BRAIN_ORGANIC_URL = `${WEB}/brain-solid.glb`
export const BRAIN_INTERIOR_URL = `${WEB}/brain-stem.glb`
/** Alias conservado para los consumidores antiguos. */
export const BRAIN_LOW_URL = BRAIN_ORGANIC_URL

export const ACTORS: ActorSpec[] = [
  {
    key: 'platform',
    url: `${WEB}/platform-podium.glb`,
    cropAboveY: -0.1,
    width: 1.82,
    position: [0, -1.24, 0],
    baseRotation: [0, 0, 0],
    spin: -0.045,
    emissive: '#07477f',
    emissiveIntensity: 0.16,
    peakOpacity: 0.92,
  },
  {
    key: 'interior',
    url: BRAIN_INTERIOR_URL,
    width: 1.48,
    position: [0, -0.04, -0.14],
    baseRotation: [0, -Math.PI / 2, 0],
    spin: 0,
    emissive: '#2465b8',
    emissiveIntensity: 0.22,
    peakOpacity: 0.72,
  },
  {
    key: 'hud',
    url: `${WEB}/hud-orbital.glb`,
    cropInsideRadius: 0.4,
    width: 2.72,
    position: [0, 0.02, -0.46],
    baseRotation: [0.06, 0, 0],
    spin: 0.075,
    emissive: '#0e6fd0',
    emissiveIntensity: 0.46,
    peakOpacity: 0.18,
  },
  {
    key: 'neural',
    url: `${WEB}/neural-cluster.glb`,
    /*
      Es una placa (0,97 × 1,00 × 0,41), no un volumen.

      Fue membrana atravesable mientras la cámara entraba en el cerebro. Sin
      viaje interior recupera el papel que su forma pide: un telón de datos
      DETRÁS del sujeto. Ahí hace un trabajo que ninguna otra pieza hacía —dar
      algo a lo que el cerebro pueda ocultar mientras la cámara orbita—, que es
      la mitad de la lectura de profundidad de la fase de órbita.
    */
    /*
      Lejos y muy tenue.

      A 1,15 R por detrás y con opacidad 0,24 sus lóbulos se recortaban justo
      sobre el hombro del cerebro y se leían como manchas pálidas flotando, no
      como un fondo. A 2,4 R queda fuera del halo del sujeto y con 0,12 se
      comporta como lo que tiene que ser: un campo de datos contra el que el
      cerebro pueda recortarse mientras la cámara orbita.
    */
    width: 1.62,
    position: [0, 0.02, -0.2],
    baseRotation: [0, -Math.PI / 2, 0],
    spin: -0.03,
    emissive: '#355eea',
    emissiveIntensity: 0.34,
    peakOpacity: 0.34,
  },
  {
    key: 'energy',
    url: `${WEB}/energy-reactor.glb`,
    /*
      El núcleo de la plataforma. Casi esférico, así que se asienta bien dentro
      del podio. Sólo existe al final: es lo que hace que la última toma sea un
      descenso hacia algo encendido en vez de un plano vacío con el cerebro
      desvaneciéndose.
    */
    width: 0.22,
    position: [0, -0.02, -0.08],
    baseRotation: [0, 0, 0],
    spin: 0.3,
    emissive: '#2fd9ff',
    tint: '#247aa6',
    emissiveIntensity: 0.28,
    peakOpacity: 0.58,
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

/* ------------------------------------------------------------------ cámara */

/*
  Aquí vivían MIN_CAMERA_DISTANCE_R, MAX_BRAIN_SCREEN_HEIGHT, CAMERA_ORBIT,
  CAMERA_TARGET y closestOrbitFactor: dos curvas de veintiún nudos comentadas al
  detalle, dos límites de encuadre y una función que los verificaba.

  No los consumía nadie. La cámara la resuelve HERO_SHOTS en lib/hero/director.ts
  a través de createHeroRail, y esas constantes sólo se citaban entre ellas.
  Borrado tras búsqueda global: código muerto que parece autoritativo es peor
  que no tener nada, porque el siguiente que lo lea creerá que está tocando la
  cámara —que es exactamente lo que pasó aquí—.
*/

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
    lookAtX: narrow ? 0 : -visibleWidth * 0.15,
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
  /*
    A -46 el fondo estelar hacía un parallax relativo de 0,136 frente al
    sujeto: se movía casi un séptimo de lo que se mueve el cerebro y se leía
    como un papel pintado cercano. A -130 baja a 0,053, que es la relación
    perceptual pedida para «casi inmóvil». El plano lo escala `coverPlate` a
    partir de la distancia, así que su tamaño aparente no cambia.
  */
  deepStars: -130,
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
