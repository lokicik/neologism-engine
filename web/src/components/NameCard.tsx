import { useState, useEffect } from 'react'
import { explainName, type Explanation, type NameResult } from '../lib/engine'
import { checkDomains, checkHandles, isAuthoritative, trademarkLinks, HANDLES, TLDS, type DomainStatus } from '../lib/domain'
import { Monogram } from './Monogram'

interface Props {
  result: NameResult
  isFavorite: boolean
  onToggleFavorite: (r: NameResult) => void
  /// Highest composite in the batch — gets the crown.
  isBest?: boolean
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

// Tiny stroke-based inline icons — the unicode glyphs (⎘, ☆) render
// inconsistently across platforms; these don't.
function IconCopy() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z" />
    </svg>
  )
}

// Single overall score — same formula as the engine's composite_score
// (0.40·pronounce + 0.30·memorability + 0.30·novelty).
function composite(r: NameResult): number {
  return Math.round(
    0.4 * r.score_pronounce + 0.3 * r.score_memorability + 0.3 * r.score_novelty,
  )
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

export function NameCard({ result, isFavorite, onToggleFavorite, isBest = false }: Props) {
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

  const metaParts: string[] = [
    `${result.syllables} syllable${result.syllables === 1 ? '' : 's'}`,
  ]
  if (result.connotations.length > 0) {
    metaParts.push(result.connotations.slice(0, 3).join(', '))
  }
  if (STYLE_LABEL[result.style]) metaParts.unshift(STYLE_LABEL[result.style])

  return (
    <div className={`name-card${isFavorite ? ' favorited' : ''}`}>
      <div className="card-top">
        <Monogram name={result.name} size={32} />
        <span className="name-text">{result.name}</span>
        <span className="card-score" title="Overall score — pronounceability, memorability and originality blended">
          {isBest && <span className="card-crown" title="Top pick of this batch">👑</span>}
          ★ {composite(result)}
        </span>
      </div>

      <p className="card-meta-line" title="Syllables · the vibe this name evokes (sound symbolism)">
        {metaParts.join(' · ')}
      </p>

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
          </div>
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
            {trademarkLinks(result.name).map((l) => (
              <a key={l.label} className="badge badge-idle tm-link" href={l.url} target="_blank" rel="noreferrer" title="Open trademark search (manual check)">
                ™ {l.label}
              </a>
            ))}
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
            {copied ? <IconCheck /> : <IconCopy />}
          </button>
          <button
            className={`icon-btn star-btn${isFavorite ? ' starred' : ''}`}
            onClick={() => onToggleFavorite(result)}
            title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            <IconStar filled={isFavorite} />
          </button>
        </div>
      </div>
    </div>
  )
}
