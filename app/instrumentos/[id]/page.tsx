import { notFound } from 'next/navigation'
import { InstrumentDetailClient } from '@/features/instruments/instrument-library'
import { getInstrument } from '@/instruments/catalog'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const instrument = getInstrument(id)

  if (!instrument) {
    return {
      title: 'Instrumento no encontrado | Detection-test',
    }
  }

  return {
    title: `${instrument.nombre} | Detection-test`,
    description: instrument.descripcion,
  }
}

export default async function InstrumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const instrument = getInstrument(id)

  if (!instrument) {
    notFound()
  }

  return <InstrumentDetailClient instrument={instrument} />
}
