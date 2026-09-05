import type { Baremo } from '@/instruments/types'

/**
 * Clasificación por baremo.
 *
 * Cada instrumento trae el suyo. Antes había dos funciones con los rangos del
 * Test ABC y de PRO-CÁLCULO escritos dentro, y se aplicaban por modo de
 * puntuación: cualquier instrumento de puntuación manual recibía el baremo del
 * Test ABC aunque no tuviera nada que ver con él. Aquí no hay ningún rango
 * escrito: se busca en el baremo que el instrumento declara, y si no declara
 * ninguno que cubra la puntuación, no hay clasificación.
 */
export function classifyWithBaremos(baremos: Baremo[], score: number): Baremo | null {
  return (
    baremos.find((baremo) => {
      const min = baremo.min ?? Number.NEGATIVE_INFINITY
      const max = baremo.max ?? Number.POSITIVE_INFINITY
      return score >= min && score <= max
    }) ?? null
  )
}

/** Etiqueta de un baremo. El nivel sólo se añade cuando dice algo distinto del rango. */
export function baremoLabel(baremo: Baremo | null): string | null {
  if (!baremo) return null
  return baremo.nivel === baremo.rango ? baremo.rango : `${baremo.rango} / ${baremo.nivel}`
}
