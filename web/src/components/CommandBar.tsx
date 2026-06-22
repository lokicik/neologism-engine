import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Config } from '../lib/engine'

interface Props {
  config: Config
  onChange: (cfg: Config) => void
  onGenerate: () => void
  loading: boolean
}

// Phase 41: command-bar dashboard (the Ideogram/Google-search pattern) — one
// prompt bar, options as compact dropdown chips, results below. Style is
// always big_tech here; the engine still supports the creative styles, they
// are just no longer part of the web product.

type Mode = 'auto' | 'brandable' | 'realword' | 'respell' | 'compound'

const MODES: { value: Mode; label: string; example: string; desc: string }[] = [
  { value: 'auto', label: 'Auto', example: 'a mix', desc: 'A blend of every style — the default' },
  { value: 'brandable', label: 'Brandable', example: 'Spotify', desc: 'Invented coinages — Spotify, Vercel' },
  { value: 'realword', label: 'Real words', example: 'Notion', desc: 'Evocative dictionary words — Notion, Linear (ignores your description)' },
  { value: 'respell', label: 'Respelled', example: 'Lyft', desc: 'Twisted real words — Lyft, Tumblr' },
  { value: 'compound', label: 'Compound', example: 'SwiftForge', desc: 'Two-word names — SwiftForge' },
]

const LENGTHS: { label: string; chip: string; min: number; max: number }[] = [
  { label: 'Short', chip: 'Short', min: 4, max: 6 },
  { label: 'Medium', chip: 'Medium', min: 5, max: 9 },
  { label: 'Long', chip: 'Long', min: 8, max: 14 },
  { label: 'Any length', chip: 'Any length', min: 4, max: 12 },
]

const CREATIVITY: { label: string; temperature: number; variety: number }[] = [
  { label: 'Safe', temperature: 0.6, variety: 0.15 },
  { label: 'Balanced', temperature: 0.85, variety: 0.3 },
  { label: 'Wild', temperature: 1.2, variety: 0.6 },
]

function currentMode(config: Config): Mode {
  if (config.variant === 'auto') return 'auto'
  if (config.compound) return 'compound'
  if (config.variant === 'realword') return 'realword'
  if (config.variant === 'respell') return 'respell'
  return 'brandable'
}

// A chip that opens a popover menu; closes on outside click or Esc.
function Chip({ label, children, active }: { label: string; children: ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="chip-wrap" ref={ref}>
      <button
        className={`chip${open || active ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        {label} <span className="chip-caret">▾</span>
      </button>
      {open && (
        <div className="chip-menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

export function CommandBar({ config, onChange, onGenerate, loading }: Props) {
  const mode = currentMode(config)
  const lengthLabel =
    LENGTHS.find((l) => l.min === config.min_len && l.max === config.max_len)?.chip ?? 'Any length'
  const creativityLabel =
    CREATIVITY.find((c) => c.temperature === config.temperature && c.variety === config.variety)
      ?.label ?? 'Balanced'

  const setMode = (m: Mode) =>
    onChange({
      ...config,
      style: 'big_tech',
      compound: m === 'compound',
      variant: m === 'realword' || m === 'respell' || m === 'auto' ? m : undefined,
    })

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    onChange({ ...config, [key]: value })

  return (
    <div className="command-area">
      <div className="command-bar">
        <span className="command-glyph">⌕</span>
        <input
          className="command-input"
          type="text"
          placeholder="What are you building? (optional)"
          value={config.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) onGenerate()
          }}
        />
        <button className="command-go" onClick={onGenerate} disabled={loading}>
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>

      <div className="mode-pills" role="group" aria-label="Naming style">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            className={`mode-pill${mode === m.value ? ' selected' : ''}`}
            title={m.desc}
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
          >
            <span className="mode-pill-label">{m.label}</span>
            <span className="mode-pill-eg">{m.example}</span>
          </button>
        ))}
      </div>

      <div className="chips-row">
        <Chip label={lengthLabel}>
          {LENGTHS.map((l) => (
            <button
              key={l.label}
              className={`menu-item${config.min_len === l.min && config.max_len === l.max ? ' selected' : ''}`}
              onClick={() => onChange({ ...config, min_len: l.min, max_len: l.max })}
            >
              <span className="menu-label">{l.label}</span>
              <span className="menu-desc">{l.min}–{l.max} letters</span>
            </button>
          ))}
        </Chip>

        <Chip label={creativityLabel}>
          {CREATIVITY.map((c) => (
            <button
              key={c.label}
              className={`menu-item${config.temperature === c.temperature && config.variety === c.variety ? ' selected' : ''}`}
              onClick={() => onChange({ ...config, temperature: c.temperature, variety: c.variety })}
            >
              <span className="menu-label">{c.label}</span>
            </button>
          ))}
        </Chip>

        <Chip
          label="⋯"
          active={Boolean(config.roots?.length || config.starts_with || config.contains)}
        >
          <div className="menu-form" onClick={(e) => e.stopPropagation()}>
            <label>
              <span>Seed words{mode !== 'brandable' ? ' (Brandable mode only)' : ''}</span>
              <input
                type="text"
                placeholder="e.g. sync, orbit"
                disabled={mode !== 'brandable'}
                value={config.roots?.join(', ') ?? ''}
                onChange={(e) => {
                  const roots = e.target.value
                    .split(',')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean)
                  set('roots', roots)
                }}
              />
            </label>
            <label>
              <span>Starts with</span>
              <input
                type="text"
                maxLength={3}
                placeholder="e.g. z"
                value={config.starts_with ?? ''}
                onChange={(e) => set('starts_with', e.target.value || undefined)}
              />
            </label>
            <label>
              <span>Contains</span>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. ex"
                value={config.contains ?? ''}
                onChange={(e) => set('contains', e.target.value || undefined)}
              />
            </label>
          </div>
        </Chip>
      </div>

      {mode === 'realword' && (config.description?.trim() ?? '') !== '' && (
        <p className="mode-note">
          Real-word picks come from a curated pool — your description isn’t used. Try
          Brandable, Respelled or Compound for prompt-driven names.
        </p>
      )}
    </div>
  )
}
