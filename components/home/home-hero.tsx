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
const CHECKPOINTS = [0, 0.18, 0.35, 0.45, 0.52, 0.58, 0.64, 0.71, 0.78, 0.85, 0.97]

function HeroDebug({ sceneState }: { sceneState: MutableRefObject<HeroSceneState> }) {
  const [visible, setVisible] = useState(false)
  const [snapshot, setSnapshot] = useState({ scene: createHeroSceneState(), fps: 0 })

  useEffect(() => {
    setVisible(new URLSearchParams(window.location.search).get('heroDebug') === '1')
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
  const phase = p < 0.18 ? 'Hero vivo'
    : p < 0.32 ? 'Activación'
      : p < 0.5 ? 'Revelado 3D'
        : p < 0.74 ? 'Inteligencia'
          : p < 0.89 ? 'Institución'
            : 'Entrega'
  const xyz = (value: [number, number, number]) => value.map((part) => part.toFixed(2)).join(' ')

  return (
    <output className="hero-debug">
      <b>Inicio · {phase}</b>
      <span>progress {p.toFixed(3)}{scene.forcedProgress !== null ? ' (forzado)' : ''}</span>
      <span>camera {xyz(scene.cameraPosition)} · fov {scene.cameraFov.toFixed(1)}</span>
      <span>lookAt {xyz(scene.lookAt)}</span>
      <span>brain pos {xyz(scene.brainPosition)}</span>
      <span>brain rot {xyz(scene.brainRotation)}</span>
      <span>bounds {xyz(scene.brainBounds)} · R {scene.brainRadius.toFixed(3)}</span>
      <span>scale {scene.brainScale.toFixed(3)} · α {scene.brainOpacity.toFixed(2)}</span>
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
    if (test.active) {
      signal.forcedProgress = test.progress
      signal.progress = test.progress
    }

    gsap.registerPlugin(ScrollTrigger)

    const data = root.querySelector<HTMLElement>('.hero-data')
    let dataLive = false

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
        const intro = gsap.timeline({ defaults: { duration: 0.6, ease: 'power3.out' } })
        intro
          .from('.hero-canvas', { opacity: 0, duration: 1.1 }, 0)
          .from('.hero-kicker', { opacity: 0, y: 14 }, 0.45)
          .from('.hero-title-line', { opacity: 0, y: 22, stagger: 0.12 }, 0.55)
          .from('.hero-description', { opacity: 0, y: 14 }, 0.95)
          .from('.hero-actions', { opacity: 0, y: 14 }, 1.1)
          .from('.side-indicator', { opacity: 0, x: 16 }, 1.1)
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
          if (signal.forcedProgress === null) signal.progress = progress
          root.style.setProperty('--chapter-progress', progress.toFixed(4))
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
            // Lenis ya suaviza el desplazamiento; un segundo suavizado aquí
            // retrasaba la escena y hacía que el cambio pareciera ocurrir sólo
            // al final del recorrido.
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })

        Object.entries(PHASE).forEach(([name, position]) => timeline.addLabel(name, position))
        const to = (from: keyof typeof PHASE, till: keyof typeof PHASE) => PHASE[till] - PHASE[from]

        // La coreografía 3D vive en la escena. Aquí sólo se mueve la interfaz.
        timeline
          .to('.hero-scroll-cue', { opacity: 0, y: 8, duration: 0.08 }, PHASE.CLEAR)
          .to('.hero-copy', { opacity: 0, y: -22, duration: 0.09 }, 0.2)
          .to('.hero-veil', { opacity: 0.14, duration: to('ENTER', 'NAVIGATE') }, PHASE.ENTER)
          .fromTo('.hero-institutional',
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: to('INSTITUTION', 'HANDOFF') * 0.7, ease: 'power2.out' }, PHASE.INSTITUTION)
          .fromTo('.hero-institutional .institutional-card',
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: to('INSTITUTION', 'HANDOFF') * 0.42, stagger: 0.012, ease: 'power2.out' },
            PHASE.INSTITUTION + to('INSTITUTION', 'HANDOFF') * 0.12)
          .to('.hero-institutional .institutional-connection span',
            { scaleX: 1, duration: to('INSTITUTION', 'HANDOFF') * 0.6, ease: 'power2.out' },
            PHASE.INSTITUTION + to('INSTITUTION', 'HANDOFF') * 0.18)
          .to('.hero-institutional', { opacity: 0, y: -16, duration: to('HANDOFF', 'END') * 0.7 }, PHASE.HANDOFF)
          .to('.side-indicator', { opacity: 0, duration: to('HANDOFF', 'END') }, PHASE.HANDOFF)
          .fromTo('.hero-portal', { opacity: 0, scale: 0.75 }, { opacity: 1, scale: 1, duration: to('HANDOFF', 'END'), ease: 'power2.in' }, PHASE.HANDOFF)

        if (test.active) {
          timeline.progress(test.progress, true)
          const dom = window as unknown as { __heroSetDomProgress?: (value: number) => void }
          dom.__heroSetDomProgress = (value) => timeline.progress(gsap.utils.clamp(0, 1, value), true)
        }

        return () => {
          timeline.scrollTrigger?.kill(true)
          timeline.kill()
          delete (window as unknown as { __heroSetDomProgress?: unknown }).__heroSetDomProgress
          root.style.removeProperty('--chapter-progress')
          Object.assign(signal, createHeroSceneState())
        }
      })

      mm.add('(prefers-reduced-motion: reduce)', () => { setDataLive(true) })
    }, root)

    const onResize = () => ScrollTrigger.refresh()
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      context.revert()
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
        </div>

        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-veil" aria-hidden="true" />

        <div className="hero-layout">
          <div className="hero-copy">
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
