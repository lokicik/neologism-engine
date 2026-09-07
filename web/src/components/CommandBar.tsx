import { useEffect, useId, useRef, useState } from 'react'
import type { Config } from '../lib/engine'

interface Props {
  config: Config; onChange: (config: Config) => void; onGenerate: () => void
  loading: boolean; buttonLabel?: string; exhausted?: boolean
  tasteReferences: string; tasteReferenceError: string | null
  onTasteReferencesChange: (value: string) => boolean
}

const lengths = [ ['Any length', 4, 12], ['Short', 4, 6], ['Medium', 5, 9], ['Long', 8, 14] ] as const
const creativity = [ ['Safe', .6, .15], ['Balanced', .85, .3], ['Wild', 1.2, .6] ] as const

function ListInput({ values, placeholder, onChange }: { values: string[]; placeholder: string; onChange: (values: string[]) => void }) {
  const [text, setText] = useState(values.join(', '))
  const parse = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean)
  const identity = JSON.stringify(values)
  useEffect(() => { if (JSON.stringify(parse(text)) !== identity) setText(values.join(', ')) }, [identity, text, values])
  return <input value={text} placeholder={placeholder} onChange={event => { setText(event.target.value); onChange(parse(event.target.value)) }} />
}

export function CommandBar({ config, onChange, onGenerate, loading, buttonLabel = 'Generate', exhausted = false, tasteReferences, tasteReferenceError, onTasteReferencesChange }: Props) {
  const id = useId()
  const options = useRef<HTMLDetailsElement>(null)
  const set = <K extends keyof Config>(key: K, value: Config[K]) => onChange({ ...config, [key]: value })
  const length = lengths.findIndex(([, min, max]) => min === config.min_len && max === config.max_len)
  const creative = creativity.findIndex(([, temperature]) => temperature === config.temperature)
  const catalog = config.variant === 'product_names'
  return <form className="command-area" onSubmit={event => { event.preventDefault(); if (!loading && !exhausted) onGenerate() }}>
    <div className="command-bar">
      <label className="visually-hidden" htmlFor={id}>Project brief</label>
      <input id={id} className="command-input" type="text" maxLength={1000} placeholder="What are you building? (optional)" value={config.description ?? ''} onChange={event => set('description', event.target.value)} />
      <button type="submit" className="command-go" disabled={loading || exhausted} aria-busy={loading}>{loading ? 'Finding names…' : buttonLabel}</button>
    </div>
    <details className="generation-options" ref={options} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); options.current!.open = false; options.current?.querySelector('summary')?.focus() }
    }}>
      <summary>Options<span className="options-value">{lengths[length]?.[0] ?? 'Custom length'} · {catalog ? 'Product names' : creativity[creative]?.[0] ?? 'Custom creativity'}</span></summary>
      <div className="options-fields">
        <label>Length<select value={length < 0 ? 'custom' : length} onChange={event => { const value = lengths[Number(event.target.value)]; onChange({ ...config, min_len: value[1], max_len: value[2] }) }}>{length < 0 && <option value="custom">Custom length</option>}{lengths.map(([label], index) => <option key={label} value={index}>{label}</option>)}</select></label>
        {!catalog && <label>Creativity<select value={creative < 0 ? 'custom' : creative} onChange={event => { const value = creativity[Number(event.target.value)]; onChange({ ...config, temperature: value[1], variety: value[2] }) }}>{creative < 0 && <option value="custom">Custom creativity</option>}{creativity.map(([label], index) => <option key={label} value={index}>{label}</option>)}</select></label>}
        <label>Starts with<input maxLength={3} value={config.starts_with ?? ''} placeholder="e.g. z" onChange={event => set('starts_with', event.target.value || undefined)} /></label>
        <label>Contains<input maxLength={6} value={config.contains ?? ''} placeholder="e.g. ex" onChange={event => set('contains', event.target.value || undefined)} /></label>
        <label>Exclude names<ListInput values={config.exclude ?? []} placeholder="Separate names with commas" onChange={values => set('exclude', values)} /></label>
        {config.variant === undefined && !config.compound && <label>Seed words<ListInput values={config.roots ?? []} placeholder="e.g. sync, orbit" onChange={values => set('roots', values)} /></label>}
        {!catalog && <label className="reference-field">Reference names<input className="taste-reference-input" maxLength={240} value={tasteReferences} placeholder="Names you like, e.g. Linear, Notion" onChange={event => onTasteReferencesChange(event.target.value)} /><small>Optional examples for local ranking.</small>{tasteReferenceError && <small role="alert">{tasteReferenceError}</small>}</label>}
      </div>
    </details>
  </form>
}
