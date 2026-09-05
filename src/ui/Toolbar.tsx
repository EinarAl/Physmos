import { useStore } from '../store'
import { NumField } from './NumField'

const SPEED_MIN = 0.2
const SPEED_MAX = 2
const SPEED_STEP = 0.1

export function Toolbar() {
  const playing = useStore((s) => s.playing)
  const time = useStore((s) => s.time)
  const setPlaying = useStore((s) => s.setPlaying)
  const resetSim = useStore((s) => s.resetSim)
  const coulombK = useStore((s) => s.coulombK)
  const setCoulombK = useStore((s) => s.setCoulombK)
  const gravity = useStore((s) => s.gravity)
  const setGravity = useStore((s) => s.setGravity)
  const timeScale = useStore((s) => s.timeScale)
  const setTimeScale = useStore((s) => s.setTimeScale)
  const trailsOn = useStore((s) => s.trailsOn)
  const setTrailsOn = useStore((s) => s.setTrailsOn)
  const clearTrails = useStore((s) => s.clearTrails)
  const setScenePanel = useStore((s) => s.setScenePanel)
  const gridOn = useStore((s) => s.gridOn)
  const setGridOn = useStore((s) => s.setGridOn)
  const triggerResetView = useStore((s) => s.triggerResetView)
  const loadDemo = useStore((s) => s.loadDemo)
  const setHelpOn = useStore((s) => s.setHelpOn)

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
      <div className="kctl speed">
        <label htmlFor="speed">speed</label>
        <input
          id="speed"
          type="range"
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={SPEED_STEP}
          value={timeScale}
          onChange={(e) => setTimeScale(parseFloat(e.target.value))}
        />
        <span className="speed-val">{timeScale.toFixed(1)}{'\u00d7'}</span>
      </div>
      <div className="kctl">
        <NumField label="k" value={coulombK} step={0.5} onChange={setCoulombK} />
      </div>
      <div className="kctl">
        <NumField label="g" value={gravity} step={0.5} onChange={setGravity} />
      </div>
      <button className={'btn' + (trailsOn ? ' toggled' : '')} onClick={() => setTrailsOn(!trailsOn)}>
        {'\u2303'} Trails
      </button>
      <button className="btn" onClick={clearTrails} title="clear point trails">
        {'\u2715'} Clear
      </button>
      <button className={'btn' + (gridOn ? ' toggled' : '')} onClick={() => setGridOn(!gridOn)} title="toggle ground grid">
        {'\u2295'} Grid
      </button>
      <button className="btn" onClick={triggerResetView} title="reset camera">
        {'\u2299'} View
      </button>
      <button className="btn" onClick={loadDemo} title="reload the demo scene">
        Demo
      </button>
      <button className="btn" onClick={() => setScenePanel('export')} title="export current scene as JSON">
        {'\u2b06'} Export
      </button>
      <button className="btn" onClick={() => setScenePanel('import')} title="import a scene from JSON">
        {'\u2b07'} Import
      </button>
      <button className="btn" onClick={() => setHelpOn(true)} title="how this works">
        {'?'}
      </button>
      <span className="clock">t = {time.toFixed(1)}s</span>
      <span className="spacer" />
      <span className={'play-indicator' + (playing ? '' : ' paused')}>
        {playing ? 'simulating' : 'paused'}
      </span>
    </header>
  )
}