'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Evaluation, StepId } from '@/lib/evaluations/model'
import { EvaluationStoreError, getEvaluation, subscribe, updateEvaluation } from '@/lib/evaluations/store'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

type EvaluationContextValue = {
  evaluation: Evaluation
  /** Cambio local inmediato + escritura diferida. */
  update: (mutate: (evaluation: Evaluation) => Evaluation) => void
  /** Escritura explícita. Resuelve cuando el almacén confirma. */
  saveNow: () => Promise<Evaluation | null>
  saveState: SaveState
  saveError: string | null
  lastSavedAt: string | null
  dirty: boolean
  goToStep: (step: StepId) => void
}

const EvaluationContext = createContext<EvaluationContextValue | null>(null)

const AUTOSAVE_DELAY = 900

export function useEvaluation() {
  const value = useContext(EvaluationContext)
  if (!value) throw new Error('useEvaluation debe usarse dentro de EvaluationProvider.')
  return value
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'missing' }
  | { kind: 'ready'; evaluation: Evaluation }

/**
 * Dueño único de la evaluación abierta.
 *
 * Las etapas nunca escriben en el almacén: proponen un cambio con `update`,
 * lo ven reflejado al instante y este proveedor se encarga de persistirlo con
 * rebote. `saveNow` existe porque el autoguardado no puede ser la única vía:
 * al pulsar «Guardar» el profesional espera una confirmación, no una promesa.
 */
export function EvaluationProvider({
  evaluationId,
  children,
  renderLoading,
  renderError,
  renderMissing,
}: {
  evaluationId: string
  children: ReactNode
  renderLoading: () => ReactNode
  renderError: (message: string, retry: () => void) => ReactNode
  renderMissing: () => ReactNode
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // El cambio pendiente se acumula fuera del render: si el profesional escribe
  // rápido sólo se persiste el último estado, no cada pulsación. `latestRef`
  // guarda la versión vigente de forma síncrona; sin ella, un `saveNow`
  // disparado justo después de un cambio leería el expediente anterior, porque
  // React todavía no habría vuelto a renderizar.
  const pendingRef = useRef<Evaluation | null>(null)
  const latestRef = useRef<Evaluation | null>(null)
  const timerRef = useRef<number | null>(null)

  const publish = useCallback((evaluation: Evaluation) => {
    latestRef.current = evaluation
    setState({ kind: 'ready', evaluation })
  }, [])

  // Al cambiar de expediente (o al reintentar) se vuelve a «cargando» durante
  // el render: si se hiciera en el efecto, se pintaría un fotograma con los
  // datos del expediente anterior bajo la cabecera del nuevo.
  const loadKey = `${evaluationId}|${reloadToken}`
  const [lastLoadKey, setLastLoadKey] = useState(loadKey)
  if (loadKey !== lastLoadKey) {
    setLastLoadKey(loadKey)
    setState({ kind: 'loading' })
  }

  useEffect(() => {
    let active = true
    getEvaluation(evaluationId)
      .then((evaluation) => {
        if (!active) return
        if (!evaluation) {
          setState({ kind: 'missing' })
          return
        }
        pendingRef.current = null
        publish(evaluation)
      })
      .catch((error: unknown) => {
        if (!active) return
        setState({
          kind: 'error',
          message:
            error instanceof EvaluationStoreError
              ? error.message
              : 'Ocurrió un problema al leer la evaluación guardada.',
        })
      })
    return () => {
      active = false
    }
  }, [evaluationId, reloadToken, publish])

  // Otra pestaña puede haber avanzado la misma evaluación.
  useEffect(() => {
    return subscribe(() => {
      if (pendingRef.current) return
      getEvaluation(evaluationId)
        .then((evaluation) => {
          if (evaluation) publish(evaluation)
        })
        .catch(() => {
          /* El error de recarga en segundo plano no debe tumbar la pantalla. */
        })
    })
  }, [evaluationId, publish])

  const flush = useCallback(async (): Promise<Evaluation | null> => {
    const pending = pendingRef.current
    if (!pending) return null
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = null
    setSaveState('saving')
    try {
      const saved = await updateEvaluation(pending.id, () => pending)
      // Sólo se adopta el resultado si nadie ha vuelto a escribir mientras
      // tanto; si lo ha hecho, manda lo que el profesional tiene delante.
      if (!pendingRef.current) publish(saved)
      setSaveState('saved')
      setSaveError(null)
      setLastSavedAt(new Date().toISOString())
      return saved
    } catch (error) {
      // El cambio vuelve a la cola: un fallo de escritura no puede significar
      // que lo escrito se pierda.
      pendingRef.current = pendingRef.current ?? pending
      setSaveState('error')
      setSaveError(
        error instanceof EvaluationStoreError ? error.message : 'No se pudo guardar. Vuelve a intentarlo.',
      )
      return null
    }
  }, [publish])

  const update = useCallback(
    (mutate: (evaluation: Evaluation) => Evaluation) => {
      const current = pendingRef.current ?? latestRef.current
      if (!current) return
      const next = mutate(current)
      pendingRef.current = next
      publish(next)
      setSaveState('dirty')
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        void flush()
      }, AUTOSAVE_DELAY)
    },
    [flush, publish],
  )

  // Al salir del workspace se escribe lo que quede pendiente. Sin esto, un
  // cambio hecho en los últimos 900 ms se perdería al cambiar de ruta.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current
      if (!pending) return
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      pendingRef.current = null
      void updateEvaluation(pending.id, () => pending).catch(() => {
        /* Nada que mostrar: la pantalla ya no existe. */
      })
    }
  }, [])

  // Y si lo que se cierra es la pestaña, se avisa antes de perderlo.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!pendingRef.current) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const goToStep = useCallback(
    (step: StepId) => {
      update((evaluation) => ({ ...evaluation, currentStep: step }))
    },
    [update],
  )

  const value = useMemo<EvaluationContextValue | null>(() => {
    if (state.kind !== 'ready') return null
    return {
      evaluation: state.evaluation,
      update,
      saveNow: flush,
      saveState,
      saveError,
      lastSavedAt,
      dirty: saveState === 'dirty' || saveState === 'error',
      goToStep,
    }
  }, [state, update, flush, saveState, saveError, lastSavedAt, goToStep])

  if (state.kind === 'loading') return <>{renderLoading()}</>
  if (state.kind === 'error') return <>{renderError(state.message, () => setReloadToken((token) => token + 1))}</>
  if (state.kind === 'missing') return <>{renderMissing()}</>

  return <EvaluationContext.Provider value={value}>{children}</EvaluationContext.Provider>
}
