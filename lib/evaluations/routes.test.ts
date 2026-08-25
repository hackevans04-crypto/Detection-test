import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { stepIds } from '@/lib/evaluations/model'

/**
 * El stepper enlaza una ruta por etapa. Cuando el modelo creció con «Motivo y
 * remitente» nadie creó su página: la etapa existía, se enlazaba y devolvía un
 * 404 silencioso. Esta prueba ata las dos cosas.
 */

const workspace = path.join(process.cwd(), 'app', '(plataforma)', 'evaluaciones', '[evaluationId]')

describe('rutas del proceso', () => {
  it.each(stepIds)('la etapa «%s» tiene página', (step) => {
    expect(existsSync(path.join(workspace, step, 'page.tsx'))).toBe(true)
  })

  it('la vista previa del informe tiene página', () => {
    expect(existsSync(path.join(workspace, 'informe', 'preview', 'page.tsx'))).toBe(true)
  })

  it('la creación de una evaluación tiene página', () => {
    expect(
      existsSync(path.join(process.cwd(), 'app', '(plataforma)', 'evaluaciones', 'nueva', 'page.tsx')),
    ).toBe(true)
  })
})
