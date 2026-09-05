'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { useSession } from '@/lib/auth/session-context'
import { sessionLogLabels, type EvaluationInstrument } from '@/lib/evaluations/model'
import { formatUpdatedAt } from '@/lib/evaluations/format'
import { REGISTRATION_MISSING, registrationLine, professionalSnapshot } from '@/lib/evaluations/professional'
import { updateEntry } from '@/lib/instruments/battery'
import {
  approveInstrumentReport,
  buildInstrumentReport,
  generateInstrumentReport,
  reopenInstrumentReport,
} from '@/lib/instruments/instrument-report'
import {
  convergenceLabels,
  evidenceDirectionLabels,
  evidenceLevelLabels,
} from '@/lib/instruments/evidence-matrix'
import { buildSynthesisMaterial } from '@/lib/instruments/synthesis'
import { ProfileChart } from '@/features/evaluations/instruments/profile-chart'

/**
 * Informe del instrumento y síntesis integral. Dos niveles que no se mezclan:
 * el informe del instrumento contiene sólo su propia evidencia; la síntesis
 * cruza el expediente entero y alimenta el informe general del paso 9.
 * `instrument-detail.tsx` renderiza `InstrumentReport` para el instrumento
 * seleccionado; `instrument-center.tsx` renderiza `Synthesis` una sola vez,
 * al final, cuando hay más de un instrumento procesado.
 *
 * Ningún documento se da por definitivo antes de aprobarse, y al aprobarlo se
 * guarda con qué credenciales se firmó.
 */
