import { classify, evalComponents, evalScalar, sanitizeExpr } from '../src/expr/parse.ts'
import { netForce, chargeForceOn, stepPhysics, fieldForce, electricFieldAt } from '../src/physics/engine.ts'
import { buildChargeSamples, distributedChargeForceOn } from '../src/physics/charge.ts'
import { traceFieldLines, fibonacciSphere, fieldArrows, fieldFade, arrowExtent } from '../src/physics/field.ts'
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

// --- hidden points "do not exist" ---
const hiddenSink = { ...cb, visible: false }
check('hidden object exerts no charge', JSON.stringify(chargeForceOn(ca, [ca, hiddenSink], dynC, 40)) === JSON.stringify([0, 0, 0]))
check('hidden object receives no charge', JSON.stringify(chargeForceOn(hiddenSink, [ca, hiddenSink], dynC, 40)) === JSON.stringify([0, 0, 0]))
const hiddenFree = { ...point, visible: false }
check('hidden object feels no fields', JSON.stringify(fieldForce(hiddenFree, dynC, 9.81)) === JSON.stringify([0, 0, 0]))
const dynH = new Map([['p1', { pos: [3, 4, 5], vel: [0, 0, 10] }]])
stepPhysics([{ ...point, visible: false, physics: { mass: 1, drag: 0, anchored: false, charge: 0, velocity: [0, 0, 10], forces: [] } } as any], dynH, 0.05, 0, 9.81)
check('hidden point never steps', dynH.get('p1').pos[0] === 3 && dynH.get('p1').pos[1] === 4 && dynH.get('p1').pos[2] === 5 && dynH.get('p1').vel[2] === 10)

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
import { buildSurfaceGeometry, buildSurfaceContours } from '../src/engine/builder.ts'
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

// --- M10: topological contour lines ---
const saddleBuild = buildSurfaceGeometry({
  kind: 'surface', id: 't0', name: 's', visible: true, color: '#5d9fff',
  mode: 'explicit', expr: 'x*y', rangeA: [-4, 4], rangeB: [-4, 4], resolution: [60, 60], params: '',
} as never)
const contours = saddleBuild.geometry ? buildSurfaceContours(saddleBuild.geometry, 60, 60, 7) : null
check('contours built for saddle', contours !== null)
const cArr = contours?.getAttribute('position').array as Float32Array
check('contours emit paired segments', !!cArr && cArr.length % 6 === 0 && cArr.length > 100)
let onLevel = true
for (let k = 0; k < cArr.length; k += 3) {
  const z = cArr[k + 2]
  const nearest = Math.min(...Array.from({ length: 7 }, (_, m) => {
    const c = -16 + ((16 - -16) * m) / 6
    return Math.abs(z - c)
  }))
  if (nearest > 1e-3) onLevel = false
}
check('contour endpoints lie on iso levels', onLevel)
const cx = saddleBuild.geometry ? buildSurfaceContours(saddleBuild.geometry, 60, 60, 5, 0) : null
const cy = saddleBuild.geometry ? buildSurfaceContours(saddleBuild.geometry, 60, 60, 5, 1) : null
check('zy-slice contours built (x isovalues)', !!cx && cx.getAttribute('position').count > 0)
check('zx-slice contours built (y isovalues)', !!cy && cy.getAttribute('position').count > 0)
if (cx) {
  const xArr = cx.getAttribute('position').array as Float32Array
  let onX = true
  for (let k = 0; k < xArr.length; k += 3) {
    const xv = xArr[k]
    const near = Math.min(...Array.from({ length: 5 }, (_, m) => Math.abs(xv - (-4 + (8 * m) / 4))))
    if (near > 1e-3) onX = false
  }
  check('zy-slice endpoints lie on x isovalues', onX)
}
const flat = buildSurfaceGeometry({
  kind: 'surface', id: 't1', name: 'f', visible: true, color: '#5d9fff',
  mode: 'explicit', expr: '0', rangeA: [-2, 2], rangeB: [-2, 2], resolution: [10, 10], params: '',
} as never)
check('flat surface yields no contours', flat.geometry ? buildSurfaceContours(flat.geometry, 10, 10, 5) === null : false)

