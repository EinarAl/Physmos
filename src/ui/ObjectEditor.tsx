import type { CurveObj, ForceRow, PointObj, SurfaceObj, Vec3 } from '../types'
import type { ObjectPatch } from '../store'
import { useStore } from '../store'
import { PRESET_COLORS } from '../theme'
import { nextId } from '../store'
import { NumField } from './NumField'

function VecEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: Vec3
  onChange: (v: Vec3) => void
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        {value.map((n, i) => (
          <NumField key={i} value={n} onChange={(v) => onChange(value.map((c, j) => (j === i ? v : c)) as Vec3)} />
        ))}
      </div>
    </div>
  )
}

function ForceEditor({
  index,
  row,
  onChange,
  onRemove,
}: {
  index: number
  row: ForceRow
  onChange: (row: ForceRow) => void
  onRemove: () => void
}) {
  return (
    <div className="force-row">
      <div className="force-head">
        <span style={{ fontSize: 11, width: 26, color: '#8a93a3' }}>F{index + 1}</span>
        <input
          className="text-input"
          value={row.label}
          placeholder="label"
          onChange={(e) => onChange({ ...row, label: e.target.value })}
        />
        <button className="obj-del" onClick={onRemove} title="remove force">
          x
        </button>
      </div>
      <div className="row">
        {row.vector.map((n, i) => (
          <NumField
            key={i}
            value={n}
            onChange={(v) =>
              onChange({ ...row, vector: row.vector.map((c, j) => (j === i ? v : c)) as Vec3 })
            }
          />
        ))}
      </div>
      <div className="hint">force at particle, drawn as a free-body arrow</div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="field">
      <label>color</label>
      <div className="swatches">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={c === value ? 'active' : ''}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  )
}

function RangeEditor({
  label,
  range,
  onChange,
  step = 0.1,
}: {
  label: string
  range: [number, number]
  onChange: (r: [number, number]) => void
  step?: number
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <NumField value={range[0]} step={step} onChange={(v) => onChange([v, range[1]])} />
        <NumField value={range[1]} step={step} onChange={(v) => onChange([range[0], v])} />
      </div>
    </div>
  )
}

function PointEditor({ o }: { o: PointObj }) {
  const updateObject = useStore((s) => s.updateObject)
  const live = useStore((s) => s.livePos[o.id])
  const patch = (p: ObjectPatch) => updateObject(o.id, p)

  return (
    <>
      <NumField label="radius" value={o.size} step={0.05} onChange={(v) => patch({ size: v })} />
      <VecEditor
        label="position"
        value={o.position}
        onChange={(v) => patch({ position: v })}
      />
      {live && <div className="live-pos">live ({(live[0].toFixed(2))}, {(live[1].toFixed(2))}, {(live[2].toFixed(2))})</div>}
      <div className="field">
        <label>free body</label>
        <div className="check">
          <input
            type="checkbox"
            checked={o.physics.anchored}
            onChange={(e) => patch({ physics: { anchored: e.target.checked } })}
          />
          anchored (fixed)
        </div>
      </div>
      <NumField
        label="mass"
        value={o.physics.mass}
        step={0.1}
        onChange={(v) => patch({ physics: { mass: v } })}
      />
      <NumField
        label="charge (q)"
        value={o.physics.charge}
        step={0.5}
        onChange={(v) => patch({ physics: { charge: v } })}
      />
      <div className="field">
        <label>initial velocity (dx, dy, dz)</label>
        <div className="row">
          {o.physics.velocity.map((n, i) => (
            <NumField
              key={i}
              value={n}
              onChange={(v) =>
                patch({
                  physics: {
                    velocity: o.physics.velocity.map((c, j) => (j === i ? v : c)) as Vec3,
                  },
                })
              }
            />
          ))}
        </div>
      </div>
      {o.physics.forces.map((row, i) => (
        <ForceEditor
          key={row.id}
          index={i}
          row={row}
          onChange={(r) =>
            patch({
              physics: {
                forces: o.physics.forces.map((f) => (f.id === r.id ? r : f)),
              },
            })
          }
          onRemove={() =>
            patch({ physics: { forces: o.physics.forces.filter((f) => f.id !== row.id) } })
          }
        />
      ))}
      <button
        className="btn"
        onClick={() =>
          patch({
            physics: {
              forces: [...o.physics.forces, { id: nextId(), label: 'F', vector: [0, 0, 1] }],
            },
          })
        }
      >
        + force
      </button>
      <div className="hint">
        play to integrate: a = F/m, p += v dt. charged bodies pull on each other (k in toolbar). anchored
        bodies ignore forces.
      </div>
    </>
  )
}

