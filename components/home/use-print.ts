'use client'

import { useEffect, useLayoutEffect, type MutableRefObject, type RefObject } from 'react'
import { smoothstep, smootherstep, type HeroSceneState } from '@/lib/hero/depth'
import { buildPrintField, drawPrintField, seedFrom, type PrintField } from '@/lib/hero/logo-print'
import { scrollContext } from './smooth-scroll'

/* ------------------------------------------------------------- conductor */

type Ticker = (delta: number, now: number) => void

/**
 * Un solo `requestAnimationFrame` para todas las impresiones de la página.
 *
 * Son nueve: dos logotipos, tres líneas de titular, el párrafo de portada y los
 * textos institucionales. Con un bucle propio cada uno, el navegador reparte el
 * fotograma entre nueve devoluciones de llamada que además leen el reloj por su
 * cuenta, así que cada campo avanzaba con un `delta` ligeramente distinto y el
 * escalonado entre líneas dejaba de ser exacto. Con un conductor único, todos
 * ven el MISMO instante y el mismo paso de tiempo.
 *
 * El bucle no existe mientras no haya nada que conducir.
 */
const tickers = new Set<Ticker>()
let frame = 0
let previous = 0

function pump() {
  frame = requestAnimationFrame(pump)
  const now = performance.now()
  /*
    Techo de 0,1 s.

    Existe para que volver a una pestaña dormida no adelante la impresión de
    golpe. Recortando a 0,05 s, en cambio, cualquier equipo por debajo de 20 fps
    reproducía el efecto a cámara lenta: medido en el arnés —que mueve la escena
    a 10 fps—, la secuencia completa pasaba de 1,7 s a 3,4 s.
  */
  const delta = Math.min((now - previous) / 1000, 0.1)
  previous = now
  for (const ticker of tickers) ticker(delta, now)
}

