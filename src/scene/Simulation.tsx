import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { SimObject, PointObj, CurveObj, SurfaceObj, Vec3 } from '../types'
import { buildCurveGeometry, buildSurfaceContours, buildSurfaceGeometry } from '../engine/builder'
import { frenetFrame } from '../engine/frenet'
import { appendTrail, TRAIL_MAX } from './trails'
import { useStore } from '../store'
import { directionAsVec, chargeForceOn, stepPhysics, fieldForce, type DynState } from '../physics/engine'
import { buildChargeSamples, type ChargeSample } from '../physics/charge'
import { traceFieldLines, fieldArrows, fieldFade, MAX_POINTS, MAX_SEEDS, MAX_ARROW_CAP } from '../physics/field'
import { AXIS_COLORS, COLORS } from '../theme'
import { hudCamera } from '../ui/hudState'

// oxlint-disable react/immutability -- scene objects are imperative and mutated per frame

const dynRef = new Map<string, DynState>()

// Charged curve/surface pieces, rebuilt whenever objects change (cheap); the
// physics step consumes this instead of rebuilding geometry per frame.
const chargeRef = new Map<string, readonly ChargeSample[]>()

function syncChargeSamples(objects: SimObject[]): void {
  const ids = new Set(objects.filter((o) => o.kind !== 'point').map((o) => o.id))
  for (const id of [...chargeRef.keys()]) if (!ids.has(id)) chargeRef.delete(id)
  for (const o of objects) {
    if (o.kind === 'point') continue
    chargeRef.set(o.id, buildChargeSamples(o) ?? [])
  }
}

function forceColor(i: number): string {
  const palette = [COLORS.green, COLORS.blue, '#c58aff', '#ffa34d', '#4dd7c9']
  return palette[i % palette.length]
}

function syncDynamics(objects: SimObject[]): void {
  const ids = new Set(objects.filter((o) => o.kind === 'point').map((o) => o.id))
  for (const id of [...dynRef.keys()]) if (!ids.has(id)) dynRef.delete(id)
  for (const o of objects) {
    if (o.kind === 'point' && !dynRef.has(o.id)) {
      dynRef.set(o.id, { pos: [...o.position] as Vec3, vel: [...o.physics.velocity] as Vec3 })
    }
  }
}

function reseed(objects: SimObject[]): void {
  for (const o of objects) {
    if (o.kind === 'point') {
      dynRef.set(o.id, { pos: [...o.position] as Vec3, vel: [...o.physics.velocity] as Vec3 })
    }
  }
}

function useDynamics(): void {
  const playing = useStore((s) => s.playing)
  const version = useStore((s) => s.engineVersion)
  const objects = useStore((s) => s.objects)
  const accRef = useRef(0)
  const tRef = useRef(0)
  const lastVer = useRef(version)

  useEffect(() => {
    syncChargeSamples(objects)
  }, [objects])

  const sync = () => {
    const { objects } = useStore.getState()
    syncDynamics(objects)
    if (lastVer.current !== version) {
      lastVer.current = version
      reseed(objects)
    }
  }

  useFrame((_state, delta) => {
    const { objects } = useStore.getState()
    syncDynamics(objects)
    sync()
    const curVer = useStore.getState().engineVersion
    if (lastVer.current !== curVer) {
      lastVer.current = curVer
      reseed(objects)
    }
    if (playing) {
      const dt = delta * useStore.getState().timeScale
      stepPhysics(objects, dynRef, dt, useStore.getState().coulombK, useStore.getState().gravity, chargeRef)
      tRef.current += dt
    }
    accRef.current += delta
    if (accRef.current > 0.12) {
      accRef.current = 0
      const live: Record<string, Vec3> = {}
      for (const o of objects) {
        if (o.kind === 'point') {
          const st = dynRef.get(o.id)
          live[o.id] = st ? st.pos : o.position
        }
      }
      useStore.getState().setLivePos(live)
      if (playing) useStore.getState().setTime(tRef.current)
    }
  })
}