export function InstrumentReport({ entry }: { entry: EvaluationInstrument }) {
  const { evaluation, update } = useEvaluation()
  const { user } = useSession()

  const report = useMemo(
    () => buildInstrumentReport(evaluation, entry, evaluation.instrumentBlueprints, user),
    [evaluation, entry, user],
  )

  const change = (fn: (current: EvaluationInstrument) => EvaluationInstrument) =>
    update((current) => ({ ...current, battery: updateEntry(current.battery, entry.id, fn) }))

  const registration = registrationLine(professionalSnapshot(user))
  const canApprove = report.blockers.length === 0

  return (
    <>
      <section className="dt-ai-section" aria-labelledby="informe-title">
        <div className="dt-ai-section-head">
          <div>
            <div>
              <h3 id="informe-title">{report.title}</h3>
              <p>Contiene únicamente la evidencia de este instrumento.</p>
            </div>
          </div>
          <span
            className="dt-badge"
            data-tone={entry.report.status === 'APPROVED' ? 'success' : entry.report.status === 'NOT_READY' ? 'neutral' : 'warning'}
          >
            {entry.report.status === 'APPROVED'
              ? 'Aprobado'
              : entry.report.status === 'IN_REVIEW'
                ? 'En revisión'
                : entry.report.status === 'DRAFT'
                  ? 'Borrador'
                  : 'Sin generar'}
          </span>
        </div>

        {report.blockers.length > 0 ? (
          <div className="dt-ai-required">
            <strong>Pendiente para poder aprobar</strong>
            <ul>
              {report.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="dt-ai-actions">
          {entry.report.status === 'NOT_READY' ? (
            <button
              type="button"
              className="dt-btn dt-btn-primary dt-btn-sm"
              onClick={() => change(generateInstrumentReport)}
            >
              Generar vista previa
            </button>
          ) : null}
          {entry.report.status !== 'APPROVED' && entry.report.status !== 'NOT_READY' ? (
            <button
              type="button"
              className="dt-btn dt-btn-primary dt-btn-sm"
              disabled={!canApprove}
              onClick={() => change((current) => approveInstrumentReport(current, user))}
            >
              <Check aria-hidden="true" />
              Aprobar informe
            </button>
          ) : null}
          {entry.report.status === 'APPROVED' ? (
            <button
              type="button"
              className="dt-btn dt-btn-secondary dt-btn-sm"
              onClick={() => change(reopenInstrumentReport)}
            >
              Volver a revisión
            </button>
          ) : null}
        </div>
      </section>

      {entry.report.status !== 'NOT_READY' ? (
        <article className="dt-report">
          <h4>Identificación</h4>
          <dl className="dt-report-grid">
            {report.identification.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>

          <h4>Objetivo</h4>
          <p>{report.objective}</p>

          <h4>Condiciones de aplicación</h4>
          <ul>
            {report.conditions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h4>Resultados</h4>
          <div className="dt-table-wrap dt-scroll">
            <table className="dt-table" data-compact="true">
              <thead>
                <tr>
                  <th>Medida</th>
                  <th>Subtest</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {report.scores.map((score, index) => (
                  <tr key={`${score.label}-${index}`}>
                    <td>{score.label}</td>
                    <td>{score.group ?? '—'}</td>
                    <td>{score.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h4>Perfil</h4>
          <ProfileChart chart={report.profile} title={`Perfil · ${entry.name}`} />

          {report.sections.map((section) => (
            <div key={section.id}>
              <h4>{section.title}</h4>
              {section.body.map((paragraph) => (
                <p key={paragraph} data-pending={section.pending}>
                  {paragraph}
                </p>
              ))}
            </div>
          ))}

          <h4>Observaciones</h4>
          {report.observations.length === 0 ? (
            <p>Sin observaciones registradas.</p>
          ) : (
            <ul>
              {report.observations.map((item, index) => (
                <li key={`${item.at}-${index}`}>
                  {formatUpdatedAt(item.at)} · {sessionLogLabels[item.kind as keyof typeof sessionLogLabels]}: {item.note}
                </li>
              ))}
            </ul>
          )}

          <h4>Orientaciones</h4>
          {report.orientations.length === 0 ? (
            <p>Sin orientaciones aceptadas.</p>
          ) : (
            <ul>
              {report.orientations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          <h4>Limitaciones</h4>
          <ul>
            {report.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h4>Respaldos referenciados</h4>
          {report.backups.length === 0 ? (
            <p>Sin respaldos adjuntos.</p>
          ) : (
            <ul>
              {report.backups.map((backup) => (
                <li key={backup.id}>
                  {backup.label}: {backup.name}
                </li>
              ))}
            </ul>
          )}

          <h4>Validación profesional</h4>
          {report.signature ? (
            <p>
              {report.signature.name}
              {report.signature.title ? ` · ${report.signature.title}` : ''}
              <br />
              {report.signature.registration}
              {report.signature.approvedAt ? <> · Aprobado el {formatUpdatedAt(report.signature.approvedAt)}</> : null}
            </p>
          ) : (
            <p>
              {user.name}
              {user.title ? ` · ${user.title}` : ''}
              <br />
              {registration}
              {registration === REGISTRATION_MISSING ? (
                <>
                  {' '}
                  <span className="dt-hint">Configúralo en el perfil profesional antes de aprobar.</span>
                </>
              ) : null}
            </p>
          )}
        </article>
      ) : null}
    </>
  )
}

/** Síntesis integral: matriz de evidencia del caso y material del informe general. */
export function Synthesis() {
  const { evaluation } = useEvaluation()
  const material = useMemo(
    () => buildSynthesisMaterial(evaluation, evaluation.instrumentBlueprints),
    [evaluation],
  )
  const [openRow, setOpenRow] = useState<string | null>(null)
  const hasEvidence = material.matrix.some((row) => row.sources.length > 0)

  return (
    <>
      {hasEvidence ? (
      <section className="dt-ai-section" aria-labelledby="matriz-title">
        <div className="dt-ai-section-head">
          <div>
            <div>
              <h3 id="matriz-title">Matriz general de evidencia</h3>
              <p>Qué sostiene cada hallazgo y con cuántas fuentes.</p>
            </div>
          </div>
        </div>

        <div className="dt-table-wrap dt-scroll">
          <table className="dt-table" data-compact="true">
            <thead>
              <tr>
                <th>Área</th>
                <th>Fuentes</th>
                <th>Hallazgo</th>
                <th>Nivel de evidencia</th>
                <th>Convergencia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {material.matrix.map((row) => (
                <tr key={row.areaId}>
                  <td>{row.area}</td>
                  <td>{row.sources.length}</td>
                  <td>{row.summary}</td>
                  <td>{evidenceLevelLabels[row.level]}</td>
                  <td>
                    <span
                      className="dt-badge"
                      data-tone={
                        row.convergence === 'DIVERGENT'
                          ? 'danger'
                          : row.convergence === 'CONVERGENT'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {convergenceLabels[row.convergence]}
                    </span>
                  </td>
                  <td>
                    {row.sources.length > 0 ? (
                      <button
                        type="button"
                        className="dt-btn dt-btn-ghost dt-btn-sm"
                        onClick={() => setOpenRow((value) => (value === row.areaId ? null : row.areaId))}
                      >
                        Ver respaldo
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {openRow ? (
          <div className="dt-ai-explain">
            <strong>Evidencia asociada</strong>
            {material.matrix
              .find((row) => row.areaId === openRow)
              ?.sources.map((source) => (
                <span key={source.id}>
                  {source.label} · {evidenceDirectionLabels[source.direction]} ·{' '}
                  {evidenceLevelLabels[source.level]}: {source.finding}
                </span>
              ))}
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="dt-ai-section" aria-labelledby="sintesis-title">
        <div className="dt-ai-section-head">
          <div>
            <div>
              <h3 id="sintesis-title">Síntesis integral de la evaluación</h3>
              <p>Material verificado del expediente. La redacción y la aprobación son profesionales.</p>
            </div>
          </div>
        </div>

        {material.gaps.length > 0 ? (
          <div className="dt-ai-required">
            <strong>Sintesis pendiente</strong>
            <p>Se generara automaticamente cuando existan resultados validados y evidencia suficiente.</p>
            <ul>
              {material.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {material.gaps.length === 0 ? (
        <div className="dt-synthesis">
          {material.sections.map((section) => (
            <article key={section.id}>
              <h4>
                {section.title}
                {section.needsNarrative ? (
                  <span className="dt-badge" data-tone="neutral">
                    Borrador asistido
                  </span>
                ) : null}
              </h4>
              {section.facts.length === 0 ? (
                <p className="dt-hint">Sin material registrado para esta sección.</p>
              ) : (
                <ul>
                  {section.facts.map((fact, index) => (
                    <li key={`${section.id}-${index}`}>{fact}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
        ) : null}

        {material.highlights.discrepancies.length > 0 ? (
          <p className="dt-ai-error">
            <AlertTriangle aria-hidden="true" /> {material.highlights.discrepancies.length} áreas con discrepancia entre
            fuentes: revísalas antes de concluir.
          </p>
        ) : null}
      </section>
    </>
  )
}
