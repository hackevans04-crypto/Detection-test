import type { Metadata } from 'next'
import { FunctionalAreasStep } from '@/features/evaluations/steps/functional-areas-step'

export const metadata: Metadata = { title: 'Areas de evaluacion | Detection-test' }

export default function Page() {
  return <FunctionalAreasStep />
}
