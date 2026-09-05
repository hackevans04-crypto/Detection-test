'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { CONCEPTS, PLATFORM_BEATS, conceptFrame, smoothstep, stationArrival } from '@/lib/platform/timeline'
import { STATION_ANCHORS } from '@/lib/platform/camera-rail'
import { ParticleText } from '@/components/home/particle-text'
import type { PlatformSceneState } from './platform-state'

/**
 * Ventana del título de plataforma ("plano general de CHAMBER" — pedido
 * explícito: "el texto de plataforma con partículas como está en Inicio").
 *
 * Antes [0,115-0,14] / [0,15-0,175] — 0,025 de ancho cada una. Medido en
 * vivo con scroll real (`tmp/check-platform-title-real.mjs`, no forma parte
 * del build): a esa anchura el interruptor de impresión (`LATCH_ON=0,62` en
 * `use-print.ts`) no se encendía hasta el 62% de la ventana, dejando sólo
 * ~0,01 de progreso para que el materializado (real, en segundos —
 * `PRINT_LEAD`+`PRINT_SETTLE` ≈0,36s) terminara antes de que empezara la
 * disolución. Resultado en pantalla: el párrafo asomaba a medias y el
 * título/kicker casi no llegaban a formarse — "no está asomando", literal.
 * Ensanchadas a 0,035/0,04 para dejarle al mismo mecanismo el margen real
 * que necesita, sin tocar el interruptor compartido (que si se afloja aquí,
 * afloja también el de Inicio).
 */
const TITLE_PRINT: readonly [number, number] = [0.06, 0.12]
const TITLE_DISSOLVE: readonly [number, number] = [0.31, 0.38]

/** Derivado de `PLATFORM_BEATS` en vez de copiado a mano — así nunca se
 * desincroniza cuando se retocan los límites de los tramos. */
const CHECKPOINTS = Array.from(new Set(Object.values(PLATFORM_BEATS).flat())).sort((a, b) => a - b)

function PlatformDebug({ state }: { state: MutableRefObject<PlatformSceneState> }) {
  const [visible, setVisible] = useState(false)
  const [snapshot, setSnapshot] = useState(() => ({ ...state.current }))
  useEffect(() => {
    const enabled = new URLSearchParams(window.location.search).get('platformDebug') === '1'
    setVisible(enabled)
    if (!enabled) return
    const interval = window.setInterval(() => setSnapshot({ ...state.current }), 200)
    return () => window.clearInterval(interval)
  }, [state])
  if (!visible) return null
  const vector = (value: number[]) => value.map((part) => part.toFixed(2)).join(' ')
  return (
    <output className="platform-debug">
      <b>Plataforma · {snapshot.activeConcept}</b>
      <span>raw {snapshot.rawProgress.toFixed(4)} · visual {snapshot.progress.toFixed(4)}</span>
      <span>camera {vector(snapshot.cameraPosition)}</span>
      <span>target {vector(snapshot.cameraTarget)}</span>
      <span>speed {snapshot.cameraSpeed.toFixed(4)} · roll {(snapshot.roll * 57.3).toFixed(1)}° · FOV {snapshot.fov.toFixed(1)}</span>
      <span>safety {snapshot.nearestActor} {snapshot.nearestDistance.toFixed(2)}u · occupancy {Math.round(snapshot.screenOccupancy * 100)}%</span>
      <span>assembly {snapshot.assemblyWeight.toFixed(3)} · reactor {snapshot.reactorWeight.toFixed(3)}</span>
      <span>FPS {snapshot.fps} · calls {snapshot.drawCalls} · tris {snapshot.triangles.toLocaleString()}</span>
      <span>DPR {snapshot.dpr.toFixed(2)} · tier {snapshot.quality}</span>
      <nav>{CHECKPOINTS.map((value) => <button key={value} type="button" onClick={() => { state.current.forcedProgress = value }}>{Math.round(value * 100)}</button>)}<button type="button" onClick={() => { state.current.forcedProgress = null }}>scroll</button></nav>
    </output>
  )
}

