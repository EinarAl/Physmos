import { create } from 'zustand'
import type { SimObject, Vec3, PhysicsProps } from './types'
import { sanitizeObject, type SceneSnapshot } from './scene/io'
import { buildDemoSnapshot } from './scene/presets'

let seq = 1
function nextId(): string {
  return 'o' + seq++
}

function makeInitialObjects(): SimObject[] {
  return buildDemoSnapshot({ newId: nextId }).objects
}

export interface ObjectPatch {
  name?: string
  color?: string
  visible?: boolean
  error?: string
  position?: Vec3
  size?: number
  expr?: string
  params?: string
  range?: [number, number]
  samples?: number
  mode?: 'explicit' | 'parametric'
  rangeA?: [number, number]
  rangeB?: [number, number]
  resolution?: [number, number]
  physics?: Partial<PhysicsProps>
}

interface AppStore {
  objects: SimObject[]
  selectedId: string | null
  playing: boolean
  time: number
  livePos: Record<string, Vec3>
  engineVersion: number
  coulombK: number
  gravity: number
  timeScale: number
  frameOn: boolean
  frameT: number
  trailsOn: boolean
  trailVersion: number
  gridOn: boolean
  resetView: number
  helpOn: boolean
  scenePanel: 'export' | 'import' | null
  select: (id: string | null) => void
  addObject: (o: SimObject) => void
  updateObject: (id: string, patch: ObjectPatch) => void
  removeObject: (id: string) => void
  setPlaying: (p: boolean) => void
  setTime: (t: number) => void
  setLivePos: (rec: Record<string, Vec3>) => void
  setCoulombK: (k: number) => void
  setGravity: (g: number) => void
  setTimeScale: (s: number) => void
  setFrameOn: (on: boolean) => void
  setFrameT: (t: number) => void
  setTrailsOn: (on: boolean) => void
  clearTrails: () => void
  resetSim: () => void
  setGridOn: (on: boolean) => void
  triggerResetView: () => void
  setHelpOn: (on: boolean) => void
  setScenePanel: (p: 'export' | 'import' | null) => void
  loadScene: (snap: SceneSnapshot) => void
  loadDemo: () => void
}

function bumpsEngine(patch: ObjectPatch): boolean {
  return patch.position !== undefined || patch.physics !== undefined
}

export const useStore = create<AppStore>((set) => ({
  objects: makeInitialObjects(),
  selectedId: null,
  playing: false,
  time: 0,
  livePos: {},
  engineVersion: 0,
  coulombK: 40,
  gravity: 9.81,
  timeScale: 1,
  frameOn: false,
  frameT: 0,
  trailsOn: true,
  trailVersion: 0,
  gridOn: true,
  resetView: 0,
  helpOn: false,
  scenePanel: null,
  select: (id) => set({ selectedId: id }),
  addObject: (o) => set((s) => ({ objects: [...s.objects, o], selectedId: o.id })),
  updateObject: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => {
        if (o.id !== id) return o
        const physics =
          o.kind === 'point' && patch.physics
            ? { ...o.physics, ...(patch.physics as Partial<typeof o.physics>) }
            : o.kind === 'point'
              ? o.physics
              : o
        return { ...o, ...patch, physics } as SimObject
      }),
      engineVersion: bumpsEngine(patch) ? s.engineVersion + 1 : s.engineVersion,
    })),
  removeObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      engineVersion: s.engineVersion + 1,
    })),
  setPlaying: (playing) => set({ playing }),
  setTime: (time) => set({ time }),
  setLivePos: (livePos) => set({ livePos }),
  setCoulombK: (coulombK) => set({ coulombK }),
  setGravity: (gravity) => set({ gravity }),
  setTimeScale: (timeScale) => set({ timeScale }),
  setFrameOn: (frameOn) => set({ frameOn }),
  setFrameT: (frameT) => set({ frameT }),
  setTrailsOn: (trailsOn) => set({ trailsOn }),
  clearTrails: () => set((s) => ({ trailVersion: s.trailVersion + 1 })),
  resetSim: () =>
    set((s) => ({ playing: false, time: 0, engineVersion: s.engineVersion + 1, trailVersion: s.trailVersion + 1 })),
  setScenePanel: (scenePanel) => set({ scenePanel }),
  loadScene: (snap) =>
    set((s) => {
      const objects = snap.objects
        .map((raw) => sanitizeObject(raw, nextId))
        .filter((o): o is SimObject => o !== null)
      return {
        objects,
        coulombK: snap.fields.coulombK,
        gravity: snap.fields.gravity,
        trailsOn: snap.fields.trailsOn,
        selectedId: null,
        playing: false,
        time: 0,
        engineVersion: s.engineVersion + 1,
        trailVersion: s.trailVersion + 1,
      }
    }),
  setGridOn: (gridOn) => set({ gridOn }),
  triggerResetView: () => set((s) => ({ resetView: s.resetView + 1 })),
  setHelpOn: (helpOn) => set({ helpOn }),
  loadDemo: () =>
    set((s) => {
      const snap = buildDemoSnapshot({ newId: nextId })
      return {
        objects: snap.objects,
        coulombK: snap.fields.coulombK,
        gravity: snap.fields.gravity,
        trailsOn: snap.fields.trailsOn,
        selectedId: null,
        playing: false,
        time: 0,
        timeScale: 1,
        engineVersion: s.engineVersion + 1,
        trailVersion: s.trailVersion + 1,
      }
    }),
}))

export { nextId }
