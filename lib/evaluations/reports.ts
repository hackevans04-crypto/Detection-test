import { ageAt, formatAge } from '@/lib/evaluations/format'
import type { Evaluation } from '@/lib/evaluations/model'

/**
 * Informes emitidos.
 *
 * No se guarda el PDF: se guarda que el informe se emitió, con qué código, en
 * qué fecha y quién lo firmó. El documento se vuelve a componer desde el
 * expediente cuando hace falta, así que descargarlo dos veces da exactamente el
 * mismo contenido y nunca queda un PDF viejo contradiciendo al expediente.
 */

export type EmittedReport = {
  evaluationId: string
  code: string
  fileName: string
  generatedAt: string
  subject: string
  ageLabel: string
  institution: string
  professionalName: string
  professionalRole: string
  /** El expediente cambió después de emitir: el PDF descargado está desfasado. */
  outdated: boolean
}

export function emittedReports(evaluations: Evaluation[]): EmittedReport[] {
  return evaluations
    .filter((evaluation) => evaluation.report.status === 'GENERATED' && evaluation.report.generatedAt)
    .map((evaluation) => {
      const generatedAt = evaluation.report.generatedAt as string
      const age = ageAt(evaluation.initialData.person.birthDate, evaluation.initialData.evaluationDate)
      return {
        evaluationId: evaluation.id,
        code: evaluation.code,
        fileName: evaluation.report.fileName ?? `${evaluation.code}.pdf`,
        generatedAt,
        subject: evaluation.initialData.person.fullName || 'Evaluación sin nombre',
        ageLabel: age ? formatAge(age) : 'Edad no registrada',
        institution: evaluation.initialData.person.institution,
        professionalName: evaluation.report.professional.name || evaluation.evaluatorName,
        professionalRole: evaluation.report.professional.role,
        // `updatedAt` avanza con cada cambio; si va por delante de la emisión,
        // es que se tocó el expediente después de firmar.
        outdated: evaluation.updatedAt > generatedAt,
      }
    })
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
}
