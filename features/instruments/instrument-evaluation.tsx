'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Download, Save, ShieldAlert } from 'lucide-react'
import { getInstrument } from '@/instruments/catalog'
import { calculateAgeYears, calculateInstrumentResult, validateInstrumentAge } from '@/lib/evaluation-engine'
import { upsertEvaluation } from '@/lib/local-evaluations'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'
import type { EvaluationRecord, PsychopedagogicalObservation, ResponseRecord, StudentData } from '@/types/psychopedagogy'

const emptyStudent = (): StudentData => ({
  fullName: '',
  birthDate: '',
  ageYears: 0,
  identification: '',
  institution: '',
  grade: '',
  tutor: '',
  representative: '',
  phone: '',
  email: '',
  evaluationDate: new Date().toISOString().slice(0, 10),
  evaluator: 'Maria Fernandez',
  reason: '',
  initialObservations: '',
})

const emptyObservation = (): PsychopedagogicalObservation => ({
  bodyKnowledge: 'Estructurado',
  bodyKnowledgeNotes: '',
  lateralDominanceEye: 'sin definir',
  lateralDominanceEar: 'sin definir',
  lateralDominanceHand: 'sin definir',
  lateralDominanceFoot: 'sin definir',
  lateralDominanceNotes: '',
  allopsychicOrientation: 'Dentro de lo normal',
  autopsychicOrientation: 'Dentro de lo normal',
  grossMotor: 'Estructurada',
  fineMotor: 'Estructurada',
  psycholinguistic: 'Comprensivo estructurado; articulatorio estructurado; expresivo estructurado',
  notes: '',
})

