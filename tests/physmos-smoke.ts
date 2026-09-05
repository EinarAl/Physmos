import { classify, evalComponents, evalScalar, sanitizeExpr } from '../src/expr/parse.ts'
import { netForce, chargeForceOn, stepPhysics, fieldForce } from '../src/physics/engine.ts'
import { parseScene, sanitizeObject } from '../src/scene/io.ts'
import { useStore } from '../src/store.ts'
import { frenetFrame } from '../src/engine/frenet.ts'

let fails = 0
function check(name, cond, extra = '') {
  const ok = cond
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  ' + extra))
  if (!ok) fails++
}

// --- expr parse ---
check('curve classify', classify('(R*sin(t), R*cos(t), vd*t)').type === 'curve')
check('surface explicit', classify('x*y + sin(x)').type === 'explicit')
check('surface parametric', classify('(u*cos(v), u*sin(v), u)').type === 'parametric')
check('point classify', classify('(1, 2, 3)').type === 'point')
check('greek pi', evalScalar(sanitizeExpr('\u03c0'), {}) === Math.PI)
check('sin(t)', Math.abs(evalScalar(sanitizeExpr('sin(t)'), { t: Math.PI / 2 }) - 1) < 1e-12)
check(
  'curve eval',
  evalComponents(sanitizeExpr('(R*sin(t), R*cos(t), vd*t)'), { t: Math.PI / 2, R: 3, vd: 0.9 })[0]
    === 3,
)
check(
  'explicit eval',
  evalScalar(sanitizeExpr('x*y'), { x: 2, y: 3 }) === 6,
)
check(
  'omega rebound',
  evalScalar(sanitizeExpr('\u03c9*t'), { t: 2, w: 1 }) === 2,
)

// --- physics ---
const point = {
  id: 'p1',
  kind: 'point',
  name: 'probe',
  color: '#ffffff',
  visible: true,
  size: 0.25,
  position: [0, 0, 0],
  physics: { mass: 2, anchored: false, velocity: [1, 0, 0], forces: [{ id: 'f1', label: 'F', vector: [0, 0, 4] }] },
}
check('netForce', JSON.stringify(netForce(point)) === JSON.stringify([0, 0, 4]))
const dyn = new Map([['p1', { pos: [0, 0, 0], vel: [1, 0, 0] }]])
stepPhysics([point], dyn, 1)
check('accel per clamped 0.05s step (a=F/m=2)', dyn.get('p1').vel[2] === 0.1)
check('vel x preserved', dyn.get('p1').vel[0] === 1)
const ok2 = Math.abs(dyn.get('p1').pos[0] - 0.05) < 1e-12 && Math.abs(dyn.get('p1').pos[2] - 0.005) < 1e-12
check('pos advanced', ok2)
const anchored = { ...point, physics: { ...point.physics, anchored: true } }
const dyn2 = new Map([['p1', { pos: [0, 0, 0], vel: [5, 0, 0] }]])
stepPhysics([anchored], dyn2, 1)
check('anchored immobile', dyn2.get('p1').pos[0] === 0 && dyn2.get('p1').vel[0] === 5)

// --- charge interaction ---
const ca = {
  id: 'ca',
  kind: 'point',
  name: 'charger',
  color: '#ffffff',
  visible: true,
  size: 0.25,
  position: [0, 0, 0],
  physics: { mass: 1, charge: 2, anchored: false, velocity: [0, 0, 0], forces: [] },
}
const cb = {
  id: 'cb',
  kind: 'point',
  name: 'sink',
  color: '#ffffff',
  visible: true,
  size: 0.34,
  position: [1, 0, 0],
  physics: { mass: 5, charge: -3, anchored: true, velocity: [0, 0, 0], forces: [] },
}
const dynC = new Map([
  ['ca', { pos: [0, 0, 0], vel: [0, 0, 0] }],
  ['cb', { pos: [1, 0, 0], vel: [0, 0, 0] }],
])
const fa = chargeForceOn(ca, [ca, cb], dynC, 40)
check('same distance force magnitude', Math.abs(fa[0] - 240) < 1e-9 && fa[1] === 0 && fa[2] === 0)
check('sink exerts no self force', JSON.stringify(chargeForceOn(cb, [cb], dynC, 40)) === JSON.stringify([0, 0, 0]))
const fr = chargeForceOn(ca, [ca, cb], dynC, 40)
check('attraction pulls toward sink (+x)', fr[0] > 0)
const tier = { ...cb, physics: { ...cb.physics, charge: 0 } }
check('neutral pair no force', JSON.stringify(chargeForceOn(ca, [ca, tier], dynC, 40)) === JSON.stringify([0, 0, 0]))
const dynS = new Map([
  ['ca', { pos: [0, 0, 0], vel: [0, 0, 0] }],
  ['cb', { pos: [1, 0, 0], vel: [0, 0, 0] }],
])
stepPhysics([ca, cb], dynS, 1, 40)
check('charged mover accelerates toward sink', dynS.get('ca').vel[0] > 0)
check('k=0 disables charge force', chargeForceOn(ca, [ca, cb], dynC, 0)[0] === 0)

