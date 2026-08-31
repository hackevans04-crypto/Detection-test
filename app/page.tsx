export default function Page() {
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
