'use client'

import { cn } from '@/lib/utils'
import { sectionIndex } from '@/data/landing-content'
import { useActiveSection } from '@/hooks/use-active-section'

/** Right-side storytelling indicator. Desktop only. */
export function SectionProgress() {
  const active = useActiveSection(sectionIndex.map((s) => s.id))
  const current = sectionIndex.find((s) => s.id === active) ?? sectionIndex[0]

  return (
    <nav
      aria-label="Progreso de secciones"
      className="fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-4 lg:flex"
    >
      <div className="flex flex-col items-center gap-3">
        {sectionIndex.map((s) => {
          const isActive = s.id === active
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-label={`Ir a ${s.label}`}
              aria-current={isActive ? 'true' : undefined}
              className="group relative flex h-3 w-3 items-center justify-center"
            >
              <span
                className={cn(
                  'block rounded-full transition-all duration-300',
                  isActive
                    ? 'h-3 w-3 bg-cyan shadow-[0_0_12px_2px_rgba(9,198,217,0.7)]'
                    : 'h-2 w-2 bg-muted-foreground/40 group-hover:bg-cyan/70',
                )}
              />
            </a>
          )
        })}
      </div>
      <div className="mt-2 text-right leading-tight">
        <div className="font-display text-lg font-semibold text-cyan">{current.num}</div>
        <div className="text-xs font-medium text-muted-foreground">{current.label}</div>
      </div>
    </nav>
  )
}
