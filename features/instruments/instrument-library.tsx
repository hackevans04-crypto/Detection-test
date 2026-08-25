'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, X } from 'lucide-react'
import { instruments } from '@/instruments/catalog'
import type { Instrument } from '@/types/psychopedagogy'

function InstrumentCard({ instrument }: { instrument: Instrument }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{instrument.areas[0]}</p>
          <h2 className="mt-2 text-xl font-bold text-slate-900">{instrument.nombre}</h2>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">CONFIGURADO</span>
      </div>
      <div className="mt-5 space-y-2 text-sm text-slate-600">
        <p><span className="font-semibold text-slate-700">Autor:</span> {instrument.autor}</p>
        <p><span className="font-semibold text-slate-700">Edad:</span> {instrument.rangoTexto}</p>
        <p><span className="font-semibold text-slate-700">Aplicacion:</span> {instrument.aplicacion}</p>
        <p><span className="font-semibold text-slate-700">Subtests:</span> {instrument.subtests.length}</p>
        <p><span className="font-semibold text-slate-700">Duracion:</span> {instrument.tiempo}</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{instrument.descripcion}</p>
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{instrument.normativeStatus}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-6">
        <Link href={`/instrumentos/${instrument.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Ver instrumento</Link>
        <Link href={`/instrumentos/${instrument.id}/evaluacion`} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white">Iniciar evaluacion</Link>
      </div>
    </article>
  )
}

export function InstrumentsLibrary() {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim()
    return instruments.filter((instrument) => !normalized || `${instrument.nombre} ${instrument.autor} ${instrument.areas.join(' ')}`.toLowerCase().includes(normalized))
  }, [query])

  return (
    <section className="min-w-0">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/90 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="font-display text-2xl font-bold md:text-3xl">Biblioteca de instrumentos</p>
            <p className="mt-1 text-sm text-slate-600">Instrumentos con aplicacion, correccion, baremacion, historial e informe PDF.</p>
          </div>
          <label className="flex h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm xl:w-[420px]">
            <Search className="size-5 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar instrumento, area, autor..." />
            {query && <button type="button" onClick={() => setQuery('')} className="grid place-items-center rounded-full p-1 text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>}
          </label>
        </div>
      </header>
      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6 xl:p-8">
        {filtered.map((instrument) => <InstrumentCard key={instrument.id} instrument={instrument} />)}
      </div>
    </section>
  )
}

export function InstrumentDetailClient({ instrument }: { instrument: Instrument }) {
  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 xl:px-8">
        <Link href="/instrumentos" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700"><ArrowLeft className="size-4" /> Volver a instrumentos</Link>
        <header className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{instrument.areas[0]}</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{instrument.nombre}</h1>
          <p className="mt-2 text-base text-slate-600">{instrument.descripcion}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/instrumentos/${instrument.id}/evaluacion`} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Iniciar evaluacion</Link>
          </div>
        </header>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Ficha tecnica</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="font-bold">Autor</dt><dd>{instrument.autor}</dd></div>
              <div><dt className="font-bold">Objetivo</dt><dd>{instrument.objetivo}</dd></div>
              <div><dt className="font-bold">Edad/rango</dt><dd>{instrument.rangoTexto}</dd></div>
              <div><dt className="font-bold">Aplicacion</dt><dd>{instrument.aplicacion}</dd></div>
              <div><dt className="font-bold">Instrucciones</dt><dd>{instrument.instrucciones}</dd></div>
            </dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Baremo disponible</h2>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <tbody>{instrument.baremos.map((row) => <tr key={row.descripcion} className="border-b"><td className="p-3">{row.descripcion}</td><td className="p-3 font-bold">{row.rango}</td><td className="p-3">{row.nivel}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Estructura</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {instrument.subtests.map((subtest) => <article key={subtest.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="font-bold">{subtest.nombre}</p><p className="mt-1 text-sm text-slate-600">{subtest.area}</p><p className="mt-2 text-xs text-amber-800">{subtest.criterioCorreccion}</p></article>)}
          </div>
        </section>
      </div>
    </main>
  )
}
