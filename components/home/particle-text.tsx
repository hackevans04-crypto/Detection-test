'use client'

import { useRef, type ElementType, type MutableRefObject, type ReactNode, type Ref } from 'react'
import type { HeroSceneState } from '@/lib/hero/depth'
import { rasterizeText } from '@/lib/hero/text-raster'
import { usePrint, type PrintTrigger } from './use-print'

const findBody = (host: HTMLElement) => host.querySelector<HTMLElement>('.print-body')
const sampleBody = (piece: HTMLElement, width: number, height: number, dpr: number) =>
  rasterizeText(piece, width, height, dpr)

/**
 * Paso de muestreo del texto, en píxeles de dispositivo.
 *
 * Dos y no tres. El asta de una letra de doce píxeles mide tres o cuatro
 * píxeles de dispositivo: con el paso por defecto le tocaba UNA partícula y la
 * palabra dejaba de reconocerse durante toda la impresión. A dos, cada asta
 * lleva dos o tres y el texto se sigue leyendo mientras se forma, que es la
 * diferencia entre materializar una frase y enseñar ruido.
 */
const TEXT_GAP = 2

type ParticleTextProps = {
  /** Etiqueta del envoltorio. La semántica no la decide este componente. */
  as?: ElementType
  /** Semilla estable: dos piezas nunca comparten nube. */
  seed: string
  print: PrintTrigger
  dissolve: readonly [number, number]
  lag?: number
  angle?: number
  bleed?: number
  budget?: number
  className?: string
  signal?: MutableRefObject<HeroSceneState>
  children: ReactNode
}

/**
 * Imprime un texto del DOM con partículas.
 *
 * El texto sigue siendo texto: se queda en el documento, se selecciona, se
 * copia y lo lee un lector de pantalla igual que antes. Lo único que hace el
 * componente es esconderlo mientras la nube lo construye y devolvérselo al
 * navegador —nítido, con su tipografía real— en cuanto termina. Ver
 * `rasterizeText` para cómo se copia la maquetación sin reinventarla.
 *
 * Sin polvo residual, a diferencia de los logotipos: alrededor de una marca es
 * vida, alrededor de un párrafo es suciedad. Además, un campo sin polvo se
 * apaga del todo al terminar y deja de costar fotogramas.
 */
export function ParticleText({
  as = 'span',
  seed,
  print,
  dissolve,
  lag,
  angle,
  bleed,
  budget = 1800,
  className,
  signal,
  children,
}: ParticleTextProps) {
  const host = useRef<HTMLElement>(null)

  usePrint({
    host,
    target: findBody,
    sample: sampleBody,
    seed,
    print,
    dissolve,
    lag,
    angle,
    bleed,
    budget,
    gap: TEXT_GAP,
    dust: 0,
    signal,
  })

  // La etiqueta la decide quien llama, pero TypeScript no puede comprobar los
  // atributos de una etiqueta dinámica: se estrecha a una conocida y el `ref`
  // se acompaña. Ninguna de las etiquetas admitidas cambia el marcado emitido.
  const Tag = as as 'span'
  return (
    <Tag ref={host as Ref<HTMLSpanElement>} className={className}>
      <span className="print-body">{children}</span>
      <canvas className="print-canvas" aria-hidden="true" />
    </Tag>
  )
}
