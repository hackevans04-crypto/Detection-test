'use client'

import Lenis from 'lenis'
import { CONCEPT_SEGMENTS, conceptWindow, readingHold } from '@/lib/hero/timeline'

/**
 * La instancia viva, para quien necesite pedir un viaje de scroll.
 *
 * El controlador de estaciones del Hero la usa para animar la posición con
 * duración y easing propios en lugar de mover la rueda a mano. Es una
 * referencia al mismo objeto, no una segunda capa de suavizado.
 */
export const smoothScroll: { current: Lenis | null } = { current: null }

/**
 * Lo que el capítulo le cuenta al scroll.
 *
 * Lo escribe `HomeHero`, que es quien conoce el largo del capítulo y el
 * progreso. Se hace con un objeto compartido y no importando `depth.ts` porque
 * ése arrastra al director y con él todo THREE: la barra de scroll no tiene por
 * qué cargar el motor 3D.
 */
export const scrollContext = { chapterPx: 0, progress: 0 }

/**
 * Telemetría de la rueda para `?heroDebug=1`.
 *
 * Existe para poder comprobar el comportamiento con hardware real —ratón y
 * trackpad—, que es lo único que no se puede medir desde un arnés sintético.
 */
export const wheelTelemetry = {
  rawDelta: 0,
  visualProgress: 0,
  pendingPx: 0,
  effectiveDelta: 0,
  multiplier: 1,
  peakMultiplier: 1,
  impulse: 0,
  sinceLast: 0,
  velocity: 0,
  clamped: false,
  source: '—',
}
import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

