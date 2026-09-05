export function normalizeConfidence(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (value <= 1) return value
  if (value <= 100) return value / 100
  return 1
}

export function formatConfidence(value: number | null | undefined) {
  const normalized = normalizeConfidence(value)
  return normalized === null ? 'No registrada' : `${Math.round(normalized * 100)}%`
}
