'use client'

import { DetectionEmblem } from '@/components/landing/visuals/detection-emblem'
import { sidebarGroups } from '@/data/platform-dashboard'
import { currentSession } from '@/lib/auth/session'
import { can, type PermissionCode } from '@/lib/domain/authorization'
import { ChevronDown, Home } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AppSidebar({ active }: { active?: string }) {
  const pathname = usePathname()
  const visibleSidebarGroups = sidebarGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => can(currentSession.user.role, item.permission as PermissionCode)),
    }))
    .filter((group) => group.items.length > 0)

  const currentActive = active ?? (pathname === '/dashboard' ? 'Inicio' : visibleSidebarGroups.flatMap((group) => group.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? 'Inicio')

  return (
    <aside className="hidden bg-[#061a38] text-white lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <DetectionEmblem className="size-12" />
        <div>
          <h1 className="font-display text-xl font-bold">Detection-test</h1>
          <p className="text-xs leading-5 text-blue-100">Sistema de Evaluación Psicopedagógica Integral</p>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-4 pb-5">
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold ${
            currentActive === 'Inicio' ? 'bg-blue-600 shadow-[0_12px_30px_rgba(37,99,235,.45)]' : 'text-blue-50/90 hover:bg-white/8'
          }`}
        >
          <Home className="size-5" />
          Inicio
        </Link>

        {visibleSidebarGroups.map((group) => (
          <section key={group.title} className="space-y-1">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-blue-200/70">{group.title}</p>
            {group.items.map((item) => {
              const isActive = currentActive === item.label
              const badge = 'badge' in item && typeof item.badge === 'string' ? item.badge : null
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm ${
                    isActive ? 'bg-blue-600 text-white' : 'text-blue-50/90 hover:bg-white/8'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {badge && (
                    <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-bold">{badge}</span>
                  )}
                </Link>
              )
            })}
          </section>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-orange-100 to-rose-200 text-sm font-bold text-slate-900">
            MF
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{currentSession.user.name}</p>
            <p className="text-xs text-blue-100">{currentSession.user.title}</p>
            <p className="mt-1 text-xs text-emerald-300">● En línea</p>
          </div>
          <ChevronDown className="size-4 text-blue-100" />
        </div>
      </div>
    </aside>
  )
}
