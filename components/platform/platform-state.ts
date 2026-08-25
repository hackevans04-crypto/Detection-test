import type { MutableRefObject } from 'react'

export type PlatformQuality = 'high' | 'medium' | 'low'

export type PlatformSceneState = {
  rawProgress: number
  progress: number
  forcedProgress: number | null
  time: number
  velocity: number
  scrollEnergy: number
  pointerX: number
  pointerY: number
  reducedMotion: boolean
  quality: PlatformQuality
  dpr: number
  cameraPosition: [number, number, number]
  cameraTarget: [number, number, number]
  cameraSpeed: number
  roll: number
  fov: number
  assemblyWeight: number
  reactorWeight: number
  activeConcept: string
  fps: number
  drawCalls: number
  triangles: number
  nearestActor: string
  nearestDistance: number
  screenOccupancy: number
}

export type PlatformStateRef = MutableRefObject<PlatformSceneState>

export function createPlatformSceneState(): PlatformSceneState {
  return {
    rawProgress: 0,
    progress: 0,
    forcedProgress: null,
    time: 0,
    velocity: 0,
    scrollEnergy: 0,
    pointerX: 0,
    pointerY: 0,
    reducedMotion: false,
    quality: 'high',
    dpr: 1,
    cameraPosition: [0, -1.05, -1.4],
    cameraTarget: [0, -1.18, -3],
    cameraSpeed: 0,
    roll: 0,
    fov: 39.2,
    assemblyWeight: 0,
    reactorWeight: 0,
    activeConcept: '—',
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    nearestActor: '—',
    nearestDistance: Number.POSITIVE_INFINITY,
    screenOccupancy: 0,
  }
}
