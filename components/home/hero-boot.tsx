'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import * as THREE from 'three'

/**
 * Recursos sin los que el primer fotograma no cuenta una escena.
 *
 * Medido en producción: los siete GLB llegan entre 1722 y 1798 ms —los siete
 * dentro de 80 ms, porque se piden en paralelo—, así que esperar sólo al
 * cerebro y la plataforma no ahorraría tiempo real. Lo que sí llega tarde son
 * las texturas del cielo, y sin ellas el mundo se ve a medio construir.
 *
 * Por eso la lista incluye cielo y luna pero deja fuera los GLB del interior:
 * el capítulo puede empezar sin ellos y llegan de sobra antes de que la cámara
 * entre en el sujeto.
 */
const CRITICAL = [
  'brain-organic-digital.glb',
  'platform-podium.glb',
  'background-mountains-night.png',
  'stars-alpha.png',
  'moon-color.jpg',
]

/** Tope de seguridad: un recurso que nunca llega no puede secuestrar la portada. */
const ESCAPE_HATCH_MS = 9000

/** Duración del fundido de salida; debe coincidir con la del CSS. */
const FADE_MS = 560

/**
 * El emblema real de la marca, no un redibujo.
 *
 * Es el mismo archivo que usa `DetectionEmblem` en el navbar y el pie. Con
 * `images.unoptimized` la ruta servida es idéntica, así que las tres marcas de
 * la página comparten una única descarga, y el `preload` que inserta el
 * emblema del navbar la adelanta a la cabecera del documento: cuando este velo
 * monta, el PNG suele estar ya en camino o en caché.
 */
const MARK = '/detection-home/logos/detection-test-icon.png'

/** La marca denominativa se imprime letra a letra; `test` va en cian, como en el logotipo. */
const BRAND = 'Detection-test'
const ACCENT_AT = BRAND.indexOf('-') + 1

/**
 * Rótulos de fase.
 *
 * No son adorno: se eligen por el progreso real de la descarga, así que el
 * texto que se lee corresponde a lo que está ocurriendo. El último —compilar
 * materiales— es literalmente lo que bloquea el hilo principal durante los dos
 * segundos previos al primer fotograma, y es la fase en la que más tiempo se
 * queda la pantalla.
 */
const PHASES = [
  'Enlazando con el entorno neural',
  'Cargando corteza volumétrica',
  'Tejiendo la red sináptica',
  'Desplegando el cielo nocturno',
  'Compilando materiales de escena',
]
const READY = 'Entorno neural listo'

const phaseFor = (ratio: number) => {
  if (ratio < 0.2) return 0
  if (ratio < 0.45) return 1
  if (ratio < 0.7) return 2
  if (ratio < 0.9) return 3
  return 4
}

/**
 * Suelo estimado del medidor.
 *
 * El progreso medido no se puede mostrar tal cual: los siete GLB se piden en
 * paralelo y llegan todos dentro de la misma ventana de 80 ms, así que la
 * lectura real es 0 durante segundo y medio y después salta a casi el final.
 * Una barra parada un segundo y medio se lee como una página rota, no como una
 * descarga en curso.
 *
 * Esto es una estimación declarada, no una medición: una exponencial ajustada a
 * los tiempos medidos —1722-1798 ms hasta los GLB— que sube deprisa al
 * principio y se frena, sin llegar nunca al 90 %. En cuanto hay lectura real,
 * la real manda, porque siempre es mayor. El 100 % lo pone únicamente la
 * salida de verdad.
 *
 * La fila de testigos de abajo queda fuera de este arreglo: cada uno se
 * enciende sólo cuando ese archivo ha llegado, y ahí no hay estimación ninguna.
 */
const guessFor = (elapsed: number) => 0.9 * (1 - Math.exp(-elapsed / 1600))