// --- M11: continuous charge on curves and surfaces ---
const lineObj = {
  kind: 'curve', id: 'cl', name: 'line', visible: true, color: '#ffffff',
  expr: '(t, 0, 0)', params: '', range: [-2, 2] as [number, number], samples: 800,
  charge: { mode: 'total', value: 4 },
} as never
const lineSamples = buildChargeSamples(lineObj)
const lineTotal = lineSamples ? lineSamples.reduce((a, s) => a + s.dq, 0) : 0
check('line total-mode samples conserve Q', lineSamples !== null && Math.abs(lineTotal - 4) < 1e-3)
// classic finite-line result: F = k q Q / (d * sqrt(d^2 + (L/2)^2)), L = 4, d = 1
if (lineSamples) {
  const F = distributedChargeForceOn(1, [0, 1, 0], lineSamples, 1)
  const expect = 4 / Math.sqrt(5)
  check('finite-line force matches closed form', Math.abs(F[1] - expect) / expect < 0.01)
  check('finite-line force is y-directed', Math.abs(F[0]) < 1e-6 && Math.abs(F[2]) < 1e-6 && F[1] > 0)
}
const densityLine = {
  kind: 'curve', id: 'dl', name: 'dl', visible: true, color: '#ffffff',
  expr: '(t, 0, 0)', params: '', range: [-2, 2] as [number, number], samples: 800,
  charge: { mode: 'density', value: 2 },
} as never
const dl = buildChargeSamples(densityLine)
const dlSum = dl ? dl.reduce((a, s) => a + s.dq, 0) : 0
check('density-mode total charge = lambda * L', dl !== null && Math.abs(dlSum - 8) < 1e-3)
if (dl) {
  const F = distributedChargeForceOn(1, [0, 1, 0], dl, 1)
  const expect = 8 / Math.sqrt(5)
  check('density-mode force matches closed form', Math.abs(F[1] - expect) / expect < 0.01)
}
const sheetObj = {
  kind: 'surface', id: 'sh', name: 'sheet', visible: true, color: '#ffffff',
  mode: 'explicit', expr: '0', params: '', rangeA: [-1, 1] as [number, number], rangeB: [-1, 1] as [number, number],
  resolution: [60, 60], contours: { xy: true, xz: true, yz: true },
  charge: { mode: 'total', value: 8 },
} as never
const sheet = buildChargeSamples(sheetObj)
const sheetSum = sheet ? sheet.reduce((a, s) => a + s.dq, 0) : 0
check('surface total-mode samples conserve Q', sheet !== null && Math.abs(sheetSum - 8) / 8 < 1e-4)
if (sheet) {
  const F = distributedChargeForceOn(1, [0, 0, 3], sheet, 1)
  check('sheet force is +z only (symmetry)', Math.abs(F[0]) < 1e-6 && Math.abs(F[1]) < 1e-6 && F[2] > 0)
  // self-consistency: 120x120 refinement close to 60x60 result
  const fine = {
    kind: 'surface', id: 'fh', name: 'fh', visible: true, color: '#ffffff',
    mode: 'explicit', expr: '0', params: '', rangeA: [-1, 1] as [number, number], rangeB: [-1, 1] as [number, number],
    resolution: [120, 120], contours: { xy: true, xz: true, yz: true },
    charge: { mode: 'total', value: 8 },
  } as never
  const fines = buildChargeSamples(fine)
  const Ff = fines ? distributedChargeForceOn(1, [0, 0, 3], fines, 1) : [0, 0, 0]
  check('sheet force converges with refinement', Ff[2] > 0 && Math.abs(Ff[2] - F[2]) / F[2] < 0.02)
}
check('zero charge yields no samples', buildChargeSamples({ ...lineObj, charge: { mode: 'total', value: 0 } }) === null)
const dusty = sanitizeObject({ kind: 'surface', id: 'z', name: 's', expr: 'x' }, () => 'n')
check('sanitize fills charge + contours defaults', dusty !== null && dusty.kind === 'surface' && dusty.charge.mode === 'total' && dusty.charge.value === 0 && dusty.contours.xy === true && dusty.contours.xz === true && dusty.contours.yz === true)
const dustyCurve = sanitizeObject({ kind: 'curve', id: 'z', name: 'c', expr: '(t,t,t)' }, () => 'n')
check('sanitize fills curve charge default', dustyCurve !== null && dustyCurve.kind === 'curve' && dustyCurve.charge.mode === 'total' && dustyCurve.charge.value === 0)

