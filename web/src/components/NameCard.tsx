import { useState, useEffect } from 'react'
import { explainName, type Explanation, type NameResult } from '../lib/engine'
import { checkDomains, checkHandles, isAuthoritative, trademarkLinks, HANDLES, TLDS, type DomainStatus } from '../lib/domain'
import { composite } from '../lib/score'
import { Monogram } from './Monogram'
import { IconCopy, IconCheck, IconStar, IconThumbDown } from './icons'

interface Props {
  result: NameResult
  isFavorite: boolean
  onToggleFavorite: (r: NameResult) => void
  /// Saved-page wording distinguishes collection membership from taste.
  favoriteAction?: 'favorite' | 'saved'
  /// Optional collection provenance shown without changing the name result.
  collectionNote?: string
  /// Share payloads contain no scores or syllable analysis.
  metricsAvailable?: boolean
  /// Explicit negative taste signal used by the local preference ranker.
  isRejected?: boolean
  onToggleRejected?: (r: NameResult) => void
  /// Highest composite in the batch — gets the crown.
  isBest?: boolean
  /// Entrance-animation stagger (ms) — set by the results grid so freshly
  /// appended cards slide/fade in one after another (Phase 49).
  appearDelay?: number
  /// One-line LLM judgment shown after "Sharpen with AI" (Phase 50).
  reason?: string
  /// The AI judge's #1 pick of the batch.
  isAiPick?: boolean
}

// Shown only for non-startup names (old sci-fi/fantasy favorites & share URLs).
const STYLE_LABEL: Record<string, string> = {
  sci_fi: 'Sci-Fi',
  fantasy: 'Fantasy',
}

function idleMap(): Record<string, DomainStatus> {
  const m: Record<string, DomainStatus> = {}
  for (const tld of TLDS) m[tld] = 'idle'
  for (const h of HANDLES) m[h] = 'idle'
  return m
}

// Render the structural facts as a short human sentence fragment list.
function whyParts(e: Explanation): string[] {
  const parts: string[] = []
  if (e.is_real_word) parts.push('a real English word')
  if (e.prefix_word) parts.push(`opens with “${e.prefix_word}” (real word)`)
  if (e.suffix && e.stem) parts.push(`“${e.stem}” + brandable “-${e.suffix}”`)
  if (e.score_pronounce >= 85) parts.push('easy to say')
  if (e.score_memorability >= 80) parts.push('short & punchy')
  if (e.score_novelty >= 90 && !e.is_real_word) parts.push('clearly coined')
  return parts
}

