/*
  Cómo se abre el cubo — segunda pasada.

  La primera reconstrucción cortaba la malla en tres bandas horizontales
  planas: se leía como "tres piezas grandes", justo lo que esta pasada pide
  corregir. El archivo sigue siendo una sola malla (verificado con
  `gltf-transform inspect`: 1 mesh / 1 primitive / 0 nodos con nombre en los
  cuatro GLB de Plataforma), así que no hay una clasificación "por mesh"
  posible — la única palanca real es POR DÓNDE se corta esa malla única.

  Ahora se corta por una rejilla de altura × cuadrante: 3 bandas como antes
  (coinciden con el dibujo de la textura, ver nota histórica en
  `platform-cast.tsx`), y cada banda se reparte en 4 cuadrantes (signo de x,
  signo de z — ver por qué cuatro y no un ángulo cualquiera más abajo). Doce
  piezas en vez de tres. Cada una recibe su propio vector de explosión
  radial —no un lerp lineal compartido— y su propio retraso, así que la
  apertura se lee como una estructura modular desarmándose, no como un cubo
  partido en tres rebanadas.

  Lo que la malla única no puede dar —aristas, anillos, micro-módulos— se
  añade en `platform-cast.tsx` como geometría procedural (mismo patrón que
  `HeroRing`/`InnerNeuralTunnel` en `hero-scene.tsx`): instancedMesh barato,
  sin GLB nuevo. Este archivo sólo describe la malla real.
*/

/** Familias de movimiento. Cada una anima distinto (ver `platform-cast.tsx`). */
export type ModuleGroup = 'OUTER_SHELL' | 'FRAMES' | 'RINGS' | 'PANELS' | 'SMALL_MODULES' | 'DATA_PARTICLES'

export type ShellCell = {
  name: string
  /** 0 = banda superior, 1 = media, 2 = inferior — igual orden que antes. */
  band: number
  sector: number
  exploded: [number, number, number]
  rotation: [number, number, number]
  delay: number
  group: ModuleGroup
}

/** Cortes en altura normalizada del modelo (−1 abajo, +1 arriba). Sin cambios. */
export const LAYER_CUTS = [-0.34, 0.34] as const

export const HEIGHT_BANDS = 3
/*
  Cuatro sectores, no un ángulo arbitrario.

  El cubo es un cubo: sus caras son planas y sus aristas caen en x=0 y z=0,
  no en divisiones angulares parejas. Cortar por cuadrante (signo de x, signo
  de z) hace que la costura caiga siempre por el CENTRO de una cara plana —una
  línea recta sobre una superficie plana—, que es justo lo que evita el
  "borde dentado" que ya se midió al repartir por ángulo continuo contra un
  objeto con relieve (ver nota histórica arriba). Seis u ocho sectores
  meterían cortes en diagonal que no seguirían ninguna arista real del
  modelo.
*/
export const SECTORS = 4

/** PRNG estable: la misma celda produce siempre el mismo jitter. */
function seeded(seed: number) {
  const v = Math.sin(seed * 127.1) * 43758.5453
  return v - Math.floor(v)
}

/**
 * Escala vertical y radial por banda.
 *
 * La vertical reproduce el reparto ya aprobado (arriba sube, abajo baja,
 * centro casi no se mueve en Y) para no perder la silueta que ya se validó.
 * La radial es nueva: antes sólo la banda media se apartaba de lado (1,42 u);
 * ahora las tres empujan hacia fuera según su sector, que es lo que
 * convierte "tres rebanadas" en "una cáscara que se abre en gajos".
 */
const BAND_VERTICAL = [1.05, 0.08, -0.92] as const
const BAND_RADIAL = [0.62, 1.05, 0.62] as const
/*
  Orden de oleadas — pedido explícito tras el video: "no parece
  transformación mecánica, parece explosión de meshes". Antes salía banda por
  banda en orden top→middle→bottom (`[0, 0.14, 0.26]`), sin relación con
  ningún criterio salvo la altura. El pedido concreto agrupa top+bottom como
  UNA oleada ("wave2: top/bottom panels") y dejaba la banda media —los
  "PANELS" que además orbitan— para la oleada siguiente ("wave3: side
  panels"), después de los micro-módulos (que ya salen primero, atados
  directo a `assembly` sin retraso propio) y antes de cantos/anillos (que
  `platform-cast.tsx` retrasa por separado). Con `[0.05, 0.05]` iguales,
  top y bottom quedan sincronizados como un solo grupo.
*/
const BAND_DELAY = [0.05, 0.26, 0.05] as const

function buildShellCells(): ShellCell[] {
  const cells: ShellCell[] = []
  for (let band = 0; band < HEIGHT_BANDS; band += 1) {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      const index = band * SECTORS + sector
      const angle = ((sector + 0.5) / SECTORS) * Math.PI * 2
      const jitter = seeded(index + 11)
      const radial = BAND_RADIAL[band] * (0.85 + jitter * 0.3)
      const dirX = Math.cos(angle)
      const dirZ = Math.sin(angle)
      cells.push({
        name: `Shell-${band}-${sector}`,
        band,
        sector,
        exploded: [dirX * radial, BAND_VERTICAL[band] * (0.92 + jitter * 0.16), dirZ * radial],
        rotation: [dirZ * 0.16 * (jitter - 0.3), (sector / SECTORS) * 0.3 - 0.15, dirX * -0.14 * (jitter - 0.3)],
        // Retraso por banda + un escalonado fino por sector: dentro de una
        // misma banda las piezas no saltan todas a la vez, lo que vende
        // "mecanismo" en vez de "animación de una sola pieza clonada".
        delay: BAND_DELAY[band] + (sector / SECTORS) * 0.18,
        group: 'OUTER_SHELL',
      })
    }
  }
  return cells
}

export const SHELL_CELLS: readonly ShellCell[] = buildShellCells()

/** Clasifica una altura normalizada (−1..1) en su banda (0 arriba, 2 abajo). */
export function bandOf(normalizedHeight: number): number {
  if (normalizedHeight >= LAYER_CUTS[1]) return 0
  if (normalizedHeight <= LAYER_CUTS[0]) return 2
  return 1
}

/** Clasifica un ángulo (radianes, cualquier signo) en su sector [0, SECTORS). */
export function sectorOf(angleRad: number): number {
  const twoPi = Math.PI * 2
  const normalized = ((angleRad % twoPi) + twoPi) % twoPi
  return Math.min(SECTORS - 1, Math.floor((normalized / twoPi) * SECTORS))
}
