import type { Config, Style } from '../lib/engine'

interface Props {
  config: Config
  onChange: (cfg: Config) => void
  onGenerate: () => void
  loading: boolean
}

const STYLES: { value: Style; label: string; desc: string }[] = [
  { value: 'big_tech', label: 'Big Tech', desc: 'Portmanteau brand names like Spotify, Vercel' },
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

export function Controls({ config, onChange, onGenerate, loading }: Props) {
  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    onChange({ ...config, [key]: value })

  // Switching style clears any variant from the previous style.
  const setStyle = (style: Style) =>
    onChange({ ...config, style, variant: undefined })

  const variants = VARIANTS[config.style]

  return (
    <div className="controls">
      <div className="style-selector">
        {STYLES.map((s) => (
          <button
            key={s.value}
            className={`style-btn${config.style === s.value ? ' active' : ''}`}
            onClick={() => setStyle(s.value)}
            title={s.desc}
          >
            {s.label}
          </button>
        ))}
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
      </div>

      {config.style === 'big_tech' && (
        <div className="roots-input">
          <label>
            <span>Seed words (optional, comma-separated)</span>
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

      <button className="generate-btn" onClick={onGenerate} disabled={loading}>
        {loading ? 'Generating…' : 'Generate'}
      </button>
    </div>
  )
}