function makeLabelTexture(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fp = 84
  ctx.font = 'bold ' + fp + 'px Arial'
  const w = Math.ceil(ctx.measureText(text).width) + 28
  const h = 120
  canvas.width = w
  canvas.height = h
  ctx.font = 'bold ' + fp + 'px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 0
  ctx.fillText(text, w / 2, h / 2 + 4)
  ctx.shadowBlur = 0
  ctx.fillText(text, w / 2, h / 2 + 4)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false })
  const sp = new THREE.Sprite(mat)
  sp.scale.set(0.62 * (w / h), 0.62, 1)
  return sp
}

function Axes() {
  const len = 5.5
  return (
    <group>
      <arrowHelper args={[new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), len, AXIS_COLORS.x, 0.5, 0.3]} />
      <arrowHelper args={[new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), len, AXIS_COLORS.y, 0.5, 0.3]} />
      <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), len + 0.5, AXIS_COLORS.z, 0.5, 0.3]} />
      <group position={[len + 0.4, -0.3, 0.2]}>
        <primitive object={makeLabelTexture('x', AXIS_COLORS.x)} />
      </group>
      <group position={[-0.3, len + 0.4, 0.2]}>
        <primitive object={makeLabelTexture('y', AXIS_COLORS.y)} />
      </group>
      <group position={[-0.3, 0.4, len + 0.8]}>
        <primitive object={makeLabelTexture('z', AXIS_COLORS.z)} />
      </group>
    </group>
  )
}

function useError(effect: { error?: string } | null, id: string) {
  const error = effect?.error
  const updateObject = useStore((s) => s.updateObject)
  const objError = useStore((s) => s.objects.find((o) => o.id === id)?.error)
  useEffect(() => {
    if (error !== objError) updateObject(id, { error })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, id, updateObject])
}

function CurveMesh({ o }: { o: CurveObj }) {
  const selected = useStore((s) => s.selectedId === o.id)
  const build = useMemo(() => buildCurveGeometry(o), [o])
  const lineObj = useMemo(() => {
    if (!build.geometry) return null
    const line = new THREE.Line(
      build.geometry,
      new THREE.LineBasicMaterial({
        color: o.color,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
    )
    void build
    return line
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.geometry, o.color])
  const mat = lineObj?.material as THREE.LineBasicMaterial | null
  useEffect(() => {
    if (mat) mat.opacity = selected ? 1 : 0.92
  }, [selected, mat])
  useError(build, o.id)
  if (!lineObj || !o.visible) return null
  return (
    <primitive
      object={lineObj}
      onClick={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        useStore.getState().select(o.id)
      }}
    />
  )
}

function CurveFrame({ o }: { o: CurveObj }) {
  const t = useStore((s) => s.frameT)
  const fr = useMemo(() => {
    try { return frenetFrame(o, t) } catch { return null }
  }, [o, t])
  if (!fr) return null
  const T = new THREE.Vector3(...fr.T)
  const N = new THREE.Vector3(...fr.N)
  const B = new THREE.Vector3(...fr.B)
  const origin = new THREE.Vector3(...fr.pos)
  return (
    <group>
      <mesh position={origin}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#ffffff" emissive="#aaaaaa" emissiveIntensity={0.6} />
      </mesh>
      <arrowHelper args={[T, origin, 1.2, '#ff6b6b', 0.25, 0.15]} />
      <arrowHelper args={[N, origin, 0.9, '#5dff7d', 0.25, 0.15]} />
      <arrowHelper args={[B, origin, 0.9, '#c58aff', 0.25, 0.15]} />
    </group>
  )
}

function SurfaceMesh({ o }: { o: SurfaceObj }) {
  const selected = useStore((s) => s.selectedId === o.id)
  const build = useMemo(() => buildSurfaceGeometry(o), [o])
  useError(build, o.id)
  const meshMat = useRef<THREE.MeshBasicMaterial>(null)
  const baseColor = useMemo(() => new THREE.Color(o.color), [o.color])
  useEffect(() => {
    if (!meshMat.current) return
    if (selected) meshMat.current.color.copy(baseColor).lerp(new THREE.Color('#ffffff'), 0.35)
    else meshMat.current.color.copy(baseColor)
  }, [selected, baseColor])
  const contours = useMemo(() => {
    if (!build.geometry) return null
    const [na, nb] = o.resolution
    return {
      z: buildSurfaceContours(build.geometry, Math.max(2, na), Math.max(2, nb), 7, 2),
      x: buildSurfaceContours(build.geometry, Math.max(2, na), Math.max(2, nb), 5, 0),
      y: buildSurfaceContours(build.geometry, Math.max(2, na), Math.max(2, nb), 5, 1),
    }
  }, [build, o.resolution])
  const contourMaterial = (family: 'z' | 'x' | 'y') => (
    <lineBasicMaterial
      color={(selected ? baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.55) : baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.32)).getStyle()}
      transparent
      opacity={family === 'z' ? 0.75 : 0.45}
      blending={THREE.AdditiveBlending}
      depthTest={false}
      depthWrite={false}
      toneMapped={false}
      fog={false}
    />
  )
  if (!build.geometry || !o.visible) return null
  return (
    <group
      onClick={(e) => {
        e.stopPropagation()
        useStore.getState().select(o.id)
      }}
    >
      {contours?.y && o.contours.xz && (
        <lineSegments geometry={contours.y}>{contourMaterial('y')}</lineSegments>
      )}
      {contours?.x && o.contours.yz && (
        <lineSegments geometry={contours.x}>{contourMaterial('x')}</lineSegments>
      )}
      {contours?.z && o.contours.xy && (
        <lineSegments geometry={contours.z}>{contourMaterial('z')}</lineSegments>
      )}
      <mesh geometry={build.geometry}>
        <meshBasicMaterial ref={meshMat} color={o.color} side={THREE.DoubleSide} transparent opacity={0.6} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  )
}

