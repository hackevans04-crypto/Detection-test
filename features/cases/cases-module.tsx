'use client'

import { AppSidebar } from '@/components/platform/app-sidebar'
import { evaluationCases } from '@/data/evaluation-content'
import { Bell, CalendarClock, FileText, Filter, Mail, Plus, Search, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

const filters = ['Todos', 'Simulados', 'Institucionales', 'En evaluación', 'Completados', 'Archivados'] as const

type CaseFilter = (typeof filters)[number]

export function CasesModule() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<CaseFilter>('Todos')
  const [selectedId, setSelectedId] = useState(evaluationCases[0]?.id ?? '')
  const [tab, setTab] = useState('Resumen')

  const filteredCases = useMemo(() => {
    return evaluationCases.filter((item) => {
      const text = `${item.code} ${item.name} ${item.grade} ${item.reason}`.toLowerCase()
      const matchesQuery = text.includes(query.toLowerCase())
      const matchesFilter =
        filter === 'Todos' ||
        (filter === 'Simulados' && item.type === 'Simulado') ||
        (filter === 'Institucionales' && item.type === 'Institucional') ||
        (filter === 'En evaluación' && item.status === 'En evaluación') ||
        (filter === 'Completados' && item.status === 'Completado') ||
        (filter === 'Archivados' && item.status === 'Archivado')

      return matchesQuery && matchesFilter
    })
  }, [filter, query])

  const activeCase = filteredCases.find((item) => item.id === selectedId) ?? filteredCases[0] ?? evaluationCases[0]

  const tabs = ['Resumen', 'Datos personales', 'Antecedentes', 'Historia escolar', 'Salud', 'Evaluaciones', 'Informes', 'Archivos']

  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active="Casos / Estudiantes" />

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/90 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="font-display text-2xl font-bold md:text-3xl">Casos y expedientes</p>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">Administra los casos utilizados en las evaluaciones psicopedagogicas.</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm xl:w-[420px]">
                  <Search className="size-5 text-slate-500" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    placeholder="Buscar por nombre, código, edad, grado..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button className="grid size-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200"><Bell className="size-5" /></button>
                <button className="grid size-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200"><Mail className="size-5" /></button>
              </div>
            </div>
          </header>

          <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(320px,420px)_1fr] xl:p-8">
            <section className="space-y-5">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Casos</h2>
                    <p className="text-sm text-slate-500">Gestion de expedientes y evaluaciones.</p>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm shadow-blue-600/25">
                    <Plus className="size-4" />
                    Nuevo caso
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {filters.map((item) => (
                    <button
                      key={item}
                      onClick={() => setFilter(item)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        filter === item ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="space-y-3">
                  {filteredCases.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        activeCase?.id === item.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.code}</p>
                          <p className="mt-1 text-base font-bold text-slate-900">{item.name}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{item.status}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <span>Edad: {item.age}</span>
                        <span>Grado: {item.grade}</span>
                        <span>Tipo: {item.type}</span>
                        <span>Evaluaciones: {item.evaluations}</span>
                      </div>

                      <p className="mt-3 text-xs text-slate-500">Última modificación: {item.lastUpdated}</p>
                    </button>
                  ))}
                </div>
              </article>
            </section>

            {activeCase && (
              <section className="space-y-5">
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="grid size-16 place-items-center rounded-2xl bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-600/25">
                        {activeCase.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h1 className="font-display text-2xl font-bold">{activeCase.name}</h1>
                        <p className="mt-1 text-sm text-slate-600">{activeCase.code} · {activeCase.grade} · {activeCase.age} años</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{activeCase.type}</span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{activeCase.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">Ver expediente</button>
                      <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-blue-700">Nueva evaluación</button>
                    </div>
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                    {tabs.map((item) => (
                      <button
                        key={item}
                        onClick={() => setTab(item)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          tab === item ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <Users className="size-4 text-blue-600" />
                        Datos básicos
                      </div>
                      <ul className="mt-3 space-y-2 text-sm text-slate-600">
                        <li>Nombre: {activeCase.name}</li>
                        <li>Grado: {activeCase.grade}</li>
                        <li>Edad: {activeCase.age} años</li>
                        <li>Tipo: {activeCase.type}</li>
                      </ul>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <FileText className="size-4 text-blue-600" />
                        Motivo
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{activeCase.reason}</p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <CalendarClock className="size-4 text-blue-600" />
                        Histórico
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {activeCase.background.map((item) => (
                          <div key={item} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">{item}</div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-display text-lg font-bold">Línea de tiempo</h3>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">Caso simulado</span>
                    </div>
                    <div className="space-y-3">
                      {['Caso creado', 'Antecedentes registrados', 'Evaluación iniciada', 'Test aplicado', 'Informe generado'].map((step, index) => (
                        <div key={step} className="flex items-center gap-3">
                          <div className={`grid size-7 place-items-center rounded-full text-xs font-bold ${index === 0 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            {index + 1}
                          </div>
                          <p className="text-sm text-slate-700">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}


