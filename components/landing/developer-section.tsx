'use client'

import { developer, developerStrengths } from '@/data/developer'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { OlbroxParallax } from './visuals/olbrox-parallax'

export function DeveloperSection() {
  const ref = useScrollReveal<HTMLDivElement>()

  return (
    <section id="desarrolladores" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid bg-grid-fade opacity-40" />

      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          {/* Left — logo visual */}
          <div data-reveal className="order-2 lg:order-1">
            <OlbroxParallax className="aspect-square w-full max-w-[520px] mx-auto" />
          </div>

          {/* Right — copy */}
          <div data-reveal className="order-1 lg:order-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-soft">
              <span className="size-1.5 rounded-full bg-cyan" />
              Desarrolladores · {developer.name}
            </span>

            <h2 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Desarrollado con propósito.
              <br />
              <span className="text-gradient">Impulsado por innovación.</span>
            </h2>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
              {developer.description}
            </p>

            <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {developerStrengths.map((s) => (
                <li
                  key={s.title}
                  className="flex items-start gap-3 rounded-xl glass p-4"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-strong text-cyan">
                    <s.icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{s.title}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {s.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
