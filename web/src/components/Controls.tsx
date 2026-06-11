import { useState } from 'react'
import type { Config, Style } from '../lib/engine'

interface Props {
  config: Config
  onChange: (cfg: Config) => void
  onGenerate: () => void
  loading: boolean
  aiRank: boolean
  onAiRank: (on: boolean) => void
  ranking: boolean
}

// Startup/project naming modes — all big_tech under the hood; respell/realword
// map to the engine's variant field (Phase 36), compound to the compound flag.
type Mode = 'brandable' | 'realword' | 'respell' | 'compound'

const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: 'brandable', label: 'Brandable', desc: 'Invented coinages — Spotify, Vercel' },
  { value: 'realword', label: 'Real words', desc: 'Evocative dictionary words — Notion, Linear' },
  { value: 'respell', label: 'Respelled', desc: 'Twisted real words — Lyft, Tumblr' },
  { value: 'compound', label: 'Compound', desc: 'Two-word names — SwiftForge, BrightLoom' },
]

// The two segmented refiners replace the old five sliders (Phase 37): each
// option is a preset over the underlying engine knobs.
const LENGTHS: { label: string; min: number; max: number }[] = [
  { label: 'Short', min: 4, max: 6 },
  { label: 'Medium', min: 5, max: 9 },
  { label: 'Long', min: 8, max: 14 },
  { label: 'Any', min: 4, max: 12 },
]

const CREATIVITY: { label: string; temperature: number; variety: number }[] = [
  { label: 'Safe', temperature: 0.6, variety: 0.15 },
  { label: 'Balanced', temperature: 0.85, variety: 0.3 },
  { label: 'Wild', temperature: 1.2, variety: 0.6 },
]

const CREATIVE_STYLES: { value: Style; label: string; desc: string }[] = [
  { value: 'sci_fi', label: 'Sci-Fi', desc: 'Star names, AI cores, alien civilisations' },
  { value: 'fantasy', label: 'Fantasy', desc: 'Elves, orcs, ancient kingdoms' },
]

const VARIANTS: Partial<Record<Style, { value: string; label: string }[]>> = {
  sci_fi: [
    { value: 'stellar', label: 'Stellar' },
    { value: 'machine', label: 'Machine' },
    { value: 'alien', label: 'Alien' },
  ],
  fantasy: [
    { value: 'elvish', label: 'Elvish' },
    { value: 'dwarvish', label: 'Dwarvish' },
    { value: 'orcish', label: 'Orcish' },
    { value: 'common', label: 'Common' },
  ],
}

function currentMode(config: Config): Mode {
  if (config.compound) return 'compound'
  if (config.variant === 'realword') return 'realword'
  if (config.variant === 'respell') return 'respell'
  return 'brandable'
}

export function Controls({ config, onChange, onGenerate, loading, aiRank, onAiRank, ranking }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(config.style !== 'big_tech')

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    onChange({ ...config, [key]: value })

  const isStartup = config.style === 'big_tech'
  const mode = currentMode(config)

  const setMode = (m: Mode) =>
    onChange({
      ...config,
      style: 'big_tech',
      compound: m === 'compound',
      variant: m === 'realword' || m === 'respell' ? m : undefined,
    })

  // Switching creative style clears any variant/mode from the previous one.
  const setCreativeStyle = (style: Style) =>
    onChange({ ...config, style, variant: undefined, compound: false })

  const variants = isStartup ? undefined : VARIANTS[config.style]

  return (
    <div className="controls">
      <div className="hero">
        <textarea
          className="hero-input"
          rows={2}
          placeholder="What are you building? (optional — e.g. an app for splitting expenses with friends)"
          value={config.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
        />
        <button className="generate-btn" onClick={onGenerate} disabled={loading}>
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>

      <div className="mode-pills">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={`pill${isStartup && mode === m.value ? ' active' : ''}`}
            onClick={() => setMode(m.value)}
            title={m.desc}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="refine-row">
        <div className="segment-group">
          <span className="segment-label">Length</span>
          {LENGTHS.map((l) => (
            <button
              key={l.label}
              className={`segment${config.min_len === l.min && config.max_len === l.max ? ' active' : ''}`}
              onClick={() => onChange({ ...config, min_len: l.min, max_len: l.max })}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="segment-group">
          <span className="segment-label">Creativity</span>
          {CREATIVITY.map((c) => (
            <button
              key={c.label}
              className={`segment${config.temperature === c.temperature && config.variety === c.variety ? ' active' : ''}`}
              onClick={() => onChange({ ...config, temperature: c.temperature, variety: c.variety })}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <button className="creative-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? '▾' : '▸'} Advanced
      </button>

      {showAdvanced && (
        <div className="advanced-panel">
          {isStartup && mode === 'brandable' && (
            <label>
              <span>Seed words (comma-separated)</span>
              <input
                type="text"
                placeholder="e.g. sync, orbit"
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
          )}

          <div className="constraints-row">
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

          <div className="advanced-creative">
            <span className="segment-label">Creative styles</span>
            <div className="variant-selector">
              {CREATIVE_STYLES.map((s) => (
                <button
                  key={s.value}
                  className={`variant-btn${config.style === s.value ? ' active' : ''}`}
                  onClick={() => setCreativeStyle(s.value)}
                  title={s.desc}
                >
                  {s.label}
                </button>
              ))}
              {!isStartup && (
                <button className="variant-btn" onClick={() => setMode('brandable')}>
                  ← Startup
                </button>
              )}
            </div>
            {variants && (
              <div className="variant-selector">
                <button
                  className={`variant-btn${!config.variant ? ' active' : ''}`}
                  onClick={() => set('variant', undefined)}
                >
                  Mixed
                </button>
                {variants.map((v) => (
                  <button
                    key={v.value}
                    className={`variant-btn${config.variant === v.value ? ' active' : ''}`}
                    onClick={() => set('variant', v.value)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <label
            className="tuned-toggle"
            title="Re-rank results with a local LLM (llama.cpp at 127.0.0.1:8080). Falls back silently to offline ranking if unavailable."
          >
            <input
              type="checkbox"
              checked={aiRank}
              onChange={(e) => onAiRank(e.target.checked)}
              disabled={loading || ranking}
            />
            <span>✨ AI rank (local LLM){ranking ? ' — ranking…' : ''}</span>
          </label>
        </div>
      )}
    </div>
  )
}
