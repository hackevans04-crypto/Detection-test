'use client'

import { useEffect, useRef, useState } from 'react'
import type { ScrollTrigger } from 'gsap/ScrollTrigger'
import { smoothScroll } from './smooth-scroll'
import { STATIONS, nearestStation, stationDuration, travelEasing, type StationName } from '@/lib/hero/stations'

/**
 * Un gesto «de verdad» acumula al menos esto antes de contar.
 *
 * 90 y no 42 por una razón concreta: con el umbral bajo, una envolvente de
 * trackpad disparaba en su FLANCO DE SUBIDA —14+32 ya cruzaban 42— y los
 * eventos siguientes, todavía creciendo hacia el pico, parecían un gesto nuevo.
 * Medido, eso encadenaba dos estaciones. Disparando cerca del pico, todo lo que
 * viene después es inequívocamente inercia.
 */
const WHEEL_THRESHOLD = 90
/** Silencio que separa dos gestos distintos. */
const GESTURE_GAP = 180
/** Intervalo mínimo entre estaciones, para la rueda clásica de muescas. */
const MIN_INTERVAL = 400
/** Un swipe vertical claro en táctil. */
const SWIPE_THRESHOLD = 48

type Options = {
  /** ScrollTrigger que fija el capítulo; de él salen inicio y final del recorrido. */
  trigger: () => ScrollTrigger | undefined
  /** Modo determinista: el arnés coloca el progreso a mano y aquí no se toca nada. */
  disabled: boolean
}

/**
 * Navegación cinematográfica por estaciones.
 *
 * El Hero dejaba al usuario «reproduciendo un vídeo con la rueda»: cada píxel
 * de scroll avanzaba un poco la película, así que había que seguir girando para
 * que la cámara llegara a algún sitio. Ahora un gesto significa «siguiente
 * momento narrativo» y el sistema viaja solo hasta él.
 *
 * No hay segunda línea de tiempo ni segundo suavizado: lo único que hace este
 * controlador es animar la POSICIÓN DE SCROLL hasta la que corresponde a la
 * estación, con `lenis.scrollTo`. ScrollTrigger sigue mapeando esa posición al
 * progreso exactamente igual que antes, así que toda la coreografía —cámara,
 * cerebro, niebla, textos, nav— se conserva intacta.
 *
 * Cuando la última estación termina, el control se suelta y la página vuelve a
 * desplazarse con normalidad hacia las secciones siguientes.
 */
