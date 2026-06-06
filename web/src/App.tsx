import { useState, useCallback } from 'react'
import { generateNames, type Config, type NameResult } from './lib/engine'
import { loadFavorites, toggleFavorite } from './lib/storage'
import { Controls } from './components/Controls'
import { NameCard } from './components/NameCard'
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
  const [favorites, setFavorites] = useState<NameResult[]>(loadFavorites)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const names = await generateNames(config)
      setResults(names)
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

        {results.length > 0 && (
          <section className="results-grid">
            {results.map((r) => (
              <NameCard
                key={r.name}
                result={r}
                isFavorite={favoriteNames.has(r.name)}
                onToggleFavorite={handleToggleFavorite}
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
