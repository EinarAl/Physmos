import { useState } from 'react'
import { useStore } from '../store'
import { parseScene, serializeScene } from '../scene/io'

export function SceneIO() {
  const mode = useStore((s) => s.scenePanel)
  const setScenePanel = useStore((s) => s.setScenePanel)
  const loadScene = useStore((s) => s.loadScene)
  const [text, setText] = useState(() => (mode === 'export' ? serializeScene(useStore.getState()) : ''))
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prevMode, setPrevMode] = useState(mode)

  if (prevMode !== mode) {
    setPrevMode(mode)
    setText(mode === 'export' ? serializeScene(useStore.getState()) : '')
    setCopied(false)
    setError(null)
  }

  if (!mode) return null

  function handleImport() {
    const snap = parseScene(text)
    if (!snap) {
      setError('That does not look like a valid physmos scene file.')
      return
    }
    loadScene(snap)
    setScenePanel(null)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError('Clipboard access failed; select and copy manually.')
    }
  }

  return (
    <div className="overlay" onClick={() => setScenePanel(null)}>
      <div className="panel io-panel" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === 'export' ? 'Export scene' : 'Import scene'}</h3>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={mode === 'import' ? 'Paste exported scene JSON here\u2026' : ''}
        />
        {error && <p className="io-error">{error}</p>}
        <div className="io-actions">
          {mode === 'export' ? (
            <button className="btn primary" onClick={handleCopy}>
              {copied ? '\u2713 Copied' : 'Copy to clipboard'}
            </button>
          ) : (
            <button className="btn primary" onClick={handleImport}>
              Load scene
            </button>
          )}
          <button className="btn" onClick={() => setScenePanel(null)}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}