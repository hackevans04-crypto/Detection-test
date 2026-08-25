'use client'

import { useState } from 'react'
import { Check, CircleDashed, Info, Plus, Trash2 } from 'lucide-react'
import { SelectField, TextField, TextareaField } from '@/components/ui/fields'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import {
  backgroundSchema,
  fieldKey,
  isBlockComplete,
  isSectionComplete,
  type BackgroundBlock,
} from '@/lib/evaluations/background-schema'
import { newIntervention, type BackgroundSectionId, type Intervention } from '@/lib/evaluations/model'

const documentTypes = ['Informe', 'Certificado', 'Ficha de seguimiento', 'Derivación', 'Otro'] as const

const specialties = [
  'Psicología',
  'Psicopedagogía',
  'Terapia de lenguaje',
  'Terapia ocupacional',
  'Neurología',
  'Fisioterapia',
  'Otra',
] as const

/**
 * Contexto y antecedentes.
 *
 * Siete secciones en una columna lateral, no siete módulos del menú principal:
 * todo pertenece al mismo expediente. Las intervenciones anteriores son una
 * lista repetible porque en el informe cada una tiene institución, especialidad,
 * documento, resultado y año propios.
 */
export function BackgroundStep() {
  const { evaluation, update } = useEvaluation()
  const [sectionId, setSectionId] = useState<BackgroundSectionId>('desarrollo')
  const [blockId, setBlockId] = useState<string | null>(null)

  const section = backgroundSchema.find((item) => item.id === sectionId)
  const isInterventions = sectionId === 'intervenciones'
  const values = evaluation.background[sectionId] ?? {}

  // Desarrollo se recorre por etapas (prenatal, perinatal, posnatal); el resto
  // muestra sus bloques apilados, que son pocos.
  const usesPills = sectionId === 'desarrollo'
  const activeBlock = usesPills ? (section?.blocks.find((b) => b.id === blockId) ?? section?.blocks[0]) : null
  const visibleBlocks = usesPills && activeBlock ? [activeBlock] : (section?.blocks ?? [])

  const setValue = (key: string, next: string) =>
    update((current) => ({
      ...current,
      background: { ...current.background, [sectionId]: { ...(current.background[sectionId] ?? {}), [key]: next } },
    }))

  const setInterventions = (next: Intervention[]) =>
    update((current) => ({ ...current, interventions: next }))

  return (
    <StepCard
      step="contexto"
      description="Historia del estudiante que da sentido a los resultados. Se guarda automáticamente mientras escribes."
    >
      <div className="dt-substep">
        <nav className="dt-substep-nav" aria-label="Secciones de antecedentes">
          {backgroundSchema.map((item) => {
            const complete = isSectionComplete(evaluation.background[item.id] ?? {}, item)
            return (
              <button
                key={item.id}
                type="button"
                className="dt-substep-item"
                aria-current={item.id === sectionId ? 'true' : undefined}
                onClick={() => {
                  setSectionId(item.id)
                  setBlockId(null)
                }}
              >
                <span className="dt-substep-mark" data-complete={complete} aria-hidden="true">
                  {complete ? <Check /> : <CircleDashed />}
                </span>
                {item.label}
                <span className="dt-sr-only">{complete ? '(completada)' : '(pendiente)'}</span>
              </button>
            )
          })}
          <button
            type="button"
            className="dt-substep-item"
            aria-current={isInterventions ? 'true' : undefined}
            onClick={() => setSectionId('intervenciones')}
          >
            <span className="dt-substep-mark" data-complete={evaluation.interventions.length > 0} aria-hidden="true">
              {evaluation.interventions.length > 0 ? <Check /> : <CircleDashed />}
            </span>
            Intervenciones previas
          </button>
        </nav>

        <div className="dt-substep-body">
          {isInterventions ? (
            <InterventionsSection interventions={evaluation.interventions} onChange={setInterventions} />
          ) : (
            <>
              <header className="dt-substep-head">
                <h3>{section?.label}</h3>
                <p>{section?.description}</p>
              </header>

              {usesPills && section ? (
                <div className="dt-tabs" role="tablist" aria-label="Etapas del desarrollo">
                  {section.blocks.map((block) => {
                    const complete = isBlockComplete(values, block)
                    const current = (activeBlock?.id ?? section.blocks[0].id) === block.id
                    return (
                      <button
                        key={block.id}
                        type="button"
                        role="tab"
                        className="dt-tab"
                        aria-selected={current}
                        onClick={() => setBlockId(block.id)}
                      >
                        {complete ? (
                          <Check className="size-3.5" style={{ color: 'var(--dt-success)' }} aria-hidden="true" />
                        ) : null}
                        {block.title}
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div className="mt-5 grid gap-4">
                {visibleBlocks.map((block) => (
                  <BlockFields key={block.id} block={block} values={values} onChange={setValue} showTitle={!usesPills} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <StepFooter step="contexto" />
    </StepCard>
  )
}

function BlockFields({
  block,
  values,
  onChange,
  showTitle,
}: {
  block: BackgroundBlock
  values: Record<string, string>
  onChange: (key: string, next: string) => void
  showTitle: boolean
}) {
  const complete = isBlockComplete(values, block)

  return (
    <section className="dt-block">
      {showTitle ? (
        <header className="dt-block-head">
          <div>
            <h3>{block.title}</h3>
            <p>{block.hint}</p>
          </div>
          <span className="dt-badge" data-tone={complete ? 'success' : 'neutral'}>
            {complete ? <Check aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
            {complete ? 'Completo' : 'Pendiente'}
          </span>
        </header>
      ) : (
        <p className="dt-block-hint">{block.hint}</p>
      )}

      <div className="dt-form-grid">
        {block.fields.map((field) => {
          const key = fieldKey(block.id, field.id)
          const value = values[key] ?? ''
          if (field.options) {
            return (
              <SelectField
                key={key}
                label={field.label}
                value={value}
                onChange={(next) => onChange(key, next)}
                options={field.options}
                placeholder={field.placeholder}
              />
            )
          }
          if (!field.rows || field.rows === 1) {
            return (
              <TextField
                key={key}
                label={field.label}
                value={value}
                onChange={(next) => onChange(key, next)}
                placeholder={field.placeholder}
              />
            )
          }
          return (
            <TextareaField
              key={key}
              label={field.label}
              value={value}
              onChange={(next) => onChange(key, next)}
              placeholder={field.placeholder}
              rows={field.rows}
              className="dt-span-full"
            />
          )
        })}
      </div>
    </section>
  )
}

function InterventionsSection({
  interventions,
  onChange,
}: {
  interventions: Intervention[]
  onChange: (next: Intervention[]) => void
}) {
  const patch = (id: string, changes: Partial<Intervention>) =>
    onChange(interventions.map((item) => (item.id === id ? { ...item, ...changes } : item)))

  return (
    <>
      <header className="dt-substep-head">
        <h3>Intervenciones previas</h3>
        <p>Atenciones profesionales que el estudiante ya ha recibido, con su respaldo documental.</p>
      </header>

      <p className="dt-note">
        <Info aria-hidden="true" />
        Si el estudiante no ha recibido intervenciones anteriores, deja la lista vacía: el informe lo hará constar
        así. Esta sección no bloquea el avance de la etapa.
      </p>

      <div className="mt-5 grid gap-4">
        {interventions.map((intervention, index) => (
          <section key={intervention.id} className="dt-block">
            <header className="dt-block-head">
              <div>
                <h3>Intervención {index + 1}</h3>
                <p>Institución, especialidad, documento y resultado.</p>
              </div>
              <button
                type="button"
                className="dt-btn dt-btn-ghost dt-btn-sm"
                onClick={() => onChange(interventions.filter((item) => item.id !== intervention.id))}
              >
                <Trash2 aria-hidden="true" />
                Eliminar
              </button>
            </header>

            <div className="dt-form-grid" data-columns="3">
              <TextField
                label="Institución"
                value={intervention.institution}
                onChange={(next) => patch(intervention.id, { institution: next })}
                placeholder="Centro o profesional que atendió"
              />
              <SelectField
                label="Especialidad"
                value={intervention.specialty}
                onChange={(next) => patch(intervention.id, { specialty: next })}
                options={specialties}
                placeholder="Selecciona"
              />
              <SelectField
                label="Tipo de documento"
                value={intervention.documentType}
                onChange={(next) => patch(intervention.id, { documentType: next })}
                options={documentTypes}
                placeholder="Selecciona"
              />
              <TextField
                label="Año"
                value={intervention.year}
                onChange={(next) => patch(intervention.id, { year: next })}
                placeholder="Ej. 2024"
              />
              <TextareaField
                label="Resultado"
                value={intervention.result}
                onChange={(next) => patch(intervention.id, { result: next })}
                placeholder="Conclusiones o indicaciones del documento…"
                rows={3}
                className="dt-span-full"
              />
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        className="dt-btn dt-btn-secondary dt-btn-sm mt-4"
        onClick={() => onChange([...interventions, newIntervention()])}
      >
        <Plus aria-hidden="true" />
        Añadir intervención
      </button>
    </>
  )
}
