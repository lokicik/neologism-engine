import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Config } from '../lib/engine'
import { MIN_TASTE_SIGNALS, parseTasteReferences } from '../lib/preferences'

interface Props {
  config: Config
  onChange: (cfg: Config) => void
  onGenerate: () => void
  loading: boolean
  tasteReferences: string
  tasteReferenceError: string | null
  onTasteReferencesChange: (value: string) => boolean
}

// Phase 41: command-bar dashboard (the Ideogram/Google-search pattern) — one
// prompt bar, options as compact dropdown chips, results below. Style is
// always big_tech here; the engine still supports the creative styles, they
// are just no longer part of the web product.

type Mode = 'auto' | 'brandable' | 'realword' | 'respell' | 'compound' | 'seamblend' | 'morpheme' | 'submorph' | 'reason' | 'shared_pool' | 'intent_pool'

const MODES: { value: Mode; label: string; example: string; desc: string }[] = [
  { value: 'auto', label: 'Auto', example: 'best fit', desc: 'Chooses a brief-aware mix — the default' },
  { value: 'brandable', label: 'Brandable', example: 'Spotify', desc: 'Invented coinages — Spotify, Vercel' },
  { value: 'realword', label: 'Real words', example: 'Notion', desc: 'Evocative dictionary words — Notion, Linear (ignores your description)' },
  { value: 'respell', label: 'Respelled', example: 'Lyft', desc: 'Twisted real words — Lyft, Tumblr' },
  { value: 'compound', label: 'Compound', example: 'SwiftForge', desc: 'Two-word names — SwiftForge' },
  { value: 'seamblend', label: 'Seam blend', example: 'Pinterest', desc: 'Lab: two words fused at a phonetic seam — experimental' },
  { value: 'morpheme', label: 'Morpheme', example: 'Novalux', desc: 'Lab: Greek/Latin roots composed by meaning — experimental' },
  { value: 'submorph', label: 'Dense coinage', example: 'Vercel', desc: 'Lab: every syllable carries meaning, seam invisible — the promptless Auto lead' },
  { value: 'reason', label: 'Reason', example: 'Kubernetes', desc: 'Lab: names found by deterministic reasoning — each card shows its chain (password → vault → Donjon)' },
  { value: 'shared_pool', label: 'Shared pool', example: 'Lab', desc: 'Lab: compare nine naming families and select finalists directly — experimental' },
  { value: 'intent_pool', label: 'Brief intent', example: 'Lab', desc: 'Lab: preserve the operation, object and context before generating names — experimental' },
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
  if (config.variant === 'shared_pool') return 'shared_pool'
  if (config.variant === 'intent_pool') return 'intent_pool'
  if (config.variant === 'auto') return 'auto'
  if (config.compound) return 'compound'
  if (config.variant === 'realword') return 'realword'
  if (config.variant === 'respell') return 'respell'
  if (config.variant === 'seamblend') return 'seamblend'
  if (config.variant === 'morpheme') return 'morpheme'
  if (config.variant === 'submorph') return 'submorph'
  if (config.variant === 'reason') return 'reason'
  return 'brandable'
}

