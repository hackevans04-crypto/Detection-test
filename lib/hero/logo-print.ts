/**
 * Impresión de un logotipo con partículas.
 *
 * El logotipo no aparece: se imprime. Un cabezal cruza la caja en diagonal y,
 * a su paso, las partículas que esperaban detrás viajan hasta su píxel y se
 * quedan. Al salir manda el mismo cabezal, pero al revés y sin rebobinar: cada
 * partícula se suelta y se va por su cuenta.
 *
 * Dos decisiones sostienen el resto.
 *
 * 1. **El movimiento es una función pura del progreso.** No hay muelles, ni
 *    velocidades acumuladas, ni estado que sobreviva de un fotograma al
 *    siguiente. Este capítulo se recorre con la rueda y se puede volver atrás
 *    en cualquier punto: una simulación física daría una imagen distinta en
 *    cada pasada y, al retroceder, se vería el desorden de una explosión
 *    reproducida del revés. Con `posición = f(progreso, semilla)` el mismo
 *    progreso da siempre el mismo fotograma —hacia adelante y hacia atrás— y el
 *    arnés de capturas puede compararlo.
 *
 * 2. **El estado de reposo es la imagen real, no la nube.** Un escudo con
 *    filigrana dorada no lo reproduce ninguna nube de cuadraditos sin pagarlo
 *    en fotogramas. Las partículas son el tránsito: cuando terminan, la imagen
 *    original se funde por encima y sólo queda una décima parte de la nube
 *    flotando como polvo. La marca se lee nítida y el efecto no la degrada.
 *
 * El reloj alimenta únicamente la vida —el temblor del polvo, la turbulencia de
 * la fuga—, nunca la forma. Es la misma separación que usa la escena 3D entre
 * `progress` y `uTime`.
 *
 * Este módulo no importa de nadie, igual que `timeline.ts`: es un motor sobre
 * un `CanvasRenderingContext2D` y nada más. Quién decide *cuándo* imprime es el
 * capítulo, no el motor.
 */

/** Alfa mínima para que un píxel merezca una partícula. */
const OPAQUE = 24

/**
 * Cuantización de color al agrupar, por canal.
 *
 * Existe por una razón de dibujo, no de memoria: cambiar `fillStyle` obliga al
 * navegador a analizar una cadena de color, y hacerlo dos mil veces por
 * fotograma cuesta más que dibujar los dos mil cuadrados. Agrupando en pasos de
 * ocho niveles, el escudo entero cabe en unas decenas de cubos y el error de
 * color queda en ±4, invisible sobre una partícula de dos píxeles.
 */
const COLOR_STEP = 8

/** Fracción de la impresión que dura el viaje de UNA partícula. */
const SPAN = 0.44
/** Cuánto por detrás del cabezal nace la partícula, en px CSS. */
const LEAD = 22
/** Dispersión perpendicular al nacer, en px CSS. */
const SPREAD = 11
/** Amplitud de la curva del trayecto, en px CSS. Sin ella el viaje es una regla. */
const CURL = 12
/** Tamaño inicial, en múltiplos del final: la partícula llega enfocándose. */
const GROW = 1.8
/** Fracción de la disolución que dura la fuga de UNA partícula. */
const DISSOLVE_SPAN = 0.5
/**
 * Distancia de fuga, en px CSS.
 *
 * Estaba en 78 y era más de lo que el lienzo puede enseñar: la nube llegaba al
 * borde todavía opaca y se cortaba en un rectángulo perfectamente recto, que es
 * lo último que debe verse en una disolución. Con 46 la partícula se apaga
 * mientras aún viaja y el desvanecimiento de borde no tiene casi nada que hacer.
 */
const DRIFT = 46
/** Sesgo hacia arriba de la fuga. La nube sube, no se derrama. */
const LIFT = 0.62
/** Proporción de partículas que sobreviven al relevo como polvo. */
const DUST = 0.11
/**
 * Margen de desvanecimiento contra el borde del lienzo, en px CSS.
 *
 * El lienzo tiene que acabar en algún sitio y la tarjeta además recorta. Sin
 * este margen, cualquier partícula que llegue al canto desaparece de golpe y
 * delata la caja. Con él, la nube se apaga antes de tocarla y no hay caja.
 */
