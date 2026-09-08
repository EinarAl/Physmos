import type { SimObject, Vec3 } from '../types'
import { buildCurveGeometry, buildSurfaceGeometry } from '../engine/builder'
import { electricFieldAt, type DynState } from './engine'
import type { ChargeSample } from './charge'

// Conventional electric-field diagram in 3D: field lines are continuous curves
// tangent to the superposed E field at every point. Lines originate on positive
// charges and terminate on negative charges (or stream to infinity); arrowheads
// along each line show the field direction (away from +, toward -). In three
// dimensions the lines around each source revolve around it, spherically for
// point charges, radially from lines of charge, and normal to charged sheets.
export const DEFAULT_FIELD_BOUND = 14
export const MAX_POINTS = 320
export const MAX_SEEDS = 240
export const MAX_ARROW_CAP = 1200

const NULL_EPS = 1e-3

// Smooth fade used for line/arrowhead strength: full near strong field, gently
// dropping to ~invisible as |E| falls (no hard cutoff).
export function fieldFade(mag: number): number {
  return clamp(Math.tanh(mag / 2.5), 0, 1)
}

// Arrowhead spacing scale per unit arc: denser where the field is strong,
// sparser where it is weak, so arrow density reads as field strength.
export function arrowExtent(mag: number): number {
  return clamp(8 / (mag + 0.03), 0.45, 6)
}

export interface FieldLine {
  points: Vec3[]
  // magnitude of E at each corresponding point (|E| drives arrow density and
  // the fade-to-invisible as the field weakens far from the sources).
  mags: number[]
  // sign of the originating source; arrowheads point WITH travel for positive
  // sources and AGAINST travel for negative sources (so they always point
  // along E: away from +, toward -).
  sign: 1 | -1
  // true when the line terminated on an opposite-sign point charge (dipole
  // connector); false when it streamed to the domain edge or a null point.
  absorbed: boolean
}

interface FieldSeed {
  origin: Vec3
  sign: 1 | -1
  selfId: string | null
}

export interface FieldTraceOptions {
  seedScale?: number
  bound?: number
  maxSeeds?: number
}

const signOf = (x: number): 1 | -1 => (x < 0 ? -1 : 1)

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

// Golden-angle spiral over the unit sphere: a uniform-ish 3D distribution used
// to revolve the field-line seeds around a point charge.
export function fibonacciSphere(n: number): Vec3[] {
  const out: Vec3[] = []
  if (n <= 0) return out
  const ga = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = ga * i
    out.push([Math.cos(th) * r, y, Math.sin(th) * r])
  }
  return out
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2])
  if (l < 1e-12) return [0, 0, 1]
  return [v[0] / l, v[1] / l, v[2] / l]
}

// Orthonormal basis {u, v} perpendicular to tangent t.
function ringBasis(t: Vec3): { u: Vec3; v: Vec3 } {
  const tn = normalize(t)
  const helper: Vec3 = Math.abs(tn[2]) > 0.92 ? [1, 0, 0] : [0, 0, 1]
  const u = normalize(cross(helper, tn))
  const v = cross(tn, u)
  return { u, v }
}

function pointPos(o: SimObject, dyn: Map<string, DynState>): Vec3 {
  const st = dyn.get(o.id)
  if (st) return st.pos
  if (o.kind !== 'point') return [0, 0, 0]
  return o.position
}

function chargeUsed(o: SimObject): number {
  if (o.kind === 'point') return o.physics.charge
  return o.charge.value
}

