/**
 * Las seis familias de partículas del capítulo.
 *
 * Antes existía un único `ParticleLayer` con un solo modelo de movimiento
 * —deriva rígida en Y más giro sobre Y— y las supuestas «familias» se
 * distinguían nada más que por sus números. Visualmente hacían todas lo mismo,
 * que es exactamente el defecto que esta tabla viene a cerrar: cada familia
 * declara ahora su propio comportamiento y el vértice lo resuelve en GPU.
 *
 * `neuralSignal` y `textSignal` no viven aquí porque ya tienen sistema propio
 * —`NeuralSurface` y los conectores de concepto—; se declaran para dejar
 * constancia de su responsabilidad y de que nadie más debe asumirla.
 */
export type ParticleChannel =
  | 'deepSpace'
  | 'atmospheric'
  | 'brainMicro'
  | 'neuralSignal'
  | 'textSignal'
  | 'lens'

export type ParticleBehaviour = {
  /** Modelo de movimiento que ejecuta el shader. */
  mode: 0 | 1 | 2 | 3
  /** Para qué existe esta familia. Si dos comparten propósito, sobra una. */
  purpose: string
  /** Amplitud del movimiento propio, en unidades de mundo. */
  motion: number
  /** Frecuencia del movimiento propio. */
  rate: number
  /** Cuánto la despierta la energía del gesto, de 0 a 1. */
  energyResponse: number
  /** Cuánto la despierta la actividad neuronal, de 0 a 1. */
  neuralResponse: number
}

export const PARTICLE_CHANNELS: Record<ParticleChannel, ParticleBehaviour> = {
  /* Casi inmóviles. Su trabajo es dar escala, no llamar la atención. */
  deepSpace: { mode: 0, purpose: 'distancia', motion: 0.06, rate: 0.05, energyResponse: 0.03, neuralResponse: 0 },
  /* Viento con ruido de baja frecuencia. Nunca una órbita. */
  atmospheric: { mode: 1, purpose: 'aire', motion: 0.5, rate: 0.13, energyResponse: 0.12, neuralResponse: 0 },
  /* Turbulencia tipo curl alrededor del sujeto: vida, no confeti. */
  brainMicro: { mode: 2, purpose: 'vida', motion: 0.16, rate: 0.42, energyResponse: 0.2, neuralResponse: 0.55 },
  /* Las lleva NeuralSurface sobre sus rutas. No las asume nadie más. */
  neuralSignal: { mode: 2, purpose: 'procesamiento', motion: 0, rate: 0, energyResponse: 0.35, neuralResponse: 1 },
  /* Las lleva la materialización del texto: nodo → conector → palabra. */
  textSignal: { mode: 2, purpose: 'información', motion: 0, rate: 0, energyResponse: 0, neuralResponse: 0 },
  /* Primer plano. La única que reacciona con fuerza al gesto. */
  lens: { mode: 3, purpose: 'proximidad', motion: 0.42, rate: 0.6, energyResponse: 0.45, neuralResponse: 0 },
}
