import { useEffect, useRef, useState } from 'react'
import { generateNames } from '../lib/engine'

interface Props {
  onEnter: () => void
}

const TICK_MS = 2500
const TICK_MS_REDUCED = 5000 // slower cycle when the user prefers reduced motion
const TICK_COUNT = 5

const FEATURES: { icon: string; title: string; body: string }[] = [
  {
    icon: '✦',
    title: 'Four naming styles',
    body: 'Brandable coinages, evocative real words, Lyft-style respellings, and two-word compounds.',
  },
  {
    icon: '✓',
    title: 'Availability built in',
    body: 'Registry-level domain checks, GitHub / npm / PyPI / crates.io handles, and one-click trademark search.',
  },
  {
    icon: '⚡',
    title: 'Instant & 100% private',
    body: 'A Rust engine compiled to WebAssembly. No server, no account, no tracking — works offline.',
  },
  {
    icon: '∞',
    title: 'Never repeats itself',
    body: 'Session-scale exclusion: 100,000 generations, zero repeats, measured.',
  },
]

const STEPS: { n: string; text: string }[] = [
  { n: '1', text: 'Describe what you’re building — or don’t.' },
  { n: '2', text: 'Generate, then refine by style, length and creativity.' },
  { n: '3', text: 'Check availability and save your favorites.' },
]

export function Landing({ onEnter }: Props) {
  const [names, setNames] = useState<string[]>([])
  const [batch, setBatch] = useState(0)
  // Ticker-local exclusions only — these names were glimpsed, not considered,
  // and a ticker would burn ~100 names/min of the app's real exclude window.
  const seenRef = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false

    async function tick() {
      try {
        const results = await generateNames({
          style: 'big_tech',
          count: TICK_COUNT,
          min_len: 4,
          max_len: 12,
          temperature: 0.85,
          variety: 0.5,
          roots: [],
          exclude: seenRef.current,
        })
        if (cancelled) return
        const fresh = results.map((r) => r.name)
        seenRef.current = [...seenRef.current, ...fresh].slice(-500)
        setNames(fresh)
        setBatch((b) => b + 1)
      } catch {
        // WASM not ready / failed — the landing simply shows no ticker.
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    tick() // also warms the WASM module, so entering the app is instant
    const id = setInterval(tick, reduced ? TICK_MS_REDUCED : TICK_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <div className="landing">
      <section className="landing-hero">
        <h1 className="landing-title">Name your next big thing.</h1>
        <p className="landing-sub">
          Brandable startup &amp; project names — generated instantly, entirely in your browser.
        </p>

        <div className="ticker" aria-hidden="true">
          {names.length > 0 && (
            <div className="ticker-row" key={batch}>
              {names.map((n) => (
                <span key={n} className="ticker-chip">✦ {n}</span>
              ))}
            </div>
          )}
        </div>

        <button className="landing-cta" onClick={onEnter}>
          Find your name →
        </button>
      </section>

      <section className="landing-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature-card">
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="landing-steps">
        {STEPS.map((s) => (
          <div key={s.n} className="step">
            <span className="step-n">{s.n}</span>
            <span>{s.text}</span>
          </div>
        ))}
      </section>

      <footer className="landing-footer">
        Runs entirely in your browser — Rust compiled to WebAssembly. No servers, no accounts, no tracking.
      </footer>
    </div>
  )
}
