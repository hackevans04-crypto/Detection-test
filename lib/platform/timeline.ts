export const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function smoothstep(from: number, to: number, value: number) {
  const t = clamp01((value - from) / Math.max(to - from, 0.00001))
  return t * t * (3 - 2 * t)
}

export function smootherstep(from: number, to: number, value: number) {
  const t = clamp01((value - from) / Math.max(to - from, 0.00001))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Segunda reconstrucción: el capítulo deja de ser "llega, orbita, explota,
 * lee cuatro tarjetas, cierra" para ser un viaje con una parada real dentro
 * del núcleo. Los nombres y anchos siguen el reparto pedido por dirección de
 * arte, afinados sólo donde el ensayo visual lo exigía (ver comentarios por
 * tramo). Cada plano consume su propio ancho de progreso, así que estrechar
 * uno lo acelera y ensancharlo lo frena — no hay multiplicador de velocidad
 * por encima, por la misma razón que en `lib/hero/timeline.ts`.
 */
/*
  Novena pasada — se ELIMINA la presentación por caras del cubo.

  Las pasadas tercera a octava (ver historial en el control de versiones)
  construyeron y después pulieron minuciosamente una secuencia
  ROTATE→SETTLE→HOLOGRAM→TEXT→READ HOLD sobre las cuatro caras del cubo
  (`FACE_EVALUATION`…`FACE_INCLUSION`, con `faceRotation`/`faceReadWeight`/
  `faceHologramWeight` y un congelado de cámara dedicado) — hasta llegar a
  0 fallos de sincronía medidos en vivo. Auditoría final, verbatim: "el cubo
  gira y asoman textos... ya que no gira [bien] y los textos al scrollear no
  asoman completamente bien... mejor eliminar esa parte". No es un defecto
  de ejecución — el mecanismo llegó a quedar determinista y sin deriva de
  cámara — es un veredicto sobre el CONCEPTO: presentar los cuatro conceptos
  DOS VECES (una vez en las caras del cubo cerrado, otra vez al entrar en las
  estaciones interiores) duplicaba trabajo narrativo sin necesidad. Ahora los
  cuatro conceptos se presentan UNA SOLA VEZ, donde ya vivía el mecanismo
  correcto: las estaciones interiores (`EVALUATION`…`INCLUSION`,
  `stationArrival`/`stationRestFloor`/`conceptFrame` en `platform-glyphs.tsx`/
  `platform-chapter.tsx`).

  El ancho que liberan las cuatro `FACE_*` (0,096 de progreso, antes
  [0,21–0,306]) se reparte así:
    `CUBE_APPROACH`  +0,016 — el cubo, ahora la única parada antes de
                      transformarse, se queda un poco más de tiempo entero
                      a la vista.
    `DISASSEMBLY`    +0 — SIN CAMBIO, a propósito. Primer intento: +0,02
                      ("la transformación mecánica, la parte más interesante",
                      pedido de una pasada anterior) — medido en vivo con
                      `scripts/platform-rail-report.mjs`: ensanchar
                      `DISASSEMBLY` cambia el espaciado relativo hacia
                      `CORE_REVEAL`/`CORE_ENTRY` lo suficiente para reabrir
                      un bulto de Catmull-Rom entre `CORE_ENTRY_INNER` y
                      `CORE_ARRIVAL` — la cámara pasaba a 0,308 u del núcleo
                      (umbral 0,45u), y el punto que arreglaría ese bulto
                      es exactamente `CORE_ARRIVAL`, en la lista de "no
                      rediseñar". Revertido: `DISASSEMBLY` conserva su ancho
                      ORIGINAL (0,152) para que `CORE_REVEAL`/`CORE_ENTRY`
                      quedaran desplazados EN BLOQUE (misma forma local de
                      curva, ya validada) en vez de reescalados.
    Las 4 estaciones +0,02 cada una (0,08 en total: el ahorro que
                      `DISASSEMBLY` ya no se queda, más el resto) — ahora son
                      el ÚNICO lugar donde se lee cada concepto, así que se
                      llevan la mayor parte del ahorro: de 0,063 a 0,083 de
                      ancho cada una.
  `CORE_EXIT`/`PORTAL_EXIT`/`TUNNEL_EXIT` conservan sus límites absolutos
  exactos — toda la salida, ya tratada esta sesión (eje del túnel, congelado
  de cámara, `PORTAL_TRANSIT`), no se toca.

  El congelado de cámara que antes protegía la lectura de cada CARA
  (`platformCameraFreezeWeight`/`platformCameraFreezePoint`, ligadas a
  `CUBE_FACES`) se retira con las caras. En su lugar, `stationCameraFreezeWeight`/
  `stationCameraFreezePoint` (más abajo) aplican el mismo principio —cámara
  fija mientras se lee, con rampas de entrada/salida en vez de un corte— a
  las CUATRO ESTACIONES, que ahora son el único tramo de lectura del
  capítulo y heredan directamente la lección aprendida con las caras: sin
  esto, el riel (una Catmull-Rom continua) nunca deja de moverse ni un poco,
  aunque el glifo/texto de la estación ya esté fijo.
*/

/*
 * Décima pasada — hueco de tránsito entre estaciones.
 *
 * `STATION_SPAN_START`/`END` son los límites absolutos que ya usaban
 * `EVALUATION`…`INCLUSION` (0,556 = fin de `CORE_ENTRY`, 0,888 = inicio de
 * `CORE_EXIT`) — protegidos esta sesión, no se mueven ni un poco. Lo que
 * cambia es el REPARTO interior: antes 4 estaciones contiguas de 0,083 cada
 * una; ahora 4 de `STATION_WIDTH` (0,0705, ~15% menos) con un hueco de
 * `STATION_GAP` entre cada par de vecinas, calculado para que la suma total
 * siga ocupando exactamente el mismo span de siempre. Ver el comentario
 * junto a `EVALUATION` más abajo para el porqué completo (medido con
 * `platform-read-sync-report.mjs`/`tmp/inspect-arrival-gap.mjs`).
 */
const STATION_SPAN_START = 0.556
const STATION_SPAN_END = 0.888
const STATION_WIDTH = 0.0705
const STATION_GAP = (STATION_SPAN_END - STATION_SPAN_START - 4 * STATION_WIDTH) / 3

const STATION_EVALUATION_RANGE: readonly [number, number] = [STATION_SPAN_START, STATION_SPAN_START + STATION_WIDTH]
const TRANSIT_EVAL_ORG_RANGE: readonly [number, number] = [STATION_EVALUATION_RANGE[1], STATION_EVALUATION_RANGE[1] + STATION_GAP]
const STATION_ORGANIZATION_RANGE: readonly [number, number] = [TRANSIT_EVAL_ORG_RANGE[1], TRANSIT_EVAL_ORG_RANGE[1] + STATION_WIDTH]
const TRANSIT_ORG_ANALYSIS_RANGE: readonly [number, number] = [STATION_ORGANIZATION_RANGE[1], STATION_ORGANIZATION_RANGE[1] + STATION_GAP]
const STATION_ANALYSIS_RANGE: readonly [number, number] = [TRANSIT_ORG_ANALYSIS_RANGE[1], TRANSIT_ORG_ANALYSIS_RANGE[1] + STATION_WIDTH]
const TRANSIT_ANALYSIS_INCLUSION_RANGE: readonly [number, number] = [STATION_ANALYSIS_RANGE[1], STATION_ANALYSIS_RANGE[1] + STATION_GAP]
const STATION_INCLUSION_RANGE: readonly [number, number] = [TRANSIT_ANALYSIS_INCLUSION_RANGE[1], TRANSIT_ANALYSIS_INCLUSION_RANGE[1] + STATION_WIDTH]

/**
 * Progreso central de cada hueco de tránsito — para la clave intermedia que
 * `camera-rail.ts` añade entre cada par de estaciones vecinas (ver
 * comentario junto a `EVALUATION`). Exportados en vez de duplicar la
 * fórmula: `camera-rail.ts` ya importa de este archivo, así que no hay
 * ciclo.
 */
export const TRANSIT_EVAL_ORG = (TRANSIT_EVAL_ORG_RANGE[0] + TRANSIT_EVAL_ORG_RANGE[1]) / 2
export const TRANSIT_ORG_ANALYSIS = (TRANSIT_ORG_ANALYSIS_RANGE[0] + TRANSIT_ORG_ANALYSIS_RANGE[1]) / 2
export const TRANSIT_ANALYSIS_INCLUSION = (TRANSIT_ANALYSIS_INCLUSION_RANGE[0] + TRANSIT_ANALYSIS_INCLUSION_RANGE[1]) / 2

export const PLATFORM_BEATS = {
  /** Llegada del corredor: el portal de Inicio ya se cruzó, esto es el tubo. */
  HANDOFF: [0, 0.1],
  /** El túnel se abre a una sala grande: el cubo se ve pequeño, al fondo. */
  CHAMBER: [0.1, 0.16],
  /** La cámara se acerca; el cubo "crece" por perspectiva, no por escala. */
  CUBE_APPROACH: [0.16, 0.226],
  /**
   * Antes se pasaba de "cubo cerrado" a "cubo explotando" sin aviso: la
   * apertura sorprendía en vez de anunciarse. Aquí las costuras se
   * encienden, los anillos aceleran y el núcleo se insinúa antes de que
   * ninguna pieza se mueva.
   */
  ACTIVATION: [0.226, 0.293],
  /**
   * El tramo más ancho del capítulo — la transformación es el protagonista.
   * Ancho ORIGINAL (0,152), sin el +0,02 que la primera versión de esta
   * pasada le sumó: medido en vivo, ensanchar `DISASSEMBLY` cambiaba el
   * espaciado relativo hacia `CORE_REVEAL`/`CORE_ENTRY` lo suficiente para
   * reabrir un bulto de Catmull-Rom (la cámara pasaba a 0,308 u del núcleo
   * en p≈0,582, por debajo del umbral de 0,45u) en un tramo cuyo punto
   * correctivo, `CORE_ARRIVAL`, está en la lista de "no rediseñar". Con el
   * mismo ancho de siempre, `CORE_REVEAL`/`CORE_ENTRY`/`CORE_ARRIVAL`
   * conservan exactamente el mismo espaciado relativo que ya tenían
   * validado — sólo se desplazan en bloque, lo que NO cambia la forma local
   * de una Catmull-Rom. El ancho que `DISASSEMBLY` ya no se queda se lo
   * llevan las cuatro estaciones (ver más abajo).
   */
  DISASSEMBLY: [0.226 + 0.067, 0.226 + 0.067 + 0.152],
  /** El núcleo crece hasta ocupar el hueco que abrieron las bandas. */
  CORE_REVEAL: [0.445, 0.504],
  /** La cámara atraviesa físicamente la cáscara del núcleo. */
  CORE_ENTRY: [0.504, 0.556],
  /**
   * Ancho de cada estación y hueco de tránsito entre ellas — décima pasada.
   *
   * Medido en vivo (`platform-read-sync-report.mjs`): 118 fallos de 705
   * muestras, hasta 9,5-10,7°/0,001 de giro de cámara con el texto todavía
   * por encima del 50% de opacidad, en las 3 transiciones entre estaciones
   * (evaluación→organización→análisis→inclusión). Diagnóstico confirmado con
   * `tmp/inspect-arrival-gap.mjs`: NO es un problema de rampa de congelado —
   * `stationCameraFreezeWeight` llega a 1,000 exacto, distancia 0 al ancla,
   * cero movimiento real durante la lectura. El problema es que las cuatro
   * estaciones están en compás alrededor del núcleo (arriba/izquierda/derecha
   * /abajo, `STATION_ANCHORS`) con la cámara a menos de una unidad del centro
   * — cada transición es un giro real de ~79°, y antes las estaciones eran
   * CONTIGUAS (`ORGANIZATION` empezaba exactamente donde `EVALUATION`
   * terminaba): todo ese giro tenía que caber en el 18% de cola de una
   * ventana más el 18% de cabeza de la siguiente, ~0,03 de progreso — de ahí
   * la velocidad. Ensanchar sólo la rampa de congelado no basta: el riel
   * CRUDO (sin congelar) ya viaja a esa velocidad en todo ese hueco, congelar
   * más rampa sólo revela más del mismo tramo veloz.
   *
   * La única forma real de bajar la velocidad es darle más progreso al giro
   * en sí. Cada estación cede ~15% de su ancho (0,083 → `STATION_WIDTH`) para
   * financiar un hueco de tránsito dedicado entre cada par de estaciones
   * vecinas (`STATION_GAP`), con su propia clave intermedia en el riel
   * (`camera-rail.ts`, target = centro del núcleo) que parte el giro de ~79°
   * en dos giros de ~40° — la combinación de más progreso Y menos ángulo por
   * tramo es lo que baja el peor caso de ~9,5-10,7°/0,001 a ~4-5°/0,001,
   * comparable al resto del riel (11,5°/0,002 = 5,75°/0,001 en su peor punto
   * ya validado). Ir más allá (a <1°/0,001) exigiría ceder ~40% de la
   * lectura por estación en vez de ~15% — decisión explícita del encargo:
   * mejora notable, no perfección a costa de la lectura.
   *
   * El principio y el final del tramo (0,556 = fin de `CORE_ENTRY`, 0,888 =
   * inicio de `CORE_EXIT`) no se tocan — ambos protegidos esta sesión.
   */
  EVALUATION: [STATION_EVALUATION_RANGE[0], STATION_EVALUATION_RANGE[1]],
  ORGANIZATION: [STATION_ORGANIZATION_RANGE[0], STATION_ORGANIZATION_RANGE[1]],
  ANALYSIS: [STATION_ANALYSIS_RANGE[0], STATION_ANALYSIS_RANGE[1]],
  INCLUSION: [STATION_INCLUSION_RANGE[0], STATION_INCLUSION_RANGE[1]],
  /** Las estaciones se retraen y la energía vuelve al núcleo. */
  CORE_EXIT: [0.888, 0.933],
  /** El portal de salida se forma con la energía recogida. */
  PORTAL_EXIT: [0.933, 0.97],
  /** Túnel hacia Proceso; el letrero "03 · PROCESO" se enfoca al fondo. */
  TUNNEL_EXIT: [0.97, 1],
} as const satisfies Record<string, readonly [number, number]>

export type PlatformSegment = keyof typeof PLATFORM_BEATS

export const at = (segment: PlatformSegment) => PLATFORM_BEATS[segment][0]
export const until = (segment: PlatformSegment) => PLATFORM_BEATS[segment][1]
export const inside = (segment: PlatformSegment, fraction: number) => {
  const [from, to] = PLATFORM_BEATS[segment]
  return from + (to - from) * fraction
}

/**
 * Las cuatro estaciones internas, una por tramo del recorrido interior.
 *
 * Antes vivían en cuatro ventanas SOLAPADAS entre 0,55 y 0,88, pensadas para
 * un cubo que nunca se dejaba de ver desde fuera. Ahora cada una es un tramo
 * propio y exclusivo del recorrido dentro del núcleo — nunca hay dos
 * "sonando" a la vez — que es lo que permite apagar las otras tres sin
 * pelearse con su propia entrada.
 */
export const CONCEPTS = [
  {
    key: 'evaluation', index: '01', title: 'Expediente vivo',
    description: 'Datos, motivo, contexto y áreas permanecen sincronizados en una ficha clínica trazable.',
    window: PLATFORM_BEATS.EVALUATION, accent: '#70efff',
  },
  {
    key: 'organization', index: '02', title: 'Instrumentos IA',
    description: 'Digitaliza material, reconoce estructura y conserva evidencia verificable para revisión profesional.',
    window: PLATFORM_BEATS.ORGANIZATION, accent: '#46b8ff',
  },
  {
    key: 'analysis', index: '03', title: 'Indicadores clínicos',
    description: 'Presenta resultados, limitaciones y señales relevantes con tablas y gráficos trazables.',
    window: PLATFORM_BEATS.ANALYSIS, accent: '#8c7bff',
  },
  {
    key: 'inclusion', index: '04', title: 'Informe conectado',
    description: 'Integra hallazgos, conclusiones y recomendaciones sin perder fuente ni criterio profesional.',
    window: PLATFORM_BEATS.INCLUSION, accent: '#53e0d0',
  },
] as const

/**
 * Ángulo de reposo del cubo. Antes era también el punto de partida del giro
 * por caras (retirado esta pasada) — ahora es simplemente el 3/4 con el que
 * el cubo se admira entero durante `CHAMBER`/`CUBE_APPROACH`/`ACTIVATION`,
 * hasta que `DISASSEMBLY` empieza a separar piezas.
 */
export const CUBE_REST_ANGLE = 0.14

/**
 * Fracciones (del propio tramo de la estación) en las que `conceptFrame`
 * termina de entrar y empieza a salir — compartidas con
 * `stationCameraFreezeWeight` a propósito: la primera versión de esa función
 * usaba una rampa genérica del 22% sin relación con estos números, y
 * `scripts/platform-read-sync-report.mjs` midió el resultado en vivo — hasta
 * 10,7°/0,001 con el texto ya por encima del 50% de opacidad, porque el
 * texto ya iba por la mitad de su propia entrada (`conceptFrame` completa el
 * `enter` en 0,18) mientras la cámara apenas empezaba a asentarse, y al
 * revés a la salida (la cámara ya se soltaba en 0,78 mientras el texto no
 * empezaba a apagarse hasta 0,82). Usar las MISMAS fracciones para las dos
 * lecturas es lo que cierra ese hueco.
 */
/*
 * Décima pasada: 0,18 → 0,212. Al angostar cada estación un 15% para
 * financiar los huecos de tránsito (ver `EVALUATION` más arriba), la propia
 * rampa de entrada de CADA estación —incluida la de Evaluación entrando
 * desde `CORE_ARRIVAL`, que no tiene hueco de tránsito propio porque es la
 * PRIMERA— se angostó en la misma proporción y empeoró: 9,5°→11,2°/0,001,
 * medido con `platform-read-sync-report.mjs`. 0,212 = 0,18×(0,083/0,0705)
 * devuelve a la rampa de entrada su mismo ANCHO ABSOLUTO de siempre (misma
 * velocidad de entrada que antes de esta pasada) sin tocar `CORE_ARRIVAL`
 * (protegida) ni deshacer la mejora de las tres transiciones entre
 * estaciones, que no depende de este número.
 */
const CONCEPT_ENTER_END = 0.212
const CONCEPT_EXIT_START = 0.82

/**
 * 0–1: cuánto debe pesar la pose "congelada" de la cámara sobre la que da el
 * riel real en `progress`, durante la visita a una estación interior. 0
 * fuera de cualquier `CONCEPTS[].window`; sube en rampa al entrar —terminada
 * exactamente cuando `conceptFrame` ya completó su propio `enter`—, se queda
 * en 1 durante el centro de la estación, y empieza a soltarse sólo cuando
 * `conceptFrame` empieza su propio `exit`.
 *
 * Hereda directamente la lección aprendida con la presentación por caras del
 * cubo (retirada esta pasada, ver comentario junto a `PLATFORM_BEATS`):
 * "Durante READ HOLD: camera position exacta, camera quaternion exacta. No
 * lerp residual" — el riel (`createPlatformCameraRail`) es una Catmull-Rom
 * continua que nunca deja de moverse ni un poco mientras el progreso avanza,
 * así que sin esto la cámara seguía derivando durante la lectura de una
 * estación aunque el glifo y el texto (`stationArrival`/`conceptFrame`) ya
 * estuvieran fijos en su lugar. No se reutiliza `readingHold` para esto a
 * propósito: esa función alarga la cola de INCLUSIÓN (`INCLUSION_TAIL_END`)
 * para proteger el cruce hacia `CORE_EXIT`, un ajuste fino ya validado esta
 * sesión para el nucleo/haz — mezclarlo con el congelado de cámara movería
 * ese mismo tramo de `INCLUSION_RELEASE` sin necesidad. Esta función usa el
 * propio `window` de la estación, sin cola añadida.
 */
export function stationCameraFreezeWeight(progress: number): number {
  for (const concept of CONCEPTS) {
    const [from, to] = concept.window
    const span = to - from
    if (progress < from || progress > to) continue
    const rampIn = smootherstep(from, from + span * CONCEPT_ENTER_END, progress)
    const rampOut = 1 - smootherstep(from + span * CONCEPT_EXIT_START, to, progress)
    return Math.min(rampIn, rampOut)
  }
  return 0
}

/**
 * Progreso absoluto al que debe muestrearse el riel para obtener la pose
 * "congelada" de la estación activa en `progress` — el centro de su propio
 * tramo, ver `stationCameraFreezeWeight`. Fuera de cualquier estación
 * devuelve el propio `progress` sin tocar (el peso ya es 0 ahí).
 */
export function stationCameraFreezePoint(progress: number): number {
  for (const concept of CONCEPTS) {
    const [from, to] = concept.window
    if (progress < from || progress > to) continue
    return (from + to) / 2
  }
  return progress
}

/**
 * Progreso real de la clave `CUBE_HOLD` en `lib/platform/camera-rail.ts`
 * (`B.ACTIVATION[0] - 0,012`) — no puede importarse directamente (ese
 * archivo ya importa de éste), así que se repite la misma fórmula,
 * documentada aquí igual que `INCLUSION_TAIL_END` ya repite el offset de
 * `CORE_EXIT_INNER`.
 */
const CUBE_HOLD_PROGRESS = PLATFORM_BEATS.ACTIVATION[0] - 0.012

/**
 * Auditoría en vivo, verbatim (tras retirar la presentación por caras):
 * "al scrollear sigue directo dando vueltas el cubo sin sentido". El cubo ya
 * no gira (`faceRotation` se eliminó) — lo que seguía "dando vueltas" es la
 * CÁMARA: `CHAMBER_ENTER`→`CHAMBER_HOLD`→`APPROACH_MID`→`CUBE_HOLD` recorre
 * ~15,5 u en X mientras el objetivo se queda casi fijo sobre el cubo, un
 * arco orbital deliberado (para que la sala grande se vea "de canto" y no
 * llene el encuadre con la base) que antes tenía sentido narrativo porque
 * terminaba en la presentación por caras — sin ella, el mismo arco llega
 * hasta el final de `CUBE_APPROACH` sin ninguna pausa real, así que el
 * "brazo" de la cámara sigue en pleno movimiento angular justo cuando
 * `DISASSEMBLY` debería sentirse como una llegada, no como una barrida más.
 *
 * Mismo mecanismo que `stationCameraFreezeWeight` (rampa de entrada/salida,
 * no un `clamp` binario — la lección de las estaciones interiores, y antes
 * de eso, de la presentación por caras), aplicado a un solo instante:
 * `CUBE_HOLD`. Le da al cubo un instante de verdad quieto — cámara Y target
 * fijos— inmediatamente antes de que `ACTIVATION`/`DISASSEMBLY` tomen el
 * relevo, en vez de seguir barriendo hasta el último momento.
 */
export function cubeHoldFreezeWeight(progress: number): number {
  const rampIn = smootherstep(CUBE_HOLD_PROGRESS - 0.016, CUBE_HOLD_PROGRESS - 0.004, progress)
  const rampOut = 1 - smootherstep(CUBE_HOLD_PROGRESS + 0.004, CUBE_HOLD_PROGRESS + 0.016, progress)
  return Math.max(0, Math.min(rampIn, rampOut))
}

/** Progreso al que congelar la cámara mientras `cubeHoldFreezeWeight` > 0 — ver esa función. */
export function cubeHoldFreezePoint(): number {
  return CUBE_HOLD_PROGRESS
}

/*
  Llegada real de cámara (punto 4 del pedido — "sincronizar texto con cada
  parada"). `concept.window` da la forma de entrada/salida y el orden de
  revelado, pero es sólo una ventana de progreso: si el riel de cámara se
  retoca más adelante (como ya pasó una vez esta misma sesión con
  `CORE_EXIT_OUTER`), la ventana puede desincronizarse del punto donde la
  cámara realmente está mirando. Esta función mide la distancia entre el
  target real de cámara (`PlatformSceneState.cameraTarget`, escrito cada
  fotograma por `DirectedCameraRig`) y el ancla física de la estación
  (`STATION_ANCHORS` en `lib/platform/camera-rail.ts`, el mismo punto que ya
  usa el propio keyframe de esa estación como `target`) y la convierte en un
  0–1 que sirve para confirmar la llegada antes de dejar pasar cualquier
  revelado — se usa igual desde el texto (`platform-chapter.tsx`) y desde el
  glifo (`platform-glyphs.tsx`), así que ambos se encienden en el mismo
  instante exacto.
*/
const ARRIVAL_NEAR = 0.35
const ARRIVAL_FAR = 1.15

export function stationArrival(target: readonly [number, number, number], anchor: readonly [number, number, number]) {
  const dx = target[0] - anchor[0]
  const dy = target[1] - anchor[1]
  const dz = target[2] - anchor[2]
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return 1 - smootherstep(ARRIVAL_NEAR, ARRIVAL_FAR, distance)
}

export function conceptFrame(progress: number, window: readonly number[]) {
  const [from, to] = window
  const span = to - from
  const local = clamp01((progress - from) / span)
  const enter = smootherstep(0, CONCEPT_ENTER_END, local)
  const exit = 1 - smootherstep(CONCEPT_EXIT_START, 1, local)
  return {
    local,
    visibility: enter * exit,
    connector: smootherstep(0.04, 0.22, local),
    signal: smootherstep(0.14, 0.36, local),
    title: smootherstep(0.22, 0.42, local),
    body: smootherstep(0.34, 0.54, local) * exit,
  }
}

/**
 * INCLUSIÓN es la última estación, e inmediatamente después la cámara se
 * acerca al núcleo para `CORE_EXIT_INNER` (`camera-rail.ts`, progreso =
 * `CORE_EXIT[0] + 0,01`). Medido en vivo (sexta pasada, captura en
 * p=0,868/0,871/0,884): la atenuación de lectura llegaba a 0 justo en el
 * borde de la ventana de INCLUSIÓN (0,888 = inicio de CORE_EXIT) — el mismo
 * instante en que la cámara empieza a acercarse al núcleo sin ninguna
 * protección de por medio. Resultado, un fotograma quemado en p≈0,884-0,89
 * (núcleo + haz a brillo pleno con la cámara casi encima). Sólo para esta
 * última estación, la caída se alarga hasta más allá de ese punto de
 * llegada de la cámara en vez de cortar en el borde de su propia ventana —
 * así el relevo hacia CORE_EXIT parte de un núcleo ya atenuado, no de uno
 * recién despertado a brillo pleno.
 *
 * Primer intento: alargar sólo hasta `CORE_EXIT_INNER` (+0,01) arregló el
 * fotograma quemado de p≈0,884 pero DEJÓ OTRO en p≈0,888-0,898 — capturado
 * en vivo: justo ahí la atenuación de lectura ya soltó del todo (cae a 0 en
 * el punto de llegada) mientras `coreCrossWeight` (el segundo mecanismo de
 * atenuación, en `camera-rail.ts`/`platform-cast.tsx`, pensado para el
 * cruce físico de la cáscara) apenas empieza a subir desde 0 en ese mismo
 * instante (su ventana de salida es `[CORE_EXIT[0], CORE_EXIT[0]+0,02]`) —
 * un hueco entre los dos mecanismos, justo en el punto de máximo
 * acercamiento a cámara. Alargado a +0,02 para que la lectura no suelte del
 * todo hasta que `coreCrossWeight` ya esté a medio camino de su propio pico.
 */
const INCLUSION_TAIL_END = PLATFORM_BEATS.CORE_EXIT[0] + 0.02

/**
 * Cuánto manda la lectura de una estación, de 0 a 1.
 *
 * Mismo mecanismo que `lib/hero/timeline.ts::readingHold` — vale 1 en el
 * centro del tramo de esa estación y cae a 0 en sus bordes — pero leído
 * directamente de `CONCEPTS[].window`, que aquí ya es un tramo propio y no
 * una ventana con holgura calculada aparte.
 */
export function readingHold(progress: number) {
  const lastIndex = CONCEPTS.length - 1
  for (let i = 0; i < CONCEPTS.length; i++) {
    const concept = CONCEPTS[i]
    const [from, to] = concept.window
    const tailEnd = i === lastIndex ? INCLUSION_TAIL_END : to
    if (progress < from || progress > tailEnd) continue
    const edge = (to - from) * 0.28
    const rise = Math.min((progress - from) / edge, 1)
    const fall = Math.min((tailEnd - progress) / edge, 1)
    const weight = Math.min(rise, fall)
    return weight * weight * (3 - 2 * weight)
  }
  return 0
}

/**
 * Cuánto "dentro del núcleo" está el capítulo, de `CORE_ENTRY` a `CORE_EXIT`.
 *
 * Fuente única para todo lo que sólo debe existir durante la visita interior:
 * el piso de presencia de las estaciones (`stationRestFloor`) y el suavizado
 * de fondo del composer (ver `CinematicBloom` en `hero-scene.tsx`, punto 15
 * — "depth of field muy leve sólo en CORE_INTERIOR"). Un solo cálculo evita
 * que las dos lecturas se desincronicen si el ancho de `CORE_ENTRY`/
 * `CORE_EXIT` se retoca más adelante.
 */
export function coreInteriorWeight(progress: number) {
  const enter = smootherstep(at('CORE_ENTRY'), until('CORE_ENTRY'), progress)
  const exit = 1 - smootherstep(at('CORE_EXIT'), until('CORE_EXIT'), progress)
  return Math.min(enter, exit)
}

/**
 * Presencia de una estación mientras NO es la activa.
 *
 * Antes de esta reconstrucción cada glifo pasaba de 0 a 1 y volvía a 0: el
 * anterior desaparecía del todo al ceder el turno. Eso convertía el interior
 * del núcleo en una sala vacía entre estación y estación. Con un piso de
 * presencia, las cuatro quedan "acopladas" y visibles en su sitio del compás
 * — sólo la activa se enciende del todo — durante toda la visita interior.
 * Fuera de esa ventana no hay nada que atenuar: las estaciones ni siquiera
 * se montan.
 */
export function stationRestFloor(progress: number) {
  return 0.3 * coreInteriorWeight(progress)
}

/**
 * Curva de apertura del cubo.
 *
 * Reconocimiento primero (`ACTIVATION`, sin mover ninguna pieza), apertura
 * mecánica después (`DISASSEMBLY`), sostenida durante toda la visita al
 * interior y recogida en `CORE_EXIT`. El ancho de la meseta —de `CORE_ENTRY`
 * a `CORE_EXIT`, 0,34— es a propósito el tramo más largo del capítulo: es
 * donde vive el contenido explicativo y el hueco que abren las bandas tiene
 * que seguir ocupado por el núcleo todo ese tiempo (ver `Data Core` en
 * `platform-cast.tsx`).
 */
export const assemblyWeight = (progress: number) => {
  const open = smootherstep(at('DISASSEMBLY'), until('DISASSEMBLY'), progress)
  const close = 1 - smootherstep(at('CORE_EXIT'), until('CORE_EXIT'), progress)
  return Math.min(open, close)
}

/**
 * Cuánto ha convergido la nube de datos hacia el núcleo — punto 6 del pedido
 * ("rehacer salida": "energía converge → núcleo se estabiliza → anillo de
 * salida se ensambla"). `DataConvergence` (`platform-particles.tsx`) usaba
 * `assemblyWeight` directamente para su radio, así que en cuanto `close`
 * empezaba a bajar en `CORE_EXIT` las partículas YA CONVERGIDAS volvían a
 * separarse hacia su radio exterior — la cáscara se cierra y los datos se
 * dispersan de nuevo, justo lo contrario de "la energía converge" que pide
 * ese mismo tramo. Aquí sube con `open` (igual que `assemblyWeight`) pero NO
 * vuelve a caer con `close`: se queda arriba durante todo `CORE_EXIT` —los
 * datos permanecen concentrados mientras la cáscara se recompone a su
 * alrededor— y sólo se libera durante `PORTAL_EXIT`, absorbida por el propio
 * anillo de salida que esa energía recogida termina formando.
 */
export const dataGatherWeight = (progress: number) => {
  const open = smootherstep(at('DISASSEMBLY'), until('DISASSEMBLY'), progress)
  const absorbed = 1 - smootherstep(at('PORTAL_EXIT'), until('PORTAL_EXIT'), progress)
  return open * absorbed
}

/**
 * Aviso de apertura: sube DURANTE `ACTIVATION`, antes de que `assemblyWeight`
 * se mueva un solo píxel. Es lo que enciende costuras, acelera anillos y
 * adelanta el núcleo antes de la separación real (punto 4 del pedido).
 *
 * Bug real encontrado en vivo (quinta pasada): el segundo término apagaba
 * el peso recién en `CORE_EXIT` — así que entre el final de `ACTIVATION`
 * (0,373) y el principio de `CORE_EXIT` (0,888), `activationWeight` se
 * quedaba EN SU PICO (1) durante TODO el desensamblaje y las cuatro
 * estaciones interiores, no sólo durante el aviso breve que el propio
 * comentario describe. Como `activationPulse` (en `platform-cast.tsx`)
 * multiplica este peso por `sin(signal.time * 6)` —el RELOJ REAL, no el
 * progreso—, el resultado era una oscilación de brillo sin relación con el
 * scroll durante toda la visita interior: se midió opacidad > 1 en el
 * anillo de levitación (`levitationMaterial`) en un fotograma cualquiera,
 * capturado por casualidad en el pico del seno — la causa real del
 * fotograma quemado en blanco en INCLUSIÓN, no el núcleo ni el holograma
 * (ambos se investigaron primero y no eran la causa). Confinado ahora al
 * propio tramo de `ACTIVATION` más un margen corto de asentamiento, para
 * que el aviso siga siendo un aviso y no un parpadeo de fondo.
 */
export const activationWeight = (progress: number) =>
  smootherstep(at('ACTIVATION'), until('ACTIVATION'), progress)
  * (1 - smootherstep(until('ACTIVATION'), until('ACTIVATION') + 0.05, progress))

/**
 * Ventana del portal de entrada (cruce físico Inicio→Plataforma) y de salida
 * (Plataforma→Proceso). Comparten forma —una campana corta— para que
 * `PortalGate` (ver `components/platform/portal-gate.tsx`) pueda vestir los
 * dos con el mismo componente y sólo cambiar la paleta.
 */
export function entryPortalWeight(progress: number) {
  return smootherstep(0, 0.03, progress) * (1 - smootherstep(at('CHAMBER'), until('CHAMBER'), progress))
}

export function exitPortalWeight(progress: number) {
  return smootherstep(at('CORE_EXIT'), until('PORTAL_EXIT'), progress)
}

export function platformChapterLength(width: number) {
  if (width < 640) return 5.2
  if (width < 1024) return 6.2
  return 7.4
}
