import { useState, useCallback } from 'react'
import { generateNames, batchMetrics, type BatchMetrics, type Config, type NameResult } from './lib/engine'
import { recommendations } from './lib/recommend'
import { buildProfile, rankByPreference } from './lib/preferences'
import { loadFavorites, toggleFavorite } from './lib/storage'
import { Controls } from './components/Controls'
import { NameCard } from './components/NameCard'
import { StatsPanel } from './components/StatsPanel'
import { Favorites } from './components/Favorites'

const DEFAULT_CONFIG: Config = {
  style: 'big_tech',
  count: 10,
  min_len: 4,
  max_len: 12,
  temperature: 0.7,
  variety: 0.3,
  roots: [],
}

export default function App() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [results, setResults] = useState<NameResult[]>([])
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null)
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
  const [tuned, setTuned] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const names = await generateNames(config)
      setResults(names)
      setMetrics(names.length > 0 ? await batchMetrics(names) : null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [config])

  const handleToggleFavorite = useCallback((item: NameResult) => {
    setFavorites((prev) => toggleFavorite(prev, item))
  }, [])

  const favoriteNames = new Set(favorites.map((f) => f.name))

  // Preference profile learned from favorites (Namelix-style); needs ≥3.
  const profile = buildProfile(favorites)
  const displayResults = tuned && profile ? rankByPreference(results, profile) : results

  // Standout names by metric (compared by name, so re-ranking doesn't break badges).
  const bestName = metrics && results.length >= 2 ? results[metrics.stats.best_index]?.name : undefined
  const origName = results.length >= 2
    ? results.reduce((m, r) => (r.score_novelty > m.score_novelty ? r : m)).name : undefined
  const easyName = results.length >= 2
    ? results.reduce((m, r) => (r.score_pronounce > m.score_pronounce ? r : m)).name : undefined

  const badgesFor = (r: NameResult): string[] => {
    const b: string[] = []
    if (r.name === bestName) b.push('👑 Best')
    if (r.name === origName) b.push('✦ Original')
    if (r.name === easyName) b.push('🔊 Easy say')
    return b
  }

  const tips = metrics ? recommendations(metrics.stats, config, results) : []

  return (
    <div className="app">
      <header className="app-header">
        <h1>Neologism Engine</h1>
        <p className="tagline">Invented names for big-tech brands, sci-fi worlds, and fantasy realms.</p>
      </header>

      <main className="app-main">
        <Controls
          config={config}
          onChange={setConfig}
          onGenerate={handleGenerate}
          loading={loading}
        />

        {error && <div className="error-banner">{error}</div>}

        {metrics && <StatsPanel stats={metrics.stats} tips={tips} />}

        {results.length > 0 && profile && (
          <label className="tuned-toggle">
            <input type="checkbox" checked={tuned} onChange={(e) => setTuned(e.target.checked)} />
            <span>Tuned to your favorites</span>
          </label>
        )}

        {displayResults.length > 0 && (
          <section className="results-grid">
            {displayResults.map((r) => (
              <NameCard
                key={r.name}
                result={r}
                isFavorite={favoriteNames.has(r.name)}
                onToggleFavorite={handleToggleFavorite}
                badges={badgesFor(r)}
              />
            ))}
          </section>
        )}

        {results.length === 0 && !loading && (
          <div className="empty-state">
            Choose a style and hit Generate.
          </div>
        )}
      </main>

      <Favorites favorites={favorites} onRemove={handleToggleFavorite} />
    </div>
  )
}