/**
 * El medidor se pinta a mano, igual que la retirada.
 *
 * Sube en pasos de medio punto, así que un render de React por paso serían
 * cientos de renders para mover una barra y un número de dos cifras. Escribir
 * la variable CSS y el texto cuesta un recálculo de estilo sobre tres nodos, y
 * deja el render de React para lo que sí cambia poco: el rótulo, los testigos
 * y el desmontaje.
 */
function paint(node: HTMLElement, value: number) {
  node.style.setProperty('--p', value.toFixed(3))
  const pct = node.querySelector('.hero-boot-pct b')
  if (pct) pct.textContent = String(Math.round(value * 100)).padStart(2, '0')
}

/**
 * Aviso de que el telón se abre.
 *
 * La portada se imprime con partículas, y sin esta señal esa impresión ocurría
 * DETRÁS del velo: para cuando la pantalla de carga se retiraba, el titular
 * llevaba ya un segundo montado y el usuario no llegaba a ver nada. Se avisa en
 * el instante en que empieza el fundido y no al terminarlo, porque el arranque
 * de la impresión es lento a propósito —el seguidor tarda unas décimas en
 * mover nada— y así las dos cosas se solapan en vez de encadenarse.
 *
 * La bandera global existe para quien monte después del aviso: un evento que ya
 * pasó no lo escucha nadie.
 */
function openCurtain() {
  const flagged = window as unknown as { __heroCurtain?: boolean }
  if (flagged.__heroCurtain) return
  flagged.__heroCurtain = true
  window.dispatchEvent(new Event('hero:curtain'))
}

