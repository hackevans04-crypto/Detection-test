'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  GraduationCap,
  IdCard,
  Mail,
  MessageSquareText,
  Save,
  School,
  ShieldAlert,
  UserRound,
  UserRoundCheck,
} from 'lucide-react'
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

type StudentFieldConfig = {
  key: keyof StudentData
  label: string
  placeholder: string
  icon: typeof UserRound
  type?: 'text' | 'date' | 'tel' | 'email'
  required?: boolean
}

const studentFields: readonly StudentFieldConfig[] = [
  { key: 'fullName', label: 'Nombres y apellidos', placeholder: 'Escribe el nombre completo', icon: UserRound, required: true },
  { key: 'birthDate', label: 'Fecha de nacimiento', placeholder: 'Selecciona la fecha', icon: CalendarDays, type: 'date', required: true },
  { key: 'identification', label: 'Identificación', placeholder: 'Cédula o documento', icon: IdCard },
  { key: 'institution', label: 'Institución educativa', placeholder: 'Nombre de la institución', icon: School, required: true },
  { key: 'grade', label: 'Grado o curso', placeholder: 'Ej. 2do EGB', icon: GraduationCap },
  { key: 'tutor', label: 'Docente tutor', placeholder: 'Nombre del docente', icon: UserRoundCheck },
  { key: 'representative', label: 'Representante legal', placeholder: 'Nombre del representante', icon: UserRound },
  { key: 'phone', label: 'Teléfono', placeholder: '099 000 0000', icon: MessageSquareText, type: 'tel' },
  { key: 'email', label: 'Correo electrónico', placeholder: 'correo@institucion.edu.ec', icon: Mail, type: 'email' },
  { key: 'evaluationDate', label: 'Fecha de evaluación', placeholder: 'Selecciona la fecha', icon: CalendarCheck2, type: 'date', required: true },
  { key: 'evaluator', label: 'Evaluador responsable', placeholder: 'Nombre del profesional', icon: UserRoundCheck, required: true },
  { key: 'reason', label: 'Motivo de evaluación', placeholder: 'Describe brevemente el motivo', icon: MessageSquareText, required: true },
] as const

const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const weekDays = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO']

function isoDateParts(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? { year, month: month - 1, day } : null
}

function formatDate(value: string) {
  const parts = isoDateParts(value)
  return parts ? `${String(parts.day).padStart(2, '0')}/${String(parts.month + 1).padStart(2, '0')}/${parts.year}` : ''
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function StudentDateField({
  field,
  value,
  onChange,
}: {
  field: (typeof studentFields)[number]
  value: string
  onChange: (value: string) => void
}) {
  const selected = isoDateParts(value)
  const today = new Date()
  const [view, setView] = useState({ year: selected?.year ?? today.getFullYear(), month: selected?.month ?? today.getMonth() })
  const [open, setOpen] = useState(false)
  const Icon = field.icon
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const firstDay = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const days = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1)

  const shiftMonth = (amount: number) => {
    const next = new Date(view.year, view.month + amount, 1)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }

  return (
    <label className="evaluation-field">
      <span className="evaluation-field-label">
        {field.label}
        {field.required && <em aria-hidden="true">*</em>}
      </span>
      <span className="evaluation-date-wrap">
        <span className="evaluation-input-wrap">
          <Icon className="evaluation-input-icon" aria-hidden="true" />
          <input type="text" value={formatDate(value)} readOnly placeholder={field.placeholder} onClick={() => setOpen(true)} aria-label={field.label} />
          <button type="button" className="evaluation-date-trigger" onClick={() => setOpen((current) => !current)} aria-label={`Abrir calendario de ${field.label}`}>
            <CalendarDays aria-hidden="true" />
          </button>
        </span>
        {open && (
          <span className="evaluation-calendar" role="dialog" aria-label={`Calendario de ${field.label}`}>
            <span className="evaluation-calendar-header">
              <strong>{monthNames[view.month]} de {view.year}</strong>
              <span>
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior"><ChevronLeft /></button>
                <button type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente"><ChevronRight /></button>
              </span>
            </span>
            <span className="evaluation-calendar-week" aria-hidden="true">{weekDays.map((day) => <b key={day}>{day}</b>)}</span>
            <span className="evaluation-calendar-grid">
              {days.map((day, index) => day ? (
                <button
                  key={day}
                  type="button"
                  className={selected?.year === view.year && selected.month === view.month && selected.day === day ? 'is-selected' : ''}
                  onClick={() => { onChange(toIsoDate(view.year, view.month, day)); setOpen(false) }}
                >
                  {day}
                </button>
              ) : <span key={`empty-${index}`} aria-hidden="true" />)}
            </span>
            <button type="button" className="evaluation-calendar-today" onClick={() => { onChange(toIsoDate(today.getFullYear(), today.getMonth(), today.getDate())); setView({ year: today.getFullYear(), month: today.getMonth() }); setOpen(false) }}>
              Hoy
            </button>
          </span>
        )}
      </span>
    </label>
  )
}

function StudentField({
  field,
  value,
  onChange,
}: {
  field: (typeof studentFields)[number]
  value: string
  onChange: (value: string) => void
}) {
  if (field.type === 'date') return <StudentDateField field={field} value={value} onChange={onChange} />
  const Icon = field.icon
  return (
    <label className="evaluation-field">
      <span className="evaluation-field-label">
        {field.label}
        {field.required && <em aria-hidden="true">*</em>}
      </span>
      <span className="evaluation-input-wrap">
        <Icon className="evaluation-input-icon" aria-hidden="true" />
        <input
          type={field.type ?? 'text'}
          value={value}
          required={field.required}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  )
}

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
    <main className="evaluation-page min-h-svh bg-slate-50 text-slate-950">
      <div className="evaluation-page-shell mx-auto max-w-7xl px-4 py-6 md:px-6 xl:px-8">
        <Link href="/instrumentos" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-blue-700">
          <ArrowLeft className="size-4" />
          Volver a instrumentos
        </Link>

        <header className="evaluation-instrument-header mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
          <section className="evaluation-student-card mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Ficha de evaluación</p>
                <h2 className="text-2xl font-bold">Datos del evaluado</h2>
                <p className="mt-1 text-sm text-slate-600">Flujo unico de evaluacion: registro, validacion, aplicacion, resultado e informe.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Evaluacion activa</span>
            </div>
            <div className="evaluation-fields-grid">
              {studentFields.map((field) => (
                <StudentField
                  key={field.key}
                  field={field}
                  value={String(student[field.key as keyof StudentData])}
                  onChange={(value) => setStudent({ ...student, [field.key]: value })}
                />
              ))}
              <div className="evaluation-age-card">
                <div>
                  <p className="evaluation-age-kicker">Edad calculada</p>
                  <p className="evaluation-age-value">{student.ageYears || 0} <span>años</span></p>
                </div>
                <CalendarDays aria-hidden="true" />
              </div>
            </div>
            <label className="evaluation-notes-field">
              <span className="evaluation-field-label"><MessageSquareText aria-hidden="true" /> Observaciones iniciales</span>
              <textarea value={student.initialObservations} onChange={(event) => setStudent({ ...student, initialObservations: event.target.value })} placeholder="Añade antecedentes u observaciones relevantes..." />
            </label>
            <div className="evaluation-form-footer">
              <p><span>*</span> Campos obligatorios para iniciar la aplicación</p>
              <button disabled={!requiredReady} onClick={start} className="evaluation-primary-action"><CheckCircle2 className="size-5" /> Crear evaluación <ArrowRight className="evaluation-action-arrow size-5" /></button>
            </div>
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
