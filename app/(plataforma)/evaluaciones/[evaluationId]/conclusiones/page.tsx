import type { Metadata } from 'next'
import { ConclusionsStep } from '@/features/evaluations/steps/conclusions-step'

export const metadata: Metadata = { title: 'Conclusiones | Detection-test' }

export default function Page() {
  return <ConclusionsStep />
}