function PointBody({ o }: { o: PointObj }) {
  const selected = useStore((s) => s.selectedId === o.id)
  const gravity = useStore((s) => s.gravity)
  const drag = o.physics.drag ?? 0
  const mesh = useRef<THREE.Mesh>(null)
  const arrows = useRef<Array<THREE.ArrowHelper | null>>([])
  const chargeIdx = o.physics.forces.length
  const fieldIdx = chargeIdx + 1

  useFrame(() => {
    const st = dynRef.get(o.id)
    const base = st ? st.pos : o.position
    if (mesh.current) mesh.current.position.set(base[0], base[1], base[2])
    o.physics.forces.forEach((row, i) => {
      const arrow = arrows.current[i]
      if (!arrow) return
      arrow.position.set(base[0], base[1], base[2])
      const mag = Math.hypot(row.vector[0], row.vector[1], row.vector[2])
      if (mag === 0) {
        arrow.visible = false
        return
      }
      arrow.visible = true
      arrow.setDirection(new THREE.Vector3(...directionAsVec(row.vector)))
      arrow.setLength(0.35 * mag, 0.22, 0.16)
    })
    const qArrow = arrows.current[chargeIdx]
    if (qArrow) {
      const v = chargeForceOn(o, useStore.getState().objects, dynRef, useStore.getState().coulombK, chargeRef)
      const mag = Math.hypot(v[0], v[1], v[2])
      if (o.physics.charge === 0 || mag === 0) {
        qArrow.visible = false
        return
      }
      qArrow.visible = true
      qArrow.position.set(base[0], base[1], base[2])
      qArrow.setDirection(new THREE.Vector3(...directionAsVec(v)))
      qArrow.setLength(0.35 * mag, 0.22, 0.16)
    }
    const fArrow = arrows.current[fieldIdx]
    if (fArrow) {
      const v = fieldForce(o, dynRef, useStore.getState().gravity)
      const mag = Math.hypot(v[0], v[1], v[2])
      if (mag === 0 || o.physics.anchored) {
        fArrow.visible = false
        return
      }
      fArrow.visible = true
      fArrow.position.set(base[0], base[1], base[2])
      fArrow.setDirection(new THREE.Vector3(...directionAsVec(v)))
      fArrow.setLength(0.35 * mag, 0.22, 0.16)
    }
  })

  if (!o.visible) return null
  return (
    <group>
      <mesh ref={mesh} onClick={(e) => { e.stopPropagation(); useStore.getState().select(o.id) }}>
        <sphereGeometry args={[o.size, 16, 16]} />
        <meshStandardMaterial
          color={o.color}
          emissive={o.color}
          emissiveIntensity={selected ? 0.85 : 0.4}
          roughness={0.55}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>
      {o.physics.forces.map((row, i) => (
        <arrowHelper
          key={row.id}
          ref={(el) => {
            arrows.current[i] = el
          }}
          args={[
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(...o.position),
            0.5,
            forceColor(i),
            0.22,
            0.16,
          ]}
        />
      ))}
      {o.physics.charge !== 0 && (
        <arrowHelper
          ref={(el) => {
            arrows.current[chargeIdx] = el
          }}
          args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(...o.position), 0.5, '#52e0ff', 0.22, 0.16]}
        />
      )}
      {(gravity !== 0 || drag !== 0) && (
        <arrowHelper
          ref={(el) => {
            arrows.current[fieldIdx] = el
          }}
          args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(...o.position), 0.5, '#ffa34d', 0.22, 0.16]}
        />
      )}
    </group>
  )
}

