import { useEffect, useRef, useState } from 'react'
import type { NameResult } from '../lib/engine'
import { IconCheck, IconCopy, IconStar } from './icons'

export function nameHint(result: NameResult): string | null {
  return result.reasonChain?.trim() || null
}

interface Props {
  result: NameResult; saved: boolean; onSave: (result: NameResult) => void
  onDetails: (result: NameResult) => void; remove?: boolean
}

export function DiscoveryCard({ result, saved, onSave, onDetails, remove = false }: Props) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false; clearTimeout(timer.current) } }, [])
  async function copy() {
    setError(null)
    try {
      await navigator.clipboard.writeText(result.name)
      if (!live.current) return
      setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800)
    } catch { if (live.current) setError('Could not copy. You can select and copy the name directly.') }
  }
  return <article className={`discovery-card${saved ? ' is-saved' : ''}`}>
    <h2 className="discovery-name">{result.name}</h2>
    <p className="discovery-hint">{nameHint(result)}</p>
    <div className="discovery-actions">
      <button className="save-name" aria-pressed={saved} aria-label={remove ? `Remove ${result.name} from Saved` : `${saved ? 'Unsave' : 'Save'} ${result.name}`} onClick={() => onSave(result)}><IconStar filled={saved} />{remove ? 'Remove' : saved ? 'Saved' : 'Save'}</button>
      <button onClick={() => void copy()} aria-label={`Copy ${result.name}`}>{copied ? <IconCheck /> : <IconCopy />}{copied ? 'Copied' : 'Copy'}</button>
      <button className="name-details-trigger" aria-haspopup="dialog" onClick={() => onDetails(result)} aria-label={`Details for ${result.name}`}>Details</button>
    </div>
    <span className="visually-hidden" role="status">{copied ? `${result.name} copied.` : ''}</span>
    {error && <p className="card-copy-error" role="alert">{error}</p>}
  </article>
}
