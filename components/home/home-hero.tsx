'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { PHASE, chapterLength, createHeroSceneState, type HeroSceneState } from '@/lib/hero/depth'
import { readTestMode } from '@/lib/hero/stage'
import { HeroScene } from './hero-scene'
import { InstitutionalStrip } from './institutional-strip'

const CHAPTER_LABEL = 'Inteligencia aplicada'

/** Progresos con captura obligatoria. El panel salta exactamente a estos. */
const CHECKPOINTS = [0, 0.08, 0.15, 0.22, 0.3, 0.36, 0.43, 0.48, 0.54, 0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.95, 1]
const COPY_ENTER_START = 0.035
const COPY_ENTER_END = 0.17
const COPY_EXIT_START = 0.21
const COPY_EXIT_END = 0.235

function HeroDebug({ sceneState }: { sceneState: MutableRefObject<HeroSceneState> }) {
  const [visible, setVisible] = useState(false)
  const [snapshot, setSnapshot] = useState({ scene: createHeroSceneState(), fps: 0 })

  useEffect(() => {
    const active = new URLSearchParams(window.location.search).get('heroDebug') === '1'
    setVisible(active)
    if (!active) return

    let frames = 0
    let last = performance.now()
    let fps = 0
    let raf = 0
    const frame = () => {
      frames += 1
      const now = performance.now()
      if (now - last > 500) {
        fps = Math.round((frames * 1000) / (now - last))
        frames = 0
        last = now
        setSnapshot({ scene: { ...sceneState.current }, fps })
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [sceneState])

  if (!visible) return null
  const scene = snapshot.scene
  const p = scene.progress
  const phase = p < PHASE.AWAKENING ? 'Aproximación'
    : p < PHASE.UNLOCK ? 'Despertar'
      : p < PHASE.DISASSEMBLY ? 'Desbloqueo'
        : p < PHASE.ENTRY ? 'Desensamble'
          : p < PHASE.INNER_FLIGHT ? 'Entrada'
            : p < PHASE.INFORMATION ? 'Vuelo interior'
              : p < PHASE.REASSEMBLY ? 'Información'
                : p < PHASE.INSTITUTION ? 'Reensamble'
                  : p < PHASE.PLATFORM_EXIT ? 'Institución'
                    : 'Salida por plataforma'
  const xyz = (value: [number, number, number]) => value.map((part) => part.toFixed(2)).join(' ')

  return (
    <output className="hero-debug">
      <b>Inicio · {phase}</b>
      <span>progress {p.toFixed(3)}{scene.forcedProgress !== null ? ' (forzado)' : ''}</span>
      <span>shot {scene.director.shot} · toma {(scene.director.shotProgress * 100).toFixed(0)} %</span>
      <span>camera {xyz(scene.cameraPosition)} · fov {scene.cameraFov.toFixed(1)}</span>
      <span>lookAt {xyz(scene.lookAt)}</span>
      <span>brain pos {xyz(scene.brainPosition)}</span>
      <span>brain rot {xyz(scene.brainRotation)}</span>
      <span>bounds {xyz(scene.brainBounds)} · R {scene.brainRadius.toFixed(3)}</span>
      <span>scale {scene.brainScale.toFixed(3)} · α {scene.brainOpacity.toFixed(2)}</span>
      <span>
        dist {scene.cameraDistanceR.toFixed(2)} R · alto {(scene.brainScreenHeight * 100).toFixed(0)} %
      </span>
      <span>platform {xyz(scene.platformPosition)}</span>
      <span>GLB {scene.activeGlb}</span>
      <span>fog α {scene.fogOpacity.toFixed(2)} · luz {scene.lightLevel.toFixed(2)}</span>
      <span>partículas {scene.particleCount} · hotspot {scene.activeHotspot}</span>
      <span>FPS {snapshot.fps} · calls {scene.drawCalls} · tris {scene.triangles.toLocaleString()}</span>
      <span>tier {scene.quality} · DPR {scene.dpr.toFixed(2)}</span>
      <nav className="hero-debug-jumps">
        {CHECKPOINTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              // Fijar el progreso desactiva el scroll: el panel debe poder
              // reproducir un fotograma exacto para compararlo.
              sceneState.current.forcedProgress = value
              sceneState.current.progress = value
            }}
          >
            {Math.round(value * 100)}%
          </button>
        ))}
        <button type="button" onClick={() => { sceneState.current.forcedProgress = null }}>scroll</button>
      </nav>
    </output>
  )
}

