'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

/**
 * Comportamiento de un desplegable de selección única.
 *
 * Vive aparte de la presentación porque la plataforma y el registro tienen
 * paletas distintas pero el mismo comportamiento: teclado, búsqueda por letras,
 * cierre al pulsar fuera y volteo hacia arriba cuando abajo no cabe. Duplicar
 * esa lógica en dos sitios es garantizar que acaben divergiendo.
 *
 * Sigue el patrón «combobox de sólo selección»: el foco no se mueve de la caja
 * y la opción activa se anuncia con `aria-activedescendant`.
 *
 * Devuelve valores, nunca refs ni paquetes de atributos: los nodos los aporta
 * quien renderiza y los `aria-*` se escriben en el JSX, donde se leen y se
 * revisan.
 */

export type SelectEntry = { value: string; label: string }

/** Espacio libre por debajo a partir del cual la lista se despliega hacia arriba. */
const LIST_SPACE = 240
const TYPEAHEAD_RESET = 800

export function useSelectListbox({
  id,
  value,
  onChange,
  options,
  placeholder,
  wrapRef,
  listRef,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder: string
  wrapRef: RefObject<HTMLElement | null>
  listRef: RefObject<HTMLElement | null>
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  // La opción vacía es una más: es la que permite volver a «sin responder».
  const entries = useMemo<SelectEntry[]>(
    () => [{ value: '', label: placeholder }, ...options.map((option) => ({ value: option, label: option }))],
    [options, placeholder],
  )

  const selectedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.value === value),
  )
  const selected = entries[selectedIndex]

  const close = useCallback(() => setOpen(false), [])

  const openList = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) setDropUp(window.innerHeight - rect.bottom < LIST_SPACE && rect.top > LIST_SPACE)
    setActiveIndex(selectedIndex)
    setOpen(true)
  }, [selectedIndex, wrapRef])

  const commit = useCallback(
    (index: number) => {
      onChange(entries[index]?.value ?? '')
      setOpen(false)
    },
    [entries, onChange],
  )

  const toggle = useCallback(() => {
    if (open) close()
    else openList()
  }, [close, open, openList])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, wrapRef])

  // La opción activa tiene que verse: si se llega a ella con el teclado y queda
  // fuera del área visible, la lista la trae.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, listRef])

  const typed = useRef({ text: '', at: 0 })
  const typeahead = useCallback(
    (key: string) => {
      const now = Date.now()
      typed.current = { text: now - typed.current.at > TYPEAHEAD_RESET ? key : typed.current.text + key, at: now }
      const needle = typed.current.text.toLowerCase()
      const found = entries.findIndex((entry) => entry.value && entry.label.toLowerCase().startsWith(needle))
      if (found === -1) return
      if (open) setActiveIndex(found)
      else commit(found)
    },
    [commit, entries, open],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isCharacter = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey

      if (!open) {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          openList()
        } else if (isCharacter) {
          event.preventDefault()
          typeahead(event.key)
        }
        return
      }

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setActiveIndex((index) => Math.min(entries.length - 1, index + 1))
          break
        case 'ArrowUp':
          event.preventDefault()
          setActiveIndex((index) => Math.max(0, index - 1))
          break
        case 'Home':
          event.preventDefault()
          setActiveIndex(0)
          break
        case 'End':
          event.preventDefault()
          setActiveIndex(entries.length - 1)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          commit(activeIndex)
          break
        case 'Escape':
          event.preventDefault()
          close()
          break
        case 'Tab':
          close()
          break
        default:
          if (isCharacter) {
            event.preventDefault()
            typeahead(event.key)
          }
      }
    },
    [activeIndex, close, commit, entries.length, open, openList, typeahead],
  )

  return {
    open,
    dropUp,
    entries,
    activeIndex,
    setActiveIndex,
    selected,
    selectedIndex,
    commit,
    toggle,
    onKeyDown,
    listId: `${id}-list`,
    activeOptionId: open ? `${id}-option-${activeIndex}` : undefined,
    optionId: (index: number) => `${id}-option-${index}`,
  }
}
