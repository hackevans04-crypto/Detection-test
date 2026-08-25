import type { Metadata } from 'next'
import { InstrumentWorkspace } from '@/features/evaluations/instruments/instrument-workspace'
import { getInstrument } from '@/instruments/catalog'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ instrumentId: string }>
}): Promise<Metadata> {
  const { instrumentId } = await params
  const instrument = getInstrument(instrumentId)
  return { title: `${instrument?.nombre ?? 'Instrumento'} | Detection-test` }
}

export default async function InstrumentPage({ params }: { params: Promise<{ instrumentId: string }> }) {
  const { instrumentId } = await params
  return <InstrumentWorkspace instrumentId={instrumentId} />
}
