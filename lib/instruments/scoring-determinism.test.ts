import { describe, expect, it } from 'vitest'
import { makeApplication } from '@/lib/evaluations/test-factory'
import { scoreInstrumentApplication } from '@/lib/instruments/scoring-engine'

describe('scoring determinism', () => {
  it('returns the same result for the same answers without LLM calls', () => {
    const application = makeApplication('test-abc', {
      'abc-1': { pd: '3' },
      'abc-2': { pd: '3' },
      'abc-3': { pd: '3' },
      'abc-4': { pd: '3' },
      'abc-5': { pd: '3' },
      'abc-6': { pd: '2' },
      'abc-7': { pd: '2' },
      'abc-8': { pd: '1' },
    })

    expect(scoreInstrumentApplication(application)).toEqual(scoreInstrumentApplication(application))
  })
})
