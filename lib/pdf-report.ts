import { calculateInstrumentResult } from '@/lib/evaluation-engine'
import type { EvaluationRecord } from '@/types/psychopedagogy'

function escapePdf(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function linesFor(evaluation: EvaluationRecord) {
  const result = calculateInstrumentResult(evaluation)
  const lines = [
    'INFORME DE EVALUACION PSICOPEDAGOGICA',
    `Codigo de evaluacion: ${evaluation.code}`,
    `Fecha: ${evaluation.student.evaluationDate}`,
    `Evaluador: ${evaluation.student.evaluator}`,
    '',
    '1. DATOS INFORMATIVOS',
    `Evaluado: ${evaluation.student.fullName}`,
    `Edad: ${evaluation.student.ageYears} años`,
    `Identificacion: ${evaluation.student.identification}`,
    `Institucion: ${evaluation.student.institution}`,
    `Grado/curso: ${evaluation.student.grade}`,
    `Representante legal: ${evaluation.student.representative}`,
    '',
    '2. MOTIVO DE EVALUACION',
    evaluation.student.reason || 'No registrado.',
    '',
    '3. TECNICAS E INSTRUMENTOS UTILIZADOS',
    evaluation.instrumentId === 'test-abc' ? 'Test ABC.' : 'PRO-CALCULO.',
    'Observacion psicopedagogica.',
    '',
    '4. RESULTADOS CUANTITATIVOS',
  ]

  if (result.kind === 'abc') {
    lines.push(`Puntaje total: ${result.total}`, `Rango: ${result.range}`, `Nivel: ${result.level}`)
    result.subtests.forEach((row) => lines.push(`${row.nombre}: ${row.score}/${row.max} - ${row.area}`))
  } else {
    lines.push(`PD total: ${result.pdTotal}`)
    result.rows.forEach((row) => lines.push(`${row.subtest}: PD ${row.pd} / PT ${row.pt ?? 'pendiente'} / ${row.classification}`))
  }

  lines.push(
    '',
    '5. INTERPRETACION PSICOPEDAGOGICA',
    result.interpretation,
    '',
    '6. FORTALEZAS',
    ...result.strengths,
    '',
    '7. AREAS QUE REQUIEREN APOYO',
    ...result.supportAreas,
    '',
    '8. OBSERVACIONES PSICOPEDAGOGICAS',
    evaluation.observations.notes || 'Sin observaciones complementarias registradas.',
    '',
    '9. CONCLUSIONES',
    evaluation.conclusions || 'Conclusiones pendientes de revision por el evaluador.',
    '',
    '10. RECOMENDACIONES',
    ...(evaluation.recommendations ? evaluation.recommendations.split('\n') : result.recommendations),
    '',
    '11. ADVERTENCIAS / LIMITACIONES',
    ...result.warnings,
    '',
    '12. RESPONSABLE',
    `${evaluation.student.evaluator}`,
    'Firma: ______________________________',
  )

  return lines.flatMap((line) => line.length > 92 ? line.match(/.{1,92}(\s|$)/g) ?? [line] : [line])
}

export function generatePsychopedagogicalReport(evaluation: EvaluationRecord) {
  const textLines = linesFor(evaluation)
  const chunks: string[] = []
  let y = 790
  chunks.push('BT /F1 11 Tf 50 820 Td')
  textLines.forEach((line) => {
    if (y < 50) {
      chunks.push('ET')
      chunks.push('BT /F1 11 Tf 50 820 Td')
      y = 790
    }
    chunks.push(`0 -16 Td (${escapePdf(line ?? '')}) Tj`)
    y -= 16
  })
  chunks.push('ET')
  const stream = chunks.join('\n')
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object) => {
    offsets.push(pdf.length)
    pdf += `${object}\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}
