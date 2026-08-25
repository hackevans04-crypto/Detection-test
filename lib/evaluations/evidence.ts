import { backgroundSchema } from '@/lib/evaluations/background-schema'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import { ageAt, formatAge, orDash } from '@/lib/evaluations/format'
import type { Evaluation } from '@/lib/evaluations/model'
import { evaluationResults } from '@/lib/evaluations/results'

/**
 * Resumen de la evidencia acumulada en el expediente.
 *
 * Existe porque las conclusiones se redactan mirando todo el proceso, no sólo
 * los tests: identificación, motivo, antecedentes, observación funcional e
 * instrumentos. Es un extracto de consulta, nunca un borrador: no propone
 * texto, no valora y no concluye. Quien concluye firma.
 */

export type EvidenceItem = {
  label: string
  value: string
  /** Marca lo que pide atención al redactar; no es un juicio clínico. */
  tone?: 'warning' | 'danger'
}

export type EvidenceGroup = {
  id: string
  title: string
  items: EvidenceItem[]
}

const NOTHING = 'Sin registrar.'

function countWritten(values: Record<string, string> | undefined) {
  return Object.values(values ?? {}).filter((value) => value.trim().length > 0).length
}

export function evaluationEvidence(evaluation: Evaluation): EvidenceGroup[] {
  const { initialData } = evaluation
  const age = ageAt(initialData.person.birthDate, initialData.evaluationDate)
  const groups: EvidenceGroup[] = []

  groups.push({
    id: 'datos',
    title: 'Datos relevantes',
    items: [
      {
        label: 'Evaluado',
        value: [orDash(initialData.person.fullName, NOTHING), age ? formatAge(age) : null].filter(Boolean).join(' · '),
      },
      {
        label: 'Escolaridad',
        value:
          [initialData.person.grade, initialData.person.institution].filter(Boolean).join(' · ') || NOTHING,
      },
      { label: 'Motivo de evaluación', value: orDash(evaluation.referral.reason, NOTHING) },
      { label: 'Remitente', value: orDash(evaluation.referral.source, NOTHING) },
    ],
  })

  // De los antecedentes interesa qué secciones tienen contenido, no volcarlas
  // enteras: el profesional las tiene a un clic y aquí sólo necesita recordar
  // qué llegó a documentar.
  const documented = backgroundSchema
    .filter((section) => countWritten(evaluation.background[section.id]) > 0)
    .map((section) => section.label)

  groups.push({
    id: 'antecedentes',
    title: 'Antecedentes significativos',
    items: [
      {
        label: 'Secciones documentadas',
        value: documented.length > 0 ? documented.join(', ') : NOTHING,
        tone: documented.length === 0 ? 'warning' : undefined,
      },
      {
        label: 'Intervenciones previas',
        value:
          evaluation.interventions.length > 0
            ? evaluation.interventions
                .map((item) => [item.specialty, item.institution, item.year].filter(Boolean).join(' · '))
                .join(' | ')
            : 'Ninguna registrada.',
      },
    ],
  })

  const observed = functionalAreaSchema
    .map((schema) => ({ schema, record: evaluation.functionalAreas[schema.id] }))
    .filter((item) => item.record?.performance)

  const withDifficulty = observed.filter((item) => item.record.performance !== 'Adecuado')

  groups.push({
    id: 'areas',
    title: 'Áreas evaluadas',
    items:
      observed.length === 0
        ? [{ label: 'Observación funcional', value: NOTHING, tone: 'warning' }]
        : [
            {
              label: 'Áreas con dificultad',
              value:
                withDifficulty.length > 0
                  ? withDifficulty.map((item) => `${item.schema.label} (${item.record.performance})`).join(', ')
                  : 'Ninguna: todas las áreas observadas resultaron adecuadas.',
              tone: withDifficulty.some((item) => item.record.performance === 'Dificultad marcada')
                ? 'danger'
                : withDifficulty.length > 0
                  ? 'warning'
                  : undefined,
            },
            {
              label: 'Áreas adecuadas',
              value:
                observed
                  .filter((item) => item.record.performance === 'Adecuado')
                  .map((item) => item.schema.label)
                  .join(', ') || 'Ninguna.',
            },
          ],
  })

  for (const result of evaluationResults(evaluation)) {
    const items: EvidenceItem[] = [
      {
        label: 'Resultado',
        value: result.global
          ? `${result.pdTotal} puntos · ${result.global.range} · ${result.global.level}`
          : `${result.recorded} de ${result.total} ${result.instrument.unidad.plural} registrados`,
        tone: result.global ? undefined : 'warning',
      },
    ]

    // Sólo se señalan las mediciones que tienen escala real. Una PD suelta sin
    // tabla normativa no dice si el desempeño es bajo, y fingir que sí lo dice
    // sería inventar un baremo.
    const weakest =
      result.instrument.scoringMode === 'manual_score'
        ? result.rows.filter((row) => row.pd !== null && row.max > 0 && row.pd / row.max <= 0.34)
        : result.rows.filter((row) => row.pt !== null && row.pt <= 39)

    if (weakest.length > 0) {
      items.push({
        label: 'Menor desempeño',
        value: weakest.map((row) => row.nombre).join(', '),
        tone: 'warning',
      })
    }

    const application = evaluation.instrumentApplications[result.instrument.id]
    if (application?.interpretation.trim()) {
      items.push({ label: 'Interpretación del instrumento', value: application.interpretation })
    }

    groups.push({ id: result.instrument.id, title: result.instrument.nombre, items })
  }

  groups.push({
    id: 'interpretacion',
    title: 'Interpretación profesional',
    items: [
      {
        label: 'Lectura global',
        value: orDash(evaluation.interpretation, 'Pendiente de redactar.'),
        tone: evaluation.interpretation.trim() ? undefined : 'warning',
      },
    ],
  })

  return groups
}
