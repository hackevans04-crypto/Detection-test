// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { InstrumentCenter, InstrumentCenterUnavailable } from '@/features/evaluations/instruments/center/instrument-center'
import { InstrumentDetail } from '@/features/evaluations/instruments/center/instrument-detail'
import { IntakeSection } from '@/features/evaluations/instruments/center/intake-section'
import {
  createEvaluationInstrument,
  createInstrumentBlueprint,
  type Evaluation,
  type EvaluationInstrument,
} from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { createInstrumentPackage, type InstrumentPackage, type PackageFileRole } from '@/lib/instruments/import/package-model'

let evaluation: Evaluation = makeEvaluation()
const update = vi.fn()
const saveNow = vi.fn()

vi.mock('@/features/evaluations/workspace/evaluation-provider', () => ({
  useEvaluation: () => ({
    evaluation,
    update,
    saveNow,
    saveState: 'idle',
    saveError: null,
    lastSavedAt: null,
    dirty: false,
    goToStep: vi.fn(),
  }),
}))

vi.mock('@/lib/auth/session-context', () => ({
  useSession: () => ({
    user: {
      id: 'user-test',
      name: 'Profesional de prueba',
      email: 'pro@example.com',
      role: 'PROFESSIONAL',
      title: 'Psicopedagogia',
      registrationType: '',
      registrationNumber: '',
      registrationAuthority: '',
    },
    institution: { id: 'inst-test', name: 'Institucion', district: 'Distrito' },
  }),
}))

vi.mock('@/features/evaluations/workspace/step-footer', () => ({
  StepFooter: ({ disableNext }: { disableNext: boolean }) => (
    <div data-testid="step-footer" data-disabled={disableNext ? 'true' : 'false'} />
  ),
}))

afterEach(() => {
  cleanup()
  update.mockClear()
  saveNow.mockClear()
  evaluation = makeEvaluation()
})

