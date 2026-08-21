'use client'

import { useEffect, useRef, useState } from 'react'

type Pointer = { x: number; y: number }

/**
 * Tracks normalized pointer position (-1..1) relative to viewport center.
 * Only active on fine-pointer + hover devices, and disabled when reduced motion is on.
 */
export function usePointerParallax(enabled = true) {
  const [pointer, setPointer] = useState<Pointer>({ x: 0, y: 0 })
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!fine.matches || reduced.matches) return

    const onMove = (e: MouseEvent) => {
      if (raf.current) cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth) * 2 - 1
        const y = (e.clientY / window.innerHeight) * 2 - 1
        setPointer({ x, y })
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [enabled])

  return pointer
}
