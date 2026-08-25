'use client'

import { useState } from 'react'
import { Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { newTextEntry, type TextEntry } from '@/lib/evaluations/model'

/**
 * Lista de entradas de texto independientes.
 *
 * Conclusiones y recomendaciones se guardan una a una, no como un párrafo
 * único: en el informe cada recomendación es un punto con destinatario propio,
 * y poder reordenarlas o borrar una sola es lo que hace útil la pantalla.
 */
export function EntryList({
  entries,
  onChange,
  addLabel,
  placeholder,
  emptyText,
}: {
  entries: TextEntry[]
  onChange: (next: TextEntry[]) => void
  addLabel: string
  placeholder: string
  emptyText: string
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startAdding = () => {
    const entry = newTextEntry()
    onChange([...entries, entry])
    setEditingId(entry.id)
    setDraft('')
  }

  const commit = (id: string) => {
    const text = draft.trim()
    // Una entrada vacía no se queda en la lista ocupando sitio.
    onChange(text ? entries.map((entry) => (entry.id === id ? { ...entry, text } : entry)) : entries.filter((entry) => entry.id !== id))
    setEditingId(null)
    setDraft('')
  }

  const cancel = (id: string) => {
    const entry = entries.find((item) => item.id === id)
    if (entry && !entry.text.trim()) onChange(entries.filter((item) => item.id !== id))
    setEditingId(null)
    setDraft('')
  }

  const remove = (id: string) => onChange(entries.filter((entry) => entry.id !== id))

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="dt-entries">
      {entries.length === 0 ? <p className="dt-entries-empty">{emptyText}</p> : null}

      <ol className="dt-entry-list">
        {entries.map((entry, index) => (
          <li key={entry.id} className="dt-entry">
            {/* El asa señala que la entrada se puede reordenar; quien la mueve
                de verdad son las flechas, que además funcionan con teclado. */}
            <span className="dt-entry-handle" aria-hidden="true">
              <GripVertical />
            </span>
            <span className="dt-entry-number" aria-hidden="true">
              {index + 1}
            </span>

            {editingId === entry.id ? (
              <div className="dt-entry-editor">
                <textarea
                  className="dt-textarea"
                  value={draft}
                  rows={3}
                  autoFocus
                  placeholder={placeholder}
                  aria-label={placeholder}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') cancel(entry.id)
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commit(entry.id)
                  }}
                />
                <div className="dt-entry-editor-actions">
                  <button type="button" className="dt-btn dt-btn-primary dt-btn-sm" onClick={() => commit(entry.id)}>
                    <Check aria-hidden="true" />
                    Guardar
                  </button>
                  <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" onClick={() => cancel(entry.id)}>
                    <X aria-hidden="true" />
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="dt-entry-text">{entry.text}</p>
                <div className="dt-entry-actions">
                  <button
                    type="button"
                    className="dt-entry-action"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Subir la entrada ${index + 1}`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="dt-entry-action"
                    onClick={() => move(index, 1)}
                    disabled={index === entries.length - 1}
                    aria-label={`Bajar la entrada ${index + 1}`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="dt-entry-action"
                    onClick={() => {
                      setEditingId(entry.id)
                      setDraft(entry.text)
                    }}
                    aria-label={`Editar la entrada ${index + 1}`}
                  >
                    <Pencil aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="dt-entry-action"
                    data-danger="true"
                    onClick={() => remove(entry.id)}
                    aria-label={`Eliminar la entrada ${index + 1}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>

      <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={startAdding}>
        <Plus aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  )
}
