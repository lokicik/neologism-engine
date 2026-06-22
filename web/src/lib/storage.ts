import type { NameResult } from './engine'
import { defaultJudgeConfig, type JudgeConfig } from './judge'

const KEY = 'neologism:favorites'

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
  const exists = favorites.some((f) => f.name === item.name)
  const next = exists ? favorites.filter((f) => f.name !== item.name) : [...favorites, item]
  saveFavorites(next)
  return next
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