export function NameCard({ result, isFavorite, onToggleFavorite, favoriteAction = 'favorite', collectionNote, metricsAvailable = true, isRejected = false, onToggleRejected, isBest = false, appearDelay = 0, reason, isAiPick = false }: Props) {
  const [copied, setCopied] = useState(false)
  const [domains, setDomains] = useState<Record<string, DomainStatus>>(idleMap)
  const [showAvail, setShowAvail] = useState(false)
  const [why, setWhy] = useState<Explanation | null>(null)
  const [showWhy, setShowWhy] = useState(false)

  useEffect(() => {
    setDomains(idleMap())
    setShowAvail(false)
    setWhy(null)
    setShowWhy(false)
  }, [result.name])

  function copy() {
    navigator.clipboard.writeText(result.name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function toggleWhy() {
    const next = !showWhy
    setShowWhy(next)
    if (next && !why) {
      explainName(result.name).then(setWhy).catch(() => {})
    }
  }

  function toggleAvailability() {
    const next = !showAvail
    setShowAvail(next)
    // Fire the checks the first time the panel opens.
    if (next && Object.values(domains).every((s) => s === 'idle')) {
      const checking: Record<string, DomainStatus> = {}
      for (const tld of TLDS) checking[tld] = 'checking'
      for (const h of HANDLES) checking[h] = 'checking'
      setDomains(checking)
      void checkDomains(result.name, (tld, status) => {
        setDomains((prev) => ({ ...prev, [tld]: status }))
      })
      void checkHandles(result.name, (handle, status) => {
        setDomains((prev) => ({ ...prev, [handle]: status }))
      })
    }
  }

  function domainBadgeClass(status: DomainStatus): string {
    if (status === 'available') return 'badge badge-available'
    if (status === 'taken') return 'badge badge-taken'
    if (status === 'checking') return 'badge badge-checking'
    return 'badge badge-idle'
  }

  function domainLabel(key: string, status: DomainStatus): string {
    if (status === 'checking') return `${key} …`
    if (status === 'available') return `${key} ✓`
    if (status === 'taken') return `${key} ✗`
    return `${key} ?`
  }

  const metaParts: string[] = []
  if (metricsAvailable) {
    metaParts.push(`${result.syllables} syllable${result.syllables === 1 ? '' : 's'}`)
  }
  if (result.connotations.length > 0) {
    metaParts.push(result.connotations.slice(0, 3).join(', '))
  }
  if (STYLE_LABEL[result.style]) metaParts.unshift(STYLE_LABEL[result.style])

  return (
    <div className={`name-card${isFavorite ? ' favorited' : ''}${isRejected ? ' rejected' : ''}`} style={{ animationDelay: `${appearDelay}ms` }}>
      <div className="card-top">
        <Monogram name={result.name} size={36} />
        <span className="name-text">{result.name}</span>
        <span
          className="card-score"
          title={metricsAvailable
            ? 'Overall score — pronounceability, memorability and originality blended'
            : 'Share links carry only the name and style'}
        >
          {metricsAvailable ? (
            <>
              {isAiPick && <span className="card-aipick" title="The AI judge's top pick of this batch">✨</span>}
              {isBest && <span className="card-crown" title="Top pick of this batch">👑</span>}
              ★ {composite(result)}
            </>
          ) : 'Shared'}
        </span>
      </div>

      {metaParts.length > 0 && (
        <p className="card-meta-line" title="Syllables · the vibe this name evokes (sound symbolism)">
          {metaParts.join(' · ')}
        </p>
      )}

      {collectionNote && <p className="card-meta-line">{collectionNote}</p>}

      {reason && (
        <p className="card-ai-reason" title="Why the AI judge rated this name">
          ✨ {reason}
        </p>
      )}

      {showWhy && (
        <div className="card-expansion">
          {why ? (
            <>
              {whyParts(why).join(' · ') || 'a pure coinage — no real-word parts'}
              <span className="why-scores">
                say {why.score_pronounce} · stick {why.score_memorability} · new {why.score_novelty}
              </span>
            </>
          ) : (
            <span>…</span>
          )}
        </div>
      )}

      {showAvail && (
        <div className="card-expansion">
          <div className="avail-section">
            <span className="avail-label" title="The checks that matter for a project name — and that other name generators skip">
              Dev namespaces
            </span>
            <div className="domain-row">
              {HANDLES.map((h) => (
                <span
                  key={h}
                  className={domainBadgeClass(domains[h])}
                  title={{ gh: 'GitHub username', npm: 'npm package', pypi: 'PyPI package', crates: 'crates.io crate' }[h]}
                >
                  {domainLabel(h, domains[h])}
                </span>
              ))}
            </div>
          </div>
          <div className="avail-section">
            <span className="avail-label">Domains &amp; trademark</span>
            <div className="domain-row">
              {TLDS.map((tld) => (
                <span
                  key={tld}
                  className={domainBadgeClass(domains[tld])}
                  title={isAuthoritative(tld) ? 'Registry (RDAP) — authoritative' : 'DNS lookup — indicator only'}
                >
                  {domainLabel(tld, domains[tld])}
                  {!isAuthoritative(tld) ? '~' : ''}
                </span>
              ))}
              {trademarkLinks(result.name).map((l) => (
                <a key={l.label} className="badge badge-idle tm-link" href={l.url} target="_blank" rel="noreferrer" title="Open trademark search (manual check)">
                  ™ {l.label}
                </a>
              ))}
            </div>
          </div>
          <span className="domain-disclaimer">~ DNS indicator only</span>
        </div>
      )}

      <div className="card-actions-row">
        <button className={`card-chip${showWhy ? ' active' : ''}`} onClick={toggleWhy}>
          Why <span className={`chip-chevron${showWhy ? ' open' : ''}`}>▾</span>
        </button>
        <button className={`card-chip${showAvail ? ' active' : ''}`} onClick={toggleAvailability}>
          Availability <span className={`chip-chevron${showAvail ? ' open' : ''}`}>▾</span>
        </button>
        <div className="card-icons">
          <button className="icon-btn" onClick={copy} title="Copy name">
            <span className={`copy-swap${copied ? ' copied' : ''}`}>
              <span className="copy-copy"><IconCopy /></span>
              <span className="copy-check"><IconCheck /></span>
            </span>
          </button>
          {onToggleRejected && (
            <button
              className={`icon-btn pass-btn${isRejected ? ' passed' : ''}`}
              onClick={() => onToggleRejected(result)}
              title={isRejected ? 'Undo pass' : 'Not for me — tune future batches'}
              aria-label={isRejected ? `Undo pass on ${result.name}` : `${result.name} is not for me`}
              aria-pressed={isRejected}
            >
              <IconThumbDown />
            </button>
          )}
          <button
            className={`icon-btn star-btn${isFavorite ? ' starred' : ''}`}
            onClick={() => onToggleFavorite(result)}
            title={favoriteAction === 'saved'
              ? 'Remove from Saved'
              : isFavorite ? 'Remove from favorites' : 'Save to favorites'}
            aria-label={favoriteAction === 'saved'
              ? `Remove ${result.name} from Saved`
              : isFavorite ? `Remove ${result.name} from favorites` : `Save ${result.name} to favorites`}
            aria-pressed={isFavorite}
          >
            <IconStar filled={isFavorite} />
          </button>
        </div>
      </div>
    </div>
  )
}
