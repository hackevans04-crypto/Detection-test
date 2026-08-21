'use client'

import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'
import { registerGsap, gsap, ScrollTrigger } from '@/lib/animations/gsap'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { usePointerParallax } from '@/hooks/use-pointer-parallax'

const NET_NODES = [
  { x: 250, y: 120 }, { x: 320, y: 165 }, { x: 235, y: 195 },
  { x: 320, y: 235 }, { x: 250, y: 258 }, { x: 300, y: 300 },
  { x: 235, y: 320 }, { x: 315, y: 345 }, { x: 250, y: 372 },
]
const NET_EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3], [2, 4], [3, 5], [4, 5],
  [4, 6], [5, 7], [6, 8], [7, 8], [6, 7], [1, 2],
]

/**
 * Signature hero visual: a faithful SVG recreation of the Detection-test emblem
 * (left brain hemisphere + right neural network inside a ring). Scroll-driven:
 * the halves separate, pulses travel the network, then everything reassembles.
 * Fully reversible with scroll. Static poster under reduced motion.
 */
export function DetectionScrollScene({ className }: { className?: string }) {
  const scopeRef = useRef<HTMLDivElement>(null)
  const brainRef = useRef<SVGGElement>(null)
  const netRef = useRef<SVGGElement>(null)
  const ringRef = useRef<SVGGElement>(null)
  const coreRef = useRef<SVGCircleElement>(null)
  const reduced = useReducedMotion()
  const pointer = usePointerParallax(!reduced)

  useEffect(() => {
    if (reduced || !scopeRef.current) return
    registerGsap()

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: scopeRef.current,
          start: 'top top',
          end: '+=140%',
          scrub: 1,
        },
      })

      tl.to(scopeRef.current, { scale: 1.08, ease: 'none' }, 0)
        .to(brainRef.current, { x: -46, rotate: -3, ease: 'none' }, 0)
        .to(netRef.current, { x: 46, rotate: 3, ease: 'none' }, 0)
        .to(coreRef.current, { attr: { r: 26 }, opacity: 0.9, ease: 'none' }, 0)
        .to([brainRef.current, netRef.current], { x: 0, rotate: 0, ease: 'none' }, 0.7)
        .to(scopeRef.current, { scale: 1, ease: 'none' }, 0.7)
        .to(coreRef.current, { attr: { r: 10 }, opacity: 0.5, ease: 'none' }, 0.7)

      gsap.to(ringRef.current, {
        rotate: 360,
        transformOrigin: '50% 50%',
        duration: 60,
        repeat: -1,
        ease: 'none',
      })
    }, scopeRef)

    return () => ctx.revert()
  }, [reduced])

  // Subtle mouse parallax on the whole scene.
  useEffect(() => {
    if (reduced || !scopeRef.current) return
    gsap.to(scopeRef.current, {
      rotateY: pointer.x * 3,
      rotateX: -pointer.y * 2,
      duration: 0.6,
      ease: 'power2.out',
      transformPerspective: 900,
    })
  }, [pointer, reduced])

  return (
    <div className={cn('relative aspect-square w-full', className)}>
      {/* volumetric glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-3/4 w-3/4 rounded-full bg-blue/25 blur-[90px]" />
        <div className="absolute h-1/2 w-1/2 rounded-full bg-cyan/20 blur-[70px]" />
      </div>

      <div ref={scopeRef} className="h-full w-full will-change-transform [transform-style:preserve-3d]">
        <svg viewBox="0 0 500 500" className="h-full w-full" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="ds-brain" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0a2e63" />
              <stop offset="100%" stopColor="#062a55" />
            </linearGradient>
            <linearGradient id="ds-line" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0879f9" />
              <stop offset="100%" stopColor="#09c6d9" />
            </linearGradient>
            <radialGradient id="ds-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#45d9e7" />
              <stop offset="100%" stopColor="#0879f9" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="ds-node" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7fe6f0" />
              <stop offset="100%" stopColor="#0879f9" />
            </radialGradient>
          </defs>

          {/* rotating ring with accent dots */}
          <g ref={ringRef}>
            <circle cx="250" cy="250" r="205" stroke="url(#ds-line)" strokeWidth="2" strokeOpacity="0.5" />
            <circle cx="250" cy="250" r="205" stroke="#09c6d9" strokeWidth="6" strokeOpacity="0.9"
              strokeDasharray="10 1280" strokeLinecap="round" />
            <circle cx="45" cy="250" r="6" fill="#0879f9" />
            <circle cx="455" cy="250" r="6" fill="#09c6d9" />
          </g>

          {/* central core pulse */}
          <circle ref={coreRef} cx="250" cy="250" r="10" fill="url(#ds-core)" opacity="0.5" />

          {/* left brain hemisphere (stylized) */}
          <g ref={brainRef} className="will-change-transform">
            <path
              d="M250 105
                 C205 100 168 118 152 150
                 C120 152 100 178 108 205
                 C86 222 88 258 112 272
                 C104 302 126 330 158 330
                 C168 362 208 380 250 372
                 Z"
              fill="url(#ds-brain)"
              stroke="#0879f9"
              strokeOpacity="0.6"
              strokeWidth="2"
            />
            {/* gyri lines */}
            <path d="M250 140 C210 150 200 175 220 195 C200 215 210 245 240 250"
              stroke="#1c4b8a" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
            <path d="M250 250 C215 258 205 285 232 305 C220 325 232 350 250 350"
              stroke="#1c4b8a" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
            <path d="M170 175 C150 195 155 230 180 240"
              stroke="#1c4b8a" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
            <path d="M150 260 C138 285 158 305 180 300"
              stroke="#1c4b8a" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
          </g>

          {/* right neural network hemisphere */}
          <g ref={netRef} className="will-change-transform">
            <path
              d="M250 105
                 C295 100 332 118 348 150
                 C380 152 400 178 392 205
                 C414 222 412 258 388 272
                 C396 302 374 330 342 330
                 C332 362 292 380 250 372"
              stroke="url(#ds-line)"
              strokeWidth="2"
              strokeOpacity="0.5"
              fill="none"
            />
            {NET_EDGES.map(([a, b], i) => (
              <line
                key={i}
                x1={NET_NODES[a].x}
                y1={NET_NODES[a].y}
                x2={NET_NODES[b].x}
                y2={NET_NODES[b].y}
                stroke="url(#ds-line)"
                strokeWidth="1.6"
                strokeOpacity="0.7"
                strokeDasharray="3 7"
                style={{ animation: `dash-move ${5 + (i % 4)}s linear infinite` }}
              />
            ))}
            {NET_NODES.map((n, i) => (
              <g key={i}>
                <circle
                  cx={n.x}
                  cy={n.y}
                  r="8"
                  fill="#09c6d9"
                  opacity="0.4"
                  style={{
                    transformOrigin: `${n.x}px ${n.y}px`,
                    animation: `pulse-ring ${3 + (i % 3)}s ease-out infinite`,
                    animationDelay: `${(i % 5) * 0.35}s`,
                  }}
                />
                <circle cx={n.x} cy={n.y} r="4.5" fill="url(#ds-node)" />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
