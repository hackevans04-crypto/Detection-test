'use client'

import { AppSidebar } from '@/components/platform/app-sidebar'
import { InstrumentsLibrary } from '@/features/instruments/instrument-library'

export function InstrumentsModule() {
  return (
    <main className="min-h-svh bg-slate-50 text-slate-950">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[280px_1fr]">
        <AppSidebar active="Instrumentos" />
        <InstrumentsLibrary />
      </div>
    </main>
  )
}
