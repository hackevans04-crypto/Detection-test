'use client'

import { cn } from '@/lib/utils'
import { CtaLink } from './cta-link'
import { navLinks } from '@/data/landing-content'
import { useActiveSection } from '@/hooks/use-active-section'
import { DetectionEmblem } from './visuals/detection-emblem'
import { ArrowRight, LogIn, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const active = useActiveSection(navLinks.map((l) => l.id))

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

  return (
    <header
      className={cn(
        // z-100: el navbar queda fuera del mundo 3D del hero y siempre por
        // encima de él, de modo que nada del hero se lea a través.
        'nav-shell fixed inset-x-0 top-0 z-[100] transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300',
        scrolled
          ? 'border-b border-border bg-[rgba(3,15,30,0.92)] shadow-[0_8px_40px_-24px_rgba(8,121,249,0.6)] backdrop-blur-[18px]'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <a href="#inicio" className="nav-brand flex shrink-0 items-center gap-2.5" aria-label="Detection-test, inicio">
          <DetectionEmblem className="h-12 w-12 shrink-0" />
          <span className="flex shrink-0 flex-col leading-none">
            <span className="whitespace-nowrap font-display text-xl font-bold tracking-tight text-foreground lg:text-[1.45rem]">
              Detection-<span className="text-cyan">test</span>
            </span>
            <span className="mt-1 whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground lg:text-[9px]">
              Evaluación · Análisis · Inclusión
            </span>
          </span>
        </a>

        {/* Center nav */}
        <nav className="hidden items-center gap-1 xl:flex" aria-label="Principal">
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
                {isActive && (
                  <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-blue to-cyan" />
                )}
              </a>
            )
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <CtaLink href="/login" variant="outline" className="hidden h-11 px-4 sm:inline-flex">
            <LogIn className="size-4" />
            Iniciar sesión
          </CtaLink>
          <CtaLink href="#recursos" className="hidden h-11 px-5 md:inline-flex">
            Demo personalizada
            <ArrowRight className="size-4" />
          </CtaLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
            className="inline-flex size-10 items-center justify-center rounded-md border border-border text-foreground xl:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-0 top-20 z-40 origin-top glass-strong transition-[opacity,visibility,transform] duration-300 xl:hidden',
          open ? 'visible opacity-100' : 'invisible opacity-0',
        )}
      >
        <nav className="flex flex-col gap-1 px-4 py-6" aria-label="Móvil">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={() => setOpen(false)}
              className={cn(
                'rounded-lg px-4 py-3 text-lg font-medium transition-colors',
                active === link.id
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {link.label}
            </a>
          ))}
          <div className="mt-4 flex flex-col gap-3">
            <CtaLink
              href="/login"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              <LogIn className="size-4" />
              Iniciar sesión
            </CtaLink>
            <CtaLink
              href="#recursos"
              size="lg"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Demo personalizada
              <ArrowRight className="size-4" />
            </CtaLink>
          </div>
        </nav>
      </div>
    </header>
  )
}