/** Overlay del capítulo 02. Vive dentro del viewport fijado de Inicio. */
function PlatformNarrative({ state }: { state: MutableRefObject<PlatformSceneState> }) {
  const title = useRef<HTMLDivElement>(null)
  const status = useRef<HTMLDivElement>(null)
  const cards = useRef<Array<HTMLElement | null>>([])
  useEffect(() => {
    let animationFrame = 0
    const draw = () => {
      const progress = state.current.progress
      /*
        Vive durante `CHAMBER` (el establishing de la sala grande), y cede
        el paso antes de que `CUBE_APPROACH` empiece a mover la cámara —
        antes caía en la ventana de `ASSEMBLED`, que esta pasada retiró.
      */
      const titleVisibility = smoothstep(TITLE_PRINT[0], TITLE_PRINT[1], progress) * (1 - smoothstep(TITLE_DISSOLVE[0], TITLE_DISSOLVE[1], progress))
      if (title.current) {
        // La opacidad ya no se anima aquí: `ParticleText` es ahora el único
        // dueño de la visibilidad del texto (materializado con partículas,
        // igual que en Inicio). Este bloque conserva sólo el MOVIMIENTO
        // —profundidad y desenfoque—, nunca opacidad, la misma separación
        // que ya usa `.hero-copy` en Inicio.
        title.current.style.setProperty('--title-y', `${(1 - titleVisibility) * 18}px`)
        title.current.style.setProperty('--title-z', `${(1 - titleVisibility) * -120}px`)
        title.current.style.setProperty('--title-tilt', `${(1 - titleVisibility) * 7}deg`)
        title.current.style.setProperty('--title-blur', `${(1 - titleVisibility) * 6}px`)
        title.current.closest<HTMLElement>('.platform-overlay')?.style.setProperty('--platform-chrome', String(smoothstep(0.1, 0.2, progress)))
      }
      const statusVisibility = smoothstep(0.25, 0.31, progress) * (1 - smoothstep(0.5, 0.57, progress))
      if (status.current) {
        status.current.style.opacity = String(statusVisibility)
        status.current.style.setProperty('--status-y', `${(1 - statusVisibility) * 18}px`)
        status.current.style.setProperty('--status-blur', `${(1 - statusVisibility) * 5}px`)
      }
      const cameraTarget = state.current.cameraTarget
      CONCEPTS.forEach((concept, index) => {
        const node = cards.current[index]
        if (!node) return
        const value = conceptFrame(progress, concept.window)
        const gate = stationArrival(cameraTarget, STATION_ANCHORS[concept.key])
        const visibility = value.visibility * gate
        const connector = value.connector * gate
        const signalReveal = value.signal * gate
        const titleReveal = value.title * gate
        const body = value.body * gate
        node.style.opacity = String(Math.min(1, visibility * 1.3))
        node.style.setProperty('--concept-in', String(visibility))
        node.style.setProperty('--concept-node', String(connector))
        node.style.setProperty('--concept-signal', String(signalReveal))
        node.style.setProperty('--concept-title', String(titleReveal))
        node.style.setProperty('--concept-body', String(body))
        node.style.setProperty('--concept-y', `${(1 - visibility) * 16}px`)
        node.style.setProperty('--concept-z', `${(1 - visibility) * -130}px`)
        node.style.setProperty('--concept-tilt', `${(1 - visibility) * 8}deg`)
        node.style.setProperty('--concept-blur', `${(1 - visibility) * 3.5}px`)
        node.style.setProperty('--concept-node-scale', String(0.35 + connector * 0.65))
        if (visibility > 0.35) state.current.activeConcept = concept.title
      })
      animationFrame = requestAnimationFrame(draw)
    }
    animationFrame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationFrame)
  }, [state])
  return (
    <div className="platform-narrative">
      <div ref={title} className="platform-world-title">
        <ParticleText as="span" className="print-host" seed="platform-title-kicker"
          print={TITLE_PRINT} dissolve={TITLE_DISSOLVE} progressSource={() => state.current.progress} signal={state}>
          02 / Plataforma
        </ParticleText>
        <ParticleText as="h2" className="print-host" seed="platform-title-h2" lag={0.08}
          print={TITLE_PRINT} dissolve={TITLE_DISSOLVE} progressSource={() => state.current.progress} signal={state}>
          Sistema clínico conectado
        </ParticleText>
        <ParticleText as="strong" className="print-host" seed="platform-title-strong" lag={0.16}
          print={TITLE_PRINT} dissolve={TITLE_DISSOLVE} progressSource={() => state.current.progress} signal={state}>
          Información ordenada para decidir con criterio.
        </ParticleText>
        <ParticleText as="p" className="print-host" seed="platform-title-desc" lag={0.24} budget={1500}
          print={TITLE_PRINT} dissolve={TITLE_DISSOLVE} progressSource={() => state.current.progress} signal={state}>
          Centraliza expediente, instrumentos, evidencias y reportes para sostener una evaluación psicopedagógica trazable.
        </ParticleText>
      </div>
      <div ref={status} className="platform-status">
        <span>Núcleo operativo</span>
        <strong>Expediente, instrumentos y reporte comparten una fuente de datos trazable.</strong>
      </div>
      {CONCEPTS.map((concept, index) => (
        <article key={concept.key} ref={(node) => { cards.current[index] = node }} className={`platform-concept platform-concept-${index + 1}`}>
          <i className="platform-concept-node" aria-hidden="true"><b /></i>
          <span>{concept.index}</span>
          <h3>{concept.title}</h3>
          <p>{concept.description}</p>
        </article>
      ))}
    </div>
  )
}

export function PlatformOverlay({ state }: { state: MutableRefObject<PlatformSceneState> }) {
  return (
    <div className="platform-overlay" aria-hidden="true">
      <div className="platform-vignette" />
      <div className="platform-scroll-note"><span>Datos conectados</span><i /></div>
      <div className="platform-next"><small>Siguiente capítulo</small><strong>03 / Proceso</strong></div>
      <PlatformNarrative state={state} />
      <PlatformDebug state={state} />
    </div>
  )
}

/** Ancla semántica: la experiencia visible ya ocurrió en el canvas compartido. */
export function PlatformChapter() {
  return (
    <section id="plataforma" className="platform-semantic-anchor" aria-labelledby="platform-accessible-title">
      <h2 id="platform-accessible-title" className="sr-only">Plataforma Detection-test</h2>
      <p className="sr-only">Expediente, instrumentos, evidencias y reportes en un sistema clínico conectado.</p>
      <div className="sr-only">{CONCEPTS.map((concept) => <article key={concept.key}><h3>{concept.title}</h3><p>{concept.description}</p></article>)}</div>
      <div className="platform-reduced-fallback">
        <span>02 / Plataforma</span>
        <h2>Sistema clínico conectado</h2>
        <p>Expediente, instrumentos, evidencias y reportes en un sistema clínico conectado.</p>
        <div>{CONCEPTS.map((concept) => <article key={concept.key}><small>{concept.index}</small><h3>{concept.title}</h3><p>{concept.description}</p></article>)}</div>
      </div>
    </section>
  )
}
