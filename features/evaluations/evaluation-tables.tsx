'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Search, Trash2 } from 'lucide-react'
import { AppSidebar } from '@/components/platform/app-sidebar'
import { getInstrument } from '@/instruments/catalog'
import { calculateInstrumentResult } from '@/lib/evaluation-engine'
import { deleteEvaluation, loadEvaluations } from '@/lib/local-evaluations'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'
import type { EvaluationRecord } from '@/types/psychopedagogy'

export function EvaluationsWorkspace({ active, title, mode }: { active: string; title: string; mode: 'historial' | 'resultados' | 'informes' }) {
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    setEvaluations(loadEvaluations())
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim()
    return evaluations.filter((evaluation) => {
      const instrument = getInstrument(evaluation.instrumentId)
      return !normalized || `${evaluation.student.fullName} ${instrument?.nombre} ${evaluation.status} ${evaluation.student.evaluator}`.toLowerCase().includes(normalized)
    })
  }, [evaluations, query])

  const download = (evaluation: EvaluationRecord) => {
    const blob = generatePsychopedagogicalReport(evaluation)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Informe_Psicopedagogico_${evaluation.student.fullName || 'Evaluado'}_${evaluation.student.evaluationDate}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active={active} />
        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-slate-50/90 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="font-display text-2xl font-bold md:text-3xl">{title}</p>
                <p className="mt-1 text-sm text-slate-600">Datos guardados de forma estructurada para seguimiento, resultados e informes.</p>
              </div>
              <label className="flex h-11 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm xl:w-[420px]">
                <Search className="size-5 text-slate-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar por nombre, instrumento, estado..." />
              </label>
            </div>
          </header>
          <div className="p-4 md:p-6 xl:p-8">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="p-3">Evaluado</th>
                    <th className="p-3">Instrumento</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Resultado</th>
                    <th className="p-3">Evaluador</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((evaluation) => {
                    const instrument = getInstrument(evaluation.instrumentId)
                    const result = calculateInstrumentResult(evaluation)
                    const resultText = result.kind === 'abc' ? `${result.range} / ${result.level}` : `PD ${result.pdTotal}`
                    return (
                      <tr key={evaluation.id} className="border-t border-slate-100">
                        <td className="p-3 font-bold">{evaluation.student.fullName || 'Evaluado'}</td>
                        <td className="p-3">{instrument?.nombre}</td>
                        <td className="p-3">{evaluation.student.evaluationDate}</td>
                        <td className="p-3">{resultText}</td>
                        <td className="p-3">{evaluation.student.evaluator}</td>
                        <td className="p-3"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{evaluation.status}</span></td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Link href={`/instrumentos/${evaluation.instrumentId}/evaluacion`} className="rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-700">Continuar</Link>
                            <button onClick={() => download(evaluation)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 font-bold text-white"><Download className="size-3" /> PDF</button>
                            {mode === 'historial' && <button onClick={() => setEvaluations(deleteEvaluation(evaluation.id))} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 font-bold text-red-700"><Trash2 className="size-3" /> Eliminar</button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-500">No hay evaluaciones guardadas todavia.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