describe('Instrumentos IA', () => {
  it('sin DB muestra banner y mantiene el shell del módulo', () => {
    render(<InstrumentCenterUnavailable onRetry={saveNow} />)

    expect(screen.getByText('No se pudo sincronizar con el servidor.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Instrumentos IA' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Nuevo an.lisis/ })).toBeTruthy()
  })

  it('sin archivos mantiene analizar deshabilitado', () => {
    render(<IntakeSection />)

    expect(screen.getByRole('button', { name: 'Analizar instrumento' }).hasAttribute('disabled')).toBe(true)
  })

  it('con archivo seleccionado muestra preview y habilita analizar', () => {
    render(<IntakeSection />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['contenido'], 'ENFEN.rar', { type: 'application/x-rar-compressed' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByText('Material seleccionado')).toBeTruthy()
    expect(screen.getByText('ENFEN.rar')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Analizar instrumento' }).hasAttribute('disabled')).toBe(false)
  })

  it('mantiene ENFEN como protagonista y mueve BENDER al historial', () => {
    const oldEntry = entry({ id: 'old-entry', instrumentId: 'pkg-old', name: 'BENDER', createdAt: '2026-09-02T10:00:00.000Z' })
    const newEntry = entry({ id: 'new-entry', instrumentId: 'pkg-new', name: 'ENFEN', createdAt: '2026-09-03T10:00:00.000Z' })
    evaluation = makeEvaluation({
      battery: [oldEntry, newEntry],
      instrumentPackages: [pkg('pkg-old', 'BENDER'), pkg('pkg-new', 'ENFEN')],
    })

    render(<InstrumentCenter />)

    expect(screen.getByRole('heading', { name: 'ENFEN' })).toBeTruthy()
    expect(screen.getByText('Historial de instrumentos')).toBeTruthy()
    expect(screen.getByText('1 anterior')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'BENDER' })).toBeNull()
  })

  it('re-resuelve un instrumento legacy ESTADO como STAI desde el material persistido', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'ESTADO' })
    const legacyPackage = pkg('pkg-one', 'ESTADO', { readiness: 'PARTIAL_READY' })
    legacyPackage.name = 'ESTADO'
    legacyPackage.fingerprint = { ...legacyPackage.fingerprint, acronym: null, normalizedName: 'manual cuestionario de ansiedad estado' }
    legacyPackage.instrumentIdentity = legacyPackage.fingerprint
    legacyPackage.files = [
      {
        ...packageFile('pkg-one', 'MANUAL'),
        name: 'manual cuestionario de ansiedad estado.pdf',
        path: 'manual cuestionario de ansiedad estado.pdf',
      },
    ]
    evaluation = makeEvaluation({ battery: [current], instrumentPackages: [legacyPackage] })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    expect(screen.getByRole('heading', { name: 'STAI' })).toBeTruthy()
    expect(screen.getByText(/Inventario de Ansiedad Estado-Rasgo/)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'ESTADO' })).toBeNull()
  })

  it('fixture A: instrumento bloqueado por aplicabilidad prioriza una sola CTA', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'ENFEN', professionalName: 'Profesional' })
    evaluation = makeEvaluation({
      battery: [current],
      evaluatorName: 'Profesional',
      initialData: {
        ...makeEvaluation().initialData,
        person: {
          ...makeEvaluation().initialData.person,
          birthDate: '1998-01-01',
          sex: 'Masculino',
          grade: '1ro EGB',
        },
      },
      instrumentPackages: [
        pkg('pkg-one', 'ENFEN', {
          readiness: 'REQUIRES_REVIEW',
          notes: ['Discrepancia crítica de edad: el ENFEN está tipificado exclusivamente para niños de 6 a 12 años.'],
        }),
      ],
    })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    expect(screen.getAllByText('No aplicable normativamente').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/6.*12/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Revisar aplicabilidad del instrumento.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revisar aplicabilidad' })).toBeTruthy()
    expect(within(screen.getByRole('heading', { name: 'Revisar aplicabilidad del instrumento.' }).closest('section')!).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Importar respuestas' })).toBeNull()
    expect(screen.queryByText('Perfil de barras')).toBeNull()

    expect(screen.queryByRole('button', { name: 'Ver detalles' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fixture B: instrumento sin respuestas pide importar respuestas sin secciones vacías', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'ENFEN' })
    evaluation = makeEvaluation({ battery: [current], instrumentPackages: [pkg('pkg-one', 'ENFEN', { readiness: 'REQUIRES_REVIEW' })] })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    expect(screen.getByRole('heading', { name: 'No se detectaron respuestas del evaluado.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Importar respuestas' })).toBeTruthy()
    expect(screen.queryByText('Perfil de barras')).toBeNull()
    expect(screen.queryByText('Interpretación')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Resultados' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('tab', { name: 'Informe' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByText(/Revisi.n necesaria/)).toBeNull()
  })

  it('permite guardar y continuar con procesamiento parcial', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'STAI' })
    const partialPackage = pkg('pkg-one', 'STAI', { readiness: 'PARTIAL_READY' })
    partialPackage.computedResults = [
      {
        measureId: 'total',
        label: 'Resultado final',
        rawValue: '42',
        transformedValue: null,
        percentile: null,
        classification: null,
        sourceFile: 'STAI.xlsx',
        sourceLocation: 'Resultados!B2',
        confidence: 0.78,
      },
    ]
    evaluation = makeEvaluation({ battery: [current], instrumentPackages: [partialPackage] })

    render(<InstrumentCenter />)

    expect(screen.getByTestId('step-footer').dataset.disabled).toBe('false')
  })

  it('permite cerrar Instrumentos IA con material digitalizado aunque no haya respuestas calculables', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'ENFEN' })
    evaluation = makeEvaluation({ battery: [current], instrumentPackages: [pkg('pkg-one', 'ENFEN')] })

    render(<InstrumentCenter />)

    expect(screen.getByTestId('step-footer').dataset.disabled).toBe('false')
  })

  it('vincula datos principales y usa copy único de vacío', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'ENFEN', professionalName: 'Dra. Real' })
    evaluation = makeEvaluation({
      battery: [current],
      instrumentPackages: [pkg('pkg-one', 'ENFEN')],
      initialData: {
        ...makeEvaluation().initialData,
        person: { ...makeEvaluation().initialData.person, sex: 'Masculino', grade: '4' },
      },
    })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver datos utilizados' }))

    const linked = screen.getByRole('dialog', { name: 'Datos utilizados' })
    expect(within(linked).getByText('Masculino')).toBeTruthy()
    expect(within(linked).getByText(/4.*EGB/)).toBeTruthy()
    expect(within(linked).getByText('Dra. Real')).toBeTruthy()
    expect(within(linked).getByText('Motivo')).toBeTruthy()
    expect(within(linked).queryByText('No asignado')).toBeNull()
  })

  it('oculta confianza de extracción si sólo trae confianza estática de modo diseño', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'ENFEN' })
    const designPackage = pkg('pkg-one', 'ENFEN')
    designPackage.files = designPackage.files.map((file) => ({
      ...file,
      confidence: 0.35,
      evidence: ['Modo diseño: valor visual temporal.'],
    }))
    evaluation = makeEvaluation({ battery: [current], instrumentPackages: [designPackage] })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    expect(screen.queryByText('Confianza de extracción')).toBeNull()
  })

  it('fixture C: instrumento con resultados renderiza dashboard, gráfico, tabla y evidencia', () => {
    const current = scoredEntry({ report: 'DRAFT' })
    evaluation = makeEvaluation({
      battery: [current],
      instrumentPackages: [pkg('pkg-one', 'ENFEN', { withResponses: true, withFullMaterials: true })],
      instrumentBlueprints: { bp1: blueprint() },
    })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    expect(screen.getByRole('tab', { name: 'Resultados' })).toBeTruthy()
    expect(screen.queryByText('Perfil de barras')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Resultados' }))

    expect(screen.getByText('Resultado general')).toBeTruthy()
    expect(screen.getByText('Perfil de barras')).toBeTruthy()
    expect(screen.getByText('Radar disponible')).toBeTruthy()
    expect(screen.getByText('Tabla de puntuaciones')).toBeTruthy()
    expect(screen.getByText(/Evidencia del an.lisis/)).toBeTruthy()
    expect(screen.getByText(/Ver estad.sticas completas/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeTruthy()
  })

  it('habilita resultados descriptivos aunque el instrumento no aplique normativamente por edad', () => {
    const current = scoredEntry({ report: 'DRAFT' })
    evaluation = makeEvaluation({
      battery: [current],
      initialData: {
        ...makeEvaluation().initialData,
        person: {
          ...makeEvaluation().initialData.person,
          birthDate: '1998-01-01',
          sex: 'Masculino',
          grade: '1ro EGB',
        },
      },
      instrumentPackages: [
        pkg('pkg-one', 'ENFEN', {
          withResponses: true,
          withFullMaterials: true,
          notes: ['El ENFEN está tipificado para niños de 6 a 12 años.'],
        }),
      ],
      instrumentBlueprints: { bp1: blueprint() },
    })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    expect(screen.getAllByText('No aplicable normativamente').length).toBeGreaterThan(0)
    expect(screen.getByRole('tab', { name: 'Resultados' }).hasAttribute('disabled')).toBe(false)

    fireEvent.click(screen.getByRole('tab', { name: 'Resultados' }))

    expect(screen.getByText('Resultado general')).toBeTruthy()
    expect(screen.getByText('Perfil de barras')).toBeTruthy()
  })

  it('muestra resultados calculados importados desde el paquete', () => {
    const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'STAI' })
    const resultPackage = pkg('pkg-one', 'STAI', { readiness: 'PARTIAL_READY', withResponses: true })
    resultPackage.computedResults = [
      {
        measureId: 'resultado-final',
        label: 'Resultado final',
        rawValue: '42',
        transformedValue: null,
        percentile: null,
        classification: null,
        sourceFile: 'STAI.xlsx',
        sourceLocation: 'Resultados!B2',
        confidence: 0.78,
      },
    ]
    evaluation = makeEvaluation({ battery: [current], instrumentPackages: [resultPackage] })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    expect(screen.getByRole('tab', { name: 'Resultados' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('tab', { name: 'Resultados' }))

    expect(screen.getAllByText('Resultado final importado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('42').length).toBeGreaterThan(0)
    expect(screen.getByText(/STAI.xlsx/)).toBeTruthy()
  })

  it('fixture D: instrumento con resultados e informe aprobado permite descarga', () => {
    const current = scoredEntry({ report: 'APPROVED', measures: [{ id: 'total', label: 'Total', unit: 'sobre 60' }] })
    evaluation = makeEvaluation({
      battery: [current],
      instrumentPackages: [pkg('pkg-one', 'ENFEN', { withResponses: true, withFullMaterials: true })],
      instrumentBlueprints: { bp1: blueprint([{ id: 'total', label: 'Total', unit: 'sobre 60' }]) },
    })

    render(<InstrumentDetail entry={current} battery={[current]} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Informe' }))

    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeTruthy()
  })
})

function entry(input: Partial<EvaluationInstrument>) {
  return {
    ...createEvaluationInstrument({
      instrumentId: input.instrumentId ?? 'pkg-one',
      name: input.name ?? 'Instrumento',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'user-test',
      professionalName: 'Profesional de prueba',
    }),
    ...input,
  }
}

function scoredEntry(options: { report: 'DRAFT' | 'APPROVED'; measures?: Array<{ id: string; label: string; unit: string }> }) {
  const current = entry({ id: 'entry-one', instrumentId: 'pkg-one', name: 'ENFEN' })
  current.blueprintId = 'bp1'
  current.scores = {
    total: { fieldId: 'total', value: '42', updatedAt: '2026-09-03T10:00:00.000Z' },
    memoria: { fieldId: 'memoria', value: '28', updatedAt: '2026-09-03T10:00:00.000Z' },
    atencion: { fieldId: 'atencion', value: '31', updatedAt: '2026-09-03T10:00:00.000Z' },
  }
  if (options.measures?.length === 1) current.scores = { total: current.scores.total }
  current.report =
    options.report === 'APPROVED'
      ? { status: 'APPROVED', generatedAt: '2026-09-03T10:00:00.000Z', approvedAt: '2026-09-03T11:00:00.000Z', signature: null }
      : { status: 'DRAFT', generatedAt: '2026-09-03T10:00:00.000Z', approvedAt: null, signature: null }
  return current
}

function pkg(
  id: string,
  name: string,
  options: {
    readiness?: InstrumentPackage['readiness']
    notes?: string[]
    withResponses?: boolean
    withFullMaterials?: boolean
  } = {},
): InstrumentPackage {
  const base = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'user-test' })
  const roles: PackageFileRole[] = options.withFullMaterials
    ? ['MANUAL', 'QUESTION_BOOKLET', 'STIMULUS_BOOK', 'SUPPORT_DOCUMENT', 'NORMS']
    : ['MANUAL']
  return {
    ...base,
    id,
    name,
    instrumentIdentity: { ...base.instrumentIdentity, normalizedName: name.toLowerCase(), acronym: name },
    blueprintId: 'bp1',
    readiness: options.readiness ?? 'READY',
    stage: 'REVIEW',
    findings: [
      {
        id: `${id}-finding`,
        field: 'Edad de aplicación',
        value: options.notes?.[0] ?? 'Rango no determinado.',
        sources: [],
      },
    ],
    blocks: [
      {
        id: 'respuestas',
        label: 'Respuestas',
        state: options.withResponses ? 'OK' : 'MISSING',
        findings: [],
        notes: options.notes ?? ['Sin hoja de respuestas incorporada.'],
        approved: false,
      },
    ],
    files: [
      ...roles.map((role) => packageFile(id, role)),
      ...(options.withResponses ? [packageFile(id, 'ANSWER_SHEET')] : []),
    ],
  }
}

function packageFile(id: string, role: PackageFileRole) {
  return {
    id: `${id}-${role}`,
    path: `${role}.pdf`,
    name: `${role}.pdf`,
    extension: '.pdf',
    declaredMime: 'application/pdf',
    detectedMime: 'application/pdf',
    size: 1024,
    checksum: `${id}-${role}-checksum`,
    role,
    confidence: 0.92,
    evidence: ['Confianza devuelta por fixture de pipeline UI.'],
    status: 'ACCEPTED' as const,
    reason: '',
    extractedFrom: null,
  }
}

function blueprint(
  measures = [
    { id: 'total', label: 'Total', unit: 'sobre 60' },
    { id: 'memoria', label: 'Memoria', unit: 'sobre 40' },
    { id: 'atencion', label: 'Atencion', unit: 'sobre 40' },
  ],
) {
  return {
    ...createInstrumentBlueprint({
      sourceJobId: 'job1',
      name: 'ENFEN',
      shortName: 'ENFEN',
      version: '',
      sourceDocument: 'Manual.pdf',
      measures: measures.map((measure) => ({
        id: measure.id,
        label: measure.label,
        kind: 'DIRECT' as const,
        unit: measure.unit,
        source: 'BLUEPRINT' as const,
        subtestId: measure.id,
      })),
    }),
    id: 'bp1',
  }
}