function collectSeeds(
  objects: SimObject[],
  dyn: Map<string, DynState>,
  seedScale: number,
): FieldSeed[] {
  const seeds: FieldSeed[] = []
  const ring = clamp(Math.round(5 * seedScale), 3, 12)

  // Per-object seed budget (never more than MAX_SEEDS in total). Decimating the
  // aggregate by list index would punch holes in otherwise symmetric scenes, so
  // the bulk is tuned per object by raising the sample stride instead.
  const charged = objects.filter((o) => o.visible !== false && chargeUsed(o) !== 0 && Number.isFinite(chargeUsed(o)))
  const nCharged = Math.max(1, charged.length)
  const perObj = Math.max(8, Math.floor(MAX_SEEDS / nCharged))

  // Reflection-closed index set along an axis. The cells are keyed by their
  // lower vertex i (0..n-1); reflecting across the surface's symmetry maps
  // cell i -> cell n-i, so the only index sets that stay closed under that map
  // start at 1 (index 0 has no partner inside the cell range). Sampling k and
  // n-k together makes a reflection-symmetric (or 180-degree rotational)
  // charge yield a field-line pattern that is exactly symmetric. Cell indices
  // are kept off the low boundary so every paired cell is a real cell.
  function symAxis(n: number, stride: number): number[] {
    const out: number[] = []
    const lim = Math.floor((n - 1) / 2)
    for (let k = 1; k <= lim; k += stride) {
      const a = k
      const b = n - k
      out.push(a)
      if (b !== a) out.push(b)
    }
    return out
  }

  function seedDir(t: Vec3, ring: number): Vec3[] {
    const { u, v } = ringBasis(t)
    const dirs: Vec3[] = []
    for (let k = 0; k < ring; k++) {
      const ang = (Math.PI * 2 * k) / ring
      dirs.push([Math.cos(ang) * u[0] + Math.sin(ang) * v[0], Math.cos(ang) * u[1] + Math.sin(ang) * v[1], Math.cos(ang) * u[2] + Math.sin(ang) * v[2]])
    }
    return dirs
  }

  for (const o of objects) {
    if (o.visible === false) continue
    const q = chargeUsed(o)
    if (q === 0 || !Number.isFinite(q)) continue
    const sign = signOf(q)

    if (o.kind === 'point') {
      const pos = pointPos(o, dyn)
      const n = clamp(Math.round(seedScale * (6 + 4 * Math.abs(q))), 4, Math.min(64, perObj))
      const rStart = 0.55 + 0.6 * o.size
      for (const d of fibonacciSphere(n)) {
        seeds.push({ origin: [pos[0] + d[0] * rStart, pos[1] + d[1] * rStart, pos[2] + d[2] * rStart], sign, selfId: o.id })
      }
      continue
    }

    if (o.kind === 'curve') {
      const build = buildCurveGeometry(o)
      if (!build.geometry) continue
      const arr = build.geometry.getAttribute('position').array as Float32Array
      const n = arr.length / 3
      if (n < 2) continue
      // Rotational pairing: sample index on the first half of the curve and
      // again half a period away, so a curve symmetric under a half-turn about
      // the origin (e.g. the helix) seeds an exactly symmetric field pattern.
      const half = Math.floor(n / 2)
      const stride = Math.max(1, Math.ceil((n * ring) / perObj))
      for (let i = 0; i < half && i < n; i += stride) {
        for (const idx of [i, i + half]) {
          const ax = arr[idx * 3]
          const ay = arr[idx * 3 + 1]
          const az = arr[idx * 3 + 2]
          const j2 = Math.min(n - 1, idx + stride)
          const t: Vec3 = [arr[j2 * 3] - ax, arr[j2 * 3 + 1] - ay, arr[j2 * 3 + 2] - az]
          if (Math.hypot(t[0], t[1], t[2]) < 1e-6) continue
          for (const dir of seedDir(t, ring)) {
            seeds.push({ origin: [ax + dir[0] * 0.32, ay + dir[1] * 0.32, az + dir[2] * 0.32], sign, selfId: o.id })
          }
        }
      }
      continue
    }

    const build = buildSurfaceGeometry(o)
    if (!build.geometry) continue
    const arr = build.geometry.getAttribute('position').array as Float32Array
    const [na0, nb0] = o.resolution
    const na = Math.max(2, na0)
    const nb = Math.max(2, nb0)
    const nx = na + 1
    const P = (i: number, j: number): Vec3 => [arr[(i * nx + j) * 3], arr[(i * nx + j) * 3 + 1], arr[(i * nx + j) * 3 + 2]]
    let sa = clamp(Math.round(5 * seedScale), 3, 12)
    let sb = sa
    let ia = symAxis(na, sa)
    let ib = symAxis(nb, sb)
    const cellBudget = Math.max(4, Math.floor(perObj / 2))
    for (let g = 0; g < 8 && ia.length * ib.length > cellBudget; g++) {
      if (ia.length >= ib.length) {
        sa = Math.ceil(sa * 1.6)
        ia = symAxis(na, sa)
      } else {
        sb = Math.ceil(sb * 1.6)
        ib = symAxis(nb, sb)
      }
    }
    for (const i of ia) {
      for (const j of ib) {
        const a = P(i, j)
        const cu = P(Math.min(na, i + sa), j)
        const cd = P(Math.max(0, i - sa), j)
        const cv = P(i, Math.min(nb, j + sb))
        const cw = P(i, Math.max(0, j - sb))
        const nrm = normalize(cross([cu[0] - cd[0], cu[1] - cd[1], cu[2] - cd[2]], [cv[0] - cw[0], cv[1] - cw[1], cv[2] - cw[2]]))
        if (!Number.isFinite(nrm[0])) continue
        for (const s of [1, -1]) {
          const dir: Vec3 = [nrm[0] * s, nrm[1] * s, nrm[2] * s]
          seeds.push({ origin: [a[0] + dir[0] * 0.32, a[1] + dir[1] * 0.32, a[2] + dir[2] * 0.32], sign, selfId: o.id })
        }
      }
    }
  }

  return seeds
}