function createEvaluation(instrumentId: string, student: StudentData): EvaluationRecord {
  const instrument = getInstrument(instrumentId)!
  const now = new Date().toISOString()
  const nextStudent = { ...student, ageYears: calculateAgeYears(student.birthDate, student.evaluationDate) }
  return {
    id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    code: `EV-${Date.now().toString().slice(-6)}`,
    student: nextStudent,
    instrumentId: instrument.id,
    instrumentVersionId: `${instrument.id}@${instrument.version}`,
    evaluatorId: 'usr_maria_fernandez',
    mode: 'evaluation',
    startedAt: now,
    status: 'EN PROGRESO',
    currentSubtest: 0,
    responses: {},
    ageWarning: validateInstrumentAge(nextStudent, instrument.id),
    ageWarningConfirmed: false,
    observations: emptyObservation(),
    conclusions: '',
    recommendations: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function InstrumentEvaluationClient({ instrumentId }: { instrumentId: string }) {
  const instrument = getInstrument(instrumentId)
  const [step, setStep] = useState<'student' | 'warning' | 'instructions' | 'apply' | 'review' | 'result'>('student')
  const [student, setStudent] = useState<StudentData>(emptyStudent)
  const [evaluation, setEvaluation] = useState<EvaluationRecord | null>(null)
  const [lastSaved, setLastSaved] = useState('')

  const currentSubtest = evaluation && instrument ? instrument.subtests[evaluation.currentSubtest] : null
  const result = useMemo(() => evaluation ? calculateInstrumentResult(evaluation) : null, [evaluation])

  useEffect(() => {
    setStudent((current) => ({ ...current, ageYears: calculateAgeYears(current.birthDate, current.evaluationDate) }))
  }, [student.birthDate, student.evaluationDate])

  useEffect(() => {
    if (!evaluation) return
    const timer = window.setTimeout(() => {
      upsertEvaluation(evaluation)
      setLastSaved(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [evaluation])

  if (!instrument) {
    return <main className="grid min-h-svh place-items-center bg-slate-50 p-6 text-slate-900">Instrumento no encontrado.</main>
  }

  const requiredReady = Boolean(student.fullName && student.birthDate && student.institution && student.evaluationDate && student.evaluator && student.reason)

  const start = () => {
    const next = createEvaluation(instrument.id, student)
    setEvaluation(next)
    setStep(next.ageWarning ? 'warning' : 'instructions')
  }

  const updateResponse = (activityId: string, value: string, score: number, note: string) => {
    if (!evaluation) return
    const now = new Date().toISOString()
    const response: ResponseRecord = {
      id: `${evaluation.id}-${activityId}`,
      evaluationId: evaluation.id,
      activityId,
      responseValue: value,
      score,
      evaluatorScore: score,
      evaluatorObservation: note,
      answeredAt: now,
    }
    setEvaluation({ ...evaluation, responses: { ...evaluation.responses, [activityId]: response }, updatedAt: now })
  }

  const completeCurrent = () => {
    if (!evaluation) return
    const missing = currentSubtest?.actividades.some((activity) => activity.obligatoria && !evaluation.responses[activity.id])
    if (missing) {
      window.alert('No se puede continuar: hay actividades obligatorias sin guardar.')
      return
    }
    const nextIndex = evaluation.currentSubtest + 1
    if (nextIndex >= instrument.subtests.length) {
      setStep('review')
      return
    }
    setEvaluation({ ...evaluation, currentSubtest: nextIndex, updatedAt: new Date().toISOString() })
  }

  const finalize = () => {
    if (!evaluation) return
    const calculated = calculateInstrumentResult(evaluation)
    setEvaluation({
      ...evaluation,
      status: 'COMPLETADA',
      completedAt: new Date().toISOString(),
      totalScore: calculated.kind === 'abc' ? calculated.total : calculated.pdTotal,
      range: calculated.kind === 'abc' ? calculated.range : undefined,
      level: calculated.kind === 'abc' ? calculated.level : undefined,
      interpretation: calculated.interpretation,
      updatedAt: new Date().toISOString(),
    })
    setStep('result')
  }

  const downloadPdf = () => {
    if (!evaluation) return
    const blob = generatePsychopedagogicalReport(evaluation)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Informe_Psicopedagogico_${evaluation.student.fullName || 'Evaluado'}_${evaluation.student.evaluationDate}.pdf`
    a.click()
    URL.revokeObjectURL(url)
    setEvaluation({ ...evaluation, status: 'INFORME GENERADO' })
  }

  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 xl:px-8">
        <Link href="/instrumentos" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700">
          <ArrowLeft className="size-4" />
          Volver a instrumentos
        </Link>

        <header className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{instrument.aplicacion} · {instrument.rangoTexto}</p>
              <h1 className="mt-2 text-3xl font-black">{instrument.nombre}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{instrument.descripcion}</p>
            </div>
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 ring-1 ring-blue-100">
              Autosave {lastSaved ? `· ${lastSaved}` : 'activo'}
            </div>
          </div>
        </header>

        {step === 'student' && (
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Scrum · Sprint de aplicacion</p>
                <h2 className="text-2xl font-bold">Datos del evaluado</h2>
                <p className="mt-1 text-sm text-slate-600">Flujo unico de evaluacion: registro, validacion, aplicacion, resultado e informe.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Evaluacion activa</span>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                ['fullName', 'Nombres y apellidos'], ['birthDate', 'Fecha de nacimiento'], ['identification', 'Identificacion'],
                ['institution', 'Institucion educativa'], ['grade', 'Grado/curso'], ['tutor', 'Docente tutor'],
                ['representative', 'Representante legal'], ['phone', 'Telefono'], ['email', 'Correo'],
                ['evaluationDate', 'Fecha de evaluacion'], ['evaluator', 'Evaluador'], ['reason', 'Motivo de evaluacion'],
              ].map(([key, label]) => (
                <label key={key} className="grid gap-2 text-sm font-semibold text-slate-700">
                  {label}
                  <input
                    type={key.toLowerCase().includes('date') ? 'date' : 'text'}
                    value={String(student[key as keyof StudentData])}
                    onChange={(event) => setStudent({ ...student, [key]: event.target.value })}
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-blue-500"
                  />
                </label>
              ))}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Edad calculada</p>
                <p className="mt-2 text-2xl font-bold">{student.ageYears || 0} años</p>
              </div>
            </div>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-slate-700">
              Observaciones iniciales
              <textarea value={student.initialObservations} onChange={(event) => setStudent({ ...student, initialObservations: event.target.value })} className="min-h-24 rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500" />
            </label>
            <button disabled={!requiredReady} onClick={start} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-40">Crear evaluacion</button>
          </section>
        )}

        {step === 'warning' && evaluation && (
          <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
            <div className="flex gap-3">
              <ShieldAlert className="size-6 shrink-0" />
              <div>
                <h2 className="text-xl font-bold">Advertencia por rango de edad</h2>
                <p className="mt-2">Advertencia: la edad registrada se encuentra fuera del rango de aplicacion indicado para este instrumento. Los resultados deben interpretarse con precaucion.</p>
                <button onClick={() => { setEvaluation({ ...evaluation, ageWarningConfirmed: true }); setStep('instructions') }} className="mt-5 rounded-lg bg-amber-600 px-4 py-2 font-bold text-white">Confirmar y continuar</button>
              </div>
            </div>
          </section>
        )}

        {step === 'instructions' && (
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">Instrucciones</h2>
            <p className="mt-3 leading-7 text-slate-700">{instrument.instrucciones}</p>
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{instrument.normativeStatus}</p>
            <button onClick={() => setStep('apply')} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Iniciar Subtest 1</button>
          </section>
        )}

        {step === 'apply' && evaluation && currentSubtest && (
          <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
            <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-bold">Navegador</h2>
              <div className="mt-3 space-y-2">
                {instrument.subtests.map((subtest, index) => {
                  const done = subtest.actividades.every((activity) => evaluation.responses[activity.id])
                  return (
                    <button key={subtest.id} onClick={() => setEvaluation({ ...evaluation, currentSubtest: index })} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${index === evaluation.currentSubtest ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-700'}`}>
                      {done ? '✓' : index === evaluation.currentSubtest ? 'En progreso' : 'Pendiente'} · {subtest.nombre}
                    </button>
                  )
                })}
              </div>
            </aside>
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{instrument.nombre}</p>
                  <h2 className="mt-1 text-2xl font-black">Subtest {evaluation.currentSubtest + 1} de {instrument.subtests.length}</h2>
                  <p className="mt-2 text-sm text-slate-600">{currentSubtest.area}</p>
                </div>
                <div className="text-sm font-bold text-slate-600">Progreso {Math.round(((evaluation.currentSubtest + 1) / instrument.subtests.length) * 100)}%</div>
              </div>
              <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">{currentSubtest.instrucciones}</div>
              <div className="mt-5 space-y-4">
                {currentSubtest.actividades.map((activity) => {
                  const saved = evaluation.responses[activity.id]
                  return (
                    <article key={activity.id} className="rounded-xl border border-slate-200 p-4">
                      <h3 className="font-bold">{activity.enunciado}</h3>
                      <p className="mt-2 text-sm text-slate-600">{activity.instrucciones}</p>
                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px]">
                        <textarea defaultValue={saved?.responseValue ?? ''} id={`${activity.id}-value`} className="min-h-24 rounded-lg border border-slate-200 px-3 py-2" placeholder="Respuesta, PD/PT u observacion de ejecucion" />
                        <input defaultValue={saved?.evaluatorScore ?? ''} id={`${activity.id}-score`} type="number" min="0" max={activity.puntuacionMaxima} className="h-11 rounded-lg border border-slate-200 px-3" placeholder="Puntaje" />
                      </div>
                      <textarea defaultValue={saved?.evaluatorObservation ?? ''} id={`${activity.id}-note`} className="mt-3 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Observaciones del evaluador" />
                      <button
                        onClick={() => {
                          const value = (document.getElementById(`${activity.id}-value`) as HTMLTextAreaElement).value
                          const rawScore = (document.getElementById(`${activity.id}-score`) as HTMLInputElement).value
                          const score = Number(rawScore || value || 0)
                          const note = (document.getElementById(`${activity.id}-note`) as HTMLTextAreaElement).value
                          updateResponse(activity.id, value, Math.min(activity.puntuacionMaxima, Math.max(0, Number.isFinite(score) ? score : 0)), note)
                        }}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                      >
                        <Save className="size-4" />
                        Guardar respuesta
                      </button>
                    </article>
                  )
                })}
              </div>
              <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5">
                <button onClick={() => setEvaluation({ ...evaluation, currentSubtest: Math.max(0, evaluation.currentSubtest - 1) })} className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700">Anterior</button>
                <Link href="/historial" className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700">Guardar y salir</Link>
                <button onClick={completeCurrent} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Siguiente</button>
              </div>
            </section>
          </div>
        )}

        {step === 'review' && evaluation && (
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold">Revisar respuestas</h2>
            <p className="mt-2 text-sm text-slate-600">Confirme que todas las actividades obligatorias tienen respuesta antes de finalizar.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {instrument.subtests.map((subtest) => (
                <div key={subtest.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <CheckCircle2 className={`mb-2 size-5 ${subtest.actividades.every((activity) => evaluation.responses[activity.id]) ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <strong>{subtest.nombre}</strong>
                  <p>{subtest.actividades.every((activity) => evaluation.responses[activity.id]) ? 'Completado' : 'Pendiente'}</p>
                </div>
              ))}
            </div>
            <button onClick={() => window.confirm('¿Desea finalizar la evaluacion? Despues de confirmar se calcularan los resultados.') && finalize()} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white">Finalizar y calcular resultado</button>
          </section>
        )}

        {step === 'result' && evaluation && result && (
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-3xl font-black">RESULTADO DE EVALUACION</h2>
            <p className="mt-2 text-slate-600">{evaluation.student.fullName || 'Evaluado'} · {evaluation.student.evaluationDate} · {evaluation.student.ageYears} años · {instrument.nombre}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Puntuacion global</p><p className="mt-2 text-2xl font-black">{result.kind === 'abc' ? result.total : result.pdTotal}</p></div>
              <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-bold uppercase text-emerald-700">Nivel / clasificacion</p><p className="mt-2 text-lg font-black">{result.kind === 'abc' ? result.level : 'Ver tabla PT'}</p></div>
              <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Areas destacadas</p><p className="mt-2 text-sm">{result.strengths.join(', ')}</p></div>
              <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Areas de apoyo</p><p className="mt-2 text-sm">{result.supportAreas.join(', ')}</p></div>
            </div>
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              {result.kind === 'abc' ? (
                <table className="w-full text-left text-sm"><tbody>{result.subtests.map((row) => <tr key={row.id} className="border-b"><td className="p-3 font-bold">{row.nombre}</td><td className="p-3">{row.area}</td><td className="p-3">{row.score}/{row.max}</td></tr>)}</tbody></table>
              ) : (
                <table className="w-full text-left text-sm"><tbody>{result.rows.map((row) => <tr key={row.id} className="border-b"><td className="p-3 font-bold">{row.subtest}</td><td className="p-3">PD {row.pd}</td><td className="p-3">PT {row.pt ?? 'pendiente'}</td><td className="p-3">{row.classification}</td></tr>)}</tbody></table>
              )}
            </div>
            <h3 className="mt-6 text-xl font-bold">Interpretacion psicopedagogica</h3>
            <p className="mt-2 leading-7 text-slate-700">{result.interpretation}</p>
            <h3 className="mt-6 text-xl font-bold">Advertencias / limitaciones</h3>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => upsertEvaluation(evaluation)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700">Guardar</button>
              <button onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white"><Download className="size-4" /> Descargar PDF</button>
              <Link href="/historial" className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700">Volver al historial</Link>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
