import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  DEFAULT_JUDGE_PROMPT,
  DEFAULT_LOCAL_ENDPOINT,
  OPENROUTER_FREE_MODELS,
  fetchModels,
  type JudgeConfig,
  type JudgeProvider,
  type ModelInfo,
} from '../lib/judge'
import type { NameResult } from '../lib/engine'
import {
  buildTasteDataset,
  exportTasteDataset,
  tasteEvidenceProgress,
} from '../lib/taste-data'
import { tasteIdentity } from '../lib/taste-identity'
import { IconDownload } from './icons'

interface Props {
  config: JudgeConfig
  favorites: NameResult[]
  rejected: NameResult[]
  onSave: (cfg: JudgeConfig) => void
  onUndoRejected: (item: NameResult) => number | null
  onClose: () => void
}

const perM = (pricePerToken: number) => `$${(pricePerToken * 1e6).toFixed(2)}/M`
const priceTag = (m: ModelInfo) => (m.free ? 'FREE' : m.priceIn < 0 ? 'variable' : perM(m.priceIn))
const ctxK = (m: ModelInfo) => (m.contextLength ? `${Math.round(m.contextLength / 1000)}k ctx` : '')
const optionTag = (m: ModelInfo) => [priceTag(m), ctxK(m)].filter(Boolean).join(' · ')
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const STYLE_LABEL: Record<NameResult['style'], string> = {
  big_tech: 'Big Tech',
  sci_fi: 'Sci-Fi',
  fantasy: 'Fantasy',
}

function passContextLabel(item: NameResult): string {
  if (!item.tasteContext) return 'Historical unscoped feedback'
  const parts = [STYLE_LABEL[item.style]]
  if (item.tasteContext.description?.trim()) {
    parts.push(`“${item.tasteContext.description.trim()}”`)
  }
  if (item.tasteContext.roots.length > 0) {
    parts.push(`roots: ${item.tasteContext.roots.join(', ')}`)
  }
  if (parts.length === 1) parts.push('no project brief')
  return parts.join(' · ')
}

function sourceModeLabel(item: NameResult): string {
  const labels: Record<string, string> = {
    brandable: 'Brandable',
    realword: 'Real word',
    respell: 'Respell',
    compound: 'Compound',
  }
  return labels[item.sourceMode ?? ''] ?? 'Unknown source'
}

// Capture the picked model's per-token prices into the config (undefined when
// unknown or variable, so the estimate shows "$?" rather than a bogus number).
const priceFields = (m?: ModelInfo) => ({
  priceIn: m?.free ? 0 : m && m.priceIn >= 0 ? m.priceIn : undefined,
  priceOut: m?.free ? 0 : m && m.priceOut >= 0 ? m.priceOut : undefined,
})

