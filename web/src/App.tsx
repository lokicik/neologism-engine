import { useState, useCallback } from 'react'
import { generateNames, batchMetrics, type BatchMetrics, type Config, type NameResult } from './lib/engine'
import { recommendations } from './lib/recommend'
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
  roots: [],
}

export default function App() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [results, setResults] = useState<NameResult[]>([])
  const [metrics, setMetrics] = useState<BatchMetrics | null>(null)
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
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

  // Per-name badges derived from the batch metrics.
  const badgesFor = (i: number): string[] => {
    if (!metrics || results.length < 2) return []
    const b: string[] = []
    if (i === metrics.stats.best_index) b.push('👑 Best')
    const origIdx = results.reduce((m, r, k) => (r.score_novelty > results[m].score_novelty ? k : m), 0)
    const easyIdx = results.reduce((m, r, k) => (r.score_pronounce > results[m].score_pronounce ? k : m), 0)
    if (i === origIdx) b.push('✦ Original')
    if (i === easyIdx) b.push('🔊 Easy say')
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

        {results.length > 0 && (
          <section className="results-grid">
            {results.map((r, i) => (
              <NameCard
                key={r.name}
                result={r}
                isFavorite={favoriteNames.has(r.name)}
                onToggleFavorite={handleToggleFavorite}
                badges={badgesFor(i)}
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
