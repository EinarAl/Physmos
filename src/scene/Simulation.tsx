import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { SimObject, PointObj, CurveObj, SurfaceObj, Vec3 } from '../types'
import { buildCurveGeometry, buildSurfaceGeometry } from '../engine/builder'
import { frenetFrame } from '../engine/frenet'
import { appendTrail, TRAIL_MAX } from './trails'
import { useStore } from '../store'
import { directionAsVec, chargeForceOn, stepPhysics, fieldForce, type DynState } from '../physics/engine'
import { AXIS_COLORS, COLORS } from '../theme'

// oxlint-disable react/immutability -- scene objects are imperative and mutated per frame

const dynRef = new Map<string, DynState>()

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
  const accRef = useRef(0)
  const tRef = useRef(0)
  const lastVer = useRef(version)

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
      stepPhysics(objects, dynRef, dt, useStore.getState().coulombK, useStore.getState().gravity)
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
  const fp = 120
  ctx.font = 'bold ' + fp + 'px Arial'
  const w = Math.ceil(ctx.measureText(text).width) + 40
  const h = 160
  canvas.width = w
  canvas.height = h
  ctx.font = 'bold ' + fp + 'px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, w / 2, h / 2 + 4)
  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sp = new THREE.Sprite(mat)
  sp.scale.set(0.9 * (w / h), 0.9, 1)
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
  const build = useMemo(() => buildCurveGeometry(o), [o])
  const lineObj = useMemo(() => {
    if (!build.geometry) return null
    const line = new THREE.Line(build.geometry, new THREE.LineBasicMaterial({ color: o.color }))
    void build
    return line
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.geometry, o.color])
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
  const build = useMemo(() => buildSurfaceGeometry(o), [o])
  useError(build, o.id)
  if (!build.geometry || !o.visible) return null
  return (
    <mesh
      geometry={build.geometry}
      onClick={(e) => {
        e.stopPropagation()
        useStore.getState().select(o.id)
      }}
    >
      <meshStandardMaterial color={o.color} side={THREE.DoubleSide} roughness={0.85} metalness={0.1} />
    </mesh>
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
      const v = chargeForceOn(o, useStore.getState().objects, dynRef, useStore.getState().coulombK)
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

  return (
    <group>
      <mesh ref={mesh} onClick={(e) => { e.stopPropagation(); useStore.getState().select(o.id) }}>
        <sphereGeometry args={[o.size, 16, 16]} />
        <meshStandardMaterial
          color={o.color}
          emissive={selected ? '#3a3a3a' : '#000000'}
          emissiveIntensity={selected ? 1 : 0}
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
      new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.8, depthWrite: false }),
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
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 10, 12]} intensity={1.4} />
      <directionalLight position={[-6, -4, 6]} intensity={0.5} color="#9db8ff" />
      {gridOn && <gridHelper args={[22, 22, COLORS.gridMajor, COLORS.gridMinor]} rotation={[Math.PI / 2, 0, 0]} />}
      <Axes />
      <Trails />
      <WorldObjects />
    </>
  )
}