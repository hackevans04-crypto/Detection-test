import type { Metadata } from 'next'
import { ResultsStep } from '@/features/evaluations/steps/results-step'

export const metadata: Metadata = { title: 'Resultados e interpretacion | Detection-test' }

export default function Page() {
  return <ResultsStep />
}
