'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { sectionIndex } from '@/data/landing-content'
import { useActiveModule, published } from '@/hooks/use-active-module'
import { smoothScroll } from '@/components/home/smooth-scroll'

/**
 * Indicador de módulo. Uno solo para toda la portada.
 *
 * Antes había tres cosas distintas diciendo lo mismo y ninguna decía la verdad:
 * el Hero llevaba un indicador propio a la derecha con cuatro puntos y el
 * primero marcado a mano —nunca cambiaba, daba igual dónde estuvieras—;
 * Plataforma tenía su propia marca de capítulo a la izquierda; y los cuatro
 * módulos siguientes no tenían nada. Al bajar, el patrón cambiaba de sitio, de
 * forma y de significado tres veces.
 *
 * Este raíl es el único. Vive fijo sobre la página, no dentro de un capítulo,
 * así que acompaña los seis módulos con la misma forma de principio a fin, y
 * cada nodo lleva al suyo. Comparte con la barra de navegación la misma
 * respuesta a dónde está el lector: `useActiveModule`.
 */

export function SectionRail() {
  const rail = useRef<HTMLElement>(null)
  const [ready, setReady] = useState(false)
  /*
    El relleno se escribe a mano y no por render: cambia en cada fotograma de
    scroll, sobre una página que ya está moviendo una escena 3D. Lo que sí pasa
    por React es el módulo activo, que cambia seis veces en toda la portada.
  */
  const active = useActiveModule((fill) => rail.current?.style.setProperty('--rail-fill', fill.toFixed(4)))

  /*
    El raíl entra con el telón, no al montar.

    Debajo del velo de carga no se ve nada, así que sin esperar la señal su
    entrada ocurría a oscuras y, cuando el velo se retiraba, el raíl ya llevaba
    dos segundos puesto. La bandera global cubre el caso de montar después del
    aviso, y el plazo de gracia el de que el aviso no llegue nunca.
  */
  useEffect(() => {
    if ((window as unknown as { __heroCurtain?: boolean }).__heroCurtain) { setReady(true); return }
    const onCurtain = () => setReady(true)
    window.addEventListener('hero:curtain', onCurtain)
    const grace = window.setTimeout(() => setReady(true), 2500)
    return () => {
      window.removeEventListener('hero:curtain', onCurtain)
      window.clearTimeout(grace)
    }
  }, [])

  /*
    Plataforma no se alcanza por su ancla.

    El capítulo 02 ocurre dentro del recorrido fijado del Hero, y su ancla en el
    documento mide un píxel y está al final de ese recorrido: seguir el enlace
    se salta el capítulo entero. El Hero publica en qué píxel empieza —lo sabe
    él, que es quien monta el anclaje—, así que el nodo viaja hasta ahí. Si no
    está publicado (movimiento reducido: no hay anclaje y Plataforma es una
    sección de verdad) el enlace normal ya hace lo correcto y no se toca.
  */
  const onPlatform = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    const target = published(document.documentElement, '--hero-platform-scroll')
    if (target === null) return
    event.preventDefault()
    /*
      Y se corta la propagación.

      Lenis atiende los enlaces de ancla con un listener en `window` que no mira
      si el evento ya está cancelado (lenis.mjs:542-553): sin cortar, hacía su
      propio viaje a `#plataforma` justo después del nuestro y ganaba él. React
      escucha en su contenedor, que está por debajo de `window`, así que parar
      aquí basta para que ese listener no llegue a verlo.
    */
    event.stopPropagation()
    const lenis = smoothScroll.current
    if (lenis) lenis.scrollTo(target)
    else window.scrollTo({ top: target, behavior: 'smooth' })
  }

  const current = sectionIndex[active] ?? sectionIndex[0]

  return (
    <nav ref={rail} className="section-rail" data-ready={ready ? '' : undefined} aria-label="Módulos de la portada">
      <div className="section-rail-track">
        {/* La espina y su cabeza son una sola pieza: el relleno mide `--rail-fill`. */}
        <div className="section-rail-spine" aria-hidden="true"><i /><b /></div>
        <ol>
          {sectionIndex.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="section-rail-node"
                data-state={index === active ? 'here' : index < active ? 'past' : 'ahead'}
                aria-current={index === active ? 'true' : undefined}
                onClick={section.id === 'plataforma' ? onPlatform : undefined}
              >
                {/* El rótulo es el nombre accesible del enlace y, además, lo que
                    se ve al pasar por encima. No hay dos textos para lo mismo. */}
                <span className="section-rail-chip"><em>{section.num}</em>{section.label}</span>
                <i aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      </div>

      {/* La lectura repite el módulo activo en grande. La `key` la vuelve a
          montar al cambiar de módulo, que es lo que dispara su entrada. */}
      <p className="section-rail-readout" aria-hidden="true">
        <strong key={current.num}>{current.num}</strong>
        <span key={current.id}>{current.label}</span>
      </p>
    </nav>
  )
}
