import { useState, useEffect } from 'react'
import type { NameResult } from '../lib/engine'
import { checkDomains, type DomainStatus } from '../lib/domain'

interface Props {
  result: NameResult
  isFavorite: boolean
  onToggleFavorite: (r: NameResult) => void
}

const STYLE_LABEL: Record<string, string> = {
  big_tech: 'Big Tech',
  sci_fi: 'Sci-Fi',
  fantasy: 'Fantasy',
}

export function NameCard({ result, isFavorite, onToggleFavorite }: Props) {
  const [copied, setCopied] = useState(false)
  const [domains, setDomains] = useState<Record<string, DomainStatus>>({
    '.com': 'idle',
    '.io': 'idle',
  })
  const [checking, setChecking] = useState(false)

  // Reset domain state when name changes
  useEffect(() => {
    setDomains({ '.com': 'idle', '.io': 'idle' })
    setChecking(false)
  }, [result.name])

  function copy() {
    navigator.clipboard.writeText(result.name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function checkDomain() {
    setChecking(true)
    setDomains({ '.com': 'checking', '.io': 'checking' })
    await checkDomains(result.name, (tld, status) => {
      setDomains((prev) => ({ ...prev, [tld]: status }))
    })
    setChecking(false)
  }

  function domainBadgeClass(status: DomainStatus): string {
    if (status === 'available') return 'badge badge-available'
    if (status === 'taken') return 'badge badge-taken'
    if (status === 'checking') return 'badge badge-checking'
    return 'badge badge-idle'
  }

  function domainLabel(tld: string, status: DomainStatus): string {
    if (status === 'idle') return tld
    if (status === 'checking') return `${tld} …`
    if (status === 'available') return `${tld} ✓`
    if (status === 'taken') return `${tld} ✗`
    return `${tld} ?`
  }

  return (
    <div className={`name-card${isFavorite ? ' favorited' : ''}`}>
      <div className="card-header">
        <span className="name-text">{result.name}</span>
        <div className="card-actions">
          <button className="icon-btn" onClick={copy} title="Copy name">
            {copied ? '✓' : '⎘'}
          </button>
          <button
            className={`icon-btn star-btn${isFavorite ? ' starred' : ''}`}
            onClick={() => onToggleFavorite(result)}
            title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div className="card-meta">
        <span className="style-tag">{STYLE_LABEL[result.style]}</span>
        <span className="syl-tag">{result.syllables} syl.</span>
      </div>

      <div className="scores">
        <div className="score-row">
          <span className="score-label">Pronounce</span>
          <div className="score-bar">
            <div className="score-fill" style={{ width: `${result.score_pronounce}%`, background: '#6ee7b7' }} />
          </div>
          <span className="score-value">{result.score_pronounce}</span>
        </div>
        <div className="score-row">
          <span className="score-label">Novelty</span>
          <div className="score-bar">
            <div className="score-fill" style={{ width: `${result.score_novelty}%`, background: '#a5b4fc' }} />
          </div>
          <span className="score-value">{result.score_novelty}</span>
        </div>
        <div className="score-row">
          <span className="score-label">Memorable</span>
          <div className="score-bar">
            <div className="score-fill" style={{ width: `${result.score_memorability}%`, background: '#fbbf24' }} />
          </div>
          <span className="score-value">{result.score_memorability}</span>
        </div>
      </div>

      <div className="domain-row">
        {Object.entries(domains).map(([tld, status]) => (
          <span key={tld} className={domainBadgeClass(status)}>
            {domainLabel(tld, status)}
          </span>
        ))}
        {!checking && domains['.com'] === 'idle' && (
          <button className="check-domain-btn" onClick={checkDomain}>
            Check domains*
          </button>
        )}
        {(domains['.com'] !== 'idle') && (
          <span className="domain-disclaimer">*indicator only</span>
        )}
      </div>
    </div>
  )
}
