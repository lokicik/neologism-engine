import { useEffect, useRef, useState } from 'react'

interface Props {
  mode: 'score' | 'ai'
  judgeEnabled: boolean
  sharpening: boolean
  tokens: number
  cost: number | null
  notice: string | null
  newCount: number
  onScore: () => void
  onAi: () => void
  onRerank: () => void
  onOpenSettings: () => void
}

function costLabel(cost: number | null): string {
  if (cost === null) return '$?'
  if (cost === 0) return '$0 (free)'
  return `≈ $${cost.toFixed(4)}`
}

// Phase 54: the batch-ordering control. Reframes the old "Sharpen with AI"
// button as a reversible sort (Score ⇄ ✨ AI taste) with an explainer, living
// in the sticky results toolbar so it's reachable at any scroll depth.
export function SortControl({
  mode, judgeEnabled, sharpening, tokens, cost, notice, newCount,
  onScore, onAi, onRerank, onOpenSettings,
}: Props) {
  const [info, setInfo] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!info) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setInfo(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfo(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [info])

  // Judge not configured yet: a quiet entry point rather than a hidden feature.
  if (!judgeEnabled) {
    return (
      <button className="sort-setup" onClick={onOpenSettings} title="Set up AI re-rank in Settings">
        ✨ AI sort · set up
      </button>
    )
  }

  return (
    <div className="sort-control" ref={ref}>
      <span className="sort-label">Sort</span>
      <div className="sort-segs" role="group" aria-label="Result order">
        <button
          className={`sort-seg${mode === 'score' ? ' selected' : ''}`}
          onClick={onScore}
          aria-pressed={mode === 'score'}
        >
          Score
        </button>
        <button
          className={`sort-seg${mode === 'ai' ? ' selected' : ''}`}
          onClick={onAi}
          disabled={sharpening}
          aria-pressed={mode === 'ai'}
        >
          {sharpening ? 'Ranking…' : '✨ AI taste'}
        </button>
      </div>

      {mode === 'ai' && newCount > 0 && !sharpening && (
        <button className="sort-rerank" onClick={onRerank} title="Re-rank including newly loaded names">
          ↻ {newCount} new
        </button>
      )}

      <button
        className="sort-info"
        onClick={() => setInfo((v) => !v)}
        title="How does the AI sort work?"
        aria-label="How does the AI sort work?"
        aria-expanded={info}
      >
        ⓘ
      </button>

      {info && (
        <div className="sort-popover" role="dialog" aria-label="About AI sort">
          <p>Two ways to order this batch:</p>
          <p>
            <strong>Score</strong> — the engine's blend of pronounceability, memorability and novelty.
          </p>
          <p>
            <strong>✨ AI taste</strong> — your configured model judges brand quality and writes a
            one-line reason per name. One request with your key,{' '}
            <span className="sort-est">≈ {tokens.toLocaleString()} tok · {costLabel(cost)}</span>.
            Flip back to Score anytime.
          </p>
          <button className="sort-popover-link" onClick={onOpenSettings}>
            Change model in Settings →
          </button>
        </div>
      )}

      {notice && <span className="sort-notice">{notice}</span>}
    </div>
  )
}