function join(ticker: Ticker) {
  tickers.add(ticker)
  if (frame === 0) {
    previous = performance.now()
    frame = requestAnimationFrame(pump)
  }
  return () => {
    tickers.delete(ticker)
    if (tickers.size === 0 && frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}

/* ----------------------------------------------------------- disparadores */

/*
  El reparto de responsabilidades del efecto: el SCROLL decide QUE se imprime,
  el TIEMPO decide CUÁNTO TARDA.

  Enganchar la impresión al progreso como si fuera un carril —que es lo natural
  en este capítulo, donde todo lo demás lo está— no funciona aquí, y las dos
  formas de intentarlo fallan por lados opuestos. Con una ventana ancha, el
  usuario suelta la rueda dentro de ella y el texto se queda para siempre al
  79 %, con el cabezal parado encima: no parece una pausa, parece una impresora
  atascada. Con una ventana estrecha, un solo golpe de rueda la cruza entera
  entre dos fotogramas y no se ve nada.

  Medido: un notch de Chrome mueve 0,019–0,022 de progreso en esta página, y las
  posiciones de reposo caen prácticamente al azar respecto a cualquier ventana
  de ese tamaño. No hay anchura que salve las dos cosas.

  Así que la ventana deja de ser un carril y pasa a ser un INTERRUPTOR con
  histéresis: al cruzar el 62 % se enciende, y no se apaga hasta bajar del 34 %.
  Entre esos dos valores no pasa nada, que es lo que impide que un temblor de
  trackpad encienda y apague la impresión. La marcha atrás se conserva entera:
  al subir por encima del bloque, lo impreso se despinta por el mismo camino.
*/
const LATCH_ON = 0.62
const LATCH_OFF = 0.34

/**
 * Seguidor de dos polos, en segundos.
 *
 * Un solo polo arranca a velocidad máxima: el cabezal aparece ya lanzado. En
 * cascada, el primero redondea la salida y el segundo la posada, así que la
 * impresión entra y sale de escena como un movimiento y no como un salto
 * amortiguado. El total ronda 1,1 s de materialización visible.
 */
const PRINT_LEAD = 0.16
const PRINT_SETTLE = 0.2
/** La salida es más corta: no puede arrastrarse hasta el capítulo siguiente. */
const DISSOLVE_LEAD = 0.1
const DISSOLVE_SETTLE = 0.13

/** Reintento del muestreo cuando la caja todavía no estaba lista, en ms. */
const RETRY = 260
/**
 * Plazo tras el cual una pieza que no ha podido muestrearse se enseña tal cual.
 *
 * El contenido se esconde ANTES de saber si el efecto va a funcionar, porque
 * esperar a saberlo obliga a pintar un fotograma con el titular visible y otro
 * con él escondido, y eso es un parpadeo. La contrapartida es este plazo: si
 * pasado kilo y medio de segundo no hay campo —fuente que no carga, lienzo
 * contaminado, caja sin medidas—, se devuelve la visibilidad y no se vuelve a
 * hablar del asunto. Un efecto no puede dejar una marca institucional invisible.
 */
const FALLBACK = 1500

/*
  Nada se muestrea antes de que las fuentes estén.

  Un rasterizado hecho con la tipografía de reserva no se parece al texto que
  acabará debajo —otra anchura, otro trazo—, así que el relevo entre la nube y
  el texto real se vería como un cambio de fuente en mitad de la impresión.
*/
let fontsReady = typeof document === 'undefined' || !document.fonts
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.ready.then(() => { fontsReady = true }).catch(() => { fontsReady = true })
}

/*
  La portada no se imprime hasta que se abre el telón.

  Sin esto, `'load'` disparaba al montar y la impresión entera ocurría detrás
  del velo de arranque: cuando la pantalla de carga se retiraba, el titular
  llevaba ya un segundo montado. El aviso lo da `HeroBoot` al empezar su
  fundido. El plazo de seguridad cubre que el velo no llegue a montarse nunca
  —otra página, otro montaje—; va por encima de su propio tope de 9 s.
*/
let curtain = false
if (typeof window !== 'undefined') {
  curtain = (window as unknown as { __heroCurtain?: boolean }).__heroCurtain === true
  window.addEventListener('hero:curtain', () => { curtain = true }, { once: true })
  window.setTimeout(() => { curtain = true }, 10000)
}

/** `useLayoutEffect` en cliente, `useEffect` en el servidor: sin avisos y sin parpadeo. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Cuándo se dispara una impresión.
 *
 * `'load'` imprime en cuanto el campo está listo, sin mirar el scroll: es lo que
 * necesita la portada, que ya está en pantalla cuando la página abre. Una
 * ventana de progreso es lo que necesita todo lo que llega scrolleando.
 */
export type PrintTrigger = readonly [number, number] | 'load'

export type PrintOptions = {
  /** Elemento que posiciona el lienzo. Debe crear contexto (`position`). */
  host: RefObject<HTMLElement | null>
  /** Lo que se imprime: la imagen o el cuerpo de texto dentro del host. */
  target: (host: HTMLElement) => HTMLElement | null
  /** Produce los píxeles a muestrear, o `null` si todavía no se puede. */
  sample: (target: HTMLElement, width: number, height: number, dpr: number) => CanvasImageSource | null
  /** Semilla estable: dos piezas nunca comparten nube. */
  seed: string
  print: PrintTrigger
  dissolve: readonly [number, number]
  /** Retraso propio, en segundos. Aquí vive el escalonado entre piezas. */
  lag?: number
  /** Inclinación del cabezal, en grados. */
  angle?: number
  /** Sangrado del lienzo, en px CSS. Por defecto, proporcional a la caja. */
  bleed?: number
  budget?: number
  /** Paso de muestreo de partida, en píxeles de dispositivo. */
  gap?: number
  /** Polvo que sobrevive al relevo. Cero apaga el campo en reposo. */
  dust?: number
  /** Reloj del capítulo y modo determinista. */
  signal?: MutableRefObject<HeroSceneState>
}

/**
 * Imprime el contenido de un elemento con partículas.
 *
 * El elemento real —la imagen o el texto— no es decorativo ni un respaldo: es
 * la fuente de píxeles del efecto y también su estado de reposo, que se funde
 * por encima cuando la nube termina. Sin JavaScript, con `prefers-reduced-motion`
 * o si el muestreo falla, lo que queda es exactamente el contenido de siempre.
 *
 * El gancho es el ÚNICO dueño de la visibilidad de ese contenido mientras el
 * efecto vive: la escribe en `--print-reveal` y el CSS la aplica. Por eso la
 * coreografía de `home-hero` ya no anima la opacidad de lo que se imprime; dos
 * dueños para la misma propiedad es el defecto que este capítulo lleva tiempo
 * cerrando.
 */
export function usePrint(options: PrintOptions) {
  const {
    host,
    target,
    sample,
    seed,
    print,
    dissolve,
    lag = 0,
    angle = 14,
    bleed,
    budget = 2400,
    gap,
    dust,
    signal,
  } = options

  useIsomorphicLayoutEffect(() => {
    const box = host.current
    if (!box) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const surface = box.querySelector<HTMLCanvasElement>('canvas.print-canvas')
    const context = surface?.getContext('2d') ?? null
    if (!surface || !context) return

    let field: PrintField | null = null
    let built = ''
    let attempt = 0
    let shown = 0
    let shownLead = 0
    let printOn = false
    let escaped = 0
    let escapedLead = 0
    let dissolveOn = false
    let revealed = -1
    let dirty = false
    let waiting = 0
    let hidden = false
    /*
      El primer fotograma no se anima, se coloca.

      Si el navegador restaura la posición de scroll a mitad del capítulo —o el
      usuario llega con un ancla—, los seguidores arrancarían en cero contra un
      objetivo que ya vale uno, y el bloque se estrenaría imprimiendo y
      disolviendo delante de alguien que no ha movido la rueda.

      La portada es la excepción y por eso `'load'` no coloca la impresión: ahí
      el estreno es justo lo que se quiere ver. Su disolución sí se coloca, para
      que abrir la página ya scrolleada no la reproduzca hacia atrás.
    */
    let primed = false

    /*
      El contenido se esconde ya, antes del primer muestreo.

      Si se esperara a tener el campo, el navegador pintaría al menos un
      fotograma con el titular a plena vista y el siguiente sin él: un parpadeo
      justo en la primera impresión de la página. Escondiéndolo desde el efecto
      de maquetación —antes de pintar— la impresión empieza desde el vacío, que
      es como tiene que empezar. El seguro de `FALLBACK` cubre el caso de que el
      muestreo nunca llegue a funcionar.
    */
    const hide = () => {
      hidden = true
      box.style.setProperty('--print-reveal', '0')
      box.dataset.print = 'live'
    }
    const give = () => {
      hidden = false
      box.style.removeProperty('--print-reveal')
      delete box.dataset.print
    }
    hide()

    const build = (now: number) => {
      if (now - attempt < RETRY) return
      attempt = now
      const piece = target(box)
      if (!piece) return

      const shape = piece.getBoundingClientRect()
      const width = Math.round(shape.width)
      const height = Math.round(shape.height)
      if (width < 6 || height < 6) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const key = width + 'x' + height + '@' + dpr
      if (key === built) return

      const source = sample(piece, width, height, dpr)
      if (!source) return

      /*
        El sangrado es por donde vuela la nube.

        Se calcula sobre el lado corto porque es el que manda: una línea de
        titular mide 500×70 y no necesita 200 px de aire por arriba, necesita los
        treinta y pico que ocupa el vuelo de sus partículas.
      */
      const pad = bleed ?? Math.round(Math.min(46, Math.max(16, Math.min(width, height) * 0.44)))
      const next = buildPrintField(source, {
        width,
        height,
        bleed: pad,
        dpr,
        budget,
        gap,
        dust,
        angle: (angle * Math.PI) / 180,
        seed: seedFrom(seed + key),
      })
      if (!next) return

      built = key
      field = next
      surface.width = next.canvasWidth
      surface.height = next.canvasHeight
      surface.style.width = width + pad * 2 + 'px'
      surface.style.height = height + pad * 2 + 'px'
      // Respecto al host, no respecto a la pieza: el lienzo se posiciona en el
      // contexto del host y la pieza puede no empezar en su esquina —una línea
      // de texto es más estrecha que el bloque que la contiene—.
      const anchor = box.getBoundingClientRect()
      surface.style.left = Math.round(shape.left - anchor.left) - pad + 'px'
      surface.style.top = Math.round(shape.top - anchor.top) - pad + 'px'
      dirty = false
      if (!hidden) hide()
    }

    const leave = join((delta, now) => {
      if (!field) {
        if (!waiting) waiting = now
        if (fontsReady) build(now)
        if (hidden && now - waiting > FALLBACK) give()
        return
      }

      const progress = scrollContext.progress
      const forced = signal?.current.forcedProgress != null
      const printTarget = print === 'load' ? (curtain ? 1 : 0) : smoothstep(print[0], print[1], progress)
      const exitTarget = smoothstep(dissolve[0], dissolve[1], progress)

      if (print === 'load') printOn = curtain
      else if (printTarget > LATCH_ON) printOn = true
      else if (printTarget < LATCH_OFF) printOn = false
      if (exitTarget > LATCH_ON) dissolveOn = true
      else if (exitTarget < LATCH_OFF) dissolveOn = false

      if (forced) {
        /*
          En modo determinista se recorre la ventana como una curva continua, no
          como un interruptor: el arnés existe para fotografiar la FORMA de la
          impresión a media altura, y con el interruptor sólo podría capturar
          los dos extremos. La función que dibuja es exactamente la misma; lo
          único que cambia es de dónde sale su argumento.
        */
        shown = printTarget
        shownLead = printTarget
        escaped = exitTarget
        escapedLead = exitTarget
      } else {
        if (!primed) {
          primed = true
          escaped = exitTarget
          escapedLead = exitTarget
          if (print !== 'load') {
            shown = printTarget
            shownLead = printTarget
          }
        }
        const printGoal = printOn ? 1 : 0
        shownLead += (printGoal - shownLead) * (1 - Math.exp(-delta / (PRINT_LEAD + lag)))
        shown += (shownLead - shown) * (1 - Math.exp(-delta / PRINT_SETTLE))
        if (Math.abs(printGoal - shown) < 0.0008) { shown = printGoal; shownLead = printGoal }

        const exitGoal = dissolveOn ? 1 : 0
        escapedLead += (exitGoal - escapedLead) * (1 - Math.exp(-delta / (DISSOLVE_LEAD + lag * 0.6)))
        escaped += (escapedLead - escaped) * (1 - Math.exp(-delta / DISSOLVE_SETTLE))
        if (Math.abs(exitGoal - escaped) < 0.0008) { escaped = exitGoal; escapedLead = exitGoal }
      }

      /*
        El relevo: la nube entrega la pieza al contenido real en el último 14 %
        de la impresión, y la recupera en cuanto empieza la fuga. Un solo número
        gobierna las dos direcciones, así que no pueden desincronizarse.
      */
      const reveal = smootherstep(0.86, 1, shown) * (1 - smoothstep(0, 0.14, escaped))
      if (Math.abs(reveal - revealed) > 0.004) {
        revealed = reveal
        box.style.setProperty('--print-reveal', reveal.toFixed(3))
      }

      // Un campo sin polvo no tiene nada que dibujar una vez entregado. Es la
      // razón de que el texto no cueste un solo fotograma en reposo.
      const settled = reveal > 0.999 && field.dust === 0 && escaped <= 0
      if (shown <= 0.0006 || escaped >= 0.999 || settled) {
        if (dirty) {
          context.setTransform(1, 0, 0, 1, 0, 0)
          context.clearRect(0, 0, field.canvasWidth, field.canvasHeight)
          dirty = false
        }
        return
      }

      drawPrintField(context, field, {
        print: shown,
        dissolve: escaped,
        reveal,
        // El reloj del capítulo, congelado en modo determinista. Sin él, dos
        // capturas del mismo progreso caerían en temblores distintos.
        time: signal?.current.time ?? now / 1000,
      })
      dirty = true
    })

    const invalidate = () => { built = ''; field = null; attempt = 0; waiting = 0 }
    const observer = new ResizeObserver(invalidate)
    observer.observe(box)
    return () => {
      leave()
      observer.disconnect()
      give()
    }
  }, [angle, bleed, budget, dissolve, dust, gap, host, lag, print, sample, seed, signal, target])
}
