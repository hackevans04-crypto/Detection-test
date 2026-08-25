import Link from 'next/link'
import { AppSidebar } from '@/components/platform/app-sidebar'
import { instruments } from '@/instruments/catalog'

export function EvaluationFlow() {
  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active="Nueva evaluación" />
        <section className="min-w-0 p-4 md:p-6 xl:p-8">
          <header>
            <p className="font-display text-3xl font-bold">Nueva evaluacion</p>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">Seleccione un instrumento para iniciar el flujo profesional: modo, datos del evaluado, advertencia por edad, instrucciones, subtests, revision, resultado e informe PDF.</p>
          </header>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {instruments.map((instrument) => (
              <article key={instrument.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold">{instrument.nombre}</h2>
                <p className="mt-2 text-sm text-slate-600">{instrument.descripcion}</p>
                <div className="mt-4 grid gap-2 text-sm text-slate-700">
                  <p><strong>Autor:</strong> {instrument.autor}</p>
                  <p><strong>Aplicacion:</strong> {instrument.aplicacion}</p>
                  <p><strong>Rango:</strong> {instrument.rangoTexto}</p>
                </div>
                <Link href={`/instrumentos/${instrument.id}/evaluacion`} className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Iniciar evaluacion</Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
