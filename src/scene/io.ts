import type { SimObject, PointObj, CurveObj, SurfaceObj, Vec3, ChargeProps, ContourToggles } from '../types'
import { DEFAULT_CHARGE, DEFAULT_CONTOURS } from '../types'

export interface SceneFields {
  coulombK: number
  gravity: number
  trailsOn: boolean
  fieldOn: boolean
  fieldSpacing: number
}

export interface SceneSnapshot {
  version: 1
  name: string
  fields: SceneFields
  objects: SimObject[]
}

export interface AppStateSource {
  objects: SimObject[]
  coulombK: number
  gravity: number
  trailsOn: boolean
  fieldOn: boolean
  fieldSpacing: number
}

export function serializeScene(state: AppStateSource): string {
  const snap: SceneSnapshot = {
    version: 1,
    name: 'physmos scene',
    fields: {
      coulombK: state.coulombK,
      gravity: state.gravity,
      trailsOn: state.trailsOn,
      fieldOn: state.fieldOn,
      fieldSpacing: state.fieldSpacing,
    },
    objects: state.objects.map((o) => {
      const { error, ...rest } = o as { error?: string }
      void error
      return rest as SimObject
    }),
  }
  return JSON.stringify(snap, null, 2)
}

function num(n: unknown, fallback: number): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

function vec3(v: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(v) || v.length < 3) return fallback
  return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])]
}

function sanitizeCharge(raw: unknown): ChargeProps {
  const c = raw as Record<string, unknown> | null
  if (!c || typeof c !== 'object') return { ...DEFAULT_CHARGE }
  return {
    mode: c.mode === 'density' ? 'density' : 'total',
    value: num(c.value, 0),
  }
}

function sanitizeContours(raw: unknown): ContourToggles {
  const c = raw as Record<string, unknown> | null
  if (!c || typeof c !== 'object') return { ...DEFAULT_CONTOURS }
  return {
    xy: c.xy !== false,
    xz: c.xz !== false,
    yz: c.yz !== false,
  }
}

export function sanitizeObject(raw: unknown, newId: () => string): SimObject | null {
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const name = typeof o.name === 'string' ? o.name : o.kind === 'point' ? 'point' : o.kind === 'curve' ? 'curve' : 'surface'
  const visible = o.visible !== false
  const color = typeof o.color === 'string' ? o.color : '#ffffff'

  if (o.kind === 'point') {
    const p = o as Record<string, unknown>
    const phys = (p.physics ?? {}) as Record<string, unknown>
    const forcesRaw = Array.isArray(phys.forces) ? phys.forces : []
    const forces = forcesRaw.map((f) => {
      const row = f as Record<string, unknown>
      return {
        id: newId(),
        label: typeof row.label === 'string' ? row.label : 'F',
        vector: vec3(row.vector, [0, 0, 1]),
      }
    })
    const point: PointObj = {
      id: newId(),
      kind: 'point',
      name,
      color,
      visible,
      size: num(p.size, 0.25),
      position: vec3(p.position, [0, 0, 0]),
      physics: {
        mass: num(phys.mass, 1),
        charge: num(phys.charge, 0),
        drag: num(phys.drag, 0),
        anchored: phys.anchored === true,
        velocity: vec3(phys.velocity, [0, 0, 0]),
        forces,
      },
    }
    return point
  }

  if (o.kind === 'curve' && typeof o.expr === 'string') {
    const curve: CurveObj = {
      id: newId(),
      kind: 'curve',
      name,
      color,
      visible,
      expr: o.expr,
      params: typeof o.params === 'string' ? o.params : '',
      range: [num((o.range as unknown[])?.[0], 0), num((o.range as unknown[])?.[1], Math.PI * 2 + 0.015)] as [number, number],
      samples: Math.max(10, num((o as Record<string, unknown>).samples, 200)),
      charge: sanitizeCharge((o as Record<string, unknown>).charge),
    }
    return curve
  }

  if (o.kind === 'surface' && typeof o.expr === 'string') {
    const s = o as Record<string, unknown>
    const surface: SurfaceObj = {
      id: newId(),
      kind: 'surface',
      name,
      color,
      visible,
      mode: s.mode === 'parametric' ? 'parametric' : 'explicit',
      expr: o.expr,
      params: typeof o.params === 'string' ? o.params : '',
      rangeA: [num((s.rangeA as unknown[])?.[0], -4), num((s.rangeA as unknown[])?.[1], 4)] as [number, number],
      rangeB: [num((s.rangeB as unknown[])?.[0], -4), num((s.rangeB as unknown[])?.[1], 4)] as [number, number],
      resolution: [Math.max(4, num((s.resolution as unknown[])?.[0], 48)), Math.max(4, num((s.resolution as unknown[])?.[1], 48))] as [number, number],
      contours: sanitizeContours(s.contours),
      charge: sanitizeCharge(s.charge),
    }
    return surface
  }

  return null
}

export function parseScene(text: string): SceneSnapshot | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const r = raw as Record<string, unknown> | null
  if (!r || typeof r !== 'object') return null
  if (r.version !== 1) return null
  if (!Array.isArray(r.objects)) return null
  const f = (r.fields ?? {}) as Record<string, unknown>
  return {
    version: 1,
    name: typeof r.name === 'string' ? r.name : 'physmos scene',
    fields: {
      coulombK: num(f.coulombK, 0),
      gravity: num(f.gravity, 0),
      trailsOn: f.trailsOn === true,
      fieldOn: f.fieldOn === true,
      fieldSpacing: num(f.fieldSpacing, 3),
    },
    objects: r.objects,
  }
}