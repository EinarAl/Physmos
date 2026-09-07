import { useStore } from '../store'
import { AddBar } from './AddBar'
import { ObjectEditor } from './ObjectEditor'
import type { SimObject } from '../types'

function ObjectRow({ o }: { o: SimObject }) {
  const select = useStore((s) => s.select)
  const update = useStore((s) => s.updateObject)
  const remove = useStore((s) => s.removeObject)
  const selected = useStore((s) => s.selectedId === o.id)
  return (
    <div className={'object-row' + (selected ? ' selected' : '')} onClick={() => select(o.id)}>
      <span className="dot-wrap">
        <span
          className="swatch"
          style={{
            background: o.visible ? o.color : 'transparent',
            color: o.visible ? o.color : '#3a4456',
            boxShadow: o.visible ? '0 0 9px' : 'none',
          }}
        />
      </span>
      <span className="eye" role="button" onClick={(e) => { e.stopPropagation(); update(o.id, { visible: !o.visible }) }}>
        {o.visible ? '\u25c9' : '\u25ef'}
      </span>
      <span className="name">{o.name}</span>
      {o.kind === 'point' && (
        <span className={'status-dot ' + (o.visible ? 'live' : 'still')} title={o.visible ? 'bodies at play' : 'hidden body'} />
      )}
      <span className={'kind ' + o.kind}>{o.kind}</span>
      {o.kind === 'point' && o.error && <span title="physics error" style={{ color: '#ff6b7d' }}>!</span>}
      {o.kind !== 'point' && o.error && <span title={o.error} style={{ color: '#ff6b7d' }}>!</span>}
      <button className="obj-del" onClick={(e) => { e.stopPropagation(); remove(o.id) }}>
        x
      </button>
    </div>
  )
}

export function Sidebar() {
  const objects = useStore((s) => s.objects)
  return (
    <aside className="sidebar">
      <AddBar />
      <div className="sidebar-title">
        scene &middot; <b>{objects.length}</b> {objects.length === 1 ? 'object' : 'objects'}
      </div>
      <div className="object-list">
        {objects.length === 0 && (
          <div className="hint">no objects yet. add one above, or load the demo scene.</div>
        )}
        {objects.map((o) => (
          <ObjectRow key={o.id} o={o} />
        ))}
      </div>
      <ObjectEditor />
    </aside>
  )
}