function WorldObjects() {
  const objects = useStore((s) => s.objects)
  const selectedId = useStore((s) => s.selectedId)
  const frameOn = useStore((s) => s.frameOn)
  return (
    <group>
      {objects.map((o) => {
        if (o.kind === 'point') return <PointBody key={o.id} o={o} />
        if (o.kind === 'curve') return (
          <group key={o.id}>
            <CurveMesh o={o} />
            {selectedId === o.id && frameOn && <CurveFrame o={o} />}
          </group>
        )
        return <SurfaceMesh key={o.id} o={o} />
      })}
    </group>
  )
}

function TrailLine({ o }: { o: PointObj }) {
  const playing = useStore((s) => s.playing)
  const trailsOn = useStore((s) => s.trailsOn)
  const trailVersion = useStore((s) => s.trailVersion)
const line = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3))
    return new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: o.color,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
  }, [o.color])

  const lastVer = useRef(trailVersion)
  const n = useRef(0)

  useFrame(() => {
    if (lastVer.current !== trailVersion) {
      lastVer.current = trailVersion
      n.current = 0
      const g = line.geometry as THREE.BufferGeometry
      g.setDrawRange(0, 0)
    }
    if (!playing || !trailsOn) return
    const st = dynRef.get(o.id)
    if (!st) return
    const geo = line.geometry as THREE.BufferGeometry
    const arr = geo.attributes.position.array as Float32Array
    n.current = appendTrail(arr, n.current, st.pos)
    geo.attributes.position.needsUpdate = true
    geo.setDrawRange(0, n.current)
    geo.computeBoundingSphere()
  })
  if (!o.visible) return null
  return <primitive object={line} />
}

function Trails() {
  const objects = useStore((s) => s.objects)
  const points = useMemo(
    () => objects.filter((o): o is PointObj => o.kind === 'point' && !o.physics.anchored),
    [objects],
  )
  return (
    <>
      {points.map((o) => (
        <TrailLine key={o.id} o={o} />
      ))}
    </>
  )
}

function makeStarTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255, 248, 235, 1)')
  g.addColorStop(0.18, 'rgba(200, 228, 255, 0.9)')
  g.addColorStop(0.55, 'rgba(160, 205, 255, 0.22)')
  g.addColorStop(1, 'rgba(140, 195, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const STARS_OBJECT = (() => {
  const n = 560
  const mat = new THREE.SpriteMaterial({
    map: makeStarTexture(),
    color: '#a9ccff',
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  })
  const camPos = new THREE.Vector3(7, -7, 6)
  const dir = new THREE.Vector3(0, 0, 0).sub(camPos).normalize()
  const ref = new THREE.Vector3(0, 0, 1)
  const axis = new THREE.Vector3().crossVectors(ref, dir)
  const angle = Math.acos(ref.dot(dir))
  const q = new THREE.Quaternion().setFromAxisAngle(
    axis.lengthSq() > 1e-8 ? axis.normalize() : new THREE.Vector3(1, 0, 0),
    axis.lengthSq() > 1e-8 ? angle : dir.z > 0 ? 0 : Math.PI,
  )
  const group = new THREE.Group()
  group.name = 'physmos-stars'
  for (let i = 0; i < n; i++) {
    // full celestial sphere so stars ring the horizon in every direction
    const r = 45 + Math.random() * 25
    const theta = Math.random() * Math.PI * 2
    const cosPhi = 2 * Math.random() - 1
    const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi))
    const local = new THREE.Vector3(sinPhi * Math.cos(theta), sinPhi * Math.sin(theta), cosPhi)
    local.applyQuaternion(q)
    const sp = new THREE.Sprite(mat)
    sp.position.copy(local.multiplyScalar(r))
    sp.scale.set(0.6 + Math.random() * 0.6, 0.6 + Math.random() * 0.6, 1)
    group.add(sp)
  }
  return group
})()

