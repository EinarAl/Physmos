import { useStore } from '../store'

export function HelpModal() {
  const helpOn = useStore((s) => s.helpOn)
  const setHelpOn = useStore((s) => s.setHelpOn)
  if (!helpOn) return null

  return (
    <div className="overlay" onClick={() => setHelpOn(false)}>
      <div className="panel help-panel" onClick={(e) => e.stopPropagation()}>
        <h3>How physmos works</h3>
        <p>
          physmos is half <strong>3D graphing calculator</strong> and half <strong>physics lab</strong>. Curves and
          surfaces are algebraic objects you type; points are bodies with mass, charge, and forces you assemble. The
          clock drives both: press Play and points obey physics while you inspect curves with the Frenet frame.
        </p>

        <h4>Curves and surfaces</h4>
        <p>
          A curve is <code>(x(t), y(t), z(t))</code> with parameters after the semicolon; a surface is either{' '}
          <code>z = f(x, y)</code> or parametric. Select a curve and enable <strong>Frame</strong> to see the Frenet
          frame: T (tangent, red), N (normal, green), B = T × N (binormal, purple). The readouts show curvature{' '}
          <code>&kappa;</code> and torsion <code>&tau;</code> at the scrubber position.
        </p>

        <h4>Forces on points</h4>
        <p>
          Each point has mass, linear drag <code>c</code> (force <code>-c·v</code>), electric charge, and any list of
          your own constant forces. Add a force and its free-body arrow appears; charge pulls charge through the same
          inverse-square law scaled by the toolbar constant <code>k</code>. The toolbar <code>g</code> adds uniform
          gravity <code>m·g</code> downward. Anchored points stay put.
        </p>

        <h4>Trails and time</h4>
        <p>
          Trails ink the path every integration step. Use the speed slider to slow playback (or push to 2×). Reset
          zeroes the clock and restores every point to its edited position and velocity.
        </p>

        <h4>Save and share</h4>
        <p>
          Export writes the whole scene to JSON; Import pastes it back. The Demo button restores the built-in scene
          (helix at radius R with pitch vd, the saddle <code>(x² - y²)/3</code>, a charged probe in a charge well).
        </p>

        <div className="io-actions">
          <button className="btn" onClick={() => setHelpOn(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}