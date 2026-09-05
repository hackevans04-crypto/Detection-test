import type { EvaluationContextSnapshot } from '@/lib/evaluations/context-service'

export type SemanticFieldMatch = {
  requestedField: string
  targetPath: string | null
  value: string | null
  sourceStep: string | null
  confidence: number
  status: 'matched' | 'required'
}

const explicitMappings: Array<{ terms: string[]; targetPath: string }> = [
  { terms: ['person.fullname', 'person.fullName', 'person.name'], targetPath: 'person.fullName' },
  { terms: ['person.age', 'person.chronologicalage'], targetPath: 'person.chronologicalAge' },
  { terms: ['person.birthdate'], targetPath: 'person.birthDate' },
  { terms: ['academic.currentlevel', 'academic.level'], targetPath: 'academic.currentLevel' },
  { terms: ['evaluation.date'], targetPath: 'evaluation.date' },
  { terms: ['evaluation.reason'], targetPath: 'evaluation.reason' },
  { terms: ['professional.name', 'evaluation.professional'], targetPath: 'evaluation.professional' },
  { terms: ['nombre del examinado', 'nombre', 'evaluado', 'paciente'], targetPath: 'person.fullName' },
  { terms: ['edad', 'edad cronologica', 'años cumplidos', 'anos cumplidos'], targetPath: 'person.chronologicalAge' },
  { terms: ['fecha nacimiento', 'fecha de nacimiento'], targetPath: 'person.birthDate' },
  { terms: ['curso', 'grado', 'nivel escolar', 'escolaridad actual', 'escolaridad'], targetPath: 'academic.currentLevel' },
  { terms: ['institucion', 'institución', 'centro educativo'], targetPath: 'academic.institution' },
  { terms: ['motivo', 'motivo de consulta', 'razon de evaluacion', 'razón de evaluación'], targetPath: 'evaluation.reason' },
  { terms: ['fecha evaluacion', 'fecha de evaluación', 'fecha de evaluacion'], targetPath: 'evaluation.date' },
  { terms: ['profesional', 'evaluador', 'psicopedagogo'], targetPath: 'evaluation.professional' },
]

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function readPath(snapshot: EvaluationContextSnapshot, path: string) {
  const [group, key] = path.split('.') as [keyof EvaluationContextSnapshot, string]
  const record = snapshot[group] as Record<string, { value: string | null; sourceStep: string; confidence: number }>
  return record?.[key] ?? null
}

export function mapSemanticField(requestedField: string, snapshot: EvaluationContextSnapshot): SemanticFieldMatch {
  const normalized = normalize(requestedField)
  const mapping = explicitMappings.find(({ terms }) => terms.some((term) => normalized.includes(normalize(term))))

  if (!mapping) {
    return { requestedField, targetPath: null, value: null, sourceStep: null, confidence: 0, status: 'required' }
  }

  const contextField = readPath(snapshot, mapping.targetPath)
  const value = contextField?.value ?? null
  const confidence = value ? Math.min(1, contextField.confidence) : 0

  return {
    requestedField,
    targetPath: mapping.targetPath,
    value,
    sourceStep: contextField?.sourceStep ?? null,
    confidence,
    status: confidence >= 0.75 ? 'matched' : 'required',
  }
}

export function mapRequiredFields(fields: string[], snapshot: EvaluationContextSnapshot) {
  return fields.map((field) => mapSemanticField(field, snapshot))
}
