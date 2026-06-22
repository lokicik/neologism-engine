import { useEffect, useState } from 'react'
import {
  DEFAULT_JUDGE_PROMPT,
  DEFAULT_LOCAL_ENDPOINT,
  OPENROUTER_FREE_MODELS,
  fetchModels,
  type JudgeConfig,
  type JudgeProvider,
  type ModelInfo,
} from '../lib/judge'

interface Props {
  config: JudgeConfig
  onSave: (cfg: JudgeConfig) => void
  onClose: () => void
}

const perM = (pricePerToken: number) => `$${(pricePerToken * 1e6).toFixed(2)}/M`
const ctxK = (m: ModelInfo) => (m.contextLength ? `${Math.round(m.contextLength / 1000)}k ctx` : '')
const optionLabel = (m: ModelInfo) => [m.free ? 'FREE' : perM(m.priceIn), ctxK(m)].filter(Boolean).join(' · ')

// Phase 50/52: configure the optional "Sharpen with AI" judge. Two transports
// (both OpenAI-compatible): OpenRouter with the user's own key, or a local
// server. The model list is fetched live (Phase 52); in-browser models are
// intentionally omitted — small models judge brand names poorly.
export function SettingsModal({ config, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<JudgeConfig>(config)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const options: { id: string; label: string }[] = models.length
    ? models.map((m) => ({ id: m.id, label: optionLabel(m) }))
    : draft.provider === 'openrouter'
      ? OPENROUTER_FREE_MODELS.map((id) => ({ id, label: 'FREE' }))
      : []
  const selected = models.find((m) => m.id === draft.model)

  const modelField = (placeholder: string, extraLabel = '') => (
    <label className="settings-field">
      <span>Model {extraLabel}</span>
      <input
        type="text"
        list="judge-models"
        placeholder={placeholder}
        value={draft.model ?? ''}
        onChange={(e) => {
          const id = e.target.value
          const m = models.find((x) => x.id === id)
          setDraft((d) => ({ ...d, model: id, priceIn: m?.priceIn, priceOut: m?.priceOut }))
        }}
      />
      <datalist id="judge-models">
        {options.map((o) => (
          <option key={o.id} value={o.id} label={o.label} />
        ))}
      </datalist>
      {modelsLoading && <span className="settings-hint">Loading models…</span>}
      {!modelsLoading && models.length === 0 && (
        <span className="settings-hint">Couldn't load the live list — type any model id.</span>
      )}
      {selected && (
        <span className="settings-hint">
          {selected.free
            ? 'Free model'
            : `${perM(selected.priceIn)} in · ${perM(selected.priceOut)} out`}
          {ctxK(selected) ? ` · ${ctxK(selected)}` : ''}
        </span>
      )}
    </label>
  )

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="AI judge settings">
        <div className="settings-head">
          <h2>Sharpen with AI</h2>
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="settings-intro">
          The offline engine ranks by shape, not taste. An optional LLM re-ranks a batch
          by real brand-quality judgment and adds a one-line reason per name. Default app
          stays fully offline — this only runs when you turn it on and use it.
        </p>

        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
          />
          <span>Enable AI re-rank</span>
        </label>

        <fieldset className="settings-group" disabled={!draft.enabled}>
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
        </fieldset>

        <p className="settings-note">
          Note: in-browser models are intentionally left out — sub-3B models that fit a
          browser judge brand names poorly. Use a hosted or local model for real taste.
        </p>

        <div className="settings-actions">
          <button className="toolbar-btn" onClick={onClose}>Cancel</button>
          <button className="command-go" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
