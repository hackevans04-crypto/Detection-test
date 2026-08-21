import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Cloud,
  ClipboardCheck,
  Cpu,
  FileText,
  FolderOpen,
  Gauge,
  Layers,
  LineChart,
  Lock,
  Network,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react'

export const navLinks = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'plataforma', label: 'Plataforma' },
  { id: 'proceso', label: 'Proceso' },
  { id: 'tecnologia', label: 'Tecnología' },
  { id: 'institucion', label: 'Institución' },
  { id: 'recursos', label: 'Recursos' },
] as const

export const sectionIndex = [
  { id: 'inicio', num: '01', label: 'Inicio' },
  { id: 'plataforma', num: '02', label: 'Plataforma' },
  { id: 'proceso', num: '03', label: 'Proceso' },
  { id: 'tecnologia', num: '04', label: 'Tecnología' },
  { id: 'institucion', num: '05', label: 'Institución' },
  { id: 'recursos', num: '06', label: 'Recursos' },
] as const

type Feature = { icon: LucideIcon; title: string; description: string }

export const heroHighlights: Feature[] = [
  {
    icon: ClipboardCheck,
    title: 'Evaluación estructurada',
    description: 'Organiza cada etapa del proceso en un solo lugar.',
  },
  {
    icon: BarChart3,
    title: 'Análisis con claridad',
    description: 'Resultados presentados para apoyar la interpretación.',
  },
  {
    icon: Users,
    title: 'Enfoque inclusivo',
    description: 'Pensado para acompañar mejor a cada persona.',
  },
]

// Platform ecosystem modules — conceptual capabilities, not an internal dashboard.
export const platformModules: Feature[] = [
  {
    icon: ClipboardCheck,
    title: 'Evaluaciones',
    description: 'Crea, aplica y gestiona evaluaciones psicopedagógicas.',
  },
  {
    icon: Users,
    title: 'Evaluados',
    description: 'Administra la información de las personas evaluadas.',
  },
  {
    icon: LineChart,
    title: 'Análisis',
    description: 'Analiza resultados con visualizaciones claras.',
  },
  {
    icon: FileText,
    title: 'Informes',
    description: 'Genera informes profesionales de forma ágil.',
  },
  {
    icon: FolderOpen,
    title: 'Recursos',
    description: 'Accede a materiales y guías especializadas.',
  },
  {
    icon: Settings,
    title: 'Configuración',
    description: 'Personaliza la plataforma según tu práctica.',
  },
]

export const platformBenefits: Feature[] = [
  {
    icon: Layers,
    title: 'Centralización total',
    description: 'Toda la información en un solo lugar, sin duplicados.',
  },
  {
    icon: Sparkles,
    title: 'Fácil de usar',
    description: 'Interfaz intuitiva para enfocarte en lo importante.',
  },
  {
    icon: Cloud,
    title: 'Acceso desde la nube',
    description: 'Disponible en cualquier dispositivo, en cualquier momento.',
  },
  {
    icon: Gauge,
    title: 'Rendimiento optimizado',
    description: 'Tecnología moderna, estable y escalable.',
  },
]

export const processSteps = [
  {
    num: '01',
    title: 'Planificación',
    description: 'Se define el objetivo y el alcance de la evaluación.',
    icon: Workflow,
  },
  {
    num: '02',
    title: 'Aplicación',
    description: 'Se aplican los instrumentos de forma organizada.',
    icon: ClipboardCheck,
  },
  {
    num: '03',
    title: 'Análisis',
    description: 'Los datos se procesan y se presentan con claridad.',
    icon: LineChart,
  },
  {
    num: '04',
    title: 'Informe',
    description: 'Se estructura la información en un informe legible.',
    icon: FileText,
  },
  {
    num: '05',
    title: 'Decisión',
    description: 'La interpretación y la decisión son del especialista.',
    icon: Sparkles,
  },
  {
    num: '06',
    title: 'Seguimiento',
    description: 'Se acompaña la evolución a lo largo del tiempo.',
    icon: Activity,
  },
]

export const processAdvantages = [
  'Estructurado',
  'Confiable',
  'Eficiente',
  'Colaborativo',
  'Adaptativo',
]

export const technologyPillars: Feature[] = [
  {
    icon: Cpu,
    title: 'Procesamiento y análisis',
    description: 'Herramientas para ordenar y analizar la información.',
  },
  {
    icon: ShieldCheck,
    title: 'Protección de información',
    description: 'Buenas prácticas de seguridad para los datos.',
  },
  {
    icon: Network,
    title: 'Infraestructura escalable',
    description: 'Una base preparada para crecer con el uso.',
  },
  {
    icon: BarChart3,
    title: 'Análisis y visualización',
    description: 'Resultados presentados de forma comprensible.',
  },
]

export const technologySecondary: Feature[] = [
  { icon: Layers, title: 'Datos', description: 'Información organizada y accesible.' },
  { icon: BarChart3, title: 'Dashboards', description: 'Vistas claras de los resultados.' },
  { icon: Activity, title: 'Notificaciones', description: 'Avisos oportunos del proceso.' },
  { icon: Network, title: 'Integración', description: 'Un ecosistema conectado.' },
  { icon: RefreshCw, title: 'Actualización continua', description: 'Mejoras constantes.' },
  { icon: Lock, title: 'Seguridad', description: 'Acceso controlado y protegido.' },
]
