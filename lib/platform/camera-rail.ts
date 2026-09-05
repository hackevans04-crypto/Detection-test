import * as THREE from 'three'
import { PLATFORM_BEATS, TRANSIT_ANALYSIS_INCLUSION, TRANSIT_EVAL_ORG, TRANSIT_ORG_ANALYSIS } from './timeline'

export type PlatformCameraKeyframe = {
  name: string
  progress: number
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  roll: number
}

/*
  Riel de cámara del capítulo 02 — segunda pasada.

  El primer fotograma sigue siendo, a propósito, idéntico a `HeroShot END` de
  `lib/hero/director.ts`: posición, target, FOV y roll. Esa igualdad es lo que
  hace que el relevo entre capítulos no se vea, y no se toca en esta pasada.

  Lo nuevo es el tramo central. Antes la cámara nunca dejaba de mirar el cubo
  DESDE FUERA — orbitaba, se acercaba, pero jamás cruzaba su cáscara. Ahora,
  a partir de `CORE_ENTRY`, la cámara entra físicamente: se acerca al núcleo
  hasta una distancia menor que su propio radio, y el tramo interior
  (`EVALUATION`…`INCLUSION`) la deja CERCA del centro del núcleo, panorámica
  entre las cuatro estaciones en compás en vez de orbitando el exterior. La
  salida deshace el mismo camino: `CORE_EXIT` la saca de vuelta afuera antes
  de que el portal se forme.

  Las claves conservan el estilo de la primera versión (comentario por
  decisión, no por línea): una Catmull-Rom con control points muy separados se
  comba entre ellos, así que cualquier retoque debe mantener el mismo tipo de
  progresión suave que ya tenían las claves aprobadas, no saltos de posición
  grandes entre vecinas.
*/
const B = PLATFORM_BEATS
const CORE_CENTER: [number, number, number] = [0, 0.12, -9]

/** Estaciones en compás alrededor del núcleo (arriba/izquierda/derecha/abajo). */
export const STATION_ANCHORS: Record<'evaluation' | 'organization' | 'analysis' | 'inclusion', [number, number, number]> = {
  evaluation: [0, 1.55, -9],
  organization: [-1.55, 0.12, -9],
  analysis: [1.55, 0.12, -9],
  inclusion: [0, -1.3, -9],
}

