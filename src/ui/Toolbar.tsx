import { useStore } from '../store'
import { NumField } from './NumField'

export function Toolbar() {
  const playing = useStore((s) => s.playing)
  const time = useStore((s) => s.time)
  const setPlaying = useStore((s) => s.setPlaying)
  const resetSim = useStore((s) => s.resetSim)
  const coulombK = useStore((s) => s.coulombK)
  const setCoulombK = useStore((s) => s.setCoulombK)

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
      <span className="clock">t = {time.toFixed(1)}s</span>
      <div className="kctl">
        <NumField label="k" value={coulombK} step={0.5} onChange={setCoulombK} />
      </div>
      <span className="spacer" />
      <span className={'play-indicator' + (playing ? '' : ' paused')}>
        {playing ? 'simulating' : 'paused'}
      </span>
    </header>
  )
}