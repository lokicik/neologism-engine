import type { NameResult } from './engine'
import { defaultJudgeConfig, type JudgeConfig } from './judge'

const KEY = 'neologism:favorites'
const REJECTED_KEY = 'neologism:rejected'
const TASTE_REFERENCES_KEY = 'neologism:taste-references'
const MAX_REJECTED = 200
const MAX_TASTE_REFERENCE_INPUT = 240

function sameName(a: NameResult, b: NameResult): boolean {
  return a.name.toLowerCase() === b.name.toLowerCase()
}

export function loadFavorites(): NameResult[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as NameResult[]) : []
  } catch {
    return []
  }
}

export function saveFavorites(favorites: NameResult[]): void {
  localStorage.setItem(KEY, JSON.stringify(favorites))
}

export function toggleFavorite(favorites: NameResult[], item: NameResult): NameResult[] {
  const exists = favorites.some((favorite) => sameName(favorite, item))
  const next = exists ? favorites.filter((favorite) => !sameName(favorite, item)) : [...favorites, item]
  saveFavorites(next)
  return next
}

export function removeFavorite(favorites: NameResult[], item: NameResult): NameResult[] {
  const next = favorites.filter((favorite) => !sameName(favorite, item))
  if (next.length !== favorites.length) saveFavorites(next)
  return next
}

// Explicit negative taste signals. Keeping the latest 200 is enough to learn
// recurring shapes without letting a years-old pass history dominate forever.
export function loadRejected(): NameResult[] {
  try {
    const raw = localStorage.getItem(REJECTED_KEY)
    return raw ? (JSON.parse(raw) as NameResult[]) : []
  } catch {
    return []
  }
}

export function saveRejected(rejected: NameResult[]): void {
  localStorage.setItem(REJECTED_KEY, JSON.stringify(rejected.slice(-MAX_REJECTED)))
}

export function toggleRejected(rejected: NameResult[], item: NameResult): NameResult[] {
  const exists = rejected.some((candidate) => sameName(candidate, item))
  const next = exists
    ? rejected.filter((candidate) => !sameName(candidate, item))
    : [...rejected, item].slice(-MAX_REJECTED)
  saveRejected(next)
  return next
}

export function removeRejected(rejected: NameResult[], item: NameResult): NameResult[] {
  const next = rejected.filter((candidate) => !sameName(candidate, item))
  if (next.length !== rejected.length) saveRejected(next)
  return next
}

// Optional examples such as "Vercel, Linear, Notion" seed the local shape
// ranker. They are deliberately stored separately from explicit likes/passes.
export function loadTasteReferences(): string {
  try {
    return localStorage.getItem(TASTE_REFERENCES_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveTasteReferences(value: string): void {
  try {
    localStorage.setItem(TASTE_REFERENCES_KEY, value.slice(0, MAX_TASTE_REFERENCE_INPUT))
  } catch {
    // ignore quota / privacy-mode storage errors
  }
}

// Recently-shown names, persisted so repeats don't return across reloads.
const RECENT_KEY = 'neologism:recent'

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveRecent(names: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(names))
  } catch {
    // ignore quota / serialization errors
  }
}

// Whether the visitor has entered the app before — first visit shows the
// landing page, later visits go straight to the generator (Phase 38).
const VISITED_KEY = 'neologism:visited'

export function hasVisited(): boolean {
  try {
    return localStorage.getItem(VISITED_KEY) === '1'
  } catch {
    return false
  }
}

export function markVisited(): void {
  try {
    localStorage.setItem(VISITED_KEY, '1')
  } catch {
    // ignore — landing will just show again next time
  }
}

// Optional "Sharpen with AI" judge config (Phase 50). Persisted so the owner
// configures it once. The API key lives in localStorage too — a deliberate
// trade-off for a personal tool (the SettingsModal warns the user); it is only
// ever sent directly from the browser to the provider the user chose.
const JUDGE_KEY = 'neologism:judge'

export function loadJudgeConfig(): JudgeConfig {
  try {
    const raw = localStorage.getItem(JUDGE_KEY)
    if (!raw) return defaultJudgeConfig()
    return { ...defaultJudgeConfig(), ...(JSON.parse(raw) as Partial<JudgeConfig>) }
  } catch {
    return defaultJudgeConfig()
  }
}

export function saveJudgeConfig(cfg: JudgeConfig): void {
  try {
    localStorage.setItem(JUDGE_KEY, JSON.stringify(cfg))
  } catch {
    // ignore quota / serialization errors
  }
}
