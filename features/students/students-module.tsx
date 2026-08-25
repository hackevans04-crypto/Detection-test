'use client'

import { AppSidebar } from '@/components/platform/app-sidebar'
import { initialStudents, recordSections, type StudentRecord, type StudentStatus } from '@/data/students'
import {
  Activity,
  Bell,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Mail,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'

const storageKey = 'detection-test.students.v1'

function fullName(student: StudentRecord) {
  return `${student.firstName} ${student.lastName}`
}

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDelta = today.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1
  return Number.isFinite(age) ? age : 0
}

function makeStudentId(firstName: string, lastName: string) {
  return `stu-${firstName}-${lastName}-${Date.now()}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function StudentsModule() {
  const [students, setStudents] = useState<StudentRecord[]>(initialStudents)
  const [selectedId, setSelectedId] = useState(initialStudents[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StudentStatus | 'Todos'>('Todos')
  const [activeTab, setActiveTab] = useState('Expediente')

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved) as StudentRecord[]
      setStudents(parsed)
      setSelectedId(parsed[0]?.id ?? '')
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(students))
  }, [students])

  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return students.filter((student) => {
      const matchesQuery = [fullName(student), student.identification, student.grade, student.reason]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
      const matchesStatus = status === 'Todos' || student.status === status
      return matchesQuery && matchesStatus
    })
  }, [query, status, students])

  const selectedStudent = students.find((student) => student.id === selectedId) ?? filteredStudents[0] ?? students[0]

  function handleCreateStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const firstName = String(form.get('firstName') ?? '').trim()
    const lastName = String(form.get('lastName') ?? '').trim()
    if (!firstName || !lastName) return

    const newStudent: StudentRecord = {
      id: makeStudentId(firstName, lastName),
      firstName,
      lastName,
      identification: String(form.get('identification') ?? '').trim(),
      birthDate: String(form.get('birthDate') ?? '').trim() || '2018-01-01',
      grade: String(form.get('grade') ?? '').trim() || 'Sin grado',
      parallel: String(form.get('parallel') ?? '').trim() || 'A',
      tutorName: String(form.get('tutorName') ?? '').trim() || 'Por asignar',
      representativeName: String(form.get('representativeName') ?? '').trim() || 'Por registrar',
      representativePhone: '',
      representativeEmail: '',
      status: 'Expediente activo',
      consent: 'Pendiente',
      reason: String(form.get('reason') ?? '').trim() || 'Motivo pendiente de documentar.',
      familyContext: 'Pendiente de entrevista familiar.',
      healthDevelopment: 'Pendiente de registrar antecedentes de desarrollo y salud.',
      schoolHistory: 'Pendiente de registrar historia escolar.',
      previousInterventions: 'Pendiente de registrar intervenciones previas.',
      activeEvaluation: 'Sin evaluacion iniciada',
      nextAction: 'Completar expediente',
      updatedAt: new Date().toISOString().slice(0, 10),
    }

    setStudents((current) => [newStudent, ...current])
    setSelectedId(newStudent.id)
    event.currentTarget.reset()
  }

  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active="Estudiantes" />

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-slate-50/92 px-4 py-4 backdrop-blur md:px-6 xl:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="font-display text-2xl font-bold md:text-3xl">Modulo 1: Estudiantes y expediente</p>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Registra al estudiante, documenta antecedentes y deja listo el expediente para evaluacion psicopedagogica.
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto">
                <label className="flex h-11 min-w-0 flex-[1_1_100%] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm sm:flex-1 xl:w-[430px]">
                  <Search className="size-5 text-slate-500" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    placeholder="Buscar estudiante, cedula, grado..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <button className="relative grid size-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                  <Bell className="size-5" />
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500" />
                </button>
                <button className="relative grid size-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                  <Mail className="size-5" />
                </button>
              </div>
            </div>
          </header>

          <div className="grid min-w-0 gap-5 p-4 md:p-6 xl:grid-cols-[minmax(320px,420px)_1fr] xl:p-8">
            <section className="min-w-0 space-y-5">
              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Registro rapido</h2>
                    <p className="text-sm text-slate-500">Crea el expediente base sin salir del modulo.</p>
                  </div>
                  <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <UserPlus className="size-6" />
                  </span>
                </div>
                <form className="mt-4 grid gap-3" onSubmit={handleCreateStudent}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="firstName" required placeholder="Nombres" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                    <input name="lastName" required placeholder="Apellidos" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input name="identification" placeholder="Identificacion" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                    <input name="birthDate" type="date" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input name="grade" placeholder="Grado" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                    <input name="parallel" placeholder="Paralelo" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                    <input name="tutorName" placeholder="Tutor" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <input name="representativeName" placeholder="Representante" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
                  <textarea name="reason" placeholder="Motivo de evaluacion" className="min-h-20 resize-y rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-500" />
                  <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white shadow-sm shadow-blue-600/25">
                    <Save className="size-4" />
                    Guardar expediente
                  </button>
                </form>
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg font-bold">Estudiantes</h2>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as StudentStatus | 'Todos')}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none"
                  >
                    <option>Todos</option>
                    <option>Expediente activo</option>
                    <option>Evaluacion en curso</option>
                    <option>Informe pendiente</option>
                    <option>Seguimiento</option>
                  </select>
                </div>
                <div className="space-y-2">
                  {filteredStudents.map((student) => (
                    <button
                      key={student.id}
                      onClick={() => setSelectedId(student.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedStudent?.id === student.id ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-blue-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-blue-700">
                          {student.firstName[0]}{student.lastName[0]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm">{fullName(student)}</strong>
                          <small className="block truncate text-xs text-slate-500">{student.grade} · {student.activeEvaluation}</small>
                          <small className="mt-2 inline-flex rounded-full bg-white px-2 py-1 text-[11px] font-bold text-blue-700 ring-1 ring-blue-100">
                            {student.status}
                          </small>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </article>
            </section>

            {selectedStudent && (
              <section className="min-w-0 space-y-5">
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-start gap-4">
                      <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-600/25">
                        {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
                      </span>
                      <div>
                        <h1 className="font-display text-2xl font-bold">{fullName(selectedStudent)}</h1>
                        <p className="mt-1 text-sm text-slate-600">
                          {selectedStudent.grade} {selectedStudent.parallel} · {calculateAge(selectedStudent.birthDate)} anos · Tutor: {selectedStudent.tutorName}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{selectedStudent.status}</span>
                          <span className={selectedStudent.consent === 'Completo' ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700' : 'rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700'}>
                            Consentimiento: {selectedStudent.consent}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Actualizado {selectedStudent.updatedAt}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white">
                        <ClipboardCheck className="size-4" />
                        Iniciar evaluacion
                      </button>
                      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-blue-700">
                        <FileText className="size-4" />
                        Preparar informe
                      </button>
                    </div>
                  </div>
                </article>

                <div className="grid gap-4 md:grid-cols-4">
                  {[
                    ['Expediente', selectedStudent.consent === 'Completo' ? 'Listo' : 'Incompleto', FolderOpen],
                    ['Evaluacion', selectedStudent.activeEvaluation, Activity],
                    ['Accion siguiente', selectedStudent.nextAction, CalendarClock],
                    ['Proteccion', 'Datos sensibles auditados', ShieldCheck],
                  ].map(([title, value, Icon]) => (
                    <article key={title as string} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <span className="grid size-11 place-items-center rounded-xl bg-slate-50 text-blue-600">
                        <Icon className="size-5" />
                      </span>
                      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title as string}</p>
                      <strong className="mt-1 block text-sm">{value as string}</strong>
                    </article>
                  ))}
                </div>

                <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3">
                    {['Expediente', 'Antecedentes', 'Evaluaciones', 'Informes', 'Seguimiento'].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`h-9 shrink-0 rounded-lg px-3 text-sm font-bold ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="p-5">
                    {activeTab === 'Expediente' && (
                      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                        <RecordBlock title="Motivo de evaluacion" value={selectedStudent.reason} />
                        <RecordBlock title="Representante" value={`${selectedStudent.representativeName} · ${selectedStudent.representativePhone || 'telefono pendiente'} · ${selectedStudent.representativeEmail || 'correo pendiente'}`} />
                        <RecordBlock title="Contexto familiar" value={selectedStudent.familyContext} />
                        <RecordBlock title="Desarrollo y salud" value={selectedStudent.healthDevelopment} />
                        <RecordBlock title="Historia escolar" value={selectedStudent.schoolHistory} />
                        <RecordBlock title="Intervenciones previas" value={selectedStudent.previousInterventions} />
                      </div>
                    )}

                    {activeTab === 'Antecedentes' && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {recordSections.map(([title, description]) => (
                          <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center gap-3">
                              <CheckCircle2 className="size-5 text-emerald-600" />
                              <h3 className="font-display text-sm font-bold">{title}</h3>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeTab === 'Evaluaciones' && (
                      <div className="grid gap-4 md:grid-cols-2">
                        <ActionPanel title="Test ABC" description="Aplicacion por subtests, registro de respuestas y calificacion segun reglas documentadas." action="Abrir instrumento" icon={BookOpenCheck} />
                        <ActionPanel title="PRO-CALCULO" description="Registro de subareas. La conversion a puntuaciones tipicas queda bloqueada si no existe baremo autorizado." action="Configurar aplicacion" icon={ClipboardCheck} />
                      </div>
                    )}

                    {activeTab === 'Informes' && (
                      <ActionPanel title="Informe psicopedagogico" description="Genera borradores con datos del expediente, resultados validados y revision profesional obligatoria." action="Crear borrador" icon={FileText} />
                    )}

                    {activeTab === 'Seguimiento' && (
                      <ActionPanel title="Plan de apoyo y seguimiento" description="Registra adaptaciones curriculares, acuerdos con docente, familia y avances por fecha." action="Registrar seguimiento" icon={CalendarClock} />
                    )}
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

function RecordBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{value}</p>
    </div>
  )
}

function ActionPanel({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string
  description: string
  action: string
  icon: typeof ClipboardCheck
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-600">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white">
        <Plus className="size-4" />
        {action}
      </button>
    </div>
  )
}
