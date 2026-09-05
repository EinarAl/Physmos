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