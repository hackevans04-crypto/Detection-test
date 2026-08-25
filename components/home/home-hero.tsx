'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { ArrowRight, Play } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { LOGO_PRINT, PHASE, chapterLength, createHeroSceneState, inside, smootherstep, type HeroSceneState } from '@/lib/hero/depth'
import { scrollContext, smoothScroll, wheelTelemetry } from './smooth-scroll'
import { readTestMode } from '@/lib/hero/stage'
import { HeroScene } from './hero-scene'
import { InstitutionalStrip } from './institutional-strip'
import { useCinematicSteps } from './cinematic-steps'
import { ParticleText } from './particle-text'
import { createPlatformSceneState } from '@/components/platform/platform-state'
import { PlatformOverlay } from '@/components/platform/platform-chapter'
import { platformChapterLength } from '@/lib/platform/timeline'

// Plataforma empieza cuando Inicio ya termino. El solapamiento anterior de
// 0.10 hacia que el cerebro, el portal y el cubo compartieran el mismo plano.
const PLATFORM_START = 1
const MASTER_DURATION = 2

/** Progresos con captura obligatoria. El panel salta exactamente a estos. */
const CHECKPOINTS = [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.59, 0.64, 0.69, 0.74, 0.8, 0.84, 0.88, 0.92, 0.95, 1]
/**
 * Salida escalonada del copy, anclada a los tramos.
 *
 * Antes era una constante suelta —0,21— que no sabía nada de lo que ocurría en
 * la escena: el texto se iba porque un número llegaba a su valor, no porque el
 * capítulo hubiera avanzado. Ahora se retira mientras la escena despierta y por
 * orden de importancia: primero los botones, después el párrafo, el titular el
 * último.
 */
const COPY_EXIT = {
  kicker: [inside('INTRO', 0.8), inside('INTRO', 1)],
  cta: [inside('INTRO', 0.85), inside('ACTIVATION', 0.35)],
  paragraph: [inside('ACTIVATION', 0.3), inside('ACTIVATION', 0.85)],
  headline: [inside('ACTIVATION', 0.8), inside('UNLOCK', 0.45)],
} as const
const COPY_EXIT_START = COPY_EXIT.kicker[0]
const COPY_EXIT_END = COPY_EXIT.headline[1]

