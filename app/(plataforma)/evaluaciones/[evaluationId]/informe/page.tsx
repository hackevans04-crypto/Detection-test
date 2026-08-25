import type { Metadata } from 'next'
import { FinalReportStep } from '@/features/evaluations/steps/final-report-step'

export const metadata: Metadata = { title: 'Informe final | Detection-test' }

export default function Page() {
  return <FinalReportStep />
}
