export const HUD_ROOT = '/detection-home/platform/hud'

export const CONCEPT_GLYPHS: Record<string, string> = {
  evaluation: `${HUD_ROOT}/glyph-evaluacion.png`,
  organization: `${HUD_ROOT}/glyph-organizacion.png`,
  analysis: `${HUD_ROOT}/glyph-analisis.png`,
  inclusion: `${HUD_ROOT}/glyph-inclusion.png`,
}

const probes = new Map<string, Promise<boolean>>()

export function assetExists(url: string) {
  const cached = probes.get(url)
  if (cached) return cached
  const probe = fetch(url, { method: 'HEAD' })
    .then((response) => response.ok)
    .catch(() => false)
  probes.set(url, probe)
  return probe
}
