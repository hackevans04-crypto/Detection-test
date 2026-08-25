import { AppSidebar } from '@/components/platform/app-sidebar'
import { instruments } from '@/instruments/catalog'
import Link from 'next/link'

export default function AdminInstrumentosPage() {
  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active="Administración" />
        <section className="p-4 md:p-6 xl:p-8">
          <h1 className="font-display text-3xl font-bold">Administrador de instrumentos</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Panel operativo para crear, editar, versionar y preparar actividades. En esta version local, las acciones muestran la estructura editable que debe persistirse en base de datos.</p>
          <div className="mt-6 grid gap-4">
            {instruments.map((instrument) => (
              <article key={instrument.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{instrument.nombre} v{instrument.version}</h2>
                    <p className="mt-1 text-sm text-slate-600">{instrument.subtests.length} subtests · {instrument.baremos.length} reglas de baremo · {instrument.normativeStatus}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['Crear actividad', 'Editar baremo', 'Cargar recursos', 'Versionar', 'Previsualizar'].map((action) => (
                      <Link key={action} href={`/admin/instrumentos?instrumento=${instrument.id}&accion=${encodeURIComponent(action)}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                        {action}
                      </Link>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
