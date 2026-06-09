import { useState, useEffect } from 'react'
import type { NameResult } from '../lib/engine'
import { checkDomains, checkGithub, TLDS, type DomainStatus } from '../lib/domain'
import { Monogram } from './Monogram'

interface Props {
  result: NameResult
  isFavorite: boolean
  onToggleFavorite: (r: NameResult) => void
  badges?: string[]
}

const STYLE_LABEL: Record<string, string> = {
  big_tech: 'Big Tech',
  sci_fi: 'Sci-Fi',
  fantasy: 'Fantasy',
}

function idleMap(): Record<string, DomainStatus> {
  const m: Record<string, DomainStatus> = {}
  for (const tld of TLDS) m[tld] = 'idle'
  m['gh'] = 'idle'
  return m
}

export function NameCard({ result, isFavorite, onToggleFavorite, badges = [] }: Props) {
  const [copied, setCopied] = useState(false)
  const [domains, setDomains] = useState<Record<string, DomainStatus>>(idleMap)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    setDomains(idleMap())
    setChecking(false)
  }, [result.name])

  function copy() {
    navigator.clipboard.writeText(result.name).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function checkAvailability() {
    setChecking(true)
    const checking: Record<string, DomainStatus> = {}
    for (const tld of TLDS) checking[tld] = 'checking'
    checking['gh'] = 'checking'
    setDomains(checking)

    await Promise.all([
      checkDomains(result.name, (tld, status) => {
        setDomains((prev) => ({ ...prev, [tld]: status }))
      }),
      checkGithub(result.name).then((status) => {
        setDomains((prev) => ({ ...prev, gh: status }))
      }),
    ])
    setChecking(false)
  }

  function domainBadgeClass(status: DomainStatus): string {
    if (status === 'available') return 'badge badge-available'
    if (status === 'taken') return 'badge badge-taken'
    if (status === 'checking') return 'badge badge-checking'
    return 'badge badge-idle'
  }

  function domainLabel(key: string, status: DomainStatus): string {
    const label = key === 'gh' ? 'gh' : key
    if (status === 'idle') return label
    if (status === 'checking') return `${label} …`
    if (status === 'available') return `${label} ✓`
    if (status === 'taken') return `${label} ✗`
    return `${label} ?`
  }

  const allIdle = Object.values(domains).every((s) => s === 'idle')

  return (
    <div className={`name-card${isFavorite ? ' favorited' : ''}`}>
      {badges.length > 0 && (
        <div className="card-badges">
          {badges.map((b) => (
            <span key={b} className="badge-pill">{b}</span>
          ))}
        </div>
      )}
      <div className="card-header">
        <Monogram name={result.name} size={38} />
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

      {result.connotations.length > 0 && (
        <div className="connotations" title="The vibe this name evokes (sound symbolism)">
          <span className="conn-label">feels</span>
          {result.connotations.map((c) => (
            <span key={c} className="conn-tag">{c}</span>
          ))}
        </div>
      )}

      <div className="domain-row">
        {Object.entries(domains).map(([key, status]) => (
          <span key={key} className={domainBadgeClass(status)}>
            {domainLabel(key, status)}
          </span>
        ))}
        {!checking && allIdle && (
          <button className="check-domain-btn" onClick={checkAvailability}>
            Check availability*
          </button>
        )}
        {!allIdle && (
          <span className="domain-disclaimer">*indicator only</span>
        )}
      </div>
    </div>
  )
}