const EDGE = 10

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

/** PRNG determinista: la misma semilla reconstruye el mismo campo. */
function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Semilla estable a partir de una cadena: dos logotipos nunca comparten nube. */
export function seedFrom(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export type PrintFieldOptions = {
  /** Caja del logotipo, en px CSS. */
  width: number
  height: number
  /** Sangrado alrededor de la caja, en px CSS: por ahí entra y sale la nube. */
  bleed: number
  dpr: number
  /** Techo de partículas. Por encima, el paso de muestreo crece solo. */
  budget: number
  /** Inclinación del cabezal, en radianes. */
  angle: number
  seed: number
  /**
   * Paso de muestreo de partida, en píxeles de dispositivo.
   *
   * Un logotipo se lee por su silueta y tolera un paso grueso. Un texto de 12 px
   * no: sus astas miden tres o cuatro píxeles de dispositivo, y con el paso por
   * defecto le tocaba una sola partícula por asta y la palabra dejaba de
   * reconocerse mientras se imprimía. El techo de partículas sigue mandando por
   * encima de esto.
   */
  gap?: number
  /**
   * Proporción de partículas que se quedan flotando tras el relevo.
   *
   * Cero para el texto. Alrededor de una marca, el polvo es vida; alrededor de
   * un párrafo, es suciedad —y además obliga a seguir dibujando un campo que ya
   * no aporta nada, en vez de apagarlo del todo—.
   */
  dust?: number
}

export type PrintField = {
  /** Lienzo en píxeles de dispositivo, sangrado incluido. */
  canvasWidth: number
  canvasHeight: number
  /** Sangrado ya aplicado, en px CSS. */
  bleed: number
  dpr: number
  count: number
  /** Paso de muestreo elegido, en píxeles de dispositivo. */
  gap: number
  /** Proporción de partículas que sobreviven al relevo como polvo. */
  dust: number
  /** Reposo de cada partícula: x e y intercalados, en píxeles de lienzo. */
  home: Float32Array
  /** Turno de impresión, 0…1. Mezcla la coordenada de barrido con ruido. */
  delay: Float32Array
  size: Float32Array
  /** Opacidad de reposo, tomada del alfa del píxel. */
  alpha: Float32Array
  /** Tres canales de azar por partícula: rumbo, retardo fino y fase de vida. */
  seeds: Float32Array
  /** Índices agrupados por color, para no repintar `fillStyle`. */
  order: Uint32Array
  bucketAt: Uint32Array
  palette: string[]
  scan: {
    sx: number
    sy: number
    px: number
    py: number
    cx: number
    cy: number
    uMin: number
    reach: number
    /** Extensión de la marca PERPENDICULAR al barrido: el largo del cabezal. */
    vMin: number
    vMax: number
  }
  /** Geometría del fotograma en curso: x, y, tamaño, alfa y destello. */
  scratch: Float32Array
}

/**
 * Muestrea el logotipo y devuelve su campo de partículas.
 *
 * Devuelve `null` —y quien llama se queda con la imagen normal— cuando el
 * lienzo está contaminado por un origen ajeno, cuando la caja todavía no mide
 * nada o cuando el PNG no tiene píxeles suficientes. El efecto es un lujo: no
 * puede ser la razón de que una marca institucional no se vea.
 */
export function buildPrintField(source: CanvasImageSource, options: PrintFieldOptions): PrintField | null {
  const { width, height, bleed, dpr, budget, angle, seed } = options
  const dust = options.dust ?? DUST
  const logoW = Math.max(1, Math.round(width * dpr))
  const logoH = Math.max(1, Math.round(height * dpr))
  const pad = Math.round(bleed * dpr)

  const sampler = document.createElement('canvas')
  sampler.width = logoW
  sampler.height = logoH
  const sampleContext = sampler.getContext('2d')
  if (!sampleContext) return null
  sampleContext.drawImage(source, 0, 0, logoW, logoH)

  let data: Uint8ClampedArray
  try {
    data = sampleContext.getImageData(0, 0, logoW, logoH).data
  } catch {
    return null
  }

  const opaqueAt = (step: number) => {
    let found = 0
    for (let y = step >> 1; y < logoH; y += step) {
      for (let x = step >> 1; x < logoW; x += step) {
        if (data[(y * logoW + x) * 4 + 3] > OPAQUE) found += 1
      }
    }
    return found
  }

  /*
    El paso más fino que quepa en el presupuesto, no un número fijo.

    Un escudo con filigrana y un logotipo de dos palabras tienen densidades muy
    distintas: con un paso constante, uno sale como una nube sólida y el otro
    como cuatro puntos. Buscando el paso se consigue lo contrario —los dos
    llegan al mismo número de partículas— y el coste por fotograma deja de
    depender de qué imagen se haya puesto.
  */
  let gap = Math.max(1, Math.round(options.gap ?? dpr * 1.4))
  let total = opaqueAt(gap)
  while (total > budget && gap < 14) {
    gap += 1
    total = opaqueAt(gap)
  }
  if (total < 24) return null

  const random = mulberry32(seed)
  const home = new Float32Array(total * 2)
  const delay = new Float32Array(total)
  const size = new Float32Array(total)
  const alpha = new Float32Array(total)
  const seeds = new Float32Array(total * 3)
  const bucket = new Uint32Array(total)
  const slots = new Map<number, number>()
  const palette: string[] = []

  const sx = Math.cos(angle)
  const sy = Math.sin(angle)
  const jitter = gap * 0.34
  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  let index = 0

  for (let y = gap >> 1; y < logoH; y += gap) {
    for (let x = gap >> 1; x < logoW; x += gap) {
      const at = (y * logoW + x) * 4
      const cover = data[at + 3]
      if (cover <= OPAQUE) continue

      const s0 = random()
      const s1 = random()
      const s2 = random()
      /*
        La rejilla se rompe a propósito.

        Muestreada a paso fijo, la nube deja ver su celosía en cuanto las
        partículas se acercan a su sitio: se lee como una imagen pixelada, no
        como polvo que se posa. Un tercio de paso de desorden basta para que el
        ojo no encuentre la retícula y no llega a desdibujar la marca.
      */
      const hx = x + pad + (s0 - 0.5) * jitter
      const hy = y + pad + (s1 - 0.5) * jitter

      home[index * 2] = hx
      home[index * 2 + 1] = hy
      seeds[index * 3] = s0
      seeds[index * 3 + 1] = s1
      seeds[index * 3 + 2] = s2

      const weight = cover / 255
      size[index] = gap * (0.64 + weight * 0.4)
      alpha[index] = weight
      // Provisional: se guarda la coordenada de barrido y se normaliza al
      // final, cuando ya se conoce el recorrido completo del cabezal.
      delay[index] = hx * sx + hy * sy
      if (delay[index] < uMin) uMin = delay[index]
      if (delay[index] > uMax) uMax = delay[index]
      const v = hx * -sy + hy * sx
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v

      const r = data[at]
      const g = data[at + 1]
      const b = data[at + 2]
      const key = (((r / COLOR_STEP) | 0) << 16) | (((g / COLOR_STEP) | 0) << 8) | ((b / COLOR_STEP) | 0)
      let slot = slots.get(key)
      if (slot === undefined) {
        slot = palette.length
        slots.set(key, slot)
        const half = COLOR_STEP >> 1
        const cr = ((key >> 16) & 255) * COLOR_STEP + half
        const cg = ((key >> 8) & 255) * COLOR_STEP + half
        const cb = (key & 255) * COLOR_STEP + half
        palette.push('rgb(' + cr + ',' + cg + ',' + cb + ')')
      }
      bucket[index] = slot
      index += 1
    }
  }

  const reach = Math.max(uMax - uMin, 1)
  /*
    Turno de impresión: barrido con un cuarto de ruido.

    Con el turno puro el frente es una cuchilla —una línea perfecta de píxeles
    saltando a la vez— y parece un limpiaparabrisas. Con ruido puro no hay
    cabezal, sólo un fundido granulado. La mezcla 76/24 da un frente que se
    reconoce como una dirección y a la vez tiene grano, que es como se ve una
    impresión de verdad.
  */
  for (let i = 0; i < total; i += 1) {
    delay[i] = ((delay[i] - uMin) / reach) * 0.76 + seeds[i * 3 + 1] * 0.24
  }

  const bucketAt = new Uint32Array(palette.length + 1)
  for (let i = 0; i < total; i += 1) bucketAt[bucket[i] + 1] += 1
  for (let b = 0; b < palette.length; b += 1) bucketAt[b + 1] += bucketAt[b]
  const cursor = Uint32Array.from(bucketAt.subarray(0, palette.length))
  const order = new Uint32Array(total)
  for (let i = 0; i < total; i += 1) {
    order[cursor[bucket[i]]] = i
    cursor[bucket[i]] += 1
  }

  const cx = pad + logoW / 2
  const cy = pad + logoH / 2

  return {
    canvasWidth: logoW + pad * 2,
    canvasHeight: logoH + pad * 2,
    bleed,
    dpr,
    count: total,
    gap,
    dust,
    home,
    delay,
    size,
    alpha,
    seeds,
    order,
    bucketAt,
    palette,
    scan: { sx, sy, px: -sy, py: sx, cx, cy, uMin, reach, vMin, vMax },
    scratch: new Float32Array(total * 5),
  }
}

export type PrintFrame = {
  /** 0 = nada impreso, 1 = logotipo completo. */
  print: number
  /** 0 = intacto, 1 = disperso. Manda sobre `print`. */
  dissolve: number
  /** Cuánto ha tomado ya el relevo la imagen real, 0…1. */
  reveal: number
  /** Reloj del mundo, en segundos. Sólo alimenta la vida. */
  time: number
}

/**
 * Dibuja un fotograma del campo.
 *
 * Dos pasadas y ni una más. La primera pinta el cuerpo agrupado por color, con
 * `source-over`, para que el logotipo conserve sus tonos —el escudo es dorado y
 * en aditivo se va a blanco en cuanto dos partículas se rozan—. La segunda
 * pinta en aditivo sólo las que están destellando, que durante la impresión son
 * la banda estrecha que rodea al cabezal.
 */
export function drawPrintField(context: CanvasRenderingContext2D, field: PrintField, frame: PrintFrame) {
  const { canvasWidth, canvasHeight, count, home, delay, size, alpha, seeds, scratch, scan, dpr } = field

  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvasWidth, canvasHeight)
  context.globalAlpha = 1

  const print = clamp01(frame.print)
  const dissolve = clamp01(frame.dissolve)
  if (print <= 0) return

  const reveal = clamp01(frame.reveal)
  const time = frame.time
  const lead = LEAD * dpr
  const spread = SPREAD * dpr
  const curl = CURL * dpr
  const drift = DRIFT * dpr
  const edge = EDGE * dpr
  const { sx, sy, px, py, cx, cy } = scan

  for (let i = 0; i < count; i += 1) {
    const hx = home[i * 2]
    const hy = home[i * 2 + 1]
    const s0 = seeds[i * 3]
    const s1 = seeds[i * 3 + 1]
    const s2 = seeds[i * 3 + 2]
    const turn = delay[i]

    // Turno propio: 0 antes de que le toque, 1 al posarse.
    const local = clamp01((print * (1 + SPAN) - turn) / SPAN)
    const rest = 1 - local
    // easeOutCubic: sale disparada y frena. El frenado es lo que hace que se
    // «pose» en vez de chocar.
    const eased = 1 - rest * rest * rest
    const away = 1 - eased

    const back = lead * (0.5 + s0)
    const side = (s1 - 0.5) * spread * 2
    let x = hx + (-sx * back + px * side) * away
    let y = hy + (-sy * back + py * side) * away

    // Arco: el trayecto se comba y vuelve a cero exactamente al llegar.
    const arc = Math.sin(Math.PI * eased) * (s2 - 0.5) * curl * 2
    x += px * arc
    y += py * arc

    let a = alpha[i] * (local < 0.26 ? (local / 0.26) * (local / 0.26) : 1)
    let s = size[i] * (1 + (GROW - 1) * away)
    /*
      Destello de llegada.

      Es lo que separa «materializarse» de «aparecer con un fundido». Sube desde
      0,6, hace pico en 0,9 y vale exactamente cero al posarse, para que el
      logotipo en reposo no quede permanentemente encendido.
    */
    let flash = local >= 0.9 ? (1 - local) * 10 : Math.max(0, (local - 0.6) / 0.3)
    flash *= flash

    const dust = s0 < field.dust
    if (reveal > 0) {
      const wander = reveal * (dust ? 3.2 : 0.7) * dpr
      x += Math.sin(time * 0.9 + s1 * 6.283) * wander
      y += Math.cos(time * 1.15 + s2 * 6.283) * wander
      // El cuerpo se apaga porque ya lo cuenta la imagen real; el polvo se
      // queda respirando alrededor.
      a *= dust
        ? (0.6 + 0.4 * Math.sin(time * 1.8 + s2 * 6.283)) * (1 - reveal * 0.3)
        : 1 - reveal
      if (dust) s *= 1 + reveal * 0.3
    }

    if (dissolve > 0) {
      // Barrido inverso: el mismo cabezal, ahora borrando.
      const gone = clamp01((dissolve * (1 + DISSOLVE_SPAN) - (1 - turn)) / DISSOLVE_SPAN)
      if (gone > 0) {
        const push = gone * gone
        let ox = hx - cx
        let oy = hy - cy
        const length = Math.sqrt(ox * ox + oy * oy) || 1
        ox /= length
        oy /= length
        // Rumbo: hacia fuera del centro, girado por su semilla. Radial puro
        // parece una onda expansiva; girado, parece que cada una decide.
        const spin = (s0 - 0.5) * 2.2
        const ca = Math.cos(spin)
        const sa = Math.sin(spin)
        const fly = push * drift * (0.45 + s1 * 1.1)
        x += (ox * ca - oy * sa) * fly + Math.sin(time * 2.2 + s2 * 6.283) * push * 8 * dpr
        y += (ox * sa + oy * ca) * fly
          - push * drift * LIFT * (0.3 + s2 * 0.9)
          + Math.cos(time * 1.6 + s1 * 6.283) * push * 6 * dpr
        s *= 1 + push * 1.1
        a *= 1 - gone * gone
        const spark = gone < 0.24 ? 1 - gone / 0.24 : 0
        flash = Math.max(flash, spark * spark)
      }
    }

    // El lienzo no puede notarse. Lo que se acerca al canto se apaga antes de
    // llegar, así que ninguna partícula desaparece con un corte recto.
    const nearX = Math.min(x, canvasWidth - x)
    const nearY = Math.min(y, canvasHeight - y)
    const near = (nearX < nearY ? nearX : nearY) / edge
    if (near < 1) a *= near > 0 ? near : 0

    const slot = i * 5
    scratch[slot] = x
    scratch[slot + 1] = y
    scratch[slot + 2] = s
    scratch[slot + 3] = a
    scratch[slot + 4] = flash
  }

  const { palette, bucketAt, order } = field
  context.globalCompositeOperation = 'source-over'
  for (let b = 0; b < palette.length; b += 1) {
    const end = bucketAt[b + 1]
    let painted = false
    for (let k = bucketAt[b]; k < end; k += 1) {
      const slot = order[k] * 5
      const a = scratch[slot + 3]
      if (a <= 0.006) continue
      if (!painted) {
        context.fillStyle = palette[b]
        painted = true
      }
      const s = scratch[slot + 2]
      context.globalAlpha = a > 1 ? 1 : a
      context.fillRect(scratch[slot] - s * 0.5, scratch[slot + 1] - s * 0.5, s, s)
    }
  }

  context.globalCompositeOperation = 'lighter'
  context.fillStyle = '#dff6ff'
  for (let i = 0; i < count; i += 1) {
    const slot = i * 5
    const f = scratch[slot + 4]
    if (f <= 0.02) continue
    const a = scratch[slot + 3]
    if (a <= 0.01) continue
    const glow = f * a * 1.4
    context.globalAlpha = glow > 1 ? 1 : glow
    const s = scratch[slot + 2] * (1 + f * 1.6)
    context.fillRect(scratch[slot] - s * 0.5, scratch[slot + 1] - s * 0.5, s, s)
  }

  /*
    El cabezal.

    Sin él hay una nube que se ordena; con él hay una máquina que la ordena. Se
    dibuja en el frente donde las partículas se POSAN —no donde nacen—, porque
    ése es el borde que el ojo lee como «hasta aquí ya está impreso».
  */
  if (print < 1) {
    const intensity = Math.min(print / 0.1, (1 - print) / 0.12, 1)
    if (intensity > 0) drawHead(context, field, print * (1 + SPAN) - SPAN, intensity)
  }
  if (dissolve > 0 && dissolve < 1) {
    const intensity = Math.min(dissolve / 0.1, (1 - dissolve) / 0.14, 1)
    if (intensity > 0) drawHead(context, field, 1 - dissolve * (1 + DISSOLVE_SPAN), intensity * 0.75)
  }

  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
}

