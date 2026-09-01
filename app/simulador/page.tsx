import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Simulador INEVAL | Detection-test',
  description:
    'Material independiente de preparacion para la evaluacion docente. No es una prueba oficial ni reproduce items reservados del INEVAL.',
}

/**
 * El simulador es un HTML autocontenido que vive en `public/`, no un arbol de
 * componentes. Se sirve dentro de un iframe para que su CSS y sus scripts no se
 * mezclen con los de la plataforma; `allow="camera"` habilita el modo
 * supervisado, que la cabecera Permissions-Policy concede a este mismo origen.
 */
export default function SimuladorPage() {
  return (
    <main className="h-screen w-screen overflow-hidden bg-white">
      <iframe
        src="/simulador-principal.html"
        title="Simulador Referencial INEVAL 2026 - Evaluacion Docente - Nivel Dificil"
        className="h-full w-full border-0"
        allow="camera; microphone"
      />
    </main>
  )
}
