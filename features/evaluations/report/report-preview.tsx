'use client'

import type { ReportDocument } from '@/lib/evaluations/report'

/**
 * Vista previa del informe. Recorre el mismo `ReportDocument` que consume el
 * generador de PDF, de modo que lo revisado es exactamente lo que se descarga.
 */
export function ReportPreview({ document }: { document: ReportDocument }) {
  return (
    <article className="dt-report" aria-label="Vista previa del informe psicopedagógico">
      <header className="dt-report-head">
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
                  <p>{block.text}</p>
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
    </article>
  )
}
