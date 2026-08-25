'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Selector de fecha en español.
 *
 * Se mantiene un calendario propio en lugar de `input[type=date]` porque las
 * fechas de nacimiento están años atrás y el control nativo obliga a recorrer
 * mes a mes; aquí se salta directamente a año y mes. El valor viaja siempre
 * como ISO `AAAA-MM-DD` y se muestra como `DD/MM/AAAA`.
 */

const monthNames = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

const weekDays = ['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO']

function isoParts(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? { year, month: month - 1, day } : null
}

export function formatDisplayDate(value: string) {
  const parts = isoParts(value)
  return parts ? `${String(parts.day).padStart(2, '0')}/${String(parts.month + 1).padStart(2, '0')}/${parts.year}` : ''
}

function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function DateField({
  label,
  value,
  onChange,
  required,
  error,
  warning,
  hint,
  maxYear = new Date().getFullYear(),
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  error?: string
  warning?: string
  hint?: string
  maxYear?: number
}) {
  const id = useId()
  const errorId = `${id}-error`
  const today = new Date()
  const selected = isoParts(value)
  const [open, setOpen] = useState(false)
  const [picker, setPicker] = useState<'days' | 'months' | 'years'>('days')
  const [view, setView] = useState({ year: selected?.year ?? today.getFullYear(), month: selected?.month ?? today.getMonth() })
  const [yearPage, setYearPage] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Cuando el valor cambia desde fuera, el calendario se reencuadra en el mes
  // correspondiente. Se ajusta durante el render en lugar de con un efecto
  // para no pintar un fotograma con el mes anterior.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    const parts = isoParts(value)
    if (parts) setView({ year: parts.year, month: parts.month })
  }

  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const leadingBlanks = (new Date(view.year, view.month, 1).getDay() + 6) % 7
  const cells = Array.from({ length: leadingBlanks + daysInMonth }, (_, index) =>
    index < leadingBlanks ? null : index - leadingBlanks + 1,
  )

  const shiftMonth = (amount: number) => {
    const next = new Date(view.year, view.month + amount, 1)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }

  const commit = (year: number, month: number, day: number) => {
    onChange(toIso(year, month, day))
    setOpen(false)
    setPicker('days')
  }

  const yearsStart = maxYear - 11 + yearPage * 12

  return (
    <div className="dt-field">
      <label className="dt-label" htmlFor={id}>
        {label}
        {required ? (
          <em aria-hidden="true" title="Campo obligatorio">
            *
          </em>
        ) : null}
        {required ? <span className="dt-sr-only">(obligatorio)</span> : null}
      </label>
      <div className="dt-datefield" ref={wrapRef}>
        <input
          id={id}
          className="dt-input"
          value={formatDisplayDate(value)}
          placeholder="DD/MM/AAAA"
          readOnly
          role="combobox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          aria-haspopup="dialog"
          aria-controls={open ? `${id}-calendar` : undefined}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setOpen(true)
            }
          }}
        />
        <button
          type="button"
          className="dt-datefield-trigger"
          onClick={() => setOpen((current) => !current)}
          aria-label={`${open ? 'Cerrar' : 'Abrir'} calendario de ${label.toLowerCase()}`}
        >
          <CalendarDays aria-hidden="true" />
        </button>

        {open ? (
          <div id={`${id}-calendar`} className="dt-calendar" role="dialog" aria-label={`Calendario de ${label.toLowerCase()}`}>
            <div className="dt-calendar-head">
              <div className="dt-calendar-selectors">
                <button
                  type="button"
                  data-active={picker === 'months'}
                  onClick={() => setPicker(picker === 'months' ? 'days' : 'months')}
                >
                  {monthNames[view.month]}
                </button>
                <button
                  type="button"
                  data-active={picker === 'years'}
                  onClick={() => {
                    setYearPage(0)
                    setPicker(picker === 'years' ? 'days' : 'years')
                  }}
                >
                  {view.year}
                </button>
              </div>
              <div className="dt-calendar-arrows">
                <button
                  type="button"
                  onClick={() => (picker === 'years' ? setYearPage((page) => page - 1) : shiftMonth(-1))}
                  aria-label={picker === 'years' ? 'Años anteriores' : 'Mes anterior'}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => (picker === 'years' ? setYearPage((page) => page + 1) : shiftMonth(1))}
                  aria-label={picker === 'years' ? 'Años siguientes' : 'Mes siguiente'}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            </div>

            {picker === 'days' ? (
              <>
                <div className="dt-calendar-week" aria-hidden="true">
                  {weekDays.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>
                <div className="dt-calendar-grid">
                  {cells.map((day, index) =>
                    day ? (
                      <button
                        key={day}
                        type="button"
                        data-selected={
                          selected?.year === view.year && selected.month === view.month && selected.day === day
                        }
                        onClick={() => commit(view.year, view.month, day)}
                      >
                        {day}
                      </button>
                    ) : (
                      <span key={`blank-${index}`} aria-hidden="true" />
                    ),
                  )}
                </div>
              </>
            ) : null}

            {picker === 'months' ? (
              <div className="dt-calendar-choices">
                {monthNames.map((month, index) => (
                  <button
                    key={month}
                    type="button"
                    data-selected={view.month === index}
                    onClick={() => {
                      setView({ ...view, month: index })
                      setPicker('days')
                    }}
                  >
                    {month.slice(0, 3)}
                  </button>
                ))}
              </div>
            ) : null}

            {picker === 'years' ? (
              <div className="dt-calendar-choices">
                {Array.from({ length: 12 }, (_, index) => yearsStart + index).map((year) => (
                  <button
                    key={year}
                    type="button"
                    data-selected={view.year === year}
                    onClick={() => {
                      setView({ ...view, year })
                      setPicker('days')
                    }}
                  >
                    {year}
                  </button>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              className="dt-calendar-today"
              onClick={() => commit(today.getFullYear(), today.getMonth(), today.getDate())}
            >
              Hoy
            </button>
          </div>
        ) : null}
      </div>
      {hint ? <p className="dt-field-hint">{hint}</p> : null}
      {error ? (
        <p className="dt-field-error" id={errorId}>
          <AlertCircle aria-hidden="true" />
          {error}
        </p>
      ) : warning ? (
        <p className="dt-field-warning" id={errorId}>
          <AlertTriangle aria-hidden="true" />
          {warning}
        </p>
      ) : null}
    </div>
  )
}
