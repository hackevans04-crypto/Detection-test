import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Heart,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Star,
  Target,
  UserCheck,
} from 'lucide-react'

/**
 * Universidad Técnica Estatal de Quevedo (UTEQ) — institución.
 *
 * IMPORTANTE: solo se muestran datos verificables.
 * - Los "facts" numéricos (estudiantes, docentes, facultades, convenios, etc.)
 *   NO se incluyen hasta ser confirmados oficialmente. Añádelos a `verifiedFacts`
 *   y se renderizarán automáticamente.
 * - Reemplaza `campusImage` por la fotografía real del Rectorado / campus de la UTEQ.
 */

export const institution = {
  name: 'Universidad Técnica Estatal de Quevedo',
  shortName: 'UTEQ',
  crest: '/images/uteq-crest.jpeg',
  // Sin fotografía real del campus todavía. Apuntar a un archivo inexistente
  // costaba un 404 en cada carga; `null` entra directamente en el respaldo, que
  // ya muestra el escudo institucional real. Poner aquí la ruta cuando exista.
  campusImage: null as string | null,
  campusImageAlt:
    'Edificio del Rectorado de la Universidad Técnica Estatal de Quevedo',
  role: 'Institución',
  foundedYear: '1984',
  location: 'Quevedo, Los Ríos · Ecuador',
  description:
    'La Universidad Técnica Estatal de Quevedo forma profesionales íntegros, competentes y comprometidos con el desarrollo sostenible de la sociedad, a través de una educación innovadora, inclusiva y de calidad.',
}

type Badge = { icon: LucideIcon; label: string }

export const institutionBadges: Badge[] = [
  { icon: MapPin, label: 'Quevedo, Los Ríos · Ecuador' },
  { icon: BookOpen, label: 'Desde 1984' },
  { icon: ShieldCheck, label: 'Universidad pública' },
]

/**
 * Datos numéricos verificables. Vacío por defecto para NO inventar cifras.
 * Ejemplo de entrada (solo cuando esté confirmado):
 *   { value: '5', label: 'Facultades', hint: 'Amplia oferta académica' }
 */
export const verifiedFacts: { value: string; label: string; hint?: string }[] = []

export const trajectory = {
  title: 'Nuestra trayectoria',
  body: 'Desde 1984, la UTEQ se ha consolidado como un referente de educación superior pública, inclusiva y de calidad en la región y el país.',
  cta: 'Conoce nuestra historia',
}

export const mission = {
  title: 'Nuestra misión',
  body: 'Formar profesionales competentes con responsabilidad social, capaces de contribuir al desarrollo sostenible de la sociedad, a través de la generación y aplicación del conocimiento, la investigación y la innovación.',
  cta: 'Ver misión y visión',
  icon: Target,
}

export const values: { icon: LucideIcon; label: string }[] = [
  { icon: ShieldCheck, label: 'Integridad' },
  { icon: UserCheck, label: 'Responsabilidad' },
  { icon: Star, label: 'Excelencia' },
  { icon: Lightbulb, label: 'Innovación' },
  { icon: Heart, label: 'Solidaridad' },
]
