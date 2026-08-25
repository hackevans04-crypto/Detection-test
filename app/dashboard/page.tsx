import { AppSidebar } from '@/components/platform/app-sidebar'
import {
  assessedAreas,
  activeWork,
  instrumentQueue,
  processFlow,
  quickActions,
  recentEvaluations,
  reportSections,
  stats,
} from '@/data/platform-dashboard'
import { currentSession, requirePermission } from '@/lib/auth/session'
import type { Metadata } from 'next'
import { Bell, Mail, Search } from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Dashboard | Detection-test',
  description: 'Panel principal del sistema de evaluación psicopedagógica Detection-test.',
}

function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 88 36" className="h-9 w-20" aria-hidden="true">
      <polyline
        points="2,30 14,22 24,26 35,10 47,20 59,8 69,14 84,2"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DonutChart() {
  return (
    <div className="relative grid size-44 place-items-center rounded-full bg-[conic-gradient(#22c55e_0_58%,#2563eb_58%_83%,#f97316_83%_100%)]">
      <div className="grid size-28 place-items-center rounded-full bg-white text-center">
        <strong className="block text-3xl text-slate-950">24</strong>
        <span className="text-xs text-slate-500">Total</span>
      </div>
    </div>
  )
}

function colorClasses(color: string) {
  const map: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    orange: 'bg-orange-50 text-orange-600 ring-orange-100',
    cyan: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    red: 'bg-red-50 text-red-600 ring-red-100',
  }
  return map[color] ?? map.blue
}

