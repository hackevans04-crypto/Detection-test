import type { Metadata } from 'next'
import { BackgroundStep } from '@/features/evaluations/steps/background-step'

export const metadata: Metadata = { title: 'Contexto y antecedentes | Detection-test' }

export default function Page() {
  return <BackgroundStep />
}
