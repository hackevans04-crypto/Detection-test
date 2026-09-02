'use client'

import { useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Check, ChevronDown } from 'lucide-react'
import { useSelectListbox } from '@/components/ui/use-select-listbox'

/**
 * Campos de formulario accesibles.
 *
 * El `label` siempre es un `<label>` real asociado por `htmlFor`, el error se
 * asocia por `aria-describedby` y se marca con `aria-invalid`: el color no es
 * el único portador del mensaje.
 */

type BaseProps = {
  label: string
  required?: boolean
  error?: string
  /** Aviso que no impide continuar: algo inusual pero admisible. */
  warning?: string
  hint?: string
  className?: string
}

function FieldFrame({
  label,
  required,
  error,
  warning,
  hint,
  className,
  id,
  children,
}: BaseProps & { id: string; children: (describedBy: string | undefined) => ReactNode }) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error || warning ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={`dt-field ${className ?? ''}`}>
      <label className="dt-label" htmlFor={id}>
        {label}
        {required ? (
          <em aria-hidden="true" title="Campo obligatorio">
            *
          </em>
        ) : null}
        {required ? <span className="dt-sr-only">(obligatorio)</span> : null}
      </label>
      {children(describedBy)}
      {hint ? (
        <p className="dt-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
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

export function TextField({
  value,
  onChange,
  type = 'text',
  placeholder,
  readOnly,
  autoComplete,
  inputMode,
  maxLength,
  pattern,
  transformValue,
  ...base
}: BaseProps & {
  value: string
  onChange?: (value: string) => void
  type?: 'text' | 'tel' | 'email' | 'number'
  placeholder?: string
  readOnly?: boolean
  autoComplete?: string
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  maxLength?: number
  pattern?: string
  transformValue?: (value: string) => string
}) {
  const id = useId()
  return (
    <FieldFrame {...base} id={id}>
      {(describedBy) => (
        <input
          id={id}
          className="dt-input"
          type={type}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          pattern={pattern}
          required={base.required}
          aria-invalid={base.error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange?.(transformValue ? transformValue(event.target.value) : event.target.value)}
        />
      )}
    </FieldFrame>
  )
}

export function TextareaField({
  value,
  onChange,
  placeholder,
  rows = 3,
  ...base
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  const id = useId()
  return (
    <FieldFrame {...base} id={id}>
      {(describedBy) => (
        <textarea
          id={id}
          className="dt-textarea"
          value={value}
          rows={rows}
          placeholder={placeholder}
          required={base.required}
          aria-invalid={base.error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FieldFrame>
  )
}

/**
 * Desplegable propio.
 *
 * Un `<select>` nativo abre una lista que pinta el sistema operativo: tipografía,
 * colores y esquinas ajenos a la aplicación, distintos en cada equipo. Aquí la
 * lista es del producto, así que se ve y se comporta igual en todas partes. El
 * comportamiento vive en `useSelectListbox`.
 */
export function SelectField({
  value,
  onChange,
  options,
  placeholder = 'Selecciona una opción',
  ...base
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder?: string
}) {
  const id = useId()
  const labelId = `${id}-label`
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const select = useSelectListbox({ id, value, onChange, options, placeholder, wrapRef, listRef })

  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [base.error ? errorId : null, base.hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className={`dt-field ${base.className ?? ''}`}>
      <label className="dt-label" id={labelId} htmlFor={id}>
        {base.label}
        {base.required ? (
          <em aria-hidden="true" title="Campo obligatorio">
            *
          </em>
        ) : null}
        {base.required ? <span className="dt-sr-only">(obligatorio)</span> : null}
      </label>

      <div className="dt-selectbox" ref={wrapRef}>
        <button
          type="button"
          id={id}
          className="dt-select"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={select.open}
          aria-controls={select.listId}
          aria-activedescendant={select.activeOptionId}
          aria-labelledby={`${labelId} ${id}`}
          aria-required={base.required || undefined}
          aria-invalid={base.error ? true : undefined}
          aria-describedby={describedBy}
          onClick={select.toggle}
          onKeyDown={select.onKeyDown}
        >
          <span className="dt-select-value" data-placeholder={value === ''}>
            {select.selected?.label}
          </span>
          <ChevronDown className="dt-select-caret" aria-hidden="true" />
        </button>

        {select.open ? (
          <ul
            id={select.listId}
            role="listbox"
            ref={listRef}
            className="dt-listbox dt-scroll"
            aria-labelledby={labelId}
            data-drop={select.dropUp ? 'up' : 'down'}
          >
            {select.entries.map((entry, index) => (
              <li
                key={entry.value || 'placeholder'}
                id={select.optionId(index)}
                role="option"
                className="dt-listbox-option"
                data-active={index === select.activeIndex}
                data-placeholder={entry.value === ''}
                aria-selected={index === select.selectedIndex}
                onMouseEnter={() => select.setActiveIndex(index)}
                onClick={() => select.commit(index)}
              >
                <span>{entry.label}</span>
                {index === select.selectedIndex ? <Check aria-hidden="true" /> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {base.hint ? (
        <p className="dt-field-hint" id={hintId}>
          {base.hint}
        </p>
      ) : null}
      {base.error ? (
        <p className="dt-field-error" id={errorId}>
          <AlertCircle aria-hidden="true" />
          {base.error}
        </p>
      ) : base.warning ? (
        <p className="dt-field-warning" id={errorId}>
          <AlertTriangle aria-hidden="true" />
          {base.warning}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Campo de sólo lectura para valores derivados (la edad). Se muestra como
 * campo para que el formulario se lea completo, pero no se puede escribir:
 * la edad la manda la fecha de nacimiento, no el evaluador.
 */
export function DerivedField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const id = useId()
  return (
    <div className="dt-field">
      <label className="dt-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="dt-input" value={value} readOnly tabIndex={-1} aria-readonly="true" />
      {hint ? <p className="dt-field-hint">{hint}</p> : null}
    </div>
  )
}
