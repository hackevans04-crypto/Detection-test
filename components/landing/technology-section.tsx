'use client'

import { technologyPillars, technologySecondary } from '@/data/landing-content'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { SectionHeading } from './section-heading'
import { NodeNetwork } from './visuals/node-network'
import { ParallaxLayer } from './visuals/parallax-layer'

export function TechnologySection() {
  const ref = useScrollReveal<HTMLDivElement>()

  return (
    <section id="tecnologia" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid bg-grid-fade opacity-60" />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <ParallaxLayer speed={0.18} className="absolute left-1/2 top-24 h-[520px] w-[520px] -translate-x-1/2 opacity-25">
          <NodeNetwork />
        </ParallaxLayer>
      </div>

      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Tecnología"
          title={
            <>
              Tecnología que impulsa <span className="text-gradient">mejores decisiones</span>
            </>
          }
          description="Un entorno construido para procesar información con orden, presentarla con claridad y crecer de forma segura. Detection-test apoya el trabajo del profesional; no lo reemplaza."
        />

        {/* Pillars */}
        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {technologyPillars.map((p) => (
            <article
              key={p.title}
              data-reveal
              className="group relative overflow-hidden rounded-2xl glass p-6 transition-colors hover:border-cyan/40"
            >
              <span className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-surface-strong text-cyan">
                <p.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
            </article>
          ))}
        </div>

        {/* Secondary capabilities */}
        <div className="mt-6 grid grid-cols-2 gap-4 rounded-3xl glass-strong p-6 sm:grid-cols-3 lg:grid-cols-6">
          {technologySecondary.map((s) => (
            <div key={s.title} data-reveal className="flex flex-col items-center gap-2 text-center">
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-cyan">
                <s.icon className="size-5" />
              </span>
              <span className="text-sm font-semibold text-foreground">{s.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{s.description}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
