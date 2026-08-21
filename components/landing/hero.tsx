'use client'

import { CtaLink } from './cta-link'
import { heroHighlights } from '@/data/landing-content'
import { ArrowRight, Play } from 'lucide-react'
import { DetectionScrollScene } from './visuals/detection-scroll-scene'
import { ParallaxLayer } from './visuals/parallax-layer'

export function Hero() {
  return (
    <section
      id="inicio"
      className="relative flex min-h-svh items-center overflow-hidden pt-24 pb-16 lg:pt-16"
    >
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 -z-20 bg-grid bg-grid-fade" />
      <div className="pointer-events-none absolute inset-0 -z-20">
        <ParallaxLayer speed={0.12} className="absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-blue/15 blur-[120px]" />
          <div className="absolute right-0 top-1/3 h-[420px] w-[420px] rounded-full bg-cyan/10 blur-[120px]" />
        </ParallaxLayer>
      </div>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,44%)_minmax(0,56%)] lg:gap-8 lg:px-8">
        {/* Left column */}
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-soft">
            <span className="size-1.5 rounded-full bg-cyan" />
            Tecnología para evaluación psicopedagógica
          </span>

          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight text-balance sm:text-6xl xl:text-7xl">
            Evaluar.
            <br />
            Comprender.
            <br />
            Acompañar <span className="text-gradient">mejor.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
            Detection-test es un entorno digital para organizar, analizar y acompañar procesos de
            evaluación psicopedagógica. La información se presenta con claridad para apoyar la
            interpretación profesional; la decisión corresponde al especialista.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CtaLink href="#plataforma" size="lg">
              Explorar plataforma
              <ArrowRight className="size-4" />
            </CtaLink>
            <CtaLink href="#proceso" size="lg" variant="outline">
              <Play className="size-4" />
              Ver cómo funciona
            </CtaLink>
          </div>

          {/* Highlights */}
          <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {heroHighlights.map((item) => (
              <li key={item.title} className="flex flex-col gap-2">
                <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-cyan">
                  <item.icon className="size-5" />
                </span>
                <span className="text-sm font-semibold text-foreground">{item.title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right column — signature scene */}
        <div className="relative">
          <DetectionScrollScene className="mx-auto max-w-[560px]" />
        </div>
      </div>

      {/* Scroll cue */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <span className="text-[10px] font-medium uppercase tracking-[0.24em]">Desplázate</span>
          <span className="flex h-8 w-5 items-start justify-center rounded-full border border-border p-1">
            <span className="size-1.5 animate-bounce rounded-full bg-cyan" />
          </span>
        </div>
      </div>
    </section>
  )
}
