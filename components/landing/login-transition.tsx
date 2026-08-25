'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef } from 'react'

/**
 * Relevo entre la experiencia y la cuenta.
 *
 * La transición vive entera en el DOM: ni toca el lienzo, ni espera a WebGL, ni
 * necesita que el Hero esté cargado. La superficie nace exactamente donde está
 * la cápsula que se ha pulsado, de modo que el elemento pulsado *es* la
 * transición en vez de un telón genérico encima de ella.
 *
 * Nada de esto puede impedir entrar a la cuenta. El enlace conserva su `href`,
 * así que sin JavaScript navega igual; y con JavaScript la navegación sale de
 * un temporizador, nunca de `animationend`: si la animación no llega a
 * dispararse, el usuario entra de todos modos.
 */
const TRAVEL_MS = 420
const REDUCED_MS = 160
/*
  Margen del seguro.

  Existe para que un fallo de la animación no deje al usuario sin poder entrar
  a su cuenta. Pero no puede ser corto: medido con movimiento reducido, a los
  900 ms la navegación de cliente todavía no había cambiado la URL —la página
  del capítulo tarda en desmontar la escena— y el seguro disparaba una recarga
  completa que tiraba por tierra la navegación que ya iba en camino: 4971 ms en
  lugar de 445. Con margen suficiente sólo actúa cuando de verdad no ha pasado
  nada.
*/
const FAILSAFE_MS = 2600

export function LoginTransition() {
  const router = useRouter()
  const pathname = usePathname()
  const veil = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }, [])

  /** Abre la superficie desde un punto de la pantalla y navega. */
  const run = useCallback((origin: { x: number; y: number }, target: string) => {
    const node = veil.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? REDUCED_MS : TRAVEL_MS

    if (node) {
      // Radio necesario para cubrir la esquina más lejana desde el origen.
      const dx = Math.max(origin.x, window.innerWidth - origin.x)
      const dy = Math.max(origin.y, window.innerHeight - origin.y)
      const radius = Math.hypot(dx, dy) + 8
      node.style.setProperty('--login-x', `${origin.x}px`)
      node.style.setProperty('--login-y', `${origin.y}px`)
      node.style.setProperty('--login-scale', String(radius))
      node.style.setProperty('--login-ms', `${duration}ms`)
      node.dataset.mode = reduced ? 'fade' : 'grow'
      // Un fotograma con la escala a cero antes de soltar la transición.
      requestAnimationFrame(() => { node.dataset.active = 'true' })
    }
    document.documentElement.dataset.leavingToLogin = 'true'
    // La cuenta alarga su escalonado sólo cuando se llega desde la experiencia.
    if (target === '/login') document.documentElement.dataset.loginEntry = 'hero'
    else delete document.documentElement.dataset.loginEntry

    /*
      La navegación no espera al final de la animación: sale a los dos tercios,
      cuando la superficie ya cubre lo suficiente para tapar el relevo, y hay un
      seguro por encima que navega pase lo que pase.
    */
    timers.current.push(window.setTimeout(() => router.push(target), Math.round(duration * 0.66)))
    timers.current.push(window.setTimeout(() => {
      if (window.location.pathname !== target) window.location.assign(target)
    }, FAILSAFE_MS))
  }, [router])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link) return
      const href = link.getAttribute('href')
      const toLogin = href === '/login' && pathname !== '/login'
      const toHome = href === '/' && pathname === '/login'
      if (!toLogin && !toHome) return
      if (busy.current) { event.preventDefault(); return }

      /*
        Se detiene aquí mismo. `next/link` monta su propio manejador en la raíz
        de React, que en fase de burbuja corre ANTES que un oyente de
        `document`: navegaba él y este relevo no llegaba a verse nunca. Por eso
        el oyente va en captura y corta la propagación.
      */
      event.preventDefault()
      event.stopPropagation()
      busy.current = true
      link.dataset.transitionSource = 'true'
      const box = link.getBoundingClientRect()
      run({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, toLogin ? '/login' : '/')
    }

    document.addEventListener('click', onClick, true)
    return () => { document.removeEventListener('click', onClick, true); clearTimers() }
  }, [clearTimers, pathname, run])

  /* Al llegar al destino la superficie se retira y devuelve el control. */
  useEffect(() => {
    const node = veil.current
    clearTimers()
    busy.current = false
    delete document.documentElement.dataset.leavingToLogin
    document.querySelectorAll('[data-transition-source]').forEach((el) => {
      delete (el as HTMLElement).dataset.transitionSource
    })
    if (!node || !node.dataset.active) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    node.dataset.settling = 'true'
    const t = window.setTimeout(() => {
      delete node.dataset.active
      delete node.dataset.settling
    }, reduced ? REDUCED_MS : TRAVEL_MS)
    return () => window.clearTimeout(t)
  }, [clearTimers, pathname])

  return <div ref={veil} className="login-veil" aria-hidden="true"><span className="login-veil-disc" /></div>
}
