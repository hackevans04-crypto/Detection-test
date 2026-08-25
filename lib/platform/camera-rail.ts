import * as THREE from 'three'

export type PlatformCameraKeyframe = {
  name: string
  progress: number
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  roll: number
}

/*
  Riel de cámara del capítulo 02.

  El primer fotograma es, a propósito, idéntico a `HeroShot END` de
  `lib/hero/director.ts`: posición, target, FOV y roll. Esa igualdad es lo que
  hace que el relevo entre capítulos no se vea.

  El riel anterior tenía dos defectos medidos que explicaban casi todo lo que se
  percibía como caos:

  1. **Cruzaba el reactor por dentro.** Entre `CORE_ORBIT` (z −7,1, lado cercano)
     y `DATA_FLIGHT` (z −11,1, lado lejano) la curva atravesaba el plano del
     núcleo: margen mínimo 0,27 u y el núcleo ocupando el 100 % del encuadre.
     Eso es la «pared cian» del vídeo. Ahora el rodeo va POR ARRIBA y por fuera:
     ningún tramo vuelve a cortar el eje del núcleo.

  2. **El arco superior subía justo por donde sale el panel de arriba.** La
     cámara pasaba por y 5,15 mientras `PanelSuperior` viajaba hacia y 7,85, y se
     le echaba encima. El arco baja a 4,2 y se retrasa en z, de modo que el panel
     abre por encima del encuadre en vez de dentro de él.

  Se añaden dos claves intermedias —`CORE_ROUND` y `OVER_TOP`— que no son
  adorno: una Catmull-Rom con claves muy separadas se comba entre ellas, y era
  esa comba, no los keyframes, la que se metía en la geometría.

  3. **La entrada no avanzaba.** `HANDOFF` y `EMERGE` estaban los dos en z −1,4:
     durante todo el tramo del corredor la cámara no recorría ni una unidad. Un
     tubo sin recorrido no es profundidad, es un fondo de pantalla. Ver la nota
     en los propios keyframes.
*/
export const PLATFORM_CAMERA_KEYFRAMES: readonly PlatformCameraKeyframe[] = [
  /*
    La entrada es un avance, no un cabeceo.

    Los dos primeros fotogramas estaban los dos en z −1,4: la cámara sólo subía
    trece centímetros y cambiaba de mirada. Con el corredor delante, eso da un
    tubo quieto y pegado a la cara —ninguna pared se mueve, ningún fondo se
    acerca—, y sin paralaje no hay profundidad que leer por mucho tubo que haya.
    Ahora recorre seis unidades y media metida en el corredor, con las paredes a
    2,7 u: el fondo crece, las paredes pasan, y la sala se abre al salir.

    El primer fotograma sigue siendo idéntico a `HeroShot END` de
    `lib/hero/director.ts` —posición, target, FOV y roll—, que es lo que hace
    que el relevo entre capítulos no se vea.
  */
  { name: 'HANDOFF', progress: 0, position: [0, -1.05, -1.4], target: [0, -1.18, -3], fov: 39.2, roll: 0 },
  { name: 'CORRIDOR', progress: 0.05, position: [0, -0.95, -2.9], target: [0, -0.82, -11.5], fov: 44, roll: 0.004 },
  { name: 'MOUTH', progress: 0.1, position: [0, -0.72, -4.6], target: [0, -0.5, -12], fov: 46, roll: -0.005 },
  /*
    Y la sala se descubre abriéndose a un costado, sin dar marcha atrás.

    La primera versión de esta entrada empujaba hasta z −7,9 y luego volvía a
    −3,9 para encuadrar el escenario. Avanzar y desandar en tres segundos no se
    lee como recorrido: se lee como un tirón. Y además metía la cámara dentro de
    la caja de la banda inferior —el verificador daba 0,16 u de holgura—, que
    sólo no se veía porque el cubo todavía no había aparecido.

    Ahora el empuje se detiene ANTES del escenario y la cámara sigue hacia
    adelante mientras se abre en arco. El movimiento no cambia de signo en
    ningún momento del tramo de llegada.
  */
  // A 8,2 u del cubo y apuntando por debajo de su centro: es la distancia a la
  // que caben en el encuadre el cubo, el podio y el anillo, que es lo que este
  // plano tiene que presentar.
  { name: 'REVEAL', progress: 0.19, position: [-6.8, 2.2, -5.4], target: [0, -0.6, -9], fov: 42, roll: -0.012 },
  { name: 'ORBIT_LEFT', progress: 0.3, position: [-7.4, 2.7, -9.2], target: [0, -0.5, -9], fov: 40, roll: 0.014 },
  { name: 'TOP_ARC', progress: 0.38, position: [-6.2, 3, -13.2], target: [0, 0.05, -9], fov: 41, roll: 0.018 },
  { name: 'EXPLOSION', progress: 0.46, position: [-4.1, 2.9, -15.4], target: [0, 0.2, -9], fov: 42, roll: 0.012 },
  // Mantiene primero la apertura completa en plano; después baja a la altura de
  // la ventana que abre la banda central y se acerca al núcleo.
  { name: 'MODULE_PASS', progress: 0.56, position: [-5.4, 1.55, -4.6], target: [0, -0.15, -9], fov: 42, roll: 0 },
  /*
    El tramo de lectura se rueda a distancia constante, ~7,8 u del cubo.

    La versión anterior se metía a 3,5 u y el sujeto se salía del encuadre justo
    cuando entran los cuatro conceptos, que necesitan sitio al lado. La distancia
    sale de la caja del cubo YA ABIERTO —cinco unidades y media de alto, no tres—
    y el objetivo es su centro, que la banda central desplaza a la derecha. Lo que cambia entre estas cuatro claves es el ÁNGULO, no la distancia:
    la cámara rodea la ventana que ha abierto la banda central —que se aparta
    hacia +x, así que se mira desde −x— y el encuadre se mantiene estable.
  */
  { name: 'CORE_APPROACH', progress: 0.67, position: [-5.2, 0.6, -3.6], target: [0.4, 0.15, -9], fov: 43, roll: -0.006 },
  { name: 'CORE_ORBIT', progress: 0.74, position: [-6.6, 0.7, -5.6], target: [0.4, 0.15, -9], fov: 44, roll: -0.01 },
  { name: 'CORE_ROUND', progress: 0.8, position: [-7.3, 1, -9.2], target: [0.4, 0.15, -9], fov: 43, roll: -0.008 },
  { name: 'DATA_FLIGHT', progress: 0.85, position: [-5.6, 2.2, -14.2], target: [0.3, 0.05, -9], fov: 42, roll: -0.005 },
  { name: 'OVER_TOP', progress: 0.9, position: [1.6, 2.8, -14.8], target: [0, 0, -9], fov: 40, roll: 0.006 },
  // La salida vuelve al eje y se aleja de frente: el corredor se monta otra vez
  // por delante y el capítulo se va por donde entró.
  { name: 'REASSEMBLY', progress: 0.94, position: [1.1, 1.5, -15.4], target: [0, 0.1, -12], fov: 40, roll: 0.008 },
  { name: 'EXIT', progress: 1, position: [0, 0.15, -16.2], target: [0, 0.05, -23], fov: 41, roll: 0 },
] as const

