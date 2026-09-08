import type { CurveObj, SurfaceObj, Vec3 } from '../types'
import { buildCurveGeometry, buildSurfaceGeometry } from '../engine/builder'

export interface ChargeSample {
  p: Vec3
  dq: number
}

// Reduce a curve or surface to discrete charge pieces.
//   curve   : broken into segment lengths ds, piece charged lambda*ds at the segment midpoint
//   surface : broken into grid cells of area dA, piece charged sigma*dA at the cell centroid
// In total mode the density is recovered from the geometry first (lambda = Q / length,
// sigma = Q / area) so the integral adds up to exactly Q. Returns null for uncharged
// objects, unbuildable geometry, or degenerate shapes.
export function buildChargeSamples(o: CurveObj | SurfaceObj): ChargeSample[] | null {
  const value = Math.abs(o.charge.value)
  if (value === 0) return null

  const samples: ChargeSample[] = []

  if (o.kind === 'curve') {
    const build = buildCurveGeometry(o)
    if (!build.geometry) return null
    const arr = build.geometry.getAttribute('position').array as Float32Array
    const n = arr.length / 3
    if (n < 2) return null

    let total = 0
    const segs: [Vec3, Vec3, number][] = []
    for (let i = 0; i < n - 1; i++) {
      const ax = arr[i * 3]
      const ay = arr[i * 3 + 1]
      const az = arr[i * 3 + 2]
      const bx = arr[(i + 1) * 3]
      const by = arr[(i + 1) * 3 + 1]
      const bz = arr[(i + 1) * 3 + 2]
      const dx = bx - ax
      const dy = by - ay
      const dz = bz - az
      const ds = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (!Number.isFinite(ds) || ds < 1e-9) continue
      const mid: Vec3 = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]
      segs.push([mid, [dx, dy, dz], ds])
      total += ds
    }
    if (total < 1e-9) return null
    const lambda = o.charge.mode === 'density' ? o.charge.value : o.charge.value / total
    for (const [p, , ds] of segs) samples.push({ p, dq: lambda * ds })
    return samples
  }

  const build = buildSurfaceGeometry(o)
  if (!build.geometry) return null
  const arr = build.geometry.getAttribute('position').array as Float32Array
  const [na, nb] = [Math.max(2, o.resolution[0]), Math.max(2, o.resolution[1])]
  const nx = na + 1
  const P = (i: number, j: number): Vec3 => [arr[(i * nx + j) * 3], arr[(i * nx + j) * 3 + 1], arr[(i * nx + j) * 3 + 2]]

  const triArea = (a: Vec3, b: Vec3, c: Vec3): number => {
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const abz = b[2] - a[2]
    const acx = c[0] - a[0]
    const acy = c[1] - a[1]
    const acz = c[2] - a[2]
    const cx = aby * acz - abz * acy
    const cy = abz * acx - abx * acz
    const cz = abx * acy - aby * acx
    return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz)
  }

  let total = 0
  const cells: { p: Vec3; area: number }[] = []
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      const a = P(i, j)
      const b = P(i, j + 1)
      const c = P(i + 1, j + 1)
      const d = P(i + 1, j)
      const area = triArea(a, b, c) + triArea(a, c, d)
      if (!Number.isFinite(area) || area < 1e-12) continue
      cells.push({ p: [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4], area })
      total += area
    }
  }
  if (total < 1e-9) return null
  const sigma = o.charge.mode === 'density' ? o.charge.value : o.charge.value / total
  for (const cell of cells) samples.push({ p: cell.p, dq: sigma * cell.area })
  return samples
}

// Coulomb force on a point charge from a pile of charge pieces. Each piece acts
// independently inverse-square, so nearer pieces dominate. r is clamped so a probe
// sitting against the sheet keeps a finite field (a real sheet is finite there).
export function distributedChargeForceOn(
  targetQ: number,
  targetPos: Vec3,
  sources: readonly ChargeSample[] | null,
  k: number,
): Vec3 {
  const f: Vec3 = [0, 0, 0]
  if (targetQ === 0 || !sources || sources.length === 0) return f
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    if (s.dq === 0) continue
    const dx = targetPos[0] - s.p[0]
    const dy = targetPos[1] - s.p[1]
    const dz = targetPos[2] - s.p[2]
    let r2 = dx * dx + dy * dy + dz * dz
    if (r2 < 1e-6) r2 = 1e-6
    const r = Math.sqrt(r2)
    const mag = (k * targetQ * s.dq) / r2
    f[0] += (mag * dx) / r
    f[1] += (mag * dy) / r
    f[2] += (mag * dz) / r
  }
  return f
}