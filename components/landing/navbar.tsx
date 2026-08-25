'use client'

import { cn } from '@/lib/utils'
import { CtaLink } from './cta-link'
import { navLinks, sectionIndex } from '@/data/landing-content'
import { useActiveModule } from '@/hooks/use-active-module'
import { DetectionEmblem } from './visuals/detection-emblem'
import { ArrowRight, LogIn, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

type NavState = 'full' | 'compact' | 'immersive'

/**
 * Estado de la navegación, dictado por el capítulo.
 *
 * No escucha el scroll: lo escribe `home-hero` sobre `documentElement` desde el
 * mismo sitio donde el progreso visible cambia de valor. La barra tenía antes su
 * propio `scrollY > 24`, que era una segunda línea de tiempo capaz de
 * contradecir a la escena.
 */
function useHeroNavState(): NavState {
  const [state, setState] = useState<NavState>('full')

  useEffect(() => {
    const root = document.documentElement
    const read = () => {
      const value = root.dataset.heroNav
      setState(value === 'compact' || value === 'immersive' ? value : 'full')
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-hero-nav'] })
    return () => observer.disconnect()
  }, [])

  return state
}

/**
 * El usuario que sube quiere salir: la navegación completa vuelve sin obligarle
 * a llegar hasta arriba del todo.
 */
function useScrollingUp() {
  const [up, setUp] = useState(false)

  useEffect(() => {
    let previous = window.scrollY
    const onScroll = () => {
      const current = window.scrollY
      if (Math.abs(current - previous) > 6) {
        setUp(current < previous && current > 40)
        previous = current
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return up
}

export function Navbar() {
  const [open, setOpen] = useState(false)
  /*
    El enlace subrayado sale del mismo sitio que el raíl de módulos.

    Antes lo resolvía un observador de intersección propio, que no podía acertar
    con Plataforma —su ancla mide un píxel— y dejaba «Inicio» subrayado durante
    todo el capítulo 02, contradiciendo al raíl en pantalla.
  */
  const active = sectionIndex[useActiveModule()].id
  const chapterState = useHeroNavState()
  const returning = useScrollingUp()
  // Volver a subir devuelve la barra completa, pero nunca dentro del cerebro:
  // ahí el mundo manda y la navegación se queda en HUD.
  const state: NavState = returning && chapterState === 'compact' ? 'full' : chapterState

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const chapterLabel = state === 'full' ? 'Inicio' : 'Exploración neural'
  /*
    Versión corta para pantallas estrechas. En 390 px el rótulo completo se
    partía en dos líneas y rozaba el wordmark. Se renderizan las dos y elige el
    CSS, de modo que no hace falta un estado nuevo ni medir el viewport aquí:
    el sistema de morph del nav queda intacto.
  */
  const chapterLabelShort = state === 'full' ? 'Inicio' : 'Exploración'

  return (
    <header
      // z-100: la navegación queda por encima del mundo 3D, pero en compacto e
      // inmersivo deja de ser una barra de borde a borde y no lo corta.
      className={cn('nav-shell fixed inset-x-0 top-0 z-[100]')}
      data-state={state}
    >
      <div className="nav-rail mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Marca */}
        <a href="#inicio" className="nav-capsule nav-brand flex shrink-0 items-center gap-2.5" aria-label="Detection-test, inicio">
          <DetectionEmblem className="nav-emblem shrink-0" />
          <span className="nav-wordmark flex shrink-0 flex-col leading-none">
            <span className="whitespace-nowrap font-display font-bold tracking-tight text-foreground">
              Detection-<span className="text-cyan">test</span>
            </span>
            <span className="nav-tagline mt-1 whitespace-nowrap font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Evaluación · Análisis · Inclusión
            </span>
          </span>
        </a>

        {/* Enlaces: sólo existen mientras el capítulo no ha empezado. */}
        <nav className="nav-links hidden items-center gap-1 xl:flex" aria-label="Principal">
          {navLinks.map((link) => {
            const isActive = active === link.id
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={cn(
                  'nav-depth-link relative rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
                {/* Punto de energía con su traza, en vez del subrayado de tabs. */}
                {isActive && <span className="nav-active-trace" aria-hidden="true" />}
              </a>
            )
          })}
        </nav>

        {/*
          Indicador de capítulo. Sustituye al bloque lateral pesado durante el
          interior y lleva su propio filamento de progreso, alimentado por la
          variable que publica el hero.
        */}
        <div className="nav-capsule nav-chapter" aria-hidden="true">
          <span className="nav-chapter-state nav-chapter-hero">
            <strong>01</strong>
            <span className="nav-chapter-full">{chapterLabel}</span>
            <span className="nav-chapter-short">{chapterLabelShort}</span>
          </span>
          <span className="nav-chapter-state nav-chapter-platform">
            <strong>02</strong>
            <span>Plataforma</span>
          </span>
          <i className="nav-filament" />
        </div>

        {/* Acciones */}
        <div className="nav-actions flex items-center gap-2">
          <CtaLink href="/login" variant="outline" className="nav-capsule nav-account" aria-label="Iniciar sesión">
            <LogIn className="size-4" />
            <span className="nav-account-label">Iniciar sesión</span>
          </CtaLink>
          <CtaLink href="#recursos" className="nav-demo hidden h-11 px-5 md:inline-flex">
            Demo personalizada
            <ArrowRight className="size-4" />
          </CtaLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            className="nav-capsule nav-burger inline-flex size-10 items-center justify-center xl:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Menú móvil: el mundo 3D sigue viéndose detrás, desenfocado. */}
      <div
        className={cn(
          'nav-sheet fixed inset-0 z-40 origin-top transition-[opacity,visibility] duration-300 xl:hidden',
          open ? 'visible opacity-100' : 'invisible opacity-0',
        )}
      >
        <nav className="flex flex-col gap-1 px-6 pb-6 pt-28" aria-label="Móvil">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={() => setOpen(false)}
              className={cn(
                'nav-sheet-link rounded-lg px-4 py-3 text-2xl font-medium transition-colors',
                active === link.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {link.label}
            </a>
          ))}
          <div className="mt-6 flex flex-col gap-3">
            <CtaLink href="/login" variant="outline" size="lg" className="w-full" onClick={() => setOpen(false)}>
              <LogIn className="size-4" />
              Iniciar sesión
            </CtaLink>
            <CtaLink href="#recursos" size="lg" className="w-full" onClick={() => setOpen(false)}>
              Demo personalizada
              <ArrowRight className="size-4" />
            </CtaLink>
          </div>
        </nav>
      </div>
    </header>
  )
}
