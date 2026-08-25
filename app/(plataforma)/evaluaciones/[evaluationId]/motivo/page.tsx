import type { Metadata } from 'next'
import { ReferralStep } from '@/features/evaluations/steps/referral-step'

export const metadata: Metadata = { title: 'Motivo y remitente | Detection-test' }

export default function Page() {
  return <ReferralStep />
}
