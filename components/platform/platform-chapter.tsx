'use client'

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { CONCEPTS, conceptFrame, smoothstep } from '@/lib/platform/timeline'
import type { PlatformSceneState } from './platform-state'

const CHECKPOINTS = [0, 0.08, 0.18, 0.3, 0.43, 0.56, 0.67, 0.79, 0.91, 1]

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
  const cards = useRef<Array<HTMLElement | null>>([])
  useEffect(() => {
    let animationFrame = 0
    const draw = () => {
      const progress = state.current.progress
      const titleVisibility = smoothstep(0.2, 0.235, progress) * (1 - smoothstep(0.345, 0.39, progress))
      if (title.current) {
        title.current.style.opacity = String(titleVisibility)
        title.current.style.setProperty('--title-in', String(titleVisibility))
        title.current.style.setProperty('--title-y', `${(1 - titleVisibility) * 18}px`)
        title.current.style.setProperty('--title-z', `${(1 - titleVisibility) * -120}px`)
        title.current.style.setProperty('--title-tilt', `${(1 - titleVisibility) * 7}deg`)
        title.current.style.setProperty('--title-blur', `${(1 - titleVisibility) * 6}px`)
        title.current.closest<HTMLElement>('.platform-overlay')?.style.setProperty('--platform-chrome', String(smoothstep(0.1, 0.2, progress)))
      }
      CONCEPTS.forEach((concept, index) => {
        const node = cards.current[index]
        if (!node) return
        const value = conceptFrame(progress, concept.window)
        node.style.opacity = String(Math.min(1, value.visibility * 1.3))
        node.style.setProperty('--concept-in', String(value.visibility))
        node.style.setProperty('--concept-node', String(value.connector))
        node.style.setProperty('--concept-signal', String(value.signal))
        node.style.setProperty('--concept-title', String(value.title))
        node.style.setProperty('--concept-body', String(value.body))
        node.style.setProperty('--concept-y', `${(1 - value.visibility) * 16}px`)
        node.style.setProperty('--concept-z', `${(1 - value.visibility) * -130}px`)
        node.style.setProperty('--concept-tilt', `${(1 - value.visibility) * 8}deg`)
        node.style.setProperty('--concept-blur', `${(1 - value.visibility) * 3.5}px`)
        node.style.setProperty('--concept-node-scale', String(0.35 + value.connector * 0.65))
        if (value.visibility > 0.35) state.current.activeConcept = concept.title
      })
      animationFrame = requestAnimationFrame(draw)
    }
    animationFrame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationFrame)
  }, [state])
  return (
    <div className="platform-narrative">
      <div ref={title} className="platform-world-title">
        <span>02 / Sistema integral</span>
        <h2>Plataforma</h2>
        <strong>Detection-test</strong>
        <p>Evaluación, organización, análisis e inclusión en un solo entorno.</p>
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
      <div className="platform-scroll-note"><span>Continúa explorando</span><i /></div>
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
      <p className="sr-only">Evaluación, organización, análisis e inclusión en un solo entorno.</p>
      <div className="sr-only">{CONCEPTS.map((concept) => <article key={concept.key}><h3>{concept.title}</h3><p>{concept.description}</p></article>)}</div>
      <div className="platform-reduced-fallback">
        <span>02 / Plataforma</span>
        <h2>Detection-test</h2>
        <p>Evaluación, organización, análisis e inclusión en un solo entorno.</p>
        <div>{CONCEPTS.map((concept) => <article key={concept.key}><small>{concept.index}</small><h3>{concept.title}</h3><p>{concept.description}</p></article>)}</div>
      </div>
    </section>
  )
}
