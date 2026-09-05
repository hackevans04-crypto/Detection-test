'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { FileQuestion } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { EmptyState, ErrorState, LoadingSkeleton, Skeleton } from '@/components/ui/states'
import { EvaluationProvider } from '@/features/evaluations/workspace/evaluation-provider'
import { EvaluationWorkspaceLayout } from '@/features/evaluations/workspace/evaluation-workspace'
import { InstrumentCenterUnavailable } from '@/features/evaluations/instruments/center/instrument-center'

export function EvaluationWorkspaceShell({
  evaluationId,
  children,
}: {
  evaluationId: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const isInstrumentRoute = pathname.endsWith('/instrumentos')

  return (
    <EvaluationProvider
      evaluationId={evaluationId}
      renderLoading={() => (
        <>
          <PageHeader title="Cargando evaluación..." />
          <div className="dt-page">
            <Skeleton style={{ height: 96 }} />
            <LoadingSkeleton rows={1} height={300} label="Cargando la evaluación" />
          </div>
        </>
      )}
      renderError={(message, retry) => (
        <>
          <PageHeader title="Evaluación psicopedagógica" />
          <div className="dt-page">
            {isInstrumentRoute ? (
              <InstrumentCenterUnavailable
                status={message.toLowerCase().includes('red') ? 'NETWORK_ERROR' : 'DATABASE_UNAVAILABLE'}
                onRetry={retry}
              />
            ) : (
              <div className="dt-card">
                <ErrorState description={message} onRetry={retry} />
              </div>
            )}
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