export function HomeHero() {
  const wrapper = useRef<HTMLElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const sceneState = useRef(createHeroSceneState())

  useEffect(() => {
    const root = viewport.current
    const shell = wrapper.current
    if (!root || !shell) return

    const signal = sceneState.current
    Object.assign(signal, createHeroSceneState())
    const test = readTestMode(window.location.search)
    const debugScene = new URLSearchParams(window.location.search).get('heroDebugScene') === '1'
    root.dataset.debugScene = debugScene ? 'true' : 'false'
    document.documentElement.classList.toggle('hero-debug-scene', debugScene)
    if (test.active) {
      signal.forcedProgress = test.progress
      signal.progress = test.progress
    }

    gsap.registerPlugin(ScrollTrigger)

    const data = root.querySelector<HTMLElement>('.hero-data')
    const copy = root.querySelector<HTMLElement>('.hero-copy')
    let dataLive = false
    let copyLive: boolean | null = null

    /** Keep invisible CTAs out of pointer, keyboard and assistive-tech flow. */
    const setCopyLive = (live: boolean) => {
      if (!copy || live === copyLive) return
      copyLive = live
      copy.toggleAttribute('inert', !live)
      copy.setAttribute('aria-hidden', live ? 'false' : 'true')
      copy.style.pointerEvents = live ? 'auto' : 'none'
    }
    setCopyLive(false)

    /**
     * El bloque institucional sólo es interactivo mientras se ve. Sin esto sus
     * enlaces seguirían recibiendo el foco con el tabulador durante todo el
     * capítulo, invisibles para quien navega con teclado.
     */
    const setDataLive = (live: boolean) => {
      if (!data || live === dataLive) return
      dataLive = live
      data.classList.toggle('is-live', live)
      if (live) data.removeAttribute('inert')
      else data.setAttribute('inert', '')
    }

    const context = gsap.context(() => {
      const mm = gsap.matchMedia()

      // -------------------------------------------------------------- entrada
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (test.active) return
        /*
          La carga sólo enciende la escena.

          El texto ya no entra aquí: entra con el scroll, más abajo. Al cargar,
          lo que hay es el cerebro vivo —girando, respirando, con sus partículas
          y su anillo—, y es el primer gesto de rueda el que hace emerger la
          portada desde la profundidad. Dejar las dos entradas a la vez hacía
          que el texto apareciese solo y volviese a aparecer al scrollear.
        */
        const intro = gsap.timeline({ defaults: { duration: 0.6, ease: 'power3.out' } })
        intro
          .from('.hero-canvas', { opacity: 0, duration: 1.2 }, 0)
          .from('.side-indicator', { opacity: 0, x: 16 }, 0.9)
          .from('.hero-scroll-cue', { opacity: 0, y: 10 }, 1.05)
        return () => intro.kill()
      })

      // ------------------------------------------------- parallax de puntero
      // El puntero ya no mueve capas: sólo inclina la cámara. Cada plano se
      // desplaza entonces lo que le corresponde por su distancia, en vez de lo
      // que dictaba una tabla de amplitudes.
      mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
        if (test.active) return
        const onPointer = (event: PointerEvent) => {
          signal.pointerX = event.clientX / window.innerWidth - 0.5
          signal.pointerY = event.clientY / window.innerHeight - 0.5
        }
        const onLeave = () => { signal.pointerX = 0; signal.pointerY = 0 }
        window.addEventListener('pointermove', onPointer, { passive: true })
        document.addEventListener('pointerleave', onLeave)
        window.addEventListener('blur', onLeave)
        return () => {
          window.removeEventListener('pointermove', onPointer)
          document.removeEventListener('pointerleave', onLeave)
          window.removeEventListener('blur', onLeave)
          onLeave()
        }
      })

      // ============================================== capítulo 01 — Inicio
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        setDataLive(false)

        /**
         * ScrollTrigger tiene un solo trabajo: publicar el progreso. Ni cámara,
         * ni cerebro, ni niebla se escriben desde aquí. Cuando dos sistemas
         * escribían la misma propiedad, el resultado dependía de cuál corriera
         * último en cada frame, y eso era la mitad del comportamiento errático.
         */
        const syncChapter = (progress: number) => {
          // Sólo se publica el objetivo. La escena lo persigue amortiguado en
          // `Clock`, así que el scroll nunca escribe directamente lo que se ve:
          // ése es el único sitio donde el progreso visible cambia de valor.
          if (signal.forcedProgress === null) signal.targetProgress = progress
          root.style.setProperty('--chapter-progress', progress.toFixed(4))
          // Al cruzar la abertura desaparece también el chrome 2D. La barra
          // vuelve al reconstruirse el cerebro, reforzando que el tramo central
          // sucede dentro del mundo y no detrás de una interfaz fija.
          document.documentElement.classList.toggle('hero-immersive', progress >= 0.4 && progress < 0.79)
          setCopyLive(progress >= COPY_ENTER_START && progress < COPY_EXIT_END)
          setDataLive(progress > PHASE.INSTITUTION - 0.03 && progress < 0.99)
          signal.velocity = gsap.utils.clamp(-1, 1, (timeline.scrollTrigger?.getVelocity() ?? 0) / 2600)
        }

        // En modo determinista la línea de tiempo existe igual, pero sin
        // ScrollTrigger: el arnés la coloca en un progreso exacto. Sin esto las
        // capturas mostrarían el texto del hero encima del cerebro en tramos
        // donde la experiencia real ya lo ha retirado.
        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          paused: test.active,
          onUpdate() { syncChapter(this.progress()) },
          scrollTrigger: test.active ? undefined : {
            trigger: shell,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * chapterLength(window.innerWidth))}`,
            pin: root,
            pinSpacing: true,
            // Lenis y el director ya aportan peso; ScrollTrigger sólo publica
            // el objetivo para no sumar una tercera cola de suavizado.
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })

        Object.entries(PHASE).forEach(([name, position]) => timeline.addLabel(name, position))
        const to = (from: keyof typeof PHASE, till: keyof typeof PHASE) => PHASE[till] - PHASE[from]

        /*
          La coreografía 3D vive en la escena. Aquí sólo se mueve la interfaz,
          pero se mueve *en el mismo espacio*: cada bloque entra desde el fondo
          con su propia perspectiva (`transformPerspective` + `z` + giro), no
          deslizándose por el plano de la pantalla. Es lo que hace que el texto
          pertenezca a la escena en vez de flotar como un subtítulo encima.
        */
        const inDepth = { ease: 'power3.out', transformPerspective: 900, transformOrigin: 'left center' }
        const institution = to('INSTITUTION', 'HANDOFF')

        timeline
          // ---------------------------------------------- la portada emerge
          .fromTo('.hero-copy',
            { autoAlpha: 0 },
            { autoAlpha: 1, duration: 0.015, ease: 'none' }, COPY_ENTER_START)
          .fromTo('.hero-kicker',
            { opacity: 0, y: 30, z: -260, rotateX: -26 },
            { ...inDepth, opacity: 1, y: 0, z: 0, rotateX: 0, duration: 0.04 }, COPY_ENTER_START)
          .fromTo('.hero-title-line',
            { opacity: 0, y: 52, z: -420, rotateX: -38 },
            { ...inDepth, opacity: 1, y: 0, z: 0, rotateX: 0, duration: 0.062, stagger: 0.019 }, 0.052)
          .fromTo('.hero-description',
            { opacity: 0, y: 30, z: -190 },
            { ...inDepth, opacity: 1, y: 0, z: 0, duration: 0.04 }, 0.115)
          .fromTo('.hero-actions',
            { opacity: 0, y: 28, z: -150 },
            { ...inDepth, opacity: 1, y: 0, z: 0, duration: COPY_ENTER_END - 0.137 }, 0.137)
          .to('.hero-scroll-cue', { opacity: 0, y: 8, duration: 0.05 }, 0.1)
          /*
            Se retira hacia el espectador, no hacia arriba: la cámara sigue
            avanzando y el texto tiene que salir por delante del encuadre.

            Van en dos tweens porque necesitan curvas opuestas. Con uno solo y
            `power2.in`, el texto conservaba dos tercios de su opacidad justo
            cuando la perspectiva ya lo había agrandado un 25 %, y durante ese
            tramo se comía el cerebro. Ahora la opacidad cae pronto y el
            desplazamiento se toma su tiempo: lo que crece ya casi no se ve.
          */
          .to('.hero-copy',
            { autoAlpha: 0, duration: COPY_EXIT_END - COPY_EXIT_START, ease: 'power2.out' }, COPY_EXIT_START)
          .to('.hero-copy',
            {
              y: -26,
              z: 170,
              rotateX: 10,
              transformPerspective: 900,
              duration: COPY_EXIT_END - COPY_EXIT_START,
              ease: 'power2.in',
            }, COPY_EXIT_START)
          .to('.hero-veil', { opacity: 0.12, duration: to('ORBIT', 'INFORM') }, PHASE.ORBIT)

          // ------------------------------------- el bloque institucional flota
          // Entra como una diapositiva: los dos paneles vienen de la
          // profundidad y de lados opuestos, girados, y se enderezan al llegar.
          .fromTo('.hero-institutional', { opacity: 0 }, { opacity: 1, duration: institution * 0.22 }, PHASE.INSTITUTION)
          .fromTo('.institution-card',
            { opacity: 0, x: -110, z: -420, rotateY: 32, filter: 'blur(9px)' },
            { opacity: 1, x: 0, z: 0, rotateY: 0, filter: 'blur(0px)', duration: institution * 0.5, ease: 'power3.out' },
            PHASE.INSTITUTION + institution * 0.06)
          .fromTo('.developer-card',
            { opacity: 0, x: 110, z: -420, rotateY: -32, filter: 'blur(9px)' },
            { opacity: 1, x: 0, z: 0, rotateY: 0, filter: 'blur(0px)', duration: institution * 0.5, ease: 'power3.out' },
            PHASE.INSTITUTION + institution * 0.14)
          .fromTo('.hero-institutional .brand-image',
            { opacity: 0, scale: 0.7, z: -160 },
            { opacity: 1, scale: 1, z: 0, duration: institution * 0.34, ease: 'back.out(1.7)' },
            PHASE.INSTITUTION + institution * 0.26)
          .fromTo('.hero-institutional .eyebrow-small, .hero-institutional .institutional-card h2:not(.sr-only), .hero-institutional .institutional-role, .hero-institutional .institutional-card p',
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: institution * 0.26, stagger: institution * 0.045, ease: 'power2.out' },
            PHASE.INSTITUTION + institution * 0.3)
          .fromTo('.hero-institutional .institutional-connection i',
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: institution * 0.16, stagger: institution * 0.08, ease: 'back.out(2.4)' },
            PHASE.INSTITUTION + institution * 0.34)
          .to('.hero-institutional .institutional-connection span',
            { scaleX: 1, duration: institution * 0.34, ease: 'power2.out' },
            PHASE.INSTITUTION + institution * 0.38)
          // Barrido de luz que recorre los dos paneles una vez montados.
          .fromTo('.institutional-sweep',
            { opacity: 0, xPercent: -130 },
            { opacity: 1, xPercent: 130, duration: institution * 0.46, ease: 'power1.inOut' },
            PHASE.INSTITUTION + institution * 0.44)
          .to('.institutional-sweep', { opacity: 0, duration: institution * 0.08 },
            PHASE.INSTITUTION + institution * 0.86)
          .to('.hero-institutional',
            { opacity: 0, y: -22, z: 180, transformPerspective: 1200, duration: 0.025 }, 0.925)
          .to('.side-indicator', { opacity: 0, duration: to('HANDOFF', 'END') }, PHASE.HANDOFF)
          .fromTo('.hero-portal', { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, duration: 0.06, ease: 'power2.in' }, PHASE.HANDOFF)
          .fromTo('.hero-portal-label',
            { autoAlpha: 0, y: 28, scale: 0.96, filter: 'blur(6px)' },
            { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.045, ease: 'power3.out' }, 0.9)

        /*
          Los cuatro conceptos ya no se animan desde aquí.

          Viven anclados al mundo 3D, alrededor del cerebro, y su opacidad la
          escribe la escena en `Concepts`. El panel DOM que ocupaban antes hizo
          falta mientras la cámara viajaba por dentro del cerebro —un ancla en
          movimiento cruzaba la pantalla en diagonal—, pero con la cámara
          estable durante todo el tramo de información el ancla es firme, y
          anclar al mundo es lo correcto: el texto señala una parte del objeto
          en vez de flotar sobre él.
        */

        if (test.active) {
          timeline.progress(test.progress, true)
          syncChapter(test.progress)
          const dom = window as unknown as { __heroSetDomProgress?: (value: number) => void }
          dom.__heroSetDomProgress = (value) => {
            const progress = gsap.utils.clamp(0, 1, value)
            timeline.progress(progress, true)
            syncChapter(progress)
          }
        }

        return () => {
          timeline.scrollTrigger?.kill(true)
          timeline.kill()
          delete (window as unknown as { __heroSetDomProgress?: unknown }).__heroSetDomProgress
          root.style.removeProperty('--chapter-progress')
          document.documentElement.classList.remove('hero-immersive')
          setCopyLive(false)
          Object.assign(signal, createHeroSceneState())
        }
      })

      mm.add('(prefers-reduced-motion: reduce)', () => {
        setDataLive(true)
        setCopyLive(true)
        gsap.set(copy, { autoAlpha: 1 })
        return () => setCopyLive(false)
      })
    }, root)

    const onResize = () => ScrollTrigger.refresh()
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      context.revert()
      document.documentElement.classList.remove('hero-debug-scene')
      document.documentElement.classList.remove('hero-immersive')
      delete root.dataset.debugScene
    }
  }, [])

  return (
    <section id="inicio" ref={wrapper} className="hero-scroll-wrapper" data-chapter="01">
      <div ref={viewport} className="hero-viewport" data-next-section="platform">
        <div className="hero-clip">
          {/* Todo el mundo visible —montañas, niebla, cerebro, anillos,
              plataforma y partículas— vive en un único contexto WebGL, con una
              sola cámara y un solo espacio de profundidad. */}
          <HeroScene sceneState={sceneState} />
          <ul className="sr-only">
            <li>Evaluación: organización de procesos.</li>
            <li>Análisis: información estructurada.</li>
            <li>Acompañamiento: apoyo al profesional.</li>
            <li>Inclusión: tecnología aplicada a educación.</li>
          </ul>
        </div>

        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-veil" aria-hidden="true" />

        <div className="hero-layout">
          <div
            className="hero-copy"
            inert
            aria-hidden="true"
            style={{ opacity: 0, visibility: 'hidden', pointerEvents: 'none' }}
          >
            <span className="hero-kicker"><i /> Tecnología para evaluación psicopedagógica</span>
            <h1>
              <span className="hero-title-line">Evaluar.</span>
              <span className="hero-title-line">Comprender.</span>
              <span className="hero-title-line">Acompañar <em>mejor.</em></span>
            </h1>
            <p className="hero-description">
              Detection-test es un entorno digital para organizar, analizar y acompañar procesos de evaluación psicopedagógica.<br />
              La información se presenta con claridad para apoyar la interpretación profesional; la decisión siempre corresponde al especialista.
            </p>
            <div className="hero-actions">
              <a href="#plataforma" className="hero-cta hero-cta-primary">Explorar plataforma <ArrowRight /></a>
              <a href="#proceso" className="hero-cta hero-cta-secondary">Ver cómo funciona <span><Play /></span></a>
            </div>
          </div>
        </div>

        {/* Institucional pertenece al capítulo: entra dentro de la coreografía,
            no como una sección que llega por scroll normal. */}
        <div className="hero-data">
          <div className="hero-institutional"><InstitutionalStrip /></div>
        </div>

        {/* Puerta al capítulo 02: la cámara desciende hacia la plataforma y la
            escena cierra sobre su núcleo cian. */}
        <div className="hero-portal" aria-hidden="true">
          <span className="portal-glow" />
          <span className="portal-core" />
          <div className="hero-portal-label absolute bottom-[12vh] z-[2] flex flex-col items-center gap-2 text-center opacity-0">
            <span className="text-[0.65rem] font-semibold tracking-[0.32em] text-cyan-100/70">SIGUIENTE CAPÍTULO</span>
            <strong className="font-display text-2xl font-semibold tracking-[0.18em] text-white sm:text-3xl">PLATAFORMA</strong>
          </div>
        </div>

        <div className="side-indicator" aria-label={`Sección 1 de 4: Inicio · ${CHAPTER_LABEL}`}>
          <div aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => <i key={index} className={index === 0 ? 'active' : ''} />)}
          </div>
          <strong>01</strong>
          <span>{CHAPTER_LABEL}</span>
        </div>
        <div className="hero-scroll-cue" aria-hidden="true"><span>Explora</span><i /></div>
        <HeroDebug sceneState={sceneState} />
      </div>
    </section>
  )
}
