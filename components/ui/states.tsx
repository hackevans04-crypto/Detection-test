import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Los tres estados que todo componente conectado a datos debe saber pintar.
 * Están aquí juntos para que no exista la tentación de resolver uno con un
 * `null` silencioso o con una tarjeta vacía.
 */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  action?: { label: string; href: string } | ReactNode
}) {
  return (
    <div className="dt-state">
      <span className="dt-state-icon" aria-hidden="true">
        <Icon />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? (
        <div className="dt-state-actions">
          {action && typeof action === 'object' && 'href' in action ? (
            <Link href={action.href} className="dt-btn dt-btn-primary">
              {action.label}
            </Link>
          ) : (
            action
          )}
        </div>
      ) : null}
    </div>
  )
}

export function ErrorState({
  title = 'No pudimos cargar esta información',
  description,
  onRetry,
}: {
  title?: string
  description: string
  onRetry?: () => void
}) {
  return (
    <div className="dt-state" role="alert">
      <span className="dt-state-icon" data-tone="danger" aria-hidden="true">
        <AlertTriangle />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry ? (
        <div className="dt-state-actions">
          <button type="button" className="dt-btn dt-btn-secondary" onClick={onRetry}>
            <RotateCcw aria-hidden="true" />
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`dt-skeleton block ${className ?? ''}`} style={style} aria-hidden="true" />
}

export function LoadingSkeleton({
  rows = 3,
  height = 76,
  label = 'Cargando información',
}: {
  rows?: number
  height?: number
  label?: string
}) {
  return (
    <div className="grid gap-3" role="status" aria-busy="true" aria-live="polite">
      <span className="dt-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} style={{ height }} />
      ))}
    </div>
  )
}
