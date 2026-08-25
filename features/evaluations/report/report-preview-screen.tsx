'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AlertCircle, ArrowLeft, Download, FileText, Loader2, Minus, Plus, Printer, X } from 'lucide-react'
import { ReportPreview } from '@/features/evaluations/report/report-preview'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { buildReport, reportFileName } from '@/lib/evaluations/report'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'
import { loadReportAssets } from '@/lib/evaluations/report-assets'

const ZOOM_STEPS = [0.75, 0.9, 1, 1.15, 1.3, 1.5]

/**
 * Visor del informe.
 *
 * Lo que se ve aquí sale del mismo `ReportDocument` que consume el generador
 * de PDF: no hay documento de muestra ni plantilla paralela que se desincronice.
 * Las miniaturas son los apartados reales del informe y sirven para saltar a
 * ellos, que es lo que se hace al revisar un documento largo.
 */
export function ReportPreviewScreen() {
  const { evaluation, update, saveNow } = useEvaluation()
  const [zoomIndex, setZoomIndex] = useState(2)
  const [activeSection, setActiveSection] = useState(1)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const report = buildReport(evaluation)
  const fileName = reportFileName(evaluation)
  const zoom = ZOOM_STEPS[zoomIndex]

  const goToSection = (number: number) => {
    setActiveSection(number)
    window.document.getElementById(`informe-seccion-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const generate = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const assets = await loadReportAssets()
      const blob = generatePsychopedagogicalReport(report, assets)
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

      <div className="dt-viewer">
        <div className="dt-viewer-bar">
          <span className="dt-viewer-name">
            <FileText aria-hidden="true" />
            <span>{fileName}</span>
          </span>

          <div className="dt-viewer-tools">
            <button
              type="button"
              className="dt-icon-button"
              onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
              disabled={zoomIndex === 0}
              aria-label="Reducir el zoom"
            >
              <Minus aria-hidden="true" />
            </button>
            <span className="dt-viewer-zoom" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="dt-icon-button"
              onClick={() => setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label="Aumentar el zoom"
            >
              <Plus aria-hidden="true" />
            </button>

            <span className="dt-topbar-divider" aria-hidden="true" />

            <button type="button" className="dt-icon-button" onClick={() => window.print()} aria-label="Imprimir el informe">
              <Printer aria-hidden="true" />
            </button>
            <button
              type="button"
              className="dt-icon-button"
              onClick={() => void generate()}
              disabled={busy}
              aria-label="Descargar el informe en PDF"
            >
              {busy ? <Loader2 className="dt-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            </button>
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
          <nav className="dt-viewer-thumbs" aria-label="Apartados del informe">
            {report.sections.map((section) => (
              <button
                key={section.number}
                type="button"
                className="dt-viewer-thumb"
                aria-current={section.number === activeSection ? 'true' : undefined}
                onClick={() => goToSection(section.number)}
              >
                <span className="dt-viewer-thumb-sheet" aria-hidden="true">
                  <i className="dt-viewer-thumb-line" data-strong="true" style={{ width: '70%' }} />
                  <i className="dt-viewer-thumb-line" style={{ width: '100%' }} />
                  <i className="dt-viewer-thumb-line" style={{ width: '92%' }} />
                  <i className="dt-viewer-thumb-line" style={{ width: '96%' }} />
                  <i className="dt-viewer-thumb-line" style={{ width: '60%' }} />
                  <i className="dt-viewer-thumb-line" style={{ width: '88%' }} />
                </span>
                <span className="dt-viewer-thumb-label">
                  {section.number}. {section.title}
                </span>
              </button>
            ))}
          </nav>

          <div className="dt-viewer-doc dt-scroll">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}>
              <ReportPreview document={report} />
            </div>
          </div>
        </div>
      </div>

      <div className="dt-step-footer">
        <Link href={`/evaluaciones/${evaluation.id}/informe`} className="dt-btn dt-btn-secondary">
          <ArrowLeft aria-hidden="true" />
          Volver al informe
        </Link>
        <div className="dt-step-footer-actions">
          <button type="button" className="dt-btn dt-btn-primary" onClick={() => void generate()} disabled={busy}>
            {busy ? <Loader2 className="dt-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Generar informe PDF
          </button>
        </div>
      </div>
    </section>
  )
}
