export type StudentStatus = 'Expediente activo' | 'Evaluacion en curso' | 'Informe pendiente' | 'Seguimiento'

export type StudentRecord = {
  id: string
  firstName: string
  lastName: string
  identification: string
  birthDate: string
  grade: string
  parallel: string
  tutorName: string
  representativeName: string
  representativePhone: string
  representativeEmail: string
  status: StudentStatus
  consent: 'Completo' | 'Pendiente'
  reason: string
  familyContext: string
  healthDevelopment: string
  schoolHistory: string
  previousInterventions: string
  activeEvaluation: string
  nextAction: string
  updatedAt: string
}

export const initialStudents: StudentRecord[] = [
  {
    id: 'stu-josue-martinez',
    firstName: 'Josue',
    lastName: 'Martinez',
    identification: '1550123401',
    birthDate: '2018-05-14',
    grade: '2do EGB',
    parallel: 'A',
    tutorName: 'Lic. Andrea Salazar',
    representativeName: 'Rosa Martinez',
    representativePhone: '099 412 8831',
    representativeEmail: 'rosa.martinez@email.com',
    status: 'Evaluacion en curso',
    consent: 'Completo',
    reason: 'Dificultades en lectura inicial, atencion sostenida y seguimiento de consignas.',
    familyContext: 'Convive con madre, padre y hermana menor. La familia acompana tareas con regularidad.',
    healthDevelopment: 'Sin antecedentes neurologicos reportados. Desarrollo motor dentro de hitos esperados.',
    schoolHistory: 'Asistencia regular. Requiere apoyo en discriminacion fonologica y memoria auditiva.',
    previousInterventions: 'Refuerzo pedagogico dos veces por semana durante el periodo actual.',
    activeEvaluation: 'Test ABC - subtest 5 de 8',
    nextAction: 'Continuar aplicacion',
    updatedAt: '2026-08-20',
  },
  {
    id: 'stu-valentina-ruiz',
    firstName: 'Valentina',
    lastName: 'Ruiz',
    identification: '1550765210',
    birthDate: '2017-09-02',
    grade: '3ro EGB',
    parallel: 'B',
    tutorName: 'Mgs. Carla Proano',
    representativeName: 'Monica Ruiz',
    representativePhone: '098 331 5420',
    representativeEmail: 'monica.ruiz@email.com',
    status: 'Informe pendiente',
    consent: 'Completo',
    reason: 'Solicitud de valoracion por dificultades persistentes en calculo y resolucion de problemas.',
    familyContext: 'Familia nuclear con red de apoyo cercana. Rutinas estables en casa.',
    healthDevelopment: 'No se reportan condiciones medicas actuales. Vision y audicion referidas como normales.',
    schoolHistory: 'Presenta brecha en seriacion, conteo regresivo y automatizacion de hechos numericos.',
    previousInterventions: 'Adaptaciones no significativas en matematica desde el trimestre anterior.',
    activeEvaluation: 'PRO-CALCULO - revision de resultados',
    nextAction: 'Validar baremos disponibles',
    updatedAt: '2026-08-19',
  },
  {
    id: 'stu-mateo-sanchez',
    firstName: 'Mateo',
    lastName: 'Sanchez',
    identification: '1550449202',
    birthDate: '2016-03-28',
    grade: '4to EGB',
    parallel: 'A',
    tutorName: 'Lic. Daniel Mora',
    representativeName: 'Patricia Sanchez',
    representativePhone: '096 204 1190',
    representativeEmail: 'patricia.sanchez@email.com',
    status: 'Seguimiento',
    consent: 'Completo',
    reason: 'Seguimiento posterior a informe psicopedagogico y plan de adaptacion curricular.',
    familyContext: 'Convive con madre y abuelos. Se reporta acompanamiento escolar constante.',
    healthDevelopment: 'Antecedente de terapia de lenguaje finalizada en 2024.',
    schoolHistory: 'Mejora progresiva en comprension lectora con apoyos visuales.',
    previousInterventions: 'Plan de apoyo individual con metas quincenales.',
    activeEvaluation: 'Seguimiento de adaptaciones',
    nextAction: 'Registrar avance',
    updatedAt: '2026-08-18',
  },
]

export const recordSections = [
  ['Datos informativos', 'Identificacion institucional, representante, grado, tutor y contactos.'],
  ['Motivo de evaluacion', 'Solicitud, conducta observada y necesidad educativa reportada.'],
  ['Antecedentes familiares', 'Estructura, dinamica, apoyo en casa y contexto socioeconomico relevante.'],
  ['Desarrollo y salud', 'Antecedentes prenatales, perinatales, posnatales, autonomia y salud actual.'],
  ['Historia escolar', 'Trayectoria, rendimiento, asistencia, apoyos e intervenciones previas.'],
  ['Instrumentos', 'Test ABC, PRO-CALCULO u otros instrumentos autorizados para aplicar.'],
  ['Resultados e informe', 'Puntuaciones, interpretacion profesional, conclusiones y recomendaciones.'],
] as const