export const PLATFORM_CAMERA_KEYFRAMES: readonly PlatformCameraKeyframe[] = [
  /*
    La entrada es un avance, no un cabeceo. Recorre seis unidades y media
    metida en el corredor, con las paredes a 2,7 u: el fondo crece, las
    paredes pasan, y la sala se abre al salir. El primer fotograma sigue
    siendo idéntico a `HeroShot END`.
  */
  { name: 'HANDOFF', progress: B.HANDOFF[0], position: [0, -1.05, -1.4], target: [0, -1.18, -3], fov: 39.2, roll: 0 },
  { name: 'CORRIDOR', progress: 0.04, position: [0, -0.95, -2.9], target: [0, -0.82, -11.5], fov: 44, roll: 0.004 },
  { name: 'MOUTH', progress: 0.08, position: [0, -0.72, -4.6], target: [0, -0.5, -12], fov: 46, roll: -0.005 },
  /*
    TUNNEL_OPEN — encontrado con `tmp/check-tunnel-axis.mjs` (no forma parte
    del build): entre `MOUTH` (p=0,08) y `CHAMBER_ENTER` (antes en p=0,11) la
    Catmull-Rom saltaba en línea recta a un punto a 15,5 u de lado — el eje
    del túnel de entrada vive en x=0, y=-0,85 mientras el corredor
    (`corridorRoot`, fase de entrada en `platform-cast.tsx`) sigue montado,
    y ese salto directo hacía que la cámara se alejara del eje hasta 16,45 u
    MIENTRAS el túnel seguía siendo hasta un 56% opaco (`entryWeight`,
    `p=0,082-0,112`) — literalmente viendo la pared exterior del tubo desde
    fuera, confirmado en captura de pantalla. El túnel no termina de
    desvanecerse del todo hasta `p≈0,114` (`entryWeight` llega a 0 ahí); este
    punto se queda cerca del eje (0,3-0,5 u, mismo orden que `HANDOFF`/
    `CORRIDOR`/`MOUTH`) hasta ESE instante, abriendo apenas el ángulo hacia
    la sala — el giro grande hacia `CHAMBER_ENTER` (ver más abajo, movida a
    p=0,135 por la misma razón) pasa a ocurrir DESPUÉS de que el túnel ya es
    invisible, no mientras todavía se ve.
  */
  { name: 'TUNNEL_OPEN', progress: 0.115, position: [0.15, -0.55, -6.3], target: [0, -0.2, -13], fov: 46, roll: -0.004 },
  /*
    Platform Chamber (punto nuevo del pedido). El túnel ya no desemboca
    directo sobre el cubo: se abre a una sala grande y el cubo se ve
    pequeño y lejano, para que la aproximación que sigue tenga de dónde
    partir. `CHAMBER_HOLD` es una deriva muy leve sobre el mismo
    establishing, no un segundo punto de vista: el objetivo es que la sala
    se sienta viva (rieles de datos, niebla, partículas ya existentes)
    mientras se lee, sin que la cámara empiece a viajar todavía — eso es
    `CUBE_APPROACH`.

    Medido con capturas, dos rondas. La primera (~14 u, target Y=-0,2 —casi
    a la altura de la propia base) dejaba la base mecánica llenando el
    encuadre. Subir cámara y target a la altura del CUBO ayudó, pero la
    base —6,4 u en su eje más largo, que corre en Z— seguía dominando: la
    cámara miraba casi de canto a lo largo de ESE MISMO eje (line-of-sight
    con más componente en Z que en X), así que el foreshortening estiraba
    sus 6,4 u hasta cruzar toda la pantalla en diagonal. La cámara ahora
    cruza ese eje casi perpendicular (componente en X mucho mayor que en
    Z): la base se ve de canto, pequeña, y dentro del encuadre cabe la
    sala.

    Progreso adelantado de `B.CHAMBER[0]+0,01` (0,11) a 0,14 — con
    `TUNNEL_OPEN` de por medio (arriba) este giro grande hacia el lateral
    ahora empieza cuando el túnel de entrada ya lleva ~0,025 de progreso
    invisible del todo, en vez de cuando todavía se veía al 5%. 0,14 en vez
    de 0,135: mismo margen de seguridad del eje, pero deja un poco más de
    espacio antes de `CHAMBER_HOLD` (0,152) y de paso devuelve el peor giro
    de todo el riel a 13,36° (0,135 lo subía a 13,87° en este mismo tramo).
  */
  { name: 'CHAMBER_ENTER', progress: 0.14, position: [-15.5, 4.6, -3], target: [0, 0.4, -9], fov: 46, roll: -0.012 },
  { name: 'CHAMBER_HOLD', progress: B.CHAMBER[1] - 0.008, position: [-14, 4.9, -4.4], target: [0, 0.35, -9.1], fov: 45, roll: -0.007 },
  /*
    CUBE_APPROACH: el cubo crece porque la cámara se acerca, nunca porque
    su propia escala cambie (`cubeAssemblyRoot` mantiene su único `breath`
    de siempre en `platform-cast.tsx`, sin tocar). Un solo punto medio
    basta — la curva ya interpola suave entre `CHAMBER_HOLD` y `CUBE_HOLD`.
  */
  { name: 'APPROACH_MID', progress: (B.CUBE_APPROACH[0] + B.CUBE_APPROACH[1]) / 2, position: [-5.6, 2.6, -5.0], target: [0, 0.15, -9], fov: 43, roll: -0.004 },
  /*
    CUBE_HOLD — novena pasada: retirada la presentación por caras (ver
    `lib/platform/timeline.ts`), este punto ya no gira el CUBO entre cuatro
    posiciones de cámara casi iguales (`FACE_LOCK`/`FACE_ORGANIZATION_HOLD`/
    `FACE_ANALYSIS_HOLD`/`FACE_INCLUSION_HOLD`, retirados) — se queda uno
    solo, cerca del final de `CUBE_APPROACH`: el cubo entero, ya cerca, se
    deja ver un instante completo antes de que `ACTIVATION` empiece a
    encender costuras. Misma posición que tenía `FACE_LOCK` (a ~6,6 u con
    FOV 38 el cubo entero cabe con aire alrededor, ni se sale del encuadre
    ni lo llena por completo) — sigue siendo la pose correcta para "el cubo
    completo, centrado".

    Progreso: primer intento, exactamente en `B.CUBE_APPROACH[1]` (el mismo
    punto donde empieza `ACTIVATION`) — medido con
    `tmp/check-camera-continuity.mjs`: a sólo 0,006 de `RELEASE`, el salto de
    FOV (38→42) y posición se comprimía en ese tramo tan corto y el peor
    giro de TODO el riel subió a 19,4°/0,002 justo ahí (antes 13,36°, en otro
    tramo). La separación de `FACE_INCLUSION_HOLD` a `RELEASE` en la versión
    anterior era de 0,018 — tres veces más ancha —, así que este punto se
    adelanta a `B.ACTIVATION[0] - 0,012` para conservar esa misma holgura en
    vez de apretarla contra el borde exacto del tramo.
  */
  { name: 'CUBE_HOLD', progress: B.ACTIVATION[0] - 0.012, position: [0, 0.16, -2.45], target: CORE_CENTER, fov: 38, roll: 0 },
  /*
    RELEASE: puente hacia `ACTIVATE`. Sin este punto intermedio la cámara
    saltaba de los ~6,6 u de `CUBE_HOLD` a los ~7,55 u de `ACTIVATE` en muy
    poco progreso — la misma clase de mal-espaciado que ya produjo un bulto
    de Catmull-Rom antes en esta sesión. Se retrocede a un plano medio del
    cubo completo antes de que `ACTIVATE` tome el relevo sin tocar su propia
    clave.
  */
  { name: 'RELEASE', progress: B.ACTIVATION[0] + 0.006, position: [-3.6, 1.35, -4.9], target: [0, 0, -9], fov: 42, roll: -0.006 },
  /*
    ACTIVATION: la cámara casi no viaja — el mecanismo despierta delante de
    ella, no al perseguirla. Un arco muy corto es lo que distingue "estoy
    mirando cómo se enciende" de "ya me estoy moviendo hacia la explosión".
  */
  { name: 'ACTIVATE', progress: (B.ACTIVATION[0] + B.ACTIVATION[1]) / 2, position: [-7.1, 2.5, -8], target: [0, -0.4, -9], fov: 41, roll: 0.01 },
  { name: 'TOP_ARC', progress: B.DISASSEMBLY[0] + 0.01, position: [-6.2, 3, -13.2], target: [0, 0.05, -9], fov: 41, roll: 0.018 },
  { name: 'EXPLOSION', progress: (B.DISASSEMBLY[0] + B.DISASSEMBLY[1]) / 2, position: [-4.1, 2.9, -15.4], target: [0, 0.2, -9], fov: 42, roll: 0.012 },
  // El hueco ya está abierto y el núcleo, crecido: la cámara se acerca a
  // mirarlo de frente antes de cruzarlo.
  { name: 'CORE_REVEAL', progress: (B.CORE_REVEAL[0] + B.CORE_REVEAL[1]) / 2, position: [-3.1, 1.2, -11.2], target: [0, 0.12, -9], fov: 40, roll: 0.004 },
  /*
    CORE_ENTRY: cruce físico. La distancia al centro del núcleo baja de ~2,4 u
    a ~0,9 u —dentro de su propio radio crecido—, así que la cáscara del
    núcleo pasa por delante del objetivo de la cámara. `platform-cast.tsx`
    lee este mismo tramo para el pulso de refracción del material.
  */
  { name: 'CORE_ENTRY_OUTER', progress: B.CORE_ENTRY[0], position: [-1.5, 0.55, -10.2], target: CORE_CENTER, fov: 40, roll: -0.004 },
  /*
    Segunda medida: a ~1,1 u del centro, no ~0,8. El primer ajuste (0,8)
    seguía dejando la cámara dentro del radio del núcleo en el pico de
    `coreCrossWeight` (~0,87 u con el tamaño de entonces) — un muro blanco.
    Bajado además el tamaño/emisivo del núcleo en su pico (ver
    `platform-cast.tsx`, radio ahora ≈0,71 u), 1,1 la deja claramente fuera
    en el reposo de esta clave. El cruce real —atravesar la cáscara— pasa en
    TRÁNSITO, viajando entre `CORE_ENTRY_OUTER` y ésta, no en ningún reposo:
    ahí es donde el pulso de refracción y el FOV/aberración deben notarse,
    no en un fotograma fijo empotrado en la malla.
  */
  { name: 'CORE_ENTRY_INNER', progress: (B.CORE_ENTRY[0] + B.CORE_ENTRY[1]) / 2, position: [-0.73, 0.49, -9.73], target: CORE_CENTER, fov: 46, roll: 0 },
  /*
    CORE_ARRIVAL: sin este punto la curva "seguía coasteando" hacia dentro
    entre `CORE_ENTRY_INNER` y `STATION_EVALUATION` — medido con
    `scripts/platform-rail-report.mjs` (`?heroDebug=1`): a p≈0,649 la cámara
    pasaba a sólo 0,31 u del centro del núcleo, MÁS CERCA que cualquiera de
    los dos fotogramas de reposo que la rodean (1,10 u y 0,98 u) — el clásico
    "bulto" de Catmull-Rom entre dos puntos cuya tangente sigue apuntando
    hacia dentro. Confirmado en pantalla: `?platformTest=1&p=0.65` salía
    lavado en blanco, igual que el cruce físico de `CORE_ENTRY`, pero sin ser
    el cruce.

    El arreglo no es sólo alejar el punto —eso sólo desplazaba el bulto—, es
    darle una dirección de llegada distinta a la de seguir entrando: sube
    hacia la altura del ancla de Evaluación (`STATION_ANCHORS.evaluation`,
    y=1,55) en vez de continuar en el plano del cruce, así que la tangente en
    `CORE_ENTRY_INNER` ya no sigue tirando hacia el centro. Probado con una
    búsqueda de candidatos (mismo script, variando posición): este punto deja
    0,79 u de margen en el tramo [0,596, 0,708] —el bulto desaparece del
    todo, no sólo baja del umbral.
  */
  /*
    Progreso relativo a `CORE_ENTRY`, no un número suelto — la quinta pasada
    ya movió los límites de los tramos una vez (0,66 pasó a caer casi encima
    de `CORE_ENTRY_INNER` en vez de entre ella y `STATION_EVALUATION`) y un
    literal fijo se habría vuelto a desincronizar. `+0,013` conserva la misma
    posición RELATIVA (68% del camino entre las dos claves vecinas) que medí
    al elegir este candidato.
  */
  { name: 'CORE_ARRIVAL', progress: B.CORE_ENTRY[1] + 0.013, position: [-0.35, 1.0, -8.45], target: [0, 1.1, -9], fov: 44.5, roll: -0.003 },
  /*
    Interior: la cámara se queda a menos de dos unidades del centro y ya no
    orbita el exterior — panea entre las cuatro anclas del compás
    (`STATION_ANCHORS`). Se queda del lado -Z (mirando hacia -Z, dentro de la
    estructura) todo el tramo, sin cruzar el eje, igual que hace el riel del
    cerebro en su propio tramo interior.
  */
  { name: 'STATION_EVALUATION', progress: (B.EVALUATION[0] + B.EVALUATION[1]) / 2, position: [0.1, -0.35, -8.15], target: STATION_ANCHORS.evaluation, fov: 44, roll: -0.006 },
  /*
    TRANSIT_* — décima pasada, ver comentario junto a `EVALUATION` en
    `timeline.ts`. Antes las cuatro estaciones eran contiguas y el giro de
    ~79° entre anclas vecinas (compás alrededor del núcleo) tenía que caber
    en ~0,03 de progreso, dando hasta 9,5-10,7°/0,001 con el texto todavía
    visible. `stationCameraFreezeWeight` no podía arreglarlo: el riel CRUDO
    ya viajaba a esa velocidad en ese hueco, congelar más rampa sólo
    revelaba más del mismo tramo veloz.
    Estas tres claves parten cada giro en dos: la posición es el punto medio
    entre las dos estaciones vecinas, y el target vuelve brevemente al
    centro del núcleo en vez de saltar directo de un ancla a la otra — dos
    giros de ~40° en vez de uno de ~79°, sobre un hueco de progreso dedicado
    (`STATION_GAP`) que antes no existía. FOV y roll neutros (iguales a las
    estaciones) para no sumar una tercera variable al mismo cambio.
  */
  { name: 'TRANSIT_EVAL_ORG', progress: TRANSIT_EVAL_ORG, position: [0.225, -0.075, -8.1], target: CORE_CENTER, fov: 44, roll: 0 },
  { name: 'STATION_ORGANIZATION', progress: (B.ORGANIZATION[0] + B.ORGANIZATION[1]) / 2, position: [0.35, 0.2, -8.05], target: STATION_ANCHORS.organization, fov: 44, roll: 0.01 },
  { name: 'TRANSIT_ORG_ANALYSIS', progress: TRANSIT_ORG_ANALYSIS, position: [0, 0.2, -8.05], target: CORE_CENTER, fov: 44, roll: 0 },
  { name: 'STATION_ANALYSIS', progress: (B.ANALYSIS[0] + B.ANALYSIS[1]) / 2, position: [-0.35, 0.2, -8.05], target: STATION_ANCHORS.analysis, fov: 44, roll: -0.01 },
  { name: 'TRANSIT_ANALYSIS_INCLUSION', progress: TRANSIT_ANALYSIS_INCLUSION, position: [-0.125, 0.375, -8.1], target: CORE_CENTER, fov: 44, roll: 0 },
  { name: 'STATION_INCLUSION', progress: (B.INCLUSION[0] + B.INCLUSION[1]) / 2, position: [0.1, 0.55, -8.15], target: STATION_ANCHORS.inclusion, fov: 44, roll: 0.006 },
  /*
    INCLUSION_RELEASE: auditoría externa (script de continuidad ad hoc,
    `tmp/check-camera-continuity.mjs`, no forma parte del build) midió hasta
    37° de giro en un solo paso de 0,002 entre `STATION_INCLUSION` y
    `CORE_EXIT_INNER` — el target salta de mirar hacia abajo (ancla de
    Inclusión, y=−1,3) a mirar al centro del núcleo (y=0,12) en apenas 0,04
    de progreso.

    Primer intento (a mano, target a medio camino): lo empeoró a 120°.
    Segundo intento (búsqueda en rejilla, sólo por ángulo): bajó el giro a
    24,6°, pero una auditoría posterior encontró que ese mismo punto
    acercaba la cámara al núcleo hasta 0,237 u —muy por debajo del radio
    seguro (~0,9 u que ya usan las estaciones estables)— y CAUSABA un
    fotograma quemado en blanco nuevo en p≈0,884, justo donde el texto de
    Inclusión seguía desvaneciéndose. Optimizar sólo el ángulo sin medir
    también distancia al núcleo trasladó un defecto (giro) a otro (blanco).

    Segundo punto (búsqueda ángulo+núcleo): 9,5° de giro máximo y 0,905 u de
    distancia mínima al núcleo — arregla lo anterior, pero `scripts/
    platform-rail-report.mjs` (que mide contra la malla REAL, no un punto
    algebraico) encontró un tercer defecto que ningún modelo por álgebra
    veía: la cámara pasaba a sólo 0,028 u de `Shell-1-1`, un panel de la
    cáscara fijo en [-1,74, 0,20, -9,52] durante toda la visita interior —
    prácticamente dentro de la malla, capturado en pantalla como un
    segundo fotograma quemado en p≈0,865-0,888 (distinto del de p≈0,884
    que arregló `INCLUSION_TAIL_END` en `lib/platform/timeline.ts`). La
    posición de ese panel no puede modelarse con un solo punto en la
    búsqueda por álgebra sin duplicar `cubeLayers()` — así que este punto
    se ajustó a mano CONTRA LA MEDICIÓN REAL (`tmp/rail-clearance-quick.mjs`,
    no forma parte del build), alejando la x del panel (-1,74) hacia +x, y
    reconfirmando después que el ángulo y la distancia al núcleo del punto
    anterior seguían intactos. Resultado: 0,475-0,625 u de holgura sólida
    en todo el tramo p=0,858-0,898 (antes 0,028 u en el peor punto), sin
    empeorar ni el giro (9,5° wide, igual que antes) ni el núcleo (0,83 u,
    por encima del umbral). El target se queda igual que en
    `STATION_INCLUSION` —mirando hacia abajo—; sólo la posición se adelanta,
    y el giro hacia el núcleo se reparte en el tramo que sigue.
  */
  { name: 'INCLUSION_RELEASE', progress: 0.8765, position: [-0.5, 0.8, -8.8], target: [0, -1.3, -9], fov: 44, roll: 0.003 },
  /*
    CORE_EXIT: deshace la entrada, saliendo por donde entró en vez de por el
    lado contrario — cruzar la cáscara una segunda vez tiene que sentirse
    como el mismo cruce en reversa, no como un atajo nuevo.
  */
  // Mismo ajuste de distancia que `CORE_ENTRY_INNER`, y por la misma razón:
  // ésta fue la otra causa del muro blanco medido en `core-exit` (0,48 u de
  // un núcleo de ~0,71 de radio es quedarse dentro de la malla).
  { name: 'CORE_EXIT_INNER', progress: B.CORE_EXIT[0] + 0.01, position: [-0.73, 0.49, -9.73], target: CORE_CENTER, fov: 44, roll: 0 },
  /*
    Medido con el panel de seguridad (`?platformDebug=1`): entre p=0.885 y
    p=0.900 la cámara pasaba a 0,61-0,69 u del "cubo modular" con ocupación
    de pantalla al 100% — la cáscara todavía está cerrándose (assemblyWeight
    baja de 0,35 a 0 en esa misma ventana) y su pieza más cercana cruzaba
    casi encima del riel. Alejar este punto un 40% a lo largo de la misma
    línea núcleo→cámara despeja la pieza sin tocar el ritmo (mismo progreso,
    sólo más lejos).
  */
  { name: 'CORE_EXIT_OUTER', progress: (B.CORE_EXIT[0] + B.CORE_EXIT[1]) / 2, position: [-3.14, 1.25, -12.14], target: [0, 0.13, -11], fov: 41, roll: 0.006 },
  /*
    PORTAL_TRANSIT: `tmp/check-camera-continuity.mjs` seguía marcando el
    peor giro de todo el riel (18,9°, p≈0,936) justo aquí — entre
    `CORE_EXIT_OUTER` (mirando casi hacia atrás, a z=-11) y `PORTAL_FORM`
    (mirando ya hacia delante, a z=-15,5) el target gira de golpe sin ningún
    punto intermedio. Encontrado por búsqueda en rejilla (mismo método que
    `INCLUSION_RELEASE`, `tmp/search-portal-form.mjs`, no forma parte del
    build): un punto a medio camino en posición Y TARGET reparte ese giro en
    dos pasos en vez de uno — 6,7° en el peor punto de todo el riel (antes
    18,9°), sin empeorar ningún otro tramo (comprobado de punta a punta, no
    sólo en esta ventana).
  */
  { name: 'PORTAL_TRANSIT', progress: 0.9155, position: [-2.6, 1.2, -12.8], target: [0, 0.2, -13], fov: 40.5, roll: 0.001 },
  /*
    PORTAL_FORM y REASSEMBLY miraban hacia atrás, al mismo punto donde vivía
    la instalación (cubo+núcleo, z −9/−12) mientras la cámara ya viajaba
    hacia −Z: capturado con `?platformTest=1`, de p=0,94 a p=0,985 el
    encuadre quedaba prácticamente negro —la instalación ya se ha apagado
    para entonces (ver `installationFade` en `platform-cast.tsx`) y los
    aros de salida, hijos de `corridorRoot`, viven mucho más adelante
    (z ≈ −22/−24, "por delante" según el comentario de `corridorRoot` más
    abajo en `platform-cast.tsx`)— así que la cámara miraba literalmente al
    lado contrario de donde está todo lo que hay que ver. El giro real
    hacia delante quedaba comprimido en el último 0,02 de progreso (hasta
    `EXIT`), un latigazo de cámara en vez de un giro sentido. Ahora el
    target avanza progresivamente hacia donde miran los aros —no de golpe
    en el último fotograma— para que la vuelta se sienta como un giro, no
    como un corte de escena.
  */
  { name: 'PORTAL_FORM', progress: (B.PORTAL_EXIT[0] + B.PORTAL_EXIT[1]) / 2, position: [0.8, 1.4, -13.8], target: [0, 0.12, -15.5], fov: 40, roll: -0.004 },
  { name: 'REASSEMBLY', progress: B.TUNNEL_EXIT[0] + 0.01, position: [1.1, 1.5, -15.4], target: [0, 0.08, -19], fov: 40, roll: 0.008 },
  // La salida vuelve al eje y se aleja de frente: el corredor se monta otra
  // vez por delante y el capítulo se va por donde entró.
  { name: 'EXIT', progress: 1, position: [0, 0.15, -16.2], target: [0, 0.05, -23], fov: 41, roll: 0 },
] as const

