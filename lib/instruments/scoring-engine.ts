import { getInstrument } from '@/instruments/catalog'
import type { InstrumentApplication } from '@/lib/evaluations/model'
import { classifyWithBaremos } from '@/lib/instruments/baremo'

export type DeterministicScoreResult = {
  instrumentId: string
  engineVersion: 'deterministic-v1'
  ruleVersion: string
  normVersion: string
  totalPd: number
  missingResponses: string[]
  classification: string | null
}

export function scoreInstrumentApplication(application: InstrumentApplication): DeterministicScoreResult {
  const instrument = getInstrument(application.instrumentId)
  if (!instrument) {
    return {
      instrumentId: application.instrumentId,
      engineVersion: 'deterministic-v1',
      ruleVersion: 'unknown',
      normVersion: 'unknown',
      totalPd: 0,
      missingResponses: [],
      classification: null,
    }
  }

  const missingResponses = instrument.subtests
    .filter((subtest) => !application.entries[subtest.id]?.pd.trim())
    .map((subtest) => subtest.id)
  const totalPd = Object.values(application.entries).reduce((total, entry) => {
    const value = Number(entry.pd)
    return Number.isFinite(value) ? total + value : total
  }, 0)
  const classification =
    missingResponses.length === 0 ? (classifyWithBaremos(instrument.baremos, totalPd)?.rango ?? null) : null

  return {
    instrumentId: instrument.id,
    engineVersion: 'deterministic-v1',
    ruleVersion: `${instrument.id}@${instrument.version}`,
    normVersion: instrument.hasNormativeTables ? `${instrument.id}@${instrument.version}` : 'norms-unavailable',
    totalPd,
    missingResponses,
    classification,
  }
}