export function useCinematicSteps({ trigger, disabled }: Options) {
  const [station, setStation] = useState(0)
  const stationRef = useRef(0)
  const travelling = useRef(false)
  const queued = useRef(0)
  const accumulator = useRef(0)
  // Envolvente del gesto: magnitud del último evento, momento en que llegó y
  // si estamos dentro de la inercia posterior a un disparo.
  const lastMagnitude = useRef(0)
  const lastEventAt = useRef(0)
  const decaying = useRef(false)
  const lastDirection = useRef(0)
  const touchStart = useRef(0)
  const lastFire = useRef(0)

  useEffect(() => {
    if (disabled) return

    const goTo = (index: number) => {
      const scrollTrigger = trigger()
      const lenis = smoothScroll.current
      const target = STATIONS[index]
      if (!scrollTrigger || !lenis || !target) return false

      /*
        Techo duro: una estación cada 700 ms, venga por donde venga.

        El bloqueo por tiempo de gesto no bastaba. Medido con un trackpad
        simulado —catorce deltas de 14 px—, la cadena de encolados se
        saltaba cinco estaciones de una pasada. Este límite es la última
        línea: da igual qué combinación de ruido, cola y rebote lo intente.
      */
      const now = performance.now()
      if (now - lastFire.current < MIN_INTERVAL) return false
      lastFire.current = now

      const from = STATIONS[stationRef.current]?.progress ?? 0
      const span = scrollTrigger.end - scrollTrigger.start
      const destination = scrollTrigger.start + span * target.progress

      const duration = stationDuration(from, target.progress)
      stationRef.current = index
      setStation(index)
      travelling.current = true
    /*
      El bloqueo cubre la mayor parte del viaje, no un tiempo fijo.

      Con 260 ms fijos, un trackpad soltando deltas de 14 px durante 400 ms
      volvía a superar el umbral y encadenaba estaciones: medido, un solo
      gesto de trackpad se saltaba cinco. Cubriendo el 70 % del viaje, el
      ruido continuo produce UNA estación y un segundo gesto deliberado
      —después de que la cámara ya casi ha llegado— sí encola la siguiente.
    */
      accumulator.current = 0
      decaying.current = true

      lenis.scrollTo(destination, {
        duration,
        // Arranque rápido, crucero largo, frenada progresiva y posada suave.
        // Ver `travelEasing`: la quíntica de salida anterior frenaba desde el
        // primer instante y la toma se consumía enseguida.
        easing: travelEasing,
        lock: true,
        onComplete: () => {
          travelling.current = false
          if (queued.current !== 0) {
            const direction = queued.current
            queued.current = 0
            step(direction)
          }
        },
      })
      return true
    }

    const step = (direction: number) => {
      const next = stationRef.current + direction
      // En los extremos no se consume el gesto: sirve para salir del capítulo
      // hacia arriba o continuar hacia las secciones de abajo.
      if (next < 0 || next >= STATIONS.length) return false
      return goTo(next)
    }

    /** ¿Sigue el capítulo capturando la intención del usuario? */
    const capturing = () => {
      const scrollTrigger = trigger()
      if (!scrollTrigger) return false
      const last = stationRef.current >= STATIONS.length - 1
      const beyond = window.scrollY > scrollTrigger.end - 4
      return !(last && beyond)
    }

    const request = (direction: number) => {
      // Una sola intención en cola. Condicionar el encolado a que hubiera
      // silencio previo se probó y salió peor: la rueda clásica dejaba viajes
      // a medias, porque su propio notch no cumple esa condición.
      if (travelling.current) {
        queued.current = direction
        return
      }
      step(direction)
    }

    const onWheel = (event: WheelEvent) => {
      if (!capturing()) return
      // Mientras el capítulo manda, la rueda es intención narrativa, no scroll.
      event.preventDefault()
      const now = performance.now()
      const magnitude = Math.abs(event.deltaY)
      const gap = now - lastEventAt.current
      lastEventAt.current = now

      /*
        Envolvente del gesto, no reloj.

        Un trackpad emite una ráfaga que crece, hace pico y decae. Todo ese
        decaimiento es inercia del mismo dedo, no una intención nueva: con un
        simple techo de tiempo, catorce deltas seguidos encadenaban cinco
        estaciones. Tras disparar se entra en modo decay y sólo se sale por
        silencio, por cambio de dirección o porque la magnitud vuelve a crecer
        con claridad.
      */
      if (decaying.current) {
        const quiet = gap > GESTURE_GAP
        const reversed = lastDirection.current !== 0 && Math.sign(event.deltaY) !== lastDirection.current
        const growing = magnitude > lastMagnitude.current * 1.6 && magnitude > WHEEL_THRESHOLD * 0.5
        lastMagnitude.current = magnitude
        if (!quiet && !reversed && !growing) return
        decaying.current = false
        accumulator.current = 0
      }
      lastMagnitude.current = magnitude
      lastDirection.current = Math.sign(event.deltaY)

      accumulator.current += event.deltaY
      if (Math.abs(accumulator.current) < WHEEL_THRESHOLD) return
      const direction = Math.sign(accumulator.current)
      accumulator.current = 0
      request(direction)
    }

    const onKey = (event: KeyboardEvent) => {
      if (!capturing()) return
      const forward = ['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(event.key)
      const back = ['ArrowUp', 'PageUp'].includes(event.key)
      if (!forward && !back) return
      event.preventDefault()
      request(forward ? 1 : -1)
    }

    const onTouchStart = (event: TouchEvent) => {
      touchStart.current = event.touches[0]?.clientY ?? 0
    }
    const onTouchMove = (event: TouchEvent) => {
      if (!capturing()) return
      event.preventDefault()
    }
    const onTouchEnd = (event: TouchEvent) => {
      if (!capturing()) return
      const delta = touchStart.current - (event.changedTouches[0]?.clientY ?? touchStart.current)
      if (Math.abs(delta) < SWIPE_THRESHOLD) return
      request(Math.sign(delta))
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [disabled, trigger])

  const name: StationName = STATIONS[station]?.name ?? 'INTRO'
  return { station, name, total: STATIONS.length, nearestStation }
}
