import Image from 'next/image'

export function InstitutionalStrip() {
  return (
    <section className="institutional-wrap" aria-label="Universidad y desarrollo tecnológico">
      <div className="institutional-grid" aria-hidden="true" />
      <div className="institutional-strip">
        <article className="institutional-card institution-card">
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
          <div className="developer-content">
            <span className="eyebrow-small">Desarrollo tecnológico</span>
            <h2 className="sr-only">Olbrox Tech</h2>
            <div className="brand-image olbrox-image">
              <Image src="/detection-home/logos/olbrox-tech-white-blue-transparent.png" alt="Olbrox Tech" width={230} height={64} className="object-contain" />
            </div>
            <p>Diseño y desarrollo de la plataforma digital.</p>
          </div>
        </article>
      </div>
    </section>
  )
}