// A nonmodal disclosure that can contain either choices or real form fields.
// Selection/Escape restore its trigger; natural focus and pointer exits do not.
function Chip({
  label,
  controlLabel,
  panelLabel,
  children,
  active,
  closeOnSelect = false,
}: {
  label: string
  controlLabel: string
  panelLabel: string
  children: ReactNode
  active?: boolean
  closeOnSelect?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const closeAndRestore = () => {
    triggerRef.current?.focus({ preventScroll: true })
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div
      className="chip-wrap"
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.preventDefault()
        event.stopPropagation()
        closeAndRestore()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`chip${open || active ? ' open' : ''}`}
        aria-label={controlLabel}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        {label} <span className="chip-caret">▾</span>
      </button>
      {open && (
        <div
          className="chip-menu"
          id={panelId}
          role="group"
          aria-label={panelLabel}
          onClick={closeOnSelect ? closeAndRestore : undefined}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function CommandBar({
  config,
  onChange,
  onGenerate,
  loading,
  tasteReferences,
  tasteReferenceError,
  onTasteReferencesChange,
}: Props) {
  const mode = currentMode(config)
  const referenceCount = parseTasteReferences(tasteReferences).length
  const referencesNeeded = Math.max(0, MIN_TASTE_SIGNALS - referenceCount)
  const lengthLabel =
    LENGTHS.find((l) => l.min === config.min_len && l.max === config.max_len)?.chip ?? 'Any length'
  const creativityLabel =
    CREATIVITY.find((c) => c.temperature === config.temperature && c.variety === config.variety)
      ?.label ?? 'Balanced'
  const advancedActive = Boolean(
    tasteReferences.trim()
    || config.roots?.length
    || config.starts_with
    || config.contains,
  )

  const setMode = (m: Mode) =>
    onChange({
      ...config,
      style: 'big_tech',
      compound: m === 'compound',
      variant:
        m === 'realword' || m === 'respell' || m === 'auto' || m === 'seamblend' || m === 'morpheme'
          || m === 'submorph' || m === 'reason' || m === 'shared_pool' || m === 'intent_pool'
          ? m
          : undefined,
    })

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    onChange({ ...config, [key]: value })

  const generate = () => {
    if (!loading) onGenerate()
  }

  return (
    <div className="command-area">
      <div className="command-bar">
        <span className="command-glyph">⌕</span>
        <input
          className="command-input"
          type="text"
          aria-label="Project brief"
          placeholder="What are you building? (optional)"
          value={config.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') generate()
          }}
        />
        <button
          type="button"
          className="command-go"
          aria-disabled={loading}
          aria-busy={loading}
          onClick={generate}
        >
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
        <Chip
          label={lengthLabel}
          controlLabel={`Length: ${lengthLabel}`}
          panelLabel="Length choices"
          closeOnSelect
        >
          {LENGTHS.map((l) => (
            <button
              type="button"
              key={l.label}
              className={`menu-item${config.min_len === l.min && config.max_len === l.max ? ' selected' : ''}`}
              aria-pressed={config.min_len === l.min && config.max_len === l.max}
              onClick={() => onChange({ ...config, min_len: l.min, max_len: l.max })}
            >
              <span className="menu-label">{l.label}</span>
              <span className="menu-desc">{l.min}–{l.max} letters</span>
            </button>
          ))}
        </Chip>

        <Chip
          label={creativityLabel}
          controlLabel={`Creativity: ${creativityLabel}`}
          panelLabel="Creativity choices"
          closeOnSelect
        >
          {CREATIVITY.map((c) => (
            <button
              type="button"
              key={c.label}
              className={`menu-item${config.temperature === c.temperature && config.variety === c.variety ? ' selected' : ''}`}
              aria-pressed={config.temperature === c.temperature && config.variety === c.variety}
              onClick={() => onChange({ ...config, temperature: c.temperature, variety: c.variety })}
            >
              <span className="menu-label">{c.label}</span>
            </button>
          ))}
        </Chip>

        <Chip
          label="Advanced"
          controlLabel={`Advanced filters${advancedActive ? ', applied' : ''}`}
          panelLabel="Advanced filters"
          active={advancedActive}
        >
          <div className="menu-form" onClick={(e) => e.stopPropagation()}>
            <label>
              <span className="menu-label-line">
                <span>Names you like</span>
                <span className="menu-progress">
                  {Math.min(referenceCount, MIN_TASTE_SIGNALS)}/{MIN_TASTE_SIGNALS}
                </span>
              </span>
              <input
                className="taste-reference-input"
                type="text"
                maxLength={240}
                placeholder="Vercel, Linear, Notion"
                value={tasteReferences}
                aria-describedby={`taste-reference-help${tasteReferenceError ? ' taste-reference-error' : ''}`}
                onChange={(e) => {
                  if (!onTasteReferencesChange(e.target.value)) e.currentTarget.value = tasteReferences
                }}
              />
              <small id="taste-reference-help" className="menu-help">
                {referencesNeeded === 0
                  ? 'Guiding the larger local candidate pool.'
                  : `Add ${referencesNeeded} more ${referencesNeeded === 1 ? 'name' : 'names'} to guide local ranking.`}
              </small>
              {tasteReferenceError && (
                <small id="taste-reference-error" className="taste-reference-error" role="alert">
                  {tasteReferenceError}
                </small>
              )}
            </label>
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
