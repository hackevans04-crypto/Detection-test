import { getInstrument } from '@/instruments/catalog'
import type { SessionUser } from '@/lib/auth/session'
import { formatLongDate } from '@/lib/evaluations/format'
import type {
  BackupDocument,
  Evaluation,
  EvaluationInstrument,
  InstrumentBlueprint,
} from '@/lib/evaluations/model'
import { applicationModeLabels, backupDocumentLabels } from '@/lib/evaluations/model'
import { professionalSnapshot, registrationLine } from '@/lib/evaluations/professional'
import { instrumentProfileChart, type InstrumentProfileChart } from '@/lib/instruments/charts'
import { scoreCompleteness, scoreFieldsFor } from '@/lib/instruments/score-schema'
import { formatDuration, sessionTiming } from '@/lib/instruments/session-timing'

/**
 * Informe de un instrumento.
 *
 * Es el nivel 1 de informe: sólo la evidencia de este instrumento —qué se
 * aplicó, cómo, cuánto duró, qué se midió, qué se observó y qué se concluyó de
 * él—. No integra el caso; eso es el informe general, y confundirlos hace que
 * una prueba parezca una evaluación completa.
 *
 * El documento se arma de lo registrado. Las secciones sin material se declaran
 * pendientes en lugar de rellenarse, y las limitaciones se enumeran solas a
 * partir de lo que falta: es más honesto que un informe liso que oculta que la
 * mitad del protocolo está sin registrar.
 */

export type ReportSection = {
  id: string
  title: string
  body: string[]
  /** `true` cuando la sección todavía no tiene contenido real. */
  pending: boolean
}

export type InstrumentReportData = {
  entryId: string
  title: string
  identification: Array<{ label: string; value: string }>
  objective: string
  conditions: string[]
  profile: InstrumentProfileChart
  scores: Array<{ label: string; group: string | null; value: string }>
  observations: Array<{ at: string; kind: string; note: string }>
  sections: ReportSection[]
  orientations: string[]
  limitations: string[]
  backups: Array<{ id: string; label: string; name: string; uploadedAt: string }>
  signature: { name: string; title: string; registration: string; approvedAt: string | null } | null
  /** Qué impide todavía aprobar el informe. Vacío cuando se puede aprobar. */
  blockers: string[]
}

function narrativeSection(
  id: string,
  title: string,
  narrative: { text: string; status: string },
  pendingCopy: string,
): ReportSection {
  const text = narrative.text.trim()
  return {
    id,
    title,
    body: text ? [text] : [pendingCopy],
    pending: text.length === 0,
  }
}

