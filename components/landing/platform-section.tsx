'use client'

import { platformBenefits, platformModules } from '@/data/landing-content'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { SectionHeading } from './section-heading'
import { DetectionEmblem } from './visuals/detection-emblem'
import { ParallaxLayer } from './visuals/parallax-layer'
import { NodeNetwork } from './visuals/node-network'

export function PlatformSection() {
  const ref = useScrollReveal<HTMLDivElement>()

  return (
    <section id="plataforma" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <ParallaxLayer speed={0.15} className="absolute -right-24 top-10 h-[440px] w-[440px] opacity-30">
          <NodeNetwork />
        </ParallaxLayer>
        <div className="absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue/10 blur-[130px]" />
      </div>

      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Todo en un solo lugar"
          title={
            <>
              Una plataforma <span className="text-gradient">todo en uno</span>
            </>
          }
          description="Detection-test centraliza cada etapa del proceso psicopedagógico en un entorno digital seguro, intuitivo y diseñado para profesionales que buscan claridad, organización y mejores resultados."
        />

        {/* Ecosystem hub */}
        <div className="relative mt-16">
          <div
            data-reveal
            className="mx-auto mb-10 flex w-fit flex-col items-center gap-3"
          >
            <div className="relative flex size-24 items-center justify-center rounded-2xl glass glow-cyan">
              <DetectionEmblem className="h-14 w-14" />
              <span className="absolute inset-0 -z-10 rounded-2xl bg-cyan/20 blur-2xl" />
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Núcleo Detection-test
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {platformModules.map((mod) => (
              <article
                key={mod.title}
                data-reveal
                className="group relative overflow-hidden rounded-2xl glass p-6 transition-colors hover:border-cyan/40"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-xl border border-border bg-surface-strong text-cyan transition-colors group-hover:text-cyan-soft">
                    <mod.icon className="size-5" />
                  </span>
                  <h3 className="font-display text-lg font-semibold text-foreground">{mod.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {mod.description}
                </p>
                <span className="pointer-events-none absolute -right-6 -top-6 size-16 rounded-full bg-cyan/0 blur-xl transition-colors duration-300 group-hover:bg-cyan/20" />
              </article>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Representación conceptual de las capacidades de la plataforma.
          </p>
        </div>

        {/* Benefits */}
        <div className="mt-16 grid grid-cols-1 gap-6 rounded-3xl glass-strong p-8 sm:grid-cols-2 lg:grid-cols-4">
          {platformBenefits.map((b) => (
            <div key={b.title} data-reveal className="flex flex-col gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-cyan">
                <b.icon className="size-5" />
              </span>
              <h3 className="font-display text-base font-semibold text-foreground">{b.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
