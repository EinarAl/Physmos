import { useStore } from '../store'

export function Toolbar() {
  const playing = useStore((s) => s.playing)
  const time = useStore((s) => s.time)
  const setPlaying = useStore((s) => s.setPlaying)
  const resetSim = useStore((s) => s.resetSim)

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
      <span className="spacer" />
      <span className={'play-indicator' + (playing ? '' : ' paused')}>
        {playing ? 'simulating' : 'paused'}
      </span>
    </header>
  )
}