import type { LucideIcon } from 'lucide-react'
import {
  Code2,
  Headphones,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

/**
 * Olbrox Tech — empresa desarrolladora de Detection-test.
 * No se incluyen cifras (años, proyectos, equipo, clientes) hasta ser verificadas.
 */
export const developer = {
  name: 'Olbrox Tech',
  logo: '/images/olbrox-logo.jpeg',
  role: 'Desarrolladora',
  headline: 'Desarrollado con propósito. Impulsado por innovación.',
  description:
    'Olbrox Tech es la empresa desarrolladora de Detection-test, responsable del diseño y desarrollo tecnológico de la plataforma.',
}

export const developerStrengths: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Code2,
    title: 'Desarrollo a medida',
    description: 'Soluciones construidas según necesidades reales.',
  },
  {
    icon: Lightbulb,
    title: 'Innovación',
    description: 'Tecnología aplicada con criterio y propósito.',
  },
  {
    icon: Sparkles,
    title: 'Calidad',
    description: 'Atención al detalle en cada entrega.',
  },
  {
    icon: ShieldCheck,
    title: 'Seguridad',
    description: 'Buenas prácticas en el manejo de la información.',
  },
  {
    icon: Headphones,
    title: 'Soporte técnico',
    description: 'Acompañamiento cercano y confiable.',
  },
  {
    icon: RefreshCw,
    title: 'Evolución continua',
    description: 'Mejora constante del producto.',
  },
]
