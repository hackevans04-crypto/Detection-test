import { developer } from '@/data/developer'
import { institution } from '@/data/institution'
import Link from 'next/link'
import { DetectionEmblem } from './visuals/detection-emblem'

const footerColumns = [
  {
    title: 'Detection-test',
    links: [
      { label: 'Inicio', href: '#inicio' },
      { label: 'Plataforma', href: '#plataforma' },
      { label: 'Proceso', href: '#proceso' },
      { label: 'Tecnología', href: '#tecnologia' },
    ],
  },
  {
    title: 'Institución',
    links: [
      { label: 'Universidad (UTEQ)', href: '#institucion' },
      { label: 'Trayectoria', href: '#institucion' },
      { label: 'Misión y valores', href: '#institucion' },
    ],
  },
  {
    title: 'Desarrolladores',
    links: [
      { label: 'Olbrox Tech', href: '#desarrolladores' },
      { label: 'Iniciar sesión', href: '/login' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacidad', href: '#' },
      { label: 'Términos', href: '#' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="relative border-t border-border">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <a href="#inicio" className="flex items-center gap-2.5" aria-label="Detection-test, inicio">
              <DetectionEmblem className="h-9 w-9" />
              <span className="flex flex-col leading-none">
                <span className="font-display text-base font-bold tracking-tight text-foreground">
                  Detection-<span className="text-cyan">test</span>
                </span>
                <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Evaluación · Análisis · Inclusión
                </span>
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Un entorno digital para organizar, analizar y acompañar procesos de evaluación
              psicopedagógica.
            </p>
          </div>

          {footerColumns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground">{col.title}</h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-cyan"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-cyan"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-muted-foreground">
            Proyecto desarrollado por{' '}
            <span className="font-medium text-foreground">{developer.name}</span> ·{' '}
            <span className="font-medium text-foreground">{institution.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Detection-test. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