export function buildInstrumentReport(
  evaluation: Evaluation,
  entry: EvaluationInstrument,
  blueprints: Record<string, InstrumentBlueprint>,
  user: SessionUser,
): InstrumentReportData {
  const timing = sessionTiming(entry.events)
  const instrument = getInstrument(entry.instrumentId)
  const blueprint = entry.blueprintId ? blueprints[entry.blueprintId] : null
  const fields = scoreFieldsFor(entry, blueprints)
  const completeness = scoreCompleteness(entry, fields)
  const profile = instrumentProfileChart(entry, blueprints)
  const backups = evaluation.backups.filter((backup) => backup.evaluationInstrumentId === entry.id)

  const identification = [
    { label: 'Instrumento', value: entry.name },
    { label: 'Evaluado', value: evaluation.initialData.person.fullName || 'Sin registrar' },
    { label: 'Modalidad', value: applicationModeLabels[entry.applicationMode] },
    {
      label: 'Fecha de aplicación',
      value: timing.startedAt ? formatLongDate(timing.startedAt) : 'Sin registrar',
    },
    { label: 'Duración', value: timing.activeMs > 0 ? formatDuration(timing.activeMs) : 'Sin registrar' },
    { label: 'Profesional', value: entry.professionalName || user.name },
  ]

  const conditions: string[] = []
  if (entry.location.trim()) conditions.push(entry.location.trim())
  const interruptions = entry.log.filter((item) => item.kind === 'INTERRUPTION').length
  if (interruptions > 0) {
    conditions.push(`${interruptions} ${interruptions === 1 ? 'interrupción registrada' : 'interrupciones registradas'}.`)
  }
  const supports = entry.log.filter((item) => item.kind === 'SUPPORT').length
  if (supports > 0) {
    conditions.push(`${supports} ${supports === 1 ? 'ayuda proporcionada' : 'ayudas proporcionadas'} durante la aplicación.`)
  }
  if (conditions.length === 0) conditions.push('Sin incidencias registradas durante la aplicación.')

  const limitations: string[] = []
  if (completeness.missing.length > 0) {
    limitations.push(
      `${completeness.missing.length} de ${completeness.total} medidas del protocolo quedaron sin registrar.`,
    )
  }
  if (profile.withoutScale > 0) {
    limitations.push(`${profile.withoutScale} medidas registradas no tienen escala declarada y no se representan.`)
  }
  if (instrument && !instrument.hasNormativeTables) limitations.push(instrument.normativeStatus)
  if (blueprint && blueprint.status !== 'VALIDATED') {
    limitations.push('Las reglas de corrección del instrumento están pendientes de validación profesional.')
  }
  if (backups.length === 0) limitations.push('No se adjuntaron respaldos de la aplicación.')

  const blockers: string[] = []
  if (timing.status !== 'COMPLETED') blockers.push('La aplicación no está finalizada.')
  if (completeness.total > 0 && completeness.recorded === 0) blockers.push('No hay medidas registradas.')
  if (!entry.interpretation.text.trim()) blockers.push('Falta la interpretación del instrumento.')
  if (!entry.conclusion.text.trim()) blockers.push('Falta la conclusión del instrumento.')

  const snapshot = entry.report.signature ?? (entry.report.status === 'APPROVED' ? professionalSnapshot(user) : null)

  return {
    entryId: entry.id,
    title: `Informe de ${entry.name}`,
    identification,
    objective: instrument?.objetivo ?? blueprint?.name ?? 'Objetivo no declarado por el instrumento.',
    conditions,
    profile,
    scores: fields.map((field) => ({
      label: field.label,
      group: field.subtestLabel,
      value: entry.scores[field.id]?.value.trim() || 'Sin registrar',
    })),
    observations: entry.log.map((item) => ({ at: item.at, kind: item.kind, note: item.note })),
    sections: [
      narrativeSection(
        'interpretation',
        'Interpretación',
        entry.interpretation,
        'Interpretación pendiente de redactar.',
      ),
      narrativeSection('conclusion', 'Conclusiones', entry.conclusion, 'Conclusión pendiente de redactar.'),
    ],
    orientations: entry.orientations.filter((item) => item.status === 'ACCEPTED').map((item) => item.text),
    limitations,
    backups: backups.map((backup: BackupDocument) => ({
      id: backup.id,
      label: backupDocumentLabels[backup.documentType],
      name: backup.name,
      uploadedAt: backup.uploadedAt,
    })),
    signature: snapshot
      ? {
          name: snapshot.name,
          title: snapshot.title,
          registration: registrationLine(snapshot),
          approvedAt: entry.report.approvedAt,
        }
      : null,
    blockers,
  }
}

/** Marca el informe como borrador listo para revisión. No lo aprueba. */
export function generateInstrumentReport(entry: EvaluationInstrument): EvaluationInstrument {
  return {
    ...entry,
    report: { ...entry.report, status: 'IN_REVIEW', generatedAt: new Date().toISOString() },
  }
}

/**
 * Aprueba el informe y congela con qué credenciales se firmó. A partir de aquí
 * el documento no depende del perfil: si el registro profesional cambia, este
 * informe sigue diciendo lo que decía cuando se aprobó.
 */
export function approveInstrumentReport(entry: EvaluationInstrument, user: SessionUser): EvaluationInstrument {
  const now = new Date().toISOString()
  return {
    ...entry,
    report: {
      status: 'APPROVED',
      generatedAt: entry.report.generatedAt ?? now,
      approvedAt: now,
      signature: professionalSnapshot(user),
    },
    interpretation: { ...entry.interpretation, status: 'APPROVED', approvedAt: now },
    conclusion: { ...entry.conclusion, status: 'APPROVED', approvedAt: now },
  }
}

/** Devuelve el informe a revisión, conservando lo redactado. */
export function reopenInstrumentReport(entry: EvaluationInstrument): EvaluationInstrument {
  return {
    ...entry,
    report: { ...entry.report, status: 'IN_REVIEW', approvedAt: null, signature: null },
    interpretation: { ...entry.interpretation, status: 'EDITED', approvedAt: null },
    conclusion: { ...entry.conclusion, status: 'EDITED', approvedAt: null },
  }
}