export function SmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    gsap.registerPlugin(ScrollTrigger)

    /*
      Con `?heroDebug=1` la telemetría queda accesible desde la consola. Es la
      única forma de comprobar el comportamiento con hardware real, que un
      arnés sintético no puede reproducir.
    */
    if (new URLSearchParams(window.location.search).get('heroDebug') === '1') {
      ;(window as unknown as { heroWheel?: typeof wheelTelemetry }).heroWheel = wheelTelemetry
    }
    /*
      El suavizado del scroll estaba en serie con el del capítulo.

      Con lerp 0,075 por fotograma, Lenis retiene el 92,5 % del error en
      cada uno: constante de tiempo ~214 ms y 95 % del recorrido en ~640 ms.
      Encima iba el amortiguado de `visualProgress`. Medido con un evento de
      rueda real, la escena tardaba 354 ms en moverse. Eso es lo que se
      sentía como perseguir al usuario en vez de acompañarlo.

      0,30 sale de un barrido medido (0,075 / 0,19 / 0,30 / 0,42): da 237 ms
      hasta el 90 % y 371 ms de arrastre, el mínimo de los cuatro. Por encima
      empeora otra vez. El peso cinematográfico lo pone el reparto del
      capítulo, que es donde debe estar, no la viscosidad del control.
    */
    /*
      Sensibilidad adaptativa de la rueda.

      Medido: recorrer el capítulo costaba 83 muescas de rueda con cualquier
      ritmo. Eso no es latencia —la respuesta son 32 ms— sino distancia, y por
      eso se sentía lento. Subir el multiplicador a secas, o acortar el
      capítulo, roban en la misma proporción el presupuesto de lectura.

      La regla es continua: un impulso sube con el gesto y decae con el tiempo
      parado. Sin umbrales duros, sin estaciones, sin anclaje: un ritmo
      fronterizo no puede oscilar entre dos sensibilidades.

      Va en `virtualScroll` porque Lenis lee el delta DESPUÉS de llamar al
      callback (lenis.mjs:579-580), así que mutarlo aquí sí llega. Mutar
      `lenis.options.wheelMultiplier` no funciona: lo consume el VirtualScroll
      interno con su propia copia.
    */
    let impulse = 0
    let lastGesture = 0
    let lastDirection = 0

    /*
      La meseta de lectura más estrecha de todos los conceptos.

      Sale de las mismas ventanas que usa el texto, así que si el reparto del
      capítulo cambia, el techo de un solo evento se ajusta solo.
    */
    const narrowestHold = Math.min(
      ...CONCEPT_SEGMENTS.map((segment) => {
        const [, holdFrom, holdTo] = conceptWindow(segment)
        return holdTo - holdFrom
      }),
    )

    const lenis = new Lenis({
      lerp: 0.3,
      smoothWheel: true,
      wheelMultiplier: 1,
      virtualScroll: (data: { deltaY: number; event: Event }) => {
        /*
          El táctil conserva su sensación nativa.

          La aceleración es sólo para la rueda: en un móvil el dedo ya lleva su
          propia inercia y multiplicarla rompería la relación entre lo que se
          arrastra y lo que se mueve.
        */
        if (data.event?.type !== 'wheel') return true

        /*
          Aquí `deltaY` ya viene en píxeles: el VirtualScroll de Lenis resuelve
          DOM_DELTA_LINE y DOM_DELTA_PAGE y aplica `wheelMultiplier` antes de
          emitir (lenis.mjs:351-356). Volver a normalizar lo aplicaría dos veces.
        */
        const raw = data.deltaY
        const now = performance.now()
        const gap = now - lastGesture
        lastGesture = now

        /*
          Cambiar de sentido vacía el impulso.

          Sin esto, frenar un arrastre rápido y volver hacia arriba arrastraría
          un multiplicador de 4x en la dirección contraria, que se percibe como
          que la página sigue de largo antes de obedecer.
        */
        /*
          Recorrido pendiente: lo que Lenis todavía debe a la posición visible.
          Es la medida de la inercia acumulada, y lo que decide si invertir el
          sentido responde o arrastra.
        */
        wheelTelemetry.pendingPx = (lenis?.targetScroll ?? 0) - (lenis?.animatedScroll ?? 0)

        const direction = Math.sign(raw)
        if (direction !== 0 && direction !== lastDirection) {
          impulse = 0
          /*
            Y además se recoge el objetivo pendiente.

            Vaciar el impulso no basta: Lenis acumula el recorrido en
            `targetScroll` (lenis.mjs:631), así que tras un arrastre rápido el
            objetivo queda muy por delante de lo que se ve y la escena sigue
            avanzando aunque el usuario ya esté subiendo. Medido con eventos
            confiables: invertir hacía avanzar un 14,85 % más antes de obedecer.
            Recogerlo hasta la posición visible hace que el gesto contrario
            salga desde donde el usuario está mirando.

            Pide un delta con entidad: un trackpad emite deltas diminutos en
            sentido contrario durante un gesto normal, y no deben cortar la
            inercia de un arrastre legítimo.
          */
          if (Math.abs(raw) > 12) lenis.targetScroll = lenis.animatedScroll
        }
        if (direction !== 0) lastDirection = direction

        /*
          El impulso sube por distancia, no por número de eventos.

          Un trackpad emite decenas de deltas diminutos por gesto; contarlos
          llevaría al tope en una fracción de swipe. Midiendo distancia, un
          swipe de trackpad y las muescas de ratón equivalentes acumulan lo
          mismo. 285 px equivalen a una muesca típica de 100 px sumando 0,35.
        */
        const gain = Math.abs(raw) / 285

        /*
          Dentro de un hold, y sólo si además va despacio, el impulso cae más
          rápido para devolver el grano fino. Si el usuario insiste en ir
          rápido, `slow` se anula y no se le frena: mantiene el control.
        */
        const speed = Math.abs(lenis?.velocity ?? 0)
        // `lenis.velocity` es desplazamiento por FOTOGRAMA (lenis.mjs:664), no
        // por segundo: a 60 fps un arrastre decidido ronda 45 px por fotograma.
        const slow = 1 - Math.min(speed / 45, 1)
        const readingPull = readingHold(scrollContext.progress) * slow

        impulse = Math.min(1, Math.max(0, impulse + gain - gap / 1150 - readingPull * 0.4))

        // Cuadrática: un toque suelto conserva el grano; el arrastre acelera.
        const multiplier = 1 + impulse * impulse * 3
        let effective = raw * multiplier

        /*
          Techo por evento: ni un pico accidental —una rueda libre, un swipe
          brusco— puede recorrer en un solo evento más del 75 % de la meseta de
          lectura de un concepto. Así nunca se salta información de golpe.
        */
        const ceiling = scrollContext.chapterPx > 0
          ? narrowestHold * scrollContext.chapterPx * 0.75
          : Number.POSITIVE_INFINITY
        const clamped = Math.abs(effective) > ceiling
        if (clamped) effective = Math.sign(effective) * ceiling

        data.deltaY = effective

        wheelTelemetry.rawDelta = raw
        wheelTelemetry.effectiveDelta = effective
        wheelTelemetry.multiplier = multiplier
        wheelTelemetry.peakMultiplier = impulse < 0.05
          ? multiplier
          : Math.max(wheelTelemetry.peakMultiplier, multiplier)
        wheelTelemetry.impulse = impulse
        wheelTelemetry.sinceLast = gap
        wheelTelemetry.velocity = speed
        wheelTelemetry.clamped = clamped
        wheelTelemetry.source = Math.abs(raw) < 30 ? 'trackpad?' : 'rueda'
        return true
      },
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      anchors: { offset: -80 },
    })
    const update = (time: number) => lenis.raf(time * 1000)

    const syncMotionPreference = () => {
      if (reducedMotion.matches) {
        lenis.stop()
        smoothScroll.current = null
        return
      }
      lenis.start()
      smoothScroll.current = lenis
      ScrollTrigger.refresh()
    }

    syncMotionPreference()
    reducedMotion.addEventListener('change', syncMotionPreference)
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    /*
      El refresco tiene que esperar a que la página se asiente.

      Con un único `requestAnimationFrame` ScrollTrigger cacheaba las posiciones
      antes de que el canvas WebGL y las fuentes hubieran colocado el layout
      definitivo, y el capítulo acababa registrado ~2090 px más abajo de donde
      está. Medido: había veintiuna muescas de rueda en las que el usuario
      giraba y la escena no se movía. Eso es lo que se sentía como que la
      página se cuelga; no era lentitud, era un tramo muerto al principio.

      Se refresca tras las fuentes, tras `load` y una vez más pasado un margen,
      que es lo que recomienda la propia documentación de ScrollTrigger para
      páginas con contenido que cambia de tamaño al cargar.
    */
    const refresh = () => ScrollTrigger.refresh()
    requestAnimationFrame(refresh)
    document.fonts?.ready.then(refresh)
    window.addEventListener('load', refresh)
    const settle = window.setTimeout(refresh, 1200)

    return () => {
      reducedMotion.removeEventListener('change', syncMotionPreference)
      window.removeEventListener('load', refresh)
      window.clearTimeout(settle)
      gsap.ticker.remove(update)
      smoothScroll.current = null
      lenis.destroy()
    }
  }, [])

  return null
}
