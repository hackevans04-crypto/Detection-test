'use client'

import { useEffect, useRef, useState } from 'react'
import { sectionIndex } from '@/data/landing-content'

/**
 * En qué módulo de la portada está el lector.
 *
 * Una sola respuesta para toda la página. Antes había dos: el raíl de módulos
 * decía una cosa y la barra de navegación otra, porque cada uno lo resolvía por
 * su cuenta y el observador de intersección de la barra no podía acertar con
 * Plataforma —su ancla mide un píxel—. Se veía el raíl marcando «02 ·
 * Plataforma» con «Inicio» subrayado arriba al mismo tiempo.
 *
 * Reemplazó a `useActiveSection`, que era ese observador.
 */

/**
 * Altura de la línea de lectura, en fracción del viewport.
 *
 * Un módulo pasa a ser el actual cuando su borde superior cruza este punto. No
 * es el centro: un poco por encima, porque el título de cada sección entra por
 * arriba y es lo que el ojo usa para decidir dónde está.
 */
const READ_LINE = 0.42

/** Lee un número publicado como variable CSS en línea; `null` si no lo hay. */
export function published(root: HTMLElement, name: string) {
  const raw = root.style.getPropertyValue(name)
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Devuelve el índice del módulo actual dentro de `sectionIndex`.
 *
 * `onFill` recibe, en cada fotograma de scroll, cuánto se lleva recorrido de la
 * portada en la escala de los nodos: 0 en el primero, 1 en el último. Es un
 * callback y no un estado porque cambia sesenta veces por segundo y quien lo
 * usa lo escribe como variable CSS; el índice, que cambia seis veces en toda la
 * página, sí pasa por React.
 */
export function useActiveModule(onFill?: (fill: number) => void) {
  const [index, setIndex] = useState(0)
  const fill = useRef(onFill)
  fill.current = onFill

  useEffect(() => {
    const root = document.documentElement
    const ids = sectionIndex.map((section) => section.id)
    const last = ids.length - 1
    /** Posición de cada módulo en el documento, medida y guardada. */
    let tops: number[] = []
    let end = 1
    let queued = false
    let alive = true

    const read = () => {
      queued = false
      if (!alive) return
      const line = window.scrollY + window.innerHeight * READ_LINE

      let current = 0
      for (let i = 0; i < tops.length; i += 1) if (tops[i] <= line) current = i
      /*
        El capítulo 02 no se puede deducir de la geometría.

        Plataforma ocurre DENTRO del recorrido fijado del Hero —comparten lienzo
        y línea de tiempo—, y su ancla en el documento mide un píxel y está al
        final de ese recorrido. Medir daría «Inicio» durante todo el capítulo y
        luego un parpadeo de «Plataforma» cuando ya ha terminado. El propio
        capítulo publica su estado, así que se le pregunta a él.
      */
      if (root.dataset.platformActive === 'true') current = 1

      setIndex((previous) => (previous === current ? previous : current))
      if (!fill.current) return

      /*
        Recorrido dentro del módulo actual, para que quien dibuje el avance vaya
        de un nodo al siguiente en vez de saltar. Los dos primeros lo publican
        ellos mismos; el resto sale de la distancia entre módulos.
      */
      const own = current === 0 ? published(root, '--hero-progress')
        : current === 1 ? published(root, '--platform-progress')
        : null
      let inner = own
      if (inner === null) {
        const from = tops[current]
        const to = Number.isFinite(tops[current + 1]) ? tops[current + 1] : end
        inner = Number.isFinite(from) && to > from ? (line - from) / (to - from) : 0
      }
      inner = Math.min(Math.max(inner, 0), 1)
      // Tope en el último nodo: no hay un séptimo al que viajar.
      fill.current(Math.min((current + inner) / last, 1))
    }

    /*
      Las posiciones se miden y se guardan, no se leen en cada fotograma: seis
      `getBoundingClientRect` por fotograma de scroll fuerzan un cálculo de
      layout que compite con la escena 3D. Se vuelven a medir cuando algo puede
      haberlas movido, en los mismos momentos en que `SmoothScroll` refresca
      ScrollTrigger —fuentes, carga y un margen—, porque el anclaje del Hero
      inserta su espaciador justo ahí.
    */
    const measure = () => {
      if (!alive) return
      const y = window.scrollY
      tops = ids.map((id) => {
        const element = document.getElementById(id)
        return element ? element.getBoundingClientRect().top + y : Number.POSITIVE_INFINITY
      })
      end = Math.max(1, root.scrollHeight - window.innerHeight)
      read()
    }

    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(read)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    window.addEventListener('load', measure)
    document.fonts?.ready.then(measure)
    const settle = window.setTimeout(measure, 1500)

    return () => {
      alive = false
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      window.removeEventListener('load', measure)
      window.clearTimeout(settle)
    }
  }, [])

  return index
}
