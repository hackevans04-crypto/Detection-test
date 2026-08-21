'use client'

import { useEffect, useRef } from 'react'
import { registerGsap, gsap } from '@/lib/animations/gsap'
import { useReducedMotion } from './use-reduced-motion'

/**
 * Reveals direct children (with [data-reveal]) with a staggered fade/rise on scroll.
 * Under reduced motion, elements are shown immediately.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (!ref.current) return
    const targets = ref.current.querySelectorAll<HTMLElement>('[data-reveal]')
    if (targets.length === 0) return

    if (reduced) {
      targets.forEach((t) => {
        t.style.opacity = '1'
        t.style.transform = 'none'
      })
      return
    }

    registerGsap()
    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y: 34 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: { trigger: ref.current, start: 'top 78%' },
        },
      )
    }, ref)

    return () => ctx.revert()
  }, [reduced])

  return ref
}
