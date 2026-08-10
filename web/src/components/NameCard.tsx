import { useState, useEffect, useRef } from 'react'
import { explainName, type Explanation, type NameResult } from '../lib/engine'
import {
  checkDomainEvidence,
  idleDomainObservations,
  manualLookupLinks,
  normalizeDomainLabel,
  type DomainObservation,
  type DomainObservationStatus,
} from '../lib/domain'
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
  const [domains, setDomains] = useState<DomainObservation[]>(() => idleDomainObservations(result.name))
  const [domainsRunning, setDomainsRunning] = useState(false)
  const [showAvail, setShowAvail] = useState(false)
  const [why, setWhy] = useState<Explanation | null>(null)
  const [showWhy, setShowWhy] = useState(false)
  const domainAbort = useRef<AbortController | null>(null)
  const domainRun = useRef(0)

  useEffect(() => {
    domainAbort.current?.abort()
    domainRun.current++
    setDomains(idleDomainObservations(result.name))
    setDomainsRunning(false)
    setShowAvail(false)
    setWhy(null)
    setShowWhy(false)
    return () => domainAbort.current?.abort()
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
    if (!next && domainsRunning) {
      domainAbort.current?.abort()
      domainRun.current++
      setDomainsRunning(false)
      setDomains((current) => current.map((observation) => (
        observation.status === 'checking'
          ? {
              ...observation,
              status: 'idle',
              checkedAt: null,
              cached: false,
              source: 'not_run',
              cooldownUntil: null,
            }
          : observation
      )))
    }
  }

  async function runDomainEvidence() {
    if (domainsRunning || !normalizeDomainLabel(result.name)) return
    domainAbort.current?.abort()
    const controller = new AbortController()
    domainAbort.current = controller
    const run = ++domainRun.current
    setDomainsRunning(true)

    const update = (observation: DomainObservation) => {
      if (domainRun.current !== run || controller.signal.aborted) return
      setDomains((current) => current.map((candidate) => (
        candidate.tld === observation.tld ? observation : candidate
      )))
    }

    try {
      const evidence = await checkDomainEvidence(result.name, {
        signal: controller.signal,
        onUpdate: update,
      })
      if (domainRun.current === run && !controller.signal.aborted) {
        setDomains(evidence.observations)
      }
    } catch {
      if (domainRun.current === run && !controller.signal.aborted) {
        setDomains((current) => current.map((observation) => (
          observation.status === 'checking'
            ? {
                ...observation,
                status: 'inconclusive',
                checkedAt: Date.now(),
                cached: false,
                source: 'network',
                cooldownUntil: null,
              }
            : observation
        )))
      }
    } finally {
      if (domainRun.current === run) setDomainsRunning(false)
    }
  }

  function domainLabel(status: DomainObservationStatus): string {
    const labels: Record<DomainObservationStatus, string> = {
      idle: 'Not run',
      checking: 'Checking…',
      record_found: 'Registration record found',
      no_record: 'No registration record found',
      dns_record: 'DNS record observed',
      nxdomain: 'NXDOMAIN observed',
      no_a_answer: 'No A answer',
      rate_limited: 'Provider rate limited',
      inconclusive: 'Inconclusive',
    }
    return labels[status]
  }

  function observationMeta(observation: DomainObservation): string {
    const method = observation.method === 'rdap' ? 'RDAP registry' : 'DNS-only'
    const source = observation.source === 'not_run'
      ? ''
      : observation.source === 'cache'
        ? 'cached'
        : observation.source === 'cooldown'
          ? 'provider cooldown'
          : observation.source
    if (observation.checkedAt === null) {
      return [observation.provider, method, source].filter(Boolean).join(' · ')
    }
    const time = new Date(observation.checkedAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const cooldown = observation.cooldownUntil === null
      ? ''
      : `retry after ${new Date(observation.cooldownUntil).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}`
    return [observation.provider, method, source, time, cooldown].filter(Boolean).join(' · ')
  }

  const manualLinks = manualLookupLinks(result.name)
  const domainSupported = normalizeDomainLabel(result.name) !== null

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
        <div className="card-expansion availability-panel">
          <div className="availability-disclosure">
            <p className="availability-intro">
              Run six point-in-time domain observations for this exact spelling. The action sends
              only each queried host to Verisign, Identity Digital, Google Registry, or Cloudflare;
              your IP and normal request metadata accompany those requests. No brief, taste data,
              Saved list, or AI key is sent.
            </p>
            <button
              className="availability-run"
              type="button"
              onClick={() => void runDomainEvidence()}
              disabled={domainsRunning || !domainSupported}
            >
              {domainsRunning ? 'Running 6 domain lookups…' : 'Run 6 domain lookups'}
            </button>
            {!domainSupported && (
              <p className="availability-unsupported" role="status">
                Unsupported domain label. Use 1–63 ASCII letters, numbers, or internal hyphens;
                no lookup was sent.
              </p>
            )}
          </div>

          <div className="availability-grid" aria-live="polite">
            {domains.map((observation) => (
              <div
                key={observation.tld}
                className="availability-domain-row"
                data-tld={observation.tld}
                data-status={observation.status}
                data-cached={observation.cached ? 'true' : 'false'}
              >
                <span className="availability-domain">{observation.tld}</span>
                <span className="availability-reading">
                  <span className="availability-result">{domainLabel(observation.status)}</span>
                  <span className="availability-meta">{observationMeta(observation)}</span>
                </span>
              </div>
            ))}
          </div>

          {(['developer', 'trademark'] as const).map((group) => (
            <div className="availability-manual" key={group}>
              <span className="avail-label">
                {group === 'developer' ? 'Developer namespaces' : 'Trademark'} · not evaluated
              </span>
              <div className="availability-manual-links">
                {manualLinks.filter((link) => link.group === group).map((link) => (
                  <a
                    key={link.service}
                    className="availability-manual-link"
                    data-service={link.service}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`Open ${link.label} manually · not evaluated`}
                  >
                    {link.label} ↗
                  </a>
                ))}
              </div>
            </div>
          ))}

          <p className="availability-disclaimer">
            Manual providers receive this displayed name only when you open their link; their own
            privacy terms then apply. They are not included in the domain observations above.
          </p>

          <p className="availability-disclaimer">
            Evidence only — not a promise of registrability, ownership, publishability, trademark
            safety, or market clearance. DNS-only observations can miss registered names.
          </p>
        </div>
      )}

      <div className="card-actions-row">
        <button className={`card-chip${showWhy ? ' active' : ''}`} onClick={toggleWhy}>
          Why <span className={`chip-chevron${showWhy ? ' open' : ''}`}>▾</span>
        </button>
        <button className={`card-chip${showAvail ? ' active' : ''}`} onClick={toggleAvailability}>
          Name checks <span className={`chip-chevron${showAvail ? ' open' : ''}`}>▾</span>
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
