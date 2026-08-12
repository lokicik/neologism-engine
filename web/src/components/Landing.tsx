import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { generateNames, explainName, type Explanation, type NameResult } from '../lib/engine'

interface Props {
  onEnter: (keyboard: boolean) => void
}

// ---------------------------------------------------------------------------
// Phase 39 landing: decode hero + name-wall, Linear restraint.
// Every demo on this page is REAL — the engine is local and instant, so the
// hero name, the wall texture, the mode samples and the description samples
// are all generated live in the visitor's browser. All exclusions stay
// landing-local; nothing here touches the app's recent-names window.
// ---------------------------------------------------------------------------

const DECODE_MS = 700 // letters lock left→right over this long
const CYCLE_MS = 3600 // a new name every…
const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz'

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Same blend as the engine's composite_score.
function composite(r: NameResult): number {
  return Math.round(0.4 * r.score_pronounce + 0.3 * r.score_memorability + 0.3 * r.score_novelty)
}

// Scramble-decode: returns the partially-locked display string for `target`.
function useDecode(target: string): { display: string; locked: boolean } {
  const [display, setDisplay] = useState(target)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (!target) return
    if (reducedMotion()) {
      setDisplay(target)
      setLocked(true)
      return
    }
    setLocked(false)
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min((now - start) / DECODE_MS, 1)
      const lockCount = Math.floor(t * target.length)
      let out = target.slice(0, lockCount)
      for (let i = lockCount; i < target.length; i++) {
        out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
      }
      setDisplay(out)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        setDisplay(target)
        setLocked(true)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  return { display, locked }
}

// Reveal-on-scroll: observes every [data-reveal] inside the landing root.
function useReveal(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = root.querySelectorAll('[data-reveal]')
    if (reducedMotion()) {
      els.forEach((el) => el.classList.add('revealed'))
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('revealed')
            obs.unobserve(e.target)
          }
        }
      },
      { threshold: 0.15 },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [rootRef])
}

type DemoMode = 'brandable' | 'realword' | 'respell' | 'compound'

const DEMO_MODES: { value: DemoMode; label: string }[] = [
  { value: 'brandable', label: 'Brandable' },
  { value: 'realword', label: 'Real words' },
  { value: 'respell', label: 'Respelled' },
  { value: 'compound', label: 'Compound' },
]

function demoConfig(mode: DemoMode, exclude: string[]) {
  return {
    style: 'big_tech' as const,
    count: 3,
    min_len: 4,
    max_len: 12,
    temperature: 0.85,
    variety: 0.4,
    roots: [],
    compound: mode === 'compound',
    variant: mode === 'realword' || mode === 'respell' ? mode : undefined,
    exclude,
  }
}

