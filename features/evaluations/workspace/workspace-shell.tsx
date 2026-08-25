'use client'

import type { ReactNode } from 'react'
import { FileQuestion } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { EmptyState, ErrorState, LoadingSkeleton, Skeleton } from '@/components/ui/states'
import { EvaluationProvider } from '@/features/evaluations/workspace/evaluation-provider'
import { EvaluationWorkspaceLayout } from '@/features/evaluations/workspace/evaluation-workspace'

/**
 * Puente entre el layout de servidor y el proveedor de cliente: aquí viven los
 * tres estados de carga del expediente, que el servidor no puede pasar como
 * funciones.
 */
export function EvaluationWorkspaceShell({
  evaluationId,
  children,
}: {
  evaluationId: string
  children: ReactNode
}) {
  return (
    <EvaluationProvider
      evaluationId={evaluationId}
      renderLoading={() => (
        <>
          <PageHeader title="Cargando evaluación…" />
          <div className="dt-page">
            <Skeleton style={{ height: 116 }} />
            <LoadingSkeleton rows={1} height={420} label="Cargando la evaluación" />
          </div>
        </>
      )}
      renderError={(message, retry) => (
        <>
          <PageHeader title="Evaluación psicopedagógica" />
          <div className="dt-page">
            <div className="dt-card">
              <ErrorState description={message} onRetry={retry} />
            </div>
          </div>
        </>
      )}
      renderMissing={() => (
        <>
          <PageHeader title="Evaluación no encontrada" />
          <div className="dt-page">
            <div className="dt-card">
              <EmptyState
                icon={FileQuestion}
                title="Esta evaluación ya no existe"
                description="Puede que se haya eliminado o que el enlace pertenezca a otro dispositivo."
                action={{ label: 'Ver mis evaluaciones', href: '/evaluaciones' }}
              />
            </div>
          </div>
        </>
      )}
    >
      <EvaluationWorkspaceLayout>{children}</EvaluationWorkspaceLayout>
    </EvaluationProvider>
  )
}