// --- Frenet frame (Problem 9 checks) ---
const circle: any = {
  id: 'c1', kind: 'curve', name: 'circle', color: '#fff', visible: true,
  expr: '(R*cos(t), R*sin(t), 0)', params: 'R=2', range: [0, 6.28319], samples: 100,
}
const circleFrame = frenetFrame(circle, Math.PI / 2)
check('circle kappa = 1/R', circleFrame && Math.abs(circleFrame.kappa - 0.5) < 1e-4)
check('circle tau = 0 (planar)', circleFrame && Math.abs(circleFrame.tau) < 1e-6)
check('circle T unit, B along z', circleFrame && Math.abs(Math.hypot(...circleFrame.T) - 1) < 1e-6 && Math.abs(circleFrame.B[2]) > 0.999)
const helix: any = {
  id: 'c2', kind: 'curve', name: 'helix', color: '#fff', visible: true,
  expr: '(R*sin(t), R*cos(t), vd*t)', params: 'R=3, vd=0.9', range: [0, 6.3], samples: 200,
}
const hf = frenetFrame(helix, Math.PI / 2)
check('helix T unit', hf && Math.abs(Math.hypot(...hf.T) - 1) < 1e-6)
check('helix kappa = R/(R^2+vd^2)', hf && Math.abs(hf.kappa - 3 / 9.81) < 1e-3)
check('helix tau negative (left handed)', hf && Math.abs(hf.tau + 0.9 / 9.81) < 1e-3)
check('helix B dips (left handed)', hf && hf.B[2] < 0)
const ortho = hf && Math.abs(hf.T[0] * hf.B[0] + hf.T[1] * hf.B[1] + hf.T[2] * hf.B[2]) < 1e-6
check('T and B orthogonal', ortho)
const line: any = { ...circle, expr: '(t, 2*t, 0)', params: '', range: [0, 1], samples: 10 }
check('line has no frame (degenerate)', frenetFrame(line, 0.5) === null)

// --- trails ring buffer ---
import { appendTrail, TRAIL_MAX } from '../src/scene/trails.ts'
const tb = new Float32Array(TRAIL_MAX * 3)
let tn = 0
for (let i = 0; i < TRAIL_MAX + 5; i++) tn = appendTrail(tb, tn, [i, 0, 0])
check('trail caps at TRAIL_MAX', tn === TRAIL_MAX)
check('oldest sample dropped after cap', tb[0] === 5)
check('newest sample at tail', tb[(TRAIL_MAX - 1) * 3] === TRAIL_MAX + 4)
const tb2 = new Float32Array(TRAIL_MAX * 3)
let tn2 = appendTrail(tb2, 0, [7, 8, 9])
check('trail appends in order', tn2 === 1 && tb2[0] === 7 && tb2[1] === 8 && tb2[2] === 9)

// --- force fields: gravity + drag ---
const fg = { ...point, physics: { ...point.physics, mass: 2, drag: 0 } }
const dynG = new Map([['p1', { pos: [0, 0, 0], vel: [0, 0, 10] }]])
const grav = fieldForce(fg, dynG, 9.81)
check('gravity force = m*g down', Math.abs(grav[2] + 2 * 9.81) < 1e-12 && grav[0] === 0 && grav[1] === 0)
const fd = { ...point, physics: { ...point.physics, drag: 0.5 } }
const dynD = new Map([['p1', { pos: [0, 0, 0], vel: [3, 0, 0] }]])
const dff = fieldForce(fd, dynD, 0)
check('drag force = -c*v', JSON.stringify(dff) === JSON.stringify([-1.5, 0, 0]))
const anchoredF = { ...point, physics: { ...point.physics, anchored: true, drag: 2 } }
check('anchored ignores fields', JSON.stringify(fieldForce(anchoredF, dynD, 9.81)) === JSON.stringify([0, 0, 0]))
const dynP = new Map([['p1', { pos: [0, 0, 0], vel: [0, 0, 10] }]])
stepPhysics([{ ...fg, physics: { mass: 1, drag: 0, anchored: false, charge: 0, velocity: [0, 0, 10], forces: [] } } as any], dynP, 0.05, 0, 9.81)
check('gravity decelerates rise by g*dt', Math.abs(dynP.get('p1').vel[2] - (10 - 9.81 * 0.05)) < 1e-9)
const dynDr = new Map([['p1', { pos: [0, 0, 0], vel: [2, 0, 0] }]])
stepPhysics([{ ...point, physics: { mass: 1, drag: 1, anchored: false, charge: 0, velocity: [2, 0, 0], forces: [] } } as any], dynDr, 0.05)
check('drag decelerates motion', Math.abs(dynDr.get('p1').vel[0] - (2 - 2 * 1 * 0.05)) < 1e-9 && dynDr.get('p1').vel[1] === 0)
const dynT = new Map([['p1', { pos: [0, 0, 0], vel: [0, 0, 8] }]])
for (let i = 0; i < 1000; i++) stepPhysics([{ ...point, physics: { mass: 1, drag: 2, anchored: false, charge: 0, velocity: [0, 0, 8], forces: [] } } as any], dynT, 0.05, 0, 9.81)
check('terminal velocity m*g/c downward', Math.abs(dynT.get('p1').vel[2] + 9.81 / 2) < 1e-6)

