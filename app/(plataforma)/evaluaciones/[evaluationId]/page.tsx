'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { resumeStep } from '@/lib/evaluations/progress'
import { LoadingSkeleton } from '@/components/ui/states'

/**
 * Entrada sin etapa: lleva a la primera que quede por completar, que es donde
 * el profesional dejo el trabajo.
 */
export default function EvaluationEntryPage() {
  const router = useRouter()
  const { evaluation } = useEvaluation()

  useEffect(() => {
    router.replace(`/evaluaciones/${evaluation.id}/${resumeStep(evaluation)}`)
  }, [evaluation, router])

  return <LoadingSkeleton rows={1} height={320} label="Abriendo la evaluacion" />
}