export const PLATFORM_EXIT_CAMERA = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.position
export const PLATFORM_EXIT_TARGET = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.target
export const PLATFORM_EXIT_FOV = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.fov
export const PLATFORM_EXIT_ROLL = PLATFORM_CAMERA_KEYFRAMES.at(-1)!.roll

/**
 * Convierte el progreso del capítulo en la coordenada de la curva.
 *
 * El riel se muestrea con `getPoint(progress-proporcional)`, no con
 * `getPointAt` (arco): `getPointAt` reparte por longitud de arco e ignora el
 * `progress` de cada clave, y eso fue el fallo de fondo de la primera
 * versión del riel (medido: a p=0,80 la cámara ya estaba fuera de sitio,
 * mirando de espaldas al cubo). Colocando la coordenada en
 * `(índice + t) / (n − 1)`, cada clave se alcanza exactamente en su
 * progreso.
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

/**
 * Peso de "cruce del núcleo": una campana centrada en `CORE_ENTRY`/`CORE_EXIT`
 * usada tanto por el material del núcleo (pulso de refracción, ver
 * `platform-cast.tsx`) como por el composer (pulso de FOV/bloom/aberración
 * cromática, ver `hero-scene.tsx`). Una sola fuente de verdad para las dos
 * lecturas: si algún día se retocan los anchos de `CORE_ENTRY`/`CORE_EXIT`,
 * los dos pulsos se mueven juntos.
 *
 * La rampa de salida empezaba a subir justo EN `CORE_EXIT[0]` (0,888) — el
 * mismo punto donde `CORE_EXIT_INNER` ya tiene a la cámara a ~0,83-0,9 u del
 * núcleo (ver `PLATFORM_CAMERA_KEYFRAMES`). Medido en vivo: entre que
 * `INCLUSION_TAIL_END` suelta del todo la atenuación de lectura (`timeline.ts`)
 * y que esta rampa alcanza un valor útil, hay un hueco de ~0,01 de progreso
 * con la cámara ya muy cerca y NINGUNO de los dos mecanismos atenuando
 * fuerte — fotograma quemado en p≈0,888-0,898, confirmado con captura de
 * pantalla incluso después de arreglar la holgura de cámara Y el propio haz
 * del núcleo. Adelantada a `CORE_EXIT[0] - 0,015`: para cuando la cámara
 * llega a `CORE_EXIT_INNER` (0,898) el peso ya va por ~0,8 en vez de ~0,5.
 */
export function coreCrossWeight(progress: number) {
  const enter = THREE.MathUtils.smoothstep(progress, B.CORE_ENTRY[0], (B.CORE_ENTRY[0] + B.CORE_ENTRY[1]) / 2)
    * (1 - THREE.MathUtils.smoothstep(progress, (B.CORE_ENTRY[0] + B.CORE_ENTRY[1]) / 2, B.CORE_ENTRY[1]))
  const exit = THREE.MathUtils.smoothstep(progress, B.CORE_EXIT[0] - 0.015, B.CORE_EXIT[0] + 0.02)
    * (1 - THREE.MathUtils.smoothstep(progress, B.CORE_EXIT[0] + 0.02, B.CORE_EXIT[0] + 0.05))
  return Math.max(enter, exit)
}
