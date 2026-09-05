import { describe, expect, it } from 'vitest'
import { createInstrumentBlueprint } from '@/lib/evaluations/model'
import { canApplyAutomatically, validateBlueprint } from '@/lib/instruments/blueprint-validation'

describe('blueprint validation', () => {
  it('blocks automatic application until the blueprint is validated', () => {
    const blueprint = createInstrumentBlueprint({
      sourceJobId: 'pkg-1',
      name: 'MACI',
      shortName: 'MACI',
      version: 'No determinada',
      sourceDocument: 'manual.pdf',
    })

    expect(canApplyAutomatically(blueprint)).toBe(false)

    const validated = validateBlueprint(blueprint, { id: 'prof-1' }, '2026-09-02T10:00:00.000Z')

    expect(canApplyAutomatically(validated)).toBe(true)
    expect(validated).toMatchObject({
      status: 'VALIDATED',
      approvedBy: 'prof-1',
      approvedAt: '2026-09-02T10:00:00.000Z',
    })
  })
})