// --- M12: electric field layer (superposed source field) ---
const eig = (pos, objs, dist = new Map()) => electricFieldAt(pos, objs, new Map(), 1, dist)
const ep = {
  id: 'ep', kind: 'point', name: 'ep', color: '#fff', visible: true, size: 0.25, position: [0, 0, 0],
  physics: { mass: 1, anchored: false, velocity: [0, 0, 0], forces: [], charge: 1 },
}
const e1 = eig([3, 4, 0], [{ ...ep }])
check('point-charge E = kq/r^2 radially out', Math.abs(Math.hypot(e1[0], e1[1], e1[2]) - 1 / 25) / (1 / 25) < 1e-6 && e1[0] > 0 && e1[1] > 0)
const eneg = eig([3, 4, 0], [{ ...ep, physics: { ...ep.physics, charge: -1 } }])
check('negative charge E points inward', eneg[0] < 0 && eneg[1] < 0 && Math.abs(eneg[2]) < 1e-9)
const posA = { ...ep, id: 'pa', position: [0, 0, -4] }
const posB = { ...ep, id: 'pb', position: [0, 0, 4] }
const e2 = eig([4, 0, 0], [posA, posB])
const expectDouble = 1 / (16 * Math.sqrt(2))
check('field superposes (equal charges, x-components add)', e2[0] > 0 && Math.abs(e2[0] - expectDouble) / expectDouble < 1e-9 && Math.abs(e2[1]) < 1e-9 && Math.abs(e2[2]) < 1e-9)
const eNull = eig([0, 0, 0], [posA, posB])
check('equal charges cancel midplane', Math.hypot(eNull[0], eNull[1], eNull[2]) < 1e-12)
const eEmpty = eig([0, 0, 0], [])
check('no sources -> zero field', Math.hypot(eEmpty[0], eEmpty[1], eEmpty[2]) < 1e-12)
const eLine = eig([0, 1, 0], [lineObj], new Map([['cl', lineSamples ?? []]]))
check('line-charge E = 4/sqrt(5) up (unit test charge)', eLine[1] > 0 && Math.abs(eLine[1] - 4 / Math.sqrt(5)) / (4 / Math.sqrt(5)) < 0.01 && Math.abs(eLine[0]) < 1e-6 && Math.abs(eLine[2]) < 1e-6)
const eLineNeg = eig([0, 1, 0], [{ ...lineObj, charge: { mode: 'total', value: -4 } }], new Map([['cl', buildChargeSamples({ ...lineObj, charge: { mode: 'total', value: -4 } }) ?? []]]))
check('negative line-charge E points down', eLineNeg[1] < 0 && Math.abs(eLineNeg[1] + 4 / Math.sqrt(5)) / (4 / Math.sqrt(5)) < 0.01)
const eInvisible = eig([1, 2, 3], [{ ...ep, visible: false }])
check('hidden sources contribute no field', Math.hypot(eInvisible[0], eInvisible[1], eInvisible[2]) < 1e-12)

