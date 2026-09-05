'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Circle } from 'lucide-react'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { useSession } from '@/lib/auth/session-context'
import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import { mapRequiredFields } from '@/lib/instruments/semantic-field-mapper'
import { validateBlueprint } from '@/lib/instruments/blueprint-validation'
import {
  consistencyLabels,
  packageFileRoleLabels,
  packageReadinessLabels,
  type InstrumentPackage,
  type ReviewBlockId,
} from '@/lib/instruments/import/package-model'
import { formatConfidence } from '@/lib/instruments/import/confidence'

type ReviewTab = 'general' | 'materiales' | 'estructura' | 'campos' | 'escalas' | 'correccion' | 'baremos' | 'fuentes' | 'tecnica'

/**
 * Panel de revisión del instrumento.
 *
 * Terminar el análisis y anunciar «instrumento creado» sería el peor final
 * posible: el profesional no sabría qué se dio por bueno ni con qué apoyo. Aquí
 * se enseña bloque a bloque qué quedó determinado, qué necesita validación y
 * qué no se encontró, y cada bloque se aprueba por separado porque cada uno se
 * comprueba contra material distinto.
 *
 * Un bloque en verde significa que alguien lo miró, no que un análisis lo
 * supuso.
 */
export function PackageReview({ pkg }: { pkg: InstrumentPackage }) {
  const { evaluation, update } = useEvaluation()
  const { user } = useSession()
  const [active, setActive] = useState<ReviewTab>('general')

  const blueprint = pkg.blueprintId ? evaluation.instrumentBlueprints[pkg.blueprintId] : null
  const context = buildEvaluationContext(evaluation)
  const mappedFields = blueprint ? mapRequiredFields(blueprint.requiredFields, context) : []
  const canSeeTechnical = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN_INSTITUCION'
  const approvedCount = pkg.blocks.filter((item) => item.approved).length

  const toggleApproval = (id: ReviewBlockId) =>
    update((current) => ({
      ...current,
      instrumentPackages: current.instrumentPackages.map((item) =>
        item.id === pkg.id
          ? {
              ...item,
              blocks: item.blocks.map((entry) =>
                entry.id === id ? { ...entry, approved: !entry.approved } : entry,
              ),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }))

  return (
    <section className="dt-ai-section" aria-labelledby="revision-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="revision-title">Revisión del instrumento</h3>
            <p>
              {approvedCount} de {pkg.blocks.length} bloques validados ·{' '}
            {packageReadinessLabels[pkg.readiness]}
          </p>
        </div>
      </div>
      {blueprint ? (
        <button
          type="button"
          className="dt-btn dt-btn-primary dt-btn-sm"
          disabled={blueprint.status === 'VALIDATED'}
          onClick={() =>
            update((current) => ({
              ...current,
              instrumentBlueprints: {
                ...current.instrumentBlueprints,
                [blueprint.id]: validateBlueprint(blueprint, user),
              },
              instrumentPackages: current.instrumentPackages.map((item) =>
                item.id === pkg.id
                  ? { ...item, readiness: 'READY', updatedAt: new Date().toISOString() }
                  : item,
              ),
            }))
          }
        >
          <Check aria-hidden="true" />
          {blueprint.status === 'VALIDATED' ? 'Instrumento validado' : 'Validar instrumento'}
        </button>
      ) : null}
      </div>

      <ol className="dt-review-summary">
        {pkg.blocks.map((item) => (
          <li key={item.id} data-state={item.state} data-approved={item.approved}>
            <span aria-hidden="true">
              {item.approved || item.state === 'OK' ? <Check /> : item.state === 'REVIEW' ? <AlertTriangle /> : <Circle />}
            </span>
            {item.label}
          </li>
        ))}
      </ol>

      <nav className="dt-subtabs" aria-label="Bloques de revisión">
        {[
          ['general', 'General'],
          ['materiales', 'Materiales'],
          ['estructura', 'Estructura'],
          ['campos', 'Campos'],
          ['escalas', 'Escalas'],
          ['correccion', 'Corrección'],
          ['baremos', 'Baremos'],
          ['fuentes', 'Fuentes'],
          ...(canSeeTechnical ? ([['tecnica', 'Técnica']] as const) : []),
        ].map(([id, label]) => (
          <button key={id} type="button" data-active={id === active} onClick={() => setActive(id as ReviewTab)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="dt-review-block">
        {active === 'fuentes' ? (
          <SourcesView pkg={pkg} />
        ) : active === 'materiales' ? (
          <MaterialsView pkg={pkg} />
        ) : active === 'campos' ? (
          <MappedFieldsView fields={mappedFields} />
        ) : active === 'estructura' || active === 'escalas' || active === 'correccion' || active === 'baremos' ? (
          <BlueprintSection pkg={pkg} section={active} />
        ) : active === 'tecnica' && canSeeTechnical ? (
          <TechnicalView pkg={pkg} />
        ) : (
          <GeneralView pkg={pkg} />
        )}

        {active === 'general' ? (
          <div className="dt-ai-actions">
            <button
              type="button"
              className={pkg.blocks.find((item) => item.id === 'general')?.approved ? 'dt-btn dt-btn-secondary dt-btn-sm' : 'dt-btn dt-btn-primary dt-btn-sm'}
              onClick={() => toggleApproval('general' as ReviewBlockId)}
            >
              {pkg.blocks.find((item) => item.id === 'general')?.approved ? 'Retirar validación' : 'Validar bloque'}
            </button>
          </div>
        ) : null}
      </div>

      {pkg.consistency.length > 0 ? <ConsistencyMatrix pkg={pkg} /> : null}
    </section>
  )
}

function GeneralView({ pkg }: { pkg: InstrumentPackage }) {
  const block = pkg.blocks.find((item) => item.id === 'general') ?? pkg.blocks[0]
  return (
    <>
      {block.notes.length > 0 ? (
              <ul className="dt-ai-summary">
                {block.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="dt-hint">Sin observaciones para este bloque.</p>
            )}

            {block.findings.length > 0 ? (
              <div className="dt-table-wrap dt-scroll">
                <table className="dt-table" data-compact="true">
                  <thead>
                    <tr>
                      <th>Dato</th>
                      <th>Valor</th>
                      <th>Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.findings.map((finding) => (
                      <tr key={finding.id}>
                        <td>{finding.field}</td>
                        <td>{finding.value}</td>
                        <td>
                          {finding.sources
                            .map((source) => `${source.fileName}${source.locator ? ` · ${source.locator}` : ''}`)
                            .join(' / ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
    </>
  )
}

function MaterialsView({ pkg }: { pkg: InstrumentPackage }) {
  const visible = pkg.files.filter((file) => file.status === 'ACCEPTED')

  return (
    <div className="dt-table-wrap dt-scroll">
      <table className="dt-table" data-compact="true">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Nombre</th>
            <th>Tamaño</th>
            <th>Estado</th>
            <th>Fuente</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((file) => (
            <tr key={file.id}>
              <td>{packageFileRoleLabels[file.role]}</td>
              <td>{file.name}</td>
              <td>{sizeLabel(file.size)}</td>
              <td>Confianza {formatConfidence(file.confidence)}</td>
              <td>{file.extractedFrom ? 'Archivo extraído' : 'Carga directa'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MappedFieldsView({
  fields,
}: {
  fields: ReturnType<typeof mapRequiredFields>
}) {
  if (fields.length === 0) return <p className="dt-hint">Este blueprint todavía no declara campos requeridos.</p>

  return (
    <div className="dt-table-wrap dt-scroll">
      <table className="dt-table" data-compact="true">
        <thead>
          <tr>
            <th>Campo requerido</th>
            <th>Valor</th>
            <th>Origen</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.requestedField}>
              <td>{field.requestedField}</td>
              <td>{field.value ?? 'Pendiente'}</td>
              <td>{field.sourceStep ?? 'Sin fuente'}</td>
              <td>{field.status === 'matched' ? 'Autocompletado' : 'Requerido'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BlueprintSection({ pkg, section }: { pkg: InstrumentPackage; section: ReviewTab }) {
  const related = pkg.blocks.find((block) => {
    if (section === 'estructura') return block.id === 'items' || block.id === 'respuestas'
    if (section === 'escalas') return block.id === 'escalas'
    if (section === 'correccion') return block.id === 'calculo'
    if (section === 'baremos') return block.id === 'baremos'
    return false
  })

  return (
    <div className="dt-sources-detail">
      {(related?.notes.length ?? 0) > 0 ? related!.notes.map((note) => <span key={note}>{note}</span>) : null}
      {pkg.findings.length > 0 ? pkg.findings.map((finding) => <span key={finding.id}>{finding.field}: {finding.value}</span>) : null}
      {pkg.consistency.length > 0 ? pkg.consistency.map((row) => <span key={row.field}>{row.field}: {row.detail}</span>) : null}
      {!related && pkg.findings.length === 0 && pkg.consistency.length === 0 ? (
        <span>Sin datos suficientes en el material. Requiere revisión profesional.</span>
      ) : null}
    </div>
  )
}

function TechnicalView({ pkg }: { pkg: InstrumentPackage }) {
  return <pre className="dt-technical-json">{JSON.stringify(pkg, null, 2)}</pre>
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Qué información se obtuvo de cada archivo del paquete. */
function SourcesView({ pkg }: { pkg: InstrumentPackage }) {
  const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')

  return (
    <div className="dt-sources">
      <h4>Fuentes del instrumento</h4>
      {accepted.length === 0 ? (
        <p className="dt-hint">No hay materiales incorporados.</p>
      ) : (
        <ul>
          {accepted.map((file) => {
            const contributed = pkg.findings.filter((finding) =>
              finding.sources.some((source) => source.fileId === file.id),
            )
            return (
              <li key={file.id}>
                <div>
                  <strong>{file.name}</strong>
                  <small>
                    {packageFileRoleLabels[file.role]} - confianza {formatConfidence(file.confidence)}
                  </small>
                </div>
                <div className="dt-sources-detail">
                  {file.evidence.length > 0 ? <span>{file.evidence.join(' - ')}</span> : null}
                  <span>
                    {contributed.length > 0
                      ? `Aporta: ${contributed.map((finding) => finding.field).join(', ')}`
                      : 'Sin datos extraídos todavía.'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Matriz de consistencia: qué dice cada material sobre el mismo dato. Un
 * conflicto entre el manual y la hoja de cálculo es exactamente lo que hay que
 * ver antes de automatizar nada.
 */
function ConsistencyMatrix({ pkg }: { pkg: InstrumentPackage }) {
  return (
    <div className="dt-consistency">
      <h4>Matriz de consistencia</h4>
      <div className="dt-table-wrap dt-scroll">
        <table className="dt-table" data-compact="true">
          <thead>
            <tr>
              <th>Dato</th>
              <th>Lecturas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {pkg.consistency.map((row) => (
              <tr key={row.field}>
                <td>{row.field}</td>
                <td>{row.readings.map((reading) => `${reading.fileName}: ${reading.value}`).join(' - ')}</td>
                <td>
                  <span
                    className="dt-badge"
                    data-tone={row.state === 'CONFLICT' ? 'danger' : row.state === 'MATCH' ? 'success' : 'warning'}
                  >
                    {consistencyLabels[row.state]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pkg.consistency.some((row) => row.state === 'CONFLICT') ? (
        <p className="dt-ai-error">Se detectó una inconsistencia entre los archivos.</p>
      ) : null}
    </div>
  )
}
