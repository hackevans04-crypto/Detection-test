'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronsLeft, ChevronsRight, ClipboardList, Home, Menu, X } from 'lucide-react'
import { DetectionEmblem } from '@/components/landing/visuals/detection-emblem'
import { useSession } from '@/lib/auth/session-context'
import { can, type PermissionCode } from '@/lib/domain/authorization'

/**
 * Navegación principal.
 *
 * Dos entradas y nada más. Casos, instrumentos, resultados, informes,
 * historial y recursos no son módulos: son etapas dentro de una evaluación, y
 * se alcanzan desde el workspace de la evaluación a la que pertenecen.
 */
const navigation = [
  {
    title: 'Trabajo',
    items: [
      { label: 'Inicio', href: '/dashboard', icon: Home, permission: 'dashboard.read' as PermissionCode },
      {
        label: 'Evaluación Psicopedagógica',
        href: '/evaluaciones',
        icon: ClipboardList,
        permission: 'evaluations.read' as PermissionCode,
      },
    ],
  },
]

const COLLAPSE_KEY = 'detection-test.sidebar.collapsed'

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Brand({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" className="dt-sidebar-brand" aria-label="Detection-test · Inicio" onClick={onNavigate}>
      <DetectionEmblem className="size-10 shrink-0" />
      {!compact ? (
        <span className="min-w-0">
          <strong>
            Detection-<span style={{ color: 'var(--dt-cyan)' }}>test</span>
          </strong>
          <small>Evaluación · Análisis · Inclusión</small>
        </span>
      ) : null}
    </Link>
  )
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { user } = useSession()

  const groups = navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => can(user.role, item.permission)) }))
    .filter((group) => group.items.length > 0)

  return (
    <nav className="dt-sidebar-nav dt-scroll" aria-label="Navegación principal">
      {groups.map((group) => (
        <section key={group.title}>
          <p className="dt-nav-group-title">{group.title}</p>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="dt-nav-item"
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              title={item.label}
              onClick={onNavigate}
            >
              <span className="dt-nav-item-icon" aria-hidden="true">
                <item.icon />
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </section>
      ))}
    </nav>
  )
}

// El botón de menú vive en la barra superior de cada página, que es hija del
// shell: este contexto le presta la única acción que necesita del shell.
const MenuButtonContext = createContext<(() => void) | null>(null)

/**
 * La preferencia de colapso vive en `localStorage`, que es una fuente externa
 * a React. Se lee con `useSyncExternalStore` en vez de con un efecto: el
 * servidor pinta siempre la barra expandida y el cliente corrige en el primer
 * render, sin un paso intermedio de estado.
 */
const collapseListeners = new Set<() => void>()

const collapseStore = {
  subscribe(listener: () => void) {
    window.addEventListener('storage', listener)
    collapseListeners.add(listener)
    return () => {
      window.removeEventListener('storage', listener)
      collapseListeners.delete(listener)
    }
  },
  getSnapshot() {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  },
  getServerSnapshot() {
    return false
  },
  set(next: boolean) {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
    } catch {
      /* La preferencia es un lujo, no un requisito. */
    }
    for (const listener of collapseListeners) listener()
  },
}

export function AppShell({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(
    collapseStore.subscribe,
    collapseStore.getSnapshot,
    collapseStore.getServerSnapshot,
  )
  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggleCollapsed = useCallback(() => {
    collapseStore.set(!collapseStore.getSnapshot())
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <div className="dt-shell" style={{ ['--dt-sidebar-width' as string]: collapsed ? '84px' : '276px' }}>
      <aside className="dt-sidebar" data-collapsed={collapsed}>
        <div className="dt-sidebar-head">
          <Brand compact={collapsed} />
        </div>
        <Navigation />
        <div className="dt-sidebar-foot">
          {/* El colapso es una acción con nombre, no un icono que adivinar. */}
          <button
            type="button"
            className="dt-collapse-button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            <span className="dt-collapse-icon" aria-hidden="true">
              {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            </span>
            {!collapsed ? <span>Colapsar menú</span> : null}
          </button>
        </div>
      </aside>

      {drawerOpen ? (
        <button type="button" className="dt-drawer-backdrop" aria-label="Cerrar menú" onClick={closeDrawer} />
      ) : null}

      <aside className="dt-drawer" data-open={drawerOpen} aria-hidden={!drawerOpen} inert={!drawerOpen || undefined}>
        <div className="dt-sidebar-head">
          <Brand compact={false} onNavigate={closeDrawer} />
          <button type="button" className="dt-drawer-close" onClick={closeDrawer} aria-label="Cerrar menú">
            <X aria-hidden="true" />
          </button>
        </div>
        <Navigation onNavigate={closeDrawer} />
      </aside>

      <div className="dt-main">
        <MenuButtonContext.Provider value={() => setDrawerOpen(true)}>{children}</MenuButtonContext.Provider>
      </div>
    </div>
  )
}

export function useOpenMenu() {
  return useContext(MenuButtonContext)
}

export function MenuButton() {
  const open = useOpenMenu()
  if (!open) return null
  return (
    <button type="button" className="dt-menu-button" onClick={open} aria-label="Abrir menú principal">
      <Menu aria-hidden="true" />
    </button>
  )
}