// --- M13: conventional 3D field lines ---
const fib = fibonacciSphere(48)
check('fibonacci sphere yields 48 unit directions', fib.length === 48 && fib.every((d) => Math.abs(Math.hypot(d[0], d[1], d[2]) - 1) < 1e-9))
const fibMean = fib.reduce((a: number[], d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]], [0, 0, 0])
check('fibonacci sphere balanced around origin', Math.hypot(fibMean[0] / 48, fibMean[1] / 48, fibMean[2] / 48) < 0.05)
const q5 = {
  id: 'q5', kind: 'point', name: 'q+', color: '#fff', visible: true, size: 0.25, position: [0, 0, 0],
  physics: { mass: 1, anchored: true, velocity: [0, 0, 0], forces: [], charge: 5 },
}
const flp = traceFieldLines([q5], new Map(), 40)
check('positive point charge spawns lines', flp.length > 4)
check('positive lines stream outward to boundary', flp.every((l) => Math.hypot(l.points[l.points.length - 1][0], l.points[l.points.length - 1][1], l.points[l.points.length - 1][2]) > 8))
check('positive lines carry sign +1', flp.every((l) => l.sign === 1))
check('no opposite charge -> nothing absorbed', flp.every((l) => l.absorbed === false))
const qn5 = { ...q5, id: 'qn', physics: { ...q5.physics, charge: -5 } }
const fln = traceFieldLines([qn5], new Map(), 40)
check('negative point charge spawns lines', fln.length > 4)
check('negative lines trace outward (reversed field)', fln.every((l) => {
  const a = l.points[0]
  const b = l.points[Math.min(2, l.points.length - 1)]
  return Math.hypot(b[0], b[1], b[2]) > Math.hypot(a[0], a[1], a[2]) + 0.05
}))
check('negative lines carry sign -1 (arrows point toward charge)', fln.every((l) => l.sign === -1))
check('negative lines exit to boundary', fln.every((l) => Math.hypot(l.points[l.points.length - 1][0], l.points[l.points.length - 1][1], l.points[l.points.length - 1][2]) > 8))
const dA = { ...q5, id: 'dA', position: [0, 0, -3], physics: { ...q5.physics, charge: 4 } }
const dB = { ...q5, id: 'dB', position: [0, 0, 3], physics: { ...q5.physics, charge: -4 } }
const dipole = traceFieldLines([dA, dB], new Map(), 40, undefined, { seedScale: 2 })
check('dipole: some + lines terminate on the - charge', dipole.filter((l) => l.sign === 1).some((l) => l.absorbed === true))
check('dipole: some - lines terminate on the + charge', dipole.filter((l) => l.sign === -1).some((l) => l.absorbed === true))
check('dipole: remaining + lines stream to infinity', dipole.filter((l) => l.sign === 1).some((l) => l.absorbed === false))
const eC = { ...q5, id: 'eC', position: [0, 0, -3], physics: { ...q5.physics, charge: 4 } }
const eD = { ...q5, id: 'eD', position: [0, 0, 3], physics: { ...q5.physics, charge: 4 } }
const sameSign = traceFieldLines([eC, eD], new Map(), 40)
check('equal charges repel: no absorption', sameSign.every((l) => l.absorbed === false))
const lineField = traceFieldLines([lineObj], new Map(), 40, new Map([['cl', lineSamples ?? []]]))
check('charged curve spawns field lines', lineField.length > 4 && lineField.every((l) => l.sign === 1))
check('uncharged point spawns no lines', traceFieldLines([{ ...q5, physics: { ...q5.physics, charge: 0 } }], new Map(), 40).length === 0)
check('hidden charge spawns no lines', traceFieldLines([{ ...q5, visible: false }], new Map(), 40).length === 0)
const farr = fieldArrows(flp, 0.5)
check('field arrows laid along + lines', farr.length > 0 && farr.every((a) => Math.abs(Math.hypot(a.dir[0], a.dir[1], a.dir[2]) - 1) < 1e-6) && farr.every((a) => a.sign === 1))

// --- M13c: strength-scaled arrow density + fade-to-invisible ---
check('fieldFade is smooth and bounded', fieldFade(0) === 0 && fieldFade(1e9) === 1 && fieldFade(0.5) < fieldFade(1.5) && fieldFade(1.5) < fieldFade(4))
check('fieldFade fades weak field toward invisible', fieldFade(0.1) < 0.08)
check('arrowExtent thins arrows in weak field', arrowExtent(0.1) >= arrowExtent(1) && arrowExtent(1) > arrowExtent(10))
const synthLine = (mag) => ({
  points: Array.from({ length: 20 }, (_, i) => [i * 0.5, 0, 0]),
  mags: Array.from({ length: 19 }, () => mag),
  sign: 1,
  absorbed: false,
})
const ahStrong = fieldArrows([synthLine(10)], 0.5)
const ahWeak = fieldArrows([synthLine(0.1)], 0.5)
check('strong field gets denser arrows than weak field', ahStrong.length > ahWeak.length * 3)
check('dipole mags recorded along traces', flp.length > 0 && flp.every((l) => l.mags.length >= l.points.length - 1 && l.mags.every((m) => Number.isFinite(m) && m > 0)))
const lone = flp[0]
check('field weakens along an escaping line', lone.mags[lone.mags.length - 1] < lone.mags[0])

