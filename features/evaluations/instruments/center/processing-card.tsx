'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { packagePipelineLines } from '@/lib/instruments/import/package-pipeline-stages'
import type { PackageStage } from '@/lib/instruments/import/package-model'

export function ProcessingCard({
  reachedStage,
  details,
}: {
  reachedStage: PackageStage | null
  details?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const lines = packagePipelineLines(reachedStage)
  const completed = lines.filter((line) => line.state === 'done').length

  return (
    <section className="dt-processing" aria-labelledby="analizando-instrumento-title" aria-live="polite">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="analizando-instrumento-title">Detection AI está analizando</h3>
            <p>Detection AI analiza y estructura el material.</p>
          </div>
        </div>
        {details ? (
          <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <ChevronDown aria-hidden="true" />
            Ver detalles
          </button>
        ) : null}
      </div>
      <div className="dt-processing-progress" aria-hidden="true">
        <i style={{ inlineSize: `${Math.round((completed / lines.length) * 100)}%` }} />
      </div>
      <ol>
        {lines.map((line, index) => (
          <li key={line.label} data-state={line.state}>
            <span className="dt-processing-mark" aria-hidden="true">{index + 1}</span>
            {line.label}
          </li>
        ))}
      </ol>
      {open && details ? <div className="dt-processing-details">{details}</div> : null}
    </section>
  )
}
