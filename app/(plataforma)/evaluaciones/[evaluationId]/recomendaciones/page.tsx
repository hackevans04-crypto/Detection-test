import type { Metadata } from 'next'
import { RecommendationsStep } from '@/features/evaluations/steps/recommendations-step'

export const metadata: Metadata = { title: 'Recomendaciones | Detection-test' }

export default function Page() {
  return <RecommendationsStep />
}
