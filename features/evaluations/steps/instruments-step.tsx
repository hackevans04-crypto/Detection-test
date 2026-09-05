'use client'

import { InstrumentCenter } from '@/features/evaluations/instruments/center/instrument-center'

/**
 * Paso 6 del expediente.
 *
 * La etapa entera es el centro de evaluación instrumental; esta capa sólo la
 * monta en la ruta, para que la organización interna del centro pueda cambiar
 * sin tocar el enrutado del expediente.
 */
export function InstrumentsStep() {
  return <InstrumentCenter />
}