export const PLATFORM_EXIT_CAMERA = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.position
export const PLATFORM_EXIT_TARGET = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.target
export const PLATFORM_EXIT_FOV = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.fov
export const PLATFORM_EXIT_ROLL = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.roll

/**
 * Convierte el progreso del capítulo en la coordenada de la curva.
 *
 * **Éste era el fallo de fondo del capítulo.** El riel se muestreaba con
 * `getPointAt`, que reparte el recorrido por LONGITUD DE ARCO e ignora por
 * completo el `progress` que lleva cada keyframe. El resultado medido: a p=0,80
 * —en pleno tramo de lectura de conceptos— la cámara ya estaba en z −12,6
 * mirando a z −16,7, es decir de espaldas al cubo, cuando su propio keyframe
 * decía z −5,85 mirando al núcleo. El último tramo hacia la salida es larguísimo
 * en distancia, así que se comía la parametrización y adelantaba todo lo demás.
 *
 * Y como el FOV y el roll SÍ se interpolan por `progress` (`cameraScalar`), la
 * lente y el encuadre iban por un lado y la posición por otro. Eso es lo que se
 * percibía como caos: no era exceso de actores, era que la coreografía escrita
 * y la que se reproducía no eran la misma.
 *
 * `getPoint` reparte uniformemente ENTRE PUNTOS DE CONTROL, así que colocando
 * la coordenada en `(índice + t) / (n − 1)` cada keyframe se alcanza exactamente
 * en su progreso. La velocidad la marca entonces la separación entre keyframes,
 * que es donde debe estar la intención del director.
 */
export function railCoordinate(progress: number) {
  const frames = PLATFORM_CAMERA_KEYFRAMES
  const last = frames.length - 1
  if (progress <= frames[0].progress) return 0
  if (progress >= frames[last].progress) return 1
  let index = 0
  while (index < last - 1 && progress > frames[index + 1].progress) index++
  const from = frames[index]
  const to = frames[index + 1]
  const local = (progress - from.progress) / Math.max(to.progress - from.progress, 1e-6)
  return (index + local) / last
}

export function createPlatformCameraRail() {
  const positions = PLATFORM_CAMERA_KEYFRAMES.map((frame) => new THREE.Vector3(...frame.position))
  const targets = PLATFORM_CAMERA_KEYFRAMES.map((frame) => new THREE.Vector3(...frame.target))
  const position = new THREE.CatmullRomCurve3(positions, false, 'centripetal', 0.42)
  const target = new THREE.CatmullRomCurve3(targets, false, 'centripetal', 0.46)
  return {
    position,
    target,
    /**
     * Muestrea el riel POR PROGRESO. Es el único punto de entrada válido: usar
     * `position.getPointAt` directamente vuelve a desincronizar la cámara de la
     * lente, que es el defecto que este método existe para cerrar.
     */
    sample(progress: number, outPosition: THREE.Vector3, outTarget: THREE.Vector3) {
      const coordinate = railCoordinate(progress)
      position.getPoint(coordinate, outPosition)
      target.getPoint(coordinate, outTarget)
    },
  }
}

export function cameraScalar(progress: number, key: 'fov' | 'roll') {
  let index = 0
  while (index < PLATFORM_CAMERA_KEYFRAMES.length - 2 && progress > PLATFORM_CAMERA_KEYFRAMES[index + 1].progress) index++
  const from = PLATFORM_CAMERA_KEYFRAMES[index]
  const to = PLATFORM_CAMERA_KEYFRAMES[index + 1]
  const t = THREE.MathUtils.smoothstep(progress, from.progress, to.progress)
  return THREE.MathUtils.lerp(from[key], to[key], t)
}