export default function DashboardPage() {
  requirePermission('dashboard.read')

  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active="Inicio" />

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-slate-50/90 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="font-display text-2xl font-bold md:text-3xl">Buenos días, {currentSession.user.name}</p>
                <p className="mt-1 text-sm text-slate-600">Gestiona evaluaciones psicopedagogicas con seguimiento Scrum, resultados e informes PDF.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex h-11 min-w-[280px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm xl:w-[470px]">
                  <Search className="size-5 text-slate-500" />
                  <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar casos, instrumentos, informes..." />
                  <kbd className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">Ctrl + K</kbd>
                </label>
                <button className="relative grid size-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200"><Bell className="size-5" /><span className="absolute right-2 top-2 size-2 rounded-full bg-red-500" /></button>
                <button className="relative grid size-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200"><Mail className="size-5" /></button>
              </div>
            </div>
          </header>

          <div className="grid gap-4 p-4 md:p-6 xl:p-8">
            <section className="min-w-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat) => (
                  <article key={stat.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`grid size-14 place-items-center rounded-full ring-8 ${colorClasses(stat.color)}`}>
                        <stat.icon className="size-7" />
                      </div>
                      <Sparkline color={stat.color === 'green' ? '#22c55e' : stat.color === 'orange' ? '#f97316' : stat.color === 'violet' ? '#7c3aed' : '#2563eb'} />
                    </div>
                    <p className="mt-3 text-sm text-slate-600">{stat.title}</p>
                    <div className="mt-1 flex items-end justify-between">
                      <strong className="text-3xl">{stat.value}</strong>
                      <span className="text-xs font-semibold text-slate-500">{stat.delta}</span>
                    </div>
                  </article>
                ))}
              </div>

              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Continuar evaluación</h2>
                    <p className="text-sm text-slate-500">Caso · Instrumento · Progreso · Última actividad</p>
                  </div>
                  <Link href="/nueva-evaluacion" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-blue-600/25">
                    Continuar
                  </Link>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.20em] text-blue-700">CASO</p>
                      <h3 className="mt-2 text-xl font-bold text-slate-950">José Medrano · Caso-00012</h3>
                      <p className="mt-2 text-sm text-slate-600">Test ABC · 5 de 8 subtests completados · Última actividad: hace 2 horas</p>
                    </div>
                    <div className="rounded-xl bg-white px-4 py-3 text-right shadow-sm ring-1 ring-blue-100">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Progreso</p>
                      <p className="mt-1 text-2xl font-bold text-blue-700">63%</p>
                    </div>
                  </div>
                </div>
              </article>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_1.2fr]">
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Actividades asignadas</h2>
                    <Link href="/docencia/actividades" className="text-xs font-bold text-blue-600">Ver todas</Link>
                  </div>
                  <div className="space-y-3">
                    {[
                      ['Caso simulado – Test ABC', 'Prof. Carla Vega', '25 ago', 'En curso'],
                      ['Análisis de antecedentes', 'Dr. Julio Paredes', '27 ago', 'Pendiente'],
                      ['Informe académico', 'Mtra. Ana Torres', '29 ago', 'Revisión'],
                    ].map(([activity, teacher, date, status]) => (
                      <div key={activity} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{activity}</p>
                            <p className="mt-1 text-xs text-slate-500">{teacher}</p>
                          </div>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">{status}</span>
                        </div>
                        <p className="mt-3 text-xs text-slate-500">Fecha límite: {date}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Instrumentos disponibles</h2>
                    <Link href="/instrumentos" className="text-xs font-bold text-blue-600">Ver biblioteca</Link>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {instrumentQueue.map(([name, description, meta, Icon]) => (
                      <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="grid size-10 place-items-center rounded-full bg-blue-50 text-blue-700"><Icon className="size-5" /></div>
                          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">Disponible</span>
                        </div>
                        <h3 className="mt-3 text-sm font-bold text-slate-900">{name}</h3>
                        <p className="mt-1 text-xs text-slate-600">{description}</p>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{meta}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_1.3fr]">
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Ruta del proceso</h2>
                    <span className="text-xs text-slate-500">Flujo actual</span>
                  </div>
                  <div className="space-y-3">
                    {processFlow.map(([step, Icon], index) => (
                      <div key={step} className="flex items-center gap-3">
                        <div className={`grid size-8 place-items-center rounded-full ${index === 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          <Icon className="size-4" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-700">{step}</p>
                        </div>
                        {index < processFlow.length - 1 && <div className="h-px flex-1 bg-slate-200" />}
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Progreso académico</h2>
                    <Link href="/mi-progreso" className="text-xs font-bold text-blue-600">Ver detalle</Link>
                  </div>
                  <div className="space-y-4">
                    {assessedAreas.map(([name, value, bar]) => (
                      <div key={name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-slate-600">{name}</span>
                          <span className="font-bold text-slate-900">{value}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100">
                          <div className={`h-2.5 rounded-full ${bar}`} style={{ width: value }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Estructura documental del informe psicopedagógico</h2>
                    <p className="mt-1 text-sm text-slate-500">Cada expediente debe alimentar estas secciones antes de generar el documento final.</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Documento profesional</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {reportSections.map(([title, detail], index) => (
                    <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span>
                        <h3 className="font-display text-sm font-bold">{title}</h3>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-600">{detail}</p>
                    </div>
                  ))}
                </div>
              </article>

              <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Últimas evaluaciones</h2>
                    <Link href="/mis-evaluaciones" className="text-xs font-bold text-blue-600">Ver todas →</Link>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {recentEvaluations.map(([name, detail, time, status], index) => (
                      <div key={name} className="flex items-center gap-3 py-3">
                        <div className="grid size-10 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{index % 2 ? 'VR' : 'JM'}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{name}</p>
                          <p className="truncate text-xs text-slate-500">{detail}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">{time}</p>
                          <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">{status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold">Acciones rápidas</h2>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {quickActions.map(([label, Icon, color]) => (
                      <Link key={label} href={label === 'Nueva evaluación' ? '/nueva-evaluacion' : label === 'Crear caso' ? '/casos' : label === 'Ver instrumentos' ? '/instrumentos' : '/dashboard'} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50">
                        <div className={`grid size-10 place-items-center rounded-lg ${color === 'blue' ? 'bg-blue-100 text-blue-700' : color === 'green' ? 'bg-emerald-100 text-emerald-700' : color === 'violet' ? 'bg-violet-100 text-violet-700' : color === 'orange' ? 'bg-orange-100 text-orange-700' : color === 'cyan' ? 'bg-cyan-100 text-cyan-700' : color === 'rose' ? 'bg-rose-100 text-rose-700' : color === 'red' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                          <Icon className="size-5" />
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-800">{label}</p>
                      </Link>
                    ))}
                  </div>
                </article>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

