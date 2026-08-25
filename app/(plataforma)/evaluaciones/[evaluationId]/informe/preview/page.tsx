import type { Metadata } from 'next'
import { ReportPreviewScreen } from '@/features/evaluations/report/report-preview-screen'

export const metadata: Metadata = { title: 'Vista previa del informe | Detection-test' }

export default function Page() {
  return <ReportPreviewScreen />
}