export function traceFieldLines(
  objects: SimObject[],
  dyn: Map<string, DynState>,
  k: number,
  distMap: ReadonlyMap<string, readonly ChargeSample[]> = new Map(),
  opts: FieldTraceOptions = {},
): FieldLine[] {
  const seedScale = clamp(opts.seedScale ?? 1, 0.4, 4)
  const bound = opts.bound ?? DEFAULT_FIELD_BOUND
  const seeds = collectSeeds(objects, dyn, seedScale)
  const lines: FieldLine[] = []

  // Opposite-sign point charges act as absorbers: a line reaching one stops
  // there, which is what makes dipoles connect proton-to-electron.
  const absorbers: { id: string; pos: Vec3; r: number; sign: 1 | -1 }[] = []
  for (const o of objects) {
    if (o.kind !== 'point' || o.visible === false) continue
    if (o.physics.charge === 0) continue
    absorbers.push({ id: o.id, pos: pointPos(o, dyn), r: 0.75 + 0.8 * o.size, sign: signOf(o.physics.charge) })
  }

  for (const seed of seeds) {
    const pts: Vec3[] = [[seed.origin[0], seed.origin[1], seed.origin[2]]]
    const mags: number[] = []
    let px = seed.origin[0]
    let py = seed.origin[1]
    let pz = seed.origin[2]
    let dPrev: Vec3 | null = null
    let absorbed = false
    let escaped = false

    for (let it = 0; it < MAX_POINTS; it++) {
      const E = electricFieldAt([px, py, pz], objects, dyn, k, distMap)
      const mag = Math.hypot(E[0], E[1], E[2])
      if (!Number.isFinite(mag) || mag < NULL_EPS) break
      mags.push(mag)
      const ex = E[0] / mag
      const ey = E[1] / mag
      const ez = E[2] / mag
      // Positive sources trace outward along E; negative sources trace outward
      // against E (a line "coming in from infinity"), so travel reverses there.
      const dir: Vec3 = seed.sign < 0 ? [-ex, -ey, -ez] : [ex, ey, ez]
      if (dPrev && dPrev[0] * dir[0] + dPrev[1] * dir[1] + dPrev[2] * dir[2] < -0.9) break
      dPrev = dir
      const h = clamp(6 / mag, 0.1, 0.55)
      px += dir[0] * h
      py += dir[1] * h
      pz += dir[2] * h
      pts.push([px, py, pz])
      const rl = Math.hypot(px, py, pz)
      if (rl > bound) {
        escaped = true
        break
      }
      let hit = false
      for (const ab of absorbers) {
        if (ab.id === seed.selfId || ab.sign === seed.sign) continue
        const dx = px - ab.pos[0]
        const dy = py - ab.pos[1]
        const dz = pz - ab.pos[2]
        if (dx * dx + dy * dy + dz * dz < ab.r * ab.r) {
          hit = true
          break
        }
      }
      if (hit) {
        absorbed = true
        break
      }
    }
    if (pts.length >= 4 && (escaped || absorbed || pts.length > 6)) {
      lines.push({ points: pts, mags, sign: seed.sign, absorbed })
    }
  }
  return lines
}

// Convert traced field lines into drawable arrowhead samples: every `interval`
// units of arc (scaled by field strength so heads crowd near sources and thin
// out as the field weakens), a point + direction (aligned so heads point along
// the field). Heads carry the local |E| so the renderer can fade them too.
export interface FieldArrow {
  pos: Vec3
  dir: Vec3
  sign: 1 | -1
  absorbed: boolean
  mag: number
}

export function fieldArrows(lines: readonly FieldLine[], interval: number): FieldArrow[] {
  const out: FieldArrow[] = []
  let budget = MAX_ARROW_CAP
  for (const line of lines) {
    const pts = line.points
    const mags = line.mags
    let acc = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dir = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
      if (!Number.isFinite(dir[0])) continue
      const mag = i < mags.length ? Math.max(mags[i], 1e-6) : 1
      acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      if (acc < interval * arrowExtent(mag)) continue
      acc = 0
      if (budget <= 0) return out
      budget--
      const mx = (a[0] + b[0]) / 2
      const my = (a[1] + b[1]) / 2
      const mz = (a[2] + b[2]) / 2
      // Negative-source lines were traced opposite E, so the head points back.
      const head: Vec3 = line.sign < 0 ? [-dir[0], -dir[1], -dir[2]] : dir
      out.push({ pos: [mx, my, mz], dir: head, sign: line.sign, absorbed: line.absorbed, mag })
    }
  }
  return out
}