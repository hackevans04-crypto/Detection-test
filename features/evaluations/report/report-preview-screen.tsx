'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, Download, FileText, Loader2, RefreshCcw, X } from 'lucide-react'
import { ReportPreview } from '@/features/evaluations/report/report-preview'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { buildReport, reportFileName } from '@/lib/evaluations/report'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'
import { loadReportAssets } from '@/lib/evaluations/report-assets'

/**
 * Visor del informe.
 *
 * La vista previa ya no recrea el informe en HTML. Genera el mismo Blob PDF que
 * descarga el usuario y lo muestra en un visor embebido, para que membrete,
 * paginación, gráficos y saltos de página sean exactamente los mismos.
 */
export function ReportPreviewScreen() {
  const { evaluation, update, saveNow } = useEvaluation()
  const [busy, setBusy] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const report = useMemo(() => buildReport(evaluation), [evaluation])
  const fileName = useMemo(() => reportFileName(evaluation), [evaluation])
  const hasReportInstruments = report.summary.some(
    (item) => item.label === 'Instrumentos aplicados' && !/No se registraron instrumentos|No se aplicaron instrumentos/i.test(item.value),
  )

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function createPreview() {
      setLoadingPreview(true)
      setFailure(null)
      try {
        const assets = await loadReportAssets()
        const blob = generatePsychopedagogicalReport(report, assets)
        objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setPdfBlob(blob)
        setPdfUrl(objectUrl)
      } catch (error) {
        if (!cancelled) {
          setFailure(error instanceof Error ? `No se pudo preparar la vista previa: ${error.message}` : 'No se pudo preparar la vista previa.')
          setPdfBlob(null)
          setPdfUrl(null)
        }
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }

    void createPreview()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [report])

  const generate = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const blob = pdfBlob ?? generatePsychopedagogicalReport(report, await loadReportAssets())
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
      setFailure(error instanceof Error ? `No se pudo generar el PDF: ${error.message}` : 'No se pudo generar el PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dt-card dt-card-pad">
      <div className="dt-card-head">
        <div>
          <h2>Vista previa del informe</h2>
          <p>Revisa el documento completo antes de generar el PDF.</p>
        </div>
        <Link href={`/evaluaciones/${evaluation.id}/informe`} className="dt-section-link">
          <ArrowLeft aria-hidden="true" />
          Volver al informe
        </Link>
      </div>

      {failure ? (
        <p className="dt-note mb-4" data-tone="danger" role="alert">
          <AlertCircle aria-hidden="true" />
          {failure}
        </p>
      ) : null}

      <div className="dt-viewer" data-viewer="report" data-report-has-instruments={hasReportInstruments}>
        <div className="dt-viewer-bar">
          <span className="dt-viewer-name">
            <FileText aria-hidden="true" />
            <span>{fileName}</span>
          </span>

          <div className="dt-viewer-tools">
            <button
              type="button"
              className="dt-icon-button"
              onClick={() => window.location.reload()}
              aria-label="Actualizar vista previa"
            >
              <RefreshCcw aria-hidden="true" />
            </button>
            <button
              type="button"
              className="dt-icon-button"
              onClick={() => void generate()}
              disabled={busy || loadingPreview}
              aria-label="Descargar el informe en PDF"
            >
              {busy ? <Loader2 className="dt-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            </button>

            <span className="dt-topbar-divider" aria-hidden="true" />

            <Link
              href={`/evaluaciones/${evaluation.id}/informe`}
              className="dt-icon-button"
              aria-label="Cerrar la vista previa"
            >
              <X aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="dt-viewer-body">
          <div className="dt-viewer-doc dt-report-doc">
            {loadingPreview ? (
              <div className="dt-pdf-loading" role="status">
                <Loader2 className="dt-spin" aria-hidden="true" />
                Preparando PDF...
              </div>
            ) : pdfUrl ? (
              <ReportPreview document={report} />
            ) : (
              <p className="dt-note" data-tone="danger" role="alert">
                <AlertCircle aria-hidden="true" />
                No se pudo mostrar el PDF.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="dt-step-footer">
        <Link href={`/evaluaciones/${evaluation.id}/informe`} className="dt-btn dt-btn-secondary">
          <ArrowLeft aria-hidden="true" />
          Volver al informe
        </Link>
        <div className="dt-step-footer-actions">
          <button type="button" className="dt-btn dt-btn-primary" onClick={() => void generate()} disabled={busy || loadingPreview}>
            {busy ? <Loader2 className="dt-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Generar informe PDF
          </button>
        </div>
      </div>
    </section>
  )
}