// --- scene I/O round trip ---
const snap = {
  version: 1,
  name: 'test',
  fields: { coulombK: 12, gravity: 3, trailsOn: false },
  objects: [point, helix, { kind: 'surface', name: 's', expr: '(x*x - y*y) / 3', mode: 'explicit', color: '#fff', visible: true, rangeA: [-4, 4], rangeB: [-4, 4], resolution: [48, 48] }],
} as const
check('parseScene rejects garbage', parseScene('not json') === null)
check('parseScene rejects wrong version', parseScene(JSON.stringify({ ...snap, version: 2 })) === null)
check('parseScene rejects missing objects', parseScene(JSON.stringify({ version: 1, fields: {} })) === null)
const parsed = parseScene(JSON.stringify(snap))
check('performs parseScene round trip', parsed !== null && parsed.objects.length === 3 && parsed.fields.coulombK === 12 && parsed.fields.gravity === 3)
const rawForceId = parsed && (parsed.objects[0] as any).physics.forces[0].id
const makeId = (() => { let n = 0; return () => 'x' + n++ })()
const san = parsed && parsed.objects.map((o) => sanitizeObject(o, makeId))
check('sanitize preserves kinds', san !== null && san.map((o) => o!.kind).join() === 'point,curve,surface')
check('sanitize preserves forces', san && san[0]!.kind === 'point' && JSON.stringify((san[0]! as any).physics.forces[0].vector) === JSON.stringify([0, 0, 4]))
check('sanitize regenerates ids', san !== null && rawForceId !== undefined && (san[0]! as any).physics.forces[0].id !== rawForceId && new Set(san.map((o) => o!.id)).size === 3)
const legacySan = sanitizeObject({ kind: 'point', position: [1, 2, 3] }, (() => { let n = 0; return () => 'L' + n++ })())
check('sanitize fills missing physics defaults', legacySan !== null && legacySan.physics.charge === 0 && legacySan.physics.drag === 0 && legacySan.physics.mass === 1)
const empty = sanitizeObject({ kind: 'wrench' }, () => 'z')
check('sanitize rejects unknown kinds', empty === null)
useStore.getState().loadScene(JSON.parse(JSON.stringify(parsed)))
const loaded = useStore.getState()
check('loadScene replaces scene', loaded.objects.length === 3 && loaded.coulombK === 12 && loaded.gravity === 3 && loaded.trailsOn === false && loaded.playing === false)
useStore.getState().loadScene(JSON.parse(JSON.stringify(parsed)))
const loaded2 = useStore.getState().objects
check('reimport avoids id collisions', new Set(loaded2.map((o) => o.id)).size === 3 && loaded2.every((o) => !loaded.objects.some((p) => p.id === o.id)))
useStore.getState().loadScene(JSON.parse('{"version":1,"fields":{},"objects":[]}'))
const store2 = useStore.getState().objects.length
check('loadScene tolerates empty objects', store2 === 0)

// --- M7: timeScale, grid, view reset, demo reload ---
check('timeScale defaults to 1', useStore.getState().timeScale === 1)
useStore.getState().setTimeScale(0.5)
check('setTimeScale stores value', useStore.getState().timeScale === 0.5)
useStore.getState().setTimeScale(1)
check('gridOn defaults true, toggles', useStore.getState().gridOn === true && (useStore.getState().setGridOn(false), useStore.getState().gridOn === false))
useStore.getState().setGridOn(true)
const rv0 = useStore.getState().resetView
useStore.getState().triggerResetView()
check('triggerResetView bumps counter', useStore.getState().resetView === rv0 + 1)
useStore.getState().loadDemo()
const demo = useStore.getState()
check('loadDemo restores 4 objects after empty', demo.objects.length === 4 && demo.playing === false && demo.time === 0)
check('loadDemo restores field defaults', demo.coulombK === 40 && demo.gravity === 9.81 && demo.trailsOn === true && demo.timeScale === 1)
const demoKinds = useStore.getState().objects.map((o) => o.kind).sort().join()
check('loadDemo has helix saddle probe sink', demoKinds === 'curve,point,point,surface' && (useStore.getState().objects.some((o) => o.kind === 'point' && o.name === 'charge well')))

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