function CurveEditor({ o }: { o: CurveObj }) {
  const updateObject = useStore((s) => s.updateObject)
  const patch = (p: ObjectPatch) => updateObject(o.id, p)
  return (
    <>
      <div className="field">
        <label>r(t) = (fx, fy, fz)</label>
        <input className="text-input" value={o.expr} onChange={(e) => patch({ expr: e.target.value })} />
      </div>
      <div className="field">
        <label>constants (k=v, ...)</label>
        <input className="text-input" value={o.params} onChange={(e) => patch({ params: e.target.value })} />
      </div>
      <RangeEditor label="t range" range={o.range} onChange={(r) => patch({ range: r })} />
      <NumField label="samples" value={o.samples} step={50} onChange={(v) => patch({ samples: v })} />
      <div className="hint">
        try <code>(R*sin(t), R*cos(t), vd*t)</code> with <code>R=3, vd=0.9</code>
      </div>
    </>
  )
}

function SurfaceEditor({ o }: { o: SurfaceObj }) {
  const updateObject = useStore((s) => s.updateObject)
  const patch = (p: ObjectPatch) => updateObject(o.id, p)
  return (
    <>
      <div className="field">
        <label>mode</label>
        <div className="check">
          <input
            type="radio"
            checked={o.mode === 'explicit'}
            onChange={() => patch({ mode: 'explicit' })}
          />
          z = f(x, y)
          <input
            type="radio"
            checked={o.mode === 'parametric'}
            onChange={() => patch({ mode: 'parametric' })}
          />
          r(u, v)
        </div>
      </div>
      <div className="field">
        <label>{o.mode === 'explicit' ? 'f(x, y)' : 'r(u, v) = (fx, fy, fz)'}</label>
        <input className="text-input" value={o.expr} onChange={(e) => patch({ expr: e.target.value })} />
      </div>
      <div className="field">
        <label>constants (k=v, ...)</label>
        <input className="text-input" value={o.params} onChange={(e) => patch({ params: e.target.value })} />
      </div>
      <RangeEditor
        label={o.mode === 'explicit' ? 'x range' : 'u range'}
        range={o.rangeA}
        onChange={(r) => patch({ rangeA: r })}
      />
      <RangeEditor
        label={o.mode === 'explicit' ? 'y range' : 'v range'}
        range={o.rangeB}
        onChange={(r) => patch({ rangeB: r })}
      />
      <div className="row">
        <NumField label="res u/x" value={o.resolution[0]} step={10} onChange={(v) => patch({ resolution: [v, o.resolution[1]] })} />
        <NumField label="res v/y" value={o.resolution[1]} step={10} onChange={(v) => patch({ resolution: [o.resolution[0], v] })} />
      </div>
    </>
  )
}

export function ObjectEditor() {
  const selected = useStore((s) => s.objects.find((o) => o.id === s.selectedId) ?? null)
  const updateObject = useStore((s) => s.updateObject)

  if (!selected) {
    return (
      <div className="editor">
        <div className="editor-title">No selection</div>
        <div className="hint">click an object in the scene or list to edit its properties.</div>
      </div>
    )
  }

  const patch = (p: ObjectPatch) => updateObject(selected.id, p)

  return (
    <div className="editor">
      <div className="editor-title">
        {selected.kind} · {selected.name}
      </div>
      <div className="field">
        <label>name</label>
        <input className="text-input" value={selected.name} onChange={(e) => patch({ name: e.target.value })} />
      </div>
      <div className="check">
        <input
          type="checkbox"
          checked={selected.visible}
          onChange={(e) => patch({ visible: e.target.checked })}
        />
        visible
      </div>
      <ColorPicker value={selected.color} onChange={(c) => patch({ color: c })} />
      {selected.kind === 'point' && <PointEditor o={selected} />}
      {selected.kind === 'curve' && <CurveEditor o={selected} />}
      {selected.kind === 'surface' && <SurfaceEditor o={selected} />}
      {selected.error && <div className="err-tag">{selected.error}</div>}
    </div>
  )
}