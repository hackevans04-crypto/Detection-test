'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Check, CircleDashed, Download, Eye, FileCheck2, Loader2, UserRound } from 'lucide-react'
import { TextField } from '@/components/ui/fields'
import { DateField } from '@/components/ui/date-field'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'
import { loadReportAssets } from '@/lib/evaluations/report-assets'
import { buildReport, reportFileName } from '@/lib/evaluations/report'
import { stepIds, stepLabels } from '@/lib/evaluations/model'
import { evaluationProgress } from '@/lib/evaluations/progress'
import { formatUpdatedAt } from '@/lib/evaluations/format'

const contentSteps = stepIds.filter((step) => step !== 'informe')

/**
 * Emisión del informe.
 *
 * Dos preguntas y nada más: si el proceso está completo y quién firma. El PDF
 * no se ofrece antes de responderlas —un informe sin responsable no es un
 * informe— y cuando falta algo se dice qué y se enlaza dónde.
 */
export function FinalReportStep() {
  const { evaluation, update, saveNow } = useEvaluation()
  const progress = evaluationProgress(evaluation)
  const contentReady = progress.pendingSteps.length === 0
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const professional = evaluation.report.professional
  const signed = professional.name.trim().length > 0 && professional.role.trim().length > 0
  const ready = contentReady && signed

  const setProfessional = (patch: Partial<typeof professional>) =>
    update((current) => ({
      ...current,
      report: { ...current.report, professional: { ...current.report.professional, ...patch } },
    }))

  const generate = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const assets = await loadReportAssets()
      const document = buildReport(evaluation)
      const blob = generatePsychopedagogicalReport(document, assets)
      const fileName = reportFileName(evaluation)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      window.document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      update((current) => ({
        ...current,
        report: { ...current.report, status: 'GENERATED', generatedAt: new Date().toISOString(), fileName },
      }))
      await saveNow()
    } catch (error) {
      setFailure(
        error instanceof Error
          ? `No se pudo generar el informe: ${error.message}`
          : 'No se pudo generar el informe. Vuelve a intentarlo.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepCard step="informe" description="Revisa la completitud del proceso y firma antes de emitir el informe.">
      <div className="dt-issue">
        <section aria-labelledby="generar-informe">
          <h3 id="generar-informe" className="dt-section-title">
            <FileCheck2 aria-hidden="true" />
            Generar informe
          </h3>

          <ul className="dt-gate mt-4">
            <GateItem
              complete={contentReady}
              title="Verificación del proceso"
              detail={
                contentReady
                  ? `Las ${progress.contentTotal} etapas de contenido están completas.`
                  : `Faltan ${progress.pendingSteps.length} de ${progress.contentTotal} etapas de contenido.`
              }
            />
            <GateItem
              complete={signed}
              title="Profesional responsable"
              detail={
                signed
                  ? `${professional.name} · ${professional.role}`
                  : 'Indica el nombre y el cargo de quien firma el informe.'
              }
            />
            <GateItem
              complete={evaluation.report.status === 'GENERATED'}
              title="Documento emitido"
              detail={
                evaluation.report.status === 'GENERATED'
                  ? `Generado ${formatUpdatedAt(evaluation.report.generatedAt ?? evaluation.updatedAt)}.`
                  : ready
                    ? 'Todo listo: ya puedes generar el PDF.'
                    : 'Se habilita al completar lo anterior.'
              }
            />
          </ul>

          {!contentReady ? (
            <div className="dt-note mt-4" data-tone="warning">
              <AlertCircle aria-hidden="true" />
              <span>
                <strong>Falta completar:</strong>
                <span className="mt-2 flex flex-wrap gap-2">
                  {progress.pendingSteps.map((step) => (
                    <Link
                      key={step}
                      href={`/evaluaciones/${evaluation.id}/${step}`}
                      className="dt-btn dt-btn-secondary dt-btn-sm"
                    >
                      {stepLabels[step]}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  ))}
                </span>
              </span>
            </div>
          ) : null}

          <details className="mt-4">
            <summary className="dt-section-link" style={{ cursor: 'pointer' }}>
              Ver el detalle de las {progress.contentTotal} etapas
            </summary>
            <ul className="dt-checklist mt-3">
              {contentSteps.map((step) => {
                const complete = !progress.pendingSteps.includes(step)
                return (
                  <li key={step} className="dt-checklist-item" data-complete={complete}>
                    <span className="dt-checklist-mark" aria-hidden="true">
                      {complete ? <Check /> : <CircleDashed />}
                    </span>
                    <span className="flex-1">{stepLabels[step]}</span>
                    <span className="dt-sr-only">{complete ? 'completada' : 'pendiente'}</span>
                  </li>
                )
              })}
            </ul>
          </details>
        </section>

        <section aria-labelledby="datos-profesional">
          <h3 id="datos-profesional" className="dt-section-title">
            <UserRound aria-hidden="true" />
            Datos del profesional
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--dt-muted)' }}>
            Cierra el informe quien responde de él. Estos datos encabezan la firma del documento emitido.
          </p>

          <div className="dt-inline-fields mt-4">
            <TextField
              label="Profesional responsable"
              required
              value={professional.name}
              onChange={(next) => setProfessional({ name: next })}
              placeholder="Nombres y apellidos"
            />
            <TextField
              label="Cargo o especialidad"
              required
              value={professional.role}
              onChange={(next) => setProfessional({ role: next })}
              placeholder="Ej. Psicopedagogo/a"
            />
            <TextField
              label="N.º de registro profesional"
              value={professional.registryNumber}
              onChange={(next) => setProfessional({ registryNumber: next })}
              placeholder="Si aplica"
            />
            <DateField
              label="Fecha de emisión"
              value={professional.date}
              onChange={(next) => setProfessional({ date: next })}
            />
          </div>

          {failure ? (
            <p className="dt-note mt-4" data-tone="danger" role="alert">
              <AlertCircle aria-hidden="true" />
              {failure}
            </p>
          ) : null}
        </section>
      </div>

      {evaluation.report.status === 'GENERATED' ? (
        <div className="dt-note mt-6" data-tone="success">
          <Check aria-hidden="true" />
          <span>
            <strong>Informe archivado.</strong> Queda guardado en informes emitidos y puedes volver a descargarlo cuando
            lo necesites; el PDF se recompone desde el expediente, así que siempre coincide con lo registrado.
            <span className="mt-2 flex flex-wrap gap-2">
              <Link href="/evaluaciones/informes" className="dt-btn dt-btn-secondary dt-btn-sm">
                <FileCheck2 aria-hidden="true" />
                Ver informes emitidos
              </Link>
              <Link href="/evaluaciones" className="dt-btn dt-btn-secondary dt-btn-sm">
                <ArrowLeft aria-hidden="true" />
                Volver a evaluaciones
              </Link>
            </span>
          </span>
        </div>
      ) : null}

      <div className="dt-step-footer">
        <Link href={`/evaluaciones/${evaluation.id}/recomendaciones`} className="dt-btn dt-btn-secondary">
          <ArrowLeft aria-hidden="true" />
          Anterior
        </Link>
        <div className="dt-step-footer-actions">
          <Link
            href={`/evaluaciones/${evaluation.id}/informe/preview`}
            className="dt-btn dt-btn-secondary"
            aria-disabled={!contentReady}
            onClick={(event) => {
              if (!contentReady) event.preventDefault()
            }}
          >
            <Eye aria-hidden="true" />
            Vista previa
          </Link>
          <button type="button" className="dt-btn dt-btn-primary" disabled={!ready || busy} onClick={() => void generate()}>
            {busy ? <Loader2 className="dt-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            {evaluation.report.status === 'GENERATED' ? 'Volver a generar' : 'Generar informe PDF'}
          </button>
        </div>
      </div>
    </StepCard>
  )
}

function GateItem({ complete, title, detail }: { complete: boolean; title: string; detail: string }) {
  return (
    <li className="dt-gate-item" data-complete={complete}>
      <span className="dt-gate-mark" aria-hidden="true">
        {complete ? <Check /> : <CircleDashed />}
      </span>
      <span className="dt-gate-body">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="dt-sr-only">{complete ? 'listo' : 'pendiente'}</span>
    </li>
  )
}