function HeroDebug({ sceneState }: { sceneState: MutableRefObject<HeroSceneState> }) {
  const [visible, setVisible] = useState(false)
  const [snapshot, setSnapshot] = useState({ scene: createHeroSceneState(), fps: 0, wheel: { ...wheelTelemetry } })

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
        setSnapshot({ scene: { ...sceneState.current }, fps, wheel: { ...wheelTelemetry } })
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
      <span>tier {scene.quality} · DPR {scene.dpr.toFixed(2)} · render {(scene.renderScale * 100).toFixed(0)} %</span>
      <hr />
      <b>Rueda adaptativa</b>
      <span>
        delta {snapshot.wheel.rawDelta.toFixed(0)} → {snapshot.wheel.effectiveDelta.toFixed(0)} px
        {snapshot.wheel.clamped ? ' (techo)' : ''}
      </span>
      <span>
        multiplicador {snapshot.wheel.multiplier.toFixed(2)}x · pico {snapshot.wheel.peakMultiplier.toFixed(2)}x
      </span>
      <span>impulso {snapshot.wheel.impulse.toFixed(3)} · fuente {snapshot.wheel.source}</span>
      <span>visualProgress {snapshot.wheel.visualProgress.toFixed(4)}</span>
      <span>pendiente {snapshot.wheel.pendingPx.toFixed(0)} px</span>
      <span>
        desde el último {snapshot.wheel.sinceLast.toFixed(0)} ms · velocidad {snapshot.wheel.velocity.toFixed(0)}
      </span>
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
  const platformState = useRef(createPlatformSceneState())
  const chapterTrigger = useRef<ScrollTrigger | undefined>(undefined)

  /*
    Navegación por estaciones: APAGADA.

    Sirvió para diagnosticar el problema de ritmo, pero no es el
    comportamiento final: al completar sola la toma después de un gesto, la
    cámara deja de sentirse del usuario. El scroll vuelve a controlar la
    navegación de forma continua y `uTime` sigue controlando la vida del
    mundo; ésa es la separación que hace que la escena parezca viva sin
    quitarle el control a nadie.

    Se conserva tras `?heroSteps=1` para poder comparar las dos, y se apaga
    también en modo determinista, donde el arnés coloca el progreso a mano.
  */
  useCinematicSteps({
    trigger: () => chapterTrigger.current,
    disabled: typeof window === 'undefined'
      || new URLSearchParams(window.location.search).get('heroSteps') !== '1'
      || readTestMode(window.location.search).active,
  })

  useEffect(() => {
    const root = viewport.current
    const shell = wrapper.current
    if (!root || !shell) return

    const signal = sceneState.current
    const platformSignal = platformState.current
    Object.assign(signal, createHeroSceneState())
    Object.assign(platformSignal, createPlatformSceneState())
    const params = new URLSearchParams(window.location.search)
    const test = readTestMode(window.location.search)
    const platformTest = params.get('platformTest') === '1'
    const handoffTest = params.get('handoffTest') === '1'
    const platformTestProgress = gsap.utils.clamp(0, 1, Number(params.get('p')) || 0)
    const handoffTestProgress = gsap.utils.clamp(0, 2, Number(params.get('p')) || 0)
    const deterministic = test.active || platformTest || handoffTest
    const debugScene = params.get('heroDebugScene') === '1'
    root.dataset.debugScene = debugScene ? 'true' : 'false'
    document.documentElement.classList.toggle('hero-debug-scene', debugScene)
    if (test.active) {
      signal.forcedProgress = test.progress
      signal.progress = test.progress
    }
    if (platformTest) {
      signal.forcedProgress = 1
      signal.progress = 1
      platformSignal.forcedProgress = platformTestProgress
      platformSignal.progress = platformTestProgress
      platformSignal.rawProgress = platformTestProgress
    }
    if (handoffTest) {
      const heroProgress = Math.min(1, handoffTestProgress)
      const platformProgress = Math.max(0, handoffTestProgress - 1)
      signal.forcedProgress = heroProgress
      signal.progress = heroProgress
      signal.targetProgress = heroProgress
      platformSignal.forcedProgress = platformProgress
      platformSignal.progress = platformProgress
      platformSignal.rawProgress = platformProgress
    }

    gsap.registerPlugin(ScrollTrigger)

    const data = root.querySelector<HTMLElement>('.hero-data')
    const copy = root.querySelector<HTMLElement>('.hero-copy')
    let dataLive: boolean | null = null
    let copyLive: boolean | null = null

    /** Keep invisible CTAs out of pointer, keyboard and assistive-tech flow. */
    const setCopyLive = (live: boolean) => {
      if (!copy || live === copyLive) return
      copyLive = live
      copy.toggleAttribute('inert', !live)
      copy.setAttribute('aria-hidden', live ? 'false' : 'true')
      copy.style.pointerEvents = live ? 'auto' : 'none'
    }
    setCopyLive(true)

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
        if (deterministic) return
        /* Cerebro y portada entran juntos; el primer cuadro nunca queda vacío. */
        const intro = gsap.timeline({ defaults: { duration: 0.6, ease: 'power3.out' } })
        intro
          /*
            El lienzo ya no se funde desde aquí. `HeroScene` devuelve `null`
            hasta que un efecto resuelve el encuadre, así que cuando se crea
            esta línea de tiempo `.hero-canvas` todavía no existe: el tween no
            encontraba objetivo —GSAP lo avisaba en cada carga— y el fundido no
            llegaba a aplicarse nunca. La entrada del mundo la resuelve ahora el
            velo de arranque, que además espera al primer fotograma real.

            Comprobado que los otros selectores de esta línea sí existen: el
            indicador lateral y la pista de scroll conservan sus animaciones.
          */
          /*
            La portada ya no se funde: se imprime.

            El bloque conserva su acercamiento en profundidad —eso es cámara, y
            sigue siendo suyo—, pero la OPACIDAD del titular y del párrafo la
            escribe ahora `ParticleText`, que los materializa renglón a renglón
            con el mismo cabezal que las marcas institucionales. Fundir el
            bloque desde aquí, además, habría desvanecido los lienzos de las
            partículas y no se habría visto ninguna impresión.

            Los botones sí siguen entrando con un fundido: no se imprimen, y sin
            él aparecerían de golpe a mitad de la materialización del texto.
          */
          .from('.hero-copy', { y: 18, z: -120, duration: 0.78 }, 0.12)
          .from('.hero-actions', { opacity: 0, y: 12, duration: 0.62 }, 0.95)
          .from('.hero-scroll-cue', { opacity: 0, y: 10 }, 1.05)
        return () => intro.kill()
      })

      // ------------------------------------------------- parallax de puntero
      // El puntero ya no mueve capas: sólo inclina la cámara. Cada plano se
      // desplaza entonces lo que le corresponde por su distancia, en vez de lo
      // que dictaba una tabla de amplitudes.
      mm.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
        if (deterministic) return
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
        const syncChapter = (masterTime: number) => {
          const progress = gsap.utils.clamp(0, 1, masterTime)
          const platformProgress = gsap.utils.clamp(0, 1, masterTime - PLATFORM_START)
          // Sólo se publica el objetivo. La escena lo persigue amortiguado en
          // `Clock`, así que el scroll nunca escribe directamente lo que se ve:
          // ése es el único sitio donde el progreso visible cambia de valor.
          if (signal.forcedProgress === null) signal.targetProgress = progress
          if (platformSignal.forcedProgress === null) platformSignal.rawProgress = platformProgress
          /*
            La sensibilidad adaptativa de la rueda necesita saber dónde está el
            capítulo para no dejar que un solo evento cruce una meseta de
            lectura, y para devolver el grano fino dentro de un hold.
          */
          scrollContext.progress = progress
          /*
            Progreso y velocidad se publican en vivo, no en el instante de la
            rueda: para comprobar hardware real hacen falta los dos valores
            mientras la escena sigue moviéndose, no congelados en el último
            evento.
          */
          wheelTelemetry.visualProgress = progress
          wheelTelemetry.velocity = Math.abs(smoothScroll.current?.velocity ?? 0)
          wheelTelemetry.pendingPx = (smoothScroll.current?.targetScroll ?? 0) - (smoothScroll.current?.animatedScroll ?? 0)
          scrollContext.chapterPx = Math.round(window.innerHeight * chapterLength(window.innerWidth))
          root.style.setProperty('--chapter-progress', progress.toFixed(4))
          root.style.setProperty('--platform-progress', platformProgress.toFixed(4))
          /*
            El capítulo publica su estado para la navegación.

            Va en documentElement porque el nav vive fuera del hero, y va
            desde aquí —el único sitio donde el progreso visible cambia de
            valor— para que la barra no tenga que escuchar el scroll por su
            cuenta. Tenía su propio listener de scrollY, que era una segunda
            línea de tiempo compitiendo con ésta.
          */
          document.documentElement.style.setProperty('--hero-progress', progress.toFixed(4))
          document.documentElement.style.setProperty('--platform-progress', platformProgress.toFixed(4))
          document.documentElement.dataset.platformActive = platformProgress > 0.01 && platformProgress < 0.995 ? 'true' : 'false'
          /*
            Pesos continuos para el morph de la navegación.

            El atributo de estado se conserva sólo para soltar del puntero los
            enlaces cuando ya son invisibles del todo. Todo
            lo visual —altura, velo, desenfoque, escala del logo, opacidad de
            los enlaces, ancho de la cuenta— se interpola desde estos dos
            números, así que la barra deja de cambiar por interruptor.
          */
          /*
            Plataforma ya no encoge la barra.

            El capítulo 02 la dejaba en compacto —sin enlaces, sin descriptor y
            con su propia cápsula de capítulo en el centro—, así que al pasar de
            Inicio a Plataforma la navegación cambiaba de forma y la página se
            sentía como dos sitios distintos. Es el mismo argumento por el que
            hay un solo raíl de módulos: quien dice dónde estás es el raíl, y la
            barra sólo navega.

            El único tramo que sigue encogiéndola es el interior del cerebro,
            donde el mundo ocupa la pantalla a propósito.
          */
          const compact = smootherstep(PHASE.AWAKENING - 0.02, PHASE.UNLOCK, progress)
            * (1 - smootherstep(PHASE.PLATFORM_EXIT, 1, progress))
          const immersive = smootherstep(PHASE.ENTRY - 0.04, PHASE.ENTRY + 0.05, progress)
            * (1 - smootherstep(PHASE.REASSEMBLY, PHASE.INSTITUTION, progress))
          document.documentElement.style.setProperty('--nav-compact', compact.toFixed(4))
          document.documentElement.style.setProperty('--nav-immersive', immersive.toFixed(4))
          document.documentElement.dataset.heroNav =
            progress < PHASE.AWAKENING ? 'full'
            : progress < PHASE.ENTRY ? 'compact'
            : progress < PHASE.REASSEMBLY ? 'immersive'
            : progress < PHASE.PLATFORM_EXIT ? 'compact'
            : 'full'
          // Al cruzar la abertura desaparece también el chrome 2D. La barra
          // vuelve al reconstruirse el cerebro, reforzando que el tramo central
          // sucede dentro del mundo y no detrás de una interfaz fija.
          document.documentElement.classList.toggle('hero-immersive', progress >= PHASE.ENTRY && progress < PHASE.REASSEMBLY)
          setCopyLive(progress < COPY_EXIT_END)
          setDataLive(progress > PHASE.INSTITUTION - 0.022 && progress < PHASE.PLATFORM_EXIT + 0.004)
          signal.velocity = gsap.utils.clamp(-1, 1, (timeline.scrollTrigger?.getVelocity() ?? 0) / 2600)
        }

        // En modo determinista la línea de tiempo existe igual, pero sin
        // ScrollTrigger: el arnés la coloca en un progreso exacto. Sin esto las
        // capturas mostrarían el texto del hero encima del cerebro en tramos
        // donde la experiencia real ya lo ha retirado.
        const timeline = gsap.timeline({
          defaults: { ease: 'none' },
          paused: deterministic,
          onUpdate() { syncChapter(this.time()) },
          scrollTrigger: deterministic ? undefined : {
            trigger: shell,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * (chapterLength(window.innerWidth) + platformChapterLength(window.innerWidth) - 0.7))}`,
            pin: root,
            pinSpacing: true,
            // Lenis y el director ya aportan peso; ScrollTrigger sólo publica
            // el objetivo para no sumar una tercera cola de suavizado.
            scrub: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            /*
              Dónde empieza el capítulo 02, en píxeles de scroll.

              Plataforma no tiene sitio propio en el documento: su ancla mide un
              píxel y está al FINAL de este recorrido fijado, así que un enlace a
              `#plataforma` se salta el capítulo entero en vez de llevar a él.
              Aquí sí se sabe —la línea de tiempo reparte su duración
              linealmente sobre el recorrido—, y se publica junto al resto del
              estado del capítulo para que el raíl de módulos pueda llevar de
              verdad al principio de Plataforma.
            */
            onRefresh(self) {
              /*
                Y no en su primer píxel, sino un poco dentro: en el cero todavía
                se está viendo el relevo del capítulo anterior —el chrome de
                Plataforma entra hacia el 10 % de su recorrido—, así que aterrizar
                ahí deja al usuario en la puerta en vez de en el capítulo.
              */
              const entry = self.start + (self.end - self.start) * ((PLATFORM_START + 0.12) / MASTER_DURATION)
              document.documentElement.style.setProperty('--hero-platform-scroll', String(Math.round(entry)))
            },
          },
        })

        chapterTrigger.current = timeline.scrollTrigger

        Object.entries(PHASE).forEach(([name, position]) => timeline.addLabel(name, position))
        const to = (from: keyof typeof PHASE, till: keyof typeof PHASE) => PHASE[till] - PHASE[from]

        /*
          La coreografía 3D vive en la escena. Aquí sólo se mueve la interfaz,
          pero se mueve *en el mismo espacio*: cada bloque entra desde el fondo
          con su propia perspectiva (`transformPerspective` + `z` + giro), no
          deslizándose por el plano de la pantalla. Es lo que hace que el texto
          pertenezca a la escena en vez de flotar como un subtítulo encima.
        */
        const institutionLead = PHASE.INSTITUTION - 0.02

        timeline
          // Approach ya contiene portada + cerebro; el scroll solo los dirige.
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
          /*
            El antefirma («kicker») ya no se renderiza: su tween apuntaba a un
            selector que no existe en el DOM y GSAP lo avisaba por consola en
            cada carga. Se retira el tween, no la ventana: `COPY_EXIT.kicker`
            sigue marcando dónde empieza la salida de la copy.
          */
          /*
            Botones y párrafo tampoco empujan en Z, por lo mismo que el titular:
            su perspectiva se multiplicaba con la del bloque. Medido en p=0,11,
            el párrafo pasaba de 490 a 1989 px de ancho con opacidad 0,09, es
            decir un fantasma de cuatro veces su tamaño cruzando el encuadre
            recortado por el borde izquierdo. Se van con su propio
            desplazamiento y su opacidad; la profundidad la pone el bloque.
          */
          .to('.hero-actions',
            { autoAlpha: 0, y: 14, duration: COPY_EXIT.cta[1] - COPY_EXIT.cta[0], ease: 'power2.out' }, COPY_EXIT.cta[0])
          /*
            Titular y parrafo salen deshaciendose, no apagandose.

            Sus tweens de `autoAlpha` desaparecen de aqui: la nube se los lleva
            —`ParticleText` recibe estas mismas ventanas como disolucion— y dos
            duenos para la misma opacidad es el defecto que este capitulo lleva
            tiempo cerrando. Lo que si conservan es su desplazamiento, que es
            movimiento de camara y no visibilidad.
          */
          .to('.hero-description',
            { y: 10, duration: COPY_EXIT.paragraph[1] - COPY_EXIT.paragraph[0], ease: 'power2.out' }, COPY_EXIT.paragraph[0])
          /*
            El titular NO empuja en Z: lo hace su bloque.

            Antes llevaba `z: 170` con su propia `transformPerspective`, y el
            padre `.hero-copy` llevaba otro `z: 170` con la suya. Las dos
            perspectivas se multiplican —900/730 al cuadrado, un 52 % de
            crecimiento en lugar del 23 % previsto—, así que el titular se
            agrandaba hasta cruzar el encuadre entero mientras todavía era
            legible. Medido en p=0,13: 892 px de ancho con opacidad 0,29. Eso
            era lo que se leía como las mismas palabras apareciendo una segunda
            vez, enormes y translúcidas, por encima de la escena.

            Aquí quedan sólo el desplazamiento propio y el desenfoque, que son
            lo que escalona su salida respecto al resto de la copy. La retirada
            en profundidad la sigue llevando el bloque, una sola vez.
          */
          .to('.hero-copy h1',
            {
              y: -22,
              filter: 'blur(7px)',
              duration: COPY_EXIT.headline[1] - COPY_EXIT.headline[0],
              ease: 'power2.in',
            }, COPY_EXIT.headline[0])
          .to('.hero-copy',
            {
              y: -26,
              z: 170,
              rotateX: 10,
              transformPerspective: 900,
              duration: COPY_EXIT_END - COPY_EXIT_START,
              ease: 'power2.in',
            }, COPY_EXIT_START)
          /*
            Cierre defensivo del bloque completo.

            ParticleText sigue siendo dueño de la disolución de cada pieza,
            pero su contenido real es también el fallback si el muestreo del
            canvas tarda o falla. Sin este relevo final, ese fallback quedaba
            ampliado y borroso durante todo el viaje. La opacidad del bloque
            sólo entra en el último medio de la ventana, cuando la nube ya se
            ha dispersado; no compite con la impresión y garantiza que ni DOM
            ni canvas sobrevivan al inicio de UNLOCK.
          */
          .to('.hero-copy',
            {
              autoAlpha: 0,
              duration: (COPY_EXIT.headline[1] - COPY_EXIT.headline[0]) * 0.5,
              ease: 'power2.in',
            }, (COPY_EXIT.headline[0] + COPY_EXIT.headline[1]) * 0.5)
          .to('.hero-veil', { opacity: 0.12, duration: to('ORBIT', 'INFORM') }, PHASE.ORBIT)

          /*
            ------------------------------- el bloque institucional se materializa

            Aqui ya no entra nada. Los dos paneles con borde y fondo llegaban
            desde la profundidad girando 32 grados sobre su eje vertical, y ese
            giro tenia dos defectos que solo se ven en movimiento: la
            perspectiva agrandaba el borde cercano —el escudo se salia de su
            hueco y tapaba el titular— y el `overflow: hidden` que el panel
            necesitaba para su barrido de luz recortaba el texto por la
            izquierda durante todo el giro. Quitadas las tarjetas, no hay borde
            cercano que agrandar ni caja que recorte.

            Lo unico que hace la coreografia es levantar el bloque y encender el
            enlace de datos. Todo lo demas —las dos marcas y cada linea de
            texto— lo imprime `ParticleText`/`ParticleLogo` desde el disparo de
            `LOGO_PRINT`, escalonado en el tiempo. El barrido de luz se retira
            con las tarjetas: era el reflejo de un cristal que ya no existe.
          */
          .fromTo('.hero-institutional', { opacity: 0 }, { opacity: 1, duration: 0.01 }, institutionLead)
          .fromTo('.hero-institutional .institutional-connection i',
            { scale: 0, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.01, stagger: 0.002, ease: 'back.out(2.4)' },
            institutionLead + 0.006)
          .to('.hero-institutional .institutional-connection span',
            { scaleX: 1, duration: 0.014, ease: 'power2.out' },
            institutionLead + 0.01)
          .to('.hero-institutional',
            { opacity: 0, y: -22, z: 180, transformPerspective: 1200, duration: 0.007 }, PHASE.PLATFORM_EXIT - 0.006)
          .fromTo('.hero-portal', { opacity: 0, scale: 0.82 }, { opacity: 1, scale: 1, duration: 0.06, ease: 'power1.inOut' }, PHASE.HANDOFF - 0.01)
          .fromTo('.hero-portal-label',
            { autoAlpha: 0, y: 28, scale: 0.96, filter: 'blur(6px)' },
            { autoAlpha: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.025, ease: 'power3.out' }, PHASE.PLATFORM_EXIT + 0.01)
          .to('.hero-portal-label', { autoAlpha: 0, y: -16, duration: 0.08, ease: 'power2.in' }, 0.98)
          .to('.hero-portal', { opacity: 0, scale: 1.06, duration: 0.12, ease: 'power2.out' }, 0.98)
          // Extiende la misma línea de tiempo: no existe un segundo pin ni un
          // segundo ScrollTrigger para Plataforma.
          .to({}, { duration: MASTER_DURATION - 1 }, 1)

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

        if (deterministic) {
          const initialTime = handoffTest ? handoffTestProgress : platformTest ? PLATFORM_START + platformTestProgress : test.progress
          timeline.time(initialTime, true)
          syncChapter(initialTime)
          const dom = window as unknown as { __heroSetDomProgress?: (value: number) => void }
          dom.__heroSetDomProgress = (value) => {
            const progress = gsap.utils.clamp(0, 1, value)
            const masterTime = platformTest ? PLATFORM_START + progress : progress
            if (platformTest) platformSignal.forcedProgress = progress
            timeline.time(masterTime, true)
            syncChapter(masterTime)
          }
          if (handoffTest) {
            ;(window as unknown as { __handoffSetProgress?: (value: number) => void }).__handoffSetProgress = (value) => {
              const masterTime = gsap.utils.clamp(0, MASTER_DURATION, value)
              const heroProgress = Math.min(1, masterTime)
              const platformProgress = Math.max(0, masterTime - PLATFORM_START)
              signal.forcedProgress = heroProgress
              signal.progress = heroProgress
              signal.targetProgress = heroProgress
              platformSignal.forcedProgress = platformProgress
              platformSignal.progress = platformProgress
              platformSignal.rawProgress = platformProgress
              timeline.time(masterTime, true)
              syncChapter(masterTime)
              ;(window as unknown as { __heroInvalidate?: () => void }).__heroInvalidate?.()
            }
          }
        }

        return () => {
          timeline.scrollTrigger?.kill(true)
          timeline.kill()
          delete (window as unknown as { __heroSetDomProgress?: unknown }).__heroSetDomProgress
          delete (window as unknown as { __handoffSetProgress?: unknown }).__handoffSetProgress
          root.style.removeProperty('--chapter-progress')
          root.style.removeProperty('--platform-progress')
          document.documentElement.style.removeProperty('--hero-progress')
          document.documentElement.style.removeProperty('--platform-progress')
          document.documentElement.style.removeProperty('--nav-compact')
          document.documentElement.style.removeProperty('--nav-immersive')
          delete document.documentElement.dataset.heroNav
          delete document.documentElement.dataset.platformActive
          document.documentElement.style.removeProperty('--hero-platform-scroll')
          document.documentElement.classList.remove('hero-immersive')
          setCopyLive(false)
          Object.assign(signal, createHeroSceneState())
          Object.assign(platformSignal, createPlatformSceneState())
        }
      })

      mm.add('(prefers-reduced-motion: reduce)', () => {
        setDataLive(false)
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
          <HeroScene sceneState={sceneState} platformState={platformState} />
          <ul className="sr-only">
            <li>Evaluación: organización de procesos.</li>
            <li>Análisis: información estructurada.</li>
            <li>Acompañamiento: apoyo al profesional.</li>
            <li>Inclusión: tecnología aplicada a educación.</li>
          </ul>
        </div>

        <div className="hero-vignette" aria-hidden="true" />
        <div className="hero-veil" aria-hidden="true" />
        <PlatformOverlay state={platformState} />

        <div className="hero-layout">
          <div
            className="hero-copy"
            aria-hidden="false"
            style={{ opacity: 1, visibility: 'visible', pointerEvents: 'auto' }}
          >
            {/*
              El titular se imprime renglón a renglón, con el mismo cabezal que
              las marcas institucionales. `print='load'` porque la portada ya
              está en pantalla cuando la página abre: aquí no hay scroll que
              disparar. La disolución sí es del scroll —las mismas ventanas de
              `COPY_EXIT` que rigen su retirada—, así que el texto no se apaga:
              se deshace mientras la cámara entra.
            */}
            <h1>
              <ParticleText as="span" className="hero-title-line print-host" seed="hero-line-1"
                print="load" dissolve={COPY_EXIT.headline} signal={sceneState}>Evaluar.</ParticleText>
              <ParticleText as="span" className="hero-title-line print-host" seed="hero-line-2" lag={0.1}
                print="load" dissolve={COPY_EXIT.headline} signal={sceneState}>Comprender.</ParticleText>
              <ParticleText as="span" className="hero-title-line print-host" seed="hero-line-3" lag={0.2}
                print="load" dissolve={COPY_EXIT.headline} signal={sceneState}>Acompañar <em>mejor.</em></ParticleText>
            </h1>
            <ParticleText as="p" className="hero-description print-host" seed="hero-note" lag={0.3} budget={1500}
              print="load" dissolve={COPY_EXIT.paragraph} signal={sceneState}>
              Un entorno digital para apoyar procesos de evaluación psicopedagógica, organizar información
              y acompañar la interpretación profesional.
            </ParticleText>
            <div className="hero-actions">
              <a href="#plataforma" className="hero-cta hero-cta-primary">Explorar experiencia <ArrowRight /></a>
              <a href="#proceso" className="hero-cta hero-cta-secondary">Conocer cómo funciona <span><Play /></span></a>
            </div>
          </div>
        </div>

        {/* Institucional pertenece al capítulo: entra dentro de la coreografía,
            no como una sección que llega por scroll normal. */}
        <div className="hero-data">
          <div className="hero-institutional"><InstitutionalStrip sceneState={sceneState} /></div>
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

        <div className="hero-scroll-cue" aria-hidden="true"><span>Explora</span><i /></div>
        <HeroDebug sceneState={sceneState} />
      </div>
    </section>
  )
}
