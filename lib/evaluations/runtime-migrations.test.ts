import { describe, expect, it } from 'vitest'
import { normalizeEvaluationRuntimeState } from '@/lib/evaluations/runtime-migrations'
import { createEvaluationInstrument } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import type { InstrumentPackage } from '@/lib/instruments/import/package-model'

function legacyArchivePackage(): InstrumentPackage {
  const evaluation = makeEvaluation()
  return {
    id: 'legacy-package',
    evaluationId: evaluation.id,
    name: 'MACI',
    instrumentIdentity: {
      normalizedName: 'maci',
      acronym: 'MACI',
      authors: [],
      version: null,
      itemCount: null,
      scales: [],
      checksums: ['archive-checksum'],
    },
    originalArchive: {
      fileId: 'archive-file',
      name: 'MACI.rar',
      size: 1000,
      checksum: 'archive-checksum',
    },
    fingerprint: {
      normalizedName: 'maci',
      acronym: 'MACI',
      authors: [],
      version: null,
      itemCount: null,
      scales: [],
      checksums: ['archive-checksum'],
    },
    files: [
      {
        id: 'archive-as-document',
        path: 'MACI.rar',
        name: 'MACI.rar',
        extension: '.rar',
        declaredMime: 'application/vnd.rar',
        detectedMime: null,
        size: 1000,
        checksum: 'archive-checksum',
        role: 'SUPPORT_DOCUMENT',
        confidence: 0.2,
        evidence: ['Paquete comprimido conservado sin abrir.'],
        status: 'ACCEPTED',
        reason: '',
        extractedFrom: null,
      },
    ],
    findings: [],
    computedResults: [],
    responseCandidates: [],
    extractedResponses: [],
    consistency: [],
    blocks: [],
    stage: 'REVIEW',
    readiness: 'SUPPORT_MATERIAL_ONLY',
    errorMessage: '',
    blueprintId: null,
    blueprintVersion: null,
    createdBy: 'prof-1',
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
  }
}

describe('runtime evaluation migrations', () => {
  it('removes old visual packages where the archive was accepted as support material', () => {
    const evaluation = makeEvaluation()
    const pkg = legacyArchivePackage()
    const entry = createEvaluationInstrument({
      instrumentId: pkg.id,
      name: 'MACI',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof-1',
      professionalName: 'Profesional',
    })

    const normalized = normalizeEvaluationRuntimeState({
      ...evaluation,
      battery: [entry],
      instrumentPackages: [pkg],
      backups: [
        {
          id: 'backup-1',
          evaluationId: evaluation.id,
          evaluationInstrumentId: entry.id,
          documentType: 'OTHER',
          name: 'MACI.rar',
          mime: 'application/vnd.rar',
          size: 1000,
          pages: null,
          checksum: 'archive-checksum',
          uploadedBy: 'prof-1',
          uploadedAt: '2026-09-04T00:00:00.000Z',
        },
      ],
    })

    expect(normalized.instrumentPackages).toHaveLength(0)
    expect(normalized.battery).toHaveLength(0)
    expect(normalized.backups).toHaveLength(0)
  })

  it('keeps real extracted archive contents', () => {
    const evaluation = makeEvaluation()
    const pkg = legacyArchivePackage()
    pkg.files = [
      {
        ...pkg.files[0],
        id: 'internal-file',
        path: 'MACI.rar/HOJA DE RESPUESTAS MACI.pdf',
        name: 'HOJA DE RESPUESTAS MACI.pdf',
        extension: '.pdf',
        role: 'ANSWER_SHEET',
        confidence: 0.95,
        evidence: ['Nombre del archivo: hoja de respuestas.'],
        extractedFrom: 'archive-file',
      },
    ]

    const normalized = normalizeEvaluationRuntimeState({ ...evaluation, instrumentPackages: [pkg] })

    expect(normalized.instrumentPackages).toHaveLength(1)
    expect(normalized.instrumentPackages[0].files[0].role).toBe('ANSWER_SHEET')
  })
})
