'use client'

import Image from 'next/image'
import type { ReportBlock, ReportDocument } from '@/lib/evaluations/report'

/**
 * Vista previa del informe. Recorre el mismo `ReportDocument` que consume el
 * generador de PDF, de modo que lo revisado es exactamente lo que se descarga.
 */
export function ReportPreview({ document }: { document: ReportDocument }) {
  return (
    <article className="dt-report" aria-label="Vista previa del informe psicopedagógico">
      <header className="dt-report-head">
        <div className="dt-report-letterhead" aria-label="Membrete institucional">
          <div className="dt-report-institution-lockup">
            <div className="dt-report-university-logo">
              <Image src="/detection-home/logos/uteq-crest-official-transparent.png" alt="Escudo de la Universidad Técnica Estatal de Quevedo" width={78} height={98} priority />
            </div>
            <div className="dt-report-institution-copy">
              <span>Institución académica</span>
              <strong>Universidad Técnica Estatal de Quevedo</strong>
              <em>Unidad de Apoyo a la Inclusión</em>
            </div>
          </div>
          <div className="dt-report-tech-lockups">
            <div className="dt-report-logo-col">
              <div className="dt-report-logo-box dt-report-logo-box-lockup">
                <Image src="/detection-home/logos/detection-test-icon.png" alt="" width={52} height={52} aria-hidden="true" />
                <Image src="/detection-home/logos/detection-test-wordmark.png" alt="Detection-test" width={176} height={40} />
              </div>
              <span className="dt-report-logo-caption">Sistema de evaluación</span>
            </div>
          </div>
        </div>
        <p className="dt-report-brand">DETECTION-TEST</p>
        <h2>{document.title}</h2>
        <p className="dt-report-subject">
          {document.subject} · {document.code} · {document.date}
        </p>
      </header>

      <section className="dt-report-summary" aria-label="Resumen del informe">
        {document.summary.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      {document.sections.map((section) => (
        <section key={section.number} id={`informe-seccion-${section.number}`} className="dt-report-section">
          <h3>
            {section.number}. {section.title}
          </h3>
          {section.blocks.map((block, index) => {
            if (block.kind === 'paragraph') {
              return (
                <p key={index} className="dt-report-paragraph">
                  {block.text}
                </p>
              )
            }
            if (block.kind === 'note') {
              return (
                <aside key={index} className="dt-report-note">
                  <strong>{block.title}</strong>
                  {block.items && block.items.length > 0 ? (
                    <ul className="dt-report-note-list">
                      {block.items.map((item, itemIndex) => (
                        <li key={itemIndex}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{block.text}</p>
                  )}
                </aside>
              )
            }
            if (block.kind === 'subheading') {
              return (
                <h4 key={index} className="dt-report-subheading">
                  {block.text}
                </h4>
              )
            }
            if (block.kind === 'pairs') {
              return (
                <dl key={index} className="dt-report-pairs">
                  {block.items.map((item, itemIndex) => (
                    <div key={`${item.label}-${itemIndex}`}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )
            }
            if (block.kind === 'list') {
              return (
                <ul key={index} className="dt-report-list">
                  {block.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )
            }
            if (block.kind === 'chart') {
              const max = block.maxValue ?? Math.max(...block.values.map((item) => item.value), 1)
              if (block.type === 'flow' || block.type === 'gauge' || block.type === 'matrix' || block.type === 'stacked' || block.type === 'percentile') {
                return <ReportClinicalChart key={index} block={block} />
              }
              if (block.type === 'donut') {
                const total = block.values.reduce((sum, item) => sum + item.value, 0)
                const stops = block.values.reduce(
                  (state, item, itemIndex) => {
                    const start = state.cursor
                    const end = start + (item.value / Math.max(total, 1)) * 100
                    const color = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#94a3b8'][itemIndex % 5]
                    state.parts.push(`${color} ${start}% ${end}%`)
                    state.cursor = end
                    return state
                  },
                  { cursor: 0, parts: [] as string[] },
                )
                return (
                  <figure key={index} className="dt-report-chart" data-kind="donut">
                    <figcaption>
                      <strong>{block.title}</strong>
                      <span>
                        {block.unit} - Fuente: {block.source}
                      </span>
                    </figcaption>
                    <div className="dt-report-donut" style={{ background: `conic-gradient(${stops.parts.join(', ')})` }}>
                      <span>{total}</span>
                    </div>
                    <ul className="dt-chart-legend">
                      {block.values.map((item) => (
                        <li key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.caption ?? item.value}</strong>
                        </li>
                      ))}
                    </ul>
                  </figure>
                )
              }
              return (
                <figure key={index} className="dt-report-chart">
                  <figcaption>
                    <strong>{block.title}</strong>
                    <span>
                      {block.unit} - Fuente: {block.source}
                    </span>
                  </figcaption>
                  <div className="dt-report-chart-bars" aria-label={block.title}>
                    {block.values.map((item) => (
                      <div key={item.label} className="dt-report-chart-row">
                        <span>{item.label}</span>
                        <i style={{ width: `${Math.max(6, (item.value / max) * 100)}%` }} />
                        <strong>{item.caption ?? item.value}</strong>
                      </div>
                    ))}
                  </div>
                </figure>
              )
            }
            if (block.kind === 'kpi-grid') {
              const columns = Math.min(4, block.items.length)
              return (
                <dl
                  key={index}
                  className="dt-report-kpi-grid"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {block.items.map((item) => (
                    <div key={item.label} data-tone={item.tone ?? 'neutral'}>
                      <dt>{item.label}</dt>
                      <dd>{item.value}</dd>
                      {item.detail ? <small>{item.detail}</small> : null}
                      {reportKpiProgressFromValue(item.value) !== null ? (
                        <span className="dt-report-kpi-meter" aria-hidden="true">
                          <i style={{ width: `${reportKpiProgressFromValue(item.value)! * 100}%` }} />
                        </span>
                      ) : null}
                    </div>
                  ))}
                </dl>
              )
            }
            return (
              <div key={index} className="dt-table-wrap dt-scroll dt-report-table">
                <table className="dt-table" data-compact="true">
                  <thead>
                    <tr>
                      {block.headers.map((header) => (
                        <th key={header} scope="col">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </section>
      ))}

      <footer className="dt-report-preview-footer" aria-label="Créditos del informe">
        <span>{document.code} · Detection-test</span>
        <span>Desarrollado por Olbrox Tech</span>
      </footer>
    </article>
  )
}

function ReportClinicalChart({ block }: { block: Extract<ReportBlock, { kind: 'chart' }> }) {
  const max = block.maxValue ?? Math.max(...block.values.map((item) => item.value), 1)
  const total = block.values.reduce((sum, item) => sum + item.value, 0)

  return (
    <figure className="dt-report-chart" data-kind={block.type}>
      <figcaption>
        <strong>{block.title}</strong>
        <span>
          {block.unit} - Fuente: {block.source}
        </span>
        {block.insight ? <em>{block.insight}</em> : null}
      </figcaption>

      {block.type === 'gauge' ? (
        <div className="dt-report-chart-bars" aria-label={block.title}>
          {block.values.map((item) => (
            <div key={item.label} className="dt-report-chart-row">
              <span>{item.label}</span>
              <i style={{ width: `${Math.max(6, Math.min(100, (item.value / 100) * 100))}%` }} />
              <strong>{item.caption ?? item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {block.type === 'flow' ? (
        <ol className="dt-flow-steps">
          {block.values.map((item, itemIndex) => (
            <li key={item.label}>
              <span>{String(itemIndex + 1).padStart(2, '0')}</span>
              <strong>{item.caption ?? item.value}</strong>
              <small>{item.label}</small>
            </li>
          ))}
        </ol>
      ) : null}

      {block.type === 'matrix' ? (
        <div className="dt-matrix-grid">
          {block.values.map((item) => (
            <div key={item.label}>
              <strong>{item.caption ?? item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {block.type === 'stacked' ? (
        <>
          <div className="dt-stacked-track" aria-hidden="true">
            {block.values.map((item, itemIndex) => (
              <i
                key={item.label}
                style={{
                  width: `${Math.max(4, (item.value / Math.max(total, 1)) * 100)}%`,
                  background: reportChartColor(itemIndex),
                }}
              />
            ))}
          </div>
          <ul className="dt-chart-legend">
            {block.values.map((item, itemIndex) => (
              <li key={item.label}>
                <span>
                  <i style={{ background: reportChartColor(itemIndex) }} />
                  {item.label}
                </span>
                <strong>{item.caption ?? item.value}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {block.type === 'percentile' ? (
        <>
          <div className="dt-percentile-band" aria-hidden="true">
            <span data-band="low" />
            <span data-band="mid" />
            <span data-band="high" />
            {block.values.map((item, itemIndex) => (
              <i
                key={item.label}
                style={{ left: `${Math.max(0, Math.min(100, item.value))}%`, background: reportChartColor(itemIndex) }}
              />
            ))}
          </div>
          <div className="dt-percentile-scale" aria-hidden="true">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
          <ul className="dt-percentile-list">
            {block.values.map((item, itemIndex) => (
              <li key={item.label}>
                <span>
                  <i style={{ background: reportChartColor(itemIndex) }} />
                  {item.label}
                </span>
                <strong>{item.caption ?? item.value}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {block.type !== 'flow' && block.type !== 'gauge' && block.type !== 'matrix' && block.type !== 'stacked' && block.type !== 'percentile' ? (
        <div className="dt-report-chart-bars" aria-label={block.title}>
          {block.values.map((item, itemIndex) => (
            <div key={item.label} className="dt-report-chart-row">
              <span>{item.label}</span>
              <i style={{ width: `${Math.max(6, (item.value / max) * 100)}%`, background: reportChartColor(itemIndex) }} />
              <strong>{item.caption ?? item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </figure>
  )
}

function reportChartColor(index: number) {
  return ['#2563eb', '#14b8a6', '#f59e0b', '#16a34a', '#dc2626', '#64748b'][index % 6]
}

function reportKpiProgressFromValue(value: string) {
  const percent = value.match(/^(\d+(?:\.\d+)?)%$/)
  if (percent) return Math.max(0, Math.min(1, Number(percent[1]) / 100))
  const ratio = value.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (ratio) {
    const numerator = Number(ratio[1])
    const denominator = Number(ratio[2])
    if (denominator > 0) return Math.max(0, Math.min(1, numerator / denominator))
  }
  return null
}