function Stars() {
  return <primitive object={STARS_OBJECT} />
}

function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(180, 216, 255, 0.9)')
  g.addColorStop(0.35, 'rgba(110, 170, 255, 0.35)')
  g.addColorStop(1, 'rgba(90, 150, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function HorizonGlow() {
  const sprite = useMemo(() => {
    const mat = new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: '#6fa4ff',
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const sp = new THREE.Sprite(mat)
    sp.scale.set(20, 20, 1)
    return sp
  }, [])
  return <primitive object={sprite} position={[0, -1, -18]} />
}

function HudProbe() {
  const { camera, controls } = useThree()
  useFrame(() => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target
    const dir = camera.position.clone().sub(target ?? new THREE.Vector3())
    const len = dir.length()
    if (len < 1e-6) return
    hudCamera.az = (Math.atan2(dir.y, dir.x) * 180) / Math.PI
    hudCamera.el = (Math.asin(dir.z / len) * 180) / Math.PI
  })
  return null
}

const FIELD_POOL = MAX_SEEDS
const FIELD_POS_COLOR = '#6fc6ff'
const FIELD_NEG_COLOR = '#ff8a9e'
const FIELD_POS_HEAD = '#b5e6ff'
const FIELD_NEG_HEAD = '#ffb7c4'

