import { useState, useEffect, useId, useRef, type KeyboardEvent } from 'react'
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
  onToggleFavorite: (r: NameResult, keyboard?: boolean) => void
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
  const [copyStatus, setCopyStatus] = useState('')
  const [copyError, setCopyError] = useState<string | null>(null)
  const [domains, setDomains] = useState<DomainObservation[]>(() => idleDomainObservations(result.name))
  const [domainsRunning, setDomainsRunning] = useState(false)
  const [showAvail, setShowAvail] = useState(false)
  const [why, setWhy] = useState<Explanation | null>(null)
  const [whyError, setWhyError] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const domainAbort = useRef<AbortController | null>(null)
  const domainRun = useRef(0)
  const whyRun = useRef(0)
  const copyVisualTimer = useRef<number | undefined>(undefined)
  const copyStatusTimer = useRef<number | undefined>(undefined)
  const whyPanelId = useId()
  const availabilityPanelId = useId()
  const availabilityPanel = useRef<HTMLDivElement>(null)
  const availabilityTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    domainAbort.current?.abort()
    domainRun.current++
    whyRun.current++
    setDomains(idleDomainObservations(result.name))
    setDomainsRunning(false)
    setShowAvail(false)
    if (copyVisualTimer.current !== undefined) clearTimeout(copyVisualTimer.current)
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopied(false)
    setCopyStatus('')
    setCopyError(null)
    setWhy(null)
    setWhyError(false)
    setShowWhy(false)
    return () => {
      domainAbort.current?.abort()
      if (copyVisualTimer.current !== undefined) clearTimeout(copyVisualTimer.current)
      if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    }
  }, [result.name])

  useEffect(() => {
    if (showAvail) availabilityPanel.current?.focus()
  }, [showAvail])

  async function copy() {
    if (copyVisualTimer.current !== undefined) clearTimeout(copyVisualTimer.current)
    if (copyStatusTimer.current !== undefined) clearTimeout(copyStatusTimer.current)
    setCopied(false)
    setCopyStatus('')
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(result.name)
      setCopied(true)
      setCopyStatus(`${result.name} copied to clipboard.`)
      copyVisualTimer.current = window.setTimeout(() => setCopied(false), 1500)
      copyStatusTimer.current = window.setTimeout(() => setCopyStatus(''), 3000)
    } catch {
      setCopied(false)
      setCopyStatus('')
      setCopyError(`Could not copy ${result.name}. Browser clipboard access was denied.`)
    }
  }

  function toggleWhy() {
    const next = !showWhy
    setShowWhy(next)
    if (next && !why) {
      const run = ++whyRun.current
      setWhyError(false)
      explainName(result.name)
        .then((explanation) => {
          if (whyRun.current === run) setWhy(explanation)
        })
        .catch(() => {
          if (whyRun.current === run) setWhyError(true)
        })
    }
  }

  function handleWhyKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape' || !showWhy) return
    event.preventDefault()
    event.stopPropagation()
    setShowWhy(false)
  }

  function closeAvailability(restoreFocus = false) {
    if (restoreFocus) availabilityTrigger.current?.focus()
    setShowAvail(false)
    if (domainsRunning) {
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

  function toggleAvailability() {
    if (showAvail) closeAvailability()
    else setShowAvail(true)
  }

  function handleAvailabilityKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !showAvail) return
    event.preventDefault()
    event.stopPropagation()
    closeAvailability(true)
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
        <div
          id={whyPanelId}
          className="card-expansion"
          role="region"
          aria-label={`Explanation for ${result.name}`}
          aria-live="polite"
          aria-busy={!why && !whyError}
        >
          {why ? (
            <>
              {whyParts(why).join(' · ') || 'a pure coinage — no real-word parts'}
              <span className="why-scores">
                say {why.score_pronounce} · stick {why.score_memorability} · new {why.score_novelty}
              </span>
            </>
          ) : whyError ? (
            <span>Explanation unavailable — close and reopen Why to retry.</span>
          ) : (
            <span>…</span>
          )}
        </div>
      )}

      <div className="card-actions-row">
        <button
          type="button"
          className={`card-chip${showWhy ? ' active' : ''}`}
          aria-label={`Why ${result.name} was generated`}
          aria-expanded={showWhy}
          aria-controls={whyPanelId}
          onClick={toggleWhy}
          onKeyDown={handleWhyKeyDown}
        >
          Why <span className={`chip-chevron${showWhy ? ' open' : ''}`} aria-hidden="true">▾</span>
        </button>
        <button
          ref={availabilityTrigger}
          type="button"
          className={`card-chip${showAvail ? ' active' : ''}`}
          aria-label={`Name checks for ${result.name}`}
          aria-expanded={showAvail}
          aria-controls={availabilityPanelId}
          onClick={toggleAvailability}
          onKeyDown={handleAvailabilityKeyDown}
        >
          Name checks <span className={`chip-chevron${showAvail ? ' open' : ''}`} aria-hidden="true">▾</span>
        </button>
        <div className="card-icons">
          <button
            className="icon-btn"
            onClick={() => void copy()}
            title="Copy name"
            aria-label={copied ? `${result.name} copied` : `Copy ${result.name}`}
          >
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
            onClick={(event) => onToggleFavorite(result, event.detail === 0)}
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

      {copyError && <p className="card-copy-error" role="alert">{copyError}</p>}
      <p
        className="visually-hidden card-copy-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {copyStatus}
      </p>

      {showAvail && (
        <div
          ref={availabilityPanel}
          id={availabilityPanelId}
          className="card-expansion availability-panel"
          role="region"
          aria-label={`Name checks for ${result.name}`}
          tabIndex={-1}
          onKeyDown={handleAvailabilityKeyDown}
        >
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
              aria-label={`${domainsRunning ? 'Running' : 'Run'} 6 domain lookups for ${result.name}`}
              aria-busy={domainsRunning}
              aria-disabled={domainsRunning || !domainSupported}
              onClick={() => void runDomainEvidence()}
              disabled={!domainSupported}
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

          <div className="availability-grid" aria-live="polite" aria-busy={domainsRunning}>
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
                    aria-label={`Open ${link.label} manually for ${result.name}; not evaluated`}
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
    </div>
  )
}
