'use client'

import { cn } from '@/lib/utils'
import { developer } from '@/data/developer'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { usePointerParallax } from '@/hooks/use-pointer-parallax'
import { gsap } from '@/lib/animations/gsap'
import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { NodeNetwork } from './node-network'

export function OlbroxParallax({ className }: { className?: string }) {
  const logoRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const pointer = usePointerParallax(!reduced)

  useEffect(() => {
    if (reduced || !logoRef.current) return
    gsap.to(logoRef.current, {
      rotateY: pointer.x * 4,
      rotateX: -pointer.y * 3,
      x: pointer.x * 10,
      y: pointer.y * 8,
      duration: 0.7,
      ease: 'power2.out',
      transformPerspective: 900,
    })
  }, [pointer, reduced])

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* background network */}
      <div className="pointer-events-none absolute inset-0 scale-125 opacity-30">
        <NodeNetwork />
      </div>
      {/* light streaks */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-2/3 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue/25 blur-[90px]" />
      </div>

      <div
        ref={logoRef}
        className="relative z-10 will-change-transform [transform-style:preserve-3d]"
        style={{ animation: reduced ? undefined : 'float-slow 6s ease-in-out infinite' }}
      >
        <div className="overflow-hidden rounded-3xl border border-border glow-blue">
          <Image
            src={developer.logo || '/placeholder.svg'}
            alt={`Logo de ${developer.name}`}
            width={420}
            height={420}
            className="h-auto w-full max-w-[360px]"
          />
        </div>
      </div>
    </div>
  )
}
