/**
 * Color de identidad de una persona evaluada.
 *
 * En las listas del inicio, el avatar y la barra de progreso de una misma
 * persona comparten color. No codifica estado —para eso están la insignia y
 * el porcentaje— sino identidad: ayuda a seguir a la misma persona entre la
 * tarjeta «Continuar trabajando» y la lista de la derecha sin releer el nombre.
 *
 * Es determinista: el mismo nombre da siempre el mismo color, en cualquier
 * dispositivo y entre recargas.
 */

export type IdentityColor = {
  solid: string
  soft: string
  ink: string
}

const palette: IdentityColor[] = [
  { solid: '#2563eb', soft: '#e3ecff', ink: '#1d4ed8' },
  { solid: '#0f9d63', soft: '#e0f5ec', ink: '#0b7a4c' },
  { solid: '#7c3aed', soft: '#ede6ff', ink: '#6528d7' },
  { solid: '#ea7317', soft: '#fceede', ink: '#c25c0b' },
  { solid: '#0891b2', soft: '#ddf2f8', ink: '#06748e' },
  { solid: '#4f46e5', soft: '#e7e5ff', ink: '#3f37c9' },
]

export function identityColor(seed: string): IdentityColor {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return palette[hash % palette.length]
}
