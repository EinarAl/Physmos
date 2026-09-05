import { useStore } from '../store'
import { NumField } from './NumField'

export function Toolbar() {
  const playing = useStore((s) => s.playing)
  const time = useStore((s) => s.time)
  const setPlaying = useStore((s) => s.setPlaying)
  const resetSim = useStore((s) => s.resetSim)
  const coulombK = useStore((s) => s.coulombK)
  const setCoulombK = useStore((s) => s.setCoulombK)
  const gravity = useStore((s) => s.gravity)
  const setGravity = useStore((s) => s.setGravity)
  const trailsOn = useStore((s) => s.trailsOn)
  const setTrailsOn = useStore((s) => s.setTrailsOn)
  const clearTrails = useStore((s) => s.clearTrails)

  return (
    <header className="toolbar">
      <div className="brand">
        phys<span>mos</span>
      </div>
      <button className="btn primary" onClick={() => setPlaying(!playing)}>
        {playing ? '\u23f8  Pause' : '\u25b8  Play'}
      </button>
      <button className="btn" onClick={resetSim}>
        {'\u21ba'} Reset
      </button>
      <button className={'btn' + (trailsOn ? ' toggled' : '')} onClick={() => setTrailsOn(!trailsOn)}>
        {'\u2303'} Trails
      </button>
      <button className="btn" onClick={clearTrails} title="clear point trails">
        {'\u2715'} Clear
      </button>
      <span className="clock">t = {time.toFixed(1)}s</span>
      <div className="kctl">
        <NumField label="k" value={coulombK} step={0.5} onChange={setCoulombK} />
      </div>
      <div className="kctl">
        <NumField label="g" value={gravity} step={0.5} onChange={setGravity} />
      </div>
      <span className="spacer" />
      <span className={'play-indicator' + (playing ? '' : ' paused')}>
        {playing ? 'simulating' : 'paused'}
      </span>
    </header>
  )
}