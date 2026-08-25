'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { initialsOf, useSession } from '@/lib/auth/session-context'

/**
 * Ficha del profesional en la barra superior.
 *
 * Aparece una sola vez en toda la aplicación. Estuvo al pie del sidebar hasta
 * que la referencia visual la situó aquí: quien usa la plataforma busca su
 * cuenta arriba a la derecha, no abajo a la izquierda.
 */
export function UserMenu() {
  const { user, institution } = useSession()
  const [open, setOpen] = useState(false)
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

  const initials = initialsOf(user.name)

  return (
    <div className="dt-user-menu" ref={wrapRef}>
      <button
        type="button"
        className="dt-user-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="dt-avatar" data-size="md" aria-hidden="true">
          {initials || <UserRound className="size-4" />}
        </span>
        <span className="dt-user-trigger-body">
          <strong>{user.name}</strong>
          <small>{user.title}</small>
        </span>
        <ChevronDown className="dt-user-caret" aria-hidden="true" />
      </button>

      {open ? (
        <div className="dt-user-popover" role="menu" aria-label="Cuenta">
          <p className="dt-user-popover-head">
            <strong>{user.name}</strong>
            {user.email ? <span>{user.email}</span> : null}
            {institution.name ? <span>{institution.name}</span> : null}
          </p>
          <Link href="/login" className="dt-user-popover-item" role="menuitem" onClick={() => setOpen(false)}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </Link>
        </div>
      ) : null}
    </div>
  )
}
