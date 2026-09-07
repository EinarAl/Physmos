import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { chargeForceOn, fieldForce, type DynState } from '../physics/engine'
import { frenetFrame } from '../engine/frenet'
import type { CurveObj, PointObj, Vec3 } from '../types'
import { hudCamera } from './hudState'

function fmt(v: number, d = 2): string {
  return v.toFixed(d)
}

function vec(v: Vec3, d = 2): string {
  return `(${fmt(v[0], d)}, ${fmt(v[1], d)}, ${fmt(v[2], d)})`
}

export function SceneHUD() {
  const objects = useStore((s) => s.objects)
  const selectedId = useStore((s) => s.selectedId)
  const frameOn = useStore((s) => s.frameOn)
  const frameT = useStore((s) => s.frameT)
  const playing = useStore((s) => s.playing)
  const coulombK = useStore((s) => s.coulombK)
  const gravity = useStore((s) => s.gravity)
  const livePos = useStore((s) => s.livePos)
  const [cam, setCam] = useState({ az: 0, el: 0 })

  useEffect(() => {
    const id = setInterval(() => {
      setCam({ az: hudCamera.az, el: hudCamera.el })
    }, 150)
    return () => clearInterval(id)
  }, [])

  const selected = objects.find((o) => o.id === selectedId) ?? null

  let netForce: Vec3 | null = null
  let live: Vec3 | null = null
  if (selected?.kind === 'point') {
    const dp = livePos[selected.id]
    live = dp ?? selected.position
    const pts: PointObj[] = objects.filter(
      (o): o is PointObj => o.kind === 'point' && o.visible !== false,
    )
    const dyn: DynState[] = pts.map((o) => ({
      pos: livePos[o.id] ?? o.position,
      vel: o.physics.velocity ?? ([0, 0, 0] as Vec3),
    }))
    const map = new Map<string, DynState>(pts.map((o, i) => [o.id, dyn[i]]))
    const s = [0, 0, 0] as Vec3
    const charge = chargeForceOn(selected, objects, map, coulombK)
    const field = fieldForce(selected, map, gravity)
    for (let i = 0; i < 3; i++) s[i] += charge[i] + field[i]
    for (const row of (selected as { physics: { forces: Array<{ vector: Vec3 }> } }).physics.forces) {
      for (let i = 0; i < 3; i++) s[i] += row.vector[i]
    }
    if (!(selected as { physics: { anchored: boolean } }).physics.anchored) netForce = s
  }

  let fr: { kappa: number; tau: number } | null = null
  if (selected?.kind === 'curve' && frameOn) {
    try {
      fr = frenetFrame(selected as CurveObj, frameT)
    } catch {
      fr = null
    }
  }

  const hasNet = netForce !== null && (Math.abs(netForce[0]) + Math.abs(netForce[1]) + Math.abs(netForce[2])) > 1e-9

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-chip">
          <span className="tag">cam</span>
          <span className="val">
            az {fmt(cam.az, 1)}&deg; &middot; el {fmt(cam.el, 1)}&deg;
          </span>
        </div>
        {live && (
          <div className="hud-chip live">
            <span className="tag">{selected?.name ?? 'point'}</span>
            <span className="val hot">{vec(live)}</span>
          </div>
        )}
        {netForce !== null && (
          <div className="hud-chip">
            <span className="tag">net F</span>
            <span className="val">{hasNet ? vec(netForce) : '(0, 0, 0)'}</span>
            {playing && hasNet && <span className="status-dot live" />}
          </div>
        )}
        {fr !== null && (
          <div className="hud-chip">
            <span className="tag">frame</span>
            <span className="val">
              {'\u03BA'} = {fr.kappa.toFixed(4)} &middot; {'\u03C4'} = {fr.tau.toFixed(4)}
            </span>
          </div>
        )}
      </div>
      <div className="hud-bottom">
        <div className="hud-hint">drag orbit &middot; scroll zoom &middot; right-drag pan</div>
      </div>
    </div>
  )
}