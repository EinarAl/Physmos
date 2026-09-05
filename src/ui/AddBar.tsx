import { useState } from 'react'
import { useStore } from '../store'
import { classify, evalComponents, sanitizeExpr } from '../expr/parse'
import type { SimObject } from '../types'
import { nextId } from '../store'

function colorAt(n: number): string {
  const palette = ['#5dff7d', '#5d9fff', '#c58aff', '#ffa34d', '#4dd7c9', '#e8e8e8']
  return palette[n % palette.length]
}

export function AddBar() {
  const addObject = useStore((s) => s.addObject)
  const count = useStore((s) => s.objects.length)
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  function tryAdd() {
    const expr = value.trim()
    const cls = classify(expr)
    if (cls.type === 'invalid') {
      setMsg(cls.reason || 'could not parse expression')
      return
    }
    const base = {
      name: expr.slice(0, 24),
      color: colorAt(count),
      visible: true,
    }
    let obj: SimObject
    if (cls.type === 'point') {
      let p: number[]
      try {
        p = evalComponents(sanitizeExpr(expr), {})
      } catch {
        setMsg('invalid point coordinates')
        return
      }
      if (p.length < 3 || !p.slice(0, 3).every(Number.isFinite)) {
        setMsg('point needs three numbers')
        return
      }
      obj = {
        id: nextId(),
        kind: 'point',
        ...base,
        size: 0.25,
        position: [p[0], p[1], p[2]],
        physics: { mass: 1, charge: 0, drag: 0, anchored: false, velocity: [0, 0, 0], forces: [] },
      }
    } else if (cls.type === 'curve') {
      obj = {
        id: nextId(),
        kind: 'curve',
        ...base,
        expr: cls.expr,
        params: '',
        range: [0, Math.PI * 2 + 0.015],
        samples: 600,
      }
    } else if (cls.type === 'parametric') {
      obj = {
        id: nextId(),
        kind: 'surface',
        ...base,
        mode: 'parametric',
        expr: cls.expr,
        params: '',
        rangeA: [0, Math.PI * 2],
        rangeB: [0, Math.PI],
        resolution: [48, 48],
      }
    } else {
      obj = {
        id: nextId(),
        kind: 'surface',
        ...base,
        mode: 'explicit',
        expr: cls.expr,
        params: '',
        rangeA: [-4, 4],
        rangeB: [-4, 4],
        resolution: [60, 60],
      }
    }
    addObject(obj)
    setValue('')
    setMsg(null)
  }

  function clsHint(v: string): string {
  if (!v.trim()) return 'type (x,y,z), (fx(t),fy(t),fz(t)), or f(x,y) and hit Add'
  const c = classify(v)
  if (c.type === 'invalid') return c.reason || 'unrecognized expression'
  if (c.type === 'point') return 'builds a point (fixed coords)'
  if (c.type === 'curve') return 'builds a parametric curve in t'
  if (c.type === 'parametric') return 'builds a parametric surface in u,v'
  return 'builds an explicit surface f(x,y)'
}

  return (
    <div>
      <div className="addbar">
        <input
          className="text-input"
          placeholder="(sin(t), cos(t), 0)  ·  x*y  ·  (1, 2, 3)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') tryAdd()
          }}
        />
        <button className="btn primary" onClick={tryAdd}>
          Add
        </button>
      </div>
      <div className={msg ? 'add-hint error' : 'add-hint'}>{msg ?? clsHint(value)}</div>
    </div>
  )
}