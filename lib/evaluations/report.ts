import { backgroundSchema, fieldKey } from '@/lib/evaluations/background-schema'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import { ageAt, formatAge, formatLongDate, orDash } from '@/lib/evaluations/format'
import { recommendationGroupIds, recommendationGroupLabels, type Evaluation } from '@/lib/evaluations/model'
import { evaluationResults } from '@/lib/evaluations/results'

/**
 * Contenido del informe psicopedagógico.
 *
 * Se construye una sola vez y lo consumen tanto la vista previa como el PDF:
 * así lo que el profesional revisa en pantalla es literalmente lo que se
 * descarga, sin una segunda plantilla que se desincronice.
 */

export type ReportBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'note'; title: string; text: string }
  | { kind: 'pairs'; items: Array<{ label: string; value: string }> }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | { kind: 'subheading'; text: string }

export type ReportSection = {
  number: number
  title: string
  blocks: ReportBlock[]
}

export type ReportDocument = {
  title: string
  subject: string
  code: string
  date: string
  summary: Array<{ label: string; value: string }>
  sections: ReportSection[]
}

const EMPTY = 'No registrado.'

export function buildReport(evaluation: Evaluation): ReportDocument {
  const { initialData } = evaluation
  const age = ageAt(initialData.person.birthDate, initialData.evaluationDate)
  const results = evaluationResults(evaluation)
  const appliedInstrumentNames = results.map((result) => result.instrument.nombre)

  const sections: ReportSection[] = []

  sections.push({
    number: 1,
    title: 'Datos de identificación',
    blocks: [
      {
        kind: 'pairs',
        items: [
          { label: 'Nombres y apellidos', value: orDash(initialData.person.fullName, EMPTY) },
          { label: 'Fecha de nacimiento', value: formatLongDate(initialData.person.birthDate) },
          { label: 'Edad', value: age ? formatAge(age) : EMPTY },
          { label: 'Sexo', value: orDash(initialData.person.sex, 'Sin especificar') },
          { label: 'Identificación', value: orDash(initialData.person.identification, EMPTY) },
          { label: 'Institución educativa', value: orDash(initialData.person.institution, EMPTY) },
          { label: 'Grado o curso', value: orDash(initialData.person.grade, EMPTY) },
          { label: 'Docente tutor', value: orDash(initialData.person.tutor, EMPTY) },
          { label: 'Representante', value: orDash(initialData.family.guardianName, EMPTY) },
          { label: 'Teléfono', value: orDash(initialData.family.guardianPhone, EMPTY) },
          { label: 'Correo electrónico', value: orDash(initialData.family.guardianEmail, EMPTY) },
        ],
      },
    ],
  })

  sections.push({
    number: 2,
    title: 'Motivo de evaluación',
    blocks: [
      {
        kind: 'note',
        title: 'Propósito del apartado',
        text: 'Explica por qué se inicia el proceso y quién solicita la valoración. Esta información orienta la lectura del resto del informe.',
      },
      { kind: 'paragraph', text: orDash(evaluation.referral.reason, EMPTY) },
      {
        kind: 'pairs',
        items: [
          { label: 'Remitente', value: orDash(evaluation.referral.source, EMPTY) },
          { label: 'Oficio o referencia', value: orDash(evaluation.referral.officeNumber, EMPTY) },
          { label: 'Fecha del oficio', value: formatLongDate(evaluation.referral.officeDate) },
          { label: 'Documento de respaldo', value: orDash(evaluation.referral.documentNumber, EMPTY) },
        ],
      },
      ...(evaluation.referral.requestText.trim()
        ? [
            { kind: 'subheading' as const, text: 'Solicitud registrada' },
            { kind: 'paragraph' as const, text: evaluation.referral.requestText },
          ]
        : []),
    ],
  })

  const backgroundBlocks: ReportBlock[] = []
  for (const tab of backgroundSchema) {
    const values = evaluation.background[tab.id] ?? {}
    // Los antecedentes se guardan bajo `bloque.campo`, no bajo el identificador
    // del campo a secas: leerlos por `field.id` no encontraba nada y el
    // apartado salía siempre como «No registrado».
    const written = tab.blocks
      .flatMap((block) => block.fields.map((field) => ({ block, field })))
      .map(({ block, field }) => ({
        label: field.label,
        value: (values[fieldKey(block.id, field.id)] ?? '').trim(),
      }))
      .filter((item) => item.value.length > 0)
    if (written.length === 0) continue
    backgroundBlocks.push({ kind: 'subheading', text: tab.label })
    backgroundBlocks.push({ kind: 'pairs', items: written })
  }

  if (evaluation.interventions.length > 0) {
    backgroundBlocks.push({ kind: 'subheading', text: 'Intervenciones previas' })
    backgroundBlocks.push({
      kind: 'table',
      headers: ['Institución', 'Especialidad', 'Documento', 'Año'],
      rows: evaluation.interventions.map((item) => [
        orDash(item.institution, EMPTY),
        orDash(item.specialty),
        orDash(item.documentType),
        orDash(item.year),
      ]),
    })
    const withResult = evaluation.interventions.filter((item) => item.result.trim())
    if (withResult.length > 0) {
      backgroundBlocks.push({
        kind: 'pairs',
        items: withResult.map((item) => ({ label: `Resultado · ${orDash(item.specialty)}`, value: item.result })),
      })
    }
  }
  sections.push({
    number: 3,
    title: 'Antecedentes',
    blocks: backgroundBlocks.length > 0 ? backgroundBlocks : [{ kind: 'paragraph', text: EMPTY }],
  })

  // La observación funcional es una fuente de evidencia por derecho propio:
  // enumerar los nombres de las áreas dejaba fuera lo único que importa de
  // ellas, que es el desempeño observado y lo que el profesional anotó.
  const observedAreas = functionalAreaSchema
    .map((area) => ({ area, record: evaluation.functionalAreas[area.id] }))
    .filter((item) => item.record?.performance || item.record?.description)

  const instrumentBlocks: ReportBlock[] = []
  if (observedAreas.length > 0) {
    instrumentBlocks.push({
      kind: 'note',
      title: 'Cómo leer este apartado',
      text: 'Primero se presenta la observación funcional registrada por áreas. Luego se listan los instrumentos aplicados y su estado normativo para diferenciar observación clínica, evidencia escolar y pruebas estandarizadas.',
    })
    instrumentBlocks.push({ kind: 'subheading', text: 'Observación psicopedagógica funcional' })
    instrumentBlocks.push({
      kind: 'table',
      headers: ['Área evaluada', 'Desempeño', 'Descripción'],
      rows: observedAreas.map(({ area, record }) => [
        area.label,
        orDash(record.performance, 'Sin valorar'),
        orDash(record.description, EMPTY),
      ]),
    })
    const withObservations = observedAreas.filter((item) => item.record.observations.trim())
    if (withObservations.length > 0) {
      instrumentBlocks.push({
        kind: 'pairs',
        items: withObservations.map(({ area, record }) => ({ label: area.label, value: record.observations })),
      })
    }
  } else {
    instrumentBlocks.push({ kind: 'pairs', items: [{ label: 'Áreas de evaluación', value: EMPTY }] })
  }
  for (const result of results) {
    instrumentBlocks.push({
      kind: 'pairs',
      items: [
        { label: result.instrument.nombre, value: result.instrument.subtitulo },
        { label: 'Autor', value: result.instrument.autor },
        { label: 'Aplicación', value: result.instrument.aplicacion },
        { label: 'Rango de edad', value: result.instrument.rangoTexto },
        { label: 'Estado normativo', value: result.instrument.normativeStatus },
      ],
    })
  }
  if (results.length === 0) {
    instrumentBlocks.push({ kind: 'paragraph', text: 'No se aplicaron instrumentos estandarizados.' })
  }
  sections.push({
    number: 4,
    title: 'Áreas evaluadas e instrumentos aplicados',
    blocks: instrumentBlocks,
  })

  const resultBlocks: ReportBlock[] = []
  for (const result of results) {
    const isPdPt = result.instrument.scoringMode === 'pd_pt'
    resultBlocks.push({ kind: 'subheading', text: result.instrument.nombre })
    resultBlocks.push({
      kind: 'note',
      title: 'Criterio de lectura',
      text: isPdPt
        ? 'La PD corresponde a la puntuación directa registrada. La PT y la clasificación dependen del baremo disponible o de la puntuación ingresada por el profesional.'
        : 'La PD corresponde a la puntuación directa obtenida en cada unidad. El total se interpreta sólo cuando todas las unidades requeridas están registradas.',
    })
    resultBlocks.push({
      kind: 'table',
      headers: isPdPt
        ? [result.instrument.unidad.singular, 'PD', 'PT', 'Clasificación']
        : [result.instrument.unidad.singular, 'Área', 'PD', 'Máximo'],
      caption: `Resultados registrados en ${result.instrument.nombre}.`,
      rows: result.rows.map((row) =>
        isPdPt
          ? [row.nombre, row.pd === null ? '—' : String(row.pd), row.pt === null ? '—' : String(row.pt), row.classification ?? 'Conversión no disponible']
          : [row.nombre, row.area, row.pd === null ? '—' : String(row.pd), String(row.max)],
      ),
    })
    if (result.global) {
      resultBlocks.push({
        kind: 'pairs',
        items: [
          { label: 'Puntuación total', value: String(result.pdTotal) },
          { label: 'Rango', value: result.global.range },
          { label: 'Nivel', value: result.global.level },
        ],
      })
    } else if (!isPdPt) {
      resultBlocks.push({
        kind: 'pairs',
        items: [{ label: 'Puntuación total', value: `${result.pdTotal} (registro incompleto)` }],
      })
    }
    if (result.notices.length > 0) {
      resultBlocks.push({ kind: 'list', items: result.notices })
    }

    const withObservations = result.rows.filter((row) => row.observations.trim().length > 0)
    if (withObservations.length > 0) {
      resultBlocks.push({
        kind: 'pairs',
        items: withObservations.map((row) => ({ label: row.nombre, value: row.observations })),
      })
    }

    // La lectura de cada instrumento acompaña a su propia tabla: separada de
    // la interpretación global, que integra todas las fuentes.
    const interpretation = evaluation.instrumentApplications[result.instrument.id]?.interpretation.trim()
    if (interpretation) {
      resultBlocks.push({
        kind: 'pairs',
        items: [{ label: `Interpretación de ${result.instrument.nombre}`, value: interpretation }],
      })
    }
  }
  sections.push({
    number: 5,
    title: 'Resultados',
    blocks: resultBlocks.length > 0 ? resultBlocks : [{ kind: 'paragraph', text: EMPTY }],
  })

  sections.push({
    number: 6,
    title: 'Interpretación',
    blocks: [{ kind: 'paragraph', text: orDash(evaluation.interpretation, EMPTY) }],
  })

  // Conclusiones y recomendaciones se emiten numeradas, una por punto, tal
  // como se registraron: unirlas en un párrafo perdería el destinatario y el
  // orden que el profesional les dio.
  const conclusions = evaluation.conclusions.map((entry) => entry.text.trim()).filter(Boolean)
  sections.push({
    number: 7,
    title: 'Conclusiones',
    blocks: conclusions.length > 0 ? [{ kind: 'list', items: conclusions }] : [{ kind: 'paragraph', text: EMPTY }],
  })

  const recommendationBlocks: ReportBlock[] = []
  for (const group of recommendationGroupIds) {
    const items = evaluation.recommendations[group].map((entry) => entry.text.trim()).filter(Boolean)
    if (items.length === 0) continue
    recommendationBlocks.push({ kind: 'subheading', text: recommendationGroupLabels[group] })
    recommendationBlocks.push({ kind: 'list', items })
  }
  sections.push({
    number: 8,
    title: 'Recomendaciones',
    blocks: recommendationBlocks.length > 0 ? recommendationBlocks : [{ kind: 'paragraph', text: EMPTY }],
  })

  const professional = evaluation.report.professional
  sections.push({
    number: 9,
    title: 'Profesional responsable',
    blocks: [
      {
        kind: 'pairs',
        items: [
          { label: 'Nombre', value: orDash(professional.name, orDash(evaluation.evaluatorName, EMPTY)) },
          { label: 'Cargo o especialidad', value: orDash(professional.role, EMPTY) },
          ...(professional.registryNumber.trim()
            ? [{ label: 'N.º de registro profesional', value: professional.registryNumber }]
            : []),
          { label: 'Firma', value: '__________________________________' },
        ],
      },
    ],
  })

  sections.push({
    number: 10,
    title: 'Fecha',
    blocks: [
      {
        kind: 'pairs',
        items: [
          { label: 'Fecha de evaluación', value: formatLongDate(initialData.evaluationDate) },
          {
            label: 'Fecha de emisión del informe',
            value: formatLongDate(professional.date || new Date().toISOString()),
          },
        ],
      },
    ],
  })

  return {
    title: 'INFORME PSICOPEDAGÓGICO',
    subject: orDash(initialData.person.fullName, 'Evaluado'),
    code: evaluation.code,
    date: formatLongDate(initialData.evaluationDate),
    summary: [
      { label: 'Evaluado', value: orDash(initialData.person.fullName, EMPTY) },
      { label: 'Edad a la evaluación', value: age ? formatAge(age) : EMPTY },
      { label: 'Institución educativa', value: orDash(initialData.person.institution, EMPTY) },
      { label: 'Grado o curso', value: orDash(initialData.person.grade, EMPTY) },
      {
        label: 'Instrumentos aplicados',
        value: appliedInstrumentNames.length > 0 ? appliedInstrumentNames.join(', ') : 'No se aplicaron instrumentos estandarizados.',
      },
      { label: 'Profesional responsable', value: orDash(professional.name, orDash(evaluation.evaluatorName, EMPTY)) },
    ],
    sections,
  }
}

export function reportFileName(evaluation: Evaluation) {
  const name = (evaluation.initialData.person.fullName || 'Evaluado')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `Informe_Psicopedagogico_${name}_${evaluation.code}.pdf`
}
