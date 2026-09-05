import type { SessionUser } from '@/lib/auth/session'
import type { BaremoBand, InstrumentBaremo, InstrumentBlueprint } from '@/lib/evaluations/model'

export function canApplyAutomatically(blueprint: InstrumentBlueprint | null | undefined) {
  return Boolean(blueprint && blueprint.status === 'VALIDATED')
}

export function validateBlueprint(
  blueprint: InstrumentBlueprint,
  user: Pick<SessionUser, 'id'>,
  now = new Date().toISOString(),
): InstrumentBlueprint {
  return {
    ...blueprint,
    status: 'VALIDATED',
    approvedBy: user.id,
    approvedAt: now,
    updatedAt: now,
  }
}

/**
 * Baremos de un blueprint.
 *
 * Un baremo nace sin confirmar: alguien lo transcribió del material, pero
 * hasta que un profesional lo confirme (`confirmBaremo`) el motor de cálculo
 * (`instrument-scoring-engine.ts`) lo ignora igual que si no existiera. Es la
 * misma regla que gobierna el blueprint entero, aplicada tramo por tramo.
 */
export function emptyBaremoBand(): BaremoBand {
  return { id: crypto.randomUUID(), min: null, max: null, scaledValue: null, percentile: null, classification: '' }
}

export function createBaremo(input: { sourceMeasureId: string; scope?: string }): InstrumentBaremo {
  return {
    id: crypto.randomUUID(),
    sourceMeasureId: input.sourceMeasureId,
    scope: input.scope ?? '',
    bands: [],
    confirmedBy: null,
    confirmedAt: null,
  }
}

export function upsertBaremo(blueprint: InstrumentBlueprint, baremo: InstrumentBaremo): InstrumentBlueprint {
  const exists = blueprint.baremos.some((item) => item.id === baremo.id)
  return {
    ...blueprint,
    baremos: exists
      ? blueprint.baremos.map((item) => (item.id === baremo.id ? baremo : item))
      : [...blueprint.baremos, baremo],
    updatedAt: new Date().toISOString(),
  }
}

export function removeBaremo(blueprint: InstrumentBlueprint, baremoId: string): InstrumentBlueprint {
  return {
    ...blueprint,
    baremos: blueprint.baremos.filter((item) => item.id !== baremoId),
    updatedAt: new Date().toISOString(),
  }
}

/** Confirmar es lo que activa el baremo para el motor de cálculo: deja de ser un borrador. */
export function confirmBaremo(
  blueprint: InstrumentBlueprint,
  baremoId: string,
  user: Pick<SessionUser, 'id'>,
  now = new Date().toISOString(),
): InstrumentBlueprint {
  return {
    ...blueprint,
    baremos: blueprint.baremos.map((item) =>
      item.id === baremoId ? { ...item, confirmedBy: user.id, confirmedAt: now } : item,
    ),
    updatedAt: now,
  }
}

/** Reabrir un baremo confirmado, por ejemplo tras corregir un tramo. */
export function reopenBaremo(blueprint: InstrumentBlueprint, baremoId: string): InstrumentBlueprint {
  return {
    ...blueprint,
    baremos: blueprint.baremos.map((item) =>
      item.id === baremoId ? { ...item, confirmedBy: null, confirmedAt: null } : item,
    ),
    updatedAt: new Date().toISOString(),
  }
}
