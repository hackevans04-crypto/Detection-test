'use client'

import { useRef, type MutableRefObject, type ReactNode } from 'react'
import type { HeroSceneState } from '@/lib/hero/depth'
import { usePrint, type PrintTrigger } from './use-print'

/*
  Funciones de módulo, no callbacks en línea.

  `usePrint` las lleva en las dependencias de su efecto. Definidas dentro del
  componente, cada render crearía dos funciones nuevas, el efecto se volvería a
  montar y el campo de partículas —que cuesta un muestreo completo del PNG— se
  reconstruiría entero en cada render del padre.
*/
const findImage = (host: HTMLElement) => host.querySelector('img')
const sampleImage = (piece: HTMLElement) => {
  const image = piece as HTMLImageElement
  // Se muestrea el propio elemento ya descargado: ni una petición de red extra,
  // y además con el tamaño exacto al que se está viendo.
  return image.complete && image.naturalWidth > 0 ? image : null
}

type ParticleLogoProps = {
  /** Semilla estable: dos marcas nunca comparten nube. */
  seed: string
  print: PrintTrigger
  dissolve: readonly [number, number]
  lag?: number
  angle?: number
  bleed?: number
  budget?: number
  className?: string
  signal?: MutableRefObject<HeroSceneState>
  /** La imagen real: fuente de píxeles y estado de reposo a la vez. */
  children: ReactNode
}

/** Envuelve un logotipo y lo hace entrar impreso por partículas. */
export function ParticleLogo({ seed, print, dissolve, lag, angle, bleed, budget, className, signal, children }: ParticleLogoProps) {
  const host = useRef<HTMLDivElement>(null)

  usePrint({
    host,
    target: findImage,
    sample: sampleImage,
    seed,
    print,
    dissolve,
    lag,
    angle,
    bleed,
    budget,
    signal,
  })

  return (
    <div ref={host} className={className}>
      {children}
      <canvas className="print-canvas" aria-hidden="true" />
    </div>
  )
}
