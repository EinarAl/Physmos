import * as THREE from 'three'
import type { CurveObj, SurfaceObj } from '../types'
import { evalComponents, evalScalar, parseParams } from '../expr/parse'

export type BuildResult = {
  geometry: THREE.BufferGeometry | null
  error?: string
}

export function buildCurveGeometry(o: CurveObj): BuildResult {
  const params = parseParams(o.params)
  const [lo, hi] = o.range
  const n = Math.max(2, Math.floor(o.samples))
  const pos = new Float32Array((n + 1) * 3)
  try {
    for (let i = 0; i <= n; i++) {
      const t = lo + ((hi - lo) * i) / n
      const c = evalComponents(o.expr, { t, ...params })
      if (c.length < 3 || !c.slice(0, 3).every(Number.isFinite)) {
        throw new Error('curve component out of range at t=' + t.toFixed(3))
      }
      pos[i * 3] = c[0]
      pos[i * 3 + 1] = c[1]
      pos[i * 3 + 2] = c[2]
    }
  } catch (err) {
    return { geometry: null, error: String(err) }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return { geometry }
}

export function buildSurfaceGeometry(o: SurfaceObj): BuildResult {
  const params = parseParams(o.params)
  const [a0, a1] = o.rangeA
  const [b0, b1] = o.rangeB
  const [na, nb] = [Math.max(2, o.resolution[0]), Math.max(2, o.resolution[1])]
  const nx = na + 1
  const ny = nb + 1
  const pos = new Float32Array(nx * ny * 3)
  try {
    for (let i = 0; i <= na; i++) {
      const a = a0 + ((a1 - a0) * i) / na
      for (let j = 0; j <= nb; j++) {
        const b = b0 + ((b1 - b0) * j) / nb
        const idx = (i * nx + j) * 3
        let c: number[]
        if (o.mode === 'explicit') {
          const z = evalScalar(o.expr, { x: a, y: b, ...params })
          c = [a, b, z]
        } else {
          c = evalComponents(o.expr, { u: a, v: b, ...params })
          if (c.length < 3) throw new Error('parametric surface needs 3 components')
        }
        if (!c.slice(0, 3).every(Number.isFinite)) {
          throw new Error('surface out of range at (' + a.toFixed(2) + ', ' + b.toFixed(2) + ')')
        }
        pos[idx] = c[0]
        pos[idx + 1] = c[1]
        pos[idx + 2] = c[2]
      }
    }
  } catch (err) {
    return { geometry: null, error: String(err) }
  }

  const index: number[] = []
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      const a = i * nx + j
      const b = a + 1
      const c = (i + 1) * nx + j
      const d = c + 1
      index.push(a, b, c, b, d, c)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return { geometry }
}

// Topological contour lines: isoclines of one coordinate traced over the surface
// grid via marching squares, returned as a lineSegments position buffer.
// fieldIdx selects the isovalue coordinate: 0 = x (zy-plane slices), 1 = y (zx-plane slices), 2 = z (xy-plane slices).
// na/nb must match the geometry layout (row-major, stride na+1).
export function buildSurfaceContours(
  geometry: THREE.BufferGeometry,
  na: number,
  nb: number,
  levels = 7,
  fieldIdx = 2,
): THREE.BufferGeometry | null {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  if (!pos) return null
  const arr = pos.array as Float32Array
  const nx = na + 1
  const p = (i: number, j: number): number => (i * nx + j) * 3

  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i <= na; i++) {
    for (let j = 0; j <= nb; j++) {
      const v = arr[p(i, j) + fieldIdx]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-6) return null

  const out: number[] = []
  for (let k = 0; k < levels; k++) {
    const c = lo + ((hi - lo) * k) / (levels - 1)
    for (let i = 0; i < na; i++) {
      for (let j = 0; j < nb; j++) {
        const a = p(i, j)
        const b = p(i, j + 1)
        const c2 = p(i + 1, j)
        const d = p(i + 1, j + 1)
        const cross = (p1: number, p2: number): [number, number, number] | null => {
          const v1 = arr[p1 + fieldIdx]
          const v2 = arr[p2 + fieldIdx]
          if ((v1 < c) === (v2 < c)) return null
          const t = (c - v1) / (v2 - v1)
          const pt: [number, number, number] = [
            arr[p1] + (arr[p2] - arr[p1]) * t,
            arr[p1 + 1] + (arr[p2 + 1] - arr[p1 + 1]) * t,
            arr[p1 + 2] + (arr[p2 + 2] - arr[p1 + 2]) * t,
          ]
          pt[fieldIdx] = c
          return pt
        }
        const pts: [number, number, number][] = []
        for (const [e1, e2] of [
          [a, b],
          [a, c2],
          [c2, d],
          [b, d],
        ] as const) {
          const pt = cross(e1, e2)
          if (pt) pts.push(pt)
        }
        if (pts.length === 2) {
          out.push(...pts[0], ...pts[1])
        }
      }
    }
  }
  if (out.length === 0) return null
  const g2 = new THREE.BufferGeometry()
  g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3))
  return g2
}