'use client'

import Image from 'next/image'
import type { MutableRefObject } from 'react'
import { LOGO_PRINT, type HeroSceneState } from '@/lib/hero/depth'
import { ParticleLogo } from './particle-logo'
import { ParticleText } from './particle-text'

/**
 * Universidad y desarrollo tecnológico.
 *
 * Ya no hay tarjetas. Eran dos paneles con borde, fondo y desenfoque que
 * entraban girando en 3D, y ese giro tenía dos defectos que sólo se ven en
 * movimiento: la perspectiva agrandaba el borde cercano —el escudo llegaba a
 * salirse de su hueco y taparle el titular al panel— y el `overflow: hidden`
 * que el panel necesitaba para su propio barrido de luz recortaba el texto por
 * la izquierda mientras duraba el giro. Sin contenedor no hay borde cercano que
 * agrandar ni caja que recorte: el contenido flota directamente sobre la escena
 * y lo único que llega es la información.
 *
 * Todo lo que se ve aquí se imprime con partículas —las dos marcas y también
 * cada línea de texto—, escalonado en el tiempo desde un único disparo. Es lo
 * que sustituye a la entrada de los paneles: ya no llega un objeto que contiene
 * datos, se materializan los datos.
 */
export function InstitutionalStrip({ sceneState }: { sceneState?: MutableRefObject<HeroSceneState> }) {
  // Disparo y reloj comunes: las nueve piezas se materializan desde el mismo
  // instante y se separan por su retraso propio, no por ventanas distintas.
  const pass = { print: LOGO_PRINT.print, dissolve: LOGO_PRINT.dissolve, signal: sceneState }

  return (
    <section className="institutional-wrap" aria-label="Universidad y desarrollo tecnológico">
      <div className="institutional-grid" aria-hidden="true" />
      <div className="institutional-strip">
        <article className="institutional-card institution-card">
          <ParticleLogo {...pass} className="brand-image crest-image print-host" seed="uteq-crest" budget={2400}>
            <Image src="/detection-home/logos/uteq-crest-official-transparent.png" alt="Escudo de la Universidad Técnica Estatal de Quevedo" width={92} height={118} className="object-contain" />
          </ParticleLogo>
          <div>
            <ParticleText {...pass} as="span" className="eyebrow-small print-host" seed="uteq-eyebrow" lag={0.13} budget={700}>
              Universidad
            </ParticleText>
            <ParticleText {...pass} as="h2" className="print-host" seed="uteq-name" lag={0.17} budget={1500}>
              Universidad Técnica<br />Estatal de Quevedo
            </ParticleText>
            <ParticleText {...pass} as="strong" className="institutional-role print-host" seed="uteq-role" lag={0.21} budget={800}>
              Carrera de Psicopedagogía
            </ParticleText>
            <ParticleText {...pass} as="p" className="print-host" seed="uteq-note" lag={0.25} budget={1200}>
              Formación orientada a las necesidades educativas y al enfoque inclusivo.
            </ParticleText>
          </div>
        </article>

        <div className="institutional-connection" aria-hidden="true">
          <i /><span /><i />
        </div>

        <article className="institutional-card developer-card">
          <div className="developer-content">
            <ParticleText {...pass} as="span" className="eyebrow-small print-host" seed="olbrox-eyebrow" lag={0.13} budget={800}>
              Desarrollo tecnológico
            </ParticleText>
            <h2 className="sr-only">Olbrox Tech</h2>
            <ParticleLogo {...pass} className="brand-image olbrox-image print-host" seed="olbrox-mark" lag={0.08} budget={2200}>
              <Image src="/detection-home/logos/olbrox-tech-white-blue-transparent.png" alt="Olbrox Tech" width={272} height={74} className="object-contain" />
            </ParticleLogo>
            <ParticleText {...pass} as="p" className="print-host" seed="olbrox-note" lag={0.25} budget={1200}>
              Diseño y desarrollo de la plataforma digital.
            </ParticleText>
          </div>
        </article>
      </div>
    </section>
  )
}
