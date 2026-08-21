import { Accessibility, ClipboardCheck, HandHeart, ScanSearch } from 'lucide-react'

const pillars = [
  { icon: ClipboardCheck, title: 'Evaluación', copy: 'Organización de procesos' },
  { icon: ScanSearch, title: 'Análisis', copy: 'Información estructurada' },
  { icon: HandHeart, title: 'Acompañamiento', copy: 'Apoyo al profesional' },
  { icon: Accessibility, title: 'Inclusión', copy: 'Tecnología aplicada a educación' },
]

export function MetricsPanel() {
  return (
    <section className="metrics-panel project-pillars" aria-label="Pilares de Detection-test">
      <span className="pillars-sweep" aria-hidden="true" />
      {pillars.map((pillar) => (
        <article className="metric pillar-card" key={pillar.title}>
          <span className="metric-icon"><pillar.icon aria-hidden="true" /></span>
          <span className="metric-copy">
            <strong>{pillar.title}</strong>
            <small>{pillar.copy}</small>
          </span>
        </article>
      ))}
    </section>
  )
}