// Conventional electric-field diagram in 3D: continuous field lines tangent to
// the superposed E field at every point, seeded to revolve around each charged
// source (spherically for points, radially from curves, normal to surfaces).
// Lines originate on + and terminate on - charges (or stream to the domain
// edge), and arrowheads along each line point along E. Rebuilt on a throttle
// while playing so the field follows the moving charges.
function FieldLayer() {
  const fieldOn = useStore((s) => s.fieldOn)
  const spacing = useStore((s) => s.fieldSpacing)
  const playing = useStore((s) => s.playing)
  const coulombK = useStore((s) => s.coulombK)
  const version = useStore((s) => s.engineVersion)
  const groupRef = useRef<THREE.Group>(null)
  const accRef = useRef(0)
  const lastVersion = useRef(-1)
  const readyRef = useRef(false)

  const lines = useMemo(() => {
    const arr: THREE.Line[] = []
    for (let i = 0; i < FIELD_POOL; i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3))
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3))
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: '#ffffff',
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
        }),
      )
      line.visible = false
      line.frustumCulled = false
      arr.push(line)
    }
    return arr
  }, [])

  const cones = useMemo(() => {
    const mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.085, 0.24, 6),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      }),
      MAX_ARROW_CAP,
    )
    mesh.count = 0
    mesh.frustumCulled = false
    return mesh
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const pHead = useMemo(() => new THREE.Color(FIELD_POS_HEAD), [])
  const nHead = useMemo(() => new THREE.Color(FIELD_NEG_HEAD), [])
  const colScratch = useMemo(() => new THREE.Color(), [])

  useEffect(() => {
    if (!groupRef.current) return
    const g = groupRef.current
    while (g.children.length) g.remove(g.children[0])
    for (const l of lines) g.add(l)
    g.add(cones)
    readyRef.current = true
    return () => {
      readyRef.current = false
    }
  }, [lines, cones, fieldOn])

  useFrame((_st, delta) => {
    if (!fieldOn || !readyRef.current) return
    const versionChanged = version !== lastVersion.current
    if (playing) {
      accRef.current += delta
      if (accRef.current < 0.3 && !versionChanged) return
      accRef.current = 0
    } else {
      if (!versionChanged) return
    }
    lastVersion.current = version
    const objs = useStore.getState().objects
    const traces = traceFieldLines(objs, dynRef, coulombK, chargeRef, { seedScale: 3 / spacing, bound: 15 })

    for (let i = 0; i < FIELD_POOL; i++) {
      const line = lines[i]
      if (i >= traces.length) {
        line.visible = false
        continue
      }
      const tr = traces[i]
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
      const col = line.geometry.getAttribute('color') as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      const carr = col.array as Float32Array
      const n = Math.min(tr.points.length, MAX_POINTS)
      const lastMag = tr.mags.length > 0 ? tr.mags[tr.mags.length - 1] : 1
      colScratch.set(tr.sign > 0 ? FIELD_POS_COLOR : FIELD_NEG_COLOR)
      const baseR = colScratch.r
      const baseG = colScratch.g
      const baseB = colScratch.b
      for (let k = 0; k < n; k++) {
        arr[k * 3] = tr.points[k][0]
        arr[k * 3 + 1] = tr.points[k][1]
        arr[k * 3 + 2] = tr.points[k][2]
        // Vertex alpha lives in the color * fade(|E|): strong field keeps the
        // true line tint, weak field drops toward black -> additive blends it
        // into the void (smooth gradient, no hard cutoff).
        const magK = k < tr.mags.length ? tr.mags[k] : lastMag
        const fade = fieldFade(magK)
        carr[k * 3] = baseR * fade
        carr[k * 3 + 1] = baseG * fade
        carr[k * 3 + 2] = baseB * fade
      }
      attr.needsUpdate = true
      col.needsUpdate = true
      line.geometry.setDrawRange(0, n)
      line.geometry.computeBoundingSphere()
      line.visible = true
    }

    const arrows = fieldArrows(traces, 0.55)
    cones.count = Math.min(arrows.length, MAX_ARROW_CAP)
    if (cones.count > 0) {
      for (let i = 0; i < cones.count; i++) {
        const a = arrows[i]
        dummy.position.set(a.pos[0], a.pos[1], a.pos[2])
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(a.dir[0], a.dir[1], a.dir[2]))
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        cones.setMatrixAt(i, dummy.matrix)
        colScratch.set(a.sign > 0 ? pHead : nHead).multiplyScalar(fieldFade(a.mag))
        cones.setColorAt(i, colScratch)
      }
      const cmat = cones.instanceMatrix
      cmat.needsUpdate = true
      if (cones.instanceColor) cones.instanceColor.needsUpdate = true
    }
  })

  if (!fieldOn) return null
  return <group ref={groupRef} />
}

export function Simulation() {
  useDynamics()
  const gridOn = useStore((s) => s.gridOn)
  const resetView = useStore((s) => s.resetView)
  const { camera, controls } = useThree()
  useEffect(() => {
    if (resetView === 0) return
    camera.position.set(7, -7, 6)
    const ctl = controls as { target?: THREE.Vector3; update?: () => void } | null
    ctl?.target?.set(0, 0, 0)
    ctl?.update?.()
  }, [resetView, camera, controls])
  return (
    <>
      <color attach="background" args={[COLORS.bg]} />
      <fog attach="fog" args={[COLORS.bg, 30, 64]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[7, -9, 12]} intensity={1.5} />
      <directionalLight position={[-6, -4, 6]} intensity={0.6} color="#9db8ff" />
      <directionalLight position={[-2, 2, -8]} intensity={0.7} color="#7aa2ff" />
      <Stars />
      <HorizonGlow />
      <HudProbe />
      {gridOn && <gridHelper args={[22, 22, COLORS.gridMajor, COLORS.gridMinor]} rotation={[Math.PI / 2, 0, 0]} />}
      <Axes />
      <Trails />
      <WorldObjects />
      <FieldLayer />
    </>
  )
}