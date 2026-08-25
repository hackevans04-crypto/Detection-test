'use client'

/**
 * Logos del informe, preparados para el PDF.
 *
 * El generador de PDF no sabe de PNG: los logos son PNG con transparencia y
 * meterlos tal cual exigiría descomprimirlos y separar el canal alfa a mano.
 * Aquí se dibujan sobre blanco en un lienzo y salen como JPEG, que el PDF sabe
 * incrustar directamente con `DCTDecode`.
 *
 * Cada logo se carga por separado y falla por separado: que falte un fichero
 * nunca puede impedir emitir un informe.
 */

export type ReportImage = { width: number; height: number; bytes: Uint8Array }

export type ReportAssets = {
  /** Marca del sistema. */
  system?: ReportImage
  /** Escudo de la universidad. */
  university?: ReportImage
  /** Marca de quien desarrolla el sistema. */
  developer?: ReportImage
}

/** Ancho máximo al que se rasteriza: más resolución no se aprecia impreso. */
const MAX_EDGE = 420
const JPEG_QUALITY = 0.9

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`No se pudo cargar ${src}`))
    image.src = src
  })
}

async function rasterize(src: string): Promise<ReportImage | undefined> {
  try {
    const image = await loadImage(src)
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return undefined

    // El JPEG no tiene transparencia: sin este relleno, lo transparente saldría
    // negro sobre el papel.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob) return undefined

    return { width, height, bytes: new Uint8Array(await blob.arrayBuffer()) }
  } catch {
    return undefined
  }
}

const SOURCES = {
  system: '/detection-home/logos/detection-test-lockup.png',
  university: '/detection-home/logos/uteq-crest-official-transparent.png',
  developer: '/detection-home/logos/olbrox-tech-official-transparent.png',
} as const

export async function loadReportAssets(): Promise<ReportAssets> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return {}

  const [system, university, developer] = await Promise.all([
    rasterize(SOURCES.system),
    rasterize(SOURCES.university),
    rasterize(SOURCES.developer),
  ])

  return { system, university, developer }
}
