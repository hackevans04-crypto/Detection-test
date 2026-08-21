'use client'

import { cn } from '@/lib/utils'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { registerGsap, gsap, ScrollTrigger } from '@/lib/animations/gsap'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

type ParallaxLayerProps = {
  children: ReactNode
  /** 0 = fixed, positive = moves up on scroll. Typical 0.05 - 0.85 */
  speed?: number
  className?: string
  style?: CSSProperties
}

/**
 * Scroll-driven vertical parallax using GSAP + ScrollTrigger.
 * Falls back to static (no transform) when reduced motion is preferred.
 */
export function ParallaxLayer({ children, speed = 0.2, className, style }: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced || !ref.current) return
    registerGsap()
    const el = ref.current
    const distance = speed * 180

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { yPercent: -speed * 12 },
        {
          y: distance,
          ease: 'none',
          scrollTrigger: {
            trigger: el.parentElement ?? el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      )
    }, el)

    return () => ctx.revert()
  }, [speed, reduced])

  return (
    <div ref={ref} className={cn('will-change-transform', className)} style={style} aria-hidden="true">
      {children}
    </div>
  )
}
