import type { CurveObj, Vec3 } from '../types'
import { evalComponents, parseParams } from '../expr/parse'

export interface FrenetState {
  pos: Vec3
  T: Vec3
  N: Vec3
  B: Vec3
  kappa: number
  tau: number
}

function r(o: CurveObj, t: number): Vec3 {
  const vals = evalComponents(o.expr, { ...parseParams(o.params), t })
  return [vals[0] ?? 0, vals[1] ?? 0, vals[2] ?? 0]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function den(o: CurveObj, t: number, order: number): Vec3 {
  const span = Math.max(o.range[1] - o.range[0], 1e-6)
  const h = Math.max(1e-5, span * 1e-4)
  if (order === 1) {
    const a = r(o, t + h)
    const b = r(o, t - h)
    return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h), (a[2] - b[2]) / (2 * h)]
  }
  if (order === 2) {
    const a = r(o, t + h)
    const b = r(o, t)
    const c = r(o, t - h)
    return [(a[0] - 2 * b[0] + c[0]) / (h * h), (a[1] - 2 * b[1] + c[1]) / (h * h), (a[2] - 2 * b[2] + c[2]) / (h * h)]
  }
  const a = r(o, t + 2 * h)
  const b = r(o, t + h)
  const c = r(o, t - h)
  const d = r(o, t - 2 * h)
  return [(a[0] - 2 * b[0] + 2 * c[0] - d[0]) / (2 * h * h * h), (a[1] - 2 * b[1] + 2 * c[1] - d[1]) / (2 * h * h * h), (a[2] - 2 * b[2] + 2 * c[2] - d[2]) / (2 * h * h * h)]
}

export function frenetFrame(o: CurveObj, t: number): FrenetState | null {
  const rp = den(o, t, 1)
  const n1 = Math.hypot(rp[0], rp[1], rp[2])
  if (n1 < 1e-12) return null
  const T: Vec3 = [rp[0] / n1, rp[1] / n1, rp[2] / n1]
  const rpp = den(o, t, 2)
  const c = cross(rp, rpp)
  const n2 = Math.hypot(c[0], c[1], c[2])
  if (n2 < 1e-12) return null
  const B: Vec3 = [c[0] / n2, c[1] / n2, c[2] / n2]
  const N = cross(B, T)
  const rppp = den(o, t, 3)
  const kappa = n2 / (n1 * n1 * n1)
  const tau = dot(c, rppp) / (n2 * n2)
  return { pos: r(o, t), T, N, B, kappa, tau }
}