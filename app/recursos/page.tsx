import { AppSidebar } from '@/components/platform/app-sidebar'
import { demoABC, demoProCalculo, instruments } from '@/instruments/catalog'

export default function RecursosPage() {
  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active="Recursos / Documentación" />
        <section className="p-4 md:p-6 xl:p-8">
          <h1 className="font-display text-3xl font-bold">Recursos / Documentacion</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Resumen academico de los instrumentos configurados desde el informe fuente, sin reactivos oficiales inventados.</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {instruments.map((instrument) => (
              <article key={instrument.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold">{instrument.nombre}</h2>
                <p className="mt-2 text-sm text-slate-600">{instrument.descripcion}</p>
                <p className="mt-3 text-sm"><strong>Normativa:</strong> {instrument.normativeStatus}</p>
              </article>
            ))}
          </div>
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">CASO DE DEMOSTRACION</h2>
            <p className="mt-2 text-sm text-slate-600">ABC: I={demoABC.I}, II={demoABC.II}, III={demoABC.III}, IV={demoABC.IV}, V={demoABC.V}, VI={demoABC.VI}, VII={demoABC.VII}, VIII={demoABC.VIII}. Total {demoABC.TOTAL}: RANGO II / NIVEL MEDIO.</p>
            <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
              {demoProCalculo.map(([name, pd, pt]) => <div key={name} className="rounded-lg bg-slate-50 p-3"><strong>{name}</strong><br />PD {pd} · PT {pt}</div>)}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}
