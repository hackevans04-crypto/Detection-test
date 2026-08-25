import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileClock,
  FileCheck2,
  FileText,
  FolderOpen,
  Gauge,
  GraduationCap,
  Home,
  Inbox,
  LineChart,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Upload,
  UserCog,
  UserRound,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'

export const sidebarGroups = [
  {
    title: 'Principal',
    items: [
      { label: 'Inicio', icon: Home, href: '/dashboard', permission: 'dashboard.read' },
      { label: 'Nueva evaluación', icon: Plus, href: '/nueva-evaluacion', permission: 'evaluations.create' },
      { label: 'Instrumentos', icon: ClipboardList, href: '/instrumentos', permission: 'instruments.read' },
      { label: 'Resultados', icon: Gauge, href: '/resultados', permission: 'evaluations.read' },
      { label: 'Historial', icon: FileCheck2, href: '/historial', permission: 'evaluations.read' },
      { label: 'Informes', icon: FileText, href: '/informes', permission: 'reports.read' },
      { label: 'Recursos / Documentación', icon: BookOpen, href: '/recursos', permission: 'instruments.read' },
      { label: 'Administración', icon: Settings, href: '/admin/instrumentos', permission: 'instruments.read' },
    ],
  },
] as const

export const stats = [
  { title: 'Evaluaciones activas', value: '08', delta: '+2 esta semana', color: 'blue', icon: ClipboardCheck },
  { title: 'Pendientes', value: '05', delta: 'por revisar', color: 'orange', icon: Clock3 },
  { title: 'Completadas', value: '17', delta: '+6 mes', color: 'green', icon: CheckCircle2 },
  { title: 'Sprint actual', value: '01', delta: 'Scrum activo', color: 'violet', icon: BookOpen },
] as const

export const recentEvaluations = [
  ['José Medrano', 'Test ABC · Subtest 5 de 8', 'Continuar ahora', 'En progreso'],
  ['Valentina Ruiz', 'PRO-CALCULO · resultados pendientes', 'Revisar puntuación', 'Pendiente'],
  ['Mateo Sánchez', 'Informe psicopedagógico · borrador', 'Validar informe', 'Borrador IA'],
  ['Camila Torres', 'Caso simulado · revisión docente', 'Solicitar feedback', 'Espera'],
  ['Daniel Álvarez', 'Seguimiento · adaptación curricular', 'Registrar avance', 'Seguimiento'],
] as const

export const activeWork = [
  {
    student: 'José Medrano',
    instrument: 'Test ABC',
    step: 'Aplicación',
    progress: '5/8',
    action: 'Continuar evaluación',
    tone: 'blue',
  },
  {
    student: 'Valentina Ruiz',
    instrument: 'PRO-CÁLCULO',
    step: 'Resultados',
    progress: '9 subtests',
    action: 'Revisar baremo',
    tone: 'green',
  },
  {
    student: 'Mateo Sánchez',
    instrument: 'Informe final',
    step: 'Validación',
    progress: 'Borrador',
    action: 'Abrir informe',
    tone: 'violet',
  },
] as const

export const instrumentQueue = [
  ['Test ABC', 'Madurez para el aprendizaje', '8 subtests configurados', ClipboardList],
  ['PRO-CÁLCULO', 'Procesamiento del número y cálculo', '9 subáreas configuradas', BrainCircuit],
  ['Selección de instrumento', 'Validación pedagógica y justificación', 'Rango de edad y pertinencia', Stethoscope],
  ['Informes', 'PDF, Word y versión final', 'Revisión académica', FileClock],
] as const

export const assessedAreas = [
  ['Selección de instrumentos', '82%', 'bg-blue-600'],
  ['Aplicación', '74%', 'bg-emerald-500'],
  ['Puntuación', '68%', 'bg-violet-600'],
  ['Interpretación', '61%', 'bg-orange-500'],
  ['Informes', '58%', 'bg-cyan-600'],
] as const

export const quickActions = [
  ['Nueva evaluación', FileCheck2, 'blue'],
  ['Crear caso', UsersRound, 'green'],
  ['Ver instrumentos', ClipboardList, 'violet'],
  ['Generar informe', FileText, 'orange'],
  ['Mis resultados', LineChart, 'cyan'],
  ['Subir archivo', Upload, 'rose'],
  ['Calendario', CalendarDays, 'red'],
  ['Mensajería', Sparkles, 'blue'],
] as const

export const processFlow = [
  ['Caso', UsersRound],
  ['Antecedentes', FileText],
  ['Instrumento', ClipboardList],
  ['Aplicación', CheckCircle2],
  ['Resultados', LineChart],
  ['Interpretación', BrainCircuit],
  ['Informe', FileText],
] as const

export const reportSections = [
  ['Datos informativos', 'Identificación, institución, tutor, representante y contacto.'],
  ['Motivo de evaluación', 'Solicitud, conducta observada y necesidad pedagógica.'],
  ['Antecedentes relevantes', 'Contexto familiar, desarrollo, salud y historia escolar.'],
  ['Instrumentos aplicados', 'Test ABC, PRO-CÁLCULO y otros instrumentos autorizados.'],
  ['Resultados', 'Puntuaciones, rangos y observaciones del protocolo.'],
  ['Interpretación', 'Relación entre antecedentes, resultados y aprendizaje.'],
  ['Conclusiones', 'Fortalezas, dificultades y análisis pedagógico.'],
  ['Recomendaciones', 'Docente, familia, apoyo pedagógico y seguimiento.'],
  ['Responsable', 'Autor académico, fecha y versión del informe.'],
] as const

