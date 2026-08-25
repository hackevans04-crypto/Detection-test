'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Download,
  FileCheck2,
  Loader2,
  Search,
  SearchX,
} from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/states'
import { Avatar } from '@/features/evaluations/components/evaluation-bits'
import { useSession } from '@/lib/auth/session-context'
import { formatUpdatedAt, orDash } from '@/lib/evaluations/format'
import { emittedReports, type EmittedReport } from '@/lib/evaluations/reports'
import { buildReport, reportFileName } from '@/lib/evaluations/report'
import { loadReportAssets } from '@/lib/evaluations/report-assets'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'
import type { Evaluation } from '@/lib/evaluations/model'
import { EvaluationStoreError, getEvaluation, listEvaluations, subscribe } from '@/lib/evaluations/store'

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; evaluations: Evaluation[] }

/**
 * Archivo de informes emitidos.
 *
 * Es la respuesta a «¿dónde queda lo que ya firmé?». Cada fila vuelve a
 * componer su PDF desde el expediente en el momento de descargarlo, de forma
 * que lo que se entrega siempre concuerda con lo registrado; cuando el
 * expediente se ha tocado después de emitir, se dice.
 */
export function ReportsArchive() {
  const { user } = useSession()
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const load = useCallback(() => {
    listEvaluations(user.id)
      .then((evaluations) => setState({ kind: 'ready', evaluations }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message:
            error instanceof EvaluationStoreError
              ? error.message
              : 'No pudimos leer los informes guardados en este dispositivo.',
        }),
      )
  }, [user.id])

  useEffect(() => {
    load()
    return subscribe(load)
  }, [load])

  const reports = useMemo(
    () => (state.kind === 'ready' ? emittedReports(state.evaluations) : []),
    [state],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return reports
    return reports.filter((report) =>
      [report.subject, report.code, report.institution, report.professionalName]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [reports, query])

  const download = async (report: EmittedReport) => {
    setBusyId(report.evaluationId)
    setFailure(null)
    try {
      const evaluation = await getEvaluation(report.evaluationId)
      if (!evaluation) throw new Error('La evaluación ya no existe en este dispositivo.')

      const assets = await loadReportAssets()
      const blob = generatePsychopedagogicalReport(buildReport(evaluation), assets)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = reportFileName(evaluation)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setFailure(
        error instanceof Error ? `No se pudo descargar el informe: ${error.message}` : 'No se pudo descargar el informe.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <PageHeader
        above={
          <nav className="dt-breadcrumb mb-2" aria-label="Ruta de navegación">
            <Link href="/evaluaciones">
              <ArrowLeft className="inline size-3.5 align-[-2px]" aria-hidden="true" /> Evaluaciones
            </Link>
            <ChevronRight aria-hidden="true" />
            <span aria-current="page">Informes emitidos</span>
          </nav>
        }
        title="Informes emitidos"
        description="Documentos ya firmados y entregados. Puedes volver a descargarlos cuando los necesites."
        actions={
          <Link href="/evaluaciones" className="dt-btn dt-btn-secondary">
            <ArrowLeft aria-hidden="true" />
            Volver a evaluaciones
          </Link>
        }
      />

      <div className="dt-page">
        {failure ? (
          <p className="dt-note mb-4" data-tone="danger" role="alert">
            <AlertTriangle aria-hidden="true" />
            {failure}
          </p>
        ) : null}

        {state.kind === 'loading' ? (
          <LoadingSkeleton rows={3} height={72} label="Cargando informes emitidos" />
        ) : state.kind === 'error' ? (
          <div className="dt-card">
            <ErrorState description={state.message} onRetry={load} />
          </div>
        ) : reports.length === 0 ? (
          <div className="dt-card">
            <EmptyState
              icon={FileCheck2}
              title="Todavía no has emitido ningún informe"
              description="Cuando cierres una evaluación y generes su informe, quedará archivado aquí para volver a descargarlo."
              action={{ label: 'Ver evaluaciones', href: '/evaluaciones' }}
            />
          </div>
        ) : (
          <div className="dt-card">
            <div className="dt-list-toolbar">
              <p className="text-sm font-semibold" style={{ color: 'var(--dt-text-soft)' }}>
                {reports.length} {reports.length === 1 ? 'informe emitido' : 'informes emitidos'}
              </p>
              <label className="dt-search md:w-72">
                <Search aria-hidden="true" />
                <span className="dt-sr-only">Buscar informe</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Buscar por evaluado o código…"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="Ningún informe coincide"
                description={`No encontramos informes que coincidan con «${query}».`}
              />
            ) : (
              <div className="dt-table-wrap dt-scroll">
                <table className="dt-table">
                  <caption className="dt-sr-only">Informes psicopedagógicos emitidos</caption>
                  <thead>
                    <tr>
                      <th scope="col">Evaluado</th>
                      <th scope="col">Edad / Institución</th>
                      <th scope="col">Profesional responsable</th>
                      <th scope="col">Emitido</th>
                      <th scope="col">Estado</th>
                      <th scope="col">
                        <span className="dt-sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((report) => (
                      <tr key={report.evaluationId}>
                        <td>
                          <span className="dt-table-person">
                            <Avatar name={report.subject} size="sm" />
                            <span className="min-w-0">
                              <strong>{report.subject}</strong>
                              <small>{report.code}</small>
                            </span>
                          </span>
                        </td>
                        <td>
                          {report.ageLabel}
                          <br />
                          <span style={{ color: 'var(--dt-faint)' }}>
                            {orDash(report.institution, 'Institución no registrada')}
                          </span>
                        </td>
                        <td>
                          {orDash(report.professionalName, 'Sin firmar')}
                          <br />
                          <span style={{ color: 'var(--dt-faint)' }}>{orDash(report.professionalRole)}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatUpdatedAt(report.generatedAt)}</td>
                        <td>
                          {report.outdated ? (
                            <span className="dt-badge" data-tone="warning">
                              <AlertTriangle aria-hidden="true" />
                              Expediente modificado
                            </span>
                          ) : (
                            <span className="dt-badge" data-tone="success">
                              <FileCheck2 aria-hidden="true" />
                              Vigente
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="flex items-center justify-end gap-2">
                            <Link
                              href={`/evaluaciones/${report.evaluationId}/informe`}
                              className="dt-btn dt-btn-ghost dt-btn-sm"
                            >
                              Abrir
                            </Link>
                            <button
                              type="button"
                              className="dt-btn dt-btn-secondary dt-btn-sm"
                              disabled={busyId === report.evaluationId}
                              onClick={() => void download(report)}
                            >
                              {busyId === report.evaluationId ? (
                                <Loader2 className="dt-spin" aria-hidden="true" />
                              ) : (
                                <Download aria-hidden="true" />
                              )}
                              Descargar
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="dt-note" style={{ margin: '0 20px 20px' }}>
              <FileCheck2 aria-hidden="true" />
              El PDF se vuelve a componer desde el expediente en cada descarga, así que siempre coincide con lo
              registrado. Si el expediente cambió después de firmar, vuelve a emitirlo desde su etapa de informe.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
