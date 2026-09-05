import { create } from 'zustand'
import type { SimObject, Vec3, PhysicsProps } from './types'
import { COLORS } from './theme'

let seq = 1
function nextId(): string {
  return 'o' + seq++
}

function makeInitialObjects(): SimObject[] {
  return [
    {
      id: nextId(),
      kind: 'curve',
      name: 'helix',
      color: '#ff6b6b',
      visible: true,
      expr: '(R*sin(t), R*cos(t), vd*t)',
      params: 'R=3, vd=0.9, w=1',
      range: [0, Math.PI * 2 + 0.015],
      samples: 600,
    },
    {
      id: nextId(),
      kind: 'surface',
      name: 'saddle',
      color: '#5d9fff',
      visible: true,
      mode: 'explicit',
      expr: '(x*x - y*y) / 3',
      params: '',
      rangeA: [-4, 4],
      rangeB: [-4, 4],
      resolution: [60, 60],
    },
    {
      id: nextId(),
      kind: 'point',
      name: 'probe',
      color: COLORS.yellow,
      visible: true,
      size: 0.25,
      position: [2, 1, -1],
      physics: {
        mass: 1,
        charge: 2,
        anchored: false,
        velocity: [0.5, 0, 0.4],
        forces: [{ id: nextId(), label: 'F_push', vector: [0, 0, 3] }],
      },
    },
    {
      id: nextId(),
      kind: 'point',
      name: 'charge well',
      color: COLORS.pink,
      visible: true,
      size: 0.34,
      position: [4, 1, -1],
      physics: {
        mass: 5,
        charge: -5,
        anchored: true,
        velocity: [0, 0, 0],
        forces: [],
      },
    },
  ]
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
  frameOn: boolean
  frameT: number
  select: (id: string | null) => void
  addObject: (o: SimObject) => void
  updateObject: (id: string, patch: ObjectPatch) => void
  removeObject: (id: string) => void
  setPlaying: (p: boolean) => void
  setTime: (t: number) => void
  setLivePos: (rec: Record<string, Vec3>) => void
  setCoulombK: (k: number) => void
  setFrameOn: (on: boolean) => void
  setFrameT: (t: number) => void
  resetSim: () => void
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
  frameOn: false,
  frameT: 0,
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
  setFrameOn: (frameOn) => set({ frameOn }),
  setFrameT: (frameT) => set({ frameT }),
  resetSim: () =>
    set((s) => ({ playing: false, time: 0, engineVersion: s.engineVersion + 1 })),
}))

export { nextId }