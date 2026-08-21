'use client'

import { processAdvantages, processSteps } from '@/data/landing-content'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { registerGsap, gsap } from '@/lib/animations/gsap'
import { useEffect, useRef } from 'react'
import { SectionHeading } from './section-heading'
import { DetectionEmblem } from './visuals/detection-emblem'

const RADIUS = 240
// Even angles around the circle, starting at top.
const ANGLES = [-90, -30, 30, 90, 150, 210]

export function ProcessSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!sectionRef.current) return
    const steps = sectionRef.current.querySelectorAll<HTMLElement>('[data-step]')

    if (reduced) {
      steps.forEach((s) => {
        s.style.opacity = '1'
        s.style.transform = s.dataset.pos ?? 'none'
      })
      if (ringRef.current) ringRef.current.style.strokeDashoffset = '0'
      return
    }

    registerGsap()
    const ctx = gsap.context(() => {
      if (ringRef.current) {
        const len = ringRef.current.getTotalLength()
        gsap.set(ringRef.current, { strokeDasharray: len, strokeDashoffset: len })
        gsap.to(ringRef.current, {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 65%',
            end: 'bottom 70%',
            scrub: 1,
          },
        })
      }

      steps.forEach((step, i) => {
        gsap.fromTo(
          step,
          { opacity: 0.15, scale: 0.94 },
          {
            opacity: 1,
            scale: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: `top ${60 - i * 6}%`,
              end: `top ${20 - i * 6}%`,
              scrub: true,
            },
          },
        )
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [reduced])

  return (
    <section id="proceso" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan/10 blur-[130px]" />
      </div>

      <div ref={sectionRef} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Proceso"
          title={
            <>
              Un proceso diseñado para <span className="text-gradient">resultados confiables</span>
            </>
          }
          description="Cada etapa está pensada para aportar orden y claridad. La interpretación y la decisión final siempre corresponden al profesional."
        />

        {/* Desktop radial */}
        <div className="relative mx-auto mt-20 hidden h-[640px] w-[640px] lg:block">
          <svg
            viewBox="0 0 640 640"
            className="absolute inset-0 h-full w-full"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="320" cy="320" r={RADIUS} stroke="rgba(34,164,255,0.14)" strokeWidth="2" />
            <circle
              ref={ringRef}
              cx="320"
              cy="320"
              r={RADIUS}
              stroke="url(#proc-grad)"
              strokeWidth="3"
              strokeLinecap="round"
              transform="rotate(-90 320 320)"
            />
            <defs>
              <linearGradient id="proc-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0879f9" />
                <stop offset="100%" stopColor="#09c6d9" />
              </linearGradient>
            </defs>
          </svg>

          {/* center */}
          <div className="absolute left-1/2 top-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full glass-strong glow-cyan">
            <DetectionEmblem className="h-12 w-12" />
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Proceso
            </span>
          </div>

          {processSteps.map((step, i) => {
            const rad = (ANGLES[i] * Math.PI) / 180
            const x = Math.cos(rad) * RADIUS
            const y = Math.sin(rad) * RADIUS
            const pos = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
            return (
              <article
                key={step.num}
                data-step
                data-pos={pos}
                style={{ transform: pos }}
                className="absolute left-1/2 top-1/2 w-56 rounded-2xl glass p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-lg border border-cyan/40 bg-surface-strong text-cyan">
                    <step.icon className="size-5" />
                  </span>
                  <span className="font-display text-xl font-bold text-gradient">{step.num}</span>
                </div>
                <h3 className="mt-3 font-display text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </article>
            )
          })}
        </div>

        {/* Mobile / tablet vertical timeline */}
        <ol className="mt-14 flex flex-col gap-4 lg:hidden">
          {processSteps.map((step) => (
            <li key={step.num} data-step className="relative rounded-2xl glass p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-lg border border-cyan/40 bg-surface-strong text-cyan">
                  <step.icon className="size-5" />
                </span>
                <span className="font-display text-xl font-bold text-gradient">{step.num}</span>
                <h3 className="font-display text-base font-semibold text-foreground">
                  {step.title}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>

        {/* Advantages */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
          {processAdvantages.map((adv) => (
            <span
              key={adv}
              className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground"
            >
              {adv}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
