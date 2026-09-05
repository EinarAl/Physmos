export type Vec3 = [number, number, number]

export type SimKind = 'point' | 'curve' | 'surface'

export interface ForceRow {
  id: string
  label: string
  vector: Vec3
}

export interface PhysicsProps {
  mass: number
  charge: number
  anchored: boolean
  velocity: Vec3
  forces: ForceRow[]
}

export interface PointObj {
  id: string
  kind: 'point'
  name: string
  color: string
  visible: boolean
  size: number
  position: Vec3
  physics: PhysicsProps
  error?: string
}

export interface CurveObj {
  id: string
  kind: 'curve'
  name: string
  color: string
  visible: boolean
  expr: string
  params: string
  range: [number, number]
  samples: number
  error?: string
}

export interface SurfaceObj {
  id: string
  kind: 'surface'
  name: string
  color: string
  visible: boolean
  mode: 'explicit' | 'parametric'
  expr: string
  params: string
  rangeA: [number, number]
  rangeB: [number, number]
  resolution: [number, number]
  error?: string
}

export type SimObject = PointObj | CurveObj | SurfaceObj

export const DEFAULT_CURVE_EXPR = '(sin(t), cos(t), 0)'
export const DEFAULT_PARAM_SURFACE_EXPR = '(u*cos(v), u*sin(v), u)'
export const DEFAULT_SURFACE_EXPR = 'sin(x)*cos(y)'
export const DEFAULT_PARAMS = 'R=3, vd=0.9, w=1'