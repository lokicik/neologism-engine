import { useEffect, useState } from 'react'
import { cratesTaken, explainName, type Explanation, type NameResult } from '../lib/engine'
import { advocacyFor, contextsFor } from '../lib/shortlist'
import { composite } from '../lib/score'
import { Monogram } from './Monogram'
import { IconStar, IconThumbDown } from './icons'

interface Props {
  finalists: NameResult[]
  favoriteKeys: Set<string>
  rejectedKeys: Set<string>
  identityOf: (result: NameResult) => string
  onToggleFavorite: (result: NameResult, keyboard?: boolean) => void
  onToggleRejected: (result: NameResult) => void
  /// Batch size behind the shortlist, for the reveal control.
  totalCount: number
  showingAll: boolean
  onToggleAll: () => void
}

/// The finalists panel.
///
/// A hundred names scrolled past is how the last six rounds ended with nothing
/// chosen: a name is not judged in a grid, it is judged where it will be read.
/// So the page argues for a few candidates instead of listing many — each with
/// the engine's own case for it, its availability, and the places it has to
/// survive. The full batch is still one click away.
export function Shortlist({
  finalists,
  favoriteKeys,
  rejectedKeys,
  identityOf,
  onToggleFavorite,
  onToggleRejected,
  totalCount,
  showingAll,
  onToggleAll,
}: Props) {
  // Names without a chain still deserve a real case, so the engine's own
  // explanation is fetched for them (the same call behind the card's Why).
  const [explanations, setExplanations] = useState<Record<string, Explanation>>({})
  const unexplained = finalists
    .filter((result) => !result.reasonChain && !explanations[result.name])
    .map((result) => result.name)
    .join('|')
  useEffect(() => {
    if (unexplained === '') return
    let live = true
    void Promise.all(unexplained.split('|').map(async (name) => (
      [name, await explainName(name)] as const
    ))).then((pairs) => {
      if (!live) return
      setExplanations((current) => ({ ...current, ...Object.fromEntries(pairs) }))
    }).catch(() => {})
    return () => { live = false }
  }, [unexplained])

  if (finalists.length === 0) return null
  return (
    <section className="shortlist" aria-label="Shortlist">
      <div className="shortlist-head">
        <h2 className="shortlist-title">
          {finalists.length === 1 ? 'One finalist' : `${finalists.length} finalists`}
        </h2>
        <p className="shortlist-note">
          Live with one for a week — that is the test, not how many you liked.
        </p>
      </div>

      <div className="finalist-list">
        {finalists.map((result, index) => {
          const identity = identityOf(result)
          const taken = cratesTaken(result.name)
          const isFavorite = favoriteKeys.has(identity)
          const isRejected = rejectedKeys.has(identity)
          return (
            <article
              key={result.name}
              className={`finalist${isRejected ? ' passed' : ''}`}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className="finalist-head">
                <Monogram name={result.name} size={44} />
                <div className="finalist-identity">
                  <h3 className="finalist-name">{result.name}</h3>
                  <p className="finalist-case">{advocacyFor(result, explanations[result.name])}</p>
                </div>
                <div className="finalist-marks">
                  <span className="finalist-score">★ {composite(result)}</span>
                  {taken !== undefined && (
                    <span className={`finalist-avail${taken ? ' taken' : ''}`}>
                      {taken ? 'crates.io ✗ taken' : 'crates.io ✓ free'}
                    </span>
                  )}
                </div>
              </div>

              <ul className="finalist-contexts">
                {contextsFor(result.name).map((context) => (
                  <li key={context.label}>
                    <span className="context-label">{context.label}</span>
                    <code>{context.text}</code>
                  </li>
                ))}
              </ul>

              <div className="finalist-actions">
                <button
                  type="button"
                  className={`card-chip${isFavorite ? ' active' : ''}`}
                  aria-pressed={isFavorite}
                  onClick={(event) => onToggleFavorite(result, event.detail === 0)}
                  title="Keep this one on the table"
                >
                  <IconStar filled={isFavorite} />
                  <span>{isFavorite ? 'Kept' : 'Keep'}</span>
                </button>
                <button
                  type="button"
                  className={`card-chip${isRejected ? ' active' : ''}`}
                  aria-pressed={isRejected}
                  onClick={() => onToggleRejected(result)}
                  title="Not this one"
                >
                  <IconThumbDown />
                  <span>Pass</span>
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <button className="shortlist-reveal" onClick={onToggleAll} aria-expanded={showingAll}>
        {showingAll
          ? 'Hide the rest of the batch'
          : `Show all ${totalCount} names`}
      </button>
    </section>
  )
}
