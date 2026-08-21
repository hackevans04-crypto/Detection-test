'use client'

import { cn } from '@/lib/utils'
import Image from 'next/image'
import { institution, institutionBadges } from '@/data/institution'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { registerGsap, gsap } from '@/lib/animations/gsap'
import { useEffect, useRef, useState } from 'react'

export function InstitutionParallax({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const reduced = useReducedMotion()
  // Sin fotografía de campus se entra directamente en el respaldo: pedirla
  // sólo para que falle añadía un 404 a cada carga de la página.
  const [failed, setFailed] = useState(!institution.campusImage)

  useEffect(() => {
    if (reduced || !imgRef.current) return
    registerGsap()
    const ctx = gsap.context(() => {
      gsap.fromTo(
        imgRef.current,
        { yPercent: -6, scale: 1.12 },
        {
          yPercent: 6,
          scale: 1.06,
          ease: 'none',
          scrollTrigger: {
            trigger: wrapRef.current,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      )
    }, wrapRef)
    return () => ctx.revert()
  }, [reduced])

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border glow-blue',
        className,
      )}
    >
      {/* Layer 1 — photo (auto-loads the real Rectorado photo once added) */}
      <div ref={imgRef} className="absolute inset-0 will-change-transform">
        {failed ? (
          // Elegant fallback until the real campus photo is provided.
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_50%_35%,#0a2e63,#020817)]">
            <Image
              src={institution.crest || '/placeholder.svg'}
              alt=""
              width={180}
              height={180}
              className="h-2/5 w-auto object-contain opacity-25"
            />
            <span className="absolute bottom-16 left-1/2 -translate-x-1/2 text-center text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Fotografía del campus UTEQ
            </span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={institution.campusImage ?? ''}
            alt={institution.campusImageAlt}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      {/* Layer 2 — atmosphere / color grade */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020817] via-[#020817]/35 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(9,198,217,0.18),transparent_60%)] mix-blend-screen" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-25" />

      {/* Layer 3 — orbital tech arcs */}
      <svg
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 opacity-60"
        viewBox="0 0 200 200"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="90" stroke="#09c6d9" strokeWidth="1" strokeOpacity="0.4" />
        <circle cx="100" cy="100" r="70" stroke="#0879f9" strokeWidth="1" strokeOpacity="0.3"
          strokeDasharray="6 10" style={{ animation: 'spin-slow 40s linear infinite', transformOrigin: '100px 100px' }} />
        <circle cx="10" cy="100" r="3" fill="#09c6d9" />
      </svg>

      {/* Layer 4 — glass badges */}
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2">
        {institutionBadges.map((b) => (
          <span
            key={b.label}
            className="inline-flex items-center gap-2 rounded-full glass px-3 py-1.5 text-xs font-medium text-foreground"
          >
            <b.icon className="size-3.5 text-cyan" />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}
