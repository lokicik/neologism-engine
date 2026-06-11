import { useState } from 'react'
import type { Config, Style } from '../lib/engine'

interface Props {
  config: Config
  onChange: (cfg: Config) => void
  onGenerate: () => void
  loading: boolean
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

export function Controls({ config, onChange, onGenerate, loading }: Props) {
  const [showCreative, setShowCreative] = useState(config.style !== 'big_tech')

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
      <div className="style-selector">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={`style-btn${isStartup && mode === m.value ? ' active' : ''}`}
            onClick={() => setMode(m.value)}
            title={m.desc}
          >
            {m.label}
          </button>
        ))}
      </div>

      <button
        className={`creative-toggle${!isStartup ? ' active' : ''}`}
        onClick={() => setShowCreative(!showCreative)}
      >
        {showCreative ? '▾' : '▸'} Creative styles (Sci-Fi, Fantasy)
      </button>

      {showCreative && (
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
        </div>
      )}

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

      <div className="sliders">
        <label>
          <span>Count <strong>{config.count}</strong></span>
          <input
            type="range" min={3} max={20} step={1}
            value={config.count ?? 10}
            onChange={(e) => set('count', Number(e.target.value))}
          />
        </label>

        <label>
          <span>Min length <strong>{config.min_len}</strong></span>
          <input
            type="range" min={3} max={8} step={1}
            value={config.min_len ?? 4}
            onChange={(e) => set('min_len', Number(e.target.value))}
          />
        </label>

        <label>
          <span>Max length <strong>{config.max_len}</strong></span>
          <input
            type="range" min={6} max={18} step={1}
            value={config.max_len ?? 12}
            onChange={(e) => set('max_len', Number(e.target.value))}
          />
        </label>

        <label>
          <span>Randomness <strong>{((config.temperature ?? 0.7) * 100).toFixed(0)}%</strong></span>
          <input
            type="range" min={0.1} max={1.5} step={0.05}
            value={config.temperature ?? 0.7}
            onChange={(e) => set('temperature', Number(e.target.value))}
          />
        </label>

        {isStartup && (
          <label title="How different the names in a batch are from each other (shapes, lengths, sounds). Higher = more varied, looser quality.">
            <span>Variety <strong>{((config.variety ?? 0.3) * 100).toFixed(0)}%</strong></span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={config.variety ?? 0.3}
              onChange={(e) => set('variety', Number(e.target.value))}
            />
          </label>
        )}
      </div>

      {isStartup && mode === 'brandable' && (
        <div className="roots-input">
          <label>
            <span>Describe your product (optional)</span>
            <textarea
              rows={2}
              placeholder="e.g. an app for splitting expenses with friends"
              value={config.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>
          <label>
            <span>Or seed words (comma-separated)</span>
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
        </div>
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

      <button className="generate-btn" onClick={onGenerate} disabled={loading}>
        {loading ? 'Generating…' : 'Generate'}
      </button>
    </div>
  )
}