// --- M13d: symmetry of the field about a symmetric charge ---
const saddleAlone = {
  kind: 'surface', id: 'sy', name: 'sym-saddle', visible: true, color: '#fff',
  mode: 'explicit', expr: '(x*x - y*y) / 3', params: '', rangeA: [-4, 4] as [number, number], rangeB: [-4, 4] as [number, number],
  resolution: [24, 24], contours: { xy: true, xz: true, yz: true },
  charge: { mode: 'total', value: 3 },
} as never
const saddleDist = new Map([['sy', buildChargeSamples(saddleAlone) ?? []]])
const symAt = (p) => electricFieldAt(p, [saddleAlone], new Map(), 40, saddleDist)
const eA = symAt([2, 3, 1])
const eB = symAt([-2, -3, 1])
const eScale = Math.max(Math.hypot(...eA), 1e-12)
check('saddle E field is 180-degree symmetric', Math.abs(eA[0] + eB[0]) < 1e-6 * eScale && Math.abs(eA[1] + eB[1]) < 1e-6 * eScale && Math.abs(eA[2] - eB[2]) < 1e-6 * eScale)
const sLines = traceFieldLines([saddleAlone], new Map(), 40, saddleDist)
const mk = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3) + ',' + p[2].toFixed(3)
const startSet = new Map()
for (const l of sLines) {
  const k = mk(l.points[0])
  startSet.set(k, (startSet.get(k) ?? 0) + 1)
}
let symStarts = 0
for (const l of sLines) {
  const p = l.points[0]
  const k = mk(p)
  const rk = mk([-p[0], -p[1], p[2]])
  const fc = startSet.get(k)
  const rc = startSet.get(rk) ?? 0
  if (rc >= fc) symStarts += fc
}
check('charged saddle field-line pattern is 180-degree symmetric', symStarts >= sLines.length * 0.99, 'matched ' + symStarts + ' of ' + sLines.length)
check('charged saddle still spawns lines', sLines.length > 8)

// --- M13b: hidden curves/surfaces do not exist (visibility = nonexistence) ---
const hiddenLine = { ...lineObj, visible: false }
const hiddenSheet = { ...sheetObj, visible: false }
check('hidden curve spawns no field lines', traceFieldLines([hiddenLine], new Map(), 40, new Map([['cl', lineSamples ?? []]])).length === 0)
check('hidden surface spawns no field lines', traceFieldLines([hiddenSheet], new Map(), 40, new Map([['sh', sheet ?? []]])).length === 0)
check('hidden curve contributes no E field', Math.hypot(eig([0, 1, 0], [hiddenLine], new Map([['cl', lineSamples ?? []]]))[0], eig([0, 1, 0], [hiddenLine], new Map([['cl', lineSamples ?? []]]))[1], eig([0, 1, 0], [hiddenLine], new Map([['cl', lineSamples ?? []]]))[2]) < 1e-12)
check('hidden surface contributes no E field', Math.hypot(eig([0, 0, 3], [hiddenSheet], new Map([['sh', sheet ?? []]]))[0], eig([0, 0, 3], [hiddenSheet], new Map([['sh', sheet ?? []]]))[1], eig([0, 0, 3], [hiddenSheet], new Map([['sh', sheet ?? []]]))[2]) < 1e-12)
const hiddenDist = new Map([['cl', lineSamples ?? []], ['sh', sheet ?? []]])
const hiddenProbe = { ...ep, id: 'hp', position: [0, 1, 0], physics: { ...ep.physics, charge: 1 } }
check('hidden curve exerts no force', JSON.stringify(chargeForceOn(hiddenProbe, [hiddenLine, hiddenSheet], new Map(), 40, hiddenDist)) === JSON.stringify([0, 0, 0]))
check('hidden surface exerts no force', Math.abs(chargeForceOn({ ...ep, id: 'hp2', position: [0, 0, 3], physics: { ...ep.physics, charge: 1 } }, [hiddenSheet], new Map(), 40, new Map([['sh', sheet ?? []]]))[2]) < 1e-12)
const stNow = useStore.getState()
const firstCurve = stNow.objects.find((o) => o.kind === 'curve')
const v0 = stNow.engineVersion
stNow.updateObject(firstCurve.id, { visible: !firstCurve.visible })
check('visibility toggle bumps engine version', useStore.getState().engineVersion === v0 + 1)
const v1 = useStore.getState().engineVersion
useStore.getState().updateObject(firstCurve.id, { charge: { mode: 'density', value: 3 } })
check('charge edit bumps engine version', useStore.getState().engineVersion === v1 + 1)
const v2 = useStore.getState().engineVersion
useStore.getState().updateObject(firstCurve.id, { name: 'renamed' })
check('cosmetic rename skips engine bump', useStore.getState().engineVersion === v2)

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
process.exit(fails === 0 ? 0 : 1)