// Phase 50/52/53: configure the optional "Sharpen with AI" judge. Two transports
// (both OpenAI-compatible): OpenRouter with the user's own key, or a local
// server. The model list is fetched live and shown in a themed combobox (Phase
// 53 — the native <datalist> couldn't be styled and scrolled badly).
export function SettingsModal({ config, favorites, rejected, onSave, onUndoRejected, onClose }: Props) {
  const [draft, setDraft] = useState<JudgeConfig>(config)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [activeModelIndex, setActiveModelIndex] = useState(-1)
  const [passedOpen, setPassedOpen] = useState(false)
  const [passUndoError, setPassUndoError] = useState<string | null>(null)
  const [passUndoStatus, setPassUndoStatus] = useState<string | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const comboRef = useRef<HTMLDivElement>(null)
  const modelInputRef = useRef<HTMLInputElement>(null)
  const settingsTitleId = useId()
  const settingsIntroId = useId()
  const modelLabelId = useId()
  const modelListId = useId()
  const passedListId = useId()
  const passedToggleRef = useRef<HTMLButtonElement>(null)
  const passedBodyRef = useRef<HTMLDivElement>(null)

  // A real modal owns keyboard focus for its whole lifetime and returns it to
  // the exact control that opened Settings on every close path.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!modelOpen) return
    const onDown = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setModelOpen(false)
        setActiveModelIndex(-1)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [modelOpen])

  // Live model list — debounced so typing a localhost endpoint doesn't spam.
  useEffect(() => {
    if (!draft.enabled) return
    let cancelled = false
    setModelsLoading(true)
    const t = setTimeout(() => {
      void fetchModels(draft).then((list) => {
        if (cancelled) return
        setModels(list)
        setModelsLoading(false)
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.provider, draft.endpoint, draft.enabled])

  const set = <K extends keyof JudgeConfig>(key: K, value: JudgeConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = () => {
    onSave(draft)
    onClose()
  }

  const pickList: ModelInfo[] = models.length
    ? models
    : draft.provider === 'openrouter'
      ? OPENROUTER_FREE_MODELS.map((id) => ({ id, priceIn: 0, priceOut: 0, free: true }))
      : []
  const modelOptions = (needle: string, exactModel?: ModelInfo) => {
    const matches = needle === '' || exactModel
      ? pickList
      : pickList.filter((model) => model.id.toLowerCase().includes(needle))
    const visible = matches.slice(0, 60)
    if (exactModel && !visible.some((model) => model.id === exactModel.id)) {
      if (visible.length === 60) visible[visible.length - 1] = exactModel
      else visible.push(exactModel)
    }
    return visible
  }
  const query = (draft.model ?? '').toLowerCase()
  const selected = pickList.find((m) => m.id === draft.model)
  // When the field holds a fully-selected id (or is empty) show the whole list
  // so the user can browse/switch; only filter while they're typing a partial.
  // Keep an exact selection visible even when it falls beyond the 60-row cap.
  const filtered = modelOptions(query, selected)
  const tasteSummary = useMemo(
    () => buildTasteDataset(favorites, rejected).summary,
    [favorites, rejected],
  )
  const evidenceProgress = useMemo(
    () => tasteEvidenceProgress(favorites, rejected),
    [favorites, rejected],
  )
  const feedbackCount = favorites.length + rejected.length

  useEffect(() => {
    if (!modelOpen) return
    setActiveModelIndex((current) => {
      if (filtered.length === 0) return -1
      if (current < 0) return 0
      return Math.min(current, filtered.length - 1)
    })
  }, [modelOpen, filtered.length])

  useEffect(() => {
    if (!modelOpen || activeModelIndex < 0) return
    document.getElementById(`${modelListId}-option-${activeModelIndex}`)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeModelIndex, modelListId, modelOpen])

  const selectModel = (m: ModelInfo) => {
    setDraft((d) => ({ ...d, model: m.id, ...priceFields(m) }))
    setModelOpen(false)
    setActiveModelIndex(-1)
  }

  const closeModelMenu = () => {
    setModelOpen(false)
    setActiveModelIndex(-1)
  }

  const openModelMenu = () => {
    setModelOpen(true)
    const selectedIndex = filtered.findIndex((model) => model.id === draft.model)
    setActiveModelIndex(selectedIndex >= 0 ? selectedIndex : filtered.length > 0 ? 0 : -1)
  }

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (modelOpen) {
        closeModelMenu()
        modelInputRef.current?.focus()
      } else {
        onClose()
      }
      return
    }
    if (event.key !== 'Tab') return

    const modal = modalRef.current
    if (!modal) return
    const focusable = [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => (
      element.tabIndex >= 0
        && element.getAttribute('aria-hidden') !== 'true'
        && getComputedStyle(element).visibility !== 'hidden'
    ))
    if (focusable.length === 0) {
      event.preventDefault()
      modal.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === modal || !modal.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || active === modal || !modal.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  const undoPass = (item: NameResult) => {
    const remaining = onUndoRejected(item)
    if (remaining === null) {
      setPassUndoStatus(null)
      setPassUndoError(`Could not undo the pass on ${item.name}. Browser storage kept it unchanged.`)
      return
    }
    setPassUndoError(null)
    setPassUndoStatus(`Pass on ${item.name} undone. ${remaining} passed ${remaining === 1 ? 'name' : 'names'} remain.`)
    requestAnimationFrame(() => {
      const nextUndo = passedBodyRef.current?.querySelector<HTMLButtonElement>('.settings-passed-undo')
      const focusTarget = nextUndo ?? passedToggleRef.current
      focusTarget?.focus()
    })
  }

  const modelField = (placeholder: string, extraLabel = '') => (
    <div className="settings-field">
      <span id={modelLabelId}>Model {extraLabel}</span>
      <div
        className="model-combo"
        ref={comboRef}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeModelMenu()
        }}
      >
        <input
          ref={modelInputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-labelledby={modelLabelId}
          aria-expanded={modelOpen}
          aria-controls={modelListId}
          aria-activedescendant={modelOpen && activeModelIndex >= 0
            ? `${modelListId}-option-${activeModelIndex}`
            : undefined}
          placeholder={placeholder}
          value={draft.model ?? ''}
          onFocus={openModelMenu}
          onClick={() => {
            if (!modelOpen) openModelMenu()
          }}
          onChange={(e) => {
            const id = e.target.value
            const exactModel = pickList.find((model) => model.id === id)
            const nextFiltered = modelOptions(id.toLowerCase(), exactModel)
            setDraft((d) => ({ ...d, model: id, ...priceFields(exactModel) }))
            setModelOpen(true)
            setActiveModelIndex(exactModel
              ? nextFiltered.findIndex((model) => model.id === exactModel.id)
              : nextFiltered.length > 0 ? 0 : -1)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && modelOpen) {
              event.preventDefault()
              event.stopPropagation()
              closeModelMenu()
              return
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setModelOpen(true)
              setActiveModelIndex((current) => {
                if (filtered.length === 0) return -1
                if (event.key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % filtered.length
                return current < 0 ? filtered.length - 1 : (current - 1 + filtered.length) % filtered.length
              })
              return
            }
            if (event.key === 'Enter' && modelOpen && activeModelIndex >= 0) {
              const activeModel = filtered[activeModelIndex]
              if (activeModel) {
                event.preventDefault()
                selectModel(activeModel)
              }
            }
          }}
        />
        {modelOpen && (
          <div className="model-menu" id={modelListId} role="listbox" aria-label="Available models">
            {modelsLoading && <div className="model-empty" role="status">Loading models…</div>}
            {!modelsLoading && filtered.length === 0 && (
              <div className="model-empty" role="status">No matches — any model id works.</div>
            )}
            {filtered.map((m, index) => (
              <button
                type="button"
                key={m.id}
                id={`${modelListId}-option-${index}`}
                role="option"
                aria-selected={m.id === draft.model}
                tabIndex={-1}
                className={`model-option${m.id === draft.model ? ' selected' : ''}${index === activeModelIndex ? ' active' : ''}`}
                onMouseEnter={() => setActiveModelIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault() // keep input focus; fire before blur
                }}
                onClick={() => selectModel(m)}
              >
                <span className="model-id">{m.id}</span>
                <span className="model-tag">{optionTag(m)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <span className="settings-hint">
          {selected.free
            ? 'Free model'
            : selected.priceIn < 0
              ? 'Variable pricing'
              : `${perM(selected.priceIn)} in · ${perM(selected.priceOut)} out`}
          {ctxK(selected) ? ` · ${ctxK(selected)}` : ''}
        </span>
      )}
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={settingsTitleId}
        aria-describedby={settingsIntroId}
        tabIndex={-1}
      >
        <div className="settings-head">
          <h2 id={settingsTitleId}>Settings</h2>
          <button ref={closeRef} className="icon-btn" onClick={onClose} title="Close" aria-label="Close settings">✕</button>
        </div>
        <p className="settings-intro" id={settingsIntroId}>
          Configure the model the AI Studio uses to rank your names — OpenRouter (your key)
          or a local server. The app stays fully offline by default; AI only runs in the AI
          Studio, on demand.
        </p>

        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <span>Enable AI re-rank</span>
        </label>

        {draft.enabled && <fieldset className="settings-group">
          <legend>Provider</legend>
          <div className="settings-radios">
            {(['openrouter', 'localhost'] as JudgeProvider[]).map((p) => (
              <label key={p} className={`settings-radio${draft.provider === p ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="provider"
                  checked={draft.provider === p}
                  onChange={() => setDraft((d) => ({ ...d, provider: p, model: undefined, priceIn: undefined, priceOut: undefined }))}
                />
                {p === 'openrouter' ? 'OpenRouter (your key)' : 'Localhost (Ollama / llama.cpp)'}
              </label>
            ))}
          </div>

          {draft.provider === 'openrouter' ? (
            <>
              <label className="settings-field">
                <span>API key</span>
                <input
                  type="password"
                  placeholder="sk-or-..."
                  value={draft.apiKey ?? ''}
                  onChange={(e) => set('apiKey', e.target.value)}
                  autoComplete="off"
                />
              </label>
              {modelField(OPENROUTER_FREE_MODELS[0])}
              <p className="settings-hint">
                Free <code>:free</code> models work well here. Get a key at{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
                Your key is stored in this browser only and sent straight to OpenRouter.
              </p>
            </>
          ) : (
            <>
              <label className="settings-field">
                <span>Endpoint</span>
                <input
                  type="text"
                  placeholder={DEFAULT_LOCAL_ENDPOINT}
                  value={draft.endpoint ?? ''}
                  onChange={(e) => set('endpoint', e.target.value)}
                />
              </label>
              {modelField('auto', '(blank = auto-detect)')}
              <p className="settings-hint">
                Ollama: <code>http://localhost:11434/v1</code> · llama.cpp: <code>http://127.0.0.1:8080/v1</code>.
                The browser needs CORS allowed — for Ollama run it with{' '}
                <code>OLLAMA_ORIGINS=*</code>.
              </p>
            </>
          )}

          <label className="settings-field">
            <span>Judge prompt <code>{'{{names}}'}</code> is the candidate list</span>
            <textarea
              rows={6}
              value={draft.prompt ?? ''}
              onChange={(e) => set('prompt', e.target.value)}
            />
            <button
              type="button"
              className="settings-reset"
              onClick={() => set('prompt', DEFAULT_JUDGE_PROMPT)}
            >
              Reset to default
            </button>
          </label>
        </fieldset>}

        {draft.enabled && (
          <p className="settings-note">
            Note: in-browser models are intentionally left out — sub-3B models that fit a
            browser judge brand names poorly. Use a hosted or local model for real taste.
          </p>
        )}

        <section className="settings-data" aria-labelledby="taste-data-title">
          <div className="settings-data-copy">
            <h3 id="taste-data-title">Local taste data</h3>
            <p className="settings-data-meta">
              {favorites.length} liked · {rejected.length} passed · {tasteSummary.comparisons} derived pairs
            </p>
            <p
              className="settings-data-evidence"
              title="Counts only labels that share a project with at least one opposite label. This is a minimum descriptive sample, not a blind study."
            >
              Evidence · {evidenceProgress.matchedLiked}/10 matched likes · {evidenceProgress.matchedPassed}/10 matched passes · {evidenceProgress.matchedContexts} project {evidenceProgress.matchedContexts === 1 ? 'context' : 'contexts'}
            </p>
            <p>Keep rating both sides for the same project. Export includes each brief — never your API key or recent-name history.</p>
          </div>
          <button
            type="button"
            className="toolbar-btn taste-export-btn"
            disabled={feedbackCount === 0}
            onClick={() => exportTasteDataset(favorites, rejected)}
          >
            <IconDownload /> Export JSON
          </button>
        </section>

        <section className="settings-passed" aria-labelledby={`${passedListId}-title`}>
          <button
            ref={passedToggleRef}
            id={`${passedListId}-title`}
            type="button"
            className="settings-passed-toggle"
            aria-expanded={passedOpen}
            aria-controls={passedListId}
            disabled={rejected.length === 0 && !passedOpen}
            onClick={() => {
              const nextOpen = !passedOpen
              if (!nextOpen && rejected.length === 0) {
                cancelRef.current?.focus({ preventScroll: true })
              }
              setPassedOpen(nextOpen)
              setPassUndoError(null)
              setPassUndoStatus(null)
            }}
          >
            <span>Review passed names</span>
            <span className="settings-passed-meta" aria-hidden="true">
              <span className="settings-passed-count">{rejected.length}</span>
              <span className={`settings-passed-chevron${passedOpen ? ' open' : ''}`}>▾</span>
            </span>
          </button>

          {passedOpen && (
            <div ref={passedBodyRef} id={passedListId} className="settings-passed-body">
              <p className="settings-passed-help">
                Undo makes only that pass entry neutral. It never likes or saves the name.
              </p>
              {passUndoError && <p className="settings-passed-error" role="alert">{passUndoError}</p>}
              {passUndoStatus && <p className="settings-passed-status" role="status">{passUndoStatus}</p>}
              {rejected.length === 0 ? (
                <p className="settings-passed-empty">No passed names remain.</p>
              ) : (
                <ul className="settings-passed-list">
                  {[...rejected].reverse().map((item) => {
                    const context = passContextLabel(item)
                    return (
                      <li className="settings-passed-row" key={tasteIdentity(item)}>
                        <div className="settings-passed-copy">
                          <strong>{item.name}</strong>
                          <span title={context}>{context}</span>
                          <small>{sourceModeLabel(item)}</small>
                        </div>
                        <button
                          type="button"
                          className="settings-passed-undo"
                          onClick={() => undoPass(item)}
                          aria-label={`Undo pass on ${item.name} for ${context}`}
                        >
                          Undo pass
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        <div className="settings-actions">
          <button ref={cancelRef} className="toolbar-btn" onClick={onClose}>Cancel</button>
          <button className="command-go" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
