'use client'

import { useId, useState } from 'react'
import { Table2, BarChart3, Radar as RadarIcon } from 'lucide-react'
import type { InstrumentProfileChart, ProfileRow } from '@/lib/instruments/charts'
import { bandDistribution, radarEligible } from '@/lib/instruments/charts'

/**
 * Perfil de resultados de un instrumento.
 *
 * Una serie, un color. La barra codifica magnitud -cuánto sobre la escala
 * declarada- y nada más: la banda de desempeño va escrita al lado de cada fila,
 * no en el tono de la barra, para que se lea igual sin distinguir colores y en
 * una fotocopia. La zona de referencia, cuando el baremo la declara, se dibuja
 * detrás en gris: es contexto, no un dato más.
 *
 * Toda fila tiene su cifra a la derecha. Son ocho o diez filas, no una serie
 * densa: aquí la etiqueta directa es lo legible, y evita tener que volver a un
 * eje para leer un número que cabe al lado de la barra.
 */

export function ProfileChart({ chart, title }: { chart: InstrumentProfileChart; title: string }) {
  const [view, setView] = useState<'chart' | 'radar' | 'table'>('chart')
  const headingId = useId()
  const showRadar = radarEligible(chart)

  if (chart.rows.length === 0) {
    return (
      <div className="dt-viz-empty">
        <strong>Sin medidas representables</strong>
        <p>
          {chart.missing > 0
            ? `Faltan ${chart.missing} medidas por registrar.`
            : 'Las medidas registradas no declaran una escala con la que construir el perfil.'}
        </p>
      </div>
    )
  }

  const distribution = bandDistribution(chart.rows)

  return (
    <figure className="dt-viz" aria-labelledby={headingId}>
      <figcaption className="dt-viz-head">
        <h4 id={headingId}>{title}</h4>
        <div className="dt-viz-toggle" role="group" aria-label="Forma de ver los resultados">
          <button
            type="button"
            data-active={view === 'chart'}
            onClick={() => setView('chart')}
            aria-pressed={view === 'chart'}
          >
            <BarChart3 aria-hidden="true" />
            Perfil
          </button>
          {showRadar ? (
            <button
              type="button"
              data-active={view === 'radar'}
              onClick={() => setView('radar')}
              aria-pressed={view === 'radar'}
            >
              <RadarIcon aria-hidden="true" />
              Radar
            </button>
          ) : null}
          <button
            type="button"
            data-active={view === 'table'}
            onClick={() => setView('table')}
            aria-pressed={view === 'table'}
          >
            <Table2 aria-hidden="true" />
            Tabla
          </button>
        </div>
      </figcaption>

      {view === 'chart' ? <ProfileBars chart={chart} /> : null}
      {view === 'radar' && showRadar ? <ProfileRadar rows={chart.rows} /> : null}
      {view === 'table' ? <ProfileTable rows={chart.rows} /> : null}

      <div className="dt-viz-foot">
        <p className="dt-viz-scale">{chart.scaleCaption}</p>
        <ul className="dt-viz-distribution">
          {distribution.map((item) => (
            <li key={item.band}>
              <strong>{item.count}</strong>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        {chart.missing > 0 || chart.withoutScale > 0 ? (
          <p className="dt-viz-notice">
            {chart.missing > 0 ? `${chart.missing} medidas sin registrar. ` : ''}
            {chart.withoutScale > 0
              ? `${chart.withoutScale} medidas registradas sin escala declarada: no se representan.`
              : ''}
          </p>
        ) : null}
      </div>
    </figure>
  )
}

function ProfileBars({ chart }: { chart: InstrumentProfileChart }) {
  const reference = chart.reference
  // La zona de referencia se sitúa sobre la misma escala 0..1 de las barras.
  const referenceMax = reference ? Math.max(...chart.rows.map((row) => row.value / Math.max(row.ratio, 0.0001))) : 0
  const referenceStart = reference && referenceMax > 0 ? reference.min / referenceMax : 0
  const referenceEnd = reference && referenceMax > 0 ? reference.max / referenceMax : 0
  const showReference = Boolean(reference) && referenceEnd > referenceStart && referenceEnd <= 1

  return (
    <div className="dt-viz-plot">
      {showReference && reference ? (
        <p className="dt-viz-reference-note">
          <span className="dt-viz-reference-key" aria-hidden="true" />
          Zona esperada: {reference.label}
        </p>
      ) : null}

      <ol className="dt-viz-rows">
        {chart.rows.map((row) => (
          <li key={row.id}>
            <span className="dt-viz-label" title={row.label}>
              {row.label}
            </span>
            <span className="dt-viz-track">
              {showReference ? (
                <span
                  className="dt-viz-reference"
                  style={{ left: `${referenceStart * 100}%`, width: `${(referenceEnd - referenceStart) * 100}%` }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="dt-viz-bar" style={{ width: `${Math.max(row.ratio * 100, 1.5)}%` }}>
                <span className="sr-only">{row.caption}</span>
              </span>
            </span>
            <span className="dt-viz-value">{row.caption}</span>
            <span className="dt-viz-band">{row.bandLabel}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Perfil en radar: un eje por medida, alrededor de un centro común.
 *
 * Sólo tiene sentido con tres o más medidas comparables entre sí -menos que
 * eso es una línea con pasos extra-, y por eso `ProfileChart` sólo ofrece esta
 * vista cuando `radarEligible` lo confirma. El eje de cada medida usa la misma
 * proporción 0..1 que ya trae `row.ratio`, así que no introduce una escala
 * nueva: es la misma barra, dibujada en círculo.
 */
function ProfileRadar({ rows }: { rows: ProfileRow[] }) {
  const size = 240
  const center = size / 2
  const radius = size / 2 - 34
  const angleFor = (index: number) => (Math.PI * 2 * index) / rows.length - Math.PI / 2
  const pointFor = (index: number, ratio: number) => {
    const angle = angleFor(index)
    const r = radius * Math.max(0.02, Math.min(1, ratio))
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) }
  }

  const dataPoints = rows.map((row, index) => pointFor(index, row.ratio))
  const dataPath = `${dataPoints.map((point) => `${point.x},${point.y}`).join(' ')}`

  return (
    <div className="dt-viz-plot">
      <svg viewBox={`0 0 ${size} ${size}`} className="dt-viz-radar" role="img" aria-label="Perfil en radar">
        {[0.25, 0.5, 0.75, 1].map((step) => (
          <polygon
            key={step}
            points={rows.map((_, index) => {
              const point = pointFor(index, step)
              return `${point.x},${point.y}`
            }).join(' ')}
            className="dt-viz-radar-grid"
          />
        ))}
        {rows.map((_, index) => {
          const outer = pointFor(index, 1)
          return <line key={index} x1={center} y1={center} x2={outer.x} y2={outer.y} className="dt-viz-radar-axis" />
        })}
        <polygon points={dataPath} className="dt-viz-radar-shape" />
        {dataPoints.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r={3.5} className="dt-viz-radar-dot" />
        ))}
        {rows.map((row, index) => {
          const label = pointFor(index, 1.18)
          const anchor = label.x < center - 4 ? 'end' : label.x > center + 4 ? 'start' : 'middle'
          return (
            <text key={row.id} x={label.x} y={label.y} textAnchor={anchor} className="dt-viz-radar-label">
              {row.label.length > 16 ? `${row.label.slice(0, 15)}…` : row.label}
            </text>
          )
        })}
      </svg>
      <ul className="dt-viz-radar-legend">
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.label}</strong>
            <span>
              {row.caption} · {row.bandLabel}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfileTable({ rows }: { rows: ProfileRow[] }) {
  return (
    <div className="dt-table-wrap dt-scroll">
      <table className="dt-table" data-compact="true">
        <thead>
          <tr>
            <th>Medida</th>
            <th>Puntuación</th>
            <th>Nivel</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.label}</td>
              <td>{row.caption}</td>
              <td>{row.bandLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Comparación entre dos aplicaciones del mismo instrumento.
 *
 * La aplicación posterior lleva el color; la anterior queda en gris. Lo que se
 * está mirando es el cambio, y destacar las dos por igual obliga a leer una
 * leyenda para saber cuál es cuál.
 */
export function ComparisonChart({
  title,
  rows,
}: {
  title: string
  rows: Array<{ id: string; label: string; before: number | null; after: number | null; scale: number; unit: string }>
}) {
  const headingId = useId()
  const comparable = rows.filter((row) => row.before !== null && row.after !== null && row.scale > 0)

  if (comparable.length === 0) {
    return (
      <div className="dt-viz-empty">
        <strong>Sin medidas comparables</strong>
        <p>Las dos aplicaciones no comparten medidas registradas con la misma escala.</p>
      </div>
    )
  }

  return (
    <figure className="dt-viz" aria-labelledby={headingId}>
      <figcaption className="dt-viz-head">
        <h4 id={headingId}>{title}</h4>
        <ul className="dt-viz-legend">
          <li>
            <span className="dt-viz-key" data-role="before" aria-hidden="true" />
            Aplicación anterior
          </li>
          <li>
            <span className="dt-viz-key" data-role="after" aria-hidden="true" />
            Aplicación posterior
          </li>
        </ul>
      </figcaption>

      <ol className="dt-viz-rows" data-variant="comparison">
        {comparable.map((row) => {
          const before = Math.max(0, Math.min(1, (row.before as number) / row.scale))
          const after = Math.max(0, Math.min(1, (row.after as number) / row.scale))
          const from = Math.min(before, after)
          const to = Math.max(before, after)

          return (
            <li key={row.id}>
              <span className="dt-viz-label" title={row.label}>
                {row.label}
              </span>
              <span className="dt-viz-track">
                <span
                  className="dt-viz-connector"
                  style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }}
                  aria-hidden="true"
                />
                <span className="dt-viz-dot" data-role="before" style={{ left: `${before * 100}%` }} aria-hidden="true" />
                <span className="dt-viz-dot" data-role="after" style={{ left: `${after * 100}%` }} aria-hidden="true" />
              </span>
              <span className="dt-viz-value">
                {row.before} → {row.after} {row.unit}
              </span>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}
