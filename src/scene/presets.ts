import type { SimObject } from '../types'
import { COLORS } from '../theme'
import type { SceneSnapshot } from './io'

export interface DemoFactory {
  newId: () => string
}

function buildDemoObjects({ newId }: DemoFactory): SimObject[] {
  return [
    {
      id: newId(),
      kind: 'curve',
      name: 'helix',
      color: '#ff6b6b',
      visible: true,
      expr: '(R*sin(t), R*cos(t), vd*t)',
      params: 'R=3, vd=0.9, w=1',
      range: [0, Math.PI * 2 + 0.015],
      samples: 600,
    },
    {
      id: newId(),
      kind: 'surface',
      name: 'saddle',
      color: '#5d9fff',
      visible: true,
      mode: 'explicit',
      expr: '(x*x - y*y) / 3',
      params: '',
      rangeA: [-4, 4],
      rangeB: [-4, 4],
      resolution: [60, 60],
    },
    {
      id: newId(),
      kind: 'point',
      name: 'probe',
      color: COLORS.yellow,
      visible: true,
      size: 0.25,
      position: [2, 1, -1],
      physics: {
        mass: 1,
        charge: 2,
        drag: 1,
        anchored: false,
        velocity: [0.5, 0, 4],
        forces: [{ id: newId(), label: 'F_push', vector: [0, 0, 3] }],
      },
    },
    {
      id: newId(),
      kind: 'point',
      name: 'charge well',
      color: COLORS.pink,
      visible: true,
      size: 0.34,
      position: [4, 1, -1],
      physics: {
        mass: 5,
        charge: -5,
        drag: 0,
        anchored: true,
        velocity: [0, 0, 0],
        forces: [],
      },
    },
  ]
}

export function buildDemoSnapshot({ newId }: DemoFactory): SceneSnapshot {
  return {
    version: 1,
    name: 'physics playground demo',
    fields: { coulombK: 40, gravity: 9.81, trailsOn: true },
    objects: buildDemoObjects({ newId }),
  }
}