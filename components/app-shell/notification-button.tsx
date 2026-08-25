'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, CalendarClock, FileCheck2 } from 'lucide-react'
import { useSession } from '@/lib/auth/session-context'
import type { Evaluation } from '@/lib/evaluations/model'
import { resumeStep } from '@/lib/evaluations/progress'
import { listEvaluations, subscribe } from '@/lib/evaluations/store'

const STALE_DAYS = 7

type Alert = {
  id: string
  icon: typeof FileCheck2
  tone: 'success' | 'warning'
  title: string
  detail: string
  href: string
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/**
 * Las alertas se derivan del estado real de las evaluaciones, no de una lista
 * de avisos guardada aparte: una evaluación lista para informe y otra parada
 * más de una semana son las dos cosas que de verdad reclaman atención.
 */
function buildAlerts(evaluations: Evaluation[]): Alert[] {
  const alerts: Alert[] = []

  for (const evaluation of evaluations) {
    const name = evaluation.initialData.person.fullName || 'Evaluación sin nombre'
    if (evaluation.status === 'READY_FOR_REVIEW') {
      alerts.push({
        id: `${evaluation.id}-ready`,
        icon: FileCheck2,
        tone: 'success',
        title: `${name} está lista para informe`,
        detail: 'Todas las etapas de contenido están completas.',
        href: `/evaluaciones/${evaluation.id}/informe`,
      })
    } else if (evaluation.status !== 'COMPLETED' && daysSince(evaluation.updatedAt) >= STALE_DAYS) {
      alerts.push({
        id: `${evaluation.id}-stale`,
        icon: CalendarClock,
        tone: 'warning',
        title: `${name} sin avances`,
        detail: `Sin cambios desde hace ${daysSince(evaluation.updatedAt)} días.`,
        href: `/evaluaciones/${evaluation.id}/${resumeStep(evaluation)}`,
      })
    }
  }

  return alerts
}

export function NotificationButton() {
  const { user } = useSession()
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    const load = () => {
      listEvaluations(user.id)
        .then((evaluations) => {
          if (active) setAlerts(buildAlerts(evaluations))
        })
        .catch(() => {
          if (active) setAlerts([])
        })
    }
    load()
    const unsubscribe = subscribe(load)
    return () => {
      active = false
      unsubscribe()
    }
  }, [user.id])

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

  const count = alerts?.length ?? 0

  return (
    <div className="dt-notify" ref={wrapRef}>
      <button
        type="button"
        className="dt-icon-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={count > 0 ? `Avisos: ${count} pendientes` : 'Avisos: ninguno pendiente'}
      >
        <Bell aria-hidden="true" />
        {count > 0 ? (
          <span className="dt-icon-button-count" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="dt-notify-panel" role="dialog" aria-label="Avisos">
          <p className="dt-notify-head">
            Avisos
            {count > 0 ? <span className="dt-tab-count">{count}</span> : null}
          </p>
          {alerts === null ? (
            <p className="dt-notify-empty">Cargando…</p>
          ) : alerts.length === 0 ? (
            <p className="dt-notify-empty">
              <BellOff aria-hidden="true" />
              No hay nada pendiente de tu atención.
            </p>
          ) : (
            <ul className="dt-notify-list">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link href={alert.href} onClick={() => setOpen(false)}>
                    <span className="dt-notify-icon" data-tone={alert.tone} aria-hidden="true">
                      <alert.icon />
                    </span>
                    <span>
                      <strong>{alert.title}</strong>
                      <small>{alert.detail}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
