'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

export type ServiceStatus = 'DATABASE_UNAVAILABLE' | 'NETWORK_ERROR' | 'SERVER_ERROR'

export function ServiceStatusBanner({
  status,
  onRetry,
}: {
  status: ServiceStatus
  onRetry?: () => void
}) {
  return (
    <section className="dt-service-banner" data-status={status} aria-live="polite">
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>No se pudo sincronizar con el servidor.</strong>
        <p>Algunas funciones de guardado no están disponibles temporalmente.</p>
      </div>
      {onRetry ? (
        <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Reintentar
        </button>
      ) : null}
    </section>
  )
}
