'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, Save } from 'lucide-react'
import { stepIds, type StepId } from '@/lib/evaluations/model'
import { useEvaluation, type SaveState } from '@/features/evaluations/workspace/evaluation-provider'

function relativeSeconds(iso: string | null) {
  if (!iso) return null
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
}

export function AutosaveIndicator({ state, lastSavedAt, error }: { state: SaveState; lastSavedAt: string | null; error: string | null }) {
  // El «hace X segundos» tiene que envejecer solo; si no, miente. El contador
  // se deriva en el render y el intervalo sólo empuja un tick, así no hay
  // estado duplicado que sincronizar.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!lastSavedAt) return
    const timer = window.setInterval(() => tick((value) => value + 1), 15_000)
    return () => window.clearInterval(timer)
  }, [lastSavedAt])

  const seconds = relativeSeconds(lastSavedAt)

  if (state === 'saving') {
    return (
      <span className="dt-autosave" data-state="saving" role="status">
        <Loader2 className="dt-spin" aria-hidden="true" />
        Guardando…
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className="dt-autosave" data-state="error" role="alert">
        <AlertCircle aria-hidden="true" />
        {error ?? 'Error al guardar'}
      </span>
    )
  }

  if (state === 'dirty') {
    return (
      <span className="dt-autosave" role="status">
        <Save aria-hidden="true" />
        Cambios sin guardar
      </span>
    )
  }

  if (state === 'saved' && seconds !== null) {
    return (
      <span className="dt-autosave" data-state="saved" role="status">
        <Check aria-hidden="true" />
        {seconds < 20 ? 'Guardado automáticamente' : `Guardado automáticamente hace ${formatSeconds(seconds)}`}
      </span>
    )
  }

  return <span className="dt-autosave">&nbsp;</span>
}

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds} segundos`
  const minutes = Math.round(seconds / 60)
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
}

/**
 * Pie común de las etapas. Guarda siempre antes de navegar: el autoguardado
 * acompaña, pero la transición de etapa es un punto de control explícito.
 */
export function StepFooter({
  step,
  nextLabel = 'Guardar y continuar',
  onBeforeNext,
  disableNext,
  extraActions,
}: {
  step: StepId
  nextLabel?: string
  /** Devolver `false` cancela la navegación (validación de la etapa). */
  onBeforeNext?: () => boolean
  disableNext?: boolean
  extraActions?: React.ReactNode
}) {
  const router = useRouter()
  const { evaluation, saveNow, saveState, saveError, lastSavedAt, goToStep } = useEvaluation()
  const [busy, setBusy] = useState<'save' | 'next' | null>(null)

  const index = stepIds.indexOf(step)
  const previous = index > 0 ? stepIds[index - 1] : null
  const next = index < stepIds.length - 1 ? stepIds[index + 1] : null

  const navigate = async (target: StepId) => {
    setBusy('next')
    goToStep(target)
    await saveNow()
    setBusy(null)
    router.push(`/evaluaciones/${evaluation.id}/${target}`)
  }

  return (
    <div className="dt-step-footer">
      <div className="flex items-center gap-3">
        {previous ? (
          <button
            type="button"
            className="dt-btn dt-btn-secondary"
            onClick={() => void navigate(previous)}
            disabled={busy !== null}
          >
            <ArrowLeft aria-hidden="true" />
            Anterior
          </button>
        ) : (
          <span />
        )}
        <AutosaveIndicator state={saveState} lastSavedAt={lastSavedAt} error={saveError} />
      </div>

      <div className="dt-step-footer-actions">
        {extraActions}
        <button
          type="button"
          className="dt-btn dt-btn-secondary"
          onClick={async () => {
            setBusy('save')
            await saveNow()
            setBusy(null)
          }}
          disabled={busy !== null}
        >
          {busy === 'save' ? <Loader2 className="dt-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          Guardar
        </button>
        {next ? (
          <button
            type="button"
            className="dt-btn dt-btn-primary"
            disabled={disableNext || busy !== null}
            onClick={() => {
              if (onBeforeNext && onBeforeNext() === false) return
              void navigate(next)
            }}
          >
            {nextLabel}
            <ArrowRight aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
