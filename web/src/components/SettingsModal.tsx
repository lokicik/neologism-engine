import { useEffect, useRef, useState } from 'react'
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
import { exportTasteDataset } from '../lib/taste-data'
import { IconDownload } from './icons'

interface Props {
  config: JudgeConfig
  favorites: NameResult[]
  rejected: NameResult[]
  onSave: (cfg: JudgeConfig) => void
  onClose: () => void
}

const perM = (pricePerToken: number) => `$${(pricePerToken * 1e6).toFixed(2)}/M`
const priceTag = (m: ModelInfo) => (m.free ? 'FREE' : m.priceIn < 0 ? 'variable' : perM(m.priceIn))
const ctxK = (m: ModelInfo) => (m.contextLength ? `${Math.round(m.contextLength / 1000)}k ctx` : '')
const optionTag = (m: ModelInfo) => [priceTag(m), ctxK(m)].filter(Boolean).join(' · ')

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
export function SettingsModal({ config, favorites, rejected, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<JudgeConfig>(config)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const comboRef = useRef<HTMLDivElement>(null)

  // Escape closes the model dropdown first, then the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (modelOpen) setModelOpen(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, modelOpen])

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!modelOpen) return
    const onDown = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setModelOpen(false)
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
  const query = (draft.model ?? '').toLowerCase()
  const selected = pickList.find((m) => m.id === draft.model)
  // When the field holds a fully-selected id (or is empty) show the whole list
  // so the user can browse/switch; only filter while they're typing a partial.
  const filtered = (query === '' || selected ? pickList : pickList.filter((m) => m.id.toLowerCase().includes(query))).slice(0, 60)
  const comparisonCount = favorites.length * rejected.length
  const feedbackCount = favorites.length + rejected.length

  const selectModel = (m: ModelInfo) => {
    setDraft((d) => ({ ...d, model: m.id, ...priceFields(m) }))
    setModelOpen(false)
  }

  const modelField = (placeholder: string, extraLabel = '') => (
    <label className="settings-field">
      <span>Model {extraLabel}</span>
      <div className="model-combo" ref={comboRef}>
        <input
          type="text"
          placeholder={placeholder}
          value={draft.model ?? ''}
          onFocus={() => setModelOpen(true)}
          onChange={(e) => {
            const id = e.target.value
            setDraft((d) => ({ ...d, model: id, ...priceFields(pickList.find((x) => x.id === id)) }))
            setModelOpen(true)
          }}
        />
        {modelOpen && (
          <div className="model-menu">
            {modelsLoading && <div className="model-empty">Loading models…</div>}
            {!modelsLoading && filtered.length === 0 && (
              <div className="model-empty">No matches — any model id works.</div>
            )}
            {filtered.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`model-option${m.id === draft.model ? ' selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault() // keep input focus; fire before blur
                  selectModel(m)
                }}
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
    </label>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="settings-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="settings-intro">
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
              {favorites.length} liked · {rejected.length} passed · {comparisonCount} preference pairs
            </p>
            <p>Exports explicit feedback only — never your API key or recent-name history.</p>
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

        <div className="settings-actions">
          <button className="toolbar-btn" onClick={onClose}>Cancel</button>
          <button className="command-go" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
