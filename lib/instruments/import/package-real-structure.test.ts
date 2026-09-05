import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runImportPipeline, type IncomingFile } from '@/lib/instruments/import/import-pipeline'

const downloads = path.join(process.env.USERPROFILE ?? process.cwd(), 'Downloads')

async function findArchive(term: string) {
  const entries = await readdir(downloads)
  const normalizedTerm = term.toLowerCase()
  const found = entries.find((entry) => entry.toLowerCase().includes(normalizedTerm) && /\.rar$/i.test(entry))
  if (!found) throw new Error(`No se encontró un RAR real para ${term} en ${downloads}.`)
  return path.join(downloads, found)
}

async function incomingArchive(term: string): Promise<IncomingFile> {
  const archivePath = await findArchive(term)
  return {
    path: path.basename(archivePath),
    declaredMime: 'application/vnd.rar',
    bytes: new Uint8Array(await readFile(archivePath)),
  }
}

describe('real instrument package structure', () => {
  it(
    'processes real MACI, STAI and ENFEN archives without simplified fixtures',
    async () => {
      const reports = []

      for (const term of ['MACI', 'STAI', 'ENFEN']) {
        const { pkg, blueprint, notices } = await runImportPipeline({
          evaluationId: `real-${term.toLowerCase()}`,
          createdBy: 'codex-real-validation',
          files: [await incomingArchive(term)],
        })

        const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')
        reports.push({
          instrument: term,
          detectedName: pkg.name,
          status: pkg.readiness,
          originalArchive: pkg.originalArchive,
          blueprint: blueprint
            ? {
                id: blueprint.id,
                name: blueprint.name,
                status: blueprint.status,
                requiredFields: blueprint.requiredFields,
                measures: blueprint.measures.map((measure) => measure.label),
                automationLevel: blueprint.automationLevel,
                sourceDocuments: blueprint.sourceDocuments,
                warnings: blueprint.reviewNotes,
              }
            : null,
          materials: accepted.map((file) => ({
            role: file.role,
            name: file.name,
            size: file.size,
            confidence: file.confidence,
            source: file.extractedFrom ? 'archive' : 'upload',
          })),
          ignoredOrRejected: pkg.files
            .filter((file) => file.status !== 'ACCEPTED')
            .map((file) => ({ name: file.name, status: file.status, reason: file.reason })),
          sections: pkg.blocks.map((block) => ({ id: block.id, state: block.state, notes: block.notes })),
          consistency: pkg.consistency,
          warnings: notices,
        })

        expect(pkg.originalArchive?.name.toLowerCase()).toContain(term.toLowerCase())
        expect(pkg.name).toBe(term)
        expect(accepted.length).toBeGreaterThan(0)
        expect(accepted.every((file) => file.extractedFrom !== null)).toBe(true)
        expect(accepted.some((file) => /\.(rar|zip)$/i.test(file.name) && file.role === 'SUPPORT_DOCUMENT')).toBe(false)
        expect(pkg.files.every((file) => file.status !== 'ACCEPTED' || file.confidence >= 0)).toBe(true)
        expect(blueprint).not.toBeNull()

        if (term === 'ENFEN') expect(accepted).toHaveLength(5)
        if (term === 'STAI') expect(accepted).toHaveLength(10)
        if (term === 'MACI') {
          expect(accepted.map((file) => file.name)).toEqual(
            expect.arrayContaining(['CUADERNILLO MACI.pdf', 'HOJA DE RESPUESTAS MACI.pdf', 'MACI.xls']),
          )
          expect(notices.some((notice) => /MANUAL MACI\.pdf: El archivo supera el tama/i.test(notice))).toBe(true)
        }
      }

      await mkdir(path.join(process.cwd(), 'artifacts'), { recursive: true })
      await writeFile(
        path.join(process.cwd(), 'artifacts', 'real-instrument-validation.json'),
        `${JSON.stringify(reports, null, 2)}\n`,
        'utf8',
      )
    },
    120_000,
  )
})
