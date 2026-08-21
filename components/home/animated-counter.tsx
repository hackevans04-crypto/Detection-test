'use client'

import { useEffect, useRef, useState } from 'react'

export function AnimatedCounter({ end, suffix = '', prefix = '' }: { end: number; suffix?: string; prefix?: string }) {
  const [value, setValue] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let played = false
    let raf = 0

    // El contador ya no puede dispararse por visibilidad: dentro de la escena
    // fijada el panel está siempre en el viewport, sólo que con opacidad 0.
    // Lo lanza la coreografía al llegar a la fase DATA, y una única vez: al
    // volver hacia arriba el número se queda en su valor final en lugar de
    // reiniciarse a cero.
    const run = () => {
      if (played) return
      played = true
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min((now - start) / 1500, 1)
        setValue(Math.round(end * (1 - Math.pow(1 - progress, 3))))
        if (progress < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener('detection:counters', run)
    return () => {
      window.removeEventListener('detection:counters', run)
      cancelAnimationFrame(raf)
    }
  }, [end])

  return <span ref={ref}>{prefix}{value.toLocaleString('es-EC')}{suffix}</span>
}
