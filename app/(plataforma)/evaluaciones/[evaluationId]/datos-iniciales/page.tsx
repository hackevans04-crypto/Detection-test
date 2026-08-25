import type { Metadata } from 'next'
import { InitialDataStep } from '@/features/evaluations/steps/initial-data-step'

export const metadata: Metadata = { title: 'Datos iniciales | Detection-test' }

export default function Page() {
  return <InitialDataStep />
}
