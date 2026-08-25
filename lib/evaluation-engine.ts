/**
 * Baremos y clasificaciones documentadas.
 *
 * Son funciones puras y sin dependencias del modelo de datos a propósito: son
 * la parte del sistema que traduce puntuaciones a los rangos publicados por
 * cada instrumento, y no deben cambiar porque cambie la forma del expediente.
 */

/** Test ABC. Cuatro rangos sobre la puntuación total de los ocho subtests. */
export function classifyABC(total: number) {
  if (total >= 17) return { range: 'RANGO I', level: 'NIVEL SUPERIOR' }
  if (total >= 12) return { range: 'RANGO II', level: 'NIVEL MEDIO' }
  if (total >= 8) return { range: 'RANGO III', level: 'NIVEL INFERIOR' }
  return { range: 'RANGO IV', level: 'NIVEL MAS BAJO' }
}

/** PRO-CÁLCULO. Se aplica sobre la PT, nunca sobre la PD. */
export function classifyProCalculoPT(pt: number) {
  if (pt <= 39) return 'BAJO / PRESENTA DIFICULTADES'
  if (pt <= 60) return 'NORMAL'
  return 'ALTO'
}

/**
 * Edad decimal entre dos fechas ISO. La usan los rangos de aplicación de los
 * instrumentos, que se expresan en años y medios años.
 */
export function calculateAgeYears(birthDate: string, evaluationDate: string) {
  if (!birthDate || !evaluationDate) return 0
  const birth = new Date(`${birthDate}T00:00:00`)
  const evaluation = new Date(`${evaluationDate}T00:00:00`)
  const diff = evaluation.getTime() - birth.getTime()
  return Math.max(0, Math.round((diff / 31557600000) * 10) / 10)
}