export function Landing({ onEnter }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stepsRef = useRef<HTMLElement>(null)
  useReveal(rootRef)

  // --- Hero: decoded name from a prefetched queue --------------------------
  const [hero, setHero] = useState<NameResult | null>(null)
  const queueRef = useRef<NameResult[]>([])
  const seenRef = useRef<string[]>([])
  const { display, locked } = useDecode(hero?.name ?? '')

  const refill = useCallback(async () => {
    try {
      const batch = await generateNames({
        style: 'big_tech',
        count: 12,
        min_len: 5,
        max_len: 10,
        temperature: 0.85,
        variety: 0.4,
        roots: [],
        exclude: seenRef.current,
      })
      seenRef.current = [...seenRef.current, ...batch.map((r) => r.name)].slice(-600)
      queueRef.current.push(...batch)
    } catch {
      // WASM unavailable — hero just keeps its last name.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let id: ReturnType<typeof setInterval> | undefined

    async function start() {
      await refill()
      if (cancelled) return
      const next = queueRef.current.shift()
      if (next) setHero(next)
      id = setInterval(() => {
        const n = queueRef.current.shift()
        if (n) setHero(n)
        if (queueRef.current.length < 4) void refill()
      }, CYCLE_MS)
    }
    void start()
    return () => {
      cancelled = true
      if (id) clearInterval(id)
    }
  }, [refill])

  // --- Name wall background -------------------------------------------------
  const [wall, setWall] = useState<string[][]>([])
  useEffect(() => {
    let cancelled = false
    generateNames({
      style: 'big_tech',
      count: 40,
      min_len: 4,
      max_len: 9,
      temperature: 0.9,
      variety: 0.7,
      roots: [],
      exclude: [],
    })
      .then((r) => {
        if (cancelled) return
        const names = r.map((x) => x.name)
        const rows: string[][] = [[], [], [], []]
        names.forEach((n, i) => rows[i % 4].push(n))
        setWall(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // --- Bento: live mode demo -------------------------------------------------
  const [demoMode, setDemoMode] = useState<DemoMode>('brandable')
  const [demoNames, setDemoNames] = useState<string[]>([])
  const demoSeenRef = useRef<string[]>([])
  useEffect(() => {
    let cancelled = false
    generateNames(demoConfig(demoMode, demoSeenRef.current))
      .then((r) => {
        if (cancelled) return
        const names = r.map((x) => x.name)
        demoSeenRef.current = [...demoSeenRef.current, ...names].slice(-200)
        setDemoNames(names)
      })
      .catch(() => setDemoNames([]))
    return () => {
      cancelled = true
    }
  }, [demoMode])

  // --- Bento: description demo + why-this-name ------------------------------
  const [descNames, setDescNames] = useState<string[]>([])
  const [why, setWhy] = useState<Explanation | null>(null)
  useEffect(() => {
    let cancelled = false
    generateNames({
      style: 'big_tech',
      count: 3,
      min_len: 4,
      max_len: 12,
      temperature: 0.85,
      variety: 0.3,
      roots: [],
      description: 'an app for splitting expenses with friends',
      exclude: [],
    })
      .then((r) => {
        if (!cancelled) setDescNames(r.map((x) => x.name))
      })
      .catch(() => {})
    explainName('Forgeify')
      .then((e) => {
        if (!cancelled) setWhy(e)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const scrollToSteps = (event: MouseEvent<HTMLButtonElement>) => {
    const steps = stepsRef.current
    steps?.scrollIntoView({
      behavior: reducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    })
    if (event.detail === 0) steps?.focus({ preventScroll: true })
  }

  return (
    <div className="landing" ref={rootRef}>
      <nav className="landing-nav">
        <span className="wordmark">◈ neologism</span>
        <button className="nav-cta" onClick={(event) => onEnter(event.detail === 0)}>Open app →</button>
      </nav>

      <section className="landing-hero">
        {wall.length > 0 && (
          <div className="name-wall" aria-hidden="true">
            {wall.map((row, i) => (
              <div key={i} className={`wall-row wall-row-${i}`}>
                <div className="wall-track">
                  {[...row, ...row].map((n, j) => (
                    <span key={`${n}-${j}`} className="wall-name">{n}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="hero-glow" aria-hidden="true" />

        <div className="hero-content">
          <span className="eyebrow">Free · open · runs entirely in your browser</span>
          <h1 className="landing-title" tabIndex={-1}>Name your next big thing.</h1>
          <p className="hero-sub">
            Coined names for packages, CLIs, libraries, and brands — generated locally, with
            on-request domain evidence and manual namespace and trademark links.
          </p>

          <div className="decode-stage">
            <div className="decode-name" aria-live="off">
              {display || ' '}
            </div>
            <div className={`decode-meta${locked && hero ? ' visible' : ''}`}>
              {hero && (
                <>
                  <span className="meta-score">★ {composite(hero)}</span>
                  <span className="meta-dot">·</span>
                  <span>{hero.syllables} syllable{hero.syllables === 1 ? '' : 's'}</span>
                  {hero.connotations.length > 0 && (
                    <>
                      <span className="meta-dot">·</span>
                      <span>feels {hero.connotations.slice(0, 2).join(', ')}</span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="decode-caption">generated just now — in your browser</div>
          </div>

          <div className="hero-ctas">
            <button className="landing-cta" onClick={(event) => onEnter(event.detail === 0)}>Find your name →</button>
            <button className="ghost-cta" onClick={scrollToSteps}>How it works ↓</button>
          </div>
        </div>
      </section>

      <section className="bento" data-reveal>
        <div className="tile tile-modes">
          <h3>Four ways to a name</h3>
          <div className="tile-pills" role="group" aria-label="Live naming mode example">
            {DEMO_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`tile-pill${demoMode === m.value ? ' active' : ''}`}
                aria-pressed={demoMode === m.value}
                onClick={() => setDemoMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="tile-names" key={demoMode + demoNames.join()}>
            {demoNames.map((n) => (
              <span key={n} className="tile-name">{n}</span>
            ))}
          </div>
          <p className="tile-foot">live — generated as you clicked</p>
        </div>

        <div className="tile">
          <h3>Availability evidence, on request</h3>
          <div className="check-rows">
            <span className="check-group-label">Domain action</span>
            <span className="check-row"><i>✓</i> RDAP · .com · .ai · .app · .dev</span>
            <span className="check-row"><i>~</i> DNS · .io · .co</span>
            <span className="check-group-label">Manual links · not evaluated</span>
            <span className="check-row"><i>↗</i> GitHub · npm · PyPI · crates.io</span>
            <span className="check-row"><i>™</i> USPTO · EUIPO</span>
          </div>
          <p className="tile-foot">
            Opening Name checks sends nothing. A domain action sends the displayed label plus
            normal IP/request metadata; manual providers receive the name only when opened.
          </p>
        </div>

        <div className="tile">
          <h3>Names that explain themselves</h3>
          {why ? (
            <p className="tile-why">
              <strong>Forgeify</strong> — opens with “{why.prefix_word}” (real word)
              {why.suffix ? <> · “-{why.suffix}” brandable suffix</> : null} · {why.syllables} syllables
            </p>
          ) : (
            <p className="tile-why"><strong>Forgeify</strong> — …</p>
          )}
          <p className="tile-foot">structure, sound and scores on every card</p>
        </div>

        <div className="tile tile-stat">
          <div className="stat-big">100,000</div>
          <p>names generated in one session. <strong>Zero repeats.</strong></p>
          <p className="tile-foot">measured, not promised</p>
        </div>

        <div className="tile">
          <h3>No server. No account. No tracking.</h3>
          <p className="tile-body">
            A Rust engine compiled to WebAssembly, running on your machine. Works offline.
          </p>
          <p className="tile-foot">your ideas never leave the tab</p>
        </div>

        <div className="tile tile-desc">
          <h3>Describe it, name it</h3>
          <p className="tile-quote">“an app for splitting expenses with friends”</p>
          <div className="tile-names">
            {descNames.map((n) => (
              <span key={n} className="tile-name">{n}</span>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={stepsRef}
        className="landing-steps"
        role="region"
        aria-label="How it works"
        tabIndex={-1}
        data-reveal
      >
        <div className="step">
          <span className="step-num">01</span>
          <span>Describe what you’re building — or don’t.</span>
        </div>
        <div className="step">
          <span className="step-num">02</span>
          <span>Generate. Refine by style, length, creativity.</span>
        </div>
        <div className="step">
          <span className="step-num">03</span>
          <span>Review domain evidence. Open manual namespace or trademark links. Save the keepers.</span>
        </div>
      </section>

      <section className="closing" data-reveal>
        <h2 className="closing-title">Your name is already in here.</h2>
        <button className="landing-cta" onClick={(event) => onEnter(event.detail === 0)}>Find your name →</button>
      </section>

      <footer className="landing-footer">
        <span className="wordmark">◈ neologism</span>
        <span>Rust compiled to WebAssembly — no servers, no accounts, no tracking.</span>
      </footer>
    </div>
  )
}