/**
 * Barra de luz en el frente de impresión, situada por turno.
 *
 * Mide lo que mide la marca, no lo que mide el lienzo. Con la diagonal del
 * lienzo —que es bastante mayor que el logotipo, porque incluye el sangrado por
 * los cuatro lados— la barra cruzaba la tarjeta entera de arriba abajo y no se
 * leía como un cabezal, sino como un arañazo diagonal sobre el panel.
 *
 * Y se apaga en las puntas. Una barra con los extremos cortados a escuadra
 * vuelve a delatar una caja; con las puntas fundidas parece luz.
 */
function drawHead(context: CanvasRenderingContext2D, field: PrintField, turn: number, intensity: number) {
  const { scan, dpr } = field
  // Inversa de la mezcla 76/24 que reparte los turnos: del turno al barrido.
  const u01 = (turn - 0.12) / 0.76
  if (u01 < -0.06 || u01 > 1.06) return

  const margin = 9 * dpr
  const length = scan.vMax - scan.vMin + margin * 2
  const u = scan.uMin + scan.reach * u01
  const v = (scan.vMin + scan.vMax) / 2
  const glow = 20 * dpr
  const core = 1.4 * dpr

  context.save()
  context.globalCompositeOperation = 'lighter'
  context.translate(scan.sx * u + scan.px * v, scan.sy * u + scan.py * v)
  context.rotate(Math.atan2(scan.sy, scan.sx))

  /*
    Estela: una elipse, no un rectángulo con degradado.

    Con el rectángulo, el degradado suavizaba el lado largo pero las dos puntas
    seguían cortadas a escuadra, y sobre el fondo oscuro del panel se veía
    literalmente una plancha gris girada catorce grados al lado del logotipo. La
    elipse se apaga en todas las direcciones porque el degradado es radial; el
    `scale` sólo la estira hasta el largo del cabezal.
  */
  context.save()
  context.translate(-glow * 0.4, 0)
  context.scale(1, length / (glow * 2))
  const trail = context.createRadialGradient(0, 0, 0, 0, 0, glow)
  trail.addColorStop(0, 'rgba(150, 236, 255, 0.26)')
  trail.addColorStop(0.5, 'rgba(90, 212, 255, 0.11)')
  trail.addColorStop(1, 'rgba(60, 190, 255, 0)')
  context.globalAlpha = intensity
  context.fillStyle = trail
  context.fillRect(-glow, -glow, glow * 2, glow * 2)
  context.restore()

  // Filamento: fundido en las dos puntas.
  const filament = context.createLinearGradient(0, -length / 2, 0, length / 2)
  filament.addColorStop(0, 'rgba(214, 246, 255, 0)')
  filament.addColorStop(0.22, 'rgba(226, 250, 255, 0.5)')
  filament.addColorStop(0.78, 'rgba(226, 250, 255, 0.5)')
  filament.addColorStop(1, 'rgba(214, 246, 255, 0)')
  context.globalAlpha = intensity * 0.8
  context.fillStyle = filament
  context.fillRect(-core * 0.5, -length / 2, core, length)
  context.restore()
}
