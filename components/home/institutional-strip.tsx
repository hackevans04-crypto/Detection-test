import Image from 'next/image'

/**
 * Universidad y desarrollo tecnológico.
 *
 * Ya no es una franja: son dos paneles que flotan por separado y se conectan
 * con una línea de datos. La coreografía de `home-hero` los trae desde la
 * profundidad, cada uno por su lado y girado, así que necesitan ser piezas
 * independientes con su propio fondo —dentro de una sola caja con borde, el
 * giro de cada mitad rompía el marco común.
 */
export function InstitutionalStrip() {
  return (
    <section className="institutional-wrap" aria-label="Universidad y desarrollo tecnológico">
      <div className="institutional-grid" aria-hidden="true" />
      <div className="institutional-strip">
        <article className="institutional-card institution-card">
          {/* Barrido de luz que recorre el panel una vez montado. */}
          <span className="institutional-sweep" aria-hidden="true" />
          <div className="brand-image crest-image">
            <Image src="/detection-home/logos/uteq-crest-official-transparent.png" alt="Escudo de la Universidad Técnica Estatal de Quevedo" width={92} height={118} className="object-contain" />
          </div>
          <div>
            <span className="eyebrow-small">Universidad</span>
            <h2>Universidad Técnica<br />Estatal de Quevedo</h2>
            <strong className="institutional-role">Carrera de Psicopedagogía</strong>
            <p>Formación orientada a las necesidades educativas y al enfoque inclusivo.</p>
          </div>
        </article>

        <div className="institutional-connection" aria-hidden="true">
          <i /><span /><i />
        </div>

        <article className="institutional-card developer-card">
          <span className="institutional-sweep" aria-hidden="true" />
          <div className="developer-content">
            <span className="eyebrow-small">Desarrollo tecnológico</span>
            <h2 className="sr-only">Olbrox Tech</h2>
            <div className="brand-image olbrox-image">
              <Image src="/detection-home/logos/olbrox-tech-white-blue-transparent.png" alt="Olbrox Tech" width={272} height={74} className="object-contain" />
            </div>
            <p>Diseño y desarrollo de la plataforma digital.</p>
          </div>
        </article>
      </div>
    </section>
  )
}
