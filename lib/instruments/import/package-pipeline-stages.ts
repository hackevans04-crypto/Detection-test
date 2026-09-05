import { packageStages, type PackageStage } from '@/lib/instruments/import/package-model'

export type PipelineLineState = 'done' | 'active' | 'pending'

export type PipelineLine = {
  label: string
  state: PipelineLineState
}

const lines: Array<{ label: string; threshold: PackageStage }> = [
  { label: 'Material recibido', threshold: 'UPLOAD' },
  { label: 'Instrumento identificado', threshold: 'ARCHIVE_EXTRACTION' },
  { label: 'Estructura digitalizada', threshold: 'DOCUMENT_ANALYSIS' },
  { label: 'Datos vinculados', threshold: 'CROSS_VALIDATION' },
  { label: 'Respuestas procesadas', threshold: 'SPREADSHEET_ANALYSIS' },
  { label: 'Baremos identificados', threshold: 'BLUEPRINT_GENERATION' },
  { label: 'Resultados calculados', threshold: 'REVIEW' },
  { label: 'Informe preparado', threshold: 'REVIEW' },
]

export function packagePipelineLines(reached: PackageStage | null): PipelineLine[] {
  const reachedIndex = reached ? packageStages.indexOf(reached) : -1
  let activeAssigned = false

  return lines.map(({ label, threshold }) => {
    const thresholdIndex = packageStages.indexOf(threshold)
    if (reachedIndex >= thresholdIndex) return { label, state: 'done' as const }
    if (!activeAssigned) {
      activeAssigned = true
      return { label, state: 'active' as const }
    }
    return { label, state: 'pending' as const }
  })
}
