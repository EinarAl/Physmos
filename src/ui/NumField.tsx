import { useState } from 'react'

export function NumField({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <input
        className="number-input"
        type="number"
        step={step}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  )
}