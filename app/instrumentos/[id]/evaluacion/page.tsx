import { type Metadata } from 'next'
import { InstrumentEvaluationClient } from '@/features/instruments/instrument-evaluation'

export const metadata: Metadata = {
  title: 'Evaluacion de instrumento | Detection-test',
  description: 'Aplicacion guiada para instrumentos de evaluacion psicopedagogica.',
}

export default async function InstrumentEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InstrumentEvaluationClient instrumentId={id} />
}
