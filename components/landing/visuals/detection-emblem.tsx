import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Emblema oficial de Detection-test.
 *
 * Es el archivo original de la marca, no un redibujo. Antes había aquí un SVG
 * hecho a mano que se parecía al logotipo sin serlo: el cerebro era una silueta
 * simplificada, las circunvoluciones siete trazos sueltos y la red una malla
 * distinta. La versión buena tiene lóbulos con fisuras propias y el hemisferio
 * derecho como contorno triangulado.
 *
 * El PNG sale del original con el papel retirado: en ese arte todo el blanco
 * —incluido el de dentro del hemisferio derecho y el de los huecos de las
 * letras— es fondo, no tinta, así que sobre superficie oscura desaparece. La
 * opacidad se derivó de la distancia al blanco, de modo que el borde suavizado
 * del archivo no deja orla.
 */
export function DetectionEmblem({ className }: { className?: string }) {
  return (
    <Image
      src="/detection-home/logos/detection-test-icon.png"
      alt=""
      width={610}
      height={610}
      preload
      aria-hidden="true"
      className={cn('detection-mark h-9 w-9 object-contain', className)}
    />
  )
}

/**
 * Bloque completo: emblema, marca denominativa y descriptor.
 *
 * Para donde la marca deba presentarse entera —pie, comparticiones— en vez de
 * acompañar a un texto que ya la nombra.
 */
export function DetectionLockup({ className }: { className?: string }) {
  return (
    <Image
      src="/detection-home/logos/detection-test-lockup.png"
      alt="Detection-test · Evaluación, análisis e inclusión"
      width={1027}
      height={855}
      className={cn('detection-mark h-auto w-40 object-contain', className)}
    />
  )
}
