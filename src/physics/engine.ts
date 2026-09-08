import type { PointObj, SimObject, Vec3 } from '../types'
import { distributedChargeForceOn, type ChargeSample } from './charge'

export interface DynState {
  pos: Vec3
  vel: Vec3
}

export function initDynamics(objects: SimObject[]): Map<string, DynState> {
  const map = new Map<string, DynState>()
  for (const o of objects) {
    if (o.kind !== 'point') continue
    map.set(o.id, {
      pos: [...o.position] as Vec3,
      vel: [...o.physics.velocity] as Vec3,
    })
  }
  return map
}

export function netForce(o: PointObj): Vec3 {
  const f: Vec3 = [0, 0, 0]
  for (const row of o.physics.forces) {
    f[0] += row.vector[0]
    f[1] += row.vector[1]
    f[2] += row.vector[2]
  }
  return f
}

function cpos(o: PointObj, dyn: Map<string, DynState>): Vec3 {
  const st = dyn.get(o.id)
  return st ? st.pos : o.position
}

export function chargeForceOn(
  o: PointObj,
  objects: SimObject[],
  dyn: Map<string, DynState>,
  k: number,
  distMap: ReadonlyMap<string, readonly ChargeSample[]> = new Map(),
): Vec3 {
  const f: Vec3 = [0, 0, 0]
  if (o.physics.charge === 0) return f
  if (o.visible === false) return f
  const p0 = cpos(o, dyn)
  const qt = o.physics.charge
  for (const other of objects) {
    if (other.id === o.id) continue
    if (other.visible === false) continue
    if (other.kind === 'point') {
      if (other.physics.charge === 0) continue
      const p1 = cpos(other, dyn)
      const dx = p0[0] - p1[0]
      const dy = p0[1] - p1[1]
      const dz = p0[2] - p1[2]
      const r2 = dx * dx + dy * dy + dz * dz
      if (r2 < 1e-9) continue
      const r = Math.sqrt(r2)
      const mag = (k * qt * other.physics.charge) / r2
      f[0] += (mag * dx) / r
      f[1] += (mag * dy) / r
      f[2] += (mag * dz) / r
    } else {
      const samples = distMap.get(other.id)
      if (!samples) continue
      const df = distributedChargeForceOn(qt, p0, samples, k)
      f[0] += df[0]
      f[1] += df[1]
      f[2] += df[2]
    }
  }
  return f
}

export function fieldForce(
  o: PointObj,
  dyn: Map<string, DynState>,
  gravity: number,
): Vec3 {
  const f: Vec3 = [0, 0, 0]
  if (o.physics.anchored) return f
  if (o.visible === false) return f
  const m = o.physics.mass > 0 ? o.physics.mass : 1
  if (gravity !== 0) f[2] -= m * gravity
  const c = o.physics.drag ?? 0
  if (c !== 0) {
    const st = dyn.get(o.id)
    const v = st ? st.vel : o.physics.velocity
    f[0] -= c * v[0]
    f[1] -= c * v[1]
    f[2] -= c * v[2]
  }
  return f
}

// Electric field at a point: vector sum of every charged source (point charges
// via live dynamics, curve/surface charge distributions via their sampled dq
// pieces). Field of a unit test charge, E = k * sum(dq / r^2) along r-hat away
// from each source, so positive sources point outward and negative inward.
export function electricFieldAt(
  pos: Vec3,
  objects: SimObject[],
  dyn: Map<string, DynState>,
  k: number,
  distMap: ReadonlyMap<string, readonly ChargeSample[]> = new Map(),
): Vec3 {
  const e: Vec3 = [0, 0, 0]
  for (const other of objects) {
    if (other.visible === false) continue
    if (other.kind === 'point') {
      if (other.physics.charge === 0) continue
      const p1 = cpos(other, dyn)
      const px = pos[0] - p1[0]
      const py = pos[1] - p1[1]
      const pz = pos[2] - p1[2]
      const r2 = px * px + py * py + pz * pz
      if (r2 < 1e-9) continue
      const r = Math.sqrt(r2)
      const m = (k * other.physics.charge) / r2
      e[0] += (m * px) / r
      e[1] += (m * py) / r
      e[2] += (m * pz) / r
    } else {
      const samples = distMap.get(other.id)
      if (!samples || samples.length === 0) continue
      const df = distributedChargeForceOn(1, pos, samples, k)
      e[0] += df[0]
      e[1] += df[1]
      e[2] += df[2]
    }
  }
  return e
}

export function stepPhysics(
  objects: SimObject[],
  dyn: Map<string, DynState>,
  dt: number,
  chargeK = 0,
  gravity = 0,
  distMap: ReadonlyMap<string, readonly ChargeSample[]> = new Map(),
): void {
  const d = Math.min(dt, 0.05)
  for (const o of objects) {
    if (o.kind !== 'point' || o.physics.anchored) continue
    if (o.visible === false) continue
    const st = dyn.get(o.id)
    if (!st) continue
    const m = o.physics.mass > 0 ? o.physics.mass : 1
    const f = netForce(o)
    const ff = fieldForce(o, dyn, gravity)
    f[0] += ff[0]
    f[1] += ff[1]
    f[2] += ff[2]
    if (chargeK !== 0) {
      const qf = chargeForceOn(o, objects, dyn, chargeK, distMap)
      f[0] += qf[0]
      f[1] += qf[1]
      f[2] += qf[2]
    }
    st.vel[0] += (f[0] / m) * d
    st.vel[1] += (f[1] / m) * d
    st.vel[2] += (f[2] / m) * d
    st.pos[0] += st.vel[0] * d
    st.pos[1] += st.vel[1] * d
    st.pos[2] += st.vel[2] * d
  }
}

const UP: Vec3 = [0, 0, 1]

export function directionAsVec(src: Vec3): Vec3 {
  if (src[0] === 0 && src[1] === 0 && src[2] === 0) return UP
  const l = Math.hypot(src[0], src[1], src[2])
  return [src[0] / l, src[1] / l, src[2] / l]
}