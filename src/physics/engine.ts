import type { PointObj, SimObject, Vec3 } from '../types'

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
): Vec3 {
  const f: Vec3 = [0, 0, 0]
  if (o.physics.charge === 0) return f
  const p0 = cpos(o, dyn)
  for (const other of objects) {
    if (other.kind !== 'point' || other.id === o.id) continue
    if (other.physics.charge === 0) continue
    const p1 = cpos(other, dyn)
    const dx = p0[0] - p1[0]
    const dy = p0[1] - p1[1]
    const dz = p0[2] - p1[2]
    const r2 = dx * dx + dy * dy + dz * dz
    if (r2 < 1e-9) continue
    const r = Math.sqrt(r2)
    const mag = (k * o.physics.charge * other.physics.charge) / r2
    f[0] += (mag * dx) / r
    f[1] += (mag * dy) / r
    f[2] += (mag * dz) / r
  }
  return f
}

export function stepPhysics(
  objects: SimObject[],
  dyn: Map<string, DynState>,
  dt: number,
  chargeK = 0,
): void {
  const d = Math.min(dt, 0.05)
  for (const o of objects) {
    if (o.kind !== 'point' || o.physics.anchored) continue
    const st = dyn.get(o.id)
    if (!st) continue
    const m = o.physics.mass > 0 ? o.physics.mass : 1
    const f = netForce(o)
    if (chargeK !== 0) {
      const qf = chargeForceOn(o, objects, dyn, chargeK)
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