export function HeroBoot() {
  /*
    El arnés determinista no debe ver el velo.

    Con `?heroTest=1` la escena congela tiempo y progreso para poder comparar
    fotogramas exactos, y el velo se quedaba encima esperando una señal que en
    ese modo no llega: las capturas salían todas con la pantalla de carga. El
    velo existe para la primera impresión de un usuario real, no para el banco
    de pruebas.
  */
  const [skip, setSkip] = useState(false)
  /** Rótulo en pantalla. Cambia cinco veces en toda la carga, no sesenta por segundo. */
  const [phase, setPhase] = useState(0)
  /** Cuántos recursos críticos han llegado: alimenta la fila de testigos. */
  const [stage, setStage] = useState(0)
  const [done, setDone] = useState(false)
  /** El emblema no se anima hasta tener píxeles: si no, se materializa un hueco. */
  const [lit, setLit] = useState(false)
  const [gone, setGone] = useState(false)
  const veil = useRef<HTMLDivElement>(null)
  const mark = useRef<HTMLImageElement>(null)
  const seen = useRef(new Set<string>())
  /** Lectura medida y último valor pintado: ninguno de los dos pasa por React. */
  const real = useRef(0)
  const shown = useRef(0)
  const painted = useRef(false)
  const left = useRef(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('heroTest') === '1') { setSkip(true); openCurtain(); return }
    const manager = THREE.DefaultLoadingManager
    /*
      Se encadena en lugar de sustituir: drei instala su propio `onProgress`
      para `useProgress`, y pisarlo dejaría su store congelado.
    */
    const previous = manager.onProgress

    /*
      La retirada no pasa por el render de React.

      Medido: la condición de salida se cumplía a los 2500 ms, pero el atributo
      no llegaba al DOM hasta los 4522 ms. No era un fallo de lógica sino el
      hilo principal ocupado dos segundos compilando shaders y subiendo
      geometría a la GPU: React tenía el cambio en cola y no podía pintarlo.

      Marcando el nodo a mano, el fundido arranca en el instante en que se
      decide y lo anima el compositor, que no depende del hilo bloqueado. El
      estado de React va detrás y sólo sirve para desmontar el nodo ya
      invisible. Por la misma razón se cierran a mano el medidor, los testigos
      y el rótulo: son la última imagen que se ve del velo y no pueden quedarse
      a medias esperando un render que llegará dos segundos tarde.
    */
    const settle = () => {
      if (left.current) return
      if (!painted.current) return
      if (!CRITICAL.every((name) => seen.current.has(name))) return
      left.current = true
      openCurtain()
      const node = veil.current
      if (node) {
        node.setAttribute('data-leaving', 'true')
        paint(node, 1)
        const status = node.querySelector('.hero-boot-status')
        if (status) status.textContent = READY
        node.querySelectorAll('.hero-boot-ticks li').forEach((tick) => tick.setAttribute('data-on', ''))
      }
      real.current = 1
      shown.current = 1
      setStage(CRITICAL.length)
      setDone(true)
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.setTimeout(() => setGone(true), reduced ? 0 : FADE_MS)
    }

    manager.onProgress = (url, loaded, total) => {
      previous?.(url, loaded, total)
      const match = CRITICAL.find((name) => url.includes(name))
      if (match) seen.current.add(match)
      /*
        El número que se muestra es el de los recursos críticos, no el del
        gestor entero: si contara todo, la barra avanzaría hasta el 90 % con
        cosas que al usuario no le desbloquean nada y luego se quedaría parada.
      */
      const critical = seen.current.size / CRITICAL.length
      const overall = total > 0 ? loaded / total : 0
      real.current = Math.max(real.current, Math.min(critical * 0.85 + overall * 0.15, 0.99))
      // El gestor avisa por cada archivo; sólo re-renderiza cuando la fila cambia.
      setStage((current) => (current === seen.current.size ? current : seen.current.size))
      settle()
    }

    const onFirstFrame = () => { painted.current = true; settle() }
    window.addEventListener('hero:first-frame', onFirstFrame)
    // Si la escena ya había pintado antes de montar esto, no se pierde el aviso.
    if ((window as unknown as { __heroPainted?: boolean }).__heroPainted) onFirstFrame()

    /* Tope de seguridad: un recurso que nunca llega no puede secuestrar la portada. */
    const escape = window.setTimeout(() => { painted.current = true; CRITICAL.forEach((n) => seen.current.add(n)); settle() }, ESCAPE_HATCH_MS)

    return () => {
      manager.onProgress = previous
      window.removeEventListener('hero:first-frame', onFirstFrame)
      window.clearTimeout(escape)
    }
  }, [])

  /*
    El único bucle por fotograma del velo, y sólo mueve el medidor.

    Ni lee layout ni toca la escena: calcula un número, lo compara con el
    anterior y, si ha cambiado lo bastante, escribe una variable CSS. Mientras el
    hilo principal compila shaders esto se detiene —no puede ser de otra
    manera—, pero para entonces el medidor ya está arriba y lo que mantiene viva
    la pantalla son las animaciones del compositor.
  */
  useEffect(() => {
    if (gone || skip) return
    const started = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      frame = requestAnimationFrame(tick)
      if (left.current) return
      const node = veil.current
      if (!node) return
      const value = Math.min(Math.max(real.current, guessFor(now - started)), 0.99)
      if (value - shown.current < 0.005) return
      shown.current = value
      paint(node, value)
      const next = phaseFor(value)
      setPhase((current) => (current === next ? current : next))
    })
    return () => cancelAnimationFrame(frame)
  }, [gone, skip])

  /*
    Encendido del emblema.

    `onLoad` no se dispara si el PNG ya estaba en caché y llegó completo antes
    de hidratar —el caso de una segunda visita, justo cuando más se nota—, así
    que se comprueba también el estado del elemento. El plazo de gracia cubre el
    caso contrario: si la marca tarda o falla, la secuencia entra igual y no se
    queda una caja vacía en el centro de la pantalla.
  */
  useEffect(() => {
    if (gone || skip || lit) return
    if (mark.current?.complete && mark.current.naturalWidth > 0) { setLit(true); return }
    const grace = window.setTimeout(() => setLit(true), 1500)
    return () => window.clearTimeout(grace)
  }, [gone, skip, lit])

  /*
    Paralaje de puntero.

    Escribe dos variables CSS y nada más: no hay rAF ni lectura de layout, y el
    movimiento lo resuelve el compositor con transiciones. Mientras el hilo
    principal está compilando shaders esto no responde —no puede—, pero en los
    tramos libres da la sensación de que la escena tiene profundidad y espera.
  */
  useEffect(() => {
    if (gone || skip) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    const onMove = (event: PointerEvent) => {
      const node = veil.current
      if (!node) return
      node.style.setProperty('--mx', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3))
      node.style.setProperty('--my', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [gone, skip])

  // Mientras cubre la portada, la página no se mueve bajo el velo.
  useEffect(() => {
    if (gone || skip) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [gone, skip])

  if (gone || skip) return null

  return (
    <div ref={veil} className="hero-boot">
      {/* Fondo: nada de esto informa de nada, sólo impide que la espera sea una pantalla quieta. */}
      <div className="hero-boot-sky" aria-hidden="true">
        <span className="hero-boot-aurora" />
        <span className="hero-boot-floor"><i /></span>
        <span className="hero-boot-scan" />
      </div>

      <div className="hero-boot-stack">
        <div className="hero-boot-core" data-ready={lit ? '' : undefined} aria-hidden="true">
          <span className="hero-boot-ring hero-boot-ring--ticks" />
          <span className="hero-boot-ring hero-boot-ring--comet" />
          {/*
            El arco es el único elemento del velo que dibuja el progreso de
            verdad, y por eso es SVG y no una animación: cambia cuando cambia la
            descarga —cinco o seis veces en toda la carga—, no sesenta veces por
            segundo. Lo demás gira solo, en el compositor, sin depender del hilo.
          */}
          <svg className="hero-boot-arc" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="hero-boot-arc-ink" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0879f9" />
                <stop offset="55%" stopColor="#00d9ff" />
                <stop offset="100%" stopColor="#c8f7ff" />
              </linearGradient>
            </defs>
            <circle className="hero-boot-arc-bed" cx="100" cy="100" r="95" />
            <circle className="hero-boot-arc-live" cx="100" cy="100" r="95" />
          </svg>
          <span className="hero-boot-halo" />
          {/* Copia difusa del propio emblema: el resplandor es la marca, no un círculo cian. */}
          <img className="hero-boot-echo" src={MARK} alt="" aria-hidden="true" />
          <img
            ref={mark}
            className="hero-boot-logo"
            src={MARK}
            alt=""
            width={610}
            height={610}
            fetchPriority="high"
            decoding="async"
            onLoad={() => setLit(true)}
            onError={() => setLit(true)}
          />
          <span className="hero-boot-sat hero-boot-sat--a"><i /></span>
          <span className="hero-boot-sat hero-boot-sat--b"><i /></span>
        </div>

        <div className="hero-boot-word" aria-hidden="true">
          <strong>
            {Array.from(BRAND, (glyph, index) => (
              <span
                key={index}
                className={index >= ACCENT_AT ? 'is-accent' : undefined}
                style={{ '--i': index } as CSSProperties}
              >
                {glyph}
              </span>
            ))}
          </strong>
          <span className="hero-boot-rule" />
          <em>Evaluación · Análisis · Inclusión</em>
        </div>

        {/*
          Única región anunciada: el rótulo de fase cambia cinco veces en toda
          la carga. El porcentaje queda fuera porque cambiaba a cada lectura y
          un lector de pantalla lo recitaba entero una y otra vez.
        */}
        <p className="hero-boot-status" role="status">{done ? READY : PHASES[phase]}</p>

        <div className="hero-boot-meter" aria-hidden="true">
          <div className="hero-boot-track"><i /><b /></div>
          <div className="hero-boot-readout">
            {/* El número lo escribe `paint` desde el bucle; aquí sólo va el reposo. */}
            <span className="hero-boot-pct"><b>00</b>%</span>
            <ul className="hero-boot-ticks">
              {CRITICAL.map((name, index) => (
                <li key={name} data-on={index < stage ? '' : undefined} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
