'use client'

import { CtaLink } from './cta-link'
import {
  institution,
  mission,
  trajectory,
  values,
  verifiedFacts,
} from '@/data/institution'
import { useScrollReveal } from '@/hooks/use-scroll-reveal'
import { ArrowRight } from 'lucide-react'
import Image from 'next/image'
import { InstitutionParallax } from './visuals/institution-parallax'

export function InstitutionSection() {
  const ref = useScrollReveal<HTMLDivElement>()

  return (
    <section id="institucion" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-1/4 top-1/3 h-[420px] w-[420px] rounded-full bg-blue/10 blur-[140px]" />
      </div>

      <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,42%)_minmax(0,58%)]">
          {/* Left — text */}
          <div data-reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-soft">
              <span className="size-1.5 rounded-full bg-cyan" />
              Institución
            </span>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl glass p-2">
                <Image
                  src={institution.crest || '/placeholder.svg'}
                  alt={`Escudo de la ${institution.name}`}
                  width={56}
                  height={56}
                  className="h-full w-auto object-contain"
                />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {institution.location}
                </p>
                <h2 className="font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                  {institution.name}
                </h2>
              </div>
            </div>

            <p className="mt-6 text-base leading-relaxed text-muted-foreground text-pretty">
              {institution.description}
            </p>

            {/* Only rendered when verified facts exist — never invented. */}
            {verifiedFacts.length > 0 && (
              <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {verifiedFacts.map((fact) => (
                  <div key={fact.label} className="rounded-xl glass p-4">
                    <dt className="font-display text-2xl font-bold text-gradient">{fact.value}</dt>
                    <dd className="text-sm font-medium text-foreground">{fact.label}</dd>
                    {fact.hint && (
                      <dd className="text-xs text-muted-foreground">{fact.hint}</dd>
                    )}
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-8">
              <CtaLink href="#desarrolladores">
                Conoce más sobre la UTEQ
                <ArrowRight className="size-4" />
              </CtaLink>
            </div>
          </div>

          {/* Right — treated campus visual */}
          <div data-reveal>
            <InstitutionParallax className="aspect-[4/3] w-full" />
          </div>
        </div>

        {/* Trajectory / Mission / Values */}
        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <article data-reveal className="rounded-2xl glass p-7">
            <h3 className="font-display text-xl font-semibold text-foreground">
              Nuestra <span className="text-gradient">trayectoria</span>
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{trajectory.body}</p>
          </article>

          <article data-reveal className="rounded-2xl glass p-7">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-cyan">
                <mission.icon className="size-5" />
              </span>
              <h3 className="font-display text-xl font-semibold text-foreground">
                Nuestra <span className="text-gradient">misión</span>
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{mission.body}</p>
          </article>

          <article data-reveal className="rounded-2xl glass p-7">
            <h3 className="font-display text-xl font-semibold text-foreground">
              Nuestros <span className="text-gradient">valores</span>
            </h3>
            <ul className="mt-4 flex flex-wrap gap-3">
              {values.map((v) => (
                <li key={v.label} className="flex flex-col items-center gap-1.5 text-center">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-cyan">
                    <v.icon className="size-5" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">{v.label}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  )
}
