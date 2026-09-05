import type { Vec3 } from '../types'

export const TRAIL_MAX = 600

export function appendTrail(buf: Float32Array, n: number, pos: Vec3): number {
  if (n >= TRAIL_MAX) {
    buf.copyWithin(0, 3, n * 3)
    n = TRAIL_MAX - 1
  }
  buf[n * 3] = pos[0]
  buf[n * 3 + 1] = pos[1]
  buf[n * 3 + 2] = pos[2]
  return n + 1